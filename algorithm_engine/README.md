# ResearchLens AI — C Algorithm Engine

Core algorithmic engine in portable C11. Handles **lexical** analysis only
(exact/near-exact matching, TF-IDF, Jaccard, ranking, citation-graph traversal).
**Semantic** similarity uses embeddings in the Node.js backend / vector DB —
C string algorithms never pretend to replace embeddings.

## Build

```bash
make            # builds build/researchlens
make test       # builds + runs C tests
make asan       # AddressSanitizer + UBSan build
./build/researchlens < sample.json
```

## Interface

JSON over stdin → JSON over stdout. Never pass raw shell input; backend spawns
with piped JSON, enforces byte limits and timeouts.

Commands: `analyze` · `match_passages` · `graph` · `keywords` · `fingerprint`

See `README` example + `docs/DSA_IMPLEMENTATION.md` for algorithm details.
