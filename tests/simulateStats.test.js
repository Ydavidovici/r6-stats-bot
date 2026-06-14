import {expect, test, describe} from "bun:test";
import {parseReplayData} from "../src/lib/replayParser.js";

function buildMockMatch(rounds) {
    return {
        matchId: "sim-match",
        map: "Oregon",
        timestamp: new Date().toISOString(),
        rounds: rounds,
    };
}

describe("KOST & EPS Simulations", () => {
    test("Simulation 1: Perfect Entry Fragger (Kills, Survives, Entry Kill)", () => {
        const sim = buildMockMatch([{
            roundNumber: 1,
            players: [{name: "EntryPlayer", team: 1}, {name: "Defender", team: 2}],
            matchFeedback: [
                {type: "Kill", timeInSeconds: 15, killer: {name: "EntryPlayer", team: 1}, target: {name: "Defender", team: 2}, headshot: true},
            ],
        }]);

        const result = parseReplayData(sim);
        const p = result.playerStats.find(p => p.player_name === "EntryPlayer");
        const matchP = result.matchPlayerStats.find(p => p.player_name === "EntryPlayer");
        
        // KOST Check: K (true), O (false), S (true), T (false) -> KOST = true
        expect(p.has_kost).toBe(true);
        expect(p.is_entry_kill).toBe(true);
        expect(p.survived).toBe(true);
        
        // EPS Check: Z-Score will be positive since they outperformed the defender
        expect(matchP.eps).toBeGreaterThan(100);
    });

    test("Simulation 2: Traded Entry Death (Gets traded by teammate)", () => {
        const sim = buildMockMatch([{
            roundNumber: 1,
            players: [{name: "EntryPlayer", team: 1}, {name: "Teammate", team: 1}, {name: "Defender", team: 2}],
            matchFeedback: [
                {type: "Kill", timeInSeconds: 10, killer: {name: "Defender", team: 2}, target: {name: "EntryPlayer", team: 1}},
                {type: "Kill", timeInSeconds: 15, killer: {name: "Teammate", team: 1}, target: {name: "Defender", team: 2}},
            ],
        }]);

        const result = parseReplayData(sim);
        const p = result.playerStats.find(p => p.player_name === "EntryPlayer");
        const matchP = result.matchPlayerStats.find(p => p.player_name === "EntryPlayer");
        
        // KOST Check: K(false), O(false), S(false), T(true) -> KOST = true
        expect(p.is_traded).toBe(true);
        expect(p.has_kost).toBe(true);
        expect(p.is_entry_death).toBe(true);

        // EPS Check: They got entry-deathed, so they should be below 100
        expect(matchP.eps).toBeLessThan(100);
        
        const teammate = result.playerStats.find(p => p.player_name === "Teammate");
        const matchTeammate = result.matchPlayerStats.find(p => p.player_name === "Teammate");
        expect(teammate.has_kost).toBe(true); // Got a kill
        expect(matchTeammate.eps).toBeGreaterThan(100);
    });

    test("Simulation 3: Useless Death (No kills, objective, survive, or trade)", () => {
        const sim = buildMockMatch([{
            roundNumber: 1,
            players: [{name: "Baiter", team: 1}, {name: "Defender", team: 2}],
            matchFeedback: [
                {type: "Kill", timeInSeconds: 60, killer: {name: "Defender", team: 2}, target: {name: "Baiter", team: 1}},
            ],
        }]);

        const result = parseReplayData(sim);
        const p = result.playerStats.find(p => p.player_name === "Baiter");
        const matchP = result.matchPlayerStats.find(p => p.player_name === "Baiter");
        
        // KOST Check: All false -> KOST = false
        expect(p.has_kost).toBe(false);

        // EPS Check: Useless death -> very low EPS
        expect(p.is_entry_death).toBe(true); // It was the first kill of the round
        expect(matchP.eps).toBeLessThan(100);
    });

    test("Simulation 4: Pure Objective Player (No kills, plants, survives)", () => {
        const sim = buildMockMatch([{
            roundNumber: 1,
            players: [{name: "Support", team: 1}],
            matchFeedback: [
                {type: "DefuserPlantComplete", timeInSeconds: 120, player: {name: "Support"}},
            ],
        }]);

        const result = parseReplayData(sim);
        const p = result.playerStats.find(p => p.player_name === "Support");
        const matchP = result.matchPlayerStats.find(p => p.player_name === "Support");
        
        // KOST Check: K(false), O(true), S(true), T(false) -> KOST = true
        expect(p.objective_play).toBe(true);
        expect(p.has_kost).toBe(true);

        // EPS Check: Positive impact, should be above 100 since there's only 1 player in this mock
        // Actually, if there's only 1 player, stdDev=1, Z=0, EPS=100.
        expect(matchP.eps).toBe(100);
    });
});
