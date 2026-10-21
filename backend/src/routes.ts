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
import { cosine, jaccard } from "./services/textUtils.js";
import { detectTopics, extractKeywords } from "./services/documentParser.js";
import { cEngineInfo, cGraph, cEngineAvailable } from "./services/cEngine.js";
import { startIngestJob } from "./services/ingestion.js";
import { literatureReviewOutline } from "./services/gaps.js";
import { semanticSearch } from "./services/similarity.js";
import { embedSync, provider, DIM } from "./services/embedding.js";

export const router = Router();

// Ensure saved_papers table exists on startup (for Render deployments)
try {
  run(`CREATE TABLE IF NOT EXISTS saved_papers (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, paper_id TEXT NOT NULL,
    saved_at TEXT DEFAULT (datetime('now')),
    UNIQUE (user_id, paper_id)
  )`);
} catch (e) {
  console.log("saved_papers table init:", e);
}

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

/** Resolve a document the caller is allowed to mutate: its owner, or an admin.
 *  Legacy rows with NULL user_id predate ownership tracking and stay ownerless. */
function ownDoc(req: any, id: string) {
  const d = get<any>("SELECT id, user_id, filename, status FROM documents WHERE id = ?", [id]);
  if (!d) return null;
  const u = (req as any).user || {};
  if (d.user_id && d.user_id !== u.id && u.role !== "admin") return null;
  return d;
}

router.post("/auth/register", async (req, res) => {
  const s = z.object({ email: z.string().email(), password: z.string().min(6), name: z.string().default("") }).safeParse(req.body);
  if (!s.success) return res.status(400).json({ error: "Invalid input" });
  if (get("SELECT id FROM users WHERE email = ?", [s.data.email])) return res.status(409).json({ error: "Email exists" });
  const id = randomUUID();
  const existingCount = get<any>("SELECT COUNT(*) as c FROM users")?.c || 0;
  const role = existingCount === 0 ? "admin" : "user";
  run("INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)", [id, s.data.email, await bcrypt.hash(s.data.password, 10), s.data.name, role]);
  const u = get<any>("SELECT * FROM users WHERE id = ?", [id]);
  res.json({ token: sign(u), user: { id, email: u.email, name: u.name, role: u.role } });
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const u = get<any>("SELECT * FROM users WHERE email = ?", [email || ""]);
  if (!u || !(await bcrypt.compare(String(password || ""), u.password_hash))) return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: sign(u), user: { id: u.id, email: u.email, name: u.name, role: u.role } });
});

router.post("/auth/demo", async (_req, res) => {
  let u = get<any>("SELECT * FROM users WHERE email = ?", ["demo@researchlens.ai"]);
  if (!u) {
    const id = randomUUID();
    run("INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)", [id, "demo@researchlens.ai", await bcrypt.hash(randomUUID(), 8), "Demo Researcher", "user"]);
    u = get<any>("SELECT * FROM users WHERE id = ?", [id]);
  }
  res.json({ token: sign(u), user: { id: u.id, email: u.email, name: u.name, role: u.role } });
});

/** Anonymous identity. Lets the frontend recover from a 401 without a login form. */
router.post("/auth/guest", (_req, res) => {
  const id = randomUUID();
  const email = `guest_${id.slice(0, 8)}@guest.researchlens.local`;
  run("INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)", [id, email, randomUUID(), "Guest Researcher", "user"]);
  const u = get<any>("SELECT * FROM users WHERE id = ?", [id]);
  res.json({ token: sign(u), user: { id: u.id, email: u.email, name: u.name, role: u.role } });
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
    if (ok) cb(null, true);
    else cb(new Error("Only PDF, DOCX, TXT allowed"));
  },
});

