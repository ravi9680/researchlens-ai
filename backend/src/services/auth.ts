import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { get, run } from "../db.js";

/* Authentication service.
 *
 * Security model:
 *  - Passwords are bcrypt-hashed with a configurable cost (12 rounds in prod).
 *  - Access tokens are short-lived; a rotating refresh token keeps users
 *    signed in without making a stolen access token valuable for long.
 *  - Failed sign-ins are counted per account+IP and answered with a uniform
 *    error, so the endpoint neither leaks whether an account exists nor lets
 *    one client grind through a password list.
 *  - Every auth event is written to an audit trail.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try { return await bcrypt.compare(plain, hash); } catch { return false; }
}

/** Re-hash on login when the stored cost is weaker than the current policy. */
export async function rehashIfWeak(userId: string, plain: string, storedHash: string): Promise<void> {
  try {
    const rounds = Number(storedHash.split("$")[2] || 0);
    if (rounds && rounds < config.bcryptRounds) {
      run("UPDATE users SET password_hash = ? WHERE id = ?", [await hashPassword(plain), userId]);
    }
  } catch { /* best effort — never block a login on this */ }
}

export function signAccessToken(u: AuthUser): string {
  return jwt.sign({ id: u.id, email: u.email, role: u.role, typ: "access" }, config.jwtSecret, {
    expiresIn: config.tokenTtl as any,
  });
}

export function signRefreshToken(u: AuthUser): string {
  /* A random `jti` makes every refresh token unique. Without it, two tokens
   * minted inside the same second would be byte-identical (same payload,
   * same iat/exp) and "rotation" would silently reuse the old token. */
  return jwt.sign(
    { id: u.id, typ: "refresh", jti: randomUUID() },
    config.jwtSecret,
    { expiresIn: config.refreshTokenTtl as any }
  );
}

export function verifyToken(token: string): any {
  return jwt.verify(token, config.jwtSecret);
}

/* ---------------- failed-login throttling ---------------- */

interface Attempt { count: number; first: number; }
const attempts = new Map<string, Attempt>();
const MAX_TRACKED = 10_000;

function attemptKey(email: string, ip: string): string {
  return `${email.toLowerCase()}|${ip}`;
}

/** True when this account/IP pair is currently locked out. */
export function isLocked(email: string, ip: string): boolean {
  const key = attemptKey(email, ip);
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > config.authWindowMs) {
    attempts.delete(key);
    return false;
  }
  return a.count >= config.authMaxAttempts;
}

export function noteFailure(email: string, ip: string): void {
  const key = attemptKey(email, ip);
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > config.authWindowMs) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    a.count++;
  }
  if (attempts.size > MAX_TRACKED) {
    // Cheap bound: drop the oldest half rather than growing without limit.
    const entries = [...attempts.entries()].sort((a2, b2) => a2[1].first - b2[1].first);
    for (const [k] of entries.slice(0, entries.length / 2)) attempts.delete(k);
  }
}

export function clearFailures(email: string, ip: string): void {
  attempts.delete(attemptKey(email, ip));
}

/* ---------------- audit trail ---------------- */

export type AuditEvent =
  | "auth.register" | "auth.login" | "auth.login_failed" | "auth.login_locked"
  | "auth.guest" | "auth.demo" | "auth.refresh" | "auth.logout"
  | "admin.promote" | "doc.delete" | "ingest.start" | "security.upload_rejected";

export function audit(event: AuditEvent, ip: string, detail: Record<string, any> = {}): void {
  const line = { at: new Date().toISOString(), event, ip, ...detail };
  console.log("[audit]", JSON.stringify(line));
}

/** Best-effort client IP behind a proxy. */
export function clientIp(req: any): string {
  const fwd = req.headers?.["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function publicUser(u: any): AuthUser {
  return { id: u.id, email: u.email, name: u.name || "", role: u.role || "user" };
}

/** Role of the account behind a token — used by admin-gated routes. */
export function roleOf(userId: string): string | undefined {
  return get<any>("SELECT role FROM users WHERE id = ?", [userId])?.role;
}
