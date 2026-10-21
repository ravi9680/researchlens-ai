import fs from "node:fs";
import { getDb, all } from "./db.js";

// upgrade existing DBs BEFORE creating (order matters: indexes reference columns)
try {
  const cols = all<any>("PRAGMA table_info(documents)").map((c: any) => c.name);
  if (cols.length && !cols.includes("user_id")) {
    getDb().exec("ALTER TABLE documents ADD COLUMN user_id TEXT DEFAULT NULL");
    console.log("migrated: documents.user_id added");
  }
} catch { /* fresh DB — schema below creates everything */ }

try {
  const cols = all<any>("PRAGMA table_info(ingestion_jobs)").map((c: any) => c.name);
  if (cols.length && !cols.includes("user_id")) {
    getDb().exec("ALTER TABLE ingestion_jobs ADD COLUMN user_id TEXT DEFAULT NULL");
    console.log("migrated: ingestion_jobs.user_id added");
  }
} catch { /* fresh DB */ }

const sql = fs.readFileSync(new URL("../migrations/schema.sql", import.meta.url), "utf8");
getDb().exec(sql);
try { getDb().exec("CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id)"); } catch {}
console.log("migrations applied (sqlite)");
