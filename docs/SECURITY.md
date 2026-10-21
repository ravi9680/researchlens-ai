# Security

> The threat model, the controls that answer it, and how to verify each one.

Security here is not a wall of buzzwords — every control below is implemented,
exercised by an automated test, and (where possible) published by the running
server at `GET /api/security/summary` so the app and this document cannot drift
apart.

---

## 1. Threat model

| Adversary | Capability | Primary goal |
|---|---|---|
| **Anonymous visitor** | Can reach any public endpoint | Exhaust the server, or scrape the knowledge base |
| **Authenticated user** | Holds a valid token for their own account | Read or delete *another* account's analyses, or enumerate registered addresses |
| **Credential attacker** | Knows an email address | Guess the password at scale |
| **Hostile uploader** | Can POST arbitrary bytes | Store something dangerous, exhaust the disk, or make the parser misbehave |
| **Third party** | Controls a linked page | Inject content into the app (XSS), or frame it (clickjacking) |

The design assumption is that **the authenticated user is not necessarily
trustworthy**. An account is a convenience, not a privilege.

---

## 2. Controls

### 2.1 Transport & headers

| Control | Implementation | Verified by |
|---|---|---|
| Content-Security-Policy | `default-src 'self'`, `script-src 'self'` (no inline JS), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` | `backend/src/app.ts`, test *security headers* |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` | same test |
| MIME sniffing | `X-Content-Type-Options: nosniff` | same test |
| Referrer leakage | `Referrer-Policy: strict-origin-when-cross-origin` | same test |
| HSTS | Enabled in production only (315 days, `includeSubDomains`) | `config.ts` |
| Stack disclosure | `X-Powered-By` disabled, custom error bodies | same test |
| CORS | Explicit origin allow-list; production drops the localhost defaults | `app.ts` |
| Request ID | Every response carries `X-Request-Id`; the same id tags the server log | `middleware.ts` |

The CSP is deliberately strict: the SPA is fully self-hosted, so no CDN
script, no remote font and no inline event handler is needed.

### 2.2 Identity & token lifecycle

```
login / register ──► access token  (2 h,  JWT, sent as Authorization: Bearer)
                   └► refresh token (30 d, single use, SHA-256 hash at rest)
```

| Control | Implementation | Verified by |
|---|---|---|
| Short-lived access tokens | `TOKEN_TTL` default `2h` | `config.ts` |
| Refresh token rotation | Every refresh issues a new token and revokes the old one; a replayed token is rejected | test *refresh tokens › rotates* |
| Refresh tokens hashed at rest | Only `SHA-256(token)` is stored — a leaked database row cannot be replayed | test *stores only a hash* |
| Token type separation | A refresh token presented as an access token is rejected (`typ` claim) | test *refuses a refresh token used as an access token* |
| Unique refresh tokens | A random `jti` makes every token byte-distinct, so rotation really rotates | `services/auth.ts` |
| Logout revocation | `POST /api/auth/logout` revokes every refresh token for the account | `routes.ts` |
| Fail-fast secret | In production the process **refuses to boot** when `JWT_SECRET` is missing or still the development default | `config.ts` |
| Key derivation | The configured secret is a *passphrase*: it is SHA-256 hashed to 32 bytes before use as the HMAC key, so any passphrase yields a full 256-bit key and the raw value is never the signing key | `config.ts` |

### 2.3 Credentials

| Control | Implementation | Verified by |
|---|---|---|
| Password hashing | bcrypt, cost `BCRYPT_ROUNDS` (12 in production) | test *stores the password as a bcrypt hash* |
| Password policy | ≥8 characters and at least two character classes; no single repeated character | tests *password policy* |
| Key strengthening | The hash is re-computed at login when the stored cost is weaker than the current policy | `services/auth.ts` |
| No account enumeration | An unknown email and a wrong password return the **same status and message** | test *answers an unknown email exactly like a wrong password* |
| Timing resistance | A bcrypt comparison runs even for an unknown account, so response time does not reveal existence | `routes.ts` |
| Brute-force lockout | 10 failed attempts per account+IP inside a 15-minute window | `services/auth.ts` |

### 2.4 Input & upload safety

