import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { getPersonalStats } from "../db/dbServiceClient.js";
import { buildPersonalEmbed } from "../embeds.js";
import { resolveTarget } from "../lib/resolve.js";

export const data = new SlashCommandBuilder()
    .setName("personal")
    .setDescription("View your aggregated stats from recent personal uploads (not tournaments)")
    .addStringOption(option =>
        option.setName("username")
            .setDescription("Ubisoft username (defaults to your linked account)")
            .setRequired(false)
    )
    .addIntegerOption(option =>
        option.setName("limit")
            .setDescription("Number of recent matches to aggregate (default 10)")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
    );

export async function execute(interaction) {
    return interaction.reply({
        content: "⚠️ **Notice:** Personal match stats and replay uploads are currently disabled while we update the parser for the new Y11S2 Match Replay format. These features are in dev.",
    });

    try {
        const limit = interaction.options.getInteger("limit") || 10;

        const t = resolveTarget(interaction);
        if (t.error) return interaction.editReply({ content: t.error });

        const username = t.nameOnPlatform;
        const stats = await getPersonalStats(username, limit);

        if (!stats) {
            return interaction.editReply({
                content: `No personal match stats found for **${username}**. Make sure you've uploaded your personal matches!`
            });
        }

        const embed = buildPersonalEmbed(stats, username, limit);
        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
        console.error("Personal command error:", err);
        await interaction.editReply({
            content: "There was an error fetching your personal stats. Please try again later."
        });
    }
}
