# Viva Q&A — ResearchLens AI

Short answers. Say the first line; add detail only if asked.

## Project

**Q: What does your project do?**
A: A user uploads a research paper; the system compares it against an indexed
research knowledge base and returns similar papers, passage-level matches,
AI-writing signals, research gaps, a literature-review outline, trends and a
citation graph.

**Q: What is the tech stack and why?**
A: C for the lexical algorithm engine (speed + DSA), Node/TypeScript for APIs
and orchestration, React for UI, SQLite for dev with a Postgres+pgvector
schema ready for production. Each language is used where it fits best.

**Q: Where does the knowledge base come from?**
A: 18 clearly-labeled synthetic demo papers plus real open-access metadata
from OpenAlex (ingested via the Admin page). No copyrighted full text is
scraped or redistributed; demo papers are badged DEMO and never real citations.

## C / DSA

**Q: Why C? Why not everything in JavaScript?**
A: C gives cache-friendly, allocation-controlled implementations of matching,
ranking and graph algorithms, and demonstrates DSA directly. UI, APIs and
embedding calls stay in JS/TS where C adds no value.

**Q: How does the backend talk to the C engine?**
A: Spawns the compiled `researchlens` binary with JSON over stdin, reads JSON
from stdout. 8s timeout, 1.5MB input cap, chunked candidates. If the binary is
missing, mirrored JS implementations take over so the app never breaks.

**Q: What does KMP do here?**
A: Counts (overlapping) exact occurrences of a query phrase in candidate text,
O(n+m) time, O(m) space. Used as passage-copy evidence alongside Rabin-Karp.

**Q: Rabin-Karp vs KMP — why both?**
A: KMP is the primary exact matcher; Rabin-Karp's rolling hash cross-checks
phrase hits. Agreement raises confidence in EXACT/NEAR-EXACT labels.

**Q: How is near-exact matching done?**
A: Edit distance (Levenshtein DP, O(m·n) time, O(min) space) plus trigram
Jaccard for robustness to small edits. Bounded to short text heads for speed.

**Q: How are candidates ranked?**
A: Inverted index + TF-IDF retrieval, then per-candidate Jaccard, cosine(TF)
and trigram fused by weighted aggregate (0.35/0.25/0.25/0.15), top-K via a
min-heap in O(n log K), min-max normalized to 0–100.

**Q: What graph algorithms and why?**
A: Citation graph as adjacency lists: BFS (reachability/distances), iterative
DFS with explicit stack, connected components (research clusters), BFS
shortest path, PageRank for graph-position importance.

**Q: Which data structures did you implement?**
A: Dynamic arrays, structs/strings, linked-list chaining in the hash table,
hash table, trie, min-heap, BST year index, adjacency-list graph with circular
queue (BFS) and explicit stack (DFS). Each solves a named problem — see
`docs/DSA_IMPLEMENTATION.md`.

**Q: Why didn't you implement crypto hashing?**
A: Deliberately. Fingerprinting uses FNV-1a (non-cryptographic, for indexing
only). Custom crypto is out of scope and unsafe to hand-roll.

## Similarity & AI honesty

**Q: Is a high similarity score proof of plagiarism?**
A: No. It measures relatedness (shared topic/methods/wording). Only
EXACT/NEAR-EXACT matches with visible quoted overlap deserve a closer look —
and even those can be boilerplate or common phrasing.

**Q: How accurate is your AI detector?**
A: It is not a detector, it is a signal analyzer (burstiness/CV, type-token
ratio, transition/trigram repetition → LOW/MODERATE/HIGH). Every result carries
the disclaimer: probabilistic, false positives/negatives possible, never proof
of authorship.

**Q: Why do C lexical methods plus embeddings exist side by side?**
A: Lexical methods catch wording overlap; embeddings catch meaning
(paraphrases). They are reported separately per paper (`lexical{}` vs score)
and never conflated.

**Q: Does the chat hallucinate references?**
A: No. It answers only from retrieved chunks, shows the evidence with
relevance scores, and abstains ("couldn't find enough evidence") below
threshold. Literature review works the same way.

## Engineering

**Q: How do you handle large papers without freezing?**
A: Chunking before the C engine (≤60 candidates, ≤12KB each), async analysis
jobs polled by stage/progress, detached ingestion jobs, pagination everywhere.

**Q: How are duplicates handled during ingestion?**
A: DOI unique constraint + title lookup + FNV-1a fingerprint of normalized
text; duplicates are counted on the Admin dashboard, failures retryable.

**Q: What would you do with more time?**
A: Plug in OpenAI embeddings via the existing `EMBEDDING_PROVIDER` switch,
deploy Postgres+pgvector with HNSW, add user accounts per institution.
