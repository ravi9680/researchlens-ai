import { randomUUID } from "node:crypto";
import { get, run, all } from "../db.js";
import {
  extractText, detectSections, extractTitle, extractKeywords, detectTopics,
  textReadability, MIN_READABILITY, READABILITY_MIN_LENGTH,
} from "./documentParser.js";
import { chunkText } from "./textUtils.js";
import { analyzeDocument, invalidateChunkCache } from "./similarity.js";
import { analyzeAIWriting } from "./aiDetection.js";
import { detectGaps } from "./gaps.js";
import { cAnalyze, cEngineAvailable, cKeywords, cFingerprint } from "./cEngine.js";

export type Stage =
  | "QUEUED" | "PARSING" | "CHUNKING" | "EMBEDDING" | "C_ENGINE"
  | "SEMANTIC_SEARCH" | "SIMILARITY" | "AI_SIGNALS" | "GAPS" | "REPORT"
  | "DONE" | "FAILED";

const STAGE_PROGRESS: Record<Stage, number> = {
  QUEUED: 2, PARSING: 12, CHUNKING: 24, EMBEDDING: 38, C_ENGINE: 52,
  SEMANTIC_SEARCH: 64, SIMILARITY: 76, AI_SIGNALS: 86, GAPS: 93, REPORT: 98, DONE: 100, FAILED: 100,
};

function setStage(id: string, stage: Stage, extra: Record<string, any> = {}) {
  const keys = Object.keys(extra).map((k) => `${k} = ?`).join(", ");
  run(`UPDATE documents SET stage = ?, progress = ?${keys ? ", " + keys : ""} WHERE id = ?`,
    [stage, STAGE_PROGRESS[stage], ...Object.values(extra), id]);
}

