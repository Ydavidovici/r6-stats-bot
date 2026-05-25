import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { addTargetOptions } from "../lib/options.js";
import { resolveTarget } from "../lib/resolve.js";
import * as r6 from "../r6/client.js";
import { buildOperatorsEmbed } from "../embeds.js";

export const data = addTargetOptions(
  new SlashCommandBuilder().setName("operators").setDescription("Top operators (ranked) for an R6 player")
);

export async function execute(interaction) {
  const t = resolveTarget(interaction);
  if (t.error) return interaction.reply({ content: t.error, flags: MessageFlags.Ephemeral });

  await interaction.deferReply();
  const [ops, account] = await Promise.all([
    r6.settle(r6.operatorStats(t.nameOnPlatform, t.platformType, "ranked")),
    r6.settle(r6.accountInfo(t.nameOnPlatform, t.platformType)),
  ]);
  await interaction.editReply({ embeds: [buildOperatorsEmbed(t, { ops, account })] });
}
