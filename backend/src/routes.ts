import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { all, get, run } from "./db.js";
import { config } from "./config.js";
import { runAnalysis, getReport } from "./services/pipeline.js";
import { cosine } from "./services/textUtils.js";
import { embedSync } from "./services/embedding.js";
import { detectTopics, extractKeywords } from "./services/documentParser.js";
import { literatureReviewOutline } from "./services/gaps.js";
import { startIngestJob } from "./services/ingestion.js";
import { cEngineInfo, cGraph, cEngineAvailable } from "./services/cEngine.js";

export const router = Router();

/* ---------- auth ---------- */
function sign(user: any) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwtSecret, { expiresIn: "7d" });
}
export function auth(req: any, res: any, next: any) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!tok) return res.status(401).json({ error: "Missing token (demo login allowed)" });
  try { (req as any).user = jwt.verify(tok, config.jwtSecret); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

router.post("/auth/register", async (req, res) => {
  const s = z.object({ email: z.string().email(), password: z.string().min(6), name: z.string().default("") }).safeParse(req.body);
  if (!s.success) return res.status(400).json({ error: "Invalid input" });
  if (get("SELECT id FROM users WHERE email = ?", [s.data.email])) return res.status(409).json({ error: "Email exists" });
  const id = randomUUID();
  run("INSERT INTO users (id, email, password_hash, name) VALUES (?,?,?,?)", [id, s.data.email, await bcrypt.hash(s.data.password, 10), s.data.name]);
  const u = get<any>("SELECT * FROM users WHERE id = ?", [id]);
  res.json({ token: sign(u), user: { id, email: u.email, name: u.name } });
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const u = get<any>("SELECT * FROM users WHERE email = ?", [email || ""]);
  if (!u || !(await bcrypt.compare(String(password || ""), u.password_hash))) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: sign(u), user: { id: u.id, email: u.email, name: u.name } });
});

// one-click demo login (no password needed in DEMO_MODE)
router.post("/auth/demo", async (_req, res) => {
  let u = get<any>("SELECT * FROM users WHERE email = ?", ["demo@researchlens.ai"]);
  if (!u) {
    const id = randomUUID();
    run("INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)", [id, "demo@researchlens.ai", await bcrypt.hash(randomUUID(), 8), "Demo Researcher", "admin"]);
    u = get<any>("SELECT * FROM users WHERE id = ?", [id]);
  }
  res.json({ token: sign(u), user: { id: u.id, email: u.email, name: u.name } });
});

/* ---------- engine / health ---------- */
router.get("/health", (_req, res) => res.json({ ok: true, demoMode: config.demoMode, time: new Date().toISOString() }));
router.get("/engine", (_req, res) => res.json({ ...cEngineInfo(), semantic: "IDF-weighted hashed embeddings (384-d, offline) or OpenAI text-embedding-3-small via EMBEDDING_PROVIDER; pgvector HNSW in prod", note: "C = lexical; embeddings = semantic. Never conflated." }));

/* ---------- upload & analysis ---------- */
const uploadDir = path.resolve(config.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: config.maxFileMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(pdf|docx|txt)$/i.test(file.originalname) || ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PDF, DOCX, TXT allowed"), ok);
  },
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const id = randomUUID();
    run("INSERT INTO documents (id, filename, mime, size_bytes, status, stage, progress) VALUES (?,?,?,?,?,?,?)",
      [id, req.file.originalname, req.file.mimetype, req.file.size, "processing", "QUEUED", 2]);
    const fp = req.file.path;
    runAnalysis(id, fp, req.file.mimetype, req.file.originalname); // async, polled via status
    res.json({ documentId: id, status: "processing" });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/documents", (_req, res) => {
  res.json(all("SELECT id, filename, title, status, stage, progress, created_at FROM documents ORDER BY created_at DESC LIMIT 50"));
});
router.get("/documents/:id/status", (req, res) => {
  const d = get<any>("SELECT id, status, stage, progress, error, title FROM documents WHERE id = ?", [req.params.id]);
  if (!d) return res.status(404).json({ error: "Not found" });
  res.json({ ...d, done: d.stage === "DONE", failed: d.stage === "FAILED" });
});
router.get("/documents/:id/report", (req, res) => {
  const r = getReport(req.params.id);
  if (!r) return res.status(404).json({ error: "Not found" });
  if (r.stage !== "DONE") return res.status(409).json({ error: "Analysis not complete", stage: r.stage, progress: r.progress });
  res.json(r.report);
});

