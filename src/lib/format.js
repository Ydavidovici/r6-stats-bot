export const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");
export const fmtKd = (n) => Number(n || 0).toFixed(2);
export const fmtPct = (n, d = 0) => `${Number(n || 0).toFixed(d)}%`;
export const signed = (n) => `${n >= 0 ? "+" : ""}${fmtNum(n)}`;

export function fmtHoursFromMs(ms) {
  const h = Math.round((ms || 0) / 3_600_000);
  return `${fmtNum(h)}h`;
}

export function relTime(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export const PLATFORM_LABEL = { uplay: "PC", psn: "PlayStation", xbl: "Xbox" };
