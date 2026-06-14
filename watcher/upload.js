import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { parseArgs } from "node:util";
import os from "node:os";

// Configuration
let API_ENDPOINT = process.env.BOT_API_URL || "http://localhost:3000/api/upload-replay";
let UPLOAD_SECRET = process.env.UPLOAD_SECRET || "dev-secret";

const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        mode: {
            type: "string",
            short: "m",
            default: "tournament"
        },
        url: {
            type: "string",
            short: "u",
        },
        secret: {
            type: "string",
            short: "s",
        }
    },
    allowPositionals: true
});

if (values.url) {
    API_ENDPOINT = values.url;
}
if (values.secret) {
    UPLOAD_SECRET = values.secret;
}

if (positionals.length === 0) {
    console.error("Usage: bun run upload.js [--mode <tournament|personal>] [--url <bot-api-url>] <path-to-match-folder>");
    process.exit(1);
}

let folderPath = positionals[0];
if (folderPath.startsWith('~')) {
    folderPath = join(os.homedir(), folderPath.slice(1));
}
const MATCH_MODE = values.mode;

if (!existsSync(folderPath)) {
    console.error(`Error: Directory does not exist: ${folderPath}`);
    process.exit(1);
}

if (!statSync(folderPath).isDirectory()) {
    console.error(`Error: The path must be a directory containing .rec files.`);
    process.exit(1);
}

async function uploadManualMatch(folder) {
    try {
        console.log(`[manual-upload] Preparing to upload match from: ${folder}`);
        const files = await readdir(folder);
        const recFiles = files.filter(f => f.endsWith(".rec"));

        if (recFiles.length === 0) {
            console.error(`[manual-upload] No .rec files found in ${folder}. Exiting.`);
            process.exit(1);
        }

        const formData = new FormData();

        for (const file of recFiles) {
            const filePath = join(folder, file);
            const fileData = Bun.file(filePath);
            formData.append("replays", fileData, file);
        }
        formData.append("match_type", MATCH_MODE);

        console.log(`[manual-upload] Uploading ${recFiles.length} files to ${API_ENDPOINT} as '${MATCH_MODE}'...`);

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
        console.log(`[manual-upload] ✅ Match successfully uploaded! Match ID: ${result.matchId}`);
    } catch (err) {
        console.error(`[manual-upload] ❌ Failed to upload match:`, err);
    }
}

uploadManualMatch(folderPath);
