import { randomUUID } from "node:crypto";
import { run, get, all } from "./db.js";
import { chunkText } from "./services/textUtils.js";
import { embedSync } from "./services/embedding.js";
import { invalidateChunkCache } from "./services/similarity.js";

/* Research knowledge base — a curated set of papers with representative
 * abstracts, used to make the demo self-contained.
 *
 * HONESTY NOTE: these rows are *demo records*. The titles point at real,
 * well-known papers, but the abstracts, venue strings and citation counts
 * shipped here are written for the demo and are not the publishers' metadata.
 * Every row therefore carries `is_demo = 1`, and every UI surface badges it
 * as DEMO so it can never be mistaken for a verified citation.
 *
 * Real, verifiable metadata arrives through ingestion (OpenAlex), which
 * stores the source DOI/URL alongside the paper. */

const DEMO: {
  title: string; abstract: string; year: number; venue: string;
  authors: string[]; topics: string[]; citations: number; cites?: number[];
}[] = [
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
  { title: "Self-Supervised Pretraining for Low-Label Detection Tasks", abstract: "Masked and contrastive pretraining reduce the labelled data needed for anomaly and intrusion detection. Experiments span four benchmark datasets and three label budgets.", year: 2024, venue: "ICLR", authors: ["V. Chen", "A. Rao"], topics: ["Transformers & LLMs", "Anomaly Detection"], citations: 140 },
  { title: "Efficient Retrieval for Large Language Model Grounding", abstract: "We study chunk-size selection, index compression and reranking depth for retrieval-augmented generation, and report the accuracy/latency trade-off on long-document QA.", year: 2024, venue: "EMNLP", authors: ["S. Patel"], topics: ["Retrieval-Augmented Generation"], citations: 118 },
  { title: "Fairness Audits in Machine Learning Pipelines", abstract: "A practical audit pipeline measures subgroup disparity across stages of an ML pipeline, from label collection to post-deployment monitoring.", year: 2023, venue: "FAccT", authors: ["J. Mbatha"], topics: ["Anomaly Detection", "Medical AI"], citations: 96 },
  { title: "Contrastive Learning for Time Series Forecasting", abstract: "Contrastive objectives are applied to univariate and multivariate forecasting, improving robustness to distribution shift in sensor streams.", year: 2023, venue: "NeurIPS", authors: ["Y. Zhou"], topics: ["Time Series & Forecasting"], citations: 210 },
  { title: "Citation Graph Embeddings for Research Recommendation", abstract: "Graph embeddings over citation networks support related-work recommendation and trend discovery. Evaluation uses recall@k and nDCG against a citation baseline.", year: 2022, venue: "JCDL", authors: ["K. Ito"], topics: ["Graph Learning", "Recommender Systems"], citations: 74 },
  { title: "Adversarial Attacks on Phishing Defenders", abstract: "We craft adversarial URL manipulations that evade lexical and character-level detectors, and evaluate adversarial training as a defence.", year: 2024, venue: "IEEE S&P", authors: ["H. Osei"], topics: ["Phishing & URL Security", "Anomaly Detection"], citations: 61 },
  { title: "Calibration of Probabilistic Classifiers under Label Shift", abstract: "Post-hoc recalibration methods are compared under label shift, with a focus on the reliability of confidence scores in security deployments.", year: 2023, venue: "AISTATS", authors: ["P. Nair"], topics: ["Anomaly Detection"], citations: 88 },
  { title: "Vector Database Indexing Techniques for Semantic Search", abstract: "Flat, IVF and HNSW indexes are benchmarked for recall/latency on embedding corpora, and their memory cost is characterised.", year: 2024, venue: "SIGIR", authors: ["L. Ferreira"], topics: ["Retrieval-Augmented Generation"], citations: 103 },
  { title: "Multimodal Document Understanding with Vision-Language Models", abstract: "Vision-language models extract structured content from figures, tables and charts in scientific PDFs, with a layout-aware parsing pipeline.", year: 2024, venue: "CVPR", authors: ["M. Kim"], topics: ["Computer Vision", "Transformers & LLMs"], citations: 172 },
  { title: "Privacy-Preserving Analytics on Clinical Records", abstract: "Differential privacy and federated aggregation are applied to clinical cohorts, quantifying the privacy-utility trade-off on classification tasks.", year: 2023, venue: "Nature Medicine", authors: ["R. Singh"], topics: ["Medical AI"], citations: 245 },
  { title: "Evaluation Pitfalls in Retrieval-Augmented Systems", abstract: "We catalogue evaluation pitfalls in RAG systems — unsupported claims, citation drift and evaluator bias — and propose grounded scoring protocols.", year: 2025, venue: "ACL", authors: ["T. Adeyemi"], topics: ["Retrieval-Augmented Generation"], citations: 42 },
];

function saveOne(d: (typeof DEMO)[number]): "ok" | "dup" {
  if (get("SELECT id FROM papers WHERE title = ?", [d.title])) return "dup";
  const id = randomUUID();
  /* is_demo = 1 — these are demo records, not verified citations. */
  run(
    "INSERT INTO papers (id, title, abstract, year, venue, source_url, citation_count, is_demo, full_text) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, d.title, d.abstract, d.year, d.venue, "", d.citations, 1,
     `${d.title}\n\nAbstract\n${d.abstract}\n\nIntroduction\n${d.abstract}\n\nMethodology\n${d.abstract}\n\nResults\n${d.abstract}\n\nConclusion\n${d.abstract}`]
  );
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

if (process.argv.includes("--clear")) {
  run("DELETE FROM paper_chunks");
  run("DELETE FROM paper_authors");
  run("DELETE FROM paper_topics");
  run("DELETE FROM citations");
  run("DELETE FROM papers");
  run("DELETE FROM authors");
  run("DELETE FROM topics");
}

