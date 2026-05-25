import { EmbedBuilder } from "discord.js";
import { aggregateOperators } from "./r6/aggregate.js";
import { getBoard, rankedRecord, currentTier, rpSeries, sparkline } from "./r6/extract.js";
import {
  fmtNum,
  fmtKd,
  fmtPct,
  signed,
  fmtHoursFromMs,
  relTime,
  PLATFORM_LABEL,
} from "./lib/format.js";

const DEFAULT_COLOR = 0xe8a33d;
const SUCCESS_COLOR = 0x57f287;
const DANGER_COLOR = 0xed4245;

function playerName(target, account) {
  return account?.profiles?.[0]?.nameOnPlatform || target.nameOnPlatform;
}

function footer(embed, fetchedAt) {
  return embed.setFooter({ text: `via r6data.com • updated ${relTime(fetchedAt)}` }).setTimestamp();
}

function notFoundEmbed(target) {
  return new EmbedBuilder()
    .setColor(DANGER_COLOR)
    .setTitle("No R6 data found")
    .setDescription(
      `Couldn't find stats for **${target.nameOnPlatform}** on ${PLATFORM_LABEL[target.platformType] || target.platformType}. Check the spelling and platform.`
    );
}

export function buildStatsEmbed(target, { stats, ops, seasonal, account }) {
  const acc = account?.data;
  const ranked = getBoard(stats?.data, "ranked");
  const rec = rankedRecord(ranked);
  const tier = currentTier(seasonal?.data);
  const agg = aggregateOperators(ops?.data);

  if (!agg.hasData && !rec) return notFoundEmbed(target);

  const name = playerName(target, acc);
  const fetchedAt = ops
    ? Math.min(stats?.fetchedAt ?? Date.now(), ops?.fetchedAt ?? Date.now())
    : (stats?.fetchedAt ?? Date.now());

  const embed = new EmbedBuilder()
    .setColor(tier?.color || DEFAULT_COLOR)
    .setAuthor({ name: `${name} — ${PLATFORM_LABEL[target.platformType] || target.platformType}`, iconURL: acc?.profilePicture || undefined });

  if (tier?.icon) embed.setThumbnail(tier.icon);
  else if (acc?.profilePicture) embed.setThumbnail(acc.profilePicture);

  // Rank
  embed.addFields({
    name: "Rank (current season)",
    value: tier
      ? `**${tier.name ?? "Ranked"}**\n${fmtNum(tier.rankPoints)} RP` +
        (rec?.maxRankPoints ? ` (peak ${fmtNum(rec.maxRankPoints)})` : "")
      : "Unranked",
    inline: true,
  });

  if (rec) {
    embed.addFields({
      name: `Ranked record (S${rec.seasonId})`,
      value: `${fmtNum(rec.wins)}W / ${fmtNum(rec.losses)}L\n${fmtPct(rec.winPct)} win • ${rec.abandons} abandons`,
      inline: true,
    });
  }

  if (acc?.level) {
    embed.addFields({ name: "Level", value: fmtNum(acc.level), inline: true });
  }

  if (agg.hasData) {
    const t = agg.total;
    embed.addFields(
      { name: "K/D", value: `**${fmtKd(t.kd)}**\n${fmtNum(t.kills)} / ${fmtNum(t.deaths)}`, inline: true },
      { name: "Headshot %", value: fmtPct(t.hsPercent, 1), inline: true },
      { name: "Kills / round", value: fmtKd(t.killsPerRound), inline: true },
      {
        name: "Entry (FB / FD)",
        value: `${fmtNum(t.firstBloods)} / ${fmtNum(t.firstDeaths)}\n${signed(t.entryDiff)} diff`,
        inline: true,
      },
      {
        name: "Clutches",
        value: `${fmtNum(t.clutches)} won / ${fmtNum(t.clutchesLost)} lost\n${fmtPct(t.clutchWinPercent)}`,
        inline: true,
      },
      {
        name: "Aces / Multikills",
        value: `${fmtNum(t.aces)} aces\n${fmtNum(t.multikills.k5)}×5K · ${fmtNum(t.multikills.k4)}×4K · ${fmtNum(t.multikills.k3)}×3K`,
        inline: true,
      },
      { name: "Playtime (ranked)", value: fmtHoursFromMs(t.timePlayedMs), inline: true }
    );
    embed.setDescription("_Combat/entry/clutch numbers are all-time ranked; rank & record are the current season._");
  } else if (rec) {
    embed.addFields(
      { name: "K/D (current season)", value: `**${fmtKd(rec.kd)}**\n${fmtNum(rec.kills)} / ${fmtNum(rec.deaths)}`, inline: true }
    );
    embed.setDescription("_Showing ranked statistics for the current season._");
  }

  return footer(embed, fetchedAt);
}

