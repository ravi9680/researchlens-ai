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
import { localEmbed, cosine } from "./services/textUtils.js";
import { detectTopics, extractKeywords } from "./services/documentParser.js";
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

router.post("/auth/demo", async (_req, res) => {
  let u = get<any>("SELECT * FROM users WHERE email = ?", ["demo@researchlens.ai"]);
  if (!u) {
    const id = randomUUID();
    run("INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)", [id, "demo@researchlens.ai", await bcrypt.hash(randomUUID(), 8), "Demo Researcher", "user"]);
    u = get<any>("SELECT * FROM users WHERE id = ?", [id]);
  }
  res.json({ token: sign(u), user: { id: u.id, email: u.email, name: u.name } });
});

router.get("/auth/me", auth, (req: any, res) => {
  const u = get<any>("SELECT id, email, name, role FROM users WHERE id = ?", [(req as any).user.id]);
  if (!u) return res.status(404).json({ error: "Not found" });
  res.json({ ...u });
});

router.get("/auth/me/role", auth, (req: any, res) => {
  const u = get<any>("SELECT role FROM users WHERE id = ?", [(req as any).user.id]);
  if (!u) return res.status(404).json({ error: "Not found" });
  res.json({ role: u.role, isAdmin: u.role === "admin" });
});

router.post("/auth/make-admin", auth, (req: any, res) => {
  const u = get<any>("SELECT id, role FROM users WHERE id = ?", [(req as any).user.id]);
  if (!u) return res.status(404).json({ error: "Not found" });
  const existingAdmin = get<any>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existingAdmin) return res.status(400).json({ error: "Admin already exists" });
  run("UPDATE users SET role = 'admin' WHERE id = ?", [(req as any).user.id]);
  res.json({ ok: true, message: "You are now admin" });
});

router.get("/admin/stats", auth, (req: any, res) => {
  const u = get<any>("SELECT role FROM users WHERE id = ?", [(req as any).user.id]);
  if (!u || u.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const totalUsers = get<any>("SELECT COUNT(*) AS c FROM users")?.c || 0;
  const totalDocs = get<any>("SELECT COUNT(*) AS c FROM documents")?.c || 0;
  const totalPapers = get<any>("SELECT COUNT(*) AS c FROM papers")?.c || 0;
  res.json({ totalUsers, totalDocs, totalPapers });
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

router.post("/upload", auth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const id = randomUUID();
    run("INSERT INTO documents (id, filename, mime, size_bytes, status, stage, progress) VALUES (?,?,?,?,?,?,?)",
      [id, req.file.originalname, req.file.mimetype, req.file.size, "processing", "QUEUED", 2]);
    const fp = req.file.path;
    runAnalysis(id, fp, req.file.mimetype, req.file.originalname);
    res.json({ documentId: id, status: "processing" });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/documents", auth, (_req, res) => {
  res.json(all("SELECT id, filename, title, status, stage, progress, created_at FROM documents ORDER BY created_at DESC LIMIT 50"));
});
router.get("/documents/:id/status", auth, (req, res) => {
  const d = get<any>("SELECT id, status, stage, progress, error, title FROM documents WHERE id = ?", [req.params.id]);
  if (!d) return res.status(404).json({ error: "Not found" });
  res.json({ ...d, done: d.stage === "DONE", failed: d.stage === "FAILED" });
});
router.get("/documents/:id/report", auth, (req, res) => {
  const r = getReport(req.params.id);
  if (!r) return res.status(404).json({ error: "Not found" });
  if (r.stage !== "DONE") return res.status(409).json({ error: "Analysis not complete", stage: r.stage, progress: r.progress });
  res.json(r.report);
});

router.delete("/documents/:id", auth, (req, res) => {
  const d = ownDoc(req, req.params.id);
  if (!d) return res.status(404).json({ error: "Not found" });
  run("DELETE FROM similarity_results WHERE document_id = ?", [req.params.id]);
  run("DELETE FROM documents WHERE id = ?", [req.params.id]);
  res.json({ deleted: req.params.id });
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
  if (topic) {
    const q = String(topic).toLowerCase();
    rows = rows.filter((p: any) => ((p.title || "") + " " + (p.abstract || "")).toLowerCase().includes(q));
  }
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

router.post("/papers/:id/save", auth, (req, res) => {
  const paperId = req.params.id;
  const userId = (req as any).user.id;
  const existing = get<any>("SELECT id FROM saved_papers WHERE user_id = ? AND paper_id = ?", [userId, paperId]);
  if (existing) {
    run("DELETE FROM saved_papers WHERE user_id = ? AND paper_id = ?", [userId, paperId]);
    return res.json({ saved: false });
  }
  run("INSERT INTO saved_papers (id, user_id, paper_id) VALUES (?,?,?)", [randomUUID(), userId, paperId]);
  res.json({ saved: true });
});

router.get("/papers/saved", auth, (req, res) => {
  const userId = (req as any).user.id;
  const rows = all<any>("SELECT p.* FROM papers p JOIN saved_papers sp ON sp.paper_id = p.id WHERE sp.user_id = ? ORDER BY sp.saved_at DESC", [userId]);
  res.json(rows.map((p: any) => ({ ...p, authors: authorsOf(p.id), is_demo: Boolean(p.is_demo) })));
});

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

/* ---------- dashboard ---------- */
router.get("/dashboard/stats", auth, (_req, res) => {
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

/* ---------- RAG chat (grounded) ---------- */
router.post("/chat", auth, (req, res) => {
  const { question = "", topK = 5 } = req.body || {};
  if (!question || String(question).length < 3) return res.status(400).json({ error: "Question required" });
  const q = localEmbed(String(question).slice(0, 2000));
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

/* ---------- algorithm transparency ---------- */
router.get("/algorithms", (_req, res) => {
  res.json({
    cEngine: cEngineInfo(),
    pipeline: [
      { stage: "C_ENGINE", algorithms: ["TF-IDF + inverted index", "Jaccard", "cosine(TF)", "trigram", "KMP", "Rabin-Karp", "edit distance", "heap top-K"], output: "lexical ranking per candidate" },
      { stage: "SEMANTIC_SEARCH", algorithms: ["384-d embeddings + cosine (local; pgvector HNSW in prod)"], output: "semantic candidates" },
      { stage: "SIMILARITY", algorithms: ["weighted aggregate lexical+semantic", "section-level max"], output: "0–100 scores (relatedness, not plagiarism)" },
      { stage: "AI_SIGNALS", algorithms: ["burstiness/CV", "type-token ratio", "transition repetition", "trigram repetition"], output: "LOW/MODERATE/HIGH signal + disclaimer" },
      { stage: "GRAPH", algorithms: ["BFS", "DFS", "connected components", "PageRank"], output: "citation exploration" },
    ],
  });
});
