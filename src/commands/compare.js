import { SlashCommandBuilder } from "discord.js";
import { PLATFORM_CHOICES } from "../lib/options.js";
import * as r6 from "../r6/client.js";
import { buildCompareEmbed } from "../embeds.js";
import { getBoard, rankedRecord, currentTier } from "../r6/extract.js";
import { aggregateOperators } from "../r6/aggregate.js";

export const data = new SlashCommandBuilder()
  .setName("compare")
  .setDescription("Compare two R6 players head-to-head")
  .addStringOption((o) => o.setName("player1").setDescription("First username").setRequired(true))
  .addStringOption((o) => o.setName("player2").setDescription("Second username").setRequired(true))
  .addStringOption((o) =>
    o.setName("platform").setDescription("Platform for both players").addChoices(...PLATFORM_CHOICES)
  );

async function loadPlayer(name, platformType, platformFamilies) {
  const [stats, seasonal, ops, account] = await Promise.all([
    r6.settle(r6.playerStats(name, platformType, platformFamilies)),
    r6.settle(r6.seasonalStats(name, platformType)),
    r6.settle(r6.operatorStats(name, platformType, "ranked")),
    r6.settle(r6.accountInfo(name, platformType)),
  ]);
  return {
    name: account?.data?.profiles?.[0]?.nameOnPlatform || name,
    rec: rankedRecord(getBoard(stats?.data, "ranked")),
    tier: currentTier(seasonal?.data),
    agg: aggregateOperators(ops?.data),
  };
}

export async function execute(interaction) {
  const platformType = interaction.options.getString("platform") || "uplay";
  const platformFamilies = platformType === "uplay" ? "pc" : "console";
  const name1 = interaction.options.getString("player1", true);
  const name2 = interaction.options.getString("player2", true);

  await interaction.deferReply();
  const [a, b] = await Promise.all([
    loadPlayer(name1, platformType, platformFamilies),
    loadPlayer(name2, platformType, platformFamilies),
  ]);
  await interaction.editReply({ embeds: [buildCompareEmbed(a, b)] });
}
