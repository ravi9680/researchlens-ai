import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15000 } } });

const BASE = ((import.meta as any).env?.VITE_API_URL as string) || "";
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => ({})) as any).error || `HTTP ${r.status}`);
  return r.json();
}
export const api = {
  token: localStorage.getItem("rl_token") || "",
  setToken(t: string) { this.token = t; localStorage.setItem("rl_token", t); },
  h(): HeadersInit { return { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }; },
  health: () => fetch(`${BASE}/api/health`).then(j),
  engine: () => fetch(`${BASE}/api/engine`).then(j),
  demoLogin: () => fetch(`${BASE}/api/auth/demo`, { method: "POST" }).then(j),
  dashboard: () => fetch(`${BASE}/api/dashboard/stats`, { headers: api.h() }).then(j),
  upload: async (f: File) => {
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch(`${BASE}/api/upload`, { method: "POST", body: fd });
    return j<{ documentId: string }>(r);
  },
  docStatus: (id: string) => fetch(`${BASE}/api/documents/${id}/status`).then(j),
  report: (id: string) => fetch(`${BASE}/api/documents/${id}/report`).then(j),
  docs: () => fetch(`${BASE}/api/documents`).then(j),
  papers: (p: Record<string, string> = {}) => fetch(`${BASE}/api/papers?` + new URLSearchParams(p)).then(j),
  paper: (id: string) => fetch(`${BASE}/api/papers/${id}`).then(j),
  compare: (ids: string[]) => fetch(`${BASE}/api/papers/compare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).then(j),
  trends: () => fetch(`${BASE}/api/trends`).then(j),
  graph: () => fetch(`${BASE}/api/citations/graph`).then(j),
  kb: () => fetch(`${BASE}/api/knowledge-base/stats`).then(j),
  ingest: (domain: string, count: number) => fetch(`${BASE}/api/ingest/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, count }) }).then(j),
  ingestStatus: (id: string) => fetch(`${BASE}/api/ingest/${id}`).then(j),
  chat: (question: string) => fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }).then(j),
  litReview: (topic: string, paperIds: string[] = []) => fetch(`${BASE}/api/literature-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, paperIds }) }).then(j),
  algorithms: () => fetch(`${BASE}/api/algorithms`).then(j),
};