let ok = 0, dup = 0;
for (const d of DEMO) (saveOne(d) === "ok" ? ok++ : dup++);

/* ---- citation edges -------------------------------------------------
 * A deliberate, hand-built network rather than a single chain: the graph
 * page is only meaningful when the communities differ. Edges are added
 * only between papers that actually exist in the index. */
const byTitle = new Map<string, string>();
for (const p of all<any>("SELECT id, title FROM papers")) byTitle.set(p.title, p.id);

const EDGES: [string, string][] = [
  // phishing cluster
  ["Phishing URL Detection with Gradient Boosting and Lexical Features", "Comparative Study of Random Forest and SVM for Malicious Website Classification"],
  ["Phishing URL Detection with Gradient Boosting and Lexical Features", "Character-Level CNNs for Real-Time Phishing Detection"],
  ["Comparative Study of Random Forest and SVM for Malicious Website Classification", "Character-Level CNNs for URL Classification"],
  ["Dataset Drift in Phishing Feeds: A Longitudinal Measurement Study", "Phishing URL Detection with Gradient Boosting and Lexical Features"],
  ["Adversarial Attacks on Phishing Defenders", "Phishing URL Detection with Gradient Boosting and Lexical Features"],
  ["Explainable AI for Phishing Classifiers: Feature Attribution in Practice", "Phishing URL Detection with Gradient Boosting and Lexical Features"],
  // retrieval / RAG cluster
  ["Retrieval-Augmented Generation with Dense Passage Retrieval and Reranking", "Dense Embeddings and Vector Search for Academic Literature Discovery"],
  ["Retrieval-Augmented Generation with Dense Passage Retrieval and Reranking", "Hybrid Lexical-Semantic Retrieval: BM25 Meets Dense Embeddings"],
  ["Efficient Retrieval for Large Language Model Grounding", "Retrieval-Augmented Generation with Dense Passage Retrieval and Reranking"],
  ["Evaluation Pitfalls in Retrieval-Augmented Systems", "Retrieval-Augmented Generation with Dense Passage Retrieval and Reranking"],
  ["Vector Database Indexing Techniques for Semantic Search", "Dense Embeddings and Vector Search for Academic Literature Discovery"],
  ["Hybrid Lexical-Semantic Retrieval: BM25 Meets Dense Embeddings", "Vector Database Indexing Techniques for Semantic Search"],
  ["Prompt Engineering vs Fine-Tuning for Domain Question Answering", "Retrieval-Augmented Generation with Dense Passage Retrieval and Reranking"],
  // transformers cluster
  ["Attention Is All You Need: Transformers Revisited for Text Classification", "BERT Fine-Tuning Strategies for Low-Resource Sentiment Analysis"],
  ["Self-Supervised Pretraining for Low-Label Detection Tasks", "Attention Is All You Need: Transformers Revisited for Text Classification"],
  ["Attention Is All You Need: Transformers Revisited for Text Classification", "Prompt Engineering vs Fine-Tuning for Domain Question Answering"],
  ["Multimodal Document Understanding with Vision-Language Models", "Attention Is All You Need: Transformers Revisited for Text Classification"],
  // vision cluster
  ["Vision Transformers for Image Classification at Scale", "YOLO-Style Detectors for Real-Time Object Detection"],
  ["Multimodal Document Understanding with Vision-Language Models", "Vision Transformers for Image Classification at Scale"],
  // graph cluster
  ["Graph Neural Networks for Citation Network Analysis", "Graph Neural Networks for Fraud Detection in Financial Transactions"],
  ["Citation Graph Embeddings for Research Recommendation", "Graph Neural Networks for Citation Network Analysis"],
  ["Citation Graph Embeddings for Research Recommendation", "Recommender Systems: Collaborative Filtering vs Neural Ranking"],
  // time series / anomaly
  ["LSTM Baselines for Time Series Anomaly Detection in Network Traffic", "Contrastive Learning for Time Series Forecasting"],
  ["LSTM Baselines for Time Series Anomaly Detection in Network Traffic", "Fraud Detection with Imbalanced Learning and Gradient Boosting"],
  ["Fraud Detection with Imbalanced Learning and Gradient Boosting", "Graph Neural Networks for Fraud Detection in Financial Transactions"],
  ["Calibration of Probabilistic Classifiers under Label Shift", "Fraud Detection with Imbalanced Learning and Gradient Boosting"],
  ["Dataset Drift in Phishing Feeds: A Longitudinal Measurement Study", "LSTM Baselines for Time Series Anomaly Detection in Network Traffic"],
  // medical / fairness
  ["Clinical Text Classification with Domain-Adapted Language Models", "BERT Fine-Tuning Strategies for Low-Resource Sentiment Analysis"],
  ["Privacy-Preserving Analytics on Clinical Records", "Clinical Text Classification with Domain-Adapted Language Models"],
  ["Fairness Audits in Machine Learning Pipelines", "Privacy-Preserving Analytics on Clinical Records"],
  ["Fairness Audits in Machine Learning Pipelines", "Calibration of Probabilistic Classifiers under Label Shift"],
];

let edges = 0;
for (const [a, b] of EDGES) {
  const from = byTitle.get(a), to = byTitle.get(b);
  if (!from || !to || from === to) continue;
  try {
    run("INSERT OR IGNORE INTO citations (citing_paper_id, cited_paper_id) VALUES (?,?)", [from, to]);
    edges++;
  } catch { /* duplicate */ }
}

invalidateChunkCache();
const total = all<any>("SELECT id FROM papers").length;
console.log(`seeded: ${ok} new, ${dup} duplicates (${total} papers total, ${edges} citation edges).`);
