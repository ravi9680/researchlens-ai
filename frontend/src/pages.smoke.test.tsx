import { describe, it, expect, vi, beforeAll } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

/* Smoke test: every page must render without throwing.
 * A successful `tsc -b` proves the code compiles, not that a component
 * does not crash at render time — this catches the latter. */

const FIXTURES: Record<string, any> = {
  "/api/health": { ok: true, demoMode: true },
  "/api/engine": {
    available: true, binary: "build/researchlens", interface: "JSON over stdin/stdout",
    commands: ["analyze"], semantic: "local", note: "note",
  },
  "/api/dashboard/stats": {
    totalPapers: 56, totalAuthors: 131, totalTopics: 26, analyses: 7, avgSimilarity: 42,
    recent: [{ id: "d1", title: "Sample", stage: "DONE", progress: 100 }],
  },
  "/api/trends": {
    total: 56, demoCount: 18,
    papersByYear: [{ year: 2023, count: 10 }],
    topics: [{ topic: "A", count: 5 }],
  },
  "/api/knowledge-base/stats": {
    papers: 56, realPapers: 38, demoPapers: 18, chunks: 142, authors: 131, topics: 26,
    citations: 23, avgChunksPerPaper: 2.5, avgCitations: 120,
    topTopics: [{ topic: "A", count: 5 }],
    embeddingProvider: "local", embeddingDimension: 384, cEngine: true,
  },
  "/api/papers/saved": [],
  "/api/papers": {
    total: 2, page: 1,
    items: [
      { id: "p1", title: "Paper One", abstract: "abs", year: 2023, authors: ["A"], venue: "V", citation_count: 5, is_demo: false, relevance: 3.2 },
      { id: "p2", title: "Paper Two", abstract: "abs2", year: 2024, authors: ["B"], venue: "V2", citation_count: 6, is_demo: true, relevance: 1.1 },
    ],
  },
  "/api/papers/p1/citations": {
    paper: { id: "p1", title: "Paper One" },
    cites: [{ id: "p9", title: "Older work", year: 2020, venue: "V" }],
    citedBy: [{ id: "p8", title: "Newer work", year: 2025, venue: "W" }],
    counts: { cites: 1, citedBy: 1 },
  },
  "/api/citations/graph": {
    nodes: [{ id: "n1", index: 0, title: "N", year: 2023, citationCount: 1, isDemo: false, pagerank: 0.5, distance: 0, component: 0 }],
    edges: [], numComponents: 1, bfsOrder: [], algorithms: ["bfs"],
    stats: { nodes: 1, edges: 0, papers: 1 }, note: "note",
  },
  "/api/algorithms": {
    cEngine: { available: true, binary: "b", interface: "i", commands: [] },
    pipeline: [{ stage: "S", algorithms: ["a"], output: "o" }],
  },
  "/api/security/summary": {
    transport: "TLS terminated at the platform proxy",
    auth: {
      scheme: "JWT bearer tokens", accessTokenTtl: "2h", refreshTokenTtl: "30d",
      refreshTokensHashed: true, rotation: "single-use refresh tokens",
      passwordHashing: "bcrypt (cost 12)",
      passwordPolicy: "min 8 chars, two character classes",
      lockout: "10 failed attempts per account+IP within 15 min",
      enumeration: "identical error and comparable timing for unknown accounts",
    },
    transportSecurity: {
      headers: ["Content-Security-Policy", "X-Frame-Options"],
      hsts: true, csp: "self-only scripts", poweredBy: "disabled", cors: "explicit origin allow-list",
    },
    input: {
      validation: "zod schemas on every request body",
      sql: "parameterised statements only (no string-built SQL)",
      uploads: "PDF/DOCX/TXT only, 25 MB cap, filename sanitised",
      json: "2 MB body cap",
    },
    abuse: {
      globalRateLimit: "120 requests / minute", authRateLimit: "10 attempts / 15 min",
      uploadsPerUser: 50, concurrentIngestions: "1 per user, 3 globally",
    },
    privacy: {
      documents: "owned per account; other users receive 404 (not 403) so ids are not confirmed",
      legacyRows: "documents with no owner predate ownership tracking",
      demoPapers: "synthetic rows are flagged is_demo and badged DEMO in every surface",
    },
    audit: { trail: "auth, admin and upload events are recorded with timestamp and client IP" },
  },
  "/api/paper/p1": {
    id: "p1", title: "Paper One", abstract: "abs", authors: ["A"], year: 2023, venue: "V",
    chunks: [{ section: "Abstract", excerpt: "x" }], is_demo: false,
  },
  "/api/report/d1": {
    title: "T", similarPapers: [], passageMatches: [], gaps: [], topics: {}, keywords: [],
    ai: {
      score: 30, level: "LOW", disclaimer: "d", reasons: [],
      metrics: {
        sentenceLengthCv: 0.52, typeTokenRatio: 0.41, transitionsPer1k: 1.1,
        repeatedTrigrams: 3, sectionRegularity: 4.1,
      },
    },
    summary: {}, cEngine: {}, sections: [],
  },
  "/api/documents/d1/status": { id: "d1", stage: "QUEUED", progress: 10, done: false, failed: false },
};

beforeAll(() => {
  (globalThis as any).fetch = vi.fn(async (url: any) => {
    const u = String(url);
    const key = Object.keys(FIXTURES).find((k) => u.includes(k));
    return { ok: true, status: 200, json: async () => (key ? FIXTURES[key] : {}) } as any;
  });
});

function render(el: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("every page renders without crashing", () => {
  const pages: [string, () => Promise<ReactNode>][] = [
    ["Landing", async () => { const m = await import("./pages/Landing"); return <m.Landing />; }],
    ["Dashboard", async () => { const m = await import("./pages/Dashboard"); return <m.Dashboard />; }],
    ["Upload", async () => { const m = await import("./pages/Upload"); return <m.Upload />; }],
    ["Auth", async () => { const m = await import("./pages/Auth"); return <m.Auth />; }],
    ["Explorer", async () => { const m = await import("./pages/Explore"); return <m.Explorer />; }],
    ["PaperDetails", async () => { const m = await import("./pages/Explore"); return <m.PaperDetails />; }],
    ["Saved", async () => { const m = await import("./pages/Saved"); return <m.Saved />; }],
    ["Trends", async () => { const m = await import("./pages/Analytics"); return <m.Trends />; }],
    ["Algorithms", async () => { const m = await import("./pages/AlgorithmsSettings"); return <m.Algorithms />; }],
    ["Settings", async () => { const m = await import("./pages/AlgorithmsSettings"); return <m.Settings />; }],
    ["Security", async () => { const m = await import("./pages/Security"); return <m.Security />; }],
    ["GraphLab", async () => { const m = await import("./pages/GraphLab"); return <m.GraphLab />; }],
    ["Compare", async () => { const m = await import("./pages/Compare"); return <m.Compare />; }],
    ["Review", async () => { const m = await import("./pages/Review"); return <m.Review />; }],
    ["Processing", async () => { const m = await import("./pages/Processing"); return <m.Processing />; }],
    ["Chat", async () => { const m = await import("./pages/ChatReview"); return <m.Chat />; }],
    ["SimilarPapers", async () => { const m = await import("./pages/SimilarGaps"); return <m.SimilarPapers />; }],
    ["IeeeFormat", async () => { const m = await import("./pages/IeeeFormat"); return <m.IeeeFormat />; }],
  ];

  for (const [name, load] of pages) {
    it(`${name} renders`, async () => {
      const el = await load();
      expect(render(el as ReactNode).length).toBeGreaterThan(0);
    });
  }
});
