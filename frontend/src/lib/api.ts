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
  h(): HeadersInit { const t = this.token || localStorage.getItem("rl_token") || ""; return { ...(t ? { Authorization: `Bearer ${t}` } : {}) }; },
  // fetch with auth; on 401, mint a fresh guest identity once and retry
  async req(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers || {}), ...api.h() } });
    if (r.status === 401 && retry) {
      try {
        const g: any = await api.guestLogin();
        if (g?.token) { api.setToken(g.token); return api.req(path, init, false); }
      } catch { /* fall through to original 401 */ }
    }
    return r;
  },
  health: () => fetch(`${BASE}/api/health`).then(j),
  engine: () => fetch(`${BASE}/api/engine`).then(j),
  demoLogin: () => fetch(`${BASE}/api/auth/demo`, { method: "POST" }).then(j),
  guestLogin: () => fetch(`${BASE}/api/auth/guest`, { method: "POST" }).then(j),
  login: (email: string, password: string) => fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, guestToken: localStorage.getItem("rl_token") || undefined }) }).then(j),
  register: (email: string, password: string, name: string) => fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, name, guestToken: localStorage.getItem("rl_token") || undefined }) }).then(j),
  me: () => api.req(`/api/auth/me`).then(j),
  logout: () => { api.token = ""; localStorage.removeItem("rl_token"); location.reload(); },
  dashboard: () => api.req(`/api/dashboard/stats`).then(j),
  upload: async (f: File) => {
    const fd = new FormData(); fd.append("file", f);
    const r = await api.req(`/api/upload`, { method: "POST", body: fd });
    return j<{ documentId: string }>(r);
  },
  docStatus: (id: string) => api.req(`/api/documents/${id}/status`).then(j),
  report: (id: string) => api.req(`/api/documents/${id}/report`).then(j),
  docs: () => api.req(`/api/documents`).then(j),
  removeDoc: (id: string) => api.req(`/api/documents/${id}`, { method: "DELETE" }).then(j),
  papers: (p: Record<string, string> = {}) => fetch(`${BASE}/api/papers?` + new URLSearchParams(p)).then(j),
  paper: (id: string) => fetch(`${BASE}/api/papers/${id}`).then(j),
  compare: (ids: string[]) => fetch(`${BASE}/api/papers/compare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).then(j),
  trends: () => fetch(`${BASE}/api/trends`).then(j),
  graph: () => fetch(`${BASE}/api/citations/graph`).then(j),
  kb: () => fetch(`${BASE}/api/knowledge-base/stats`).then(j),
  ingest: (domain: string, count: number) => fetch(`${BASE}/api/ingest/start`, { method: "POST", headers: { "Content-Type": "application/json", ...api.h() }, body: JSON.stringify({ domain, count }) }).then(j),
  ingestStatus: (id: string) => api.req(`/api/ingest/${id}`).then(j),
  savePaper: (id: string) => api.req(`/api/papers/${id}/save`, { method: "POST" }).then(j),
  savedPapers: () => api.req(`/api/papers/saved`).then(j),
  chat: (question: string) => fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", ...api.h() }, body: JSON.stringify({ question }) }).then(j),
  litReview: (topic: string, paperIds: string[] = []) => api.req(`/api/literature-review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, paperIds }) }).then(j),
  algorithms: () => fetch(`${BASE}/api/algorithms`).then(j),
};
