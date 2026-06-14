import { test, expect, describe, beforeAll } from "bun:test";
import { initDb } from "../src/db/index.js";
import { setLink, getLink, deleteLink, setCache, getCache } from "../src/db/repo.js";

beforeAll(() => initDb(":memory:"));

describe("linked_accounts", () => {
  test("set then get round-trips fields", () => {
    setLink("u1", "Stompn.G2", "uplay", "pc");
    const row = getLink("u1");
    expect(row.name_on_platform).toBe("Stompn.G2");
    expect(row.platform_type).toBe("uplay");
    expect(row.platform_families).toBe("pc");
    expect(typeof row.linked_at).toBe("string");
  });
  test("unknown user -> null", () => {
    expect(getLink("nobody")).toBeNull();
  });
  test("upsert updates existing", () => {
    setLink("u1", "NewName", "psn", "console");
    expect(getLink("u1").name_on_platform).toBe("NewName");
    expect(getLink("u1").platform_type).toBe("psn");
  });
  test("delete returns changes then null", () => {
    expect(deleteLink("u1")).toBe(1);
    expect(getLink("u1")).toBeNull();
    expect(deleteLink("u1")).toBe(0);
  });
});

// player_cache is dormant (caching disabled, stats fetched live) but kept around
// so caching can be re-enabled without a schema change — so we keep it covered.
describe("player_cache (dormant)", () => {
  test("set then get fresh returns parseable payload", () => {
    setCache("k1", JSON.stringify({ x: 1 }), 60000);
    const row = getCache("k1");
    expect(row).not.toBeNull();
    expect(JSON.parse(row.payload_json)).toEqual({ x: 1 });
  });
  test("expired entry -> null", () => {
    setCache("k2", "{}", -1000);
    expect(getCache("k2")).toBeNull();
  });
  test("missing key -> null", () => {
    expect(getCache("missing")).toBeNull();
  });
  test("upsert overwrites payload", () => {
    setCache("k3", JSON.stringify({ v: 1 }), 60000);
    setCache("k3", JSON.stringify({ v: 2 }), 60000);
    expect(JSON.parse(getCache("k3").payload_json)).toEqual({ v: 2 });
  });
});
