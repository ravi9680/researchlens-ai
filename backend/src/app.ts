import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, securityConfig } from "./config.js";
import { router } from "./routes.js";
import { apiErrorHandler, requestContext } from "./middleware.js";

/* The Express application is built here rather than in index.ts so that the
 * test-suite can mount the *real* app (with its real security headers)
 * instead of a hand-rolled approximation. */

export function createApp() {
  const app = express();

  /* Behind Render/nginx the socket address is the proxy. Trusting the proxy
   * hop lets express-rate-limit key on the real client IP instead of lumping
   * every visitor into one bucket. */
  if (config.trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");

  /* ---- security headers ------------------------------------------------ */
  app.use(
    helmet({
      contentSecurityPolicy: securityConfig.contentSecurityPolicy,
      hidePoweredBy: securityConfig.hidePoweredBy,
      frameguard: securityConfig.frameguard,
      hsts: securityConfig.hsts,
      referrerPolicy: securityConfig.referrerPolicy,
      noSniff: securityConfig.noSniff,
      xssFilter: securityConfig.xssFilter,
      crossOriginEmbedderPolicy: securityConfig.crossOriginEmbedderPolicy as any,
    })
  );

  /* ---- CORS ----------------------------------------------------------
   * Only the configured frontend origin may call the API with credentials.
   * In production the default localhost origins are dropped entirely.
   *
   * The app also runs in "single-link" mode, where Express serves the built
   * frontend from the same origin — a request from that origin carries an
   * `Origin` header equal to the host being served, which is not in the
   * allow-list. Same-origin requests are always safe, so they are allowed
   * explicitly instead of being rejected by the allow-list. */
  const allowedOrigins = config.isProduction
    ? [config.frontendUrl]
    : [config.frontendUrl, "http://localhost:5173", "http://127.0.0.1:5173"];

  app.use(
    cors((req, callback) => {
      const origin = req.header("Origin");
      // No Origin header: same-origin navigation, curl, or server-to-server.
      if (!origin) return callback(null, { origin: false, credentials: true });

      const selfOrigin = `${req.protocol}://${req.get("host")}`;
      const ok = allowedOrigins.includes(origin) || origin === selfOrigin;

      callback(null, {
        origin: ok ? origin : false,
        credentials: true,
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        maxAge: 86400,
      });
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  /* ---- rate limiting -------------------------------------------------
   * A global ceiling protects the process; the auth limiter (in routes.ts)
   * adds a much tighter, per-route budget for credential endpoints. */
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: config.isProduction ? 120 : 600,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many requests. Please slow down and try again shortly." },
    })
  );

  /* Every response carries a request id so a user-visible failure can be
   * traced to one server log line without leaking internals to the client. */
  app.use(requestContext);

  app.use("/api", router);

  /* ---- static frontend (single-link mode) ------------------------------
   * Resolve the dist folder relative to this file, not to process.cwd(), so
   * the server works no matter which directory it was started from. */
  const here = path.dirname(fileURLToPath(import.meta.url));
  const distCandidates = [
    path.resolve(here, "../../frontend/dist"),
    path.resolve(process.cwd(), "../frontend/dist"),
    path.resolve(process.cwd(), "frontend/dist"),
  ];
  const distDir = distCandidates.find((d) => fs.existsSync(path.join(d, "index.html")));

  if (distDir) {
    app.use(
      express.static(distDir, {
        // Hashed asset filenames are safe to cache forever.
        maxAge: config.isProduction ? "7d" : 0,
        etag: true,
        setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
      })
    );
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      /* The HTML must never be served from a browser cache. It is the file
       * that points at the hashed bundles, so a cached copy pins the user to
       * an old build — the page then keeps running old JavaScript (with the
       * old progress-bar behaviour) even though the server has been updated.
       * `no-cache` means "revalidate every time", which is cheap: the
       * bundles themselves stay cached for 7 days. */
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(distDir, "index.html"));
    });
    console.log("serving frontend from", distDir);
  } else {
    app.get("/", (_req, res) =>
      res.json({ name: "ResearchLens AI", demoMode: config.demoMode, docs: "/api/health" })
    );
  }

  /* global error handler (safe messages, no stack leaks) */
  app.use(apiErrorHandler);

  return app;
}