router.post("/upload", auth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const id = randomUUID();
    run("INSERT INTO documents (id, user_id, filename, mime, size_bytes, status, stage, progress) VALUES (?,?,?,?,?,?,?,?)",
      [id, (req as any).user.id, req.file.originalname, req.file.mimetype, req.file.size, "processing", "QUEUED", 2]);
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

/* Static segments must be registered BEFORE "/papers/:id" — Express matches
   in registration order, so "/papers/saved" would otherwise be swallowed by
   the ":id" parameter and answer 404. */
router.get("/papers/saved", auth, (req, res) => {
  const userId = (req as any).user.id;
  const rows = all<any>("SELECT p.* FROM papers p JOIN saved_papers sp ON sp.paper_id = p.id WHERE sp.user_id = ? ORDER BY sp.saved_at DESC", [userId]);
  res.json(rows.map((p: any) => ({ ...p, authors: authorsOf(p.id), is_demo: Boolean(p.is_demo) })));
});

router.get("/papers/:id", (req, res) => {
  const p = get<any>("SELECT * FROM papers WHERE id = ?", [req.params.id]);
  if (!p) return res.status(404).json({ error: "Not found" });
  const chunks = all<any>("SELECT section, substr(content,1,600) AS excerpt FROM paper_chunks WHERE paper_id = ? LIMIT 6", [p.id]);
  res.json({ ...p, authors: authorsOf(p.id), chunks, is_demo: Boolean(p.is_demo) });
});

/** Side-by-side comparison of 2–5 papers.
 *  Semantic = cosine over chunk embeddings, lexical = Jaccard over title+abstract.
 *  Reported separately, never conflated (same honesty rule as the report). */
router.post("/papers/compare", (req, res) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (ids.length < 2) return res.status(400).json({ error: "Provide at least 2 paper ids" });
  if (ids.length > 5) return res.status(400).json({ error: "At most 5 papers can be compared at once" });

  const papers = ids.map((id) => get<any>("SELECT * FROM papers WHERE id = ?", [id]));
  if (papers.some((p) => !p)) return res.status(404).json({ error: "One or more papers not found" });

  const meta = new Map(papers.map((p: any) => [p.id, p]));
  const topicsOf = (pid: string) => all<any>(
    "SELECT t.name FROM paper_topics pt JOIN topics t ON t.id = pt.topic_id WHERE pt.paper_id = ?", [pid]).map((r: any) => r.name);
  const authorsOfEach = new Map(papers.map((p: any) => [p.id, authorsOf(p.id)]));

  // Chunk embedding centroid per paper = mean of its chunk vectors.
  const centroid = new Map<string, number[]>();
  for (const p of papers as any[]) {
    const rows = all<any>("SELECT embedding FROM paper_chunks WHERE paper_id = ?", [p.id]);
    const acc = new Array(DIM).fill(0);
    let n = 0;
    for (const r of rows) {
      let emb: number[] = [];
      try { emb = JSON.parse(r.embedding); } catch { continue; }
      if (!emb.length) continue;
      for (let i = 0; i < Math.min(DIM, emb.length); i++) acc[i] += emb[i];
      n++;
    }
    if (n) {
      const norm = Math.sqrt(acc.reduce((s, v) => s + v * v, 0)) || 1;
      centroid.set(p.id, acc.map((v) => v / norm));
    }
  }

  const pairs: any[] = [];
  for (let i = 0; i < papers.length; i++) {
    for (let j = i + 1; j < papers.length; j++) {
      const a = papers[i] as any, b = papers[j] as any;
      const ca = centroid.get(a.id), cb = centroid.get(b.id);
      const semantic = ca && cb ? Math.max(0, cosine(ca, cb)) : 0;
      const lexical = jaccard(`${a.title} ${a.abstract}`, `${b.title} ${b.abstract}`);
      const ta = topicsOf(a.id), tb = topicsOf(b.id);
      const sharedTopics = ta.filter((t) => tb.includes(t));
      const sharedAuthors = (authorsOfEach.get(a.id) || []).filter((n) => (authorsOfEach.get(b.id) || []).includes(n));
      pairs.push({
        a: a.id, b: b.id,
        aTitle: a.title, bTitle: b.title,
        semantic: Math.round(semantic * 100),
        lexical: Math.round(lexical * 100),
        combined: Math.round((0.6 * semantic + 0.4 * lexical) * 100),
        sharedTopics, sharedAuthors,
        yearGap: Math.abs((a.year || 0) - (b.year || 0)),
        note: "Scores measure relatedness between indexed text, not quality or plagiarism.",
      });
    }
  }
  const avg = pairs.length ? Math.round(pairs.reduce((s, p) => s + p.combined, 0) / pairs.length) : 0;
  const top = [...pairs].sort((a, b) => b.combined - a.combined)[0];
  res.json({
    papers: (papers as any[]).map((p) => ({
      id: p.id, title: p.title, authors: authorsOfEach.get(p.id) || [], year: p.year,
      venue: p.venue, citationCount: p.citation_count || 0, abstract: (p.abstract || "").slice(0, 600),
      topics: topicsOf(p.id), isDemo: Boolean(p.is_demo),
    })),
    pairs,
    summary: {
      averageCombined: avg,
      mostSimilar: top ? { a: top.a, b: top.b, aTitle: top.aTitle, bTitle: top.bTitle, combined: top.combined } : null,
      sharedTopicCount: new Set(pairs.flatMap((p) => p.sharedTopics)).size,
    },
  });
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

/* ---------- citation graph (C engine: BFS / DFS / components / PageRank) ---------- */
router.get("/citations/graph", async (_req, res) => {
  const edges = all<any>("SELECT citing_paper_id, cited_paper_id FROM citations");
  if (!edges.length) {
    return res.json({
      nodes: [], edges: [], numComponents: 0, bfsOrder: [], algorithms: [],
      stats: { nodes: 0, edges: 0, papers: 0 },
      note: "No citations indexed yet. Run an ingestion job to populate the graph.",
    });
  }
  // Stable node ordering (sorted by id) keeps the graph deterministic across calls.
  const ids = [...new Set(edges.flatMap((e) => [e.citing_paper_id, e.cited_paper_id]))].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const pairs: [number, number][] = edges
    .filter((e) => index.has(e.citing_paper_id) && index.has(e.cited_paper_id))
    .map((e) => [index.get(e.citing_paper_id)!, index.get(e.cited_paper_id)!] as [number, number]);

  const papers = new Map(all<any>("SELECT id, title, year, citation_count, is_demo FROM papers").map((p: any) => [p.id, p]));
  let engine: any = null;
  try { engine = await cGraph(ids.length, pairs, 0); }
  catch (e: any) { console.log("[graph] C engine unavailable:", e.message); }

  const pagerank: number[] = engine?.pagerank || ids.map(() => 0);
  const distances: number[] = engine?.distances || ids.map(() => -1);
  const components: number[] = engine?.components || ids.map(() => 0);

  res.json({
    nodes: ids.map((id, i) => {
      const p: any = papers.get(id);
      return {
        id, index: i,
        title: p?.title || "Unknown paper",
        year: p?.year ?? null,
        citationCount: p?.citation_count || 0,
        isDemo: Boolean(p?.is_demo),
        pagerank: Number((pagerank[i] ?? 0).toFixed(6)),
        distance: distances[i] ?? -1,
        component: components[i] ?? 0,
      };
    }),
    edges: pairs.map(([s, t]) => ({ source: s, target: t, from: ids[s], to: ids[t] })),
    numComponents: engine?.num_components ?? new Set(components).size,
    bfsOrder: (engine?.bfs_order || []).map((i: number) => ids[i]).filter(Boolean),
    algorithms: engine?.algorithms || [],
    stats: { nodes: ids.length, edges: pairs.length, papers: papers.size },
    note: "PageRank reflects citation position only — it is not a measure of research quality.",
  });
});

/* ---------- knowledge base stats ---------- */
router.get("/knowledge-base/stats", (_req, res) => {
  const papers = all<any>("SELECT id, year, is_demo, citation_count FROM papers");
  const chunks = get<any>("SELECT COUNT(*) AS c FROM paper_chunks")?.c || 0;
  const authors = get<any>("SELECT COUNT(*) AS c FROM authors")?.c || 0;
  const topics = get<any>("SELECT COUNT(*) AS c FROM topics")?.c || 0;
  const citations = get<any>("SELECT COUNT(*) AS c FROM citations")?.c || 0;
  const years = papers.map((p: any) => p.year).filter(Boolean).map(Number);
  const topicCount: Record<string, number> = {};
  for (const t of all<any>("SELECT t.name FROM paper_topics pt JOIN topics t ON t.id = pt.topic_id")) {
    topicCount[t.name] = (topicCount[t.name] || 0) + 1;
  }
  res.json({
    papers: papers.length,
    realPapers: papers.filter((p: any) => !p.is_demo).length,
    demoPapers: papers.filter((p: any) => p.is_demo).length,
    chunks, authors, topics, citations,
    avgChunksPerPaper: papers.length ? Math.round((chunks / papers.length) * 10) / 10 : 0,
    avgCitations: papers.length ? Math.round(papers.reduce((s: number, p: any) => s + (p.citation_count || 0), 0) / papers.length) : 0,
    yearRange: years.length ? { min: Math.min(...years), max: Math.max(...years) } : { min: null, max: null },
    topTopics: Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([topic, count]) => ({ topic, count })),
    embeddingProvider: provider(),
    embeddingDimension: DIM,
    cEngine: cEngineAvailable(),
  });
});

/* ---------- ingestion (OpenAlex / Crossref, demo fallback when offline) ---------- */
router.post("/ingest/start", auth, (req, res) => {
  const { domain = "", count = 20 } = req.body || {};
  const d = String(domain).trim();
  if (d.length < 2) return res.status(400).json({ error: "A research domain is required" });
  const target = Math.min(100, Math.max(1, Number(count) || 20));
  const jobId = startIngestJob(d, target);
  res.json({ jobId, id: jobId, status: "running", domain: d, targetCount: target });
});

router.get("/ingest/:id", auth, (req, res) => {
  const j = get<any>("SELECT * FROM ingestion_jobs WHERE id = ?", [req.params.id]);
  if (!j) return res.status(404).json({ error: "Not found" });
  let log: any[] = [];
  try { log = JSON.parse(j.log_json || "[]"); } catch { log = []; }
  res.json({ ...j, log });
});

/* ---------- literature review (grounded only in retrieved papers) ---------- */
router.post("/literature-review", auth, (req, res) => {
  const { topic = "", paperIds = [] } = req.body || {};
  const t = String(topic).trim();
  const ids: string[] = Array.isArray(paperIds) ? paperIds.map(String) : [];

  let papers: any[] = [];
  if (ids.length) {
    papers = ids.map((id) => get<any>("SELECT * FROM papers WHERE id = ?", [id])).filter(Boolean);
  } else if (t) {
    // No explicit selection: retrieve the closest indexed papers for the topic.
    const seen = new Set<string>();
    for (const { chunk } of semanticSearch(embedSync(t), 60)) {
      if (seen.has(chunk.paper_id)) continue;
      seen.add(chunk.paper_id);
      const p = get<any>("SELECT * FROM papers WHERE id = ?", [chunk.paper_id]);
      if (p) papers.push(p);
      if (papers.length >= 12) break;
    }
  }
  if (!papers.length) return res.status(404).json({ error: "No papers available to review. Ingest papers for this topic first." });

  const outline = literatureReviewOutline(t || "Retrieved literature", papers);
  res.json({
    ...outline,
    paperCount: papers.length,
    papers: papers.map((p: any) => ({
      id: p.id, title: p.title, year: p.year, venue: p.venue,
      authors: authorsOf(p.id), isDemo: Boolean(p.is_demo),
    })),
    retrieval: ids.length ? "explicit selection" : "semantic retrieval over indexed chunks",
  });
});