export async function runAnalysis(documentId: string, filePath: string, mime: string, filename: string) {
  try {
    setStage(documentId, "PARSING");
    const fullText = await extractText(filePath, mime, filename);
    if (fullText.length < 50) throw new Error("No readable text extracted. Try a text-based PDF/DOCX/TXT.");
    // Length alone is not enough: binary noise can be long. Refuse to analyse
    // something that is not actually prose — a confident report on garbage is
    // worse than an honest failure.
    if (fullText.length >= READABILITY_MIN_LENGTH && textReadability(fullText) < MIN_READABILITY) {
      throw new Error("This file does not contain readable text (it looks like binary data or an image-only PDF). Try a text-based PDF/DOCX/TXT.");
    }
    const title = extractTitle(fullText, filename);
    run("UPDATE documents SET title = ?, full_text = ? WHERE id = ?", [title, fullText.slice(0, 300000), documentId]);

    setStage(documentId, "CHUNKING");
    const sections = detectSections(fullText);
    const keywords = extractKeywords(fullText);
    const topics = detectTopics(fullText, keywords);

    setStage(documentId, "EMBEDDING");
    /* One chunking pass, shared with the semantic stage. Previously the text
     * was chunked and embedded twice (once here, once inside the similarity
     * service), doubling the work for identical results. */
    const userChunks = chunkText(fullText, 180, 30).slice(0, 24);

    // C engine lexical analysis (with JS fallback)
    setStage(documentId, "C_ENGINE");
    let cLexical: any = null, cKw: any = null, fingerprint = "";
    try {
      if (cEngineAvailable()) {
        const kb = all<any>("SELECT id, substr(abstract,1,1500) AS ab FROM papers LIMIT 40");
        cLexical = await cAnalyze(fullText.slice(0, 20000), kb.map((k: any) => ({ id: k.id, text: k.ab || "" })), 8);
        cKw = await cKeywords(fullText.slice(0, 20000), 12);
        fingerprint = (await cFingerprint(fullText.slice(0, 20000))).fingerprint;
      }
    } catch { cLexical = null; }

    setStage(documentId, "SEMANTIC_SEARCH");
    const sem = await analyzeDocument(fullText, { topPapers: 8, userChunks });

    /* One query for every candidate abstract instead of one per paper per
     * keyword — the old N+1 loop could run hundreds of statements. */
    const abstracts = new Map<string, string>();
    for (const p of sem.similarPapers) {
      const row = get<any>("SELECT abstract FROM papers WHERE id = ?", [p.paperId]);
      abstracts.set(p.paperId, (row?.abstract || "").toLowerCase());
    }

    setStage(documentId, "SIMILARITY");
    for (const p of sem.similarPapers) {
      const hay = abstracts.get(p.paperId) || "";
      p.matchedConcepts = keywords.filter((k) => hay.includes(k.toLowerCase())).slice(0, 5);
      // attach C lexical scores where paper ids overlap
      const lx = cLexical?.results?.find((r: any) => r.id === p.paperId);
      if (lx) (p as any).lexical = { score: lx.lexical_score, jaccard: lx.jaccard, tfidf: lx.tfidf, kmpHits: lx.kmp_hits };
    }

    setStage(documentId, "AI_SIGNALS");
    const ai = analyzeAIWriting(fullText, sections);

    setStage(documentId, "GAPS");
    const gaps = detectGaps(fullText, topics.map((t) => t.topic), sem.similarPapers.map((p) => p.paperId));

    setStage(documentId, "REPORT");
    const summary = {
      about: `${title} — primarily about ${topics[0]?.topic || "general ML"} (keywords: ${keywords.slice(0, 6).join(", ")}).`,
      comparison: sem.similarPapers.length
        ? `Closest match: "${sem.similarPapers[0].title}" (${sem.similarPapers[0].score}% semantic similarity). Overall similarity ${sem.overallSimilarity}%.`
        : "No close matches in the current knowledge base.",
      gaps: gaps.map((g) => g.title),
      improvements: buildImprovements(gaps, sem.similarPapers.length),
      reading: sem.similarPapers.slice(0, 5).map((p) => ({ id: p.paperId, title: p.title })),
    };
    const report = {
      title, filename, topics, keywords: keywords.slice(0, 15),
      sections: sections.map((s) => ({ name: s.name, chars: s.content.length })),
      overallSimilarity: sem.overallSimilarity, sectionScores: sem.sectionScores,
      similarPapers: sem.similarPapers, passageMatches: sem.passageMatches,
      ai, gaps, summary, fingerprint,
      cEngine: cLexical
        ? { used: true, algorithms: cLexical.algorithms, keywords: cKw?.keywords || [] }
        : { used: false, reason: "binary unavailable — JS fallback used", algorithms: ["tf-idf(js)", "jaccard(js)", "heap-topk(js)"] },
      userChunkCount: userChunks.length, generatedAt: new Date().toISOString(),
      disclaimers: {
        similarity: "Semantic similarity measures relatedness, NOT plagiarism.",
        ai: ai.disclaimer,
        demo: "Papers flagged isDemo use synthetic demo metadata — not real citations.",
      },
    };

    // persist similarity rows
    for (const p of sem.similarPapers) {
      run("INSERT INTO similarity_results (id, document_id, paper_id, score, section_scores, matches_json) VALUES (?,?,?,?,?,?)",
        [randomUUID(), documentId, p.paperId, p.score, JSON.stringify(p.sectionScores), JSON.stringify(p.topMatches)]);
    }
    setStage(documentId, "DONE", { report_json: JSON.stringify(report) });
    invalidateChunkCache();
  } catch (e: any) {
    setStage(documentId, "FAILED", { error: String(e?.message || e).slice(0, 2000) });
  }
}

/** Improvement suggestions derived from the gaps that were actually found,
 *  so the summary never lists advice the analysis did not justify. */
function buildImprovements(gaps: { title: string; futureDirection: string }[], matched: number): string[] {
  const out: string[] = [];
  for (const g of gaps) {
    if (g.futureDirection && !out.includes(g.futureDirection)) out.push(g.futureDirection);
    if (out.length >= 4) break;
  }
  if (!out.includes("Add public-benchmark evaluation")) out.unshift("Add public-benchmark evaluation");
  if (matched > 0) out.push("Cite and compare the top-ranked similar papers explicitly");
  return out.slice(0, 5);
}

export function getReport(id: string) {
  const d = get<any>("SELECT * FROM documents WHERE id = ?", [id]);
  if (!d) return null;
  return { ...d, report: d.report_json ? JSON.parse(d.report_json) : null };
}
