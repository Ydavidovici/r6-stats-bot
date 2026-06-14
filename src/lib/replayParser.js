/**
 * Parses r6-dissect JSON output and computes advanced stats:
 * - KOST (Kill, Objective, Survive, Trade)
 * - Entry K/D
 * - EPS (Expected Player Score)
 */

export function parseReplayData(dissectJson) {
    if (!dissectJson || typeof dissectJson !== "object") {
        throw new Error("Invalid dissect JSON data");
    }

    const roundsData = Array.isArray(dissectJson) ? dissectJson : (dissectJson.rounds || [dissectJson]);

    const matchId = dissectJson.matchId || crypto.randomUUID();
    const mapName = dissectJson.map || "Unknown";
    const date = dissectJson.timestamp || new Date().toISOString();
    let duration = 0;

    const parsedRounds = [];
    const playerStatsMap = new Map(); // key: PlayerName_RoundNum

    for (let i = 0; i < roundsData.length; i++) {
        const round = roundsData[i];
        const roundNumber = round.roundNumber || i + 1;
        const events = round.matchFeedback || [];
        
        // Track the first kill to mark entry
        let firstKillFound = false;

        // Group events by timestamp for trade detection
        // A trade is a kill within 5-10 seconds of a teammate's death
        
        events.forEach(event => {
            if (event.type === "Kill") {
                const killer = event.killer?.name;
                const target = event.target?.name;
                
                if (killer && target) {
                    if (!firstKillFound) {
                        markEntryKill(playerStatsMap, killer, roundNumber);
                        markEntryDeath(playerStatsMap, target, roundNumber);
                        firstKillFound = true;
                    }
                    
                    incrementStat(playerStatsMap, killer, roundNumber, 'kills');
                    if (event.headshot) {
                        incrementStat(playerStatsMap, killer, roundNumber, 'headshots');
                    }
                    incrementStat(playerStatsMap, target, roundNumber, 'deaths');
                }
            } else if (event.type === "DefuserPlantComplete" || event.type === "DefuserDisableComplete") {
                const player = event.player?.name;
                if (player) {
                    setObjectivePlay(playerStatsMap, player, roundNumber);
                }
            }
        });

        // Compute Trades (simplified: find deaths, then check if killer dies within 7 seconds to a teammate of the target)
        // ... Trade logic would iterate over events by time
        const kills = events.filter(e => e.type === "Kill");
        for (let k1 = 0; k1 < kills.length; k1++) {
            const deathEvent = kills[k1];
            const victimTeam = deathEvent.target?.team;
            const killerName = deathEvent.killer?.name;
            const timeOfDeath = deathEvent.timeInSeconds || 0;

            for (let k2 = k1 + 1; k2 < kills.length; k2++) {
                const revengeEvent = kills[k2];
                if ((revengeEvent.timeInSeconds || 0) - timeOfDeath > 5) break; // more than 5s passed
                
                if (revengeEvent.target?.name === killerName && revengeEvent.killer?.team === victimTeam) {
                    // Traded! The person who died (target of k1) was traded
                    markTraded(playerStatsMap, deathEvent.target?.name, roundNumber);
                    break;
                }
            }
        }

        // Survived logic (if players list exists in round)
        const playersInRound = round.players || [];
        playersInRound.forEach(p => {
            const isDead = events.some(e => e.type === "Kill" && e.target?.name === p.name);
            if (!isDead) {
                markSurvived(playerStatsMap, p.name, roundNumber);
            }
        });

        parsedRounds.push({
            id: `${matchId}_${roundNumber}`,
            match_id: matchId,
            round_number: roundNumber,
            site: round.site || "Unknown",
            winner: round.winner || "Unknown"
        });
    }

    // Format output
    const playerStatsArray = Array.from(playerStatsMap.values()).map(ps => {
        // Calculate KOST boolean
        const hasKOST = ps.kills > 0 || ps.objective_play || ps.survived || ps.is_traded;

        return {
            id: `${matchId}_${ps.round_number}_${ps.player_name}`,
            match_id: matchId,
            round_number: ps.round_number,
            player_name: ps.player_name,
            discord_id: null,
            team_name: ps.team_name || "Unknown",
            operator: ps.operator || "Unknown",
            kills: ps.kills,
            deaths: ps.deaths,
            assists: ps.assists,
            headshots: ps.headshots,
            is_entry_kill: ps.is_entry_kill,
            is_entry_death: ps.is_entry_death,
            is_traded: ps.is_traded,
            objective_play: ps.objective_play,
            survived: ps.survived,
            has_kost: hasKOST
        };
    });

    // Aggregate into matchPlayerStats to calculate Normalized EPS
    const matchAggregates = new Map();
    for (const ps of playerStatsArray) {
        if (!matchAggregates.has(ps.player_name)) {
            matchAggregates.set(ps.player_name, {
                id: `${matchId}_${ps.player_name}`,
                match_id: matchId,
                player_name: ps.player_name,
                team_name: ps.team_name,
                total_rounds: 0,
                rounds_with_kost: 0,
                kills: 0, deaths: 0, assists: 0,
                entry_kills: 0, entry_deaths: 0,
                objective_plays: 0, clutches: 0,
                eps: 100.0
            });
        }
        const agg = matchAggregates.get(ps.player_name);
        agg.total_rounds++;
        if (ps.has_kost) agg.rounds_with_kost++;
        agg.kills += ps.kills;
        agg.deaths += ps.deaths;
        agg.assists += ps.assists;
        if (ps.is_entry_kill) agg.entry_kills++;
        if (ps.is_entry_death) agg.entry_deaths++;
        if (ps.objective_play) agg.objective_plays++;
    }

    const matchPlayerStats = calculateNormalizedEPS(Array.from(matchAggregates.values()));

    return {
        match: {
            id: matchId,
            map_name: mapName,
            date: date,
            duration: duration,
            winning_team: "Unknown"
        },
        rounds: parsedRounds,
        playerStats: playerStatsArray,
        matchPlayerStats: matchPlayerStats
    };
}

