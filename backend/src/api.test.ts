import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import cors from "cors";
import { router } from "./routes.js";
import { all, run } from "./db.js";

/* API-level tests over the real router.
 * These guard the bugs that made the advertised features unreachable:
 * a static route shadowed by a ":id" param, and a helper referenced but
 * never defined (which surfaced as a 500 instead of a 404). */

let server: any;
let base = "";
let token = "";
let guestToken = "";

beforeAll(async () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", router);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${addr.port}/api`;
  const r = await fetch(`${base}/auth/demo`, { method: "POST" });
  token = (await r.json() as any).token;
});

afterAll(() => { server?.close(); });

const authed = (path: string, init: any = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });

describe("route table", () => {
  it("serves /papers/saved instead of letting /papers/:id swallow it", async () => {
    const res = await authed("/papers/saved");
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("answers 404 (not 500) for a document that does not exist", async () => {
    const res = await authed("/documents/does-not-exist-1234", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("requires a token on protected routes", async () => {
    const res = await fetch(`${base}/dashboard/stats`);
    expect(res.status).toBe(401);
  });
});

describe("auth", () => {
  it("mints a usable guest identity", async () => {
    const res = await fetch(`${base}/auth/guest`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.token).toBeTruthy();
    guestToken = body.token;

    const me = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${guestToken}` } });
    expect(me.status).toBe(200);
    expect((await me.json() as any).id).toBe(body.user.id);

    run("DELETE FROM saved_papers WHERE user_id = ?", [body.user.id]);
    run("DELETE FROM users WHERE id = ?", [body.user.id]);
  });

  it("returns the role on login so the UI can gate admin pages", async () => {
    const res = await fetch(`${base}/auth/demo`, { method: "POST" });
    expect((await res.json() as any).user.role).toBeTruthy();
  });
});

describe("saved papers", () => {
  it("saves and unsaves a paper, and lists it", async () => {
    const list = await (await fetch(`${base}/papers?limit=1`)).json() as any;
    const id = list.items[0].id;

    const first = await (await authed(`/papers/${id}/save`, { method: "POST" })).json() as any;
    expect(first.saved).toBe(true);

    const listed = await (await authed("/papers/saved")).json() as any;
    expect(listed.some((p: any) => p.id === id)).toBe(true);

    const second = await (await authed(`/papers/${id}/save`, { method: "POST" })).json() as any;
    expect(second.saved).toBe(false);

    const after = await (await authed("/papers/saved")).json() as any;
    expect(after.some((p: any) => p.id === id)).toBe(false);
  });
});

describe("grounded chat", () => {
  it("answers from the index with references", async () => {
    const res = await authed("/chat", { method: "POST", body: JSON.stringify({ question: "phishing url detection" }) });
    expect(res.status).toBe(200);
    const d = await res.json() as any;
    expect(typeof d.answer).toBe("string");
    expect(d.answer.length).toBeGreaterThan(0);
    expect(d.grounded).toBe(true);
    expect(d.references.length).toBeGreaterThan(0);
  });

  it("rejects a question that is too short", async () => {
    const res = await authed("/chat", { method: "POST", body: JSON.stringify({ question: "a" }) });
    expect(res.status).toBe(400);
  });
});

describe("knowledge base", () => {
  it("reports index statistics", async () => {
    const res = await fetch(`${base}/knowledge-base/stats`);
    expect(res.status).toBe(200);
    const d = await res.json() as any;
    expect(d.papers).toBeGreaterThan(0);
    expect(d.chunks).toBeGreaterThan(0);
    expect(d.embeddingDimension).toBe(384);
  });

  it("returns a citation graph with nodes and edges", async () => {
    const res = await fetch(`${base}/citations/graph`);
    expect(res.status).toBe(200);
    const d = await res.json() as any;
    expect(Array.isArray(d.nodes)).toBe(true);
    expect(Array.isArray(d.edges)).toBe(true);
    // every edge must reference a real node index
    for (const e of d.edges) {
      expect(d.nodes[e.source]).toBeTruthy();
      expect(d.nodes[e.target]).toBeTruthy();
    }
  });
});

describe("papers", () => {
  it("compares papers pairwise and keeps semantic and lexical separate", async () => {
    const list = await (await fetch(`${base}/papers?limit=3`)).json() as any;
    const ids = list.items.map((p: any) => p.id);
    expect(ids.length).toBeGreaterThanOrEqual(3);

    const res = await authed("/papers/compare", { method: "POST", body: JSON.stringify({ ids }) });
    expect(res.status).toBe(200);
    const d = await res.json() as any;
    expect(d.papers.length).toBe(3);
    expect(d.pairs.length).toBe(3); // 3 choose 2
    for (const p of d.pairs) {
      expect(typeof p.semantic).toBe("number");
      expect(typeof p.lexical).toBe("number");
      expect(p.note).toMatch(/relatedness/i);
    }
  });

  it("rejects a comparison with fewer than two papers", async () => {
    const list = await (await fetch(`${base}/papers?limit=1`)).json() as any;
    const res = await authed("/papers/compare", { method: "POST", body: JSON.stringify({ ids: [list.items[0].id] }) });
    expect(res.status).toBe(400);
  });

  it("builds a literature review grounded in retrieved papers", async () => {
    const res = await authed("/literature-review", { method: "POST", body: JSON.stringify({ topic: "phishing url detection" }) });
    expect(res.status).toBe(200);
    const d = await res.json() as any;
    expect(d.paperCount).toBeGreaterThan(0);
    expect(d.themes.length).toBeGreaterThan(0);
    expect(d.note).toMatch(/no fabricated citations/i);
    // every cited paper id must exist in the returned paper list
    const ids = new Set(d.papers.map((p: any) => p.id));
    for (const t of d.themes) for (const p of t.papers) expect(ids.has(p.id)).toBe(true);
  });
});

describe("ingestion", () => {
  it("rejects a blank domain before starting a job", async () => {
    const res = await authed("/ingest/start", { method: "POST", body: JSON.stringify({ domain: "  ", count: 5 }) });
    expect(res.status).toBe(400);
  });

  // Reaches out to OpenAlex, so it needs a longer timeout than the 5s default.
  it("starts a job for a valid domain, then restores the knowledge base", async () => {
    // Snapshot the KB so the real ingestion this triggers leaves no trace.
    const before = new Set(all<any>("SELECT id FROM papers").map((r: any) => r.id));
    let jobId = "";

    try {
      const res = await authed("/ingest/start", { method: "POST", body: JSON.stringify({ domain: "graph neural networks", count: 2 }) });
      expect(res.status).toBe(200);
      const d = await res.json() as any;
      jobId = d.jobId;
      expect(jobId).toBeTruthy();
      expect(d.status).toBe("running");

      // Wait for the job to settle.
      for (let i = 0; i < 40; i++) {
        const s: any = await (await authed(`/ingest/${jobId}`)).json();
        if (s.status === "done" || s.status === "failed") break;
        await new Promise((r) => setTimeout(r, 500));
      }
    } finally {
      // Always clean up: the job row and every paper it created.
      if (jobId) run("DELETE FROM ingestion_jobs WHERE id = ?", [jobId]);
      for (const p of all<any>("SELECT id FROM papers")) {
        if (before.has(p.id)) continue;
        run("DELETE FROM paper_chunks WHERE paper_id = ?", [p.id]);
        run("DELETE FROM paper_authors WHERE paper_id = ?", [p.id]);
        run("DELETE FROM paper_topics WHERE paper_id = ?", [p.id]);
        run("DELETE FROM papers WHERE id = ?", [p.id]);
      }
    }

    expect(new Set(all<any>("SELECT id FROM papers").map((r: any) => r.id)).size).toBe(before.size);
  }, 45000);
});
