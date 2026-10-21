/**
 * Shared vector hashing.
 *
 * Both the offline local provider and the IDF-weighted production path build
 * their vectors here, so the hashing scheme can never drift between them.
 * A token contributes to two buckets (a primary and a secondary hash) to
 * reduce collision bias; the result is L2-normalised so cosine similarity is
 * a plain dot product.
 */

export const LOCAL_DIM = 384;

/** Two independent FNV-style hashes → bucket indices. */
export function hash2(tok: string, dim: number = LOCAL_DIM): [number, number] {
  let h1 = 2166136261, h2 = 16777619;
  for (let i = 0; i < tok.length; i++) {
    h1 ^= tok.charCodeAt(i); h1 = Math.imul(h1, 16777619);
    h2 ^= tok.charCodeAt(i) + i * 31; h2 = Math.imul(h2, 2166136261);
  }
  return [Math.abs(h1) % dim, Math.abs(h2) % dim];
}

/** Build a normalised hashed vector from weighted tokens. */
export function buildVector(weights: Map<string, number>, dim: number = LOCAL_DIM): number[] {
  const vec = new Array(dim).fill(0);
  for (const [tok, w] of weights) {
    const [i1, i2] = hash2(tok, dim);
    vec[i1] += w;
    vec[i2] += 0.5 * w;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/** Cosine similarity that tolerates vectors of different lengths. */
export function cosineSafe(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
