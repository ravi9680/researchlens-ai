# Database

Dev: SQLite file `./backend/data/researchlens.db` (zero-setup, `npm run migrate`).
Prod: Postgres + pgvector — apply `backend/migrations/postgres.sql`
(`vector(384)`, HNSW index, `tsvector` full-text). The 384-d local embeddings
drop straight into the `vector(384)` column when switching providers.

**Tables:** `users` · `papers` (doi unique, is_demo flag) · `authors` ·
`paper_authors` (position) · `topics` · `paper_topics` · `paper_sections` ·
`paper_chunks` (embedding JSON in dev / vector in prod) · `citations` ·
`documents` (stage, progress, report_json) · `similarity_results` ·
`ingestion_jobs`.

**Indexing:** `idx_chunks_paper`, `idx_papers_title`; prod adds HNSW +
GIN(trgm/search). Duplicate detection: DOI unique + title lookup + C FNV-1a
fingerprint of normalized text.

**Migrations/seeding:** `npm run migrate` (sqlite schema) · `npm run seed`
(18 synthetic DEMO papers + citation chain + sample upload).
`--clear` flag wipes papers first. Demo rows carry `is_demo=1` and are badged
in every UI surface — never real citations.

**Portability notes (read before deploying to Postgres):** the dev store is
SQLite; `migrations/postgres.sql` is the production DDL. Three divergences to
handle in a Postgres adapter: (1) code uses `INSERT OR IGNORE` (SQLite) →
`ON CONFLICT DO NOTHING` (Postgres); (2) `paper_chunks.embedding` is JSON text
in dev → `vector(384)` (or the OpenAI dimension after `npm run reembed`) in
prod; (3) full-text search uses `LIKE`/JS filtering in dev → `tsvector` +
HNSW in prod. No Postgres server was available in this environment, so the
production DDL is provided unexecuted — verify with
`psql $DATABASE_URL -f backend/migrations/postgres.sql` before deploying.
