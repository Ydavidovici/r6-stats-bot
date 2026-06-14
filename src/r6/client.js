import pkg from "r6-data.js";

const { R6Client } = pkg;

let client = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.R6DATA_API_KEY;
    if (!apiKey) throw new Error("R6DATA_API_KEY is not set in .env");
    client = new R6Client({ apiKey });
  }
  return client;
}

// How many extra times to re-call the upstream when it answers with an
// empty/malformed payload. r6data.com is an inconsistent third-party scraper and
// occasionally returns junk; a quick retry usually lands a good response.
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

// Fetch live from the upstream every time — no caching, so results are always
// current. Guards against r6data.com's inconsistency: retry past invalid/empty
// responses, and never surface a structurally-broken payload. Returns
// { data, fetchedAt }.
async function fetchLive(fetcher, validate) {
  let lastErr = null;
  for (let attempt = 0; attempt <= UPSTREAM_RETRIES; attempt++) {
    try {
      const data = await fetcher();
      if (!validate || validate(data)) {
        return { data, fetchedAt: Date.now() };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("r6data returned no usable data");
}

export function accountInfo(name, platformType) {
  return fetchLive(
    () => getClient().players.getAccountInfo({ nameOnPlatform: name, platformType }),
    validators.account
  );
}

export function isBanned(name, platformType) {
  return fetchLive(
    () => getClient().players.getIsBanned({ nameOnPlatform: name, platformType }),
    validators.ban
  );
}

// Ranked is our focus, so we fetch the ranked board specifically.
export function playerStats(name, platformType, platformFamilies, { board = "ranked" } = {}) {
  return fetchLive(
    () =>
      getClient().players.getPlayerStats({
        nameOnPlatform: name,
        platformType,
        platform_families: platformFamilies,
        board_id: board,
      }),
    validators.stats
  );
}

export function seasonalStats(name, platformType) {
  return fetchLive(
    () => getClient().players.getSeasonalStats({ nameOnPlatform: name, platformType }),
    validators.seasonal
  );
}

export function operatorStats(name, platformType, modes = "ranked") {
  return fetchLive(
    () => getClient().players.getOperatorStats({ nameOnPlatform: name, platformType, modes }),
    validators.operators
  );
}

// Resolve a client promise to its value, or null on failure — so one failing
// endpoint (or a not-found player) doesn't sink an entire command.
export const settle = (promise) => promise.then((v) => v, () => null);
