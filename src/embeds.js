import { EmbedBuilder } from "discord.js";
import { aggregateOperators } from "./r6/aggregate.js";
import { getBoard, rankedRecord, currentTier, rpSeries, sparkline, getTierFromRankIndex } from "./r6/extract.js";
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

const SOURCE_LABELS = { r6data: "r6data.com", ubisoft: "Ubisoft" };

// Build the "via …" credit from the providers that actually answered. A single
// embed can mix sources (e.g. rank from Ubisoft, operators from r6data), so we
// dedupe the labels in the order given and join them. Falls back to r6data.com.
export function sourcesText(...results) {
  const labels = [];
  for (const r of results) {
    const label = SOURCE_LABELS[r?.source];
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.length ? labels.join(" + ") : "r6data.com";
}

function footer(embed, fetchedAt, source = "r6data.com") {
  return embed.setFooter({ text: `via ${source} • updated ${relTime(fetchedAt)}` }).setTimestamp();
}

// Resolve the tier to display. Rank name/division/colour come from the live
// ranked-board index (freshest, and correct for Ranked 3.0's 40-rank ladder),
// but the logo prefers r6data's own served icon so it tracks the new rank art
// without us hardcoding every URL. Falls back to the seasonal tier when there's
// no live ranked board.
function resolveTier(rec, seasonalData) {
  const seasonTier = currentTier(seasonalData);
  if (rec && rec.rank > 0) {
    const live = getTierFromRankIndex(rec.rank);
    return { rankPoints: rec.rankPoints, ...live, icon: seasonTier?.icon ?? live.icon };
  }
  return seasonTier;
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
  const tier = resolveTier(rec, seasonal?.data);
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
      { name: "K/D", value: `**${fmtKd(t.kd)}**\n${fmtNum(t.kills)} / ${fmtNum(t.deaths)} (${signed(t.kills - t.deaths)})`, inline: true },
      { name: "Side Splits", value: `⚔️ **${fmtKd(agg.attacker.kd)}** KD · **${fmtPct(agg.attacker.winPct)}** WR\n(${fmtNum(agg.attacker.kills)}/${fmtNum(agg.attacker.deaths)})\n🛡️ **${fmtKd(agg.defender.kd)}** KD · **${fmtPct(agg.defender.winPct)}** WR\n(${fmtNum(agg.defender.kills)}/${fmtNum(agg.defender.deaths)})`, inline: true },
      { name: "Headshot %", value: fmtPct(t.hsPercent, 1), inline: true },
      { name: "Kills / round", value: fmtKd(t.killsPerRound), inline: true },
      {
        name: "Entry (First Kill / Death)",
        value: `**${fmtKd(t.entryKd)}**\n${fmtNum(t.firstBloods)} / ${fmtNum(t.firstDeaths)} (${signed(t.entryDiff)})`,
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
      { name: "K/D (current season)", value: `**${fmtKd(rec.kd)}**\n${fmtNum(rec.kills)} / ${fmtNum(rec.deaths)} (${signed(rec.kills - rec.deaths)})`, inline: true }
    );
    embed.setDescription("_Showing ranked statistics for the current season._");
  }

  return footer(embed, fetchedAt, sourcesText(stats, account, ops, seasonal));
}

