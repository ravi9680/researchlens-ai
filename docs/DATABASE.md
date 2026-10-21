# Database

Dev: SQLite file `./backend/data/researchlens.db` (zero-setup, `npm run migrate`).
Prod: Postgres + pgvector — apply `backend/migrations/postgres.sql`
(`vector(384)`, HNSW index, `tsvector` full-text). The 384-d local embeddings
drop straight into the `vector(384)` column when switching providers.

**Tables:** `users` · `papers` (doi unique, is_demo flag) · `authors` ·
`paper_authors` (position) · `topics` · `paper_topics` · `paper_sections` ·
`paper_chunks` (embedding JSON in dev / vector in prod) · `citations` ·
`documents` (stage, progress, report_json) · `similarity_results` ·
`ingestion_jobs` · `saved_papers` · `refresh_tokens` · `audit_log` ·
`schema_migrations`.

**Indexes:** `idx_chunks_paper`, `idx_papers_title`, `idx_documents_user`,
`idx_ingestion_user`, `idx_refresh_user`, `idx_audit_created`; prod adds HNSW
+ GIN(trgm/search). Duplicate detection: DOI unique + title lookup + C FNV-1a
fingerprint of normalized text.

**Migrations/seeding:** `npm run migrate` (idempotent — it inspects
`PRAGMA table_info` and adds missing columns, so an existing database is
upgraded in place, then applies `schema.sql` for anything new) ·
`npm run seed` (31 curated demo papers + a 31-edge citation network + section
chunks). `--clear` wipes papers first.

**Demo rows carry `is_demo = 1`** and are badged `DEMO` in every UI surface.
They are *demo records*: the titles point at well-known papers, but the
abstracts, venues and citation counts shipped in the seed are written for the
demo and are not the publishers' metadata. The badge exists precisely so they
can never be mistaken for verified citations. Real, verifiable metadata arrives
through ingestion, which stores the source DOI/URL next to the paper.

**`refresh_tokens`** stores only a SHA-256 hash of the token, so a leaked
database row cannot be replayed as a session. **`audit_log`** records
authentication, authorisation and ingestion events with a timestamp and the
client IP.

**Portability notes (read before deploying to Postgres):** the dev store is
SQLite; `migrations/postgres.sql` is the production DDL. Three divergences to
handle in a Postgres adapter: (1) code uses `INSERT OR IGNORE` (SQLite) →
`ON CONFLICT DO NOTHING` (Postgres); (2) `paper_chunks.embedding` is JSON text
in dev → `vector(384)` (or the OpenAI dimension after `npm run reembed`) in
prod; (3) full-text search uses `LIKE`/JS filtering in dev → `tsvector` +
HNSW in prod. No Postgres server was available in this environment, so the
production DDL is provided unexecuted — verify with
`psql $DATABASE_URL -f backend/migrations/postgres.sql` before deploying.
