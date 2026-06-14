// r6data.com provider — the hosted API. Returns raw payloads; validation,
// retry and provider routing live in ../client.js.
import pkg from "r6-data.js";

const { R6Client } = pkg;

let client = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.R6DATA_API_KEY;
    if (!apiKey) throw new Error("R6DATA_API_KEY is not set in .env");
    client = new R6Client({ apiKey });
  }
  return client;
}

export const accountInfo = (name, platformType) =>
  getClient().players.getAccountInfo({ nameOnPlatform: name, platformType });

export const isBanned = (name, platformType) =>
  getClient().players.getIsBanned({ nameOnPlatform: name, platformType });

// Ranked is our focus, so we fetch the ranked board specifically.
export const playerStats = (name, platformType, platformFamilies, board = "ranked") =>
  getClient().players.getPlayerStats({
    nameOnPlatform: name,
    platformType,
    platform_families: platformFamilies,
    board_id: board,
  });

export const seasonalStats = (name, platformType) =>
  getClient().players.getSeasonalStats({ nameOnPlatform: name, platformType });

export const operatorStats = (name, platformType, modes = "ranked") =>
  getClient().players.getOperatorStats({ nameOnPlatform: name, platformType, modes });
