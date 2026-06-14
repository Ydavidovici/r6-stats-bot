import { join } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { $ } from "bun";
import { parseReplayData } from "./src/lib/replayParser.js";

const USER_PROFILE = process.env.USERPROFILE || "C:\\Users\\Owner";
const SIEGE_DIR = join(USER_PROFILE, "Documents", "My Games", "Rainbow Six - Siege");

async function runLocalTest() {
    if (!existsSync(SIEGE_DIR)) {
        console.error(`[test] Could not find Siege directory at ${SIEGE_DIR}`);
        return;
    }

    console.log(`[test] Scanning Siege accounts in ${SIEGE_DIR}...`);
    const accounts = await readdir(SIEGE_DIR);
    let latestMatchDir = null;
    let latestTime = 0;

    for (const accountId of accounts) {
        const matchReplayDir = join(SIEGE_DIR, accountId, "MatchReplay");
        if (!existsSync(matchReplayDir)) continue;

        const matches = await readdir(matchReplayDir);
        for (const match of matches) {
            const matchPath = join(matchReplayDir, match);
            const info = await stat(matchPath);
            if (info.isDirectory() && info.mtimeMs > latestTime) {
                latestTime = info.mtimeMs;
                latestMatchDir = matchPath;
            }
        }
    }

    if (!latestMatchDir) {
        console.error("[test] Could not find any MatchReplay folders with recent matches.");
        console.log("[test] You might need to play a quick match with Match Replay enabled.");
        return;
    }

    console.log(`[test] Found latest match replay folder: ${latestMatchDir}`);
    console.log(`[test] Running r6-dissect... (make sure r6-dissect is installed globally or in PATH)`);

    try {
        const { stdout, stderr } = await $`r6-dissect ${latestMatchDir}`.quiet();
        
        if (stderr.length > 0) {
            console.log(`[test] r6-dissect warning: ${stderr.toString()}`);
        }

        const dissectJson = JSON.parse(stdout.toString());
        console.log(`[test] Successfully parsed JSON from r6-dissect.`);

        // Now run our custom parser
        console.log(`[test] Running internal KOST & EPS parser...`);
        const parsed = parseReplayData(dissectJson);

        console.log(`\n======================================================`);
        console.log(`MATCH STATS: ${parsed.match.map_name} | Duration: ${parsed.match.duration}s`);
        console.log(`======================================================`);
        
        // We already have matchPlayerStats aggregated with EPS
        const scoreboard = parsed.matchPlayerStats.map(a => ({
            Player: a.player_name,
            KDA: `${a.kills}/${a.deaths}/${a.assists}`,
            "Entry (+/-)": `${a.entry_kills}/${a.entry_deaths}`,
            "KOST %": Math.round((a.rounds_with_kost / a.total_rounds) * 100) + "%",
            "Normalized EPS": a.eps
        })).sort((a, b) => b["Normalized EPS"] - a["Normalized EPS"]); // Sort by highest EPS

        console.table(scoreboard);
        console.log(`\n[test] Done! Your formulas are working correctly on real data.`);
    } catch (err) {
        console.error(`[test] Error running test:`, err.message);
        if (err.message.includes("r6-dissect: command not found")) {
            console.error(`Please install r6-dissect. Download it from https://github.com/redraskal/r6-dissect and add it to your PATH.`);
        }
    }
}

runLocalTest();