export function buildRankedEmbed(target, { stats, seasonal, ops, account }) {
  const acc = account?.data;
  const ranked = getBoard(stats?.data, "ranked");
  const rec = rankedRecord(ranked);
  const tier = currentTier(seasonal?.data);
  const agg = aggregateOperators(ops?.data);

  if (!rec && !tier) return notFoundEmbed(target);

  const name = playerName(target, acc);
  const fetchedAt = Math.min(stats?.fetchedAt ?? Date.now(), seasonal?.fetchedAt ?? Date.now());

  const embed = new EmbedBuilder()
    .setColor(tier?.color || DEFAULT_COLOR)
    .setAuthor({ name: `${name} — Ranked`, iconURL: acc?.profilePicture || undefined });
  if (tier?.icon) embed.setThumbnail(tier.icon);

  embed.addFields(
    {
      name: "Tier",
      value: tier ? `**${tier.name ?? "Ranked"}**\n${fmtNum(tier.rankPoints)} RP` : "Unranked",
      inline: true,
    },
    {
      name: "Peak RP",
      value: rec?.maxRankPoints ? fmtNum(rec.maxRankPoints) : "—",
      inline: true,
    },
    {
      name: rec ? `Season ${rec.seasonId}` : "Season",
      value: rec ? `${fmtNum(rec.wins)}W / ${fmtNum(rec.losses)}L\n${fmtPct(rec.winPct)} win` : "—",
      inline: true,
    }
  );

  if (agg.hasData) {
    const t = agg.total;
    embed.addFields(
      { name: "K/D (all-time)", value: fmtKd(t.kd), inline: true },
      { name: "Entry diff", value: signed(t.entryDiff), inline: true },
      { name: "Clutch %", value: fmtPct(t.clutchWinPercent), inline: true }
    );
  } else if (rec) {
    embed.addFields(
      { name: "K/D (season)", value: fmtKd(rec.kd), inline: true },
      { name: "Kills (season)", value: fmtNum(rec.kills), inline: true },
      { name: "Deaths (season)", value: fmtNum(rec.deaths), inline: true }
    );
  }

  return footer(embed, fetchedAt);
}

export function buildOperatorsEmbed(target, { ops, account }, limit = 12) {
  const acc = account?.data;
  const agg = aggregateOperators(ops?.data);
  if (!agg.hasData) return notFoundEmbed(target);

  const name = playerName(target, acc);
  const rows = agg.topOperators.slice(0, limit).map((o) => {
    const op = (o.operator || "?").padEnd(14).slice(0, 14);
    const rnd = String(o.roundsPlayed || 0).padStart(5);
    const kd = fmtKd(o.kd).padStart(5);
    const hs = `${Math.round(o.headshotPercent || 0)}%`.padStart(4);
    const win = `${Math.round(o.winPercent || 0)}%`.padStart(4);
    return `${op}${rnd} ${kd} ${hs} ${win}`;
  });

  const header = "Operator        Rnd   K/D  HS%  Win%";
  const table = "```\n" + header + "\n" + rows.join("\n") + "\n```";

  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setAuthor({ name: `${name} — Top operators (ranked)`, iconURL: acc?.profilePicture || undefined })
    .setDescription(table);
  if (acc?.profilePicture) embed.setThumbnail(acc.profilePicture);

  return footer(embed, ops?.fetchedAt ?? Date.now());
}