/**
 * Calculates a normalized EPS (100-baseline) for an array of player stats.
 */
export function calculateNormalizedEPS(players) {
    const WEIGHTS = {
        KILL: 1.0,
        DEATH: -0.85,
        ENTRY_KILL: 1.6,
        ENTRY_DEATH: -1.3,
        KOST_PERCENT: 2.5,
        PLANT_DISABLE: 1.5,
        CLUTCH: 2.0
    };

    const rawScores = players.map(ps => {
        const kostRate = ps.total_rounds > 0 ? (ps.rounds_with_kost / ps.total_rounds) : 0; 
        const standardKills = ps.kills - ps.entry_kills;
        const standardDeaths = ps.deaths - ps.entry_deaths;

        let raw = 0;
        raw += standardKills * WEIGHTS.KILL;
        raw += standardDeaths * WEIGHTS.DEATH;
        raw += ps.entry_kills * WEIGHTS.ENTRY_KILL;
        raw += ps.entry_deaths * WEIGHTS.ENTRY_DEATH;
        raw += ps.objective_plays * WEIGHTS.PLANT_DISABLE;
        raw += ps.clutches * WEIGHTS.CLUTCH;
        raw += kostRate * WEIGHTS.KOST_PERCENT;
        return raw;
    });

    const n = rawScores.length;
    if (n === 0) return players;

    const mean = rawScores.reduce((a, b) => a + b, 0) / n;
    const variance = rawScores.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance) || 1; 

    const SCALE_FACTOR = 25; 

    players.forEach((ps, index) => {
        const zScore = (rawScores[index] - mean) / stdDev;
        let eps = 100 + (zScore * SCALE_FACTOR);
        ps.eps = Math.round(Math.max(25, Math.min(175, eps)));
    });

    return players;
}

// Helpers
function getPlayerStat(map, player, roundNumber) {
    const key = `${player}_${roundNumber}`;
    if (!map.has(key)) {
        map.set(key, {
            player_name: player,
            round_number: roundNumber,
            kills: 0, deaths: 0, assists: 0, headshots: 0,
            is_entry_kill: false, is_entry_death: false,
            is_traded: false, objective_play: false, survived: false
        });
    }
    return map.get(key);
}

function incrementStat(map, player, round, stat) {
    const ps = getPlayerStat(map, player, round);
    ps[stat]++;
}

function markEntryKill(map, player, round) {
    const ps = getPlayerStat(map, player, round);
    ps.is_entry_kill = true;
}

function markEntryDeath(map, player, round) {
    const ps = getPlayerStat(map, player, round);
    ps.is_entry_death = true;
}

function setObjectivePlay(map, player, round) {
    const ps = getPlayerStat(map, player, round);
    ps.objective_play = true;
}

function markTraded(map, player, round) {
    if (!player) return;
    const ps = getPlayerStat(map, player, round);
    ps.is_traded = true;
}

function markSurvived(map, player, round) {
    const ps = getPlayerStat(map, player, round);
    ps.survived = true;
}