/* ---------- papers ---------- */
function authorsOf(pid: string) {
  return all<any>("SELECT a.name FROM paper_authors pa JOIN authors a ON a.id = pa.author_id WHERE pa.paper_id = ? ORDER BY pa.position", [pid]).map((r: any) => r.name);
}
router.get("/papers", (req, res) => {
  const { search = "", topic = "", sort = "relevance", page = "1", limit = "12" } = req.query as any;
  let rows = all<any>("SELECT * FROM papers");
  if (search) {
    const q = String(search).toLowerCase();
    rows = rows.filter((p: any) => ((p.title || "") + " " + (p.abstract || "")).toLowerCase().includes(q));
  }
  if (topic) rows = rows.filter((p: any) => ((p.title || "") + " " + (p.abstract || "")).toLowerCase().includes(String(topic).toLowerCase()));
  if (sort === "year") rows.sort((a: any, b: any) => (b.year || 0) - (a.year || 0));
  else if (sort === "citations") rows.sort((a: any, b: any) => (b.citation_count || 0) - (a.citation_count || 0));
  const pg = Math.max(1, Number(page) || 1), lim = Math.min(50, Number(limit) || 12);
  const items = rows.slice((pg - 1) * lim, pg * lim).map((p: any) => ({ ...p, authors: authorsOf(p.id), is_demo: Boolean(p.is_demo) }));
  res.json({ total: rows.length, page: pg, items });
});

router.get("/papers/:id", (req, res) => {
  const p = get<any>("SELECT * FROM papers WHERE id = ?", [req.params.id]);
  if (!p) return res.status(404).json({ error: "Not found" });
  const chunks = all<any>("SELECT section, substr(content,1,600) AS excerpt FROM paper_chunks WHERE paper_id = ? LIMIT 6", [p.id]);
  res.json({ ...p, authors: authorsOf(p.id), chunks, is_demo: Boolean(p.is_demo) });
});

router.post("/papers/compare", (req, res) => {
  const { ids = [] } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "ids required" });
  const rows = ids.slice(0, 4).map((id: string) => {
    const p = get<any>("SELECT * FROM papers WHERE id = ?", [id]);
    return p ? { ...p, authors: authorsOf(id) } : null;
  }).filter(Boolean);
  const feats = ["Research problem", "Methodology", "Dataset", "Results", "Limitations", "Year", "Citations"];
  res.json({
    papers: rows.map((p: any) => ({ id: p.id, title: p.title, year: p.year, venue: p.venue, citationCount: p.citation_count, authors: p.authors })),
    table: feats.map((f) => ({ feature: f, values: rows.map((p: any) => f === "Year" ? p.year : f === "Citations" ? `${p.citation_count}${p.is_demo ? " (demo)" : ""}` : (p.abstract || "").slice(0, 160) + "…") })),
    note: "Summaries are extractive excerpts from stored abstracts — not generated claims.",
  });
});

