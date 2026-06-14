// Pure adapters that normalize r6api.js-next responses into the shapes r6data
// returns, so the extractors/embeds downstream don't need to know which provider
// answered. Kept free of any library import so it can be unit-tested in
// isolation (and so importing it never binds the r6api.js-next module).

// First present finite number, else 0. Rank ids/mmr can be `undefined` for an
// unranked player, which must read as 0 (Unranked), not NaN.
export function num(...vals) {
  for (const v of vals) if (typeof v === "number" && Number.isFinite(v)) return v;
  return 0;
}

// getUserSeasonal returns one entry per region/board. Pick the player's active
// ranked board: prefer board.slug === "pvp_ranked", then the one with the most
// matches (covers multi-region accounts).
export function pickRankedBoard(seasonal) {
  const entries = Array.isArray(seasonal) ? seasonal : seasonal ? [seasonal] : [];
  const ranked = entries.filter((e) => e?.board?.slug === "pvp_ranked");
  const pool = ranked.length ? ranked : entries;
  if (!pool.length) return null;
  const games = (e) => num(e.matches) || num(e.wins) + num(e.losses);
  return pool.slice().sort((a, b) => games(b) - games(a))[0];
}

// Map a getUserSeasonal ranked entry into r6data's getPlayerStats shape so
// getBoard() / rankedRecord() work unchanged. In Ranked 2.0 the skill-record
// `mmr` field carries the player's RP.
export function adaptStats(board) {
  const b = board ?? {};
  const profile = {
    rank: num(b.rank?.id),
    rank_points: num(b.rank?.mmr),
    max_rank: num(b.maxRank?.id),
    max_rank_points: num(b.maxRank?.mmr),
    kills: num(b.kills),
    deaths: num(b.deaths),
    wins: num(b.wins),
    losses: num(b.losses),
    abandon: num(b.abandons),
  };
  return {
    platform_families_full_profiles: [
      {
        board_ids_full_profiles: [
          {
            board_id: "ranked",
            full_profiles: [{ season_id: num(b.season?.id) || null, profile }],
          },
        ],
      },
    ],
  };
}

// Map findUserByUsername + getUserProgression into r6data's getAccountInfo shape.
export function adaptAccount(profile, progression, name, platformType) {
  const avatars = profile?.avatars ?? {};
  return {
    level: num(progression?.level),
    profilePicture: avatars[256] ?? avatars[500] ?? avatars[146] ?? null,
    profiles: [{ platformType, nameOnPlatform: profile?.username || name }],
  };
}
