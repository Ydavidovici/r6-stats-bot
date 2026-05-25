import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { setLink } from "../db/repo.js";
import * as r6 from "../r6/client.js";
import { PLATFORM_CHOICES } from "../lib/options.js";

export const data = new SlashCommandBuilder()
  .setName("link")
  .setDescription("Link your R6 account so other commands work without typing your name")
  .addStringOption((o) =>
    o.setName("username").setDescription("Your R6 username").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("platform").setDescription("Platform").addChoices(...PLATFORM_CHOICES)
  );

export async function execute(interaction) {
  const username = interaction.options.getString("username", true);
  const platformType = interaction.options.getString("platform") || "uplay";
  const platformFamilies = platformType === "uplay" ? "pc" : "console";

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const { data } = await r6.accountInfo(username, platformType);
    const resolvedName = data?.profiles?.[0]?.nameOnPlatform;
    if (!resolvedName) {
      return interaction.editReply(
        `Couldn't find **${username}** on that platform. Double-check the spelling and platform.`
      );
    }
    setLink(interaction.user.id, resolvedName, platformType, platformFamilies);
    await interaction.editReply(
      `Linked you to **${resolvedName}** (${platformType}). \`/stats\` now works with no arguments.`
    );
  } catch (err) {
    await interaction.editReply(`Couldn't link that account: ${err.message}`);
  }
}