/* ---------- trends ---------- */
router.get("/trends", (_req, res) => {
  const papers = all<any>("SELECT * FROM papers");
  const byYear: Record<string, number> = {};
  const topicCount: Record<string, number> = {};
  for (const p of papers) {
    if (p.year) byYear[p.year] = (byYear[p.year] || 0) + 1;
    for (const t of all<any>("SELECT t.name FROM paper_topics pt JOIN topics t ON t.id = pt.topic_id WHERE pt.paper_id = ?", [p.id])) {
      topicCount[t.name] = (topicCount[t.name] || 0) + 1;
    }
  }
  res.json({
    papersByYear: Object.entries(byYear).map(([year, count]) => ({ year, count })).sort((a, b) => Number(a.year) - Number(b.year)),
    topics: Object.entries(topicCount).map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count).slice(0, 12),
    total: papers.length, demoCount: papers.filter((p: any) => p.is_demo).length,
  });
});

/* ---------- citation graph (C engine BFS/PageRank when available) ---------- */
router.get("/citations/graph", async (_req, res) => {
  const papers = all<any>("SELECT id, title, year, citation_count FROM papers LIMIT 60");
  const idx = new Map(papers.map((p: any, i: number) => [p.id, i]));
  const cites = all<any>("SELECT citing_paper_id, cited_paper_id FROM citations");
  const edges: [number, number][] = cites.filter((c: any) => idx.has(c.citing_paper_id) && idx.has(c.cited_paper_id)).map((c: any) => [idx.get(c.citing_paper_id)!, idx.get(c.cited_paper_id)!]);
  let analysis: any = null;
  try { if (cEngineAvailable() && papers.length > 1) analysis = await cGraph(papers.length, edges, 0); } catch { analysis = null; }
  res.json({ nodes: papers.map((p: any, i: number) => ({ id: p.id, index: i, title: p.title, year: p.year, citations: p.citation_count, pagerank: analysis?.pagerank?.[i] ?? null })), edges: cites.slice(0, 200), analysis, algorithms: ["bfs", "dfs", "connected-components", "pagerank"] });
});

/* ---------- knowledge base ---------- */
router.get("/knowledge-base/stats", (_req, res) => {
  const papers = all<any>("SELECT * FROM papers");
  res.json({
    papers: papers.length, authors: get<any>("SELECT COUNT(*) AS c FROM authors")?.c || 0,
    topics: get<any>("SELECT COUNT(*) AS c FROM topics")?.c || 0, chunks: get<any>("SELECT COUNT(*) AS c FROM paper_chunks")?.c || 0,
    demoPapers: papers.filter((p: any) => p.is_demo).length,
    jobs: all("SELECT * FROM ingestion_jobs ORDER BY created_at DESC LIMIT 10"),
  });
});
router.post("/ingest/start", (req, res) => {
  const s = z.object({ domain: z.string().min(2).max(120), count: z.number().min(1).max(100).default(20) }).safeParse(req.body);
  if (!s.success) return res.status(400).json({ error: "Invalid input" });
  const jobId = startIngestJob(s.data.domain, s.data.count);
  res.json({ jobId });
});
router.get("/ingest/:id", (req, res) => {
  const j = get("SELECT * FROM ingestion_jobs WHERE id = ?", [req.params.id]);
  if (!j) return res.status(404).json({ error: "Not found" });
  res.json({ ...j, log: JSON.parse((j as any).log_json || "[]") });
});

/* ---------- dashboard ---------- */
router.get("/dashboard/stats", (_req, res) => {
  const papers = all<any>("SELECT * FROM papers");
  const docs = all<any>("SELECT * FROM documents");
  const sims = all<any>("SELECT score FROM similarity_results");
  res.json({
    totalPapers: papers.length, totalAuthors: get<any>("SELECT COUNT(*) AS c FROM authors")?.c || 0,
    totalTopics: get<any>("SELECT COUNT(*) AS c FROM topics")?.c || 0, analyses: docs.length,
    avgSimilarity: sims.length ? Math.round(sims.reduce((s: number, r: any) => s + r.score, 0) / sims.length) : 0,
    recent: docs.slice(0, 6).map((d: any) => ({ id: d.id, title: d.title || d.filename, stage: d.stage, progress: d.progress })),
  });
});

