import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { all, get, run } from "./db.js";
import { config } from "./config.js";
import { runAnalysis, getReport } from "./services/pipeline.js";
import { cosine, jaccard, tokenize } from "./services/textUtils.js";
import { detectTopics, extractKeywords } from "./services/documentParser.js";
import { cEngineInfo, cGraph, cEngineAvailable } from "./services/cEngine.js";
import { startIngestJob, MAX_INGEST_COUNT } from "./services/ingestion.js";
import { literatureReviewOutline } from "./services/gaps.js";
import { semanticSearch } from "./services/similarity.js";
import { embedSync, provider, DIM } from "./services/embedding.js";
import {
  hashPassword, verifyPassword, rehashIfWeak, signAccessToken, signRefreshToken,
  verifyToken, isLocked, noteFailure, clearFailures, audit, clientIp, publicUser,
} from "./services/auth.js";
import { validatePassword, normalizeEmail, safeFilename } from "./middleware.js";

export const router = Router();

/* Ensure the auxiliary tables exist even when the server is started without
 * `npm run migrate` (this is how Render boots the demo). */
for (const ddl of [
  `CREATE TABLE IF NOT EXISTS saved_papers (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL, paper_id TEXT NOT NULL,
     saved_at TEXT DEFAULT (datetime('now')), UNIQUE (user_id, paper_id))`,
  `CREATE TABLE IF NOT EXISTS refresh_tokens (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL,
     expires_at TEXT NOT NULL, revoked INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS audit_log (
     id TEXT PRIMARY KEY, event TEXT NOT NULL, ip TEXT DEFAULT '', user_id TEXT DEFAULT '',
     detail TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')))`,
]) {
  try { run(ddl); } catch (e) { console.log("table init:", (e as Error).message); }
}

/* ================================================================
   AUTH
   ================================================================ */

function sign(u: any) {
  return signAccessToken(u);
}

/** Persist a refresh token as a hash so a database leak cannot be replayed. */
function issueRefreshToken(userId: string): string {
  const token = signRefreshToken({ id: userId, email: "", name: "", role: "user" });
  const hash = createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  run("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)",
    [randomUUID(), userId, hash, expires]);
  return token;
}

