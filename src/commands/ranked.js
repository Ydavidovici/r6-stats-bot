import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { addTargetOptions } from "../lib/options.js";
import { resolveTarget } from "../lib/resolve.js";
import * as r6 from "../r6/client.js";
import { buildRankedEmbed } from "../embeds.js";

export const data = addTargetOptions(
  new SlashCommandBuilder().setName("ranked").setDescription("Ranked card: tier, RP, record, K/D")
);

export async function execute(interaction) {
  const t = resolveTarget(interaction);
  if (t.error) return interaction.reply({ content: t.error, flags: MessageFlags.Ephemeral });

  await interaction.deferReply();
  const [stats, seasonal, ops, account] = await Promise.all([
    r6.settle(r6.playerStats(t.nameOnPlatform, t.platformType, t.platformFamilies)),
    r6.settle(r6.seasonalStats(t.nameOnPlatform, t.platformType)),
    r6.settle(r6.operatorStats(t.nameOnPlatform, t.platformType, "ranked")),
    r6.settle(r6.accountInfo(t.nameOnPlatform, t.platformType)),
  ]);
  await interaction.editReply({ embeds: [buildRankedEmbed(t, { stats, seasonal, ops, account })] });
}
