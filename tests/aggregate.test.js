import { test, expect, describe } from "bun:test";
import { aggregateOperators } from "../src/r6/aggregate.js";
import { fixture } from "./helpers.js";

const agg = aggregateOperators(fixture("operators_ranked.json"));

describe("aggregateOperators (Stompn.G2 ranked, all-time)", () => {
  test("hasData and operator count", () => {
    expect(agg.hasData).toBe(true);
    expect(agg.total.operators).toBe(76);
  });

  test("summed round-level totals", () => {
    const t = agg.total;
    expect(t.kills).toBe(6389);
    expect(t.deaths).toBe(3364);
    expect(t.headshots).toBe(3879);
    expect(t.assists).toBe(1411);
    expect(t.roundsPlayed).toBe(5604);
    expect(t.aces).toBe(24);
    expect(t.firstBloods).toBe(798);
    expect(t.firstDeaths).toBe(351);
    expect(t.clutches).toBe(138);
    expect(t.clutchesLost).toBe(268);
    expect(t.teamKills).toBe(23);
    expect(t.timePlayedMs).toBe(6451938130);
    expect(t.multikills).toEqual({ k1: 1792, k2: 1137, k3: 523, k4: 158, k5: 24 });
  });

  test("derived metrics", () => {
    const t = agg.total;
    expect(t.kd).toBeCloseTo(1.8992, 3);
    expect(t.hsPercent).toBeCloseTo(60.71, 1);
    expect(t.killsPerRound).toBeCloseTo(1.14, 2);
    expect(t.entryKd).toBeCloseTo(2.273, 2);
    expect(t.entryDiff).toBe(447);
    expect(t.clutchWinPercent).toBeCloseTo(33.99, 1);
  });

  test("attacker/defender splits reconcile to total", () => {
    expect(agg.attacker.operators + agg.defender.operators).toBe(76);
    expect(agg.attacker.kills + agg.defender.kills).toBe(agg.total.kills);
  });

  test("topOperators sorted by rounds desc, Ash first", () => {
    expect(agg.topOperators[0].operator).toBe("Ash");
    expect(agg.topOperators[0].roundsPlayed).toBe(490);
    for (let i = 1; i < agg.topOperators.length; i++) {
      expect(agg.topOperators[i - 1].roundsPlayed).toBeGreaterThanOrEqual(
        agg.topOperators[i].roundsPlayed
      );
    }
  });
});

describe("aggregateOperators edge cases", () => {
  test("empty / missing payloads", () => {
    for (const p of [{}, { operators: [] }, null, undefined]) {
      const a = aggregateOperators(p);
      expect(a.hasData).toBe(false);
      expect(a.total.kills).toBe(0);
      expect(a.total.kd).toBe(0);
    }
  });

  test("no divide-by-zero when deaths/firstDeaths/clutches are 0", () => {
    const a = aggregateOperators({
      operators: [
        { side: "Attacker", kills: 3, deaths: 0, roundsPlayed: 2, firstBloods: 1, firstDeaths: 0 },
      ],
    });
    expect(a.total.kd).toBe(3); // deaths 0 -> returns kills
    expect(a.total.entryKd).toBe(1); // firstDeaths 0 -> returns firstBloods
    expect(a.total.clutchWinPercent).toBe(0);
  });
});
