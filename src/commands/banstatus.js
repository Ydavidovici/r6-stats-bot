import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { addTargetOptions } from "../lib/options.js";
import { resolveTarget } from "../lib/resolve.js";
import * as r6 from "../r6/client.js";
import { buildBanEmbed } from "../embeds.js";
import { getCache } from "../db/repo.js";

export const data = addTargetOptions(
  new SlashCommandBuilder().setName("banstatus").setDescription("Check an R6 player's ban status")
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

  const ban = await r6.settle(r6.isBanned(t.nameOnPlatform, t.platformType));
  if (!ban) {
    return interaction.editReply(`Couldn't fetch ban status for **${t.nameOnPlatform}**.`);
  }
  await interaction.editReply({ embeds: [buildBanEmbed(t, { ban, account })] });
}