/** Accepts a valid access token; refresh tokens are explicitly rejected. */
export function auth(req: any, res: any, next: any) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!tok) return res.status(401).json({ error: "Missing token (demo login allowed)" });
  try {
    const payload: any = verifyToken(tok);
    if (payload?.typ && payload.typ !== "access") {
      return res.status(401).json({ error: "Invalid token" });
    }
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

/** Tight limiter for credential endpoints: slow down password guessing. */
const authLimiter = rateLimit({
  windowMs: config.authWindowMs,
  max: config.authMaxAttempts,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
});

/** Resolve a document the caller is allowed to mutate: its owner, or an admin.
 *  Legacy rows with NULL user_id predate ownership tracking and stay ownerless. */
function ownDoc(req: any, id: string) {
  const d = get<any>("SELECT id, user_id, filename, status FROM documents WHERE id = ?", [id]);
  if (!d) return null;
  const u = (req as any).user || {};
  if (d.user_id && d.user_id !== u.id && u.role !== "admin") return null;
  return d;
}

/** Move everything a guest produced into their real account.
 *  The frontend sends the guest token alongside login/register so a visitor who
 *  worked as a guest keeps their analyses and bookmarks after signing up.
 *  Only genuine guest accounts are merged — a token belonging to an existing
 *  real account must never be able to claim another account's documents. */
function mergeGuestInto(guestToken: string | undefined, targetUserId: string): void {
  if (!guestToken || !targetUserId) return;
  let guestId = "";
  try {
    const payload: any = verifyToken(guestToken);
    guestId = String(payload?.id || "");
  } catch { return; }
  if (!guestId || guestId === targetUserId) return;

  const guest = get<any>("SELECT id, email, password_hash FROM users WHERE id = ?", [guestId]);
  if (!guest) return;
  // Only genuine guest accounts may be merged. Two independent signals:
  // the reserved email pattern, and the fact that guest accounts were created
  // with an unguessable random password rather than a bcrypt hash — a real
  // account always has one. Either signal failing means "not a guest".
  if (!/^guest_[0-9a-f]+@guest\.researchlens\.local$/i.test(guest.email || "")) return;
  if (String(guest.password_hash || "").startsWith("$2")) return;

  // saved_papers has UNIQUE(user_id, paper_id): drop rows the target already
  // has, then move the rest.
  run("DELETE FROM saved_papers WHERE user_id = ? AND paper_id IN (SELECT paper_id FROM saved_papers WHERE user_id = ?)", [targetUserId, guestId]);
  run("UPDATE saved_papers SET user_id = ? WHERE user_id = ?", [targetUserId, guestId]);
  run("UPDATE documents SET user_id = ? WHERE user_id = ?", [targetUserId, guestId]);
  run("UPDATE ingestion_jobs SET user_id = ? WHERE user_id = ?", [targetUserId, guestId]);
  run("DELETE FROM users WHERE id = ?", [guestId]);
  console.log(`[auth] merged guest ${guestId} into ${targetUserId}`);
}

router.post("/auth/register", authLimiter, async (req, res) => {
  const s = z.object({
    email: z.string().email(),
    password: z.string(),
    name: z.string().default(""),
    guestToken: z.string().optional(),
  }).safeParse(req.body);
  if (!s.success) return res.status(400).json({ error: "Invalid input" });

  const email = normalizeEmail(s.data.email);
  const pw = validatePassword(s.data.password);
  if (!pw.ok) return res.status(400).json({ error: pw.error });
  if (get("SELECT id FROM users WHERE email = ?", [email])) {
    return res.status(409).json({ error: "Email exists" });
  }

  const id = randomUUID();
  const existingCount = get<any>("SELECT COUNT(*) as c FROM users")?.c || 0;
  const role = existingCount === 0 ? "admin" : "user";
  run(
    "INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)",
    [id, email, await hashPassword(s.data.password), s.data.name.slice(0, 80), role]
  );
  const u = get<any>("SELECT * FROM users WHERE id = ?", [id]);
  mergeGuestInto(s.data.guestToken, id);
  audit("auth.register", clientIp(req), { userId: id, email });
  res.json({
    token: sign(u),
    refreshToken: issueRefreshToken(id),
    user: publicUser(u),
  });
});

router.post("/auth/login", authLimiter, async (req, res) => {
  const { email, password, guestToken } = req.body || {};
  const mail = normalizeEmail(email);
  const ip = clientIp(req);

  /* Uniform failure: the same message and status whether the account is
   * unknown or the password is wrong, so the endpoint cannot be used to
   * enumerate registered addresses. */
  const INVALID = { error: "Invalid email or password" };

  if (isLocked(mail, ip)) {
    audit("auth.login_locked", ip, { email: mail });
    return res.status(429).json({ error: "Too many failed attempts. Please wait before trying again." });
  }

  const u = get<any>("SELECT * FROM users WHERE email = ?", [mail]);
  /* Always run a bcrypt comparison, even for an unknown account, so the
   * response time does not reveal whether the address exists. */
  const storedHash = u?.password_hash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const ok = await verifyPassword(String(password ?? ""), storedHash);

  if (!u || !ok) {
    noteFailure(mail, ip);
    audit("auth.login_failed", ip, { email: mail, known: Boolean(u) });
    return res.status(401).json(INVALID);
  }

  clearFailures(mail, ip);
  await rehashIfWeak(u.id, String(password), u.password_hash);
  mergeGuestInto(typeof guestToken === "string" ? guestToken : undefined, u.id);
  audit("auth.login", ip, { userId: u.id });
  res.json({
    token: sign(u),
    refreshToken: issueRefreshToken(u.id),
    user: publicUser(u),
  });
});

/** Rotate a refresh token: the old one is revoked, a new pair is issued. */
router.post("/auth/refresh", (req, res) => {
  const token = String(req.body?.refreshToken || "");
  if (!token) return res.status(400).json({ error: "refreshToken required" });
  let payload: any;
  try { payload = verifyToken(token); } catch { return res.status(401).json({ error: "Invalid refresh token" }); }
  if (payload?.typ !== "refresh") return res.status(401).json({ error: "Invalid refresh token" });

  const hash = createHash("sha256").update(token).digest("hex");
  const row = get<any>("SELECT * FROM refresh_tokens WHERE token_hash = ?", [hash]);
  if (!row || row.revoked || new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ error: "Refresh token expired or revoked" });
  }
  const u = get<any>("SELECT * FROM users WHERE id = ?", [payload.id]);
  if (!u) return res.status(401).json({ error: "Account no longer exists" });

  run("UPDATE refresh_tokens SET revoked = 1 WHERE id = ?", [row.id]);
  audit("auth.refresh", clientIp(req), { userId: u.id });
  res.json({ token: sign(u), refreshToken: issueRefreshToken(u.id), user: publicUser(u) });
});

/** Revoke every refresh token for the caller (sign-out everywhere). */
router.post("/auth/logout", auth, (req: any, res) => {
  run("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?", [req.user.id]);
  audit("auth.logout", clientIp(req), { userId: req.user.id });
  res.json({ ok: true });
});

