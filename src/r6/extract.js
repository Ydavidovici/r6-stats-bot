// Helpers to pull structured values out of r6-data.js payloads.

export function getBoard(statsPayload, boardId) {
  const fams = statsPayload?.platform_families_full_profiles ?? [];
  for (const fam of fams) {
    for (const b of fam?.board_ids_full_profiles ?? []) {
      if (b.board_id === boardId) return b.full_profiles?.[0] ?? null;
    }
  }
  return null;
}

export function rankedRecord(board) {
  const p = board?.profile;
  if (!p) return null;
  const games = (p.wins || 0) + (p.losses || 0);
  return {
    seasonId: board.season_id,
    wins: p.wins || 0,
    losses: p.losses || 0,
    abandons: p.abandon || 0,
    winPct: games ? (p.wins / games) * 100 : 0,
    rankPoints: p.rank_points || 0,
    maxRankPoints: p.max_rank_points || 0,
    kills: p.kills || 0,
    deaths: p.deaths || 0,
    kd: p.deaths ? p.kills / p.deaths : p.kills,
    rank: p.rank || 0,
  };
}

export function currentTier(seasonalPayload) {
  const series = seasonalPayload?.data?.history?.data ?? [];
  if (!series.length) return null;
  const sorted = [...series].sort((a, b) => new Date(b[0]) - new Date(a[0]));
  const latest = sorted[0]?.[1];
  if (!latest) return null;
  return {
    rankPoints: latest.value,
    name: latest.metadata?.rank ?? null,
    color: latest.metadata?.color ?? null,
    icon: latest.metadata?.imageUrl ?? null,
  };
}

export function rpSeries(seasonalPayload) {
  const series = seasonalPayload?.data?.history?.data ?? [];
  return series
    .map((e) => ({ t: new Date(e[0]).getTime(), value: e[1]?.value ?? 0 }))
    .sort((a, b) => a.t - b.t);
}

const SPARK = "▁▂▃▄▅▆▇█";
export function sparkline(values) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map(
      (v) =>
        SPARK[Math.min(SPARK.length - 1, Math.floor(((v - min) / range) * (SPARK.length - 1)))]
    )
    .join("");
}

const TIERS = [
  { name: "Unranked", color: "#a4a4a4", prefix: "unranked" },
  { name: "Copper", color: "#cb7846", prefix: "copper" },
  { name: "Bronze", color: "#a46f4b", prefix: "bronze" },
  { name: "Silver", color: "#a4a4a4", prefix: "silver" },
  { name: "Gold", color: "#e5c613", prefix: "gold" },
  { name: "Platinum", color: "#359da8", prefix: "platinum" },
  { name: "Emerald", color: "#1ebb64", prefix: "emerald" },
  { name: "Diamond", color: "#c878d6", prefix: "diamond" },
  { name: "Champion", color: "#d0073c", prefix: "champion" },
];

const RANK_ICON_BASE = "https://r6data.com/assets/img/r6_ranks_img";

// Ranked 3.0 (Operation System Override, 2026-06-02): 8 tiers × 5 divisions =
// 40 ranks. Champion is now divisioned too (V–I, indices 36–40), where it used
// to be a single rank at index 36. The general tier/division formula now covers
// the whole ladder; there is no Champion special-case anymore.
export function getTierFromRankIndex(rankIndex) {
  if (!rankIndex || rankIndex <= 0) {
    return { name: "Unranked", color: "#a4a4a4", icon: `${RANK_ICON_BASE}/unranked.webp` };
  }
  const idx = Math.min(rankIndex, 40); // clamp; ladder tops out at Champion I (40)
  const tierIdx = Math.floor((idx - 1) / 5) + 1; // 1 (Copper) .. 8 (Champion)
  const divIdx = 5 - ((idx - 1) % 5); // 5 (V) .. 1 (I)
  const tier = TIERS[tierIdx];
  return {
    name: `${tier.name} ${divIdx}`,
    color: tier.color,
    icon: `${RANK_ICON_BASE}/${tier.prefix}-${divIdx}.webp`,
  };
}
