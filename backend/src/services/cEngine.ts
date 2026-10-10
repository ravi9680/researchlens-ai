import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const CANDIDATES = ["build/researchlens", "../algorithm_engine/build/researchlens", "../../algorithm_engine/build/researchlens"];

function findBinary(): string | null {
  const roots = [process.cwd(), path.dirname(new URL(import.meta.url).pathname)];
  for (const r of roots) {
    for (const c of CANDIDATES) {
      const p = path.resolve(r, c);
      if (fs.existsSync(p)) return p;
    }
  }
  const direct = path.resolve(process.cwd(), "../algorithm_engine/build/researchlens");
  return fs.existsSync(direct) ? direct : null;
}

export function cEngineAvailable(): boolean {
  return findBinary() !== null;
}

export function cEngineInfo() {
  const bin = findBinary();
  return {
    available: Boolean(bin), binary: bin || "not built (run `make -C algorithm_engine`)",
    interface: "JSON over stdin/stdout", commands: ["analyze", "match_passages", "graph", "keywords", "fingerprint"],
    fallback: "TypeScript implementations in textUtils.ts mirror all C algorithms",
  };
}

function runEngine(payload: unknown, timeoutMs = 8000, maxBytes = 1_500_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const bin = findBinary();
    if (!bin) return reject(new Error("C engine binary not found"));
    const json = JSON.stringify(payload);
    if (json.length > maxBytes) return reject(new Error("Input too large for C engine (chunk first)"));
    const child = spawn(bin, [], { timeout: timeoutMs });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("C engine timeout")); }, timeoutMs);
    child.stdout.on("data", (d) => { out += d; if (out.length > maxBytes) child.kill("SIGKILL"); });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!out) return reject(new Error("C engine produced no output " + err));
      try { resolve(JSON.parse(out)); }
      catch { reject(new Error("C engine returned invalid JSON")); }
    });
    child.stdin.write(json);
    child.stdin.end();
  });
}

export async function cAnalyze(userText: string, candidates: { id: string; text: string }[], topK = 8) {
  const r = await runEngine({ cmd: "analyze", user_text: userText.slice(0, 50000), candidates: candidates.slice(0, 60).map((c) => ({ id: c.id, text: c.text.slice(0, 12000) })), top_k: topK });
  if (!r?.ok) throw new Error(r?.error || "C engine analyze failed");
  return r;
}

export async function cKeywords(text: string, topK = 12) {
  const r = await runEngine({ cmd: "keywords", text: text.slice(0, 50000), top_k: topK });
  if (!r?.ok) throw new Error("C engine keywords failed");
  return r;
}

export async function cGraph(n: number, edges: [number, number][], start = 0) {
  const r = await runEngine({ cmd: "graph", n: Math.min(n, 500), edges: edges.slice(0, 4000), start, pagerank_iters: 20 });
  if (!r?.ok) throw new Error("C engine graph failed");
  return r;
}

export async function cFingerprint(text: string) {
  const r = await runEngine({ cmd: "fingerprint", text: text.slice(0, 50000) });
  if (!r?.ok) throw new Error("C engine fingerprint failed");
  return r;
}
