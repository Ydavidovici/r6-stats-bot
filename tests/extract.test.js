import { test, expect, describe } from "bun:test";
import { getBoard, rankedRecord, currentTier, rpSeries, sparkline, getTierFromRankIndex } from "../src/r6/extract.js";
import { fixture } from "./helpers.js";

const stats = fixture("stats_ranked.json");
const seasonal = fixture("seasonalStats.json");

describe("getBoard", () => {
  test("returns the ranked board", () => {
    expect(getBoard(stats, "ranked").profile.rank_points).toBe(4586);
  });
  test("missing board -> null", () => {
    expect(getBoard(stats, "casual")).toBeNull();
    expect(getBoard(stats, "event")).toBeNull();
  });
  test("empty / null payload -> null", () => {
    expect(getBoard({}, "ranked")).toBeNull();
    expect(getBoard(null, "ranked")).toBeNull();
  });
});

describe("rankedRecord", () => {
  test("parses the ranked board", () => {
    const rec = rankedRecord(getBoard(stats, "ranked"));
    expect(rec.seasonId).toBe(41);
    expect(rec.wins).toBe(167);
    expect(rec.losses).toBe(45);
    expect(rec.abandons).toBe(1);
    expect(rec.rankPoints).toBe(4586);
    expect(rec.maxRankPoints).toBe(4857);
    expect(rec.winPct).toBeCloseTo(78.77, 1);
    expect(rec.kills).toBe(1427);
    expect(rec.deaths).toBe(697);
    expect(rec.kd).toBeCloseTo(2.047, 3);
  });
  test("null board -> null", () => {
    expect(rankedRecord(null)).toBeNull();
  });
  test("zero games -> winPct 0", () => {
    expect(rankedRecord({ season_id: 1, profile: { wins: 0, losses: 0 } }).winPct).toBe(0);
  });
});

describe("currentTier", () => {
  test("latest history point", () => {
    expect(currentTier(seasonal)).toEqual({
      rankPoints: 4792,
      name: "Champion",
      color: "#d0073c",
      icon: "https://r6data.eu/assets/img/r6_ranks_img/champion.webp",
    });
  });
  test("empty -> null", () => {
    expect(currentTier({})).toBeNull();
    expect(currentTier({ data: { history: { data: [] } } })).toBeNull();
  });
});

describe("rpSeries", () => {
  const s = rpSeries(seasonal);
  test("length and ordering", () => {
    expect(s.length).toBe(63);
    expect(s[0].value).toBe(4661);
    expect(s.at(-1).value).toBe(4792);
    for (let i = 1; i < s.length; i++) expect(s[i].t).toBeGreaterThanOrEqual(s[i - 1].t);
  });
});

describe("sparkline", () => {
  test("empty input", () => {
    expect(sparkline([])).toBe("");
  });
  test("flat input -> lowest glyph", () => {
    expect(sparkline([5, 5, 5])).toBe("▁▁▁");
  });
  test("ascending input spans glyph range", () => {
    const out = sparkline([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(out.length).toBe(8);
    expect(out[0]).toBe("▁");
    expect(out.at(-1)).toBe("█");
  });
});

describe("getTierFromRankIndex", () => {
  test("returns correct rank metadata for different indices", () => {
    expect(getTierFromRankIndex(0)).toEqual({
      name: "Unranked",
      color: "#a4a4a4",
      icon: "https://r6data.com/assets/img/r6_ranks_img/unranked.webp",
    });
    expect(getTierFromRankIndex(20)).toEqual({
      name: "Gold 1",
      color: "#e5c613",
      icon: "https://r6data.com/assets/img/r6_ranks_img/gold-1.webp",
    });
    expect(getTierFromRankIndex(21)).toEqual({
      name: "Platinum 5",
      color: "#359da8",
      icon: "https://r6data.com/assets/img/r6_ranks_img/platinum-5.webp",
    });
    expect(getTierFromRankIndex(36)).toEqual({
      name: "Champion",
      color: "#d0073c",
      icon: "https://r6data.com/assets/img/r6_ranks_img/champion.webp",
    });
  });
});