export function buildRankedEmbed(target, { stats, seasonal, ops, account }) {
  const acc = account?.data;
  const ranked = getBoard(stats?.data, "ranked");
  const rec = rankedRecord(ranked);
  const tier = resolveTier(rec, seasonal?.data);
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
    if (rec) {
      embed.addFields(
        { name: "K/D (season)", value: `**${fmtKd(rec.kd)}**\n${fmtNum(rec.kills)} / ${fmtNum(rec.deaths)} (${signed(rec.kills - rec.deaths)})`, inline: true },
        { name: "K/D (all-time)", value: `**${fmtKd(t.kd)}**\n${fmtNum(t.kills)} / ${fmtNum(t.deaths)} (${signed(t.kills - t.deaths)})`, inline: true },
        { name: "Side Splits", value: `⚔️ **${fmtKd(agg.attacker.kd)}** KD · **${fmtPct(agg.attacker.winPct)}** WR\n(${fmtNum(agg.attacker.kills)}/${fmtNum(agg.attacker.deaths)})\n🛡️ **${fmtKd(agg.defender.kd)}** KD · **${fmtPct(agg.defender.winPct)}** WR\n(${fmtNum(agg.defender.kills)}/${fmtNum(agg.defender.deaths)})`, inline: true },
        { name: "Entry K/D", value: `**${fmtKd(t.entryKd)}**\n${fmtNum(t.firstBloods)} / ${fmtNum(t.firstDeaths)} (${signed(t.entryDiff)})`, inline: true },
        { name: "Clutch %", value: fmtPct(t.clutchWinPercent), inline: true }
      );
    } else {
      embed.addFields(
        { name: "K/D (all-time)", value: `**${fmtKd(t.kd)}**\n${fmtNum(t.kills)} / ${fmtNum(t.deaths)} (${signed(t.kills - t.deaths)})`, inline: true },
        { name: "Side Splits", value: `⚔️ **${fmtKd(agg.attacker.kd)}** KD · **${fmtPct(agg.attacker.winPct)}** WR\n(${fmtNum(agg.attacker.kills)}/${fmtNum(agg.attacker.deaths)})\n🛡️ **${fmtKd(agg.defender.kd)}** KD · **${fmtPct(agg.defender.winPct)}** WR\n(${fmtNum(agg.defender.kills)}/${fmtNum(agg.defender.deaths)})`, inline: true },
        { name: "Entry K/D", value: `**${fmtKd(t.entryKd)}**\n${fmtNum(t.firstBloods)} / ${fmtNum(t.firstDeaths)} (${signed(t.entryDiff)})`, inline: true },
        { name: "Clutch %", value: fmtPct(t.clutchWinPercent), inline: true }
      );
    }
  } else if (rec) {
    embed.addFields(
      { name: "K/D (season)", value: `**${fmtKd(rec.kd)}**\n${fmtNum(rec.kills)} / ${fmtNum(rec.deaths)} (${signed(rec.kills - rec.deaths)})`, inline: true }
    );
  }

  return footer(embed, fetchedAt, sourcesText(stats, account, ops, seasonal));
}

