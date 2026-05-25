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
  };
}

mock.module("r6-data.js", () => ({ default: { R6Client: FakeClient }, R6Client: FakeClient }));

const { accountInfo, playerStats, settle } = await import("../src/r6/client.js");

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
