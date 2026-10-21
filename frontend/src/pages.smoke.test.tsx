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
      { id: "p1", title: "Paper One", abstract: "abs", year: 2023, authors: ["A"], venue: "V", citation_count: 5, is_demo: false },
      { id: "p2", title: "Paper Two", abstract: "abs2", year: 2024, authors: ["B"], venue: "V2", citation_count: 6, is_demo: true },
    ],
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
  "/api/paper/p1": {
    id: "p1", title: "Paper One", abstract: "abs", authors: ["A"], year: 2023, venue: "V",
    chunks: [{ section: "Abstract", excerpt: "x" }], is_demo: false,
  },
  "/api/report/d1": {
    title: "T", similarPapers: [], passageMatches: [], gaps: [], topics: {}, keywords: [],
    ai: { score: 30, level: "LOW", disclaimer: "d", reasons: [] },
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
  (globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  (globalThis as any).document = {
    documentElement: { classList: { contains: () => false, toggle: () => {} } },
  };
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
    ["GraphLab", async () => { const m = await import("./pages/GraphLab"); return <m.GraphLab />; }],
    ["Compare", async () => { const m = await import("./pages/Compare"); return <m.Compare />; }],
    ["Review", async () => { const m = await import("./pages/Review"); return <m.Review />; }],
    ["Processing", async () => { const m = await import("./pages/Processing"); return <m.Processing />; }],
    ["Chat", async () => { const m = await import("./pages/ChatReview"); return <m.Chat />; }],
    ["SimilarPapers", async () => { const m = await import("./pages/SimilarGaps"); return <m.SimilarPapers />; }],
  ];

  for (const [name, load] of pages) {
    it(`${name} renders`, async () => {
      const el = await load();
      expect(render(el as ReactNode).length).toBeGreaterThan(0);
    });
  }
});