const OPERATOR_ROLES = {
  // Attackers - Entry
  ash: { role: "Entry", side: "Attacker" },
  zofia: { role: "Entry", side: "Attacker" },
  nokk: { role: "Entry", side: "Attacker" },
  amaru: { role: "Entry", side: "Attacker" },
  ying: { role: "Entry", side: "Attacker" },
  blitz: { role: "Entry", side: "Attacker" },
  finka: { role: "Entry", side: "Attacker" },
  sledge: { role: "Entry", side: "Attacker" },
  buck: { role: "Entry", side: "Attacker" },
  iana: { role: "Entry", side: "Attacker" },
  striker: { role: "Entry", side: "Attacker" },
  recruit: { role: "Entry", side: "Attacker" },
  glaz: { role: "Entry", side: "Attacker" },
  blackbeard: { role: "Entry", side: "Attacker" },
  capitao: { role: "Entry", side: "Attacker" },

  // Attackers - Intel
  zero: { role: "Intel", side: "Attacker" },
  dokkaebi: { role: "Intel", side: "Attacker" },
  deimos: { role: "Intel", side: "Attacker" },
  lion: { role: "Intel", side: "Attacker" },
  iq: { role: "Intel", side: "Attacker" },
  twitch: { role: "Intel", side: "Attacker" },
  jackal: { role: "Intel", side: "Attacker" },
  flores: { role: "Intel", side: "Attacker" },
  grim: { role: "Intel", side: "Attacker" },
  brava: { role: "Intel", side: "Attacker" },

  // Attackers - Support
  thermite: { role: "Support", side: "Attacker" },
  hibana: { role: "Support", side: "Attacker" },
  ace: { role: "Support", side: "Attacker" },
  maverick: { role: "Support", side: "Attacker" },
  thatcher: { role: "Support", side: "Attacker" },
  kali: { role: "Support", side: "Attacker" },
  gridlock: { role: "Support", side: "Attacker" },
  fuze: { role: "Support", side: "Attacker" },
  montagne: { role: "Support", side: "Attacker" },
  monty: { role: "Support", side: "Attacker" },
  sens: { role: "Support", side: "Attacker" },
  osa: { role: "Support", side: "Attacker" },
  ram: { role: "Support", side: "Attacker" },
  nomad: { role: "Support", side: "Attacker" },

  // Defenders - Roamer
  jager: { role: "Roamer", side: "Defender" },
  vigil: { role: "Roamer", side: "Defender" },
  caveira: { role: "Roamer", side: "Defender" },
  ela: { role: "Roamer", side: "Defender" },
  alibi: { role: "Roamer", side: "Defender" },
  oryx: { role: "Roamer", side: "Defender" },
  warden: { role: "Roamer", side: "Defender" },
  melusi: { role: "Roamer", side: "Defender" },
  thorn: { role: "Roamer", side: "Defender" },
  tubarao: { role: "Roamer", side: "Defender" },

  // Defenders - Intel
  valkyrie: { role: "Intel", side: "Defender" },
  maestro: { role: "Intel", side: "Defender" },
  echo: { role: "Intel", side: "Defender" },
  solis: { role: "Intel", side: "Defender" },
  lesion: { role: "Intel", side: "Defender" },
  fenrir: { role: "Intel", side: "Defender" },
  pulse: { role: "Intel", side: "Defender" },
  mozzie: { role: "Intel", side: "Defender" },

  // Defenders - Anchor
  rook: { role: "Anchor", side: "Defender" },
  doc: { role: "Anchor", side: "Defender" },
  mira: { role: "Anchor", side: "Defender" },
  kaid: { role: "Anchor", side: "Defender" },
  bandit: { role: "Anchor", side: "Defender" },
  mute: { role: "Anchor", side: "Defender" },
  castle: { role: "Anchor", side: "Defender" },
  clash: { role: "Anchor", side: "Defender" },
  azami: { role: "Anchor", side: "Defender" },
  aruni: { role: "Anchor", side: "Defender" },
  tachanka: { role: "Anchor", side: "Defender" },
  wamai: { role: "Anchor", side: "Defender" },
  goyo: { role: "Anchor", side: "Defender" },
  smoke: { role: "Anchor", side: "Defender" },
  thunderbird: { role: "Anchor", side: "Defender" },
  sentry: { role: "Anchor", side: "Defender" },
  skopos: { role: "Anchor", side: "Defender" },
  frost: { role: "Anchor", side: "Defender" },
};

function formatOperatorTable(operators) {
  if (!operators || operators.length === 0) {
    return "*No operators played*";
  }
  const header = "Operator        Rnd   K/D  HS%  Win%";
  const rows = operators.map((o) => {
    const op = (o.operator || "?").trim().padEnd(14).slice(0, 14);
    const rnd = String(o.roundsPlayed || 0).padStart(5);
    const kd = fmtKd(o.kd).padStart(5);
    const hs = `${Math.round(o.headshotPercent || 0)}%`.padStart(4);
    const win = `${Math.round(o.winPercent || 0)}%`.padStart(4);
    return `${op}${rnd} ${kd} ${hs} ${win}`;
  });
  return "```\n" + header + "\n" + rows.join("\n") + "\n```";
}