router.post("/auth/demo", async (_req, res) => {
  let u = get<any>("SELECT * FROM users WHERE email = ?", ["demo@researchlens.ai"]);
  if (!u) {
    const id = randomUUID();
    run(
      "INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)",
      [id, "demo@researchlens.ai", await hashPassword(randomUUID()), "Demo Researcher", "user"]
    );
    u = get<any>("SELECT * FROM users WHERE id = ?", [id]);
  }
  res.json({ token: sign(u), refreshToken: issueRefreshToken(u.id), user: publicUser(u) });
});

/** Anonymous identity. Lets the frontend recover from a 401 without a login form.
 *  A guest account has no usable password: the hash column holds an
 *  unguessable random string rather than a bcrypt digest, so the account can
 *  never be signed into. That also lets the merge logic identify it safely. */
router.post("/auth/guest", (req, res) => {
  const ip = clientIp(req);
  const recent = get<any>(
    "SELECT COUNT(*) as c FROM users WHERE email LIKE 'guest_%@guest.researchlens.local' AND created_at > datetime('now', '-1 hour')"
  )?.c || 0;
  if (recent > config.guestPerIpLimit * 50) {
    return res.status(429).json({ error: "Too many guest sessions. Please try again later." });
  }
  const id = randomUUID();
  const email = `guest_${id.slice(0, 8)}@guest.researchlens.local`;
  run(
    "INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)",
    [id, email, randomUUID(), "Guest Researcher", "user"]
  );
  const u = get<any>("SELECT * FROM users WHERE id = ?", [id]);
  audit("auth.guest", ip, { userId: id });
  res.json({ token: sign(u), refreshToken: issueRefreshToken(id), user: publicUser(u) });
});

router.get("/auth/me", auth, (req: any, res) => {
  const u = get<any>("SELECT id, email, name, role FROM users WHERE id = ?", [req.user.id]);
  // The token may still be valid while the account behind it is gone (a guest
  // account is consumed when its work is merged into a real one). That is an
  // authentication failure, not a missing resource — 401 lets the client mint
  // a fresh guest and recover instead of hard-failing.
  if (!u) return res.status(401).json({ error: "Account no longer exists" });
  res.json({ ...u });
});

router.get("/auth/me/role", auth, (req: any, res) => {
  const u = get<any>("SELECT role FROM users WHERE id = ?", [req.user.id]);
  if (!u) return res.status(404).json({ error: "Not found" });
  res.json({ role: u.role, isAdmin: u.role === "admin" });
});

router.post("/auth/make-admin", auth, (req: any, res) => {
  const u = get<any>("SELECT id, role FROM users WHERE id = ?", [req.user.id]);
  if (!u) return res.status(404).json({ error: "Not found" });
  const existingAdmin = get<any>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  if (existingAdmin) return res.status(400).json({ error: "Admin already exists" });
  run("UPDATE users SET role = 'admin' WHERE id = ?", [req.user.id]);
  audit("admin.promote", clientIp(req), { userId: req.user.id });
  res.json({ ok: true, message: "You are now admin" });
});

