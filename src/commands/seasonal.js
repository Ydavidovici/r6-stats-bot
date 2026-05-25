import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { addTargetOptions } from "../lib/options.js";
import { resolveTarget } from "../lib/resolve.js";
import * as r6 from "../r6/client.js";
import { buildSeasonalEmbed } from "../embeds.js";
import { getCache } from "../db/repo.js";

export const data = addTargetOptions(
  new SlashCommandBuilder().setName("seasonal").setDescription("Rank-points history for an R6 player")
);

export async function execute(interaction) {
  const t = resolveTarget(interaction);
  if (t.error) return interaction.reply({ content: t.error, flags: MessageFlags.Ephemeral });

  await interaction.deferReply();
  const cacheKey = `account:${t.platformType}:${t.nameOnPlatform.trim().toLowerCase()}`;
  const cacheHit = getCache(cacheKey);
  const account = cacheHit
    ? { data: JSON.parse(cacheHit.payload_json), fetchedAt: cacheHit.fetched_at, cached: true }
    : null;

  const seasonal = await r6.settle(r6.seasonalStats(t.nameOnPlatform, t.platformType));
  await interaction.editReply({ embeds: [buildSeasonalEmbed(t, { seasonal, account })] });
}
