import pkg from "r6-data.js";
const { R6Client } = pkg;

const apiKey = process.env.R6DATA_API_KEY;
if (!apiKey) {
  console.error("Missing R6DATA_API_KEY in .env");
  process.exit(1);
}

const r6 = new R6Client({ apiKey });
try {
  const maps = await r6.game.getMaps();
  console.log("Maps count:", maps.length);
  if (maps.length > 0) {
    console.log("First map sample:", JSON.stringify(maps[0], null, 2));
  }
} catch (err) {
  console.error("Error:", err);
}
