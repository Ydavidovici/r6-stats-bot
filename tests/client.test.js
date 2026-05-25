import { test, expect, describe, beforeAll, afterAll, mock } from "bun:test";
import { initDb } from "../src/db/index.js";

// Track how often the underlying (mocked) r6-data.js client is hit, so we can
// prove the cache short-circuits repeat calls without any network.
let accountCalls = 0;
let statsCalls = 0;
let lastStatsParams = null;

class FakeClient {
  constructor(config) {
    this.config = config;
  }
  players = {
    getAccountInfo: async ({ nameOnPlatform, platformType }) => {
      accountCalls++;
      return { level: 100, profiles: [{ nameOnPlatform, platformType }] };
    },
    getPlayerStats: async (params) => {
      statsCalls++;
      lastStatsParams = params;
      return { board: params.board_id, name: params.nameOnPlatform };
    },
    getIsBanned: async () => ({ isBanned: false }),
    getSeasonalStats: async () => ({ history: { data: [] } }),
    getOperatorStats: async () => ({ operators: [] }),
  };
}

mock.module("r6-data.js", () => ({ default: { R6Client: FakeClient }, R6Client: FakeClient }));

process.env.CACHE_TTL_MIN = "15";

const {
  accountInfo,
  playerStats,
  seasonalStats,
  operatorStats,
  isBanned,
  settle,
  TTL_RANKED_STATS,
  TTL_SEASONAL_STATS,
  TTL_BAN_STATUS,
  TTL_ACCOUNT_INFO,
  TTL_OPERATOR_STATS,
} = await import("../src/r6/client.js");
import { getDb } from "../src/db/index.js";

beforeAll(() => {
  process.env.R6DATA_API_KEY = "test-key";
  initDb(":memory:");
});

afterAll(() => mock.restore());

describe("read-through cache", () => {
  test("first call misses, second hits, no extra network", async () => {
    const a = await accountInfo("Stompn.G2", "uplay");
    expect(a.cached).toBe(false);
    expect(a.data.level).toBe(100);
    expect(accountCalls).toBe(1);

    const b = await accountInfo("Stompn.G2", "uplay");
    expect(b.cached).toBe(true);
    expect(accountCalls).toBe(1);
  });

  test("cache key is case-insensitive", async () => {
    const c = await accountInfo("stompn.g2", "uplay");
    expect(c.cached).toBe(true);
    expect(accountCalls).toBe(1);
  });

  test("force bypasses the cache", async () => {
    const d = await accountInfo("Stompn.G2", "uplay", { force: true });
    expect(d.cached).toBe(false);
    expect(accountCalls).toBe(2);
  });
});

describe("playerStats requests the ranked board", () => {
  test("sends board_id ranked and caches", async () => {
    const a = await playerStats("Pengu", "uplay", "pc");
    expect(a.cached).toBe(false);
    expect(lastStatsParams.board_id).toBe("ranked");
    expect(a.data.board).toBe("ranked");
    expect(statsCalls).toBe(1);

    const b = await playerStats("Pengu", "uplay", "pc");
    expect(b.cached).toBe(true);
    expect(statsCalls).toBe(1);
  });
});

describe("settle", () => {
  test("resolves value, swallows rejection to null", async () => {
    expect(await settle(Promise.resolve(7))).toBe(7);
    expect(await settle(Promise.reject(new Error("boom")))).toBeNull();
  });
});

describe("distinct cache TTLs per endpoint", () => {
  test("writes varying expires_at based on endpoint custom TTLs", async () => {
    // 1. accountInfo (7 days)
    await accountInfo("ttl-acc", "uplay");
    const accRow = getDb().query("SELECT * FROM player_cache WHERE cache_key = ?").get("account:uplay:ttl-acc");
    expect(accRow.expires_at - accRow.fetched_at).toBe(TTL_ACCOUNT_INFO);

    // 2. isBanned (24 hours)
    await isBanned("ttl-ban", "uplay");
    const banRow = getDb().query("SELECT * FROM player_cache WHERE cache_key = ?").get("ban:uplay:ttl-ban");
    expect(banRow.expires_at - banRow.fetched_at).toBe(TTL_BAN_STATUS);

    // 3. playerStats (15 mins)
    await playerStats("ttl-stats", "uplay", "pc");
    const statsRow = getDb().query("SELECT * FROM player_cache WHERE cache_key = ?").get("stats:uplay:pc:ranked:ttl-stats");
    expect(statsRow.expires_at - statsRow.fetched_at).toBe(TTL_RANKED_STATS);

    // 4. seasonalStats (15 mins)
    await seasonalStats("ttl-seasonal", "uplay");
    const seasonalRow = getDb().query("SELECT * FROM player_cache WHERE cache_key = ?").get("seasonal:uplay:ttl-seasonal");
    expect(seasonalRow.expires_at - seasonalRow.fetched_at).toBe(TTL_SEASONAL_STATS);

    // 5. operatorStats (7 days)
    await operatorStats("ttl-ops", "uplay");
    const opsRow = getDb().query("SELECT * FROM player_cache WHERE cache_key = ?").get("operators:uplay:ranked:ttl-ops");
    expect(opsRow.expires_at - opsRow.fetched_at).toBe(TTL_OPERATOR_STATS);
  });
});