/* ---------- RAG chat (grounded, no hallucinated refs) ---------- */
router.post("/chat", (req, res) => {
  const { question = "", topK = 5 } = req.body || {};
  if (!question || String(question).length < 3) return res.status(400).json({ error: "Question required" });
  const q = embedSync(String(question).slice(0, 2000));
  const chunks = all<any>("SELECT c.content, c.section, c.paper_id, c.embedding, p.title, p.year FROM paper_chunks c JOIN papers p ON p.id = c.paper_id LIMIT 3000");
  const scored = chunks.map((c: any) => {
    let emb: number[] = [];
    try { emb = JSON.parse(c.embedding); } catch { emb = []; }
    return { ...c, score: emb.length ? cosine(q, emb) : 0 };
  }).sort((a: any, b: any) => b.score - a.score).slice(0, Math.min(topK, 8));
  if (!scored.length || scored[0].score < 0.08) {
    return res.json({ answer: "I couldn't find enough evidence in the indexed literature to answer that. Try ingesting more papers on this topic first.", references: [], grounded: false });
  }
  const refs = [...new Map(scored.map((s: any) => [s.paper_id, { id: s.paper_id, title: s.title, year: s.year }])).values()];
  const kws = extractKeywords(scored.map((s: any) => s.content).join(" ")).slice(0, 6);
  res.json({
    answer: `Based on ${refs.length} retrieved paper(s): the indexed literature most strongly associates your question with "${kws.slice(0, 3).join(", ")}". Top evidence comes from "${scored[0].title}" (${scored[0].section}, relevance ${Math.round(scored[0].score * 100)}%). Key themes: ${kws.join("; ")}. Ask a follow-up about methods, datasets, or limitations for deeper comparison.`,
    references: refs, evidence: scored.slice(0, 3).map((s: any) => ({ paper: s.title, section: s.section, excerpt: s.content.slice(0, 280), relevance: Math.round(s.score * 100) })),
    grounded: true, note: "Answer is grounded only in retrieved chunks above.",
  });
});

/* ---------- literature review ---------- */
router.post("/literature-review", (req, res) => {
  const { topic = "", paperIds = [] } = req.body || {};
  let papers = all<any>("SELECT * FROM papers");
  if (paperIds?.length) papers = papers.filter((p: any) => paperIds.includes(p.id));
  else if (topic) {
    const q = String(topic).toLowerCase();
    papers = papers.filter((p: any) => ((p.title || "") + " " + (p.abstract || "")).toLowerCase().includes(q.split(" ")[0]));
  }
  papers = papers.slice(0, 12);
  res.json({ ...literatureReviewOutline(String(topic || "Selected papers"), papers), papers: papers.map((p: any) => ({ id: p.id, title: p.title, year: p.year, venue: p.venue, authors: authorsOf(p.id), isDemo: Boolean(p.is_demo) })) });
});

/* ---------- algorithm transparency ---------- */
router.get("/algorithms", (_req, res) => {
  res.json({
    cEngine: cEngineInfo(),
    pipeline: [
      { stage: "C_ENGINE", algorithms: ["TF-IDF + inverted index", "Jaccard", "cosine(TF)", "trigram", "KMP", "Rabin-Karp", "edit distance", "heap top-K"], output: "lexical ranking per candidate" },
      { stage: "SEMANTIC_SEARCH", algorithms: ["IDF-weighted 384-d embeddings + cosine (local; OpenAI optional; pgvector HNSW in prod)"], output: "semantic candidates" },
      { stage: "SIMILARITY", algorithms: ["weighted aggregate lexical+semantic", "section-level max"], output: "0–100 scores (relatedness, not plagiarism)" },
      { stage: "AI_SIGNALS", algorithms: ["burstiness/CV", "type-token ratio", "transition repetition", "trigram repetition"], output: "LOW/MODERATE/HIGH signal + disclaimer" },
      { stage: "GRAPH", algorithms: ["BFS", "DFS", "connected components", "PageRank"], output: "citation exploration" },
    ],
  });
});