| Control | Implementation | Verified by |
|---|---|---|
| Body validation | zod schema on every request body | `routes.ts` |
| SQL injection | Parameterised statements only — no SQL is built by string concatenation | every query |
| Upload allow-list | PDF / DOCX / TXT by extension **and** MIME type | test *rejects a disallowed file type* |
| Size caps | 25 MB per file (multer), 2 MB JSON bodies | tests *too large* |
| Filename sanitisation | Path separators, control characters and `..` are stripped before the name is stored | test *strips path components* |
| Malformed JSON | Rejected with a 400, not a 500 | `middleware.ts` |
| Disk exhaustion | Per-account ceiling on stored analyses | `routes.ts` |

### 2.5 Abuse resistance

| Control | Implementation | Verified by |
|---|---|---|
| Global rate limit | 120 req/min in production, 600 in dev | `app.ts` |
| Auth rate limit | 10 attempts / 15 min, successes not counted | `routes.ts` |
| Ingestion concurrency | 1 job per user, 3 globally; a second job gets 429 | test *rejects a second concurrent job* |
| Guest minting | Bounded by a global hourly cap | `routes.ts` |
| Third-party politeness | OpenAlex is called with a polite `mailto` and a 15 s timeout; the demo fallback is clearly labelled | `services/ingestion.ts` |

### 2.6 Privacy & data isolation

| Control | Implementation | Verified by |
|---|---|---|
| Document ownership | Every document carries a `user_id`; only the owner or an admin may read it | test *never lets one user read another user's analysis* |
| **404, not 403** | Another user's document answers `404`, so an id can never be confirmed to exist | same test |
| Saved papers | Per-user rows with a `UNIQUE(user_id, paper_id)` constraint | `schema.sql` |
| Guest → account merge | A guest's work moves to the real account on sign-up, and only for *genuine* guest accounts — two independent signals must hold (reserved email pattern **and** a non-bcrypt password hash) | test *refuses to merge a token that belongs to a real account* |
| No bulk leakage | Public paper endpoints never return `full_text` | test *does not leak full paper text* |
| Legacy rows | Documents with a `NULL user_id` predate ownership tracking and stay visible to signed-in users (same rule as delete) | `docs/API.md` |

### 2.7 Audit trail

Authentication, authorisation and ingestion events are recorded with a
timestamp and the client IP: `auth.register`, `auth.login`, `auth.login_failed`,
`auth.login_locked`, `auth.guest`, `auth.demo`, `auth.refresh`, `auth.logout`,
`admin.promote`, `doc.delete`, `ingest.start`, `security.upload_rejected`.

Admins can read the last 100 events at `GET /api/admin/audit`.

---

## 3. Verification

Every control above has a matching automated test:

```bash
npm run test:backend     # 51 tests — 16 of them are security-specific
npm run test:frontend    # 27 tests — including the first-visit guest bootstrap
npm run test:c           # 33 C++ assertions
```

The backend suite mounts the **real** application (`createApp()`), so the
security headers, the rate limiter and the error handler under test are the
production ones — a test app that re-implemented them would prove nothing.

---

## 4. Known limitations

Stated plainly, because a security page that claims perfection is not
credible.

1. **SQLite has no row-level security.** Isolation is enforced in the route
   layer, which is one layer of code between a bug and a data leak. Moving to
   Postgres with per-user RLS policies would make the guarantee structural.
2. **Rate-limit counters are per process and in memory.** Behind several
   instances the effective limit multiplies, and the failed-login counters
   reset on restart.
3. **The shared demo account** (`/api/auth/demo`) is a single identity for
   every visitor who asks for it. It exists for backwards compatibility with
   older demos; the guest flow is the supported path.
4. **The upload allow-list is extension + MIME, not magic bytes.** A file
   renamed to `.pdf` is caught downstream by the readability guard, but the
   first line of defence is not content sniffing.
5. **No 2FA.** The threat model assumes the password is the only factor.
6. **The demo corpus is synthetic.** Demo rows are flagged `is_demo` and
   badged `DEMO` in every surface so they are never mistaken for verified
   citations; real ingestion stores the source DOI/URL.
