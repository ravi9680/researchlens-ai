import { buildVector, cosineSafe, LOCAL_DIM } from "./hashing.js";

export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((t) => t.length > 1);
}

export function wordSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

export function jaccard(a: string, b: string): number {
  const sa = wordSet(a), sb = wordSet(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function cosine(a: number[], b: number[]): number {
  // Tolerates vectors of different widths (a dimension mismatch between two
  // providers must degrade to "no similarity", never to a garbage number).
  return cosineSafe(a, b);
}

/** Deterministic hashed embedding without IDF weighting.
 *  This is the plain mirror of the C-engine hashing scheme; the production
 *  path (services/embedding.ts) adds IDF weights on top of the same hash. */
export function localEmbed(text: string, dim = LOCAL_DIM): number[] {
  const tf = new Map<string, number>();
  for (const tok of tokenize(text)) tf.set(tok, (tf.get(tok) || 0) + 1);
  return buildVector(tf, dim);
}

export function chunkText(text: string, targetWords = 220, overlap = 40): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + targetWords).join(" "));
    i += targetWords - overlap;
  }
  return chunks;
}

export function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 3);
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Levenshtein-based fuzzy ratio 0..1 */
export function fuzzyRatio(a: string, b: string): number {
  const s1 = a.toLowerCase(), s2 = b.toLowerCase();
  const m = s1.length, n = s2.length;
  if (!m || !n) return 0;
  if (Math.abs(m - n) > Math.max(m, n) * 0.4) return jaccard(a, b);
  const dp: number[] = Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const t = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (s1[i - 1] === s2[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return 1 - dp[n] / Math.max(m, n);
}
