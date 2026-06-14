// Render a command's embed to the console using the real data path — provider
// routing (r6data/ubisoft), Ranked 3.0 tier mapping, footer source — without
// connecting to Discord. Unlike spike/dump.js (which calls the raw r6-data.js
// API), this goes through src/r6/client.js + src/embeds.js, i.e. the same code
// the slash commands run.
//
// Usage:
//   bun run spike/preview.js <name> [platformType] [which]
//     platformType = uplay | psn | xbl        (default uplay)
//     which        = stats|ranked|operators|seasonal|ban  (default stats)
//
// Needs R6DATA_API_KEY in .env. To preview the hybrid path, also set
// R6_PROVIDER=ubisoft + UBI_EMAIL/UBI_PASSWORD (only works from a residential IP).
import * as r6 from "../src/r6/client.js";
import {
  buildStatsEmbed,
  buildRankedEmbed,
  buildOperatorsEmbed,
  buildSeasonalEmbed,
  buildBanEmbed,
} from "../src/embeds.js";

const name = process.argv[2] ?? "Stompn.G2";
const platformType = process.argv[3] ?? "uplay";
const which = process.argv[4] ?? "stats";
const platformFamilies = platformType === "uplay" ? "pc" : "console";
const target = { nameOnPlatform: name, platformType, platformFamilies };

const [stats, seasonal, ops, account, ban] = await Promise.all([
  r6.settle(r6.playerStats(name, platformType, platformFamilies)),
  r6.settle(r6.seasonalStats(name, platformType)),
  r6.settle(r6.operatorStats(name, platformType, "ranked")),
  r6.settle(r6.accountInfo(name, platformType)),
  r6.settle(r6.isBanned(name, platformType)),
]);

const builders = {
  stats: () => buildStatsEmbed(target, { stats, ops, seasonal, account }),
  ranked: () => buildRankedEmbed(target, { stats, seasonal, ops, account }),
  operators: () => buildOperatorsEmbed(target, { ops, account }),
  seasonal: () => buildSeasonalEmbed(target, { seasonal, account }),
  ban: () => buildBanEmbed(target, { ban, account }),
};
const build = builders[which] ?? builders.stats;

console.log(
  `\nprovider=${process.env.R6_PROVIDER || "r6data"}  embed=${which}  player=${name} (${platformType})\n`
);
console.log(JSON.stringify(build().toJSON(), null, 2));
