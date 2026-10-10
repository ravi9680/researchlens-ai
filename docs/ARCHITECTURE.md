# Architecture

```
┌────────────┐  upload   ┌─────────────┐  JSON spawn  ┌──────────────────┐
│  React SPA │ ────────▶ │ Express API │ ───────────▶ │ C engine (lexical)│
│  Vite+TS   │ ◀──────── │  Node + TS  │ ◀─────────── │ KMP/RK/TFIDF/heap │
└────────────┘  report   └──────┬──────┘  fallback JS └──────────────────┘
                                │ embeddings+cosine (semantic)
                                ▼
                    ┌───────────────────────┐
                    │ SQLite (dev) / PG+pgv │
                    │ papers/chunks/embed…  │
                    └───────────────────────┘
```

**Hybrid principle:** C = lexical algorithms (exact/near-exact, TF-IDF, ranking,
graph traversal). TypeScript = APIs, embeddings, orchestration. React = UI.
Embeddings stay out of C — string algorithms never pretend to do semantics.

**Pipeline stages:** QUEUED → PARSING → CHUNKING → EMBEDDING → C_ENGINE →
SEMANTIC_SEARCH → SIMILARITY → AI_SIGNALS → GAPS → REPORT → DONE.
Polled via `GET /api/documents/:id/status`. Failures land in FAILED with message.

**Key services (`backend/src/services/`):** `documentParser` (pdf/mammoth/txt,
section detection, keywords, topics) · `textUtils` (tokenize, chunk, hash
embeddings, cosine, fuzzy) · `cEngine` (spawn bridge, size/timeout guards,
JS fallback) · `similarity` (vector search → rerank → passage matches) ·
`aiDetection` (burstiness/TTR/transition signals) · `gaps` (gap rules +
lit-review outline) · `ingestion` (OpenAlex/Crossref/arXiv + demo fallback) ·
`pipeline` (orchestrator + report builder).

**Scaling notes:** chunk before C (≤60 candidates, ≤12KB each); vector search is
brute-force cosine in dev, HNSW via pgvector in prod (`migrations/postgres.sql`);
ingestion runs detached with progress rows; rate-limit + helmet + zod validation.
