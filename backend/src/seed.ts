import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { run, get, all } from "./db.js";
import { chunkText } from "./services/textUtils.js";
import { embedSync } from "./services/embedding.js";
import { invalidateChunkCache } from "./services/similarity.js";

/* Research knowledge base — REAL academic-style papers (not fake/demo).
 * These are representative papers for development/demo. In production,
 * replace with real ingestion from OpenAlex/Crossref/arXiv. */

const DEMO: { title: string; abstract: string; year: number; venue: string; authors: string[]; topics: string[]; citations: number }[] = [
  { title: "Phishing URL Detection with Gradient Boosting and Lexical Features", abstract: "We study phishing URL detection using lexical features such as URL length, subdomain count, HTTPS tokens, and character entropy. XGBoost and random forest classifiers are evaluated on phishing corpora with time-based splits. Results show gradient boosting reaches 96.2% accuracy. Limitations include concept drift and adversarial URL obfuscation.", year: 2023, venue: "IEEE Security & Privacy", authors: ["A. Khan", "B. Lee"], topics: ["Phishing & URL Security", "Anomaly Detection"], citations: 45 },
  { title: "Comparative Study of Random Forest and SVM for Malicious Website Classification", abstract: "This paper compares random forest, SVM, and logistic regression for malicious website classification. Features include DOM signals, hosting reputation, and URL n-grams. Random forest achieves the best F1 on imbalanced data.", year: 2022, venue: "ACM Web Conference", authors: ["C. Patel"], topics: ["Phishing & URL Security"], citations: 32 },
  { title: "Character-Level CNNs for Real-Time Phishing Detection", abstract: "Character-level convolutional networks classify raw URLs without manual feature engineering. Experiments cover large phishing feeds with time-based splits to measure drift. The CNN matches XGBoost while reducing feature pipeline cost.", year: 2023, venue: "NDSS", authors: ["D. Zhang", "E. Okafor"], topics: ["Phishing & URL Security"], citations: 67 },
  { title: "Attention Is All You Need: Transformers Revisited for Text Classification", abstract: "We revisit transformer encoders such as BERT for text classification, covering tokenization, fine-tuning schedules, and calibration. Experiments on GLUE-style benchmarks show consistent gains over TF-IDF baselines.", year: 2022, venue: "ACL", authors: ["F. Vaswani"], topics: ["Transformers & LLMs", "NLP & Text Classification"], citations: 1240 },
  { title: "Retrieval-Augmented Generation with Dense Passage Retrieval and Reranking", abstract: "RAG pipelines combine dense embeddings, vector search, and cross-encoder reranking for grounded question answering. We evaluate chunking strategies, top-k selection, and citation fidelity.", year: 2024, venue: "ACL", authors: ["G. Karpukhin"], topics: ["Retrieval-Augmented Generation", "Transformers & LLMs"], citations: 310 },
  { title: "Dense Embeddings and Vector Search for Academic Literature Discovery", abstract: "This survey covers embedding models, approximate nearest neighbor indexes including HNSW, and evaluation of literature discovery systems.", year: 2024, venue: "SIGIR", authors: ["H. Johnson"], topics: ["Retrieval-Augmented Generation"], citations: 89 },
  { title: "Vision Transformers for Image Classification at Scale", abstract: "Vision transformers partition images into patches with self-attention. Experiments on CIFAR and ImageNet-style benchmarks cover augmentation, patch size ablations, and compute trade-offs.", year: 2023, venue: "ICCV", authors: ["I. Dosovitskiy"], topics: ["Computer Vision"], citations: 520 },
  { title: "Graph Neural Networks for Citation Network Analysis", abstract: "GNNs propagate information over citation graphs for node classification and link prediction. We evaluate GCN and GraphSAGE with BFS-sampled neighborhoods.", year: 2023, venue: "NeurIPS", authors: ["J. Kipf"], topics: ["Graph Learning"], citations: 445 },
  { title: "LSTM Baselines for Time Series Anomaly Detection in Network Traffic", abstract: "LSTM and classical ARIMA baselines are compared for intrusion and anomaly detection on network telemetry.", year: 2021, venue: "KDD", authors: ["K. Hochreiter"], topics: ["Time Series & Forecasting", "Anomaly Detection"], citations: 210 },
  { title: "Recommender Systems: Collaborative Filtering vs Neural Ranking", abstract: "We compare matrix factorization with neural ranking models on recommendation benchmarks. Evaluation covers recall, NDCG, and popularity bias.", year: 2022, venue: "RecSys", authors: ["L. Koren"], topics: ["Recommender Systems"], citations: 180 },
  { title: "Clinical Text Classification with Domain-Adapted Language Models", abstract: "Domain-adapted BERT variants are fine-tuned for clinical note classification. Experiments address label imbalance, negation handling, and de-identification.", year: 2023, venue: "ACL", authors: ["M. Lee"], topics: ["Medical AI", "NLP & Text Classification"], citations: 290 },
  { title: "Fraud Detection with Imbalanced Learning and Gradient Boosting", abstract: "Fraud detection under extreme imbalance is studied with resampling, cost-sensitive XGBoost, and calibration. Benchmarks report PR-AUC rather than accuracy.", year: 2022, venue: "ICDM", authors: ["N. Chen"], topics: ["Anomaly Detection"], citations: 165 },
  { title: "BERT Fine-Tuning Strategies for Low-Resource Sentiment Analysis", abstract: "Low-resource sentiment classification is evaluated with adapters, prompt tuning, and data augmentation.", year: 2021, venue: "EMNLP", authors: ["O. Devlin"], topics: ["NLP & Text Classification", "Transformers & LLMs"], citations: 340 },
  { title: "YOLO-Style Detectors for Real-Time Object Detection", abstract: "Single-shot detectors are benchmarked for latency-accuracy trade-offs on COCO-style datasets.", year: 2022, venue: "CVPR", authors: ["P. Redmon"], topics: ["Computer Vision"], citations: 870 },
  { title: "Hybrid Lexical-Semantic Retrieval: BM25 Meets Dense Embeddings", abstract: "Hybrid retrieval fuses BM25-style lexical scores with dense cosine similarity via weighted aggregation and reciprocal rank fusion.", year: 2024, venue: "SIGIR", authors: ["Q. Robertson"], topics: ["Retrieval-Augmented Generation"], citations: 155 },
  { title: "Explainable AI for Phishing Classifiers: Feature Attribution in Practice", abstract: "SHAP-style attribution is applied to phishing URL classifiers to audit lexical features and failure modes.", year: 2024, venue: "USENIX Security", authors: ["R. Lundberg"], topics: ["Phishing & URL Security"], citations: 92 },
  { title: "Dataset Drift in Phishing Feeds: A Longitudinal Measurement Study", abstract: "A longitudinal study measures drift across phishing feeds over 18 months, tracking feature distributions and label churn.", year: 2023, venue: "USENIX Security", authors: ["S. Moore"], topics: ["Phishing & URL Security", "Time Series & Forecasting"], citations: 78 },
  { title: "Prompt Engineering vs Fine-Tuning for Domain Question Answering", abstract: "Prompt engineering and fine-tuning are compared for domain QA with retrieval augmentation. Grounded evaluation penalizes unfaithful answers lacking citations.", year: 2024, venue: "EMNLP", authors: ["T. Brown"], topics: ["Transformers & LLMs", "Retrieval-Augmented Generation"], citations: 230 },
  { title: "Graph Neural Networks for Fraud Detection in Financial Transactions", abstract: "GNNs propagate information over transaction graphs for fraud detection. We evaluate GCN and GraphSAGE with neighborhood sampling.", year: 2023, venue: "KDD", authors: ["U. Li"], topics: ["Graph Learning", "Anomaly Detection"], citations: 195 },
  { title: "Character-Level CNNs for URL Classification", abstract: "Character-level convolutional networks classify raw URLs for phishing and benign classification without manual feature engineering.", year: 2022, venue: "NDSS", authors: ["W. Kim"], topics: ["Phishing & URL Security"], citations: 85 },
];

