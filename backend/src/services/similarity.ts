import { cosine, fuzzyRatio, jaccard, chunkText, splitSentences } from "./textUtils.js";
import { embedSync } from "./embedding.js";
import { all } from "../db.js";

export interface PassageMatch {
  userPassage: string;
  sourcePassage: string;
  similarity: number;
  matchType: "EXACT" | "NEAR-EXACT" | "SEMANTIC" | "CONCEPTUAL";
  paperId: string;
  paperTitle: string;
  section: string;
}

export interface SimilarPaper {
  paperId: string; title: string; authors: string[]; year: number | null;
  venue: string; doi: string | null; citationCount: number;
  score: number; sectionScores: Record<string, number>;
  matchedConcepts: string[]; whySimilar: string; sourceUrl: string; isDemo: boolean;
  topMatches: PassageMatch[];
}

interface KBChunk { id: string; paper_id: string; section: string; content: string; embedding: number[]; }

let chunkCache: KBChunk[] | null = null;
export function invalidateChunkCache() { chunkCache = null; }

function loadChunks(): KBChunk[] {
  if (chunkCache) return chunkCache;
  const rows = all<any>("SELECT id, paper_id, section, content, embedding FROM paper_chunks LIMIT 20000");
  chunkCache = rows.map((r) => {
    let emb: number[] = [];
    try { emb = JSON.parse(r.embedding); } catch { emb = []; }
    return { id: r.id, paper_id: r.paper_id, section: r.section, content: r.content, embedding: emb };
  });
  return chunkCache;
}

