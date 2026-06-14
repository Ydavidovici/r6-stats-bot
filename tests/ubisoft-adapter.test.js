import { test, expect, describe } from "bun:test";
import {
  num,
  pickRankedBoard,
  adaptStats,
  adaptAccount,
} from "../src/r6/providers/ubisoft-adapt.js";
import { getBoard, rankedRecord } from "../src/r6/extract.js";

// A trimmed getUserSeasonal entry, shaped like r6api.js-next's normalized output.
const rankedEntry = {
  profileId: "p1",
  season: { id: 41, shorthand: "Y10S2" },
  region: { slug: "emea", name: "Europe, Middle East and Africa" },
  board: { slug: "pvp_ranked", name: "Ranked" },
  rank: { id: 36, name: "Champion", mmr: 4792 },
  maxRank: { id: 36, name: "Champion", mmr: 4857 },
  kills: 1427,
  deaths: 697,
  wins: 167,
  losses: 45,
  abandons: 1,
  matches: 213,
};

describe("num", () => {
  test("returns first finite number, ignoring undefined/NaN", () => {
    expect(num(undefined, NaN, 5)).toBe(5);
    expect(num(undefined)).toBe(0);
    expect(num(0, 9)).toBe(0);
  });
});

describe("pickRankedBoard", () => {
  test("prefers the pvp_ranked board over other modes", () => {
    const casual = { board: { slug: "pvp_casual" }, wins: 999, losses: 0, matches: 999 };
    expect(pickRankedBoard([casual, rankedEntry])).toBe(rankedEntry);
  });

  test("among multiple ranked regions, picks the one with the most games", () => {
    const small = { ...rankedEntry, region: { slug: "ncsa" }, matches: 3 };
    expect(pickRankedBoard([small, rankedEntry]).matches).toBe(213);
  });

  test("empty / missing input -> null", () => {
    expect(pickRankedBoard([])).toBeNull();
    expect(pickRankedBoard(undefined)).toBeNull();
  });
});

describe("adaptStats -> r6data shape feeds the existing extractors", () => {
  test("getBoard + rankedRecord read the adapted payload correctly", () => {
    const payload = adaptStats(rankedEntry);
    const board = getBoard(payload, "ranked");
    const rec = rankedRecord(board);

    expect(rec.rank).toBe(36);
    expect(rec.rankPoints).toBe(4792);
    expect(rec.maxRankPoints).toBe(4857);
    expect(rec.wins).toBe(167);
    expect(rec.losses).toBe(45);
    expect(rec.abandons).toBe(1);
    expect(rec.seasonId).toBe(41);
    expect(rec.kills).toBe(1427);
    expect(rec.deaths).toBe(697);
  });

  test("an unranked player (no board) adapts to a zeroed ranked record", () => {
    const payload = adaptStats(null);
    const rec = rankedRecord(getBoard(payload, "ranked"));
    expect(rec.rank).toBe(0);
    expect(rec.rankPoints).toBe(0);
  });
});

describe("adaptAccount -> r6data shape", () => {
  test("maps level, avatar and username", () => {
    const profile = {
      username: "Stompn.G2",
      avatars: { 146: "a146", 256: "a256", 500: "a500" },
    };
    const acc = adaptAccount(profile, { level: 1480 }, "fallback", "uplay");
    expect(acc.level).toBe(1480);
    expect(acc.profilePicture).toBe("a256");
    expect(acc.profiles[0].nameOnPlatform).toBe("Stompn.G2");
    expect(acc.profiles[0].platformType).toBe("uplay");
  });

  test("falls back to the requested name when the profile has none", () => {
    const acc = adaptAccount({ avatars: {} }, {}, "TypedName", "psn");
    expect(acc.profiles[0].nameOnPlatform).toBe("TypedName");
    expect(acc.profilePicture).toBeNull();
    expect(acc.level).toBe(0);
  });
});
