import { randomUUID } from "node:crypto";
import { config } from "./config.js";

/** Attach a request id and a start timestamp to every request.
 *  The id is echoed back in the `X-Request-Id` header so a user can quote it
 *  when reporting a failure, and it tags the server log lines. */
export function requestContext(req: any, res: any, next: any) {
  const id = (req.headers["x-request-id"] as string) || randomUUID();
  (req as any).requestId = id;
  (req as any).startedAt = Date.now();
  res.setHeader("X-Request-Id", id);
  next();
}

/** Global Express error handler.
 *  Shared by the real server and the API test app so both answer identically.
 *  Client mistakes (file too large, wrong type, too many files) must be a 400
 *  with a useful message — a bare 500 hides the real cause from the user. */
export function apiErrorHandler(err: any, req: any, res: any, _next: any) {
  // Multer's own errors are client mistakes, not server faults.
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: `File is too large. Maximum size is ${config.maxFileMb} MB.` });
  }
  if (err?.code === "LIMIT_UNEXPECTED_FILE" || err?.code === "LIMIT_FILE_COUNT") {
    return res.status(400).json({ error: "Upload a single file using the 'file' field." });
  }
  const msg = String(err?.message || "");
  if (msg.includes("Only PDF")) {
    return res.status(400).json({ error: msg });
  }
  // Body-parser rejects malformed JSON and oversized payloads.
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body." });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  console.error(`[api${req?.requestId ? ` ${req.requestId}` : ""}]`, err?.message || err);
  res.status(500).json({ error: "Internal error" });
}

/** Password strength policy, enforced at registration.
 *  Length is the dominant factor, so the floor is 8 characters and we also
 *  require some variety. The message never reveals which rule failed in a way
 *  that helps an attacker — it names the rule, not the secret. */
export function validatePassword(pw: unknown): { ok: true } | { ok: false; error: string } {
  const p = String(pw ?? "");
  if (p.length < config.minPasswordLength) {
    return { ok: false, error: `Password must be at least ${config.minPasswordLength} characters.` };
  }
  if (p.length > 200) return { ok: false, error: "Password is too long." };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(p)).length;
  if (classes < 2) {
    return { ok: false, error: "Password must mix at least two of: lowercase, uppercase, digits, symbols." };
  }
  if (/^(.)\1+$/.test(p)) {
    return { ok: false, error: "Password cannot be a single repeated character." };
  }
  return { ok: true };
}

/** Normalise an email for storage/lookup: trimmed, lowercased.
 *  Without this, "Ada@x.com" and "ada@x.com" become two accounts. */
export function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

/** Strip directory components and unsafe characters from an uploaded name.
 *  The file is written by multer to a generated path, but the original name
 *  is stored in the database and echoed back to the UI — it must never be
 *  able to masquerade as a path or smuggle control characters. */
export function safeFilename(name: unknown): string {
  return String(name ?? "")
    .replace(/[\\/]/g, "_")          // no directory separators
    .replace(/[^\w.\- ]+/g, "_")     // no control chars / shell metacharacters
    .replace(/\.{2,}/g, ".")         // no ".."
    .slice(0, 180)
    .trim() || "upload";
}
