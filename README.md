# ResearchLens AI — AI-Powered Research Intelligence & Similarity Analysis Platform

Premium research intelligence platform: upload a paper (PDF/DOCX/TXT) → extract → chunk → embed → semantic search over a research knowledge base → similarity, passage matches, AI-writing signals (probabilistic), research gaps, literature review, RAG chat, trends, citation graph.

> **Important principles:** semantic similarity ≠ plagiarism. AI-writing signals are probabilistic, never proof of authorship. Demo data is synthetic and clearly labeled — never presented as real citations. Real ingestion uses legitimate open-access APIs (OpenAlex, Crossref, Semantic Scholar, arXiv) with rate-limit respect.

## Quick start (demo mode, no keys needed)

```bash
# 0. C algorithm engine (one-time)
cd algorithm_engine && make test && cd ..

# 1. Backend
cd backend && npm install && npm run migrate && npm run seed && npm run dev
# → http://localhost:4000/api/health

# 2. Frontend (new terminal)
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

Upload `backend/seed/samples/sample-paper.txt` (or any PDF) to see the full pipeline.

## Structure

```
frontend/   React + TS + Vite + Tailwind + Recharts + React Query
backend/    Node + TS + Express (routes/controllers/services/repos)
backend/migrations/  SQL schema (Postgres/pgvector + SQLite-compatible)
backend/seed/        Demo knowledge base (synthetic, labeled DEMO)
docs/       ARCHITECTURE.md DATABASE.md API.md AI_ANALYSIS.md
```

## Environment

Copy `.env.example` → `backend/.env`. Demo mode works with zero keys.
Set `DATABASE_URL` (Postgres) to use pgvector in production; otherwise local SQLite is used automatically.

## Docs

- `docs/ARCHITECTURE.md` · `docs/DATABASE.md` · `docs/API.md` · `docs/AI_ANALYSIS.md`

## Disclaimer

AI-writing detection is probabilistic and can produce false positives/negatives. Do not treat it as proof of authorship.

## Limitations (verified status)

- **Embeddings:** default is IDF-weighted hashed 384-d vectors (offline, deterministic).
  Retrieval ranking verified correct on phishing queries. Set `EMBEDDING_PROVIDER=openai`
  with `AI_API_KEY` for `text-embedding-3-small`, then run `npm run reembed` (dimensions differ per provider).
- **Database:** dev runs SQLite (zero-setup); production DDL for Postgres + pgvector is in
  `backend/migrations/postgres.sql` with portability notes in `docs/DATABASE.md`. The production
  DDL has not been executed here (no Postgres server in this environment).
- **UI:** verified via headless Chromium screenshots (desktop 1440px + mobile 390px) for
  landing, dashboard, results, graph, upload; dark mode on. Citation graph is SVG-based
  (zoom/pan/click/search) rather than a WebGL library — fine to ~hundreds of nodes.
