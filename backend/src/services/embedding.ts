import fs from "node:fs";
import { tokenize } from "./textUtils.js";
import { all } from "../db.js";

/* Modular embedding provider.
 *  local  (default, offline): IDF-weighted hashed 384-d vectors.
 *  openai (needs AI_API_KEY): text-embedding-3-small via REST, batched.
 * Switch with EMBEDDING_PROVIDER=openai, then run `npm run reembed`
 * (dimensions differ per provider, so the KB must be re-embedded).
 */

export const DIM = 384;
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

function hash2(tok: string): [number, number] {
  let h1 = 2166136261, h2 = 16777619;
  for (let i = 0; i < tok.length; i++) {
    h1 ^= tok.charCodeAt(i); h1 = Math.imul(h1, 16777619);
    h2 ^= tok.charCodeAt(i) + i * 31; h2 = Math.imul(h2, 2166136261);
  }
  return [Math.abs(h1) % DIM, Math.abs(h2) % DIM];
}

/** IDF-weighted hashed embedding (deterministic, offline). */
export function localEmbedWeighted(text: string): number[] {
  const idf = loadIdf();
  const vec = new Array(DIM).fill(0);
  const toks = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
  const defaultIdf = Math.log((idfN + 1) / 2) + 1;
  for (const [tok, c] of tf) {
    const w = (1 + Math.log(c)) * (idf[tok] ?? defaultIdf);
    const [i1, i2] = hash2(tok);
    vec[i1] += w; vec[i2] += 0.5 * w;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

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
      }
    } finally { clearTimeout(t); }
  }
  return out;
}

export function provider(): string {
  return (process.env.EMBEDDING_PROVIDER || "local").toLowerCase();
}

/** Single-text embed with provider fallback (openai → local on any error). */
export async function embed(text: string): Promise<number[]> {
  if (provider() === "openai") {
    try { return (await openaiEmbedBatch([text]))[0]; }
    catch (e) { console.warn("[embed] openai failed, local fallback:", (e as Error).message); }
  }
  return localEmbedWeighted(text);
}

/** Sync local embed (hot paths: search, analysis). */
export function embedSync(text: string): number[] {
  return localEmbedWeighted(text);
}

export { openaiEmbedBatch };
