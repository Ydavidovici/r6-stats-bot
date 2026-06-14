import {serve} from "bun";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {mkdir, rm, writeFile} from "node:fs/promises";
import {parseReplayData} from "../lib/replayParser.js";
import {pushMatchToDbService} from "../db/dbServiceClient.js";
import {$} from "bun";
import { Dissect } from "r6-dissect";

export function startApiServer(port = process.env.API_PORT || 3000) {
    const UPLOAD_SECRET = process.env.UPLOAD_SECRET || "dev-secret";

    serve({
        port,
        async fetch(req) {
            const url = new URL(req.url);

            if (req.method === "POST" && url.pathname === "/api/upload-replay") {
                const authHeader = req.headers.get("Authorization");
                if (authHeader !== `Bearer ${UPLOAD_SECRET}`) {
                    return new Response("Unauthorized", {status: 401});
                }

                // Early return since Y11S2 parsing is in dev
                return new Response("Replay parsing is currently disabled for Y11S2 maintenance. These features are in development.", {status: 503});

                try {
                    const formData = await req.formData();
                    const files = formData.getAll("replays"); // array of File objects
                    const matchType = formData.get("match_type") || "personal";

                    if (!files || files.length === 0) {
                        return new Response("No files uploaded", {status: 400});
                    }

                    // Create a temp directory to run r6-dissect
                    const matchId = crypto.randomUUID();
                    const tempDir = join(tmpdir(), `r6stats_${matchId}`);
                    await mkdir(tempDir, {recursive: true});

                    const rawReplays = [];

                    // Save files to temp dir
                    for (const file of files) {
                        const buffer = await file.arrayBuffer();
                        const filePath = join(tempDir, file.name || `round_${crypto.randomUUID()}.rec`);
                        await writeFile(filePath, Buffer.from(buffer));

                        rawReplays.push({
                            id: `${matchId}_${file.name}`,
                            match_id: matchId,
                            round_number: rawReplays.length + 1,
                            file_data: Buffer.from(buffer).toString("base64"), // Store base64 for HTTP transfer
                        });
                    }

                    // Run r6-dissect via the npm module
                    let dissectOutput;
                    try {
                        const dissect = new Dissect({ binaryPath: "/usr/local/lib/libr6dissect.so" });
                        dissectOutput = await dissect.match(tempDir);
                    } catch (err) {
                        console.error("r6-dissect failed:", err);
                        await rm(tempDir, {recursive: true, force: true});
                        return new Response("Replay parsing failed. Could not parse .rec files.", {status: 500});
                    }

                    // Parse the output
                    const parsedData = parseReplayData(dissectOutput);

                    // Add raw replays to the payload
                    parsedData.rawReplays = rawReplays;
                    parsedData.match.id = matchId; // Override mock UUIDs with the real one
                    parsedData.match.match_type = matchType; // Inject match type

                    // Push to DB Service
                    await pushMatchToDbService(parsedData);

                    // Post to Discord if it's a tournament match
                    if (matchType === "tournament") {
                        console.log(`[api] Match ${matchId} is a tournament match! Triggering Discord embed post...`);
                        // TODO: Use discord.js client to post the embed to #tournament-results
                    }

                    // Cleanup
                    await rm(tempDir, {recursive: true, force: true});

                    return new Response(JSON.stringify({ok: true, matchId}), {
                        status: 201,
                        headers: {"Content-Type": "application/json"},
                    });
                } catch (error) {
                    console.error("Error processing upload:", error);
                    return new Response(JSON.stringify({error: error.message}), {status: 500});
                }
            }

            return new Response("Not found", {status: 404});
        },
    });
    console.log(`[api] Server listening on port ${port}`);
}
