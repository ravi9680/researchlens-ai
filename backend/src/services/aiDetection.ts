import { splitSentences, tokenize } from "./textUtils.js";

export interface AIFinding {
  score: number; // 0..100 signal strength
  level: "LOW SIGNAL" | "MODERATE SIGNAL" | "HIGH SIGNAL";
  reasons: string[];
  flaggedSections: { section: string; excerpt: string; contribution: string }[];
  disclaimer: string;
  metrics?: {
    sentenceLengthCv: number;
    typeTokenRatio: number;
    transitionsPer1k: number;
    repeatedTrigrams: number;
    sectionRegularity: number;
  };
}

const TRANSITIONS = [
  "moreover", "furthermore", "additionally", "in conclusion", "in summary", "delve",
  "tapestry", "landscape", "furthermore,", "moreover,", "it is important to note",
  "in today's", "rapidly evolving",
];

const GENERIC = [
  "cutting-edge", "state-of-the-art", "game-changer", "revolutionize", "unlock",
  "embark", "crucial", "vital", "moreover", "overall,",
];

/** Coefficient of variation of a list of sentence lengths — the burstiness
 *  measure. Low CV means machine-like uniformity of rhythm. */
function cv(values: number[]): number {
  if (!values.length) return 1;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (!mean) return 1;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** Count how often a needle appears in a haystack (case-insensitive). */
function countOf(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0, idx = hay.indexOf(needle);
  while (idx !== -1) { n++; idx = hay.indexOf(needle, idx + needle.length); }
  return n;
}

/* ------------------------------------------------------------------
 * Per-section signal profiling.
 *
 * The previous version flagged "the first three sections" with a hard-coded
 * contribution string, which told the reader nothing about *why* a section
 * was suspicious. Each section is now profiled on the same four features
 * used for the document-level score, so the flagged list is genuinely the
 * most uniform / most repetitive parts of the paper.
 * ------------------------------------------------------------------ */
interface SectionProfile {
  name: string;
  excerpt: string;
  cv: number;
  ttr: number;
  transitionsPer1k: number;
  repeatedTrigrams: number;
  contribution: number;
  notes: string[];
}

function profileSection(name: string, content: string): SectionProfile {
  const lower = content.toLowerCase();
  const sentences = splitSentences(content);
  const lengths = sentences.map((s) => s.split(" ").length).filter((n) => n > 2);
  const c = cv(lengths);

  const toks = tokenize(content);
  const ttr = toks.length ? new Set(toks).size / toks.length : 1;

  let transHits = 0;
  for (const t of TRANSITIONS) transHits += countOf(lower, t);
  const transitionsPer1k = toks.length ? (transHits / toks.length) * 1000 : 0;

  const tri = new Map<string, number>();
  for (let i = 0; i < toks.length - 2; i++) {
    const k = `${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`;
    tri.set(k, (tri.get(k) || 0) + 1);
  }
  const repeatedTrigrams = [...tri.values()].filter((v) => v >= 3).length;

  const notes: string[] = [];
  let contribution = 0;
  if (c < 0.35 && lengths.length > 4) {
    contribution += 30;
    notes.push(`near-uniform sentence rhythm (CV ${c.toFixed(2)})`);
  } else if (c < 0.55 && lengths.length > 4) {
    contribution += 14;
    notes.push(`somewhat uniform sentence rhythm (CV ${c.toFixed(2)})`);
  }
  if (toks.length > 40 && ttr < 0.34) {
    contribution += 22;
    notes.push(`low vocabulary diversity (TTR ${ttr.toFixed(2)})`);
  }
  if (transitionsPer1k > 2.5) {
    contribution += 18;
    notes.push(`dense generic transitions (${transitionsPer1k.toFixed(1)} per 1k words)`);
  }
  if (repeatedTrigrams > 4) {
    contribution += 16;
    notes.push(`${repeatedTrigrams} repeated 3-word phrases`);
  }

  return {
    name,
    excerpt: content.slice(0, 220) + "…",
    cv: c, ttr, transitionsPer1k, repeatedTrigrams,
    contribution: Math.min(100, contribution),
    notes,
  };
}

export function analyzeAIWriting(fullText: string, sections: { name: string; content: string }[]): AIFinding {
  const sentences = splitSentences(fullText);
  const reasons: string[] = [];
  let points = 0;

  // 1. Sentence-length uniformity (low burstiness → more signal)
  const lens = sentences.map((s) => s.split(" ").length).filter((n) => n > 2);
  const cvDoc = cv(lens);
  if (lens.length > 8 && cvDoc < 0.35) {
    points += 22;
    reasons.push(`Low sentence-length variation (CV ${cvDoc.toFixed(2)}): sentences are unusually uniform, a common AI-writing signal.`);
  } else if (cvDoc < 0.55) {
    points += 10;
    reasons.push(`Moderately uniform sentence lengths (CV ${cvDoc.toFixed(2)}).`);
  }

  // 2. Vocabulary diversity (low type-token ratio → signal)
  const toks = tokenize(fullText);
  const ttr = toks.length ? new Set(toks).size / toks.length : 1;
  if (toks.length > 100 && ttr < 0.32) {
    points += 18;
    reasons.push(`Low vocabulary diversity (type-token ratio ${ttr.toFixed(2)}): repetitious word choice.`);
  }

  // 3. Repetitive transitions / generic phrasing
  const lower = fullText.toLowerCase();
  let transHits = 0;
  for (const t of TRANSITIONS) transHits += countOf(lower, t);
  const transRate = toks.length ? (transHits / toks.length) * 1000 : 0;
  if (transRate > 2.5) {
    points += 16;
    reasons.push(`Frequent generic transitions (${transHits} occurrences): repetitive connective phrasing.`);
  } else if (transRate > 1) {
    points += 7;
    reasons.push(`Some generic transitional phrasing detected (${transHits} occurrences).`);
  }

  // 4. Phrase repetition (3-grams repeated)
  const trigrams = new Map<string, number>();
  for (let i = 0; i < toks.length - 2; i++) {
    const k = `${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`;
    trigrams.set(k, (trigrams.get(k) || 0) + 1);
  }
  const repeated = [...trigrams.values()].filter((v) => v >= 3).length;
  if (repeated > 6) {
    points += 14;
    reasons.push(`Repeated 3-word phrases (${repeated} distinct phrases appear 3+ times): formulaic structure.`);
  }

  // 5. Section-level stylistic anomaly: sections with near-identical avg sentence length
  const secAvgs = sections.map((s) => {
    const ss = splitSentences(s.content);
    const ll = ss.map((x) => x.split(" ").length);
    return ll.length ? ll.reduce((a, b) => a + b, 0) / ll.length : 0;
  }).filter((v) => v > 0);
  let sectionRegularity = 1;
  if (secAvgs.length >= 3) {
    const m = secAvgs.reduce((a, b) => a + b, 0) / secAvgs.length;
    const v = secAvgs.reduce((a, b) => a + (b - m) ** 2, 0) / secAvgs.length;
    sectionRegularity = Math.sqrt(v);
    if (sectionRegularity < 3) {
      points += 12;
      reasons.push("Sections show unusually consistent average sentence length (structural regularity).");
    }
  }

  // 6. Hedging/generic density (weak signal either way, small weight)
  const gHits = GENERIC.reduce((s, g) => s + countOf(lower, g), 0);
  if (gHits > 8) {
    points += 8;
    reasons.push(`Elevated generic/marketing phrasing (${gHits} hits).`);
  }

  const score = Math.min(95, points);
  const level = score >= 55 ? "HIGH SIGNAL" : score >= 28 ? "MODERATE SIGNAL" : "LOW SIGNAL";

  /* Flag the sections that actually drove the signal — ranked by their own
   * measured contribution, not by position in the document. */
  const profiles = sections
    .filter((s) => s.content.trim().length > 80)
    .map((s) => profileSection(s.name, s.content))
    .filter((p) => p.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  const flaggedSections = profiles.map((p) => ({
    section: p.name,
    excerpt: p.excerpt,
    contribution: p.notes.length
      ? `Contributed to the signal: ${p.notes.join("; ")}.`
      : "Mild stylistic uniformity.",
  }));

  if (!reasons.length) {
    reasons.push("No strong statistical signals of formulaic writing detected; varied sentence rhythm and vocabulary.");
  }

  return {
    score, level, reasons, flaggedSections,
    metrics: {
      sentenceLengthCv: Number(cvDoc.toFixed(3)),
      typeTokenRatio: Number(ttr.toFixed(3)),
      transitionsPer1k: Number(transRate.toFixed(2)),
      repeatedTrigrams: repeated,
      sectionRegularity: Number(sectionRegularity.toFixed(2)),
    },
    disclaimer:
      "AI-writing detection is probabilistic and can produce false positives and false negatives. This result should not be treated as proof of authorship.",
  };
}