export function buildOperatorsEmbed(target, { ops, account }, limit = 12) {
  const acc = account?.data;
  const agg = aggregateOperators(ops?.data);
  if (!agg.hasData) return notFoundEmbed(target);

  const name = playerName(target, acc);

  const attackerEntry = [];
  const attackerIntel = [];
  const attackerSupport = [];
  const defenderRoamer = [];
  const defenderIntel = [];
  const defenderAnchor = [];

  for (const op of agg.topOperators) {
    const opName = (op.operator || "").trim().toLowerCase();
    const mapping = OPERATOR_ROLES[opName];
    const side = op.side || mapping?.side;
    let role = mapping?.role;

    if (!role) {
      if (side === "Attacker") role = "Entry";
      else role = "Anchor";
    }

    if (side === "Attacker") {
      if (role === "Entry" && attackerEntry.length < 3) attackerEntry.push(op);
      else if (role === "Intel" && attackerIntel.length < 3) attackerIntel.push(op);
      else if (role === "Support" && attackerSupport.length < 3) attackerSupport.push(op);
    } else {
      if (role === "Roamer" && defenderRoamer.length < 3) defenderRoamer.push(op);
      else if (role === "Intel" && defenderIntel.length < 3) defenderIntel.push(op);
      else if (role === "Anchor" && defenderAnchor.length < 3) defenderAnchor.push(op);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setAuthor({ name: `${name} — Top operators (ranked)`, iconURL: acc?.profilePicture || undefined });

  embed.addFields(
    { name: "⚔️ Attacker — Entry", value: formatOperatorTable(attackerEntry), inline: false },
    { name: "⚔️ Attacker — Intel", value: formatOperatorTable(attackerIntel), inline: false },
    { name: "⚔️ Attacker — Support", value: formatOperatorTable(attackerSupport), inline: false },
    { name: "🛡️ Defender — Roamer", value: formatOperatorTable(defenderRoamer), inline: false },
    { name: "🛡️ Defender — Intel", value: formatOperatorTable(defenderIntel), inline: false },
    { name: "🛡️ Defender — Anchor", value: formatOperatorTable(defenderAnchor), inline: false }
  );

  if (acc?.profilePicture) embed.setThumbnail(acc.profilePicture);

  return footer(embed, ops?.fetchedAt ?? Date.now(), sourcesText(ops, account));
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

  return footer(embed, seasonal?.fetchedAt ?? Date.now(), sourcesText(seasonal, account));
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

  return footer(embed, ban?.fetchedAt ?? Date.now(), sourcesText(ban, account));
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

  const via = sourcesText(...(a.sources ?? []), ...(b.sources ?? []));
  return new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle("Head-to-head")
    .setDescription("```\n" + lines.join("\n") + "\n```")
    .setFooter({ text: `via ${via} • rank/RP current season, combat all-time ranked` })
    .setTimestamp();
}

function trunc(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function buildTournamentEmbed(stats, username, isRecent = false) {
    const embed = new EmbedBuilder()
        .setColor(0xFFA500) // Orange for Tournament
        .setTitle(`🏆 Tournament Stats: ${stats.player_name}`)
        .setDescription(isRecent ? "Stats from the most recent tournament match." : "Aggregated all-time tournament stats.");

    const kdRatio = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
    const entryDiff = (stats.entry_kills - stats.entry_deaths) > 0 ? `+${stats.entry_kills - stats.entry_deaths}` : `${stats.entry_kills - stats.entry_deaths}`;
    const kostPercent = stats.total_rounds > 0 ? Math.round((stats.rounds_with_kost / stats.total_rounds) * 100) : 0;

    embed.addFields(
        { name: "Matches Played", value: `${stats.matches_played}`, inline: true },
        { name: "Avg EPS", value: `**${stats.avg_eps}**`, inline: true },
        { name: "\u200B", value: "\u200B", inline: true }, // Spacer
        { name: "K/D/A", value: `${stats.kills} / ${stats.deaths} / ${stats.assists} (${kdRatio})`, inline: true },
        { name: "Entry (+/-)", value: `${stats.entry_kills} - ${stats.entry_deaths} (${entryDiff})`, inline: true },
        { name: "KOST %", value: `${kostPercent}%`, inline: true },
  valkyrie: { role: "Intel", side: "Defender" },
  maestro: { role: "Intel", side: "Defender" },
  echo: { role: "Intel", side: "Defender" },
  solis: { role: "Intel", side: "Defender" },
  lesion: { role: "Intel", side: "Defender" },
  fenrir: { role: "Intel", side: "Defender" },
  pulse: { role: "Intel", side: "Defender" },
  mozzie: { role: "Intel", side: "Defender" },

  // Defenders - Anchor
  rook: { role: "Anchor", side: "Defender" },
  doc: { role: "Anchor", side: "Defender" },
  mira: { role: "Anchor", side: "Defender" },
  kaid: { role: "Anchor", side: "Defender" },
  bandit: { role: "Anchor", side: "Defender" },
  mute: { role: "Anchor", side: "Defender" },
  castle: { role: "Anchor", side: "Defender" },
  clash: { role: "Anchor", side: "Defender" },
  azami: { role: "Anchor", side: "Defender" },
  aruni: { role: "Anchor", side: "Defender" },
  tachanka: { role: "Anchor", side: "Defender" },
  wamai: { role: "Anchor", side: "Defender" },
  goyo: { role: "Anchor", side: "Defender" },
  smoke: { role: "Anchor", side: "Defender" },
  thunderbird: { role: "Anchor", side: "Defender" },
  sentry: { role: "Anchor", side: "Defender" },
  skopos: { role: "Anchor", side: "Defender" },
  frost: { role: "Anchor", side: "Defender" },
};

function formatOperatorTable(operators) {
  if (!operators || operators.length === 0) {
    return "*No operators played*";
  }
  const header = "Operator        Rnd   K/D  HS%  Win%";
  const rows = operators.map((o) => {
    const op = (o.operator || "?").trim().padEnd(14).slice(0, 14);
    const rnd = String(o.roundsPlayed || 0).padStart(5);
    const kd = fmtKd(o.kd).padStart(5);
    const hs = `${Math.round(o.headshotPercent || 0)}%`.padStart(4);
    const win = `${Math.round(o.winPercent || 0)}%`.padStart(4);
    return `${op}${rnd} ${kd} ${hs} ${win}`;
  });
  return "```\n" + header + "\n" + rows.join("\n") + "\n```";
}

export function buildOperatorsEmbed(target, { ops, account }, limit = 12) {
  const acc = account?.data;
  const agg = aggregateOperators(ops?.data);
  if (!agg.hasData) return notFoundEmbed(target);

  const name = playerName(target, acc);

  const attackerEntry = [];
  const attackerIntel = [];
  const attackerSupport = [];
  const defenderRoamer = [];
  const defenderIntel = [];
  const defenderAnchor = [];

  for (const op of agg.topOperators) {
    const opName = (op.operator || "").trim().toLowerCase();
    const mapping = OPERATOR_ROLES[opName];
    const side = op.side || mapping?.side;
    let role = mapping?.role;

    if (!role) {
      if (side === "Attacker") role = "Entry";
      else role = "Anchor";
    }

    if (side === "Attacker") {
      if (role === "Entry" && attackerEntry.length < 3) attackerEntry.push(op);
      else if (role === "Intel" && attackerIntel.length < 3) attackerIntel.push(op);
      else if (role === "Support" && attackerSupport.length < 3) attackerSupport.push(op);
    } else {
      if (role === "Roamer" && defenderRoamer.length < 3) defenderRoamer.push(op);
      else if (role === "Intel" && defenderIntel.length < 3) defenderIntel.push(op);
      else if (role === "Anchor" && defenderAnchor.length < 3) defenderAnchor.push(op);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setAuthor({ name: `${name} — Top operators (ranked)`, iconURL: acc?.profilePicture || undefined });

  embed.addFields(
    { name: "⚔️ Attacker — Entry", value: formatOperatorTable(attackerEntry), inline: false },
    { name: "⚔️ Attacker — Intel", value: formatOperatorTable(attackerIntel), inline: false },
    { name: "⚔️ Attacker — Support", value: formatOperatorTable(attackerSupport), inline: false },
    { name: "🛡️ Defender — Roamer", value: formatOperatorTable(defenderRoamer), inline: false },
    { name: "🛡️ Defender — Intel", value: formatOperatorTable(defenderIntel), inline: false },
    { name: "🛡️ Defender — Anchor", value: formatOperatorTable(defenderAnchor), inline: false }
  );

  if (acc?.profilePicture) embed.setThumbnail(acc.profilePicture);

  return footer(embed, ops?.fetchedAt ?? Date.now(), sourcesText(ops, account));
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

  return footer(embed, seasonal?.fetchedAt ?? Date.now(), sourcesText(seasonal, account));
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

  return footer(embed, ban?.fetchedAt ?? Date.now(), sourcesText(ban, account));
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

  const via = sourcesText(...(a.sources ?? []), ...(b.sources ?? []));
  return new EmbedBuilder()
    .setColor(DEFAULT_COLOR)
    .setTitle("Head-to-head")
    .setDescription("```\n" + lines.join("\n") + "\n```")
    .setFooter({ text: `via ${via} • rank/RP current season, combat all-time ranked` })
    .setTimestamp();
}

function trunc(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function buildTournamentEmbed(stats, username, isRecent = false) {
    const embed = new EmbedBuilder()
        .setColor(0xFFA500) // Orange for Tournament
        .setTitle(`🏆 Tournament Stats: ${stats.player_name}`)
        .setDescription(isRecent ? "Stats from the most recent tournament match." : "Aggregated all-time tournament stats.");

    const kdRatio = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
    const entryDiff = (stats.entry_kills - stats.entry_deaths) > 0 ? `+${stats.entry_kills - stats.entry_deaths}` : `${stats.entry_kills - stats.entry_deaths}`;
    const kostPercent = stats.total_rounds > 0 ? Math.round((stats.rounds_with_kost / stats.total_rounds) * 100) : 0;

    embed.addFields(
        { name: "Matches Played", value: `${stats.matches_played}`, inline: true },
        { name: "Avg EPS", value: `**${stats.avg_eps}**`, inline: true },
        { name: "\u200B", value: "\u200B", inline: true }, // Spacer
        { name: "K/D/A", value: `${stats.kills} / ${stats.deaths} / ${stats.assists} (${kdRatio})`, inline: true },
        { name: "Entry (+/-)", value: `${stats.entry_kills} - ${stats.entry_deaths} (${entryDiff})`, inline: true },
        { name: "KOST %", value: `${kostPercent}%`, inline: true },
        { name: "Objective Plays", value: `${stats.objective_plays}`, inline: true },
        { name: "Clutches", value: `${stats.clutches}`, inline: true },
        { name: "Rounds Played", value: `${stats.total_rounds}`, inline: true }
    );

    return embed;
}

export function buildTournamentMatchEmbed(matchData) {
    const { match, playerStats } = matchData;
    
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(`🏆 Tournament Match Results`)
        .setDescription(`Match played on <t:${Math.floor(new Date(match.created_at).getTime() / 1000)}:f>`);

    // We can group players by team if team info was saved, but here we just list top players
    let topPlayers = "";
    for (let i = 0; i < Math.min(10, playerStats.length); i++) {
        const p = playerStats[i];
        const kd = `${p.kills}/${p.deaths}/${p.assists}`;
        topPlayers += `**${i+1}. ${p.player_name}** - EPS: **${p.eps}** | K/D: ${kd} | KOST: ${p.rounds_with_kost}/${p.total_rounds}\n`;
    }

    if (topPlayers) {
        embed.addFields({ name: "Scoreboard (Sorted by EPS)", value: topPlayers });
    } else {
        embed.addFields({ name: "Scoreboard", value: "No player stats found." });
    }

    return embed;
}

export function buildPersonalEmbed(stats, username, limit) {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB) // Blue for Personal
        .setTitle(`👤 Personal Stats: ${stats.player_name}`)
        .setDescription(`Aggregated stats from the last **${stats.matches_played}** personal matches uploaded.`);

    const kdRatio = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
    const entryDiff = (stats.entry_kills - stats.entry_deaths) > 0 ? `+${stats.entry_kills - stats.entry_deaths}` : `${stats.entry_kills - stats.entry_deaths}`;
    const kostPercent = stats.total_rounds > 0 ? Math.round((stats.rounds_with_kost / stats.total_rounds) * 100) : 0;

    embed.addFields(
        { name: "Matches Analyzed", value: `${stats.matches_played}`, inline: true },
        { name: "Avg EPS", value: `**${stats.avg_eps}**`, inline: true },
        { name: "\u200B", value: "\u200B", inline: true }, // Spacer
        { name: "K/D/A", value: `${stats.kills} / ${stats.deaths} / ${stats.assists} (${kdRatio})`, inline: true },
        { name: "Entry (+/-)", value: `${stats.entry_kills} - ${stats.entry_deaths} (${entryDiff})`, inline: true },
        { name: "KOST %", value: `${kostPercent}%`, inline: true },
        { name: "Objective Plays", value: `${stats.objective_plays}`, inline: true },
        { name: "Clutches", value: `${stats.clutches}`, inline: true },
        { name: "Rounds Played", value: `${stats.total_rounds}`, inline: true }
    );

    return embed;
}
