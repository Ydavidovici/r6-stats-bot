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
