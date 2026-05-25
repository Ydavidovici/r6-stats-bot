import pkg from "r6-data.js";
const { R6Client } = pkg;

const apiKey = process.env.R6DATA_API_KEY;
if (!apiKey) {
  console.error("Missing R6DATA_API_KEY in .env");
  process.exit(1);
}

const r6 = new R6Client({ apiKey });
try {
  const ops = await r6.game.getOperators({ name: "Ash" });
  console.log("Operators count:", ops.length);
  if (ops.length > 0) {
    console.log("Ash metadata sample:", JSON.stringify(ops[0], null, 2));
  }
} catch (err) {
  console.error("Error:", err);
}
