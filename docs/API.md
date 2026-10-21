# API

Base `/api`. Errors are `{ error }` with safe messages.

| Method | Path | Notes |
|---|---|---|
| GET | /health, /engine, /algorithms | status, C-engine info, pipeline transparency |
| POST | /auth/register, /auth/login | JWT (7d); private accounts. Accepts `guestToken` to merge a guest's work into the account |
| POST | /auth/demo | Shared demo identity (backward compat) |
| POST | /auth/guest | **Fresh isolated guest per call — every link visitor gets a private space** |
| GET | /auth/me | 401 if the token is valid but the account behind it no longer exists |
| POST | /upload (multipart `file`) | PDF/DOCX/TXT ≤25MB → `{ documentId }`, async analysis |
| GET | /documents, /documents/:id/status, /documents/:id/report | **auth required; strictly own docs only (else 404);** full report (409 until DONE) |
| DELETE | /documents/:id | Delete own analysis (owner or admin; 404 if not yours) |
| GET | /papers?search&topic&sort&page | sort: relevance/year/citations. Never returns `full_text` |
| GET | /papers/:id | + authors, chunk excerpts. Never returns `full_text` |
| GET | /papers/saved | **auth required; registered before `/papers/:id` so it is not shadowed by the `:id` param** |
| POST | /papers/compare `{ids[]}` | 2–5 papers → per-pair semantic (cosine over chunk embeddings) + lexical (Jaccard) scores, shared topics/authors |
| GET | /trends | papersByYear, topics, demoCount |
| GET | /citations/graph | nodes+edges+C BFS/PageRank analysis; weakly connected components |
| GET | /knowledge-base/stats | paper/chunk/author/topic/citation counts, top topics, embedding provider, C-engine availability |
| POST | /ingest/start `{domain,count}` | detached OpenAlex job → `{jobId}` (auth required). count ≤ 50; 429 if the user already has a job running or the server is busy |
| GET | /ingest/:id | progress/succeeded/duplicates/failed + log (auth required; 404 for another user's job) |
| GET | /dashboard/stats | cards + recent analyses (only the caller's own) |
| POST | /chat `{question}` | grounded RAG; abstains without evidence |
| POST | /literature-review `{topic,paperIds}` | outline + paper list, no fabricated cites |

## Ownership rules

Documents and ingestion jobs are owned by the user who created them.

- **Owner** — full access to their own analyses and jobs.
- **Other users** — `404`, never `403`. A 403 would confirm the id exists.
- **Admins** — see everything.
- **Legacy rows** with a `NULL user_id` predate ownership tracking and stay visible
  to any signed-in user (same rule as delete).

## Guest → account merge

The frontend sends the current guest token as `guestToken` on login/register.
When it is valid and belongs to a genuine guest account, everything that guest
produced (documents, bookmarks, ingestion jobs) is moved to the real account and
the guest account is deleted. Two independent signals must both hold before a
merge happens: the reserved guest email pattern **and** a non-bcrypt password
hash (guests get an unguessable random password). A token belonging to an
existing real account is never merged.

**Report shape:** title, topics, keywords, overallSimilarity, sectionScores,
similarPapers[] (score, sectionScores, whySimilar, lexical{}, topMatches[]),
passageMatches[] (EXACT/NEAR-EXACT/SEMANTIC/CONCEPTUAL), ai{score,level,reasons,
flaggedSections,disclaimer}, gaps[], summary{}, fingerprint, cEngine{}, disclaimers{}.
