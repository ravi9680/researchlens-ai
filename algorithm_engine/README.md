# ResearchLens AI — C++ Algorithm Engine

Core algorithmic engine in portable **C++17**. Handles **lexical** analysis only
(exact/near-exact matching, TF-IDF, Jaccard, ranking, citation-graph traversal).
**Semantic** similarity uses embeddings in the Node.js backend / vector DB —
C++ string algorithms never pretend to replace embeddings.

## Build

```bash
make            # builds build/researchlens
make test       # builds + runs C++ tests
make asan       # AddressSanitizer + UBSan build
./build/researchlens < sample.json
```

## Interface

JSON over stdin → JSON over stdout. Never pass raw shell input; backend spawns
with piped JSON, enforces byte limits and timeouts.

Commands: `analyze` · `match_passages` · `graph` · `keywords` · `fingerprint`

See `README` example + `docs/DSA_IMPLEMENTATION.md` for algorithm details.

## Data Structures (C++)

| Structure | File | Problem solved |
|---|---|---|
| `std::vector` / `std::string` | everywhere | bounded buffers, candidate/score records |
| Linked list (chaining) | `hash_table.cpp` | hash collisions in term-frequency maps |
| Hash table | `hash_table.cpp` | O(1) term freq for keyword extraction |
| Trie | `inverted_index.cpp` | keyword + prefix search |
| Min-heap / priority queue | `ranking.cpp` | top-K papers & TF-IDF hits in O(n log K) |
| BST | `ranking.cpp` | year-indexed metadata, range counts |
| Graph (adjacency lists) | `graph.cpp` | citation relationships |
| Queue (circular) | `graph.cpp` | BFS frontier |
| Stack (explicit vector) | `graph.cpp` | iterative DFS |
| `new`/`delete` (dynamic) | all | postings growth, JSON parsing, graph edges |

## Algorithms (C++)

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
| Weighted aggregate (0.35/0.25/0.25/0.15) | fuse tfidf+jaccard+cos+tri | → 0–100 lexical score | O(1) |
| Heap top-K + min-max normalize | bounded ranking + display scale | 5 scored → top-3 desc | O(n log K) |
| BFS / DFS | reachable citations from a paper | chain 0→3, dist[3]=3 | O(V+E) |
| Connected components | research-community clusters | 1 comp on chain | O(V+E) |
| BFS shortest path | closest citation link | 0→3 = 3 hops | O(V+E) |
| PageRank (d=0.85) | graph-position importance (≠ quality) | sink ranks highest | O(iters·(V+E)) |
| FNV-1a fingerprint | non-crypto doc identity/dup check | `hello world research → 2530…` | O(n) |

## Tests

`make test` → assertions covering every row above; backend `vitest` mirrors JS fallbacks.
Limitations: C++ lexical methods detect wording overlap, not meaning — semantic gaps
need embeddings. Edit distance/LCS bounded to short heads for performance.
PageRank reflects graph position, never research quality.
