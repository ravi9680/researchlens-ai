import fs from "node:fs";
import { normalizeWhitespace } from "./textUtils.js";

/** How prose-like a text is, 0..1.
 *  A non-PDF file renamed to .pdf (or an image-only PDF) can be long enough to
 *  pass a plain length check while carrying no readable content at all — the
 *  old fallback scrape happily returned binary noise, which then produced a
 *  confident, meaningless analysis.
 *
 *  Two independent signals, both of which real prose satisfies strongly:
 *    wordRatio      — share of letters that sit inside word-like runs.
 *                     Prose ≈ 1.0, binary noise ≈ 0.7.
 *    spaceDensity   — whitespace share. Prose ≈ 0.12, binary noise ≈ 0.03.
 *  Returns the weaker of the two, normalised so prose scores ≈ 1. */
export function textReadability(text: string): number {
  const t = (text || "").trim();
  if (!t.length) return 0;
  const letters = (t.match(/\p{L}/gu) || []).length;
  if (!letters) return 0;
  const wordChars = (t.match(/[\p{L}]{2,}/gu) || []).join("").length;
  const spaces = (t.match(/\s/gu) || []).length;
  const wordRatio = wordChars / letters;
  const spaceDensity = spaces / t.length;
  return Math.min(wordRatio / 0.95, spaceDensity / 0.08);
}

/** Below this score the text is treated as binary rather than prose. */
export const MIN_READABILITY = 0.6;

/** Short inputs are not judged — a two-line note is legitimately sparse. */
export const READABILITY_MIN_LENGTH = 200;

export async function extractText(filePath: string, mime: string, originalName: string): Promise<string> {
  const lower = originalName.toLowerCase();
  if (lower.endsWith(".txt") || mime.includes("text")) {
    return normalizeWhitespace(fs.readFileSync(filePath, "utf8").slice(0, 500000));
  }
  if (lower.endsWith(".docx")) {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ path: filePath });
    return normalizeWhitespace(result.value.slice(0, 500000));
  }
  if (lower.endsWith(".pdf") || mime.includes("pdf")) {
    const buf = fs.readFileSync(filePath);
    try {
      const pdfParse = (await import("pdf-parse")).default as any;
      const fn = typeof pdfParse === "function" ? pdfParse : pdfParse.default;
      const data = await fn(buf);
      return normalizeWhitespace(String(data.text || "").slice(0, 500000));
    } catch (e) {
      // Fallback: crude text scrape from PDF stream (keeps pipeline working for odd PDFs)
      const raw = buf.toString("latin1");
      const matches = [...raw.matchAll(/\(([^)]{8,})\)/g)].map((m) => m[1]).join(" ");
      return normalizeWhitespace(matches.slice(0, 200000));
    }
  }
  throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
}

const SECTION_PATTERNS: [string, RegExp][] = [
  ["Abstract", /^\s*abstract\s*$/i],
  ["Introduction", /^\s*(1\.?\s*)?introduction\s*$/i],
  ["Related Work", /^\s*(related work|background|literature review)\s*$/i],
  ["Literature Review", /^\s*(literature review|prior work)\s*$/i],
  ["Methodology", /^\s*(methodology|methods?|approach|model|architecture|proposed method)\s*$/i],
  ["Results", /^\s*(results?|experiments?|evaluation|findings)\s*$/i],
  ["Discussion", /^\s*discussion\s*$/i],
  ["Conclusion", /^\s*(conclusion|conclusions|future work)\s*$/i],
  ["References", /^\s*references?\s*$/i],
];

export function detectSections(fullText: string): { name: string; content: string }[] {
  const lines = fullText.split(/(?<=[.!?\n])\s*|\n/);
  const sections: { name: string; content: string }[] = [];
  let current = "Full Text";
  let buf: string[] = [];
  const push = () => {
    const content = buf.join(" ").trim();
    if (content.length > 20) sections.push({ name: current, content });
    buf = [];
  };
  // heading scan on short lines
  for (const rawLine of fullText.split("\n")) {
    const line = rawLine.trim();
    let matched: string | null = null;
    if (line.length < 60) {
      for (const [name, re] of SECTION_PATTERNS) if (re.test(line)) { matched = name; break; }
    }
    if (matched) { push(); current = matched; }
    else buf.push(rawLine);
  }
  push();
  // Title = first non-empty line; merge tiny sections
  return sections.filter((s) => s.content.length > 0);
}

export function extractTitle(fullText: string, filename: string): string {
  const firstLines = fullText.split("\n").map((l) => l.trim()).filter((l) => l.length > 10);
  const candidate = firstLines[0] || "";
  if (candidate && candidate.length < 250) return candidate;
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}

const STOP = new Set("the,a,an,and,or,of,to,in,on,for,with,using,used,by,from,as,is,are,was,were,be,been,that,this,these,those,it,its,at,into,over,under,between,through,our,we,they,their,paper,study,research,method,model,based,via,new,novel,proposed".split(","));

export function extractKeywords(fullText: string, topK = 15): string[] {
  const freq = new Map<string, number>();
  for (const tok of fullText.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)) {
    if (tok.length < 4 || STOP.has(tok)) continue;
    freq.set(tok, (freq.get(tok) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, topK).map(([w]) => w);
}

export function detectTopics(fullText: string, keywords: string[]): { topic: string; score: number }[] {
  const hay = (fullText + " " + keywords.join(" ")).toLowerCase();
  const candidates: [string, string[]][] = [
    ["Phishing & URL Security", ["phishing", "url", "malicious", "detection", "xgboost", "random forest"]],
    ["Transformers & LLMs", ["transformer", "attention", "llm", "bert", "gpt", "fine-tun"]],
    ["Retrieval-Augmented Generation", ["retrieval", "rag", "embedding", "vector", "rerank"]],
    ["Computer Vision", ["vision", "image", "cnn", "detection", "segmentation", "yolo"]],
    ["Graph Learning", ["graph", "node", "gnn", "citation", "edge"]],
    ["Time Series & Forecasting", ["forecast", "time series", "arima", "lstm"]],
    ["Recommender Systems", ["recommend", "collaborative", "ranking", "recall"]],
    ["Medical AI", ["medical", "clinical", "patient", "diagnos"]],
    ["NLP & Text Classification", ["nlp", "classification", "sentiment", "token"]],
    ["Anomaly Detection", ["anomaly", "outlier", "fraud", "intrusion"]],
  ];
  const scored = candidates.map(([topic, keys]) => {
    let hits = 0;
    for (const k of keys) if (hay.includes(k)) hits++;
    return { topic, score: Math.round((hits / keys.length) * 100) / 100 };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  return scored.length ? scored : [{ topic: "General Machine Learning", score: 0.3 }];
}
