import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

let db: DatabaseSync;
const dbFile = process.env.SQLITE_FILE || "./data/researchlens.db";

export function getDb(): DatabaseSync {
  if (!db) {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    db = new DatabaseSync(dbFile);
    db.exec("PRAGMA journal_mode = WAL;");
  }
  return db;
}

export function all<T = any>(sql: string, params: any[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T = any>(sql: string, params: any[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: any[] = []): { lastInsertRowid: number | bigint; changes: number | bigint } {
  return getDb().prepare(sql).run(...params) as any;
}