export function semanticSearch(queryEmbedding: number[], topK = 40): { chunk: KBChunk; score: number }[] {
  const chunks = loadChunks();
  const scored = chunks.map((c) => ({ chunk: c, score: c.embedding.length ? cosine(queryEmbedding, c.embedding) : 0 }));
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

function classifyMatch(userP: string, srcP: string, sem: number): PassageMatch["matchType"] {
  const a = userP.toLowerCase().trim(), b = srcP.toLowerCase().trim();
  if (a === b || (a.length > 60 && (b.includes(a) || a.includes(b)))) return "EXACT";
  const fz = fuzzyRatio(userP, srcP);
  if (fz > 0.85) return "NEAR-EXACT";
  if (sem > 0.55) return "SEMANTIC";
  return "CONCEPTUAL";
}

export function analyzeDocument(fullText: string, opts: { topPapers?: number } = {}): {
  overallSimilarity: number;
  similarPapers: SimilarPaper[];
  passageMatches: PassageMatch[];
  sectionScores: Record<string, number>;
} {
  const topPapers = opts.topPapers || 8;
  const userChunks = chunkText(fullText, 180, 30).slice(0, 24);
  const userSents = splitSentences(fullText).slice(0, 60);
  const papers = all<any>("SELECT * FROM papers");
  const meta = new Map(papers.map((p: any) => [p.id, p]));
  const authorsByPaper = new Map<string, string[]>();
  for (const row of all<any>("SELECT pa.paper_id, a.name FROM paper_authors pa JOIN authors a ON a.id = pa.author_id")) {
    if (!authorsByPaper.has(row.paper_id)) authorsByPaper.set(row.paper_id, []);
    authorsByPaper.get(row.paper_id)!.push(row.name);
  }

  // Aggregate chunk-level semantic hits per paper
  const paperScores = new Map<string, { sum: number; n: number; best: number; sections: Record<string, number[]>; matches: PassageMatch[] }>();
  for (const uc of userChunks) {
    const q = embedSync(uc);
    const hits = semanticSearch(q, 24);
    for (const { chunk, score } of hits) {
      if (score < 0.12) continue;
      if (!paperScores.has(chunk.paper_id)) paperScores.set(chunk.paper_id, { sum: 0, n: 0, best: 0, sections: {}, matches: [] });
      const e = paperScores.get(chunk.paper_id)!;
      e.sum += score; e.n++; e.best = Math.max(e.best, score);
      if (!e.sections[chunk.section]) e.sections[chunk.section] = [];
      e.sections[chunk.section].push(score);
    }
  }

  // Passage-level: compare user sentences vs top chunk contents (bounded)
  const passageMatches: PassageMatch[] = [];
  const candidateChunks = new Map<string, KBChunk[]>();
  for (const uc of userChunks.slice(0, 10)) {
    for (const { chunk, score } of semanticSearch(embedSync(uc), 8)) {
      if (score < 0.2) continue;
      if (!candidateChunks.has(chunk.paper_id)) candidateChunks.set(chunk.paper_id, []);
      if (candidateChunks.get(chunk.paper_id)!.length < 4) candidateChunks.get(chunk.paper_id)!.push(chunk);
    }
  }
  for (const sent of userSents.slice(0, 40)) {
    if (sent.split(" ").length < 8) continue;
    const sq = embedSync(sent);
    for (const [pid, chunks] of candidateChunks) {
      for (const c of chunks) {
        const srcSents = splitSentences(c.content).slice(0, 6);
        for (const ss of srcSents) {
          const sem = cosine(sq, embedSync(ss));
          const lex = jaccard(sent, ss);
          const combined = 0.7 * sem + 0.3 * lex;
          if (combined > 0.5) {
            const p = meta.get(pid);
            passageMatches.push({
              userPassage: sent.slice(0, 400), sourcePassage: ss.slice(0, 400),
              similarity: Math.round(combined * 100),
              matchType: classifyMatch(sent, ss, sem),
              paperId: pid, paperTitle: p?.title || "Unknown", section: c.section,
            });
          }
        }
      }
    }
    if (passageMatches.length > 60) break;
  }
  passageMatches.sort((a, b) => b.similarity - a.similarity);
  const topPassages = passageMatches.slice(0, 20);

  // Build ranked paper list
  const ranked: SimilarPaper[] = [...paperScores.entries()].map(([pid, e]) => {
    const p = meta.get(pid);
    const avg = e.n ? e.sum / e.n : 0;
    const score = Math.min(97, Math.round((0.55 * e.best + 0.45 * Math.min(avg * 1.6, 1)) * 100));
    const sectionScores: Record<string, number> = {};
    for (const [sec, arr] of Object.entries(e.sections)) {
      sectionScores[sec] = Math.round(Math.min(1, Math.max(...arr) * 1.15) * 100);
    }
    const matches = topPassages.filter((m) => m.paperId === pid).slice(0, 3);
    const why = e.best > 0.7 ? "Strong semantic overlap in methodology and findings with shared concepts."
      : e.best > 0.45 ? "Moderate semantic overlap; shared topic and related methods."
      : "Topical relatedness; same research area with partial concept overlap.";
    return {
      paperId: pid, title: p?.title || "Unknown", authors: authorsByPaper.get(pid) || [],
      year: p?.year ?? null, venue: p?.venue || "", doi: p?.doi || null,
      citationCount: p?.citation_count || 0, score, sectionScores,
      matchedConcepts: [], whySimilar: why, sourceUrl: p?.source_url || p?.open_access_url || "",
      isDemo: Boolean(p?.is_demo), topMatches: matches,
    };
  }).sort((a, b) => b.score - a.score).slice(0, topPapers);

  const overall = ranked.length ? Math.round(ranked.slice(0, 3).reduce((s, r) => s + r.score, 0) / Math.min(3, ranked.length)) : 0;

  // Section-level scores for the user doc: best paper match per section name
  const sectionScores: Record<string, number> = {};
  for (const r of ranked.slice(0, 3)) {
    for (const [sec, v] of Object.entries(r.sectionScores)) {
      sectionScores[sec] = Math.max(sectionScores[sec] || 0, v as number);
    }
  }
  return { overallSimilarity: overall, similarPapers: ranked, passageMatches: topPassages, sectionScores };
}
