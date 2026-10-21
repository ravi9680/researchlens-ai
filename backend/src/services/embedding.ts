import fs from "node:fs";
import { tokenize } from "./textUtils.js";
import { all } from "../db.js";
import { buildVector, LOCAL_DIM } from "./hashing.js";

/* Modular embedding provider.
 *
 *   local  (default, offline) — IDF-weighted hashed 384-d vectors.
 *   openai (needs AI_API_KEY) — text-embedding-3-small via REST, batched.
 *
 * Switch with EMBEDDING_PROVIDER=openai and then run `npm run reembed`:
 * the two providers produce different dimensions, so the knowledge base must
 * be re-embedded before the vectors are comparable.
 *
 * IMPORTANT: `DIM` is a live binding. When the OpenAI provider is active it
 * becomes 1536, and every consumer that reads it (route handlers, the
 * similarity service) automatically works with the new width. */

export const LOCAL_DIMENSION = LOCAL_DIM;

/** Dimension of the vectors currently stored in the knowledge base. */
export let DIM = LOCAL_DIM;

const IDF_FILE = "./data/idf.json";

let idfCache: Record<string, number> | null = null;
let idfN = 1;

export function buildIdf(): Record<string, number> {
  const docs = all<any>("SELECT title, abstract, full_text FROM papers");
  const df = new Map<string, number>();
  const texts = docs.map((d: any) => `${d.title || ""} ${d.abstract || ""} ${((d.full_text || "") as string).slice(0, 6000)}`);
  for (const t of texts) {
    const uniq = new Set(tokenize(t));
    for (const w of uniq) df.set(w, (df.get(w) || 0) + 1);
  }
  const N = Math.max(1, texts.length);
  const idf: Record<string, number> = {};
  for (const [w, c] of df) idf[w] = Math.log((N + 1) / (c + 1)) + 1;
  idfN = N;
  fs.mkdirSync("./data", { recursive: true });
  fs.writeFileSync(IDF_FILE, JSON.stringify({ n: N, idf }));
  idfCache = idf;
  return idf;
}

function loadIdf(): Record<string, number> {
  if (idfCache) return idfCache;
  try {
    const raw = JSON.parse(fs.readFileSync(IDF_FILE, "utf8"));
    idfN = raw.n || 1;
    idfCache = raw.idf || {};
  } catch {
    try { idfCache = buildIdf(); }
    catch { idfCache = {}; }
  }
  return idfCache!;
}

export function refreshIdf() { idfCache = null; loadIdf(); }

/** IDF-weighted hashed embedding (deterministic, offline). */
export function localEmbedWeighted(text: string): number[] {
  const idf = loadIdf();
  const tf = new Map<string, number>();
  for (const t of tokenize(text)) tf.set(t, (tf.get(t) || 0) + 1);
  const defaultIdf = Math.log((idfN + 1) / 2) + 1;
  const weights = new Map<string, number>();
  for (const [tok, c] of tf) {
    weights.set(tok, (1 + Math.log(c)) * (idf[tok] ?? defaultIdf));
  }
  return buildVector(weights, LOCAL_DIM);
}

/* ---------------- OpenAI provider ---------------- */

async function openaiEmbedBatch(texts: string[]): Promise<number[][]> {
  const key = process.env.AI_API_KEY || "";
  if (!key) throw new Error("AI_API_KEY missing");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST", signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "text-embedding-3-small", input: batch.map((s) => s.slice(0, 6000)) }),
      });
      if (!r.ok) throw new Error(`OpenAI ${r.status}`);
      const j: any = await r.json();
      for (const d of j.data) {
        const v: number[] = d.embedding;
        const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
        out.push(v.map((x) => x / n));
        // The model defines the width; record it so the rest of the app
        // compares vectors of the same length.
        if (v.length) DIM = v.length;
      }
    } finally { clearTimeout(t); }
  }
  return out;
}

export function provider(): string {
  return (process.env.EMBEDDING_PROVIDER || "local").toLowerCase();
}

/** True when the OpenAI provider is configured *and* usable. */
export function openaiConfigured(): boolean {
  return provider() === "openai" && Boolean(process.env.AI_API_KEY);
}

/** Single-text embed with provider fallback (openai → local on any error). */
export async function embed(text: string): Promise<number[]> {
  if (provider() === "openai") {
    try {
      const v = (await openaiEmbedBatch([text]))[0];
      if (v?.length) return v;
    } catch (e) {
      console.warn("[embed] openai failed, local fallback:", (e as Error).message);
    }
  }
  return localEmbedWeighted(text);
}

/** Batch embed — used by `npm run reembed` so the whole index can be rebuilt
 *  with the active provider (this is what makes the OpenAI swap real). */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (provider() === "openai") {
    try {
      const out = await openaiEmbedBatch(texts);
      if (out.length) return out;
    } catch (e) {
      console.warn("[embed] openai batch failed, local fallback:", (e as Error).message);
    }
  }
  return texts.map((t) => localEmbedWeighted(t));
}

/** Sync local embed (offline hot paths: search, analysis). */
export function embedSync(text: string): number[] {
  return localEmbedWeighted(text);
}

/** Sync embed that respects the active provider dimension. When OpenAI is
 *  configured the KB holds OpenAI vectors, so a local query vector would be
 *  meaningless — callers must use the async `embed()` in that case. */
export function embedSyncSafe(text: string): number[] {
  if (provider() === "openai") {
    console.warn("[embed] embedSync called with the openai provider — vector widths differ.");
  }
  return localEmbedWeighted(text);
}

export { openaiEmbedBatch };
