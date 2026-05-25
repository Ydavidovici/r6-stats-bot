import { Database } from "bun:sqlite";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

let db = null;

export function initDb(path = "./data/r6bot.db") {
  const dir = dirname(path);
  if (path !== ":memory:" && dir && dir !== ".") mkdirSync(dir, { recursive: true });
  db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

export function getDb() {
  if (!db) throw new Error("Database not initialized — call initDb() first.");
  return db;
}

function migrate(database) {
  database.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);"
  );
  const applied = new Set(
    database.query("SELECT name FROM _migrations").all().map((r) => r.name)
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const apply = database.transaction(() => {
      database.exec(sql);
      database
        .query("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
        .run(file, new Date().toISOString());
    });
    apply();
    console.log(`[db] applied migration ${file}`);
  }
}
