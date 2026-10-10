import { splitSentences, tokenize } from "./textUtils.js";

export interface AIFinding {
  score: number; // 0..100 signal strength
  level: "LOW SIGNAL" | "MODERATE SIGNAL" | "HIGH SIGNAL";
  reasons: string[];
  flaggedSections: { section: string; excerpt: string; contribution: string }[];
  disclaimer: string;
}

const TRANSITIONS = ["moreover", "furthermore", "additionally", "in conclusion", "in summary", "delve", "tapestry", "landscape", "furthermore,", "moreover,", "it is important to note", "in today's", "rapidly evolving"];

export function analyzeAIWriting(fullText: string, sections: { name: string; content: string }[]): AIFinding {
  const sentences = splitSentences(fullText);
  const reasons: string[] = [];
  let points = 0;

  // 1. Sentence-length uniformity (low burstiness → more signal)
  const lens = sentences.map((s) => s.split(" ").length).filter((n) => n > 2);
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (lens.length || 1);
  const cv = mean ? Math.sqrt(variance) / mean : 1;
  if (lens.length > 8 && cv < 0.35) { points += 22; reasons.push(`Low sentence-length variation (CV ${cv.toFixed(2)}): sentences are unusually uniform, a common AI-writing signal.`); }
  else if (cv < 0.55) { points += 10; reasons.push(`Moderately uniform sentence lengths (CV ${cv.toFixed(2)}).`); }

  // 2. Vocabulary diversity (low type-token ratio → signal)
  const toks = tokenize(fullText);
  const ttr = toks.length ? new Set(toks).size / toks.length : 1;
  if (toks.length > 100 && ttr < 0.32) { points += 18; reasons.push(`Low vocabulary diversity (type-token ratio ${ttr.toFixed(2)}): repetitious word choice.`); }

  // 3. Repetitive transitions / generic phrasing
  const lower = fullText.toLowerCase();
  let transHits = 0;
  for (const t of TRANSITIONS) { const c = lower.split(t).length - 1; if (c > 0) transHits += c; }
  const transRate = toks.length ? (transHits / toks.length) * 1000 : 0;
  if (transRate > 2.5) { points += 16; reasons.push(`Frequent generic transitions (${transHits} occurrences): repetitive connective phrasing.`); }
  else if (transRate > 1) { points += 7; reasons.push(`Some generic transitional phrasing detected (${transHits} occurrences).`); }

  // 4. Phrase repetition (3-grams repeated)
  const trigrams = new Map<string, number>();
  for (let i = 0; i < toks.length - 2; i++) {
    const k = toks[i] + " " + toks[i + 1] + " " + toks[i + 2];
    trigrams.set(k, (trigrams.get(k) || 0) + 1);
  }
  const repeated = [...trigrams.values()].filter((v) => v >= 3).length;
  if (repeated > 6) { points += 14; reasons.push(`Repeated 3-word phrases (${repeated} distinct phrases appear 3+ times): formulaic structure.`); }

  // 5. Section-level stylistic anomaly: sections with near-identical avg sentence length
  const secAvgs = sections.map((s) => {
    const ss = splitSentences(s.content);
    const ll = ss.map((x) => x.split(" ").length);
    return ll.length ? ll.reduce((a, b) => a + b, 0) / ll.length : 0;
  }).filter((v) => v > 0);
  if (secAvgs.length >= 3) {
    const m = secAvgs.reduce((a, b) => a + b, 0) / secAvgs.length;
    const v = secAvgs.reduce((a, b) => a + (b - m) ** 2, 0) / secAvgs.length;
    if (Math.sqrt(v) < 3) { points += 12; reasons.push("Sections show unusually consistent average sentence length (structural regularity)."); }
  }

  // 6. Hedging/generic density (weak signal either way, small weight)
  const generic = ["cutting-edge", "state-of-the-art", "game-changer", "revolutionize", "unlock", "embark", "crucial", "vital", "moreover", "overall,"];
  const gHits = generic.reduce((s, g) => s + (lower.split(g).length - 1), 0);
  if (gHits > 8) { points += 8; reasons.push(`Elevated generic/marketing phrasing (${gHits} hits).`); }

  const score = Math.min(95, points);
  const level = score >= 55 ? "HIGH SIGNAL" : score >= 28 ? "MODERATE SIGNAL" : "LOW SIGNAL";

  // Flag top contributing sections (longest, most uniform)
  const flaggedSections = sections
    .map((s) => ({ section: s.name, excerpt: s.content.slice(0, 220) + "…", contribution: "Included in stylistic uniformity analysis." }))
    .slice(0, 3);

  if (!reasons.length) reasons.push("No strong statistical signals of formulaic writing detected; varied sentence rhythm and vocabulary.");

  return {
    score, level, reasons, flaggedSections,
    disclaimer: "AI-writing detection is probabilistic and can produce false positives and false negatives. This result should not be treated as proof of authorship.",
  };
}