export function buildSeasonalEmbed(target, { seasonal, account }) {
  const acc = account?.data;
  const series = rpSeries(seasonal?.data);
  const tier = currentTier(seasonal?.data);
  if (!series.length) return notFoundEmbed(target);

  const name = playerName(target, acc);
  const values = series.map((p) => p.value);
  const current = values[values.length - 1];
  const peak = Math.max(...values);
  const low = Math.min(...values);
  const net = current - values[0];

  const embed = new EmbedBuilder()
    .setColor(tier?.color || DEFAULT_COLOR)
    .setAuthor({ name: `${name} — Rank points history`, iconURL: acc?.profilePicture || undefined })
    .setDescription(`\`${sparkline(values)}\`\n_${values.length} recorded points_`)
    .addFields(
      { name: "Current", value: `${fmtNum(current)} RP`, inline: true },
      { name: "Peak", value: `${fmtNum(peak)} RP`, inline: true },
      { name: "Low", value: `${fmtNum(low)} RP`, inline: true },
      { name: "Net change", value: `${signed(net)} RP`, inline: true }
    );
  if (tier?.icon) embed.setThumbnail(tier.icon);

  return footer(embed, seasonal?.fetchedAt ?? Date.now());
}

export function buildBanEmbed(target, { ban, account }) {
  const acc = account?.data;
  const b = ban?.data;
  const name = playerName(target, acc);
  const banned = !!b?.isBanned;
  const alerts = Array.isArray(b?.banAlerts) ? b.banAlerts : [];

  const embed = new EmbedBuilder()
    .setColor(banned ? DANGER_COLOR : SUCCESS_COLOR)
    .setAuthor({ name: `${name} — Ban status`, iconURL: acc?.profilePicture || undefined })
    .setDescription(banned ? "🔴 **Banned**" : "🟢 **Not banned**");

  if (alerts.length) {
    embed.addFields({
      name: "Ban alerts",
      value: alerts.map((a) => `• ${typeof a === "string" ? a : JSON.stringify(a)}`).join("\n").slice(0, 1024),
    });
  }

  return footer(embed, ban?.fetchedAt ?? Date.now());
}

export function buildCompareEmbed(a, b) {
  // a, b: { target, name, rec, tier, agg }
  const metric = (label, va, vb) => `${label.padEnd(12)}${String(va).padEnd(13)}${vb}`;
  const lines = [
    metric("", trunc(a.name, 12), trunc(b.name, 12)),
    metric("Rank", a.tier?.name || "Unranked", b.tier?.name || "Unranked"),
    metric("RP", fmtNum(a.tier?.rankPoints || a.rec?.rankPoints || 0), fmtNum(b.tier?.rankPoints || b.rec?.rankPoints || 0)),
    metric("Win%", fmtPct(a.rec?.winPct || 0), fmtPct(b.rec?.winPct || 0)),
    metric("K/D", fmtKd(a.agg.total.kd), fmtKd(b.agg.total.kd)),
    metric("HS%", fmtPct(a.agg.total.hsPercent), fmtPct(b.agg.total.hsPercent)),
    metric("Entry +/-", signed(a.agg.total.entryDiff), signed(b.agg.total.entryDiff)),
    metric("Clutch%", fmtPct(a.agg.total.clutchWinPercent), fmtPct(b.agg.total.clutchWinPercent)),
  ];

  return new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle("Head-to-head")
    .setDescription("```\n" + lines.join("\n") + "\n```")
    .setFooter({ text: "via r6data.com • rank/RP current season, combat all-time ranked" })
    .setTimestamp();
}

function trunc(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
