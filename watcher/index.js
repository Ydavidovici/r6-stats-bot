import chokidar from "chokidar";
import {join, dirname} from "node:path";
import {readdir, stat} from "node:fs/promises";
import {existsSync} from "node:fs";

// Configuration
// Using process.env.USERPROFILE for Windows
const USER_PROFILE = process.env.USERPROFILE || "C:\\Users\\Owner";
const MATCH_REPLAY_DIR = process.env.REPLAY_DIR || join(USER_PROFILE, "Documents", "My Games", "Rainbow Six - Siege");
const API_ENDPOINT = process.env.BOT_API_URL || "http://localhost:3000/api/upload-replay";
const UPLOAD_SECRET = process.env.UPLOAD_SECRET || "dev-secret";
const MATCH_MODE = process.env.MODE || "personal";

console.log(`[watcher] Initializing in [${MATCH_MODE.toUpperCase()}] mode... Watching directory: ${MATCH_REPLAY_DIR}`);

if (!existsSync(MATCH_REPLAY_DIR)) {
    console.warn(`[watcher] WARNING: Directory does not exist yet: ${MATCH_REPLAY_DIR}`);
    console.warn(`[watcher] Make sure Match Replay is enabled in-game.`);
}

// Watch for folder creations/changes inside the Siege directory
// Replays are typically under <ACCOUNT_ID>/MatchReplay/<MATCH_FOLDER>
const watcher = chokidar.watch(`${MATCH_REPLAY_DIR}/**/MatchReplay/*`, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
        stabilityThreshold: 5000, // Wait 5 seconds after last write before triggering
        pollInterval: 1000,
    },
});

const processedMatches = new Set();

async function uploadMatch(folderPath) {
    if (processedMatches.has(folderPath)) return;

    try {
        console.log(`[watcher] New match detected, preparing to upload: ${folderPath}`);
        const files = await readdir(folderPath);
        const recFiles = files.filter(f => f.endsWith(".rec"));

        if (recFiles.length === 0) {
            console.log(`[watcher] No .rec files found in ${folderPath}. Skipping.`);
            return;
        }

        const formData = new FormData();

        for (const file of recFiles) {
            const filePath = join(folderPath, file);
            const fileData = Bun.file(filePath);
            formData.append("replays", fileData, file);
        }
        formData.append("match_type", MATCH_MODE);

        console.log(`[watcher] Uploading ${recFiles.length} files to ${API_ENDPOINT}...`);

        const response = await fetch(API_ENDPOINT, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${UPLOAD_SECRET}`,
            },
            body: formData,
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Upload failed (${response.status}): ${errBody}`);
        }

        const result = await response.json();
        console.log(`[watcher] Match successfully uploaded! Match ID: ${result.matchId}`);
        processedMatches.add(folderPath); // Mark as processed so we don't double upload
    } catch (err) {
        console.error(`[watcher] Failed to upload match at ${folderPath}:`, err);
    }
}

// On 'addDir' or when a file inside the match folder stops writing, trigger upload
watcher.on("add", async (filePath) => {
    // When a .rec file is added and finishes writing, trigger the upload for its parent folder
    if (filePath.endsWith(".rec")) {
        const folderPath = dirname(filePath);
        // We wait an extra 10 seconds just to ensure the game has completely released all files in the folder
        // (chokidar handles individual file stability, but the game might create subsequent round files)
        // Since we want to upload the whole match, waiting is safer.
        // In a more robust script, we'd watch for the game process to exit or a specific 'match end' signature.
        setTimeout(() => {
            uploadMatch(folderPath);
        }, 10000);
    }
});

console.log("[watcher] Watching for new matches...");
