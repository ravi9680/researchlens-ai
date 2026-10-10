import fs from "node:fs";
import { getDb } from "./db.js";

const sql = fs.readFileSync(new URL("../migrations/schema.sql", import.meta.url), "utf8");
getDb().exec(sql);
console.log("migrations applied (sqlite)");
