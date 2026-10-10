import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { run, get, all } from "./db.js";
import { chunkText } from "./services/textUtils.js";
import { embedSync } from "./services/embedding.js";
import { invalidateChunkCache } from "./services/similarity.js";

/* Synthetic DEMO knowledge base — clearly labeled, never real citations.
 * Real papers come from Admin → Start ingestion (OpenAlex/Crossref). */

const DEMO: { title: string; abstract: string; year: number; venue: string; authors: string[]; topics: string[]; citations: number }[] = [
  { title: "Phishing URL Detection with Gradient Boosting and Lexical Features", abstract: "We study phishing URL detection using lexical features such as URL length, subdomain count, HTTPS tokens, and character entropy. XGBoost and random forest classifiers are evaluated on PhiUSIIL-style phishing corpora with TF-IDF and handcrafted features. Results show gradient boosting reaches 96.2% accuracy with strong precision-recall trade-offs. Limitations include concept drift and adversarial URL obfuscation. Future work explores real-time deployment and cross-dataset generalization.", year: 2023, venue: "Demo Security Symposium (synthetic)", authors: ["A. Demo-Khan", "B. Demo-Lee"], topics: ["Phishing & URL Security", "Anomaly Detection"], citations: 0 },
  { title: "Comparative Study of Random Forest and SVM for Malicious Website Classification", abstract: "This paper compares random forest, SVM, and logistic regression for malicious website classification. Features include DOM signals, hosting reputation, and URL n-grams. Random forest achieves the best F1 on imbalanced data. The study discusses dataset bias, missing ablations on feature groups, and evaluation methodology. Benchmarks on OpenPhish-like feeds are reported.", year: 2022, venue: "Demo Web Safety Workshop (synthetic)", authors: ["C. Demo-Patel"], topics: ["Phishing & URL Security"], citations: 0 },
  { title: "Character-Level CNNs for Real-Time Phishing Detection", abstract: "Character-level convolutional networks classify raw URLs without manual feature engineering. Experiments cover large phishing feeds with time-based splits to measure drift. The CNN matches XGBoost while reducing feature pipeline cost. Limitations: adversarial homoglyphs and short-URL services remain challenging.", year: 2023, venue: "Demo ML Security (synthetic)", authors: ["D. Demo-Zhang", "E. Demo-Okafor"], topics: ["Phishing & URL Security"], citations: 0 },
  { title: "Attention Is All You Need: Transformers Revisited for Text Classification", abstract: "We revisit transformer encoders such as BERT for text classification, covering tokenization, fine-tuning schedules, and calibration. Experiments on GLUE-style benchmarks show consistent gains over TF-IDF baselines. We discuss compute cost, data efficiency, and evaluation pitfalls.", year: 2022, venue: "Demo NLP Review (synthetic)", authors: ["F. Demo-Vaswani"], topics: ["Transformers & LLMs", "NLP & Text Classification"], citations: 0 },
  { title: "Retrieval-Augmented Generation with Dense Passage Retrieval and Reranking", abstract: "RAG pipelines combine dense embeddings, vector search, and cross-encoder reranking for grounded question answering. We evaluate chunking strategies, top-k selection, and citation fidelity. Results favor hybrid lexical-dense retrieval with reranking. Open challenges include stale indexes and insufficient-evidence abstention.", year: 2024, venue: "Demo RAG Summit (synthetic)", authors: ["G. Demo-Karpukhin"], topics: ["Retrieval-Augmented Generation", "Transformers & LLMs"], citations: 0 },
  { title: "Dense Embeddings and Vector Search for Academic Literature Discovery", abstract: "This survey covers embedding models, approximate nearest neighbor indexes including HNSW, and evaluation of literature discovery systems. We compare pgvector, FAISS-style indexes, and reranking cascades. Findings emphasize recall-oriented candidate generation followed by precise reranking.", year: 2024, venue: "Demo IR Survey (synthetic)", authors: ["H. Demo-Johnson"], topics: ["Retrieval-Augmented Generation"], citations: 0 },
  { title: "Vision Transformers for Image Classification at Scale", abstract: "Vision transformers partition images into patches with self-attention. Experiments on CIFAR and ImageNet-style benchmarks cover augmentation, patch size ablations, and compute trade-offs. Limitations include data hunger and positional encoding sensitivity.", year: 2023, venue: "Demo Vision Conf (synthetic)", authors: ["I. Demo-Dosovitskiy"], topics: ["Computer Vision"], citations: 0 },
  { title: "Graph Neural Networks for Citation Network Analysis", abstract: "GNNs propagate information over citation graphs for node classification and link prediction. We evaluate GCN and GraphSAGE with BFS-sampled neighborhoods, connected-component analysis, and PageRank features. Results show graph structure complements text embeddings.", year: 2023, venue: "Demo Graph Learning (synthetic)", authors: ["J. Demo-Kipf"], topics: ["Graph Learning"], citations: 0 },
  { title: "LSTM Baselines for Time Series Anomaly Detection in Network Traffic", abstract: "LSTM and classical ARIMA baselines are compared for intrusion and anomaly detection on network telemetry. Metrics include precision at fixed recall and detection latency. The study highlights threshold tuning and seasonal effects as key limitations.", year: 2021, venue: "Demo Time Series Workshop (synthetic)", authors: ["K. Demo-Hochreiter"], topics: ["Time Series & Forecasting", "Anomaly Detection"], citations: 0 },
  { title: "Recommender Systems: Collaborative Filtering vs Neural Ranking", abstract: "We compare matrix factorization with neural ranking models on recommendation benchmarks. Evaluation covers recall, NDCG, and popularity bias. Limitations include offline-online gaps and cold-start handling.", year: 2022, venue: "Demo RecSys (synthetic)", authors: ["L. Demo-Koren"], topics: ["Recommender Systems"], citations: 0 },
  { title: "Clinical Text Classification with Domain-Adapted Language Models", abstract: "Domain-adapted BERT variants are fine-tuned for clinical note classification. Experiments address label imbalance, negation handling, and de-identification. Ethical limitations and evaluation on private cohorts are discussed.", year: 2023, venue: "Demo Medical AI (synthetic)", authors: ["M. Demo-Lee"], topics: ["Medical AI", "NLP & Text Classification"], citations: 0 },
  { title: "Fraud Detection with Imbalanced Learning and Gradient Boosting", abstract: "Fraud detection under extreme imbalance is studied with resampling, cost-sensitive XGBoost, and calibration. Benchmarks report PR-AUC rather than accuracy. Future work includes graph features and real-time scoring.", year: 2022, venue: "Demo Fraud Analytics (synthetic)", authors: ["N. Demo-Chen"], topics: ["Anomaly Detection"], citations: 0 },
  { title: "BERT Fine-Tuning Strategies for Low-Resource Sentiment Analysis", abstract: "Low-resource sentiment classification is evaluated with adapters, prompt tuning, and data augmentation. Results show parameter-efficient methods rival full fine-tuning. Limitations include language coverage and annotation noise.", year: 2021, venue: "Demo NLP Low-Resource (synthetic)", authors: ["O. Demo-Devlin"], topics: ["NLP & Text Classification", "Transformers & LLMs"], citations: 0 },
  { title: "YOLO-Style Detectors for Real-Time Object Detection", abstract: "Single-shot detectors are benchmarked for latency-accuracy trade-offs on COCO-style datasets. Ablations cover backbones, NMS thresholds, and augmentation. Deployment constraints on edge devices are analyzed.", year: 2022, venue: "Demo Vision Real-Time (synthetic)", authors: ["P. Demo-Redmon"], topics: ["Computer Vision"], citations: 0 },
  { title: "Hybrid Lexical-Semantic Retrieval: BM25 Meets Dense Embeddings", abstract: "Hybrid retrieval fuses BM25-style lexical scores with dense cosine similarity via weighted aggregation and reciprocal rank fusion. Experiments show hybrids beat either signal alone on academic search tasks. The paper details score normalization and top-k selection with heap-based ranking.", year: 2024, venue: "Demo Hybrid Search (synthetic)", authors: ["Q. Demo-Robertson"], topics: ["Retrieval-Augmented Generation"], citations: 0 },
  { title: "Explainable AI for Phishing Classifiers: Feature Attribution in Practice", abstract: "SHAP-style attribution is applied to phishing URL classifiers to audit lexical features and failure modes. Case studies reveal over-reliance on URL length and registrar tokens. Recommendations cover monitoring and adversarial review.", year: 2024, venue: "Demo Explainable Security (synthetic)", authors: ["R. Demo-Lundberg"], topics: ["Phishing & URL Security"], citations: 0 },
  { title: "Dataset Drift in Phishing Feeds: A Longitudinal Measurement Study", abstract: "A longitudinal study measures drift across phishing feeds over 18 months, tracking feature distributions and label churn. Time-based evaluation reduces optimistic bias versus random splits. Guidance is given for refresh cadences and monitoring.", year: 2023, venue: "Demo Measurement (synthetic)", authors: ["S. Demo-Moore"], topics: ["Phishing & URL Security", "Time Series & Forecasting"], citations: 0 },
  { title: "Prompt Engineering vs Fine-Tuning for Domain Question Answering", abstract: "Prompt engineering and fine-tuning are compared for domain QA with retrieval augmentation. Grounded evaluation penalizes unfaithful answers lacking citations. Findings favor retrieval-first pipelines with abstention on insufficient evidence.", year: 2024, venue: "Demo LLM Evaluation (synthetic)", authors: ["T. Demo-Brown"], topics: ["Transformers & LLMs", "Retrieval-Augmented Generation"], citations: 0 },
];

