import { test, expect, describe, beforeAll, afterAll, mock } from "bun:test";
import { initDb } from "../src/db/index.js";
import { setLink } from "../src/db/repo.js";
import { wrap } from "./helpers.js";

// Mock the r6 client so commands run their full orchestration (resolve -> fetch
// -> build embed -> reply) against fixtures, with no network.
mock.module("../src/r6/client.js", () => ({
  settle: (p) => p.then((v) => v, () => null),
  playerStats: async () => wrap("stats_ranked.json"),
  operatorStats: async () => wrap("operators_ranked.json"),
  seasonalStats: async () => wrap("seasonalStats.json"),
  accountInfo: async () => wrap("accountInfo.json"),
  isBanned: async () => wrap("isBanned.json"),
}));

const stats = await import("../src/commands/stats.js");
const link = await import("../src/commands/link.js");

beforeAll(() => initDb(":memory:"));
afterAll(() => mock.restore());

function makeInteraction(opts = {}) {
  const calls = { deferred: 0, editReply: null, reply: null };
  return {
    user: { id: opts.callerId || "c1", username: "C" },
    options: {
      getString: (n, _req) => (n in opts ? opts[n] : null),
      getUser: () => opts.user ?? null,
    },
    deferReply: async () => {
      calls.deferred++;
    },
    editReply: async (p) => {
      calls.editReply = typeof p === "string" ? { content: p } : p;
    },
    reply: async (p) => {
      calls.reply = p;
    },
    _calls: calls,
  };
}

describe("/stats orchestration", () => {
  test("happy path defers and replies with a stats embed", async () => {
    const i = makeInteraction({ username: "Stompn.G2" });
    await stats.execute(i);
    expect(i._calls.deferred).toBe(1);
    expect(i._calls.editReply.embeds).toBeDefined();
    expect(i._calls.editReply.embeds[0].toJSON().author.name).toBe("Stompn.G2 — PC");
  });

  test("unlinked + no username -> ephemeral error, no fetch", async () => {
    const i = makeInteraction({ callerId: "nobody" });
    await stats.execute(i);
    expect(i._calls.reply.content).toContain("/link");
    expect(i._calls.editReply).toBeNull();
  });
});

describe("/link orchestration", () => {
  test("valid account is stored and confirmed", async () => {
    const i = makeInteraction({ username: "Stompn.G2", callerId: "linker1" });
    await link.execute(i);
    expect(i._calls.editReply.content ?? i._calls.editReply).toContain("Linked");
  });
});
