import { test, expect, describe, beforeAll, afterAll, mock } from "bun:test";
import { initDb } from "../src/db/index.js";

// Track how often the underlying (mocked) r6-data.js client is hit, so we can
// prove every command fetches live (no caching) and that retries re-call the
// upstream when it answers with junk.
let accountCalls = 0;
let statsCalls = 0;
let lastStatsParams = null;

// Scriptable operator responses, to simulate the upstream's inconsistency
// (empty/malformed payloads or thrown errors). Each call shifts one item; an
// Error is thrown, anything else is returned. Empties to a valid empty list.
let opsQueue = [];
let opsCalls = 0;

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
      return {
        platform_families_full_profiles: [],
        board: params.board_id,
        name: params.nameOnPlatform,
      };
    },
    getIsBanned: async () => ({ isBanned: false }),
    getSeasonalStats: async () => ({ data: { history: { data: [] } } }),
    getOperatorStats: async () => {
      opsCalls++;
      const next = opsQueue.length ? opsQueue.shift() : { operators: [] };
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

mock.module("r6-data.js", () => ({ default: { R6Client: FakeClient }, R6Client: FakeClient }));

// Unique query string so a whole-module mock of "../src/r6/client.js" in another
// test file (commands.test.js) can't shadow the real implementation here.
const { accountInfo, playerStats, operatorStats, settle, UPSTREAM_RETRIES } = await import(
  "../src/r6/client.js?suite=client"
);

beforeAll(() => {
  process.env.R6DATA_API_KEY = "test-key";
  initDb(":memory:");
});

afterAll(() => mock.restore());

describe("always fetches live (no caching)", () => {
  test("repeat calls always hit the upstream", async () => {
    const start = accountCalls;
    const a = await accountInfo("Stompn.G2", "uplay");
    expect(a.data.level).toBe(100);
    expect(typeof a.fetchedAt).toBe("number");

    await accountInfo("Stompn.G2", "uplay");
    await accountInfo("Stompn.G2", "uplay");
    expect(accountCalls - start).toBe(3);
  });
});

describe("playerStats requests the ranked board", () => {
  test("sends board_id ranked", async () => {
    const start = statsCalls;
    const a = await playerStats("Pengu", "uplay", "pc");
    expect(lastStatsParams.board_id).toBe("ranked");
    expect(a.data.board).toBe("ranked");
    expect(statsCalls - start).toBe(1);
  });
});

describe("settle", () => {
  test("resolves value, swallows rejection to null", async () => {
    expect(await settle(Promise.resolve(7))).toBe(7);
    expect(await settle(Promise.reject(new Error("boom")))).toBeNull();
  });
});

describe("upstream inconsistency hardening", () => {
  const good = {
    operators: [{ operator: "Ash", side: "Attacker", roundsPlayed: 10, kills: 20, deaths: 10 }],
  };

  function script(queue) {
    opsQueue = queue;
    opsCalls = 0;
  }

  test("retries past a malformed response, then returns the good one", async () => {
    script([{ error: "rate limited" }, good]); // first call junk, second good
    const r = await operatorStats("retry-good", "uplay");
    expect(r.data.operators).toHaveLength(1);
    expect(opsCalls).toBe(2); // proves it retried past the junk
  });

  test("when every attempt is junk it rejects (settle then yields null)", async () => {
    script([{ bad: 1 }, { bad: 2 }, { bad: 3 }]); // all 3 attempts invalid
    expect(await settle(operatorStats("all-junk", "uplay"))).toBeNull();
    expect(opsCalls).toBe(UPSTREAM_RETRIES + 1);
  });

  test("an empty-but-valid payload is accepted on the first try", async () => {
    script([{ operators: [] }]);
    const r = await operatorStats("empty-valid", "uplay");
    expect(r.data.operators).toEqual([]);
    expect(opsCalls).toBe(1); // valid immediately, no wasted retries
  });

  test("a thrown upstream error is retried before giving up", async () => {
    script([new Error("boom"), good]);
    const r = await operatorStats("throw-retry", "uplay");
    expect(r.data.operators).toHaveLength(1);
    expect(opsCalls).toBe(2);
  });
});
