import { getDb } from "./index.js";

export function getLink(discordUserId) {
  return (
    getDb()
      .query("SELECT * FROM linked_accounts WHERE discord_user_id = ?")
      .get(discordUserId) || null
  );
}

export function setLink(discordUserId, nameOnPlatform, platformType, platformFamilies) {
  getDb()
    .query(
      `INSERT INTO linked_accounts (discord_user_id, name_on_platform, platform_type, platform_families, linked_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(discord_user_id) DO UPDATE SET
         name_on_platform  = excluded.name_on_platform,
         platform_type     = excluded.platform_type,
         platform_families = excluded.platform_families,
         linked_at         = excluded.linked_at`
    )
    .run(discordUserId, nameOnPlatform, platformType, platformFamilies, new Date().toISOString());
}

export function deleteLink(discordUserId) {
  return getDb()
    .query("DELETE FROM linked_accounts WHERE discord_user_id = ?")
    .run(discordUserId).changes;
}

export function getCache(key) {
  const row = getDb()
    .query("SELECT * FROM player_cache WHERE cache_key = ?")
    .get(key);
  if (!row) return null;
  if (row.expires_at <= Date.now()) return null;
  return row;
}

export function setCache(key, payloadJson, ttlMs) {
  const now = Date.now();
  getDb()
    .query(
      `INSERT INTO player_cache (cache_key, payload_json, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         fetched_at   = excluded.fetched_at,
         expires_at   = excluded.expires_at`
    )
    .run(key, payloadJson, now, now + ttlMs);
}