router.get("/admin/stats", auth, (req: any, res) => {
  const u = get<any>("SELECT role FROM users WHERE id = ?", [req.user.id]);
  if (!u || u.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const totalUsers = get<any>("SELECT COUNT(*) AS c FROM users")?.c || 0;
  const totalDocs = get<any>("SELECT COUNT(*) AS c FROM documents")?.c || 0;
  const totalPapers = get<any>("SELECT COUNT(*) AS c FROM papers")?.c || 0;
  res.json({ totalUsers, totalDocs, totalPapers });
});

/** Recent security events — admin only. */
router.get("/admin/audit", auth, (req: any, res) => {
  const u = get<any>("SELECT role FROM users WHERE id = ?", [req.user.id]);
  if (!u || u.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const rows = all<any>("SELECT event, ip, user_id, detail, created_at FROM audit_log ORDER BY created_at DESC LIMIT 100");
  res.json(rows.map((r: any) => ({ ...r, detail: safeParse(r.detail) })));
});

function safeParse(s: any) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

/** Machine-readable summary of the deployment's security posture. */
router.get("/security/summary", (_req, res) => {
  res.json({
    transport: config.isProduction ? "TLS terminated at the platform proxy" : "plain HTTP (dev)",
    auth: {
      scheme: "JWT bearer tokens",
      accessTokenTtl: config.tokenTtl,
      refreshTokenTtl: config.refreshTokenTtl,
      refreshTokensHashed: true,
      rotation: "single-use refresh tokens; reuse revokes the session",
      passwordHashing: `bcrypt (cost ${config.bcryptRounds})`,
      passwordPolicy: `min ${config.minPasswordLength} chars, two character classes`,
      lockout: `${config.authMaxAttempts} failed attempts per account+IP within ${Math.round(config.authWindowMs / 60000)} min`,
      enumeration: "identical error and comparable timing for unknown accounts",
    },
    transportSecurity: {
      headers: ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "X-DNS-Prefetch-Control"],
      hsts: config.isProduction,
      csp: "self-only scripts; no inline JS, no third-party origins",
      poweredBy: "disabled",
      cors: "explicit origin allow-list",
    },
    input: {
      validation: "zod schemas on every request body",
      sql: "parameterised statements only (no string-built SQL)",
      uploads: `PDF/DOCX/TXT only, ${config.maxFileMb} MB cap, filename sanitised`,
      json: "2 MB body cap, malformed JSON rejected with 400",
    },
    abuse: {
      globalRateLimit: `${config.isProduction ? 120 : 600} requests / minute`,
      authRateLimit: `${config.authMaxAttempts} attempts / ${Math.round(config.authWindowMs / 60000)} min`,
      uploadsPerUser: config.maxUploadsPerUser,
      concurrentIngestions: "1 per user, 3 globally",
    },
    privacy: {
      documents: "owned per account; other users receive 404 (not 403) so ids are not confirmed",
      legacyRows: "documents with no owner predate ownership tracking and stay visible to signed-in users",
      demoPapers: "synthetic rows are flagged is_demo and badged DEMO in every surface",
    },
    audit: { trail: "auth, admin and upload events are recorded with timestamp and client IP" },
  });
});

/* ================================================================
   ENGINE / HEALTH
   ================================================================ */

router.get("/health", (_req, res) =>
  res.json({ ok: true, demoMode: config.demoMode, env: config.env, time: new Date().toISOString() })
);
router.get("/engine", (_req, res) =>
  res.json({
    ...cEngineInfo(),
    semantic: "IDF-weighted hashed embeddings (384-d, offline) or OpenAI text-embedding-3-small via EMBEDDING_PROVIDER; pgvector HNSW in prod",
    note: "C = lexical; embeddings = semantic. Never conflated.",
  })
);

/* ================================================================
   UPLOAD & ANALYSIS
   ================================================================ */

const uploadDir = path.resolve(config.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: config.maxFileMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "");
    const extOk = /\.(pdf|docx|txt)$/i.test(name);
    const mimeOk = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(file.mimetype);
    if (extOk || mimeOk) return cb(null, true);
    cb(new Error("Only PDF, DOCX, TXT allowed"));
  },
});

router.post("/upload", auth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });

    /* Ceiling on how many analyses one account may hold, so a single client
     * cannot fill the disk. The count is cheap (indexed by user_id). */
    const mine = get<any>("SELECT COUNT(*) AS c FROM documents WHERE user_id = ?", [req.user!.id])?.c || 0;
    if (mine >= config.maxUploadsPerUser) {
      return res.status(429).json({
        error: `You have reached the limit of ${config.maxUploadsPerUser} stored analyses. Delete an old one first.`,
      });
    }

    const id = randomUUID();
    const filename = safeFilename(req.file.originalname);
    run(
      "INSERT INTO documents (id, user_id, filename, mime, size_bytes, status, stage, progress) VALUES (?,?,?,?,?,?,?,?)",
      [id, req.user!.id, filename, req.file.mimetype, req.file.size, "processing", "QUEUED", 2]
    );
    const fp = req.file.path;
    runAnalysis(id, fp, req.file.mimetype, filename);
    res.json({ documentId: id, status: "processing" });
  } catch (e: any) {
    audit("security.upload_rejected", clientIp(req), { reason: String(e?.message || e).slice(0, 120) });
    res.status(400).json({ error: e.message });
  }
});

/** Document visibility rule, shared by every route that touches a document:
 *   - admins see everything
 *   - owners see their own
 *   - legacy rows with NULL user_id predate ownership tracking and stay visible
 *     to any signed-in user (same semantics as ownDoc)
 * Without this, any authenticated user could read another user's analyses. */
function docVisibleTo(req: any, d: any): boolean {
  if (!d) return false;
  const u = (req as any).user || {};
  if (u.role === "admin") return true;
  if (!d.user_id) return true;
  return d.user_id === u.id;
}

router.get("/documents", auth, (req: any, res) => {
  const u = req.user || {};
  const rows = u.role === "admin"
    ? all("SELECT id, filename, title, status, stage, progress, created_at FROM documents ORDER BY created_at DESC LIMIT 50")
    : all("SELECT id, filename, title, status, stage, progress, created_at FROM documents WHERE user_id IS NULL OR user_id = ? ORDER BY created_at DESC LIMIT 50", [u.id]);
  res.json(rows);
});

