// operatorStats has no totals block, so we aggregate across operators.
// Round/event-level fields (kills, deaths, headshots, rounds, firstBloods,
// clutches, ...) are valid to sum because a player uses exactly one operator
// per round. Match-level fields (matchesPlayed/wins) are NOT summed here — they
// double-count matches across operators; use the ranked board for match W/L.

function blank() {
  return {
    operators: 0,
    roundsPlayed: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    headshots: 0,
    aces: 0,
    firstBloods: 0,
    firstDeaths: 0,
    clutches: 0,
    clutchesLost: 0,
    teamKills: 0,
    timePlayedMs: 0,
    multikills: { k1: 0, k2: 0, k3: 0, k4: 0, k5: 0 },
  };
}

function add(acc, op) {
  acc.operators += 1;
  acc.roundsPlayed += op.roundsPlayed || 0;
  acc.kills += op.kills || 0;
  acc.deaths += op.deaths || 0;
  acc.assists += op.assists || 0;
  acc.headshots += op.headshots || 0;
  acc.aces += op.aces || 0;
  acc.firstBloods += op.firstBloods || 0;
  acc.firstDeaths += op.firstDeaths || 0;
  acc.clutches += op.clutches || 0;
  acc.clutchesLost += op.clutchesLost || 0;
  acc.teamKills += op.teamKills || 0;
  acc.timePlayedMs += op.timePlayedMs || 0;
  acc.multikills.k1 += op.kills1K || 0;
  acc.multikills.k2 += op.kills2K || 0;
  acc.multikills.k3 += op.kills3K || 0;
  acc.multikills.k4 += op.kills4K || 0;
  acc.multikills.k5 += op.kills5K || 0;
}

function derive(t) {
  const clutchTotal = t.clutches + t.clutchesLost;
  return {
    ...t,
    kd: t.deaths ? t.kills / t.deaths : t.kills,
    hsPercent: t.kills ? (t.headshots / t.kills) * 100 : 0,
    killsPerRound: t.roundsPlayed ? t.kills / t.roundsPlayed : 0,
    entryKd: t.firstDeaths ? t.firstBloods / t.firstDeaths : t.firstBloods,
    entryDiff: t.firstBloods - t.firstDeaths,
    clutchWinPercent: clutchTotal ? (t.clutches / clutchTotal) * 100 : 0,
  };
}

export function aggregateOperators(payload) {
  const ops = Array.isArray(payload?.operators) ? payload.operators : [];
  const total = blank();
  const attacker = blank();
  const defender = blank();

  for (const op of ops) {
    add(total, op);
    if (op.side === "Attacker") add(attacker, op);
    else if (op.side === "Defender") add(defender, op);
  }

  const topOperators = [...ops].sort(
    (a, b) => (b.roundsPlayed || 0) - (a.roundsPlayed || 0)
  );

  return {
    hasData: ops.length > 0,
    total: derive(total),
    attacker: derive(attacker),
    defender: derive(defender),
    topOperators,
  };
}