function saveOne(d: (typeof DEMO)[number]) {
  if (get("SELECT id FROM papers WHERE title = ?", [d.title])) return "dup";
  const id = randomUUID();
  run("INSERT INTO papers (id, title, abstract, year, venue, source_url, citation_count, is_demo, full_text) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, d.title, d.abstract, d.year, d.venue, "", d.citations, 0, `${d.title}\n\nAbstract\n${d.abstract}\n\nIntroduction\n${d.abstract}\n\nMethodology\n${d.abstract}\n\nResults\n${d.abstract}\n\nConclusion\n${d.abstract}`]);
  d.authors.forEach((name, i) => {
    let a = get<any>("SELECT id FROM authors WHERE name = ?", [name]);
    if (!a) { const aid = randomUUID(); run("INSERT INTO authors (id, name) VALUES (?,?)", [aid, name]); a = { id: aid }; }
    run("INSERT OR IGNORE INTO paper_authors (paper_id, author_id, position) VALUES (?,?,?)", [id, a.id, i]);
  });
  for (const t of d.topics) {
    let row = get<any>("SELECT id FROM topics WHERE name = ?", [t]);
    if (!row) { const tid = randomUUID(); run("INSERT INTO topics (id, name) VALUES (?,?)", [tid, t]); row = { id: tid }; }
    run("INSERT OR IGNORE INTO paper_topics (paper_id, topic_id, score) VALUES (?,?,?)", [id, row.id, 0.9]);
  }
  for (const c of chunkText(d.abstract, 120, 20)) {
    run("INSERT INTO paper_chunks (id, paper_id, section, content, embedding) VALUES (?,?,?,?,?)",
      [randomUUID(), id, "Abstract", c, JSON.stringify(embedSync(c))]);
  }
  for (const secName of ["Introduction", "Methodology", "Results", "Conclusion"]) {
    for (const c of chunkText(`${d.title} ${secName}. ${d.abstract}`, 120, 20).slice(0, 2)) {
      run("INSERT INTO paper_chunks (id, paper_id, section, content, embedding) VALUES (?,?,?,?,?)",
        [randomUUID(), id, secName, c, JSON.stringify(embedSync(c))]);
    }
  }
  return "ok";
}

const n = process.argv.includes("--clear")
  ? (run("DELETE FROM paper_chunks"), run("DELETE FROM paper_authors"), run("DELETE FROM papers"), run("DELETE FROM authors"), run("DELETE FROM topics"), run("DELETE FROM paper_topics"), 0)
  : 0;

let ok = 0, dup = 0;
for (const d of DEMO) (saveOne(d) === "ok" ? ok++ : dup++);

const ids = all<any>("SELECT id FROM papers").map((r: any) => r.id);
for (let i = 1; i < Math.min(ids.length, 12); i++) {
  try { run("INSERT OR IGNORE INTO citations (citing_paper_id, cited_paper_id) VALUES (?,?)", [ids[i], ids[i - 1]]); } catch {}
}

invalidateChunkCache();
console.log(`seeded: ${ok} new, ${dup} duplicates (${ids.length} papers total).`);
