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

/** Run one command in the C++ engine and resolve with its JSON reply.
 *
 *  HARD GUARANTEE: this promise ALWAYS settles.
 *
 *  The previous implementation could leave the promise pending forever: the
 *  timeout timer called `child.kill("SIGKILL")` *before* `reject(...)`, and
 *  if the kill threw (or the child was already reaped in an unlucky order)
 *  the rejection never happened — the `await` in the pipeline then hung
 *  permanently and the analysis froze at whatever stage it had reached
 *  (typically "C ENGINE", 52%), with the UI showing a progress bar that
 *  would never move again.
 *
 *  Three independent guards now prevent that:
 *    1. a deadline raced against the work, so the promise settles even if
 *       the child never closes its pipes;
 *    2. every kill is wrapped so it cannot throw;
 *    3. the timers are unref'd and cleared in a `finally`. */
function runEngine(payload: unknown, timeoutMs = 6000, maxBytes = 1_500_000): Promise<any> {
  return new Promise((resolve, reject) => {
    const bin = findBinary();
    if (!bin) return reject(new Error("C engine binary not found"));
    const json = JSON.stringify(payload);
    if (json.length > maxBytes) return reject(new Error("Input too large for C engine (chunk first)"));

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, [], { timeout: timeoutMs, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e: any) {
      return reject(new Error(`C engine spawn failed: ${e?.message || e}`));
    }
    /* stdio was requested explicitly as pipes, so these are non-null. */
    const stdin = child.stdin!;
    const stdout = child.stdout!;
    const stderr = child.stderr!;

    let out = "";
    let err = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    let deadline: NodeJS.Timeout | undefined;

    const kill = () => {
      try { child.kill("SIGKILL"); } catch { /* the child may already be gone */ }
    };

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (deadline) clearTimeout(deadline);
      fn();
    };

    /* Hard deadline — the promise settles even if the child never exits. */
    deadline = setTimeout(() => {
      kill();
      settle(() => reject(new Error(`C engine timeout after ${timeoutMs}ms`)));
    }, timeoutMs + 500);
    deadline.unref?.();

    timer = setTimeout(() => {
      kill();
      settle(() => reject(new Error(`C engine timeout after ${timeoutMs}ms`)));
    }, timeoutMs);
    timer.unref?.();

    /* Stream error handlers are ESSENTIAL, not defensive noise.
     * If the child is killed (or exits early) while Node is still writing the
     * payload, `child.stdin` emits EPIPE. A stream 'error' event with no
     * listener is an *uncaught exception* — it tears down the whole Node
     * process. On Render that means the container restarts mid-analysis, the
     * documents row stays frozen at whatever stage it had reached ("C ENGINE",
     * 52%), and the progress bar never moves again. The same applies to
     * stdout/stderr when the child dies with its pipes open. */
    const swallow = (label: string) => (e: any) => {
      if (!settled) settle(() => reject(new Error(`C engine ${label}: ${e?.message || e}`)));
    };
    stdin.on("error", swallow("stdin failed"));
    stdout.on("error", swallow("stdout failed"));
    stderr.on("error", swallow("stderr failed"));

    stdout.on("data", (d) => {
      out += d;
      if (out.length > maxBytes) kill();
    });
    stderr.on("data", (d) => { err += d; });

    child.on("error", (e) => {
      settle(() => reject(new Error(`C engine error: ${e?.message || e}`)));
    });

    child.on("close", () => {
      if (!out) {
        settle(() => reject(new Error("C engine produced no output" + (err ? `: ${err.slice(0, 300)}` : ""))));
        return;
      }
      let parsed: any;
      try { parsed = JSON.parse(out); }
      catch { settle(() => reject(new Error("C engine returned invalid JSON"))); return; }
      settle(() => resolve(parsed));
    });

    try {
      stdin.write(json);
      stdin.end();
    } catch (e: any) {
      settle(() => reject(new Error(`C engine input failed: ${e?.message || e}`)));
    }
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
