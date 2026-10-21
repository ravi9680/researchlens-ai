import fs from "node:fs";
import { getDb, all } from "./db.js";

/* Migration runner.
 *
 * SQLite has no `ALTER TABLE ... IF NOT EXISTS`, so upgrades to existing
 * databases are done by inspecting `PRAGMA table_info` and adding the missing
 * columns. Fresh databases get everything from schema.sql.
 *
 * Every step is idempotent: running `npm run migrate` twice is a no-op. */

const SCHEMA = new URL("../migrations/schema.sql", import.meta.url);

/** Add a column to an existing table when it is missing. */
function addColumn(table: string, column: string, ddl: string) {
  try {
    const cols = all<any>(`PRAGMA table_info(${table})`).map((c: any) => c.name);
    if (cols.length && !cols.includes(column)) {
      getDb().exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      console.log(`migrated: ${table}.${column} added`);
    }
  } catch { /* table does not exist yet — schema.sql creates it below */ }
}

addColumn("documents", "user_id", "user_id TEXT DEFAULT NULL");
addColumn("ingestion_jobs", "user_id", "user_id TEXT DEFAULT NULL");

/* Apply the canonical schema (creates anything missing). */
getDb().exec(fs.readFileSync(SCHEMA, "utf8"));

/* Indexes that may predate the table they cover. */
for (const stmt of [
  "CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_chunks_paper ON paper_chunks(paper_id)",
  "CREATE INDEX IF NOT EXISTS idx_papers_title ON papers(title)",
  "CREATE INDEX IF NOT EXISTS idx_ingestion_user ON ingestion_jobs(user_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)",
]) {
  try { getDb().exec(stmt); } catch (e: any) { console.log("index skipped:", e.message); }
}

/* Record the applied schema version so future upgrades can be ordered. */
try {
  getDb().exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now'))
     )`
  );
  const row = all<any>("SELECT MAX(version) as v FROM schema_migrations")[0];
  const current = row?.v || 0;
  if (current < 3) {
    getDb().exec(`INSERT OR REPLACE INTO schema_migrations (version) VALUES (3)`);
    console.log(`schema version → 3 (was ${current})`);
  }
} catch { /* non-critical */ }

console.log("migrations applied (sqlite)");
