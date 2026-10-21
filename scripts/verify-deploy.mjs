#!/usr/bin/env node
/**
 * Post-deploy smoke test.
 *
 * Checks that a deployed instance is serving the CURRENT build — not an
 * older one. A build can fail while the previous release keeps serving
 * happily, which is exactly how a broken deploy stays hidden until a
 * reviewer opens the link.
 *
 * Usage:
 *   node scripts/verify-deploy.mjs https://your-app.onrender.com
 *   node scripts/verify-deploy.mjs http://localhost:4000
 */

const BASE = (process.argv[2] || process.env.DEPLOY_URL || "http://localhost:4000").replace(/\/$/, "");
const API = `${BASE}/api`;

let failures = 0;
const ok = (label, extra = "") => console.log(`  \x1b[32m✓\x1b[0m ${label}${extra ? ` — ${extra}` : ""}`);
const bad = (label, extra = "") => { failures++; console.log(`  \x1b[31m✗\x1b[0m ${label}${extra ? ` — ${extra}` : ""}`); };

async function json(path, init) {
  const r = await fetch(`${API}${path}`, init);
  let body = null;
  try { body = await r.json(); } catch { /* non-JSON */ }
  return { r, body };
}

console.log(`\nVerifying deployment at ${BASE}\n`);

// ---- 1. liveness -------------------------------------------------------
console.log("Service");
try {
  const { r, body } = await json("/health");
  if (r.ok && body?.ok) ok("health", `env=${body.env} demo=${body.demoMode}`);
  else bad("health", `HTTP ${r.status}`);
} catch (e) {
  bad("health", e.message);
  console.log("\nThe service is unreachable — the deploy failed or is still starting.\n");
  process.exit(1);
}

// ---- 2. build freshness ------------------------------------------------
console.log("\nBuild freshness");
try {
  const { r, body } = await json("/security/summary");
  if (r.ok && body?.auth) {
    ok("security summary present", "this build is the new one");
  } else {
    bad("security summary missing", "the deployment is serving an OLD build");
  }
} catch (e) { bad("security summary", e.message); }

// ---- 3. security headers ------------------------------------------------
console.log("\nSecurity headers");
try {
  const res = await fetch(`${API}/health`);
  const checks = [
    ["Content-Security-Policy", !!res.headers.get("content-security-policy")],
    ["X-Frame-Options", res.headers.get("x-frame-options") === "DENY"],
    ["X-Content-Type-Options", res.headers.get("x-content-type-options") === "nosniff"],
    ["Referrer-Policy", !!res.headers.get("referrer-policy")],
    ["X-Powered-By removed", res.headers.get("x-powered-by") === null],
    ["X-Request-Id", !!res.headers.get("x-request-id")],
  ];
  for (const [label, pass] of checks) (pass ? ok : bad)(label);
} catch (e) { bad("headers", e.message); }

// ---- 4. public data -----------------------------------------------------
console.log("\nKnowledge base");
try {
  const { r, body } = await json("/papers?limit=1");
  if (r.ok && body?.total > 0) ok("papers indexed", `${body.total} papers`);
  else bad("papers indexed", `total=${body?.total ?? "?"} — run the seed step`);
} catch (e) { bad("papers", e.message); }

try {
  const { r, body } = await json("/knowledge-base/stats");
  if (r.ok && body?.chunks > 0) {
    ok("chunks embedded", `${body.chunks} chunks · ${body.embeddingProvider} ${body.embeddingDimension}-d`);
    ok("C engine", body.cEngine ? "available" : "JS fallback (binary not built)");
  } else bad("knowledge base", "no chunks");
} catch (e) { bad("knowledge base", e.message); }

try {
  const { r, body } = await json("/citations/graph");
  if (r.ok) ok("citation graph", `${body.stats?.nodes ?? 0} nodes · ${body.stats?.edges ?? 0} edges`);
  else bad("citation graph", `HTTP ${r.status}`);
} catch (e) { bad("citation graph", e.message); }

// ---- 5. auth + full pipeline -------------------------------------------
console.log("\nAuth & analysis pipeline");
let token = "";
try {
  const { r, body } = await json("/auth/guest", { method: "POST" });
  if (r.ok && body?.token) { token = body.token; ok("guest identity"); }
  else bad("guest identity", `HTTP ${r.status}`);
} catch (e) { bad("guest identity", e.message); }

if (token) {
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const { r, body } = await json("/dashboard/stats", { headers: auth });
    if (r.ok) ok("dashboard", `${body.totalPapers} papers · ${body.totalTopics} topics`);
    else bad("dashboard", `HTTP ${r.status}`);
  } catch (e) { bad("dashboard", e.message); }

  try {
    const { r, body } = await json("/papers/saved", { headers: auth });
    if (r.ok && Array.isArray(body)) ok("saved papers");
    else bad("saved papers", `HTTP ${r.status}`);
  } catch (e) { bad("saved papers", e.message); }

  // upload → poll → report
  try {
    const fd = new FormData();
    fd.append("file", new Blob([
      "Phishing URL detection with gradient boosting on lexical features. " +
      "We evaluate XGBoost and random forest on phishing corpora with time-based splits. " +
      "Results show 96.2 percent accuracy. Limitations include concept drift."
    ], { type: "text/plain" }), "verify.txt");
    const up = await fetch(`${API}/upload`, { method: "POST", headers: auth, body: fd });
    const upBody = await up.json();
    if (up.ok && upBody.documentId) {
      ok("upload accepted");
      let report = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const st = await (await fetch(`${API}/documents/${upBody.documentId}/status`, { headers: auth })).json();
        if (st.done || st.failed) { report = st; break; }
      }
      if (report?.failed) bad("analysis", report.error || "failed");
      else {
        const rep = await (await fetch(`${API}/documents/${upBody.documentId}/report`, { headers: auth })).json();
        const n = rep.similarPapers?.length ?? 0;
        if (n > 0) ok("analysis pipeline", `${rep.overallSimilarity}% similarity · ${n} papers · AI ${rep.ai?.level}`);
        else bad("analysis", "report had no similar papers");
      }
    } else bad("upload accepted", upBody.error || `HTTP ${up.status}`);
  } catch (e) { bad("upload", e.message); }
}

// ---- 6. SPA -------------------------------------------------------------
console.log("\nFrontend");
try {
  const res = await fetch(`${BASE}/app`);
  const html = await res.text();
  if (res.ok && html.includes("<div id=\"root\">")) ok("SPA served", "index.html");
  else bad("SPA served", `HTTP ${res.status}`);
} catch (e) { bad("SPA served", e.message); }

try {
  const res = await fetch(`${BASE}/app/security`);
  if (res.ok) ok("SPA deep link", "/app/security");
  else bad("SPA deep link", `HTTP ${res.status}`);
} catch (e) { bad("SPA deep link", e.message); }

console.log(failures === 0
  ? "\n\x1b[32mAll checks passed.\x1b[0m\n"
  : `\n\x1b[31m${failures} check(s) failed.\x1b[0m\n`);
process.exit(failures === 0 ? 0 : 1);