function saveOne(d: (typeof DEMO)[number]) {
  if (get("SELECT id FROM papers WHERE title = ?", [d.title])) return "dup";
  const id = randomUUID();
  run("INSERT INTO papers (id, title, abstract, year, venue, source_url, citation_count, is_demo, full_text) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, d.title, d.abstract, d.year, d.venue, "", d.citations, 1, `${d.title}\n\nAbstract\n${d.abstract}\n\nIntroduction\n${d.abstract}\n\nMethodology\n${d.abstract}\n\nResults\n${d.abstract}\n\nConclusion\n${d.abstract}`]);
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
  for (const sec of chunkText(d.abstract, 120, 20)) {
    run("INSERT INTO paper_chunks (id, paper_id, section, content, embedding) VALUES (?,?,?,?,?)",
      [randomUUID(), id, "Abstract", sec, JSON.stringify(embedSync(sec))]);
  }
  // full-text section chunks so passage-level + section-level matching has depth
  for (const secName of ["Introduction", "Methodology", "Results", "Conclusion"]) {
    for (const sec of chunkText(`${d.title} ${secName}. ${d.abstract}`, 120, 20).slice(0, 2)) {
      run("INSERT INTO paper_chunks (id, paper_id, section, content, embedding) VALUES (?,?,?,?,?)",
        [randomUUID(), id, secName, sec, JSON.stringify(embedSync(sec))]);
    }
  }
  return "ok";
}

const n = process.argv.includes("--clear")
  ? (run("DELETE FROM paper_chunks"), run("DELETE FROM paper_authors"), run("DELETE FROM papers"), run("DELETE FROM authors"), run("DELETE FROM topics"), run("DELETE FROM paper_topics"), 0)
  : 0;

let ok = 0, dup = 0;
for (const d of DEMO) (saveOne(d) === "ok" ? ok++ : dup++);

// small citation chain among demo papers (synthetic relationships)
const ids = all<any>("SELECT id FROM papers").map((r: any) => r.id);
for (let i = 1; i < Math.min(ids.length, 12); i++) {
  try { run("INSERT OR IGNORE INTO citations (citing_paper_id, cited_paper_id) VALUES (?,?)", [ids[i], ids[i - 1]]); } catch {}
}

// sample upload file
const sampleDir = new URL("../seed/samples/", import.meta.url);
fs.mkdirSync(sampleDir, { recursive: true });
fs.writeFileSync(new URL("../seed/samples/sample-paper.txt", import.meta.url),
`Phishing URL Detection with Machine Learning: An Evaluation Study

Abstract
This paper studies phishing URL detection using lexical features and gradient boosting. We evaluate XGBoost and random forest classifiers on phishing corpora with TF-IDF features, URL length, subdomain statistics, and HTTPS signals. Experiments use time-based splits to account for concept drift. Results indicate strong precision-recall trade-offs, with limitations around adversarial obfuscation and short-URL services.

Introduction
Phishing remains a major threat. Prior work explores blacklists, heuristics, and machine learning. Our contribution is a controlled comparison with careful evaluation methodology.

Related Work
Prior research covers SVM baselines, character-level CNNs, and longitudinal drift measurement.

Methodology
We extract lexical URL features and train XGBoost with cross-validation. Evaluation reports accuracy, precision, recall, F1, and PR-AUC.

Results
Gradient boosting achieves 96.1% accuracy in our local split. Ablations show subdomain features contribute most.

Discussion
Results align with existing literature on lexical baselines. Limitations include private data splits and missing real-time latency analysis.

Conclusion
Lexical gradient boosting remains a strong baseline; future work should test cross-dataset generalization and hybrid lexical-semantic retrieval.
`);

import { buildIdf } from "./services/embedding.js";

buildIdf();
for (const r of all<any>("SELECT id, content FROM paper_chunks")) {
  run("UPDATE paper_chunks SET embedding = ? WHERE id = ?", [JSON.stringify(embedSync(r.content)), r.id]);
}
invalidateChunkCache();
console.log(`seeded: ${ok} new, ${dup} duplicates (${ids.length} papers total). Sample: backend/seed/samples/sample-paper.txt`);
