# API

Base `/api`. Errors are `{ error }` with safe messages. Every response carries
an `X-Request-Id` header (also present in the server log for that request).

| Method | Path | Notes |
|---|---|---|
| GET | /health, /engine, /algorithms | status, C-engine info, pipeline transparency |
| GET | /security/summary | Live security posture (the Security page renders this) |
| POST | /auth/register, /auth/login | JWT (2 h) + refresh token (30 d); private accounts. Accepts `guestToken` to merge a guest's work into the account |
| POST | /auth/refresh | Rotates the refresh token; the presented one is revoked and cannot be replayed |
| POST | /auth/logout | Revokes every refresh token for the caller |
| POST | /auth/demo | Shared demo identity (backward compat) |
| POST | /auth/guest | **Fresh isolated guest per call — every link visitor gets a private space** |
| GET | /auth/me | 401 if the token is valid but the account behind it no longer exists |
| POST | /auth/make-admin | First registered account becomes admin; only usable while no admin exists |
| GET | /admin/stats, /admin/audit | Admin only — counts and the last 100 security events |
| POST | /upload (multipart `file`) | PDF/DOCX/TXT ≤25MB → `{ documentId }`, async analysis. 429 at the per-account storage ceiling |
| GET | /documents, /documents/:id/status, /documents/:id/report | **auth required; strictly own docs only (else 404);** full report (409 until DONE) |
| GET | /documents/:id/status | + `elapsedMs`, `stale` (stage has not advanced for >45s) and `canRetry` — the UI uses these to stop showing an endless progress bar |
| POST | /documents/:id/retry | Re-runs an analysis that failed or stalled; the uploaded file is kept on disk so nothing has to be re-uploaded (409 if already DONE) |
| GET | /documents/:id/export | Finished report as a downloadable JSON file (Content-Disposition attachment) |
| DELETE | /documents/:id | Delete own analysis (owner or admin; 404 if not yours) |
| GET | /papers?search&topic&sort&page | sort: relevance/year/citations. Relevance is a real weighted score (title ≫ abstract, citations as a light tie-break). Topic filters through the `paper_topics` relation. Never returns `full_text` |
| GET | /papers/:id | + authors, chunk excerpts. Never returns `full_text` |
| GET | /papers/:id/citations | Citing and cited papers of one paper |
| GET | /papers/saved | **auth required; registered before `/papers/:id` so it is not shadowed by the `:id` param** |
| POST | /papers/compare `{ids[]}` | 2–5 papers → per-pair semantic (cosine over chunk embeddings) + lexical (Jaccard) scores, shared topics/authors/terms |
| GET | /trends | papersByYear, topics, demoCount (topic counts computed in one query) |
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

## Token lifecycle

```
POST /auth/login | /auth/register | /auth/guest
  → { token, refreshToken, user }

GET  <protected route>          Authorization: Bearer <token>
POST /auth/refresh  { refreshToken } → { token, refreshToken, user }
POST /auth/logout                revokes every refresh token for the caller
```

Access tokens are short-lived (`TOKEN_TTL`, default `2h`); refresh tokens last
`REFRESH_TOKEN_TTL` (default `30d`) and are **single-use** — refreshing revokes
the presented token and issues a new one. Only a SHA-256 hash of a refresh
token is stored.

On a `401` the client tries the refresh token once, then mints a fresh guest
identity and retries, so a first-time visitor never has to register to reach the
app.

**Report shape:** title, topics, keywords, overallSimilarity, sectionScores,
similarPapers[] (score, sectionScores, whySimilar, lexical{}, topMatches[]),
passageMatches[] (EXACT/NEAR-EXACT/SEMANTIC/CONCEPTUAL),
ai{score,level,reasons,flaggedSections,metrics,disclaimer}, gaps[],
summary{}, fingerprint, cEngine{}, disclaimers{}.

`ai.metrics` exposes the raw measurements behind the score:
`{ sentenceLengthCv, typeTokenRatio, transitionsPer1k, repeatedTrigrams, sectionRegularity }`.
`ai.flaggedSections` lists the sections that actually drove the signal, each
with the reason it was chosen.
