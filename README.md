# ◈ ResearchLens AI — AI-Powered Research Intelligence & Similarity Analysis Platform

> Upload a paper → get similar papers, passage matches, AI-writing signals, research gaps, literature review & grounded answers. **Similarity ≠ plagiarism. Signals ≠ proof.**

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://researchlens-cqn6.onrender.com)
[![C Tests](https://img.shields.io/badge/C_tests-28_passed-blue)](algorithm_engine/tests/test_all.c)
[![Backend Tests](https://img.shields.io/badge/backend_tests-7_passed-blue)](backend/src/tests.test.ts)
[![License: Demo](https://img.shields.io/badge/data-demo_labelled-amber)](docs/DATABASE.md)

**🌐 Live:** https://researchlens-cqn6.onrender.com &nbsp;·&nbsp; **First load takes ~1 min** (free tier wakes from sleep)

---

## What it does

A student uploads a research paper (**PDF / DOCX / TXT**). The platform analyses it against an indexed research knowledge base and returns:

| Output | What you get |
|---|---|
| 📄 Similar papers | Ranked list with scores, section matches & *why-similar* notes |
| 🔍 Passage matches | EXACT / NEAR-EXACT / SEMANTIC / CONCEPTUAL, side-by-side |
| 🤖 AI-writing signals | LOW / MODERATE / HIGH bands — probabilistic, never proof |
| 🕳️ Research gaps | Grounded in retrieved papers, each with a future direction |
| 📚 Literature review | Theme-wise outline citing only retrieved papers |
| 💬 Research chat | RAG answers with evidence — abstains when unsure |
| 📈 Trends & citation graph | Year/topic charts, BFS·PageRank-powered interactive graph |

## Screenshots

| Dashboard | Analysis report |
|---|---|
| ![Dashboard](docs/screenshots/02-dashboard.png) | ![Results](docs/screenshots/03-results.png) |

| Citation graph | Algorithm explorer |
|---|---|
| ![Graph](docs/screenshots/04-graph.png) | ![Algorithms](docs/screenshots/05-algorithms.png) |

---

## How it works (10-stage pipeline)

```
UPLOAD → PARSE → CHUNK → EMBED → C_ENGINE → SEMANTIC_SEARCH → SIMILARITY → AI_SIGNALS → GAPS → REPORT
```

**Hybrid architecture** — each language where it fits best:

- **C engine** (`algorithm_engine/`) — KMP, Rabin-Karp, edit distance, LCS, TF-IDF + inverted index, Jaccard/cosine/trigram, hash table, Trie, heap top-K, BST, graph (BFS/DFS/components/PageRank). JSON stdin/stdout bridge, `make test` + `make asan`.
- **Backend** (`backend/`, Node + TypeScript + Express) — pipeline orchestration, IDF-weighted 384-d embeddings (OpenAI swappable), SQLite dev store, Postgres + pgvector schema for production.
- **Frontend** (`frontend/`, React + TS + Vite + Tailwind) — 18 routes, dark mode, mobile-ready.

Lexical (C) and semantic (embeddings) scores are **reported separately, never conflated**.

---

## Quick start (no API keys needed)

```bash
# 0. C engine (one-time)
cd algorithm_engine && make test && cd ..

# 1. Backend → http://localhost:4000
cd backend && npm install && npm run migrate && npm run seed && npm run dev

# 2. Frontend (new terminal) → http://localhost:5173
cd frontend && npm install && npm run dev
```

Upload `backend/seed/samples/sample-paper.txt` (or any PDF) to see the full pipeline.

### Other useful commands

```bash
npm run reembed   # rebuild search index (backend/) — needed after ingestion
npx vitest run    # backend tests (backend/)
make asan         # C sanitizer build (algorithm_engine/)
npm run build     # production frontend (frontend/)
```

## Environment

Copy `.env.example` → `backend/.env`. Demo mode needs zero keys.

| Variable | Purpose |
|---|---|
| `EMBEDDING_PROVIDER=openai` + `AI_API_KEY` | Real embeddings (then `npm run reembed`) |
| `DATABASE_URL` | Postgres production (see `backend/migrations/postgres.sql`) |
| `JWT_SECRET` | Change from dev default before any public deploy |

## Documentation

| Doc | Contents |
|---|---|
| `docs/ARCHITECTURE.md` | Components, pipeline, scaling notes |
| `docs/DATABASE.md` | Schema, seeding, Postgres portability notes |
| `docs/API.md` | Every endpoint + report shape |
| `docs/AI_ANALYSIS.md` | Honesty contract (similarity, AI signals, grounding) |
| `docs/DSA_IMPLEMENTATION.md` | Every DS/algorithm: complexity, examples, viva notes |

## Honesty contract

1. **Similarity is relatedness, not plagiarism** — only quoted EXACT/NEAR-EXACT overlap warrants a closer look.
2. **AI-writing scores are probabilistic** — false positives/negatives possible, never proof of authorship.
3. **Demo papers are synthetic and badged DEMO** — never presented as real citations; real ingestion uses OpenAlex/Crossref/arXiv within rate limits and licensing.

## Deploy

One-click Render blueprint (`render.yaml`): pushes to `main` auto-redeploy in ~3 min, same URL kept. Details in the section above and `docs/ARCHITECTURE.md`.

---

*Built as a college major-project demonstration of C + DSA, full-stack engineering, and honest AI measurement.*
