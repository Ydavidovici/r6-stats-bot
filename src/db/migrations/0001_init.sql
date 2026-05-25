CREATE TABLE IF NOT EXISTS linked_accounts (
  discord_user_id   TEXT PRIMARY KEY,
  name_on_platform  TEXT NOT NULL,
  platform_type     TEXT NOT NULL,
  platform_families TEXT NOT NULL,
  linked_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_cache (
  cache_key    TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  fetched_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_cache_expires ON player_cache (expires_at);
