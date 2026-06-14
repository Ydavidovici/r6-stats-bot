import { SlashCommandBuilder } from "discord.js";
import { getTournamentStats, getRecentTournamentMatch } from "../db/dbServiceClient.js";
import { buildTournamentEmbed, buildTournamentMatchEmbed } from "../embeds.js";
import { resolveTarget } from "./resolve.js";

export const data = new SlashCommandBuilder()
    .setName("tournament")
    .setDescription("Tournament commands")
    .addSubcommand(sub =>
        sub.setName("player")
            .setDescription("View aggregated tournament stats for a player")
            .addStringOption(option =>
                option.setName("username")
                    .setDescription("Ubisoft username (defaults to your linked account)")
                    .setRequired(false)
            )
            .addBooleanOption(option =>
                option.setName("recent")
                    .setDescription("Only show stats for the most recent tournament match")
                    .setRequired(false)
            )
    )
    .addSubcommand(sub =>
        sub.setName("results")
            .setDescription("Post the scoreboard for the most recently uploaded tournament match")
    );

export async function execute(interaction) {
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();

    try {
        if (subcommand === "player") {
            const usernameInput = interaction.options.getString("username");
            const isRecent = interaction.options.getBoolean("recent") || false;

            const { username } = await resolveTarget(interaction, usernameInput, null);

            if (!username) {
                return; // resolveTarget handles the error
            }

            const stats = await getTournamentStats(username, isRecent);

            if (!stats) {
                return interaction.editReply({
                    content: `No tournament stats found for **${username}**. Make sure the admins have uploaded your matches!`
                });
            }

            const embed = buildTournamentEmbed(stats, username, isRecent);
            await interaction.editReply({ embeds: [embed] });
        } else if (subcommand === "results") {
            const matchData = await getRecentTournamentMatch();

            if (!matchData) {
                return interaction.editReply({
                    content: "No recent tournament matches found in the database."
                });
            }

            const embed = buildTournamentMatchEmbed(matchData);
            await interaction.editReply({ embeds: [embed] });
        }
    } catch (err) {
        console.error("Tournament command error:", err);
        await interaction.editReply({
            content: "There was an error processing your tournament request. Please try again later."
        });
    }
}
