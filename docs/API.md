# API

Base `/api`. Errors are `{ error }` with safe messages.

| Method | Path | Notes |
|---|---|---|
| GET | /health, /engine, /algorithms | status, C-engine info, pipeline transparency |
| POST | /auth/register, /auth/login, /auth/demo | JWT (7d); demo one-click |
| POST | /upload (multipart `file`) | PDF/DOCX/TXT ≤25MB → `{ documentId }`, async analysis |
| GET | /documents, /documents/:id/status, /documents/:id/report | list, poll stage/progress, full report (409 until DONE) |
| GET | /papers?search&topic&sort&page | sort: relevance/year/citations |
| GET | /papers/:id | + authors, chunk excerpts |
| POST | /papers/compare `{ids[]}` | ≤4 papers, extractive table |
| GET | /trends | papersByYear, topics, demoCount |
| GET | /citations/graph | nodes+edges+C BFS/PageRank analysis |
| GET | /knowledge-base/stats | counts + recent ingestion jobs |
| POST | /ingest/start `{domain,count}` | detached OpenAlex job → `{jobId}` |
| GET | /ingest/:id | progress/succeeded/duplicates/failed + log |
| GET | /dashboard/stats | cards + recent analyses |
| POST | /chat `{question}` | grounded RAG; abstains without evidence |
| POST | /literature-review `{topic,paperIds}` | outline + paper list, no fabricated cites |

**Report shape:** title, topics, keywords, overallSimilarity, sectionScores,
similarPapers[] (score, sectionScores, whySimilar, lexical{}, topMatches[]),
passageMatches[] (EXACT/NEAR-EXACT/SEMANTIC/CONCEPTUAL), ai{score,level,reasons,
flaggedSections,disclaimer}, gaps[], summary{}, fingerprint, cEngine{}, disclaimers{}.
