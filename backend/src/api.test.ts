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
  paperSnapshot = new Set(all<any>("SELECT id FROM papers").map((r: any) => r.id));
});

afterAll(() => { server?.close(); });

/** Registers a throwaway account and returns its token + id. */
async function makeUser(label: string) {
  const email = `test_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;
  const r = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "secret123", name: label }),
  });
  const b = await r.json() as any;
  return { email, token: b.token, id: b.user?.id };
}

async function cleanupUser(id?: string) {
  if (!id) return;
  run("DELETE FROM saved_papers WHERE user_id = ?", [id]);
  run("DELETE FROM ingestion_jobs WHERE user_id = ?", [id]);
  run("DELETE FROM documents WHERE user_id = ?", [id]);
  run("DELETE FROM users WHERE id = ?", [id]);
}

/** Paper ids that existed before the test run. Ingestion is the only thing in
 *  this suite that adds papers, so anything outside this set is test residue. */
let paperSnapshot: Set<string> = new Set();

function removePapersNotInSnapshot() {
  for (const p of all<any>("SELECT id FROM papers")) {
    if (paperSnapshot.has(p.id)) continue;
    run("DELETE FROM paper_chunks WHERE paper_id = ?", [p.id]);
    run("DELETE FROM paper_authors WHERE paper_id = ?", [p.id]);
    run("DELETE FROM paper_topics WHERE paper_id = ?", [p.id]);
    run("DELETE FROM papers WHERE id = ?", [p.id]);
  }
}

/** Waits for an ingestion job to finish so its papers exist before cleanup. */
async function waitForJob(tok: string, jobId: string) {
  for (let i = 0; i < 60; i++) {
    const s = await authedJsonAs(tok, `/ingest/${jobId}`);
    if (s.body.status === "done" || s.body.status === "failed") return;
    await new Promise((r) => setTimeout(r, 400));
  }
}

const authed = (path: string, init: any = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });

/** Same as authed() but with an explicit bearer token. */
const authedAs = (tok: string, path: string, init: any = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}`, ...(init.headers || {}) },
  });

/** authedAs() that also parses the JSON body. */
const authedJsonAs = async (tok: string, path: string, init: any = {}) => {
  const r = await authedAs(tok, path, init);
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
};

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

describe("per-user privacy", () => {
  it("never lets one user read another user's analysis", async () => {
    const a = await makeUser("owner");
    const b = await makeUser("intruder");

    // Create a document owned by A.
    const fd = new FormData();
    fd.append("file", new Blob(["Phishing detection with gradient boosting on URL length features."], { type: "text/plain" }), "priv.txt");
    const up = await fetch(`${base}/upload`, { method: "POST", headers: { Authorization: `Bearer ${a.token}` }, body: fd });
    const docId = (await up.json() as any).documentId;
    expect(docId).toBeTruthy();
    await new Promise((r) => setTimeout(r, 1500));

    const asB = (p: string) => fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${b.token}` } });
    const asA = (p: string) => fetch(`${base}${p}`, { headers: { Authorization: `Bearer ${a.token}` } });

    expect((await asB(`/documents/${docId}/status`)).status).toBe(404);
    expect((await asB(`/documents/${docId}/report`)).status).toBe(404);
    expect((await fetch(`${base}/documents/${docId}`, { method: "DELETE", headers: { Authorization: `Bearer ${b.token}` } })).status).toBe(404);

    // B's document list must not contain A's document.
    const list = await (await asB("/documents")).json() as any[];
    expect(list.some((d: any) => d.id === docId)).toBe(false);

    // A still sees their own work.
    expect((await asA(`/documents/${docId}/status`)).status).toBe(200);

    await cleanupUser(a.id);
    await cleanupUser(b.id);
  });

  it("does not leak full paper text on public paper endpoints", async () => {
    const list = await (await fetch(`${base}/papers?limit=5`)).json() as any;
    expect(list.items.length).toBeGreaterThan(0);
    for (const p of list.items) expect(p).not.toHaveProperty("full_text");

    const one = await (await fetch(`${base}/papers/${list.items[0].id}`)).json() as any;
    expect(one).not.toHaveProperty("full_text");
    // the fields the UI actually renders must still be there
    expect(one.title).toBeTruthy();
    expect(one.abstract).toBeTruthy();
    expect(Array.isArray(one.chunks)).toBe(true);
  });
});

describe("guest account merge", () => {
  it("carries a guest's documents and bookmarks into the account they register", async () => {
    const g = await fetch(`${base}/auth/guest`, { method: "POST" });
    const gb = await g.json() as any;

    const fd = new FormData();
    fd.append("file", new Blob(["Anomaly detection with LSTM baselines on network traffic."], { type: "text/plain" }), "guest.txt");
    const up = await fetch(`${base}/upload`, { method: "POST", headers: { Authorization: `Bearer ${gb.token}` }, body: fd });
    const docId = (await up.json() as any).documentId;
    await new Promise((r) => setTimeout(r, 1500));

    const papers = await (await fetch(`${base}/papers?limit=1`)).json() as any;
    await fetch(`${base}/papers/${papers.items[0].id}/save`, { method: "POST", headers: { Authorization: `Bearer ${gb.token}` } });

    const email = `merge_${Date.now()}@test.local`;
    const reg = await fetch(`${base}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "secret123", name: "Merged", guestToken: gb.token }),
    });
    expect(reg.status).toBe(200);
    const rt = (await reg.json() as any).token;

    const docs = await (await fetch(`${base}/documents`, { headers: { Authorization: `Bearer ${rt}` } })).json() as any[];
    expect(docs.some((d: any) => d.id === docId)).toBe(true);
    const saved = await (await fetch(`${base}/papers/saved`, { headers: { Authorization: `Bearer ${rt}` } })).json() as any[];
    expect(saved.some((p: any) => p.id === papers.items[0].id)).toBe(true);

    // the guest account itself is consumed by the merge
    const guestAfter = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${gb.token}` } });
    expect(guestAfter.status).toBe(401);

    const merged = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${rt}` } });
    const mid = (await merged.json() as any).id;
    await cleanupUser(mid);
    await cleanupUser(gb.user.id);
  });

  it("refuses to merge a token that belongs to a real account", async () => {
    const a = await makeUser("realowner");
    const b = await makeUser("attacker");
    // A's token must not be able to move A's documents into B's account.
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: b.email, password: "secret123", guestToken: a.token }),
    });
    expect(res.status).toBe(200);
    const bt = (await res.json() as any).token;
    const docs = await (await fetch(`${base}/documents`, { headers: { Authorization: `Bearer ${bt}` } })).json() as any[];
    expect(docs.some((d: any) => d.user_id === a.id)).toBe(false);
    await cleanupUser(a.id);
    await cleanupUser(b.id);
  });
});

