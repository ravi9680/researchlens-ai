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
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Deterministic 384-dim hashed embedding (local provider). Modular: swap with OpenAI/etc. */
export function localEmbed(text: string, dim = 384): number[] {
  const vec = new Array(dim).fill(0);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    let h1 = 2166136261, h2 = 16777619;
    for (let i = 0; i < tok.length; i++) {
      h1 ^= tok.charCodeAt(i); h1 = Math.imul(h1, 16777619);
      h2 ^= tok.charCodeAt(i) + i * 31; h2 = Math.imul(h2, 2166136261);
    }
    const idx = Math.abs(h1) % dim;
    const idx2 = Math.abs(h2) % dim;
    vec[idx] += 1; vec[idx2] += 0.5;
  }
  // length-normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
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
