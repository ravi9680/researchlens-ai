-- ResearchLens AI — SQLite-compatible schema (dev/demo).
-- Production Postgres variant: see postgres.sql (pgvector).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  name TEXT DEFAULT '', role TEXT DEFAULT 'user',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY, doi TEXT UNIQUE, title TEXT NOT NULL, abstract TEXT DEFAULT '',
  year INTEGER, venue TEXT DEFAULT '', source_url TEXT DEFAULT '', open_access_url TEXT DEFAULT '',
  citation_count INTEGER DEFAULT 0, is_demo INTEGER DEFAULT 1, full_text TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS authors (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS paper_authors (paper_id TEXT NOT NULL, author_id TEXT NOT NULL, position INTEGER DEFAULT 0, PRIMARY KEY (paper_id, author_id));
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS paper_topics (paper_id TEXT NOT NULL, topic_id TEXT NOT NULL, score REAL DEFAULT 0, PRIMARY KEY (paper_id, topic_id));
CREATE TABLE IF NOT EXISTS paper_sections (id TEXT PRIMARY KEY, paper_id TEXT NOT NULL, name TEXT NOT NULL, content TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS paper_chunks (id TEXT PRIMARY KEY, paper_id TEXT NOT NULL, section TEXT DEFAULT '', content TEXT NOT NULL, embedding TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_chunks_paper ON paper_chunks(paper_id);
CREATE INDEX IF NOT EXISTS idx_papers_title ON papers(title);
CREATE TABLE IF NOT EXISTS citations (citing_paper_id TEXT NOT NULL, cited_paper_id TEXT NOT NULL, PRIMARY KEY (citing_paper_id, cited_paper_id));
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, user_id TEXT DEFAULT NULL, filename TEXT NOT NULL, mime TEXT DEFAULT '', size_bytes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'queued', progress INTEGER DEFAULT 0, stage TEXT DEFAULT 'QUEUED',
  title TEXT DEFAULT '', full_text TEXT DEFAULT '', report_json TEXT DEFAULT '',
  error TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE TABLE IF NOT EXISTS similarity_results (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, paper_id TEXT NOT NULL, score REAL NOT NULL, section_scores TEXT DEFAULT '{}', matches_json TEXT DEFAULT '[]');
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id TEXT PRIMARY KEY, user_id TEXT DEFAULT NULL, domain TEXT DEFAULT '', target_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running', progress INT DEFAULT 0, succeeded INT DEFAULT 0,
  failed INT DEFAULT 0, duplicates INT DEFAULT 0,
  log_json TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ingestion_user ON ingestion_jobs(user_id, status);
CREATE TABLE IF NOT EXISTS saved_papers (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, paper_id TEXT NOT NULL,
  saved_at TEXT DEFAULT (datetime('now')),
  UNIQUE (user_id, paper_id)
);