describe("ingestion guards", () => {
  it("rejects a second concurrent job from the same user", async () => {
    const u = await makeUser("ingester");
    const first = await authedJsonAs(u.token, "/ingest/start", { method: "POST", body: JSON.stringify({ domain: "concurrency guard", count: 2 }) });
    expect(first.status).toBe(200);
    expect(first.body.jobId).toBeTruthy();
    const second = await authedAs(u.token, "/ingest/start", { method: "POST", body: JSON.stringify({ domain: "concurrency guard two", count: 2 }) });
    expect(second.status).toBe(429);

    await waitForJob(u.token, first.body.jobId);
    await cleanupUser(u.id);
    removePapersNotInSnapshot();
  }, 60000);

  it("hides one user's ingestion job from another", async () => {
    const a = await makeUser("jobowner");
    const b = await makeUser("jobwatcher");
    const started = await authedJsonAs(a.token, "/ingest/start", { method: "POST", body: JSON.stringify({ domain: "ownership guard", count: 1 }) });
    expect(started.status).toBe(200);
    expect(started.body.jobId).toBeTruthy();

    const seen = await authedAs(b.token, `/ingest/${started.body.jobId}`);
    expect(seen.status).toBe(404);
    const owner = await authedAs(a.token, `/ingest/${started.body.jobId}`);
    expect(owner.status).toBe(200);

    await waitForJob(a.token, started.body.jobId);
    await cleanupUser(a.id);
    await cleanupUser(b.id);
    removePapersNotInSnapshot();
  }, 60000);
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
    let jobId = "";

    try {
      const res = await authed("/ingest/start", { method: "POST", body: JSON.stringify({ domain: "graph neural networks", count: 2 }) });
      expect(res.status).toBe(200);
      const d = await res.json() as any;
      jobId = d.jobId;
      expect(jobId).toBeTruthy();
      expect(d.status).toBe("running");

      await waitForJob(token, jobId);
    } finally {
      // Always clean up: the job row and every paper it created.
      if (jobId) run("DELETE FROM ingestion_jobs WHERE id = ?", [jobId]);
      removePapersNotInSnapshot();
    }

    expect(new Set(all<any>("SELECT id FROM papers").map((r: any) => r.id)).size).toBe(paperSnapshot.size);
  }, 60000);
});
