import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { deleteLink } from "../db/repo.js";

export const data = new SlashCommandBuilder()
  .setName("unlink")
  .setDescription("Remove your linked R6 account");

export async function execute(interaction) {
  const removed = deleteLink(interaction.user.id);
  await interaction.reply({
    content: removed ? "Unlinked your R6 account." : "You don't have a linked account.",
    flags: MessageFlags.Ephemeral,
  });
}
