import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.GUILD_ID; // optional: instant registration to one guild

if (!token || !clientId) {
  console.error("Need DISCORD_TOKEN and DISCORD_CLIENT_ID in .env to deploy commands.");
  process.exit(1);
}

const body = commands.map((c) => c.data.toJSON());
const rest = new REST().setToken(token);
const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

const result = await rest.put(route, { body });
console.log(
  `Registered ${result.length} command(s) ${guildId ? `to guild ${guildId}` : "globally"}.`
);
