# DSA Implementation (viva-ready)

C engine: `algorithm_engine/` (C11, `-Wall -Wextra`, `make test`, `make asan`).
Bridge: `backend/src/services/cEngine.ts` (JSON stdin/stdout, 8s timeout,
1.5MB cap, JS fallback). Mirror implementations: `backend/src/services/textUtils.ts`.

## Data structures → problem solved

| Structure | File | Problem solved |
|---|---|---|
| Arrays / strings / structs | everywhere | bounded buffers, candidate/score records |
| Linked list (chaining) | `hash_table.c` | hash collisions in term-frequency maps |
| Hash table | `hash_table.c` | O(1) term freq for keyword extraction |
| Trie | `inverted_index.c` | keyword + prefix search (`trie_search/prefix_count`) |
| Min-heap / priority queue | `ranking.c` | top-K papers & TF-IDF hits in O(n log K) |
| BST | `ranking.c` | year-indexed metadata, range counts |
| Graph (adjacency lists) | `graph.c` | citation relationships |
| Queue (circular) | `graph.c` | BFS frontier |
| Stack (explicit array) | `graph.c` | iterative DFS |
| Dynamic allocation | all | postings growth, JSON parsing, graph edges |

## Algorithms → why + complexity

| Algorithm | Why selected | I/O (example) | Time / Space |
|---|---|---|---|
| Normalization/tokenize/stopwords | fair comparison, noise removal | `"Hello, URL!"` → `hello url` | O(n) / O(1) |
| KMP | overlapping exact-pattern evidence | `kmp("aaaa","aa")=3` | O(n+m) / O(m) |
| Rabin-Karp | rolling-hash cross-check of KMP | same | O(n+m) avg / O(1) |
| Edit distance (DP, 2-row) | near-exact string comparison | `kitten/sitting → 3` | O(mn) / O(min) |
| LCS (DP) | structural overlap | `abcde/ace → 3` | O(mn) / O(n) |
| Jaccard | token-set overlap | phishing example → ~0.5 | O(a·b) bounded chunks |
| Cosine(TF) | frequency-weighted similarity | same pair → ~0.68 | same |
| Trigram Jaccard | robust near-exact passages | `…detection!` → >0.5 | O(a·b) sampled |
| TF-IDF + inverted index | rank KB candidates by term importance | query `phishing detection` → doc0 first | O(postings) |
| Weighted aggregate (0.35/0.25/0.25/0.15) | fuse tfidf+jaccard+cos+tri | → 0–100 lexical score | O(1) |
| Heap top-K + min-max normalize | bounded ranking + display scale | 5 scored → top-3 desc | O(n log K) |
| BFS / DFS | reachable citations from a paper | chain 0→3, dist[3]=3 | O(V+E) |
| Connected components | research-community clusters | 1 comp on chain | O(V+E) |
| BFS shortest path | closest citation link | 0→3 = 3 hops | O(V+E) |
| PageRank (d=0.85) | graph-position importance (≠ quality) | sink ranks highest | O(iters·(V+E)) |
| FNV-1a fingerprint | non-crypto doc identity/dup check | `hello world research → 2530…` | O(n) |

## Worked example (`analyze`)

Input: user text + 2 candidates → inverted index built over candidates →
TF-IDF scores → per-candidate Jaccard/cosine/trigram + KMP probe + edit-sim on
heads → weighted aggregate → heap top-K. Real run:
`p1 (phishing/xgboost) = 71.4` vs `p2 (vision) = 1.3` — lexical ranking agrees
with semantic search, reported side-by-side, never merged silently.

## Limitations & optimizations

- Lexical ≠ semantic: paraphrases score low lexically; embeddings cover meaning.
- Edit/LCS bounded to ≤600-char heads (quadratic cost); trigram sampling bounds memory.
- Jaccard/cosine are O(a·b) on small chunks only; KB scale-up = HNSW (pgvector).
- PageRank = graph centrality, never research quality; citation counts likewise.
- Custom crypto was deliberately NOT implemented (FNV-1a for indexing only).

## Tests

`make test` → 28 assertions (`tests/test_all.c`) covering every row above;
backend `vitest` mirrors JS fallbacks (7 tests). Sample I/O values in this doc
are the actual test vectors.
