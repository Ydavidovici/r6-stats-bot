import { test, expect, describe } from "bun:test";
import {
  buildStatsEmbed,
  buildRankedEmbed,
  buildOperatorsEmbed,
  buildSeasonalEmbed,
  buildBanEmbed,
} from "../src/embeds.js";
import { wrap, fieldByName } from "./helpers.js";

const target = { nameOnPlatform: "Stompn.G2", platformType: "uplay", platformFamilies: "pc" };
const sources = {
  stats: wrap("stats_ranked.json"),
  ops: wrap("operators_ranked.json"),
  seasonal: wrap("seasonalStats.json"),
  account: wrap("accountInfo.json"),
  ban: wrap("isBanned.json"),
};

describe("buildStatsEmbed", () => {
  const e = buildStatsEmbed(target, sources).toJSON();

  test("author, color, thumbnail", () => {
    expect(e.author.name).toBe("Stompn.G2 — PC");
    expect(e.color).toBe(0xd0073c);
    expect(e.thumbnail?.url).toContain("champion");
  });
  test("rank field: tier + RP (from seasonal) + peak", () => {
    const f = fieldByName(e, "Rank (current season)");
    expect(f.value).toContain("Champion");
    expect(f.value).toContain("4,792 RP");
    expect(f.value).toContain("4,857");
  });
  test("ranked record from the ranked board", () => {
    const f = fieldByName(e, "Ranked record (S41)");
    expect(f.value).toContain("167W / 45L");
    expect(f.value).toContain("79% win");
  });
  test("combat / entry / clutch from operators", () => {
    expect(fieldByName(e, "K/D").value).toContain("1.90");
    expect(fieldByName(e, "K/D").value).toContain("6,389 / 3,364 (+3,025)");
    expect(fieldByName(e, "Side Splits").value).toContain("1.83");
    expect(fieldByName(e, "Side Splits").value).toContain("1.97");
    expect(fieldByName(e, "Entry (First Kill / Death)").value).toContain("2.27");
    expect(fieldByName(e, "Entry (First Kill / Death)").value).toContain("798 / 351 (+447)");
    expect(fieldByName(e, "Clutches").value).toContain("34%");
  });
});

describe("buildStatsEmbed not-found", () => {
  test("empty data -> not found", () => {
    const e = buildStatsEmbed(target, {
      stats: { data: {} },
      ops: { data: {} },
      seasonal: { data: {} },
      account: { data: {} },
    }).toJSON();
    expect(e.title).toBe("No R6 data found");
  });
});

describe("buildBanEmbed", () => {
  test("not banned -> green", () => {
    const e = buildBanEmbed(target, { ban: sources.ban, account: sources.account }).toJSON();
    expect(e.description).toContain("Not banned");
    expect(e.color).toBe(0x57f287);
  });
});

describe("buildOperatorsEmbed", () => {
  test("table with header and Ash", () => {
    const e = buildOperatorsEmbed(target, { ops: sources.ops, account: sources.account }).toJSON();
    const entryField = e.fields.find((f) => f.name.includes("Attacker — Entry"));
    expect(entryField).toBeDefined();
    expect(entryField.value).toContain("Operator");
    expect(entryField.value).toContain("Ash");
  });
});

describe("buildSeasonalEmbed", () => {
  test("current / peak / net", () => {
    const e = buildSeasonalEmbed(target, {
      seasonal: sources.seasonal,
      account: sources.account,
    }).toJSON();
    expect(fieldByName(e, "Current").value).toBe("4,792 RP");
    expect(fieldByName(e, "Peak").value).toBe("4,852 RP");
    expect(fieldByName(e, "Net change").value).toBe("+131 RP");
  });
});

describe("buildRankedEmbed", () => {
  test("tier and peak RP", () => {
    const e = buildRankedEmbed(target, {
      stats: sources.stats,
      seasonal: sources.seasonal,
      ops: sources.ops,
      account: sources.account,
    }).toJSON();
    expect(fieldByName(e, "Tier").value).toContain("Champion");
    expect(fieldByName(e, "Peak RP").value).toBe("4,857");
    expect(fieldByName(e, "K/D (season)").value).toContain("2.05");
    expect(fieldByName(e, "K/D (season)").value).toContain("1,427 / 697 (+730)");
    expect(fieldByName(e, "K/D (all-time)").value).toContain("1.90");
    expect(fieldByName(e, "K/D (all-time)").value).toContain("6,389 / 3,364 (+3,025)");
    expect(fieldByName(e, "Side Splits").value).toContain("1.83");
    expect(fieldByName(e, "Side Splits").value).toContain("1.97");
    expect(fieldByName(e, "Entry K/D").value).toContain("2.27");
    expect(fieldByName(e, "Entry K/D").value).toContain("798 / 351 (+447)");
  });

  test("seasonal fallback when ops is not provided", () => {
    const e = buildRankedEmbed(target, {
      stats: sources.stats,
      seasonal: sources.seasonal,
    }).toJSON();
    expect(fieldByName(e, "K/D (season)").value).toContain("2.05");
    expect(fieldByName(e, "K/D (season)").value).toContain("1,427 / 697 (+730)");
    expect(fieldByName(e, "K/D (all-time)")).toBeUndefined();
  });
});

describe("buildStatsEmbed seasonal fallback", () => {
  test("displays seasonal K/D and omits all-time operator stats", () => {
    const e = buildStatsEmbed(target, {
      stats: sources.stats,
      seasonal: sources.seasonal,
      account: sources.account,
    }).toJSON();
    expect(fieldByName(e, "K/D (current season)").value).toContain("2.05");
    expect(fieldByName(e, "K/D (current season)").value).toContain("1,427 / 697 (+730)");
    expect(fieldByName(e, "K/D")).toBeUndefined();
    expect(fieldByName(e, "Entry (First Kill / Death)")).toBeUndefined();
  });
});
