import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pkg from "r6-data.js";

const { R6Client } = pkg;

const apiKey = process.env.R6DATA_API_KEY;
if (!apiKey) {
  console.error("Missing R6DATA_API_KEY. Put it in .env (see .env.example). Get a key at https://r6data.com");
  process.exit(1);
}

// Usage: bun run spike   (defaults to Stompn.G2 on PC)
//        bun run spike/dump.js "<name>" <platformType>   platformType = uplay | psn | xbl
const name = process.argv[2] ?? "Stompn.G2";
const platformType = process.argv[3] ?? "uplay";
const platform_families = platformType === "uplay" ? "pc" : "console";
const outDir = join(import.meta.dir, "out", `${platformType}_${name}`);

const r6 = new R6Client({ apiKey });

async function dump(label, fn) {
  try {
    const data = await fn();
    await writeFile(join(outDir, `${label}.json`), JSON.stringify(data, null, 2));
    const empty =
      data == null ||
      (Array.isArray(data) && data.length === 0) ||
      (typeof data === "object" && Object.keys(data).length === 0);
    console.log(`  ${empty ? "EMPTY" : "ok   "} ${label}`);
    return data;
  } catch (err) {
    console.log(`  FAIL  ${label} : ${err?.message ?? err}`);
    await writeFile(join(outDir, `${label}.error.txt`), String(err?.stack ?? err));
    return null;
  }
}

console.log(`\nDumping r6-data.js for "${name}" (${platformType}/${platform_families}) -> ${outDir}\n`);
await mkdir(outDir, { recursive: true });

await dump("accountInfo", () => r6.players.getAccountInfo({ nameOnPlatform: name, platformType }));
await dump("isBanned", () => r6.players.getIsBanned({ nameOnPlatform: name, platformType }));
await dump("seasonalStats", () => r6.players.getSeasonalStats({ nameOnPlatform: name, platformType }));
await dump("stats_all", () => r6.players.getPlayerStats({ nameOnPlatform: name, platformType, platform_families }));
await dump("stats_ranked", () =>
  r6.players.getPlayerStats({ nameOnPlatform: name, platformType, platform_families, board_id: "ranked" }));
await dump("operators_ranked", () =>
  r6.players.getOperatorStats({ nameOnPlatform: name, platformType, modes: "ranked" }));

console.log(`\nDone. Inspect the JSON in ${outDir} to see exactly what r6-data.js returns.\n`);
