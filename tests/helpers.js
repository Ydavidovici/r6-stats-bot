import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "fixtures");

export const fixture = (file) => JSON.parse(readFileSync(join(DIR, file), "utf8"));

// Wrap a fixture the way the r6 client returns it: { data, fetchedAt }.
export const wrap = (file) => ({ data: fixture(file), fetchedAt: Date.now() });

export function fieldByName(embedJson, name) {
  return (embedJson.fields ?? []).find((f) => f.name === name);
}
