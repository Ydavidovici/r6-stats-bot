import { test, expect, describe, beforeAll } from "bun:test";
import { initDb } from "../src/db/index.js";
import { setLink } from "../src/db/repo.js";
import { resolveTarget } from "../src/lib/resolve.js";

beforeAll(() => {
  initDb(":memory:");
  setLink("caller1", "Stompn.G2", "uplay", "pc");
});

function fakeInteraction({ username = null, platform = null, user = null, callerId = "caller1" }) {
  return {
    user: { id: callerId, username: "CallerName" },
    options: {
      getString: (n) => (n === "username" ? username : n === "platform" ? platform : null),
      getUser: (n) => (n === "user" ? user : null),
    },
  };
}

describe("resolveTarget", () => {
  test("explicit username defaults to uplay/pc", () => {
    expect(resolveTarget(fakeInteraction({ username: "Pengu" }))).toEqual({
      nameOnPlatform: "Pengu",
      platformType: "uplay",
      platformFamilies: "pc",
    });
  });
  test("explicit username + console platform", () => {
    expect(resolveTarget(fakeInteraction({ username: "Beaulo", platform: "psn" }))).toEqual({
      nameOnPlatform: "Beaulo",
      platformType: "psn",
      platformFamilies: "console",
    });
  });
  test("no username, caller linked -> their account", () => {
    expect(resolveTarget(fakeInteraction({}))).toEqual({
      nameOnPlatform: "Stompn.G2",
      platformType: "uplay",
      platformFamilies: "pc",
    });
  });
  test("no username, caller not linked -> error mentioning /link", () => {
    const r = resolveTarget(fakeInteraction({ callerId: "nobody" }));
    expect(r.error).toContain("/link");
  });
  test("mentioned user not linked -> error with their name", () => {
    const r = resolveTarget(fakeInteraction({ user: { id: "bob", username: "Bob" } }));
    expect(r.error).toContain("Bob");
  });
});
