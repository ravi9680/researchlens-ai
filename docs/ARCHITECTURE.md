# Architecture

```
┌────────────┐  upload   ┌─────────────┐  JSON spawn  ┌──────────────────┐
│  React SPA │ ────────▶ │ Express API │ ───────────▶ │ C++ engine       │
│  Vite+TS   │ ◀──────── │  Node + TS  │ ◀─────────── │ (lexical only)   │
└────────────┘  report   └──────┬──────┘  fallback JS │ KMP/RK/TFIDF/heap│
                                │ embeddings+cosine    └──────────────────┘
                                ▼ (semantic)
                    ┌───────────────────────┐
                    │ SQLite (dev) / PG+pgv │
                    │ papers/chunks/embed…  │
                    └───────────────────────┘
```

**Hybrid principle:** C++ = lexical algorithms (exact/near-exact, TF-IDF,
ranking, graph traversal). TypeScript = APIs, embeddings, orchestration.
React = UI. Embeddings stay out of C++ — string algorithms never pretend to do
semantics.

**Pipeline stages:** QUEUED → PARSING → CHUNKING → EMBEDDING → C_ENGINE →
SEMANTIC_SEARCH → SIMILARITY → AI_SIGNALS → GAPS → REPORT → DONE.
Polled via `GET /api/documents/:id/status`. Failures land in FAILED with message.

**No stage can hang the pipeline.** Each stage runs under a hard deadline
(`STAGE_DEADLINE_MS` in `services/pipeline.ts`); a stage that overruns is
*skipped with a warning* rather than waited on, so the report is still
produced and `report.warnings` records exactly what was skipped. The status
endpoint reports `elapsedMs`, `stale` (no progress for 45 s — usually a
container recycle) and `canRetry`; `POST /api/documents/:id/retry` re-runs the
analysis from the file still on disk.

**Key services (`backend/src/services/`):** `documentParser` (pdf/mammoth/txt,
section detection, keywords, topics, prose-readability guard) · `textUtils`
(tokenize, chunk, hash embeddings, cosine, fuzzy) · `hashing` (the single
vector-hashing implementation shared by the local and IDF-weighted providers) ·
`cEngine` (spawn bridge, size/timeout guards, JS fallback) · `similarity`
(vector search → rerank → passage matches, with an embedding memo) ·
`aiDetection` (burstiness/TTR/transition signals + per-section profiling) ·
`gaps` (gap rules + grounded lit-review themes) · `ingestion` (OpenAlex with
abstract reconstruction and citation linking) · `pipeline` (orchestrator +
report builder) · `auth` (hashing, tokens, lockout, audit).

## Request lifecycle

```
browser
  │  Authorization: Bearer <access token>
  ▼
helmet (CSP, HSTS, frameguard) → CORS allow-list → body limits
  → global rate limit → request id → routes
  ▼
auth middleware → ownership check (404, never 403) → handler
  ▼
parameterised SQL → response
  ▼
global error handler (safe messages, no stack leaks)
```

The Express app lives in `backend/src/app.ts` and is mounted by `index.ts`.
That split exists so the test-suite can exercise the **real** middleware stack
— security headers, rate limiter and error handler included — instead of an
approximation.

## Performance notes

- The document is chunked **once**; the chunk list is shared between the
  pipeline and the similarity service.
- Passage matching memoises embeddings by text, so each distinct sentence is
  vectorised once instead of once per comparison (the previous
  implementation re-embedded inside the innermost loop).
- Abstract lookups for matched concepts are done per paper, not per
  paper × keyword.
- Topic counts use one grouped query rather than a query per paper.
- Semantic search is brute-force cosine in dev; HNSW via pgvector in prod
  (`migrations/postgres.sql`).
- Ingestion runs detached with progress rows; rate-limit + helmet + zod
  validation guard every entry point.

## Scaling notes

| Concern | Dev | Production |
|---|---|---|
| Store | SQLite file | Postgres + pgvector (`vector(384)`, HNSW) |
| Search | brute-force cosine in memory | pgvector HNSW index |
| Full text | `LIKE` + JS filtering | `tsvector` + GIN |
| Embeddings | local 384-d hashed | `text-embedding-3-small` (1536-d) — run `npm run reembed` |
| Rate limits | per process | shared store (Redis) behind the proxy |
| Jobs | in-process detached | worker queue |

Switching to Postgres needs three code changes, listed in
`docs/DATABASE.md` — `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`, JSON
embedding column → `vector(n)`, and `LIKE` → `tsvector`.
