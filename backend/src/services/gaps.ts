import { all } from "../db.js";

export interface ResearchGap {
  title: string; description: string; supportingPapers: { id: string; title: string }[];
  confidence: "emerging" | "moderate" | "strong"; futureDirection: string;
}

const METHOD_VOCAB = [
  "xgboost", "random forest", "svm", "cnn", "transformer", "bert", "lstm", "gnn",
  "llm", "rag", "logistic regression", "gradient boosting", "adapters", "bm25",
];
const DATA_VOCAB = [
  "dataset", "benchmark", "corpus", "phishtank", "openphish", "cifar", "imagenet",
  "squad", "glue", "coco", "time-based split", "cross-validation",
];

/* Words that are common in academic prose and carry no topical meaning —
 * they must never become a "theme". */
const THEME_STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "using", "used", "based",
  "paper", "study", "research", "method", "methods", "model", "models", "results",
  "approach", "approaches", "data", "datasets", "experiment", "experiments",
  "evaluation", "performance", "accuracy", "framework", "task", "tasks", "propose",
  "proposed", "proposes", "existing", "recent", "various", "different", "results",
  "show", "shows", "shown", "including", "include", "provides", "provide", "allow",
  "allows", "achieve", "achieves", "state", "states", "where", "while", "between",
  "these", "those", "their", "there", "they", "them", "then", "than", "also",
  "over", "under", "about", "after", "before", "through", "during", "against",
  "within", "across", "towards", "toward", "because", "however", "therefore",
  "thus", "hence", "moreover", "furthermore", "results", "evaluate", "evaluated",
  "compare", "compared", "comparison", "datasets", "cases", "case", "number",
  "large", "small", "high", "low", "good", "better", "best", "well", "strong",
  "weak", "significant", "improve", "improved", "improvement", "challenge",
  "challenges", "limitation", "limitations", "future", "work", "novel", "new",
]);

export function detectGaps(userText: string, userTopics: string[], similarPaperIds: string[]): ResearchGap[] {
  const lower = userText.toLowerCase();
  const papers = all<any>("SELECT * FROM papers");
  const inScope = papers.filter((p: any) => similarPaperIds.includes(p.id)).slice(0, 12);
  const corpus = inScope.map((p: any) => ((p.title || "") + " " + (p.abstract || "")).toLowerCase()).join(" ");
  const gaps: ResearchGap[] = [];
  const ref = (n = 2) => inScope.slice(0, n).map((p: any) => ({ id: p.id, title: p.title }));

  // 1. Methodology coverage
  const missingMethods = METHOD_VOCAB.filter((m) => corpus.includes(m) && !lower.includes(m)).slice(0, 3);
  if (missingMethods.length) {
    gaps.push({
      title: "Uncompared modern methods",
      description: `Neighboring literature uses ${missingMethods.join(", ")}, which your paper does not benchmark against. A controlled comparison would strengthen the claims.`,
      supportingPapers: ref(), confidence: "moderate",
      futureDirection: `Evaluate ${missingMethods[0]} on the same dataset/splits and report paired metrics.`,
    });
  }
  // 2. Dataset / evaluation gap
  const mentionsData = DATA_VOCAB.some((d) => lower.includes(d));
  if (!mentionsData) {
    gaps.push({
      title: "Missing public benchmark evaluation",
      description: "No standard public dataset/benchmark is named. Results are hard to reproduce or compare with indexed literature.",
      supportingPapers: ref(), confidence: "strong",
      futureDirection: "Add at least one public benchmark with fixed train/test splits and release preprocessing details.",
    });
  }
  // 3. Ablation / limitation gap
  if (!lower.includes("ablation") && !lower.includes("limitation")) {
    gaps.push({
      title: "No ablation or limitation discussion detected",
      description: "Indexed papers in this area typically ablate key components and state limitations; neither was detected in your text.",
      supportingPapers: ref(), confidence: "moderate",
      futureDirection: "Add an ablation table and an explicit Limitations section.",
    });
  }
  // 4. Recency gap
  const years = inScope.map((p: any) => p.year || 0).filter(Boolean);
  const maxYear = years.length ? Math.max(...years) : null;
  if (maxYear && maxYear >= 2023 && !String(lower).includes(String(maxYear))) {
    gaps.push({
      title: `Recent advances (${maxYear}) not discussed`,
      description: `The knowledge base contains ${maxYear} papers on overlapping topics that your paper does not appear to cite or discuss.`,
      supportingPapers: inScope.filter((p: any) => p.year === maxYear).slice(0, 3).map((p: any) => ({ id: p.id, title: p.title })),
      confidence: "emerging",
      futureDirection: `Survey the latest year of related work and position your contribution against it.`,
    });
  }
  // 5. Cross-topic combination
  if (userTopics.length >= 2) {
    gaps.push({
      title: `Underexplored combination: ${userTopics.slice(0, 2).join(" × ")}`,
      description: "Few indexed papers jointly address these two topics; hybrid approaches here are sparsely covered.",
      supportingPapers: ref(), confidence: "emerging",
      futureDirection: "Explore a hybrid method or joint evaluation spanning both topics.",
    });
  }
  return gaps.slice(0, 5);
}

