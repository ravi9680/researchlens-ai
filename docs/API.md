# API

Base `/api`. Errors are `{ error }` with safe messages.

| Method | Path | Notes |
|---|---|---|
| GET | /health, /engine, /algorithms | status, C-engine info, pipeline transparency |
| POST | /auth/register, /auth/login | JWT (7d); private accounts |
| POST | /auth/demo | Shared demo identity (backward compat) |
| POST | /auth/guest | **Fresh isolated guest per call — every link visitor gets a private space** |
| POST | /upload (multipart `file`) | PDF/DOCX/TXT ≤25MB → `{ documentId }`, async analysis |
| GET | /documents, /documents/:id/status, /documents/:id/report | **auth required; strictly own docs only (else 404);** full report (409 until DONE) |
| DELETE | /documents/:id | Delete own analysis (owner or admin; 404 if not yours) |
| GET | /papers?search&topic&sort&page | sort: relevance/year/citations |
| GET | /papers/:id | + authors, chunk excerpts |
| GET | /papers/saved | **auth required; registered before `/papers/:id` so it is not shadowed by the `:id` param** |
| POST | /papers/compare `{ids[]}` | 2–5 papers → per-pair semantic (cosine over chunk embeddings) + lexical (Jaccard) scores, shared topics/authors |
| GET | /trends | papersByYear, topics, demoCount |
| GET | /citations/graph | nodes+edges+C BFS/PageRank analysis; weakly connected components |
| GET | /knowledge-base/stats | paper/chunk/author/topic/citation counts, top topics, embedding provider, C-engine availability |
| POST | /ingest/start `{domain,count}` | detached OpenAlex job → `{jobId}` (auth required) |
| GET | /ingest/:id | progress/succeeded/duplicates/failed + log (auth required) |
| GET | /dashboard/stats | cards + recent analyses |
| POST | /chat `{question}` | grounded RAG; abstains without evidence |
| POST | /literature-review `{topic,paperIds}` | outline + paper list, no fabricated cites |

**Report shape:** title, topics, keywords, overallSimilarity, sectionScores,
similarPapers[] (score, sectionScores, whySimilar, lexical{}, topMatches[]),
passageMatches[] (EXACT/NEAR-EXACT/SEMANTIC/CONCEPTUAL), ai{score,level,reasons,
flaggedSections,disclaimer}, gaps[], summary{}, fingerprint, cEngine{}, disclaimers{}.
