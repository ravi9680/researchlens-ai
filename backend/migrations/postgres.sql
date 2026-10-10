-- ResearchLens AI — Production Postgres + pgvector schema.
-- Enable: CREATE EXTENSION IF NOT EXISTS vector;
-- Run with psql $DATABASE_URL -f postgres.sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, name TEXT DEFAULT '', role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), doi TEXT UNIQUE, title TEXT NOT NULL,
  abstract TEXT DEFAULT '', year INT, venue TEXT DEFAULT '', source_url TEXT DEFAULT '',
  open_access_url TEXT DEFAULT '', citation_count INT DEFAULT 0, is_demo BOOLEAN DEFAULT TRUE,
  full_text TEXT DEFAULT '', search TSVECTOR, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS authors (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS paper_authors (paper_id UUID REFERENCES papers(id) ON DELETE CASCADE, author_id UUID REFERENCES authors(id) ON DELETE CASCADE, position INT DEFAULT 0, PRIMARY KEY (paper_id, author_id));
CREATE TABLE IF NOT EXISTS topics (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS paper_topics (paper_id UUID REFERENCES papers(id) ON DELETE CASCADE, topic_id UUID REFERENCES topics(id) ON DELETE CASCADE, score FLOAT DEFAULT 0, PRIMARY KEY (paper_id, topic_id));
CREATE TABLE IF NOT EXISTS paper_sections (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), paper_id UUID REFERENCES papers(id) ON DELETE CASCADE, name TEXT NOT NULL, content TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS paper_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
  section TEXT DEFAULT '', content TEXT NOT NULL, embedding vector(384)
);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON paper_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_papers_search ON papers USING gin (search);
CREATE TABLE IF NOT EXISTS citations (citing_paper_id UUID REFERENCES papers(id) ON DELETE CASCADE, cited_paper_id UUID REFERENCES papers(id) ON DELETE CASCADE, PRIMARY KEY (citing_paper_id, cited_paper_id));
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), filename TEXT NOT NULL, mime TEXT DEFAULT '',
  size_bytes BIGINT DEFAULT 0, status TEXT DEFAULT 'queued', progress INT DEFAULT 0, stage TEXT DEFAULT 'QUEUED',
  title TEXT DEFAULT '', full_text TEXT DEFAULT '', report_json JSONB DEFAULT '{}', error TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS similarity_results (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID REFERENCES documents(id) ON DELETE CASCADE, paper_id UUID REFERENCES papers(id) ON DELETE CASCADE, score FLOAT NOT NULL, section_scores JSONB DEFAULT '{}', matches_json JSONB DEFAULT '[]');
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain TEXT DEFAULT '', target_count INT DEFAULT 0,
  status TEXT DEFAULT 'running', progress INT DEFAULT 0, succeeded INT DEFAULT 0, failed INT DEFAULT 0,
  duplicates INT DEFAULT 0, log_json JSONB DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT now()
);
