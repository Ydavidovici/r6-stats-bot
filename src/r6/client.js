// Provider-routing client. Every command goes through here; this layer picks a
// data provider, validates and retries against an inconsistent upstream, and
// (in hybrid mode) falls back between providers. The provider modules return
// raw payloads in r6data's shape; the extractors/embeds never see the routing.
import * as r6data from "./providers/r6data.js";

const PROVIDER = (process.env.R6_PROVIDER || "r6data").toLowerCase();

// The Ubisoft provider pulls in r6api.js-next + credentials; only load it when
// it's actually selected, so the default path needs neither.
let ubisoft = null;
async function loadUbisoft() {
  if (!ubisoft) ubisoft = await import("./providers/ubisoft.js");
  return ubisoft;
}
const providers = { r6data: async () => r6data, ubisoft: loadUbisoft };

// How many extra times to re-call a provider when it answers with an
// empty/malformed payload. Third-party scrapers occasionally return junk; a
// quick retry usually lands a good response.
export const UPSTREAM_RETRIES = 2;

// Structural validators per endpoint. These reject null / error-shaped / HTML
// payloads (the "incorrect data" the upstream sometimes returns) WITHOUT
// rejecting legitimately-empty ones — e.g. a real player with no ranked games
// returns an empty operators[] array, which is valid data we must keep.
export const validators = {
  account: (p) => Array.isArray(p?.profiles),
  ban: (p) => typeof p?.isBanned === "boolean",
  stats: (p) => Array.isArray(p?.platform_families_full_profiles),
  seasonal: (p) => Array.isArray(p?.data?.history?.data),
  operators: (p) => Array.isArray(p?.operators),
};

// Hybrid routing. Ubisoft only freshens what it can actually provide better:
// the current ranked board (rank/RP/record) and account info. It has no RP
// time-series and no rich operator/entry/clutch fields, so seasonal history,
// operators and ban status stay on r6data. r6data is always the fallback.
function chainFor(endpoint) {
  if (PROVIDER === "ubisoft" && (endpoint === "playerStats" || endpoint === "accountInfo")) {
    return ["ubisoft", "r6data"];
  }
  return ["r6data"];
}

// Call one provider, retrying past invalid/throwing responses. Returns
// { data, fetchedAt, source } or throws if it never produced a valid payload.
async function callProvider(name, endpoint, args, validate) {
  const provider = await providers[name]();
  const fetcher = provider[endpoint];
  if (typeof fetcher !== "function") {
    throw new Error(`provider "${name}" has no "${endpoint}"`);
  }
  let lastErr = null;
  for (let attempt = 0; attempt <= UPSTREAM_RETRIES; attempt++) {
    try {
      const data = await fetcher(...args);
      if (!validate || validate(data)) return { data, fetchedAt: Date.now(), source: name };
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error(`${name}.${endpoint} returned no usable data`);
}

// Try each provider in the endpoint's chain; the first valid payload wins, so a
// failing/blocked provider transparently falls back to the next.
async function dispatch(endpoint, validate, args) {
  let lastErr = null;
  for (const name of chainFor(endpoint)) {
    try {
      return await callProvider(name, endpoint, args, validate);
    } catch (err) {
      if (name !== "r6data") {
        console.error(`[provider fallback] ${name}.${endpoint} failed:`, err.message || err);
      }
      lastErr = err;
    }
  }
  throw lastErr ?? new Error(`no usable data for ${endpoint}`);
}

export function accountInfo(name, platformType) {
  return dispatch("accountInfo", validators.account, [name, platformType]);
}

export function isBanned(name, platformType) {
  return dispatch("isBanned", validators.ban, [name, platformType]);
}

export function playerStats(name, platformType, platformFamilies, { board = "ranked" } = {}) {
  return dispatch("playerStats", validators.stats, [name, platformType, platformFamilies, board]);
}

export function seasonalStats(name, platformType) {
  return dispatch("seasonalStats", validators.seasonal, [name, platformType]);
}

export function operatorStats(name, platformType, modes = "ranked") {
  return dispatch("operatorStats", validators.operators, [name, platformType, modes]);
}

// Resolve a client promise to its value, or null on failure — so one failing
// endpoint (or a not-found player) doesn't sink an entire command.
export const settle = (promise) => promise.then((v) => v, () => null);
