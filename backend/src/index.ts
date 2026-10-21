import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { router } from "./routes.js";
import { apiErrorHandler } from "./middleware.js";

const app = express();
// Add security-related HTTP headers.


app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: [config.frontendUrl, "http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
app.use("/api", router);

// Single-link mode: serve the built frontend (frontend/dist) if present,
// so one URL (e.g. an ngrok tunnel) serves the whole app.
const distDir = path.resolve(process.cwd(), "../frontend/dist");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
  console.log("serving frontend from", distDir);
} else {
  app.get("/", (_req, res) => res.json({ name: "ResearchLens AI", demoMode: config.demoMode, docs: "/api/health" }));
}

// global error handler (safe messages, no stack leaks)
app.use(apiErrorHandler);

if (!fs.existsSync(new URL("./migrate.ts", import.meta.url))) { /* noop */ }

app.listen(config.port, "::", () => console.log(`ResearchLens backend → http://localhost:${config.port} (demo=${config.demoMode})`));