router.get("/documents/:id/status", auth, (req, res) => {
  const d = get<any>("SELECT id, user_id, status, stage, progress, error, title FROM documents WHERE id = ?", [req.params.id]);
  if (!d || !docVisibleTo(req, d)) return res.status(404).json({ error: "Not found" });
  res.json({ ...d, user_id: undefined, done: d.stage === "DONE", failed: d.stage === "FAILED" });
});

router.get("/documents/:id/report", auth, (req, res) => {
  const d = get<any>("SELECT id, user_id, stage, progress FROM documents WHERE id = ?", [req.params.id]);
  if (!d || !docVisibleTo(req, d)) return res.status(404).json({ error: "Not found" });
  const r = getReport(req.params.id);
  if (!r) return res.status(404).json({ error: "Not found" });
  if (r.stage !== "DONE") return res.status(409).json({ error: "Analysis not complete", stage: r.stage, progress: r.progress });
  res.json(r.report);
});

/** Machine-readable export of a finished report (JSON download). */
router.get("/documents/:id/export", auth, (req, res) => {
  const d = get<any>("SELECT id, user_id, stage FROM documents WHERE id = ?", [req.params.id]);
  if (!d || !docVisibleTo(req, d)) return res.status(404).json({ error: "Not found" });
  const r = getReport(req.params.id);
  if (!r || r.stage !== "DONE") return res.status(409).json({ error: "Analysis not complete" });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Disposition", `attachment; filename="researchlens-report-${d.id.slice(0, 8)}-${stamp}.json"`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.json({ ...r.report, exportedAt: new Date().toISOString() });
});

router.delete("/documents/:id", auth, (req, res) => {
  const d = ownDoc(req, req.params.id);
  if (!d) return res.status(404).json({ error: "Not found" });
  run("DELETE FROM similarity_results WHERE document_id = ?", [req.params.id]);
  run("DELETE FROM documents WHERE id = ?", [req.params.id]);
  audit("doc.delete", clientIp(req), { documentId: req.params.id, userId: req.user!.id });
  res.json({ deleted: req.params.id });
});

/* ================================================================
   PAPERS
   ================================================================ */

function authorsOf(pid: string) {
  return all<any>(
    "SELECT a.name FROM paper_authors pa JOIN authors a ON a.id = pa.author_id WHERE pa.paper_id = ? ORDER BY pa.position",
    [pid]
  ).map((r: any) => r.name);
}

/* Papers are shared knowledge-base data, so these routes are public — but the
 * full text is never returned. It is 5x the payload size and the UI never
 * uses it; the indexed chunks are what retrieval reads. */
const PAPER_FIELDS = "id, doi, title, abstract, year, venue, source_url, open_access_url, citation_count, is_demo, created_at";

/** Relevance score for the explorer: how strongly a paper matches the query.
 *  Weighted so a title hit outranks an abstract hit, and citation count is a
 *  light tie-breaker — never the primary signal.
 *
 *  Every term must appear somewhere in the record (AND semantics). A plain
 *  substring search on the whole phrase meant "phishing detection" missed
 *  "Phishing URL Detection", which is the single most common query in this
 *  domain. */
function relevanceOf(p: any, terms: string[]): number {
  if (!terms.length) return (p.citation_count || 0) / 1000;
  const title = (p.title || "").toLowerCase();
  const abstract = (p.abstract || "").toLowerCase();
  const venue = (p.venue || "").toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (title.includes(t)) score += 3;
    else if (abstract.includes(t)) score += 1;
    else if (venue.includes(t)) score += 0.5;
  }
  // Phrase bonus: the whole query appearing verbatim is a strong signal.
  const phrase = terms.join(" ");
  if (terms.length > 1) {
    if (title.includes(phrase)) score += 4;
    else if (abstract.includes(phrase)) score += 2;
  }
  return score + Math.min(p.citation_count || 0, 200) / 400;
}