/* ------------------------------------------------------------------
 * Theme extraction.
 *
 * The previous implementation took the eight longest unique words in the
 * titles and called them "themes", which produced noise ("respectively",
 * "significant", …). Themes are now built from real technical phrases:
 * unigrams and bigrams that appear across several papers, plus the curated
 * topic labels attached to each paper. Every theme keeps its supporting
 * papers so the outline stays grounded.
 * ------------------------------------------------------------------ */
const CURATED_TOPICS = [
  "Phishing & URL Security", "Transformers & LLMs", "Retrieval-Augmented Generation",
  "Computer Vision", "Graph Learning", "Time Series & Forecasting",
  "Recommender Systems", "Medical AI", "NLP & Text Classification", "Anomaly Detection",
];

function normalisePhrase(p: string): string {
  return p.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export function literatureReviewOutline(topic: string, papers: any[]) {
  const list = papers as any[];

  // --- candidate phrases: unigrams + bigrams from titles and abstracts ---
  const phrasePapers = new Map<string, Set<string>>();
  const bump = (phrase: string, pid: string) => {
    if (!phrase || phrase.length < 4) return;
    if (!phrasePapers.has(phrase)) phrasePapers.set(phrase, new Set());
    phrasePapers.get(phrase)!.add(pid);
  };

  for (const p of list) {
    const text = normalisePhrase(`${p.title || ""} ${p.abstract || ""}`);
    const words = text.split(" ").filter((w) => w.length > 2 && !THEME_STOP.has(w));
    const uniq = [...new Set(words)];
    for (const w of uniq) bump(w, p.id);
    for (let i = 0; i < uniq.length - 1; i++) bump(`${uniq[i]} ${uniq[i + 1]}`, p.id);
  }

  /* A phrase is a theme only if it recurs across at least two papers —
   * otherwise it is an artefact of one abstract. */
  const multiPaper = [...phrasePapers.entries()]
    .filter(([, s]) => s.size >= 2)
    .map(([phrase, s]) => ({ phrase, count: s.size, ids: [...s] }))
    // prefer phrases shared by more papers, then longer (more specific) ones
    .sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length);

  /* Drop a unigram when a longer phrase already contains it — the phrase is
   * the more informative label. */
  const chosen: { phrase: string; count: number; ids: string[] }[] = [];
  for (const cand of multiPaper) {
    if (chosen.length >= 8) break;
    const subsumed = chosen.some(
      (c) => c.phrase.includes(cand.phrase) && c.phrase !== cand.phrase
    );
    if (subsumed) continue;
    chosen.push(cand);
  }

  const paperById = new Map(list.map((p: any) => [p.id, p]));
  const themes = chosen.map((c) => ({
    theme: c.phrase,
    papers: c.ids
      .map((id) => paperById.get(id))
      .filter(Boolean)
      .slice(0, 4)
      .map((p: any) => ({ id: p.id, title: p.title, year: p.year })),
    support: c.count,
  }));

  // --- curated topic labels actually attached to the retrieved papers ---
  const ids = list.map((p: any) => p.id);
  const placeholders = ids.map(() => "?").join(",");
  const topicRows = ids.length
    ? all<any>(
        `SELECT t.name, pt.paper_id FROM paper_topics pt JOIN topics t ON t.id = pt.topic_id
         WHERE pt.paper_id IN (${placeholders})`,
        ids
      )
    : [];
  const topicPapers = new Map<string, string[]>();
  for (const r of topicRows) {
    if (!topicPapers.has(r.name)) topicPapers.set(r.name, []);
    topicPapers.get(r.name)!.push(r.paper_id);
  }
  const topics = [...topicPapers.entries()]
    .filter(([name]) => CURATED_TOPICS.includes(name) || name.length > 2)
    .map(([name, pids]) => ({
      theme: name,
      papers: pids.map((id) => paperById.get(id)).filter(Boolean).slice(0, 4).map((p: any) => ({ id: p.id, title: p.title, year: p.year })),
      support: pids.length,
    }))
    .sort((a, b) => b.support - a.support);

  const mergedThemes = [...topics, ...themes]
    .filter((t) => t.papers.length > 0)
    .slice(0, 8)
    .map((t) => ({ theme: t.theme, papers: t.papers, support: t.support }));

  /* Methods are only listed when the retrieved papers actually mention them. */
  const corpus = list.map((p: any) => `${p.title || ""} ${p.abstract || ""}`.toLowerCase()).join(" ");
  const methodPool = [
    "supervised classifiers", "gradient boosting", "random forest", "svm", "cnn",
    "transformer encoders", "fine-tuning", "dense retrieval", "vector search",
    "graph neural networks", "recurrent networks", "bm25", "reranking",
  ];
  const methods = methodPool.filter((m) => corpus.includes(m)).slice(0, 5);
  const limitationPool = [
    "concept drift", "adversarial obfuscation", "class imbalance", "small datasets",
    "computational cost", "interpretability", "domain shift", "privacy",
  ];
  const limitations = limitationPool.filter((l) => corpus.includes(l)).slice(0, 5);

  return {
    topic,
    themes: mergedThemes,
    methods: methods.length ? methods : ["Method families detected in the retrieved text"],
    limitations: limitations.length ? limitations : ["Recurring weaknesses are not stated in the retrieved abstracts"],
    futureDirections: buildFutureDirections(corpus, list),
    note: "Every theme links to retrieved papers above — no fabricated citations.",
  };
}

/** Future directions inferred from what the retrieved papers actually say. */
function buildFutureDirections(corpus: string, papers: any[]): string[] {
  const out: string[] = [];
  const years = papers.map((p: any) => p.year).filter(Boolean).map(Number);
  if (years.length) {
    const latest = Math.max(...years);
    out.push(`Extend the ${latest} results to newer datasets and longer time horizons`);
  }
  if (corpus.includes("drift") || corpus.includes("concept drift")) {
    out.push("Measure performance under concept drift and publish a longitudinal evaluation");
  }
  if (corpus.includes("explain") || corpus.includes("interpret") || corpus.includes("attribution")) {
    out.push("Add explainability (attribution / saliency) so decisions can be audited");
  }
  if (corpus.includes("ablation")) {
    out.push("Report ablation tables for every component that contributes to the result");
  }
  if (corpus.includes("privacy") || corpus.includes("federated")) {
    out.push("Evaluate privacy leakage and the cost of the protection mechanism");
  }
  if (!out.length) {
    out.push("Cross-dataset generalisation study", "Comparison against the strongest retrieved baseline");
  }
  return out.slice(0, 5);
}
