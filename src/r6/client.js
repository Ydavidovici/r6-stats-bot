import pkg from "r6-data.js";
import { getCache, setCache } from "../db/repo.js";

const { R6Client } = pkg;

// r6data.com free tier is ~5k calls/month, so cache aggressively by default.
// Set CACHE_TTL_MIN=0 in .env to disable caching entirely.
const RANKED_TTL_MINUTES = process.env.CACHE_TTL_MIN !== undefined ? Number(process.env.CACHE_TTL_MIN) : 15;

export const TTL_RANKED_STATS = RANKED_TTL_MINUTES * 60 * 1000;
export const TTL_SEASONAL_STATS = RANKED_TTL_MINUTES * 60 * 1000;
export const TTL_BAN_STATUS = RANKED_TTL_MINUTES === 0 ? 0 : 24 * 60 * 60 * 1000;
export const TTL_ACCOUNT_INFO = RANKED_TTL_MINUTES === 0 ? 0 : 7 * 24 * 60 * 60 * 1000;
export const TTL_OPERATOR_STATS = RANKED_TTL_MINUTES === 0 ? 0 : 7 * 24 * 60 * 60 * 1000;

let client = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.R6DATA_API_KEY;
    if (!apiKey) throw new Error("R6DATA_API_KEY is not set in .env");
    client = new R6Client({ apiKey });
  }
  return client;
}

const norm = (s) => String(s).trim().toLowerCase();

// Read-through cache. Returns { data, fetchedAt, cached }.
async function cached(key, fetcher, ttlMs, { force = false } = {}) {
  if (!force && ttlMs > 0) {
    const hit = getCache(key);
    if (hit) {
      return { data: JSON.parse(hit.payload_json), fetchedAt: hit.fetched_at, cached: true };
    }
  }
  const data = await fetcher();
  const fetchedAt = Date.now();
  if (ttlMs > 0) {
    setCache(key, JSON.stringify(data), ttlMs);
  }
  return { data, fetchedAt, cached: false };
}

export function accountInfo(name, platformType, opts) {
  return cached(
    `account:${platformType}:${norm(name)}`,
    () => getClient().players.getAccountInfo({ nameOnPlatform: name, platformType }),
    TTL_ACCOUNT_INFO,
    opts
  );
}

export function isBanned(name, platformType, opts) {
  return cached(
    `ban:${platformType}:${norm(name)}`,
    () => getClient().players.getIsBanned({ nameOnPlatform: name, platformType }),
    TTL_BAN_STATUS,
    opts
  );
}

// Ranked is our focus, so we fetch the ranked board specifically.
export function playerStats(name, platformType, platformFamilies, { board = "ranked", ...opts } = {}) {
  return cached(
    `stats:${platformType}:${platformFamilies}:${board}:${norm(name)}`,
    () =>
      getClient().players.getPlayerStats({
        nameOnPlatform: name,
        platformType,
        platform_families: platformFamilies,
        board_id: board,
      }),
    TTL_RANKED_STATS,
    opts
  );
}

export function seasonalStats(name, platformType, opts) {
  return cached(
    `seasonal:${platformType}:${norm(name)}`,
    () => getClient().players.getSeasonalStats({ nameOnPlatform: name, platformType }),
    TTL_SEASONAL_STATS,
    opts
  );
}

export function operatorStats(name, platformType, modes = "ranked", opts) {
  return cached(
    `operators:${platformType}:${modes}:${norm(name)}`,
    () => getClient().players.getOperatorStats({ nameOnPlatform: name, platformType, modes }),
    TTL_OPERATOR_STATS,
    opts
  );
}

// Resolve a client promise to its value, or null on failure — so one failing
// endpoint (or a not-found player) doesn't sink an entire command.
export const settle = (promise) => promise.then((v) => v, () => null);