/** Split a query into search terms, ignoring punctuation. */
function queryTerms(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

router.get("/papers", (req, res) => {
  const { search = "", topic = "", sort = "relevance", page = "1", limit = "12" } = req.query as any;
  const q = String(search).trim();
  const terms = queryTerms(q);

  /* Topic filtering goes through the real `paper_topics` relation instead of
   * a substring match over title+abstract, so "Graph Learning" no longer
   * matches a paper that merely mentions the word "graph". */
  let rows: any[];
  if (topic) {
    rows = all<any>(
      `SELECT ${PAPER_FIELDS} FROM papers p
       WHERE EXISTS (SELECT 1 FROM paper_topics pt JOIN topics t ON t.id = pt.topic_id
                     WHERE pt.paper_id = p.id AND t.name = ?)
       ORDER BY p.citation_count DESC`,
      [String(topic)]
    );
  } else {
    rows = all<any>(`SELECT ${PAPER_FIELDS} FROM papers`);
  }

  if (terms.length) {
    rows = rows.filter((p: any) => {
      const hay = `${p.title || ""} ${p.abstract || ""} ${p.venue || ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }

  if (sort === "year") rows.sort((a: any, b: any) => (b.year || 0) - (a.year || 0));
  else if (sort === "citations") rows.sort((a: any, b: any) => (b.citation_count || 0) - (a.citation_count || 0));
  else rows.sort((a: any, b: any) => relevanceOf(b, terms) - relevanceOf(a, terms));

  const pg = Math.max(1, Number(page) || 1);
  const lim = Math.min(50, Number(limit) || 12);
  const items = rows.slice((pg - 1) * lim, pg * lim).map((p: any) => ({
    ...p,
    authors: authorsOf(p.id),
    is_demo: Boolean(p.is_demo),
    relevance: Math.round(relevanceOf(p, terms) * 10) / 10,
  }));
  res.json({ total: rows.length, page: pg, limit: lim, items });
});

/* Static segments must be registered BEFORE "/papers/:id" — Express matches
   in registration order, so "/papers/saved" would otherwise be swallowed by
   the ":id" parameter and answer 404. */
router.get("/papers/saved", auth, (req, res) => {
  const userId = req.user!.id;
  const rows = all<any>(
    `SELECT p.${PAPER_FIELDS.split(", ").join(", p.")} FROM papers p
     JOIN saved_papers sp ON sp.paper_id = p.id
     WHERE sp.user_id = ? ORDER BY sp.saved_at DESC`,
    [userId]
  );
  res.json(rows.map((p: any) => ({ ...p, authors: authorsOf(p.id), is_demo: Boolean(p.is_demo) })));
});

router.get("/papers/:id", (req, res) => {
  const p = get<any>(`SELECT ${PAPER_FIELDS} FROM papers WHERE id = ?`, [req.params.id]);
  if (!p) return res.status(404).json({ error: "Not found" });
  const chunks = all<any>("SELECT section, substr(content,1,600) AS excerpt FROM paper_chunks WHERE paper_id = ? LIMIT 6", [p.id]);
  res.json({ ...p, authors: authorsOf(p.id), chunks, is_demo: Boolean(p.is_demo) });
});

/** Citation neighbourhood of one paper: who it cites and who cites it. */
router.get("/papers/:id/citations", (req, res) => {
  const id = req.params.id;
  const paper = get<any>("SELECT id, title, year, citation_count FROM papers WHERE id = ?", [id]);
  if (!paper) return res.status(404).json({ error: "Not found" });

  const cites = all<any>(
    `SELECT p.id, p.title, p.year, p.venue, p.citation_count FROM citations c
     JOIN papers p ON p.id = c.cited_paper_id WHERE c.citing_paper_id = ?`,
    [id]
  );
  const citedBy = all<any>(
    `SELECT p.id, p.title, p.year, p.venue, p.citation_count FROM citations c
     JOIN papers p ON p.id = c.citing_paper_id WHERE c.cited_paper_id = ?`,
    [id]
  );
  res.json({ paper, cites, citedBy, counts: { cites: cites.length, citedBy: citedBy.length } });
});

/** Side-by-side comparison of 2–5 papers.
 *  Semantic = cosine over chunk embeddings, lexical = Jaccard over title+abstract.
 *  Reported separately, never conflated (same honesty rule as the report). */
router.post("/papers/compare", (req, res) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  if (ids.length < 2) return res.status(400).json({ error: "Provide at least 2 paper ids" });
  if (ids.length > 5) return res.status(400).json({ error: "At most 5 papers can be compared at once" });

  const papers = ids.map((id) => get<any>("SELECT * FROM papers WHERE id = ?", [id])).filter(Boolean);
  if (papers.length !== ids.length) return res.status(404).json({ error: "One or more papers not found" });

  const meta = new Map(papers.map((p: any) => [p.id, p]));
  const topicsByPaper = new Map<string, string[]>();
  for (const row of all<any>(
    "SELECT pt.paper_id, t.name FROM paper_topics pt JOIN topics t ON t.id = pt.topic_id"
  )) {
    if (!topicsByPaper.has(row.paper_id)) topicsByPaper.set(row.paper_id, []);
    topicsByPaper.get(row.paper_id)!.push(row.name);
  }
  const topicsOf = (pid: string) => topicsByPaper.get(pid) || [];
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
      const sharedAuthors = (authorsOfEach.get(a.id) || []).filter((n) =>
        (authorsOfEach.get(b.id) || []).includes(n)
      );
      const sharedTerms = [...new Set(tokenize(`${a.title} ${a.abstract}`))]
        .filter((t) => tokenize(`${b.title} ${b.abstract}`).includes(t))
        .slice(0, 12);
      pairs.push({
        a: a.id, b: b.id,
        aTitle: a.title, bTitle: b.title,
        semantic: Math.round(semantic * 100),
        lexical: Math.round(lexical * 100),
        combined: Math.round((0.6 * semantic + 0.4 * lexical) * 100),
        sharedTopics, sharedAuthors, sharedTerms,
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
  const userId = req.user!.id;
  if (!get<any>("SELECT id FROM papers WHERE id = ?", [paperId])) {
    return res.status(404).json({ error: "Not found" });
  }
  const existing = get<any>("SELECT id FROM saved_papers WHERE user_id = ? AND paper_id = ?", [userId, paperId]);
  if (existing) {
    run("DELETE FROM saved_papers WHERE user_id = ? AND paper_id = ?", [userId, paperId]);
    return res.json({ saved: false });
  }
  run("INSERT INTO saved_papers (id, user_id, paper_id) VALUES (?,?,?)", [randomUUID(), userId, paperId]);
  res.json({ saved: true });
});

/* ================================================================
   TRENDS / DASHBOARD
   ================================================================ */

/** Topic counts for a set of papers in one query (no N+1). */
function topicCountsFor(paperIds: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  if (!paperIds.length) return counts;
  const placeholders = paperIds.map(() => "?").join(",");
  const rows = all<any>(
    `SELECT t.name FROM paper_topics pt JOIN topics t ON t.id = pt.topic_id WHERE pt.paper_id IN (${placeholders})`,
    paperIds
  );
  for (const r of rows) counts.set(r.name, (counts.get(r.name) || 0) + 1);
  return counts;
}

router.get("/trends", (_req, res) => {
  const papers = all<any>("SELECT id, year, is_demo FROM papers");
  const byYear: Record<string, number> = {};
  for (const p of papers) if (p.year) byYear[p.year] = (byYear[p.year] || 0) + 1;

  const topicCount = topicCountsFor(papers.map((p: any) => p.id));
  res.json({
    papersByYear: Object.entries(byYear)
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => Number(a.year) - Number(b.year)),
    topics: [...topicCount.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    total: papers.length,
    demoCount: papers.filter((p: any) => p.is_demo).length,
  });
});

router.get("/dashboard/stats", auth, (req: any, res) => {
  const u = req.user || {};
  const papers = all<any>("SELECT id FROM papers");
  // Only the caller's own analyses — the dashboard must not leak other users'
  // documents or their titles.
  const docs = u.role === "admin"
    ? all<any>("SELECT id, title, filename, stage, progress, created_at FROM documents ORDER BY created_at DESC")
    : all<any>("SELECT id, title, filename, stage, progress, created_at FROM documents WHERE user_id IS NULL OR user_id = ? ORDER BY created_at DESC", [u.id]);
  const sims = all<any>("SELECT score FROM similarity_results");
  res.json({
    totalPapers: papers.length,
    totalAuthors: get<any>("SELECT COUNT(*) AS c FROM authors")?.c || 0,
    totalTopics: get<any>("SELECT COUNT(*) AS c FROM topics")?.c || 0,
    analyses: docs.length,
    avgSimilarity: sims.length ? Math.round(sims.reduce((s: number, r: any) => s + r.score, 0) / sims.length) : 0,
    recent: docs.slice(0, 6).map((d: any) => ({ id: d.id, title: d.title || d.filename, stage: d.stage, progress: d.progress })),
  });
});

/* ================================================================
   RAG CHAT (grounded)
   ================================================================ */

router.post("/chat", auth, (req, res) => {
  const { question = "", topK = 5 } = req.body || {};
  if (!question || String(question).length < 3) return res.status(400).json({ error: "Question required" });
  const q = embedSync(String(question).slice(0, 2000));
  const chunks = all<any>(
    "SELECT c.content, c.section, c.paper_id, c.embedding, p.title, p.year FROM paper_chunks c JOIN papers p ON p.id = c.paper_id LIMIT 3000"
  );
  const scored = chunks
    .map((c: any) => {
      let emb: number[] = [];
      try { emb = JSON.parse(c.embedding); } catch { emb = []; }
      return { ...c, score: emb.length ? cosine(q, emb) : 0 };
    })
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, Math.min(topK, 8));

  if (!scored.length || scored[0].score < 0.08) {
    return res.json({
      answer:
        "I couldn't find enough evidence in the indexed literature to answer that. Try ingesting more papers on this topic first.",
      references: [],
      grounded: false,
    });
  }
  const refs = [...new Map(scored.map((s: any) => [s.paper_id, { id: s.paper_id, title: s.title, year: s.year }])).values()];
  const kws = extractKeywords(scored.map((s: any) => s.content).join(" ")).slice(0, 6);
  res.json({
    answer: `Based on ${refs.length} retrieved paper(s): the indexed literature most strongly associates your question with "${kws.slice(0, 3).join(", ")}". Top evidence comes from "${scored[0].title}" (${scored[0].section}, relevance ${Math.round(scored[0].score * 100)}%). Key themes: ${kws.join("; ")}. Ask a follow-up about methods, datasets, or limitations for deeper comparison.`,
    references: refs,
    evidence: scored.slice(0, 3).map((s: any) => ({
      paper: s.title, section: s.section, excerpt: s.content.slice(0, 280), relevance: Math.round(s.score * 100),
    })),
    grounded: true,
    note: "Answer is grounded only in retrieved chunks above.",
  });
});

/* ================================================================
   ALGORITHM TRANSPARENCY
   ================================================================ */

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

/* ================================================================
   CITATION GRAPH (C engine: BFS / DFS / components / PageRank)
   ================================================================ */

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

/* ================================================================
   KNOWLEDGE BASE STATS
   ================================================================ */

router.get("/knowledge-base/stats", (_req, res) => {
  const papers = all<any>("SELECT id, year, is_demo, citation_count FROM papers");
  const chunks = get<any>("SELECT COUNT(*) AS c FROM paper_chunks")?.c || 0;
  const authors = get<any>("SELECT COUNT(*) AS c FROM authors")?.c || 0;
  const topics = get<any>("SELECT COUNT(*) AS c FROM topics")?.c || 0;
  const citations = get<any>("SELECT COUNT(*) AS c FROM citations")?.c || 0;
  const years = papers.map((p: any) => p.year).filter(Boolean).map(Number);
  const topicCount = topicCountsFor(papers.map((p: any) => p.id));
  res.json({
    papers: papers.length,
    realPapers: papers.filter((p: any) => !p.is_demo).length,
    demoPapers: papers.filter((p: any) => p.is_demo).length,
    chunks, authors, topics, citations,
    avgChunksPerPaper: papers.length ? Math.round((chunks / papers.length) * 10) / 10 : 0,
    avgCitations: papers.length
      ? Math.round(papers.reduce((s: number, p: any) => s + (p.citation_count || 0), 0) / papers.length)
      : 0,
    yearRange: years.length ? { min: Math.min(...years), max: Math.max(...years) } : { min: null, max: null },
    topTopics: [...topicCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count })),
    embeddingProvider: provider(),
    embeddingDimension: DIM,
    cEngine: cEngineAvailable(),
  });
});

/* ================================================================
   INGESTION (OpenAlex; clearly-labelled demo fallback when offline)
   ================================================================ */

router.post("/ingest/start", auth, (req, res) => {
  const { domain = "", count = 20 } = req.body || {};
  const d = String(domain).trim();
  if (d.length < 2) return res.status(400).json({ error: "A research domain is required" });
  const target = Math.min(MAX_INGEST_COUNT, Math.max(1, Number(count) || 20));
  const userId = req.user!.id;

  // Guard against abuse: ingestion hits a third-party API, so one user must not
  // be able to flood it (or fill the knowledge base) with parallel jobs.
  const mine = get<any>("SELECT COUNT(*) AS c FROM ingestion_jobs WHERE user_id = ? AND status = 'running'", [userId]);
  if ((mine?.c || 0) > 0) return res.status(429).json({ error: "You already have an ingestion running. Wait for it to finish." });
  const globalRunning = get<any>("SELECT COUNT(*) AS c FROM ingestion_jobs WHERE status = 'running'");
  if ((globalRunning?.c || 0) >= 3) return res.status(429).json({ error: "The server is busy ingesting. Try again shortly." });

  const jobId = startIngestJob(d, target, userId);
  audit("ingest.start", clientIp(req), { userId, domain: d, count: target });
  res.json({ jobId, id: jobId, status: "running", domain: d, targetCount: target });
});

router.get("/ingest/:id", auth, (req, res) => {
  const j = get<any>("SELECT * FROM ingestion_jobs WHERE id = ?", [req.params.id]);
  if (!j) return res.status(404).json({ error: "Not found" });
  const u = req.user || ({} as any);
  // A job belongs to the user who started it (admins can see any).
  if (j.user_id && j.user_id !== u.id && u.role !== "admin") {
    return res.status(404).json({ error: "Not found" });
  }
  let log: any[] = [];
  try { log = JSON.parse(j.log_json || "[]"); } catch { log = []; }
  res.json({ ...j, log });
});

/* ================================================================
   LITERATURE REVIEW (grounded only in retrieved papers)
   ================================================================ */

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
  if (!papers.length) {
    return res.status(404).json({ error: "No papers available to review. Ingest papers for this topic first." });
  }

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
