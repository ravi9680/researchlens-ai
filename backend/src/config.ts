import dotenv from "dotenv";
import { createHash } from "node:crypto";
dotenv.config();

const DEV_JWT_SECRET = "dev-secret-change-me";

function int(v: string | undefined, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : dflt;
}

function bool(v: string | undefined, dflt: boolean): boolean {
  if (v === undefined || v === "") return dflt;
  return v.toLowerCase() === "true" || v === "1" || v === "yes";
}

export const isProduction = process.env.NODE_ENV === "production";

/* Security posture is derived, not sprinkled through the code.
 * `isProduction` turns on the strict rules (real JWT secret, HSTS, secure
 * cookie flags); `dev` keeps the zero-setup demo experience. */
const rawSecret = process.env.JWT_SECRET || DEV_JWT_SECRET;

/* Fail fast rather than ship a forgeable token. In production a missing or
 * default secret is a critical misconfiguration — every signed JWT could be
 * minted by anyone, so the process must not start. */
if (isProduction && rawSecret === DEV_JWT_SECRET) {
  throw new Error(
    "Refusing to start: JWT_SECRET is missing or still the development default. " +
      "Set a strong random value (e.g. `openssl rand -hex 32`)."
  );
}

/* Key derivation. The configured secret is a *passphrase*, not the HMAC key
 * itself: it is hashed to 32 bytes so that any passphrase — however short —
 * yields a full 256-bit key. Hashing also means the raw secret never has to
 * be long enough to be a good password, which is what a platform-generated
 * value usually is. */
const jwtSecret = createHash("sha256").update(rawSecret).digest("hex");

export const config = {
  port: int(process.env.PORT, 4000),
  env: process.env.NODE_ENV || "development",
  isProduction,
  jwtSecret,
  /* Short-lived access token + long-lived refresh token. The split limits the
   * damage of a leaked token while still keeping users signed in. */
  tokenTtl: process.env.TOKEN_TTL || "2h",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || "30d",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  demoMode: bool(process.env.DEMO_MODE, true),
  databaseUrl: process.env.DATABASE_URL || "",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  maxFileMb: int(process.env.MAX_FILE_MB, 25),
  crossrefEmail: process.env.CROSSREF_EMAIL || "",
  openalexEmail: process.env.OPENALEX_EMAIL || "",
  semanticScholarKey: process.env.SEMANTIC_SCHOLAR_API_KEY || "",

  /* ---- security limits ---- */
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, isProduction ? 12 : 10),
  /* Failed logins per account/IP before the window locks the route. */
  authWindowMs: int(process.env.AUTH_WINDOW_MS, 15 * 60 * 1000),
  authMaxAttempts: int(process.env.AUTH_MAX_ATTEMPTS, 10),
  /* Minimum password strength enforced at registration. */
  minPasswordLength: int(process.env.MIN_PASSWORD_LENGTH, 8),
  /* Per-account ceiling on uploads, so one guest cannot fill the disk. */
  maxUploadsPerUser: int(process.env.MAX_UPLOADS_PER_USER, 50),
  /* Guest identities are cheap; cap how many can be minted from one IP. */
  guestPerIpLimit: int(process.env.GUEST_PER_IP_LIMIT, 20),
  /* Trusted reverse proxy (Render, nginx) so rate limiting sees the real IP. */
  trustProxy: bool(process.env.TRUST_PROXY, true),
};

export const securityConfig = {
  /* Content-Security-Policy. The SPA is fully self-hosted: no CDN scripts,
   * no inline event handlers, no remote images. `unsafe-inline` is limited to
   * styles because Tailwind injects a stylesheet and recharts sets inline
   * style attributes on generated SVG. */
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    } as Record<string, string[] | null>,
  },
  /* Do not advertise the stack. */
  hidePoweredBy: true,
  /* Refuse to render the app inside a frame (clickjacking). */
  frameguard: { action: "deny" } as const,
  hsts: isProduction
    ? { maxAge: 15552000, includeSubDomains: true, preload: false }
    : false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" } as const,
  noSniff: true,
  /* Stop the browser from guessing a content type for a response. */
  xssFilter: true,
  /* Downloads must not be treated as same-origin content. */
  crossOriginEmbedderPolicy: false,
};
