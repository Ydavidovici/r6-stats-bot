import { Client, GatewayIntentBits, Events, Collection, MessageFlags } from "discord.js";
import { initDb } from "./db/index.js";
import { commands } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is not set in .env");
  process.exit(1);
}
if (!process.env.R6DATA_API_KEY) {
  console.error("R6DATA_API_KEY is not set in .env");
  process.exit(1);
}

initDb(process.env.DB_PATH || "./data/r6bot.db");

const registry = new Collection();
for (const cmd of commands) registry.set(cmd.data.name, cmd);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag} — ${registry.size} commands loaded.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = registry.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = "Something went wrong handling that command.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.login(token);
