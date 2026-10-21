import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

const BASE = ((import.meta as any).env?.VITE_API_URL as string) || "";

/** Parse an error response into a readable message. */
async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const body: any = await r.json();
      if (body?.error) msg = body.error;
    } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  return r.json();
}

const TOKEN_KEY = "rl_token";
const REFRESH_KEY = "rl_refresh_token";

export const api = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  refreshToken: localStorage.getItem(REFRESH_KEY) || "",

  setToken(t: string) {
    this.token = t;
    localStorage.setItem(TOKEN_KEY, t);
  },

  setRefreshToken(t: string) {
    this.refreshToken = t;
    localStorage.setItem(REFRESH_KEY, t);
  },

  /** Drop every credential (sign-out, or a token that can no longer be used). */
  clearToken() {
    this.token = "";
    this.refreshToken = "";
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },

  h(): HeadersInit {
    const t = this.token || localStorage.getItem(TOKEN_KEY) || "";
    return t ? { Authorization: `Bearer ${t}` } : {};
  },

  /**
   * Authenticated request with automatic recovery.
   *
   * 401 → try the refresh token once → if that fails, mint a fresh guest
   * identity and retry. This is what lets a first-time visitor reach the app
   * with no account: the guest identity is created on demand instead of
   * bouncing them to a login form they have no reason to fill in.
   */
  async req(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), ...api.h() },
    });
    if (r.status === 401 && retry) {
      const refreshed = await api.tryRefresh();
      if (refreshed) return api.req(path, init, false);
      try {
        const g: any = await api.guestLogin();
        if (g?.token) {
          api.setToken(g.token);
          if (g.refreshToken) api.setRefreshToken(g.refreshToken);
          return api.req(path, init, false);
        }
      } catch { /* fall through to the original 401 */ }
    }
    return r;
  },

  /** Exchange the refresh token for a new access token. Returns false when
   *  there is nothing to refresh or the refresh token is no longer valid. */
  async tryRefresh(): Promise<boolean> {
    const rt = this.refreshToken || localStorage.getItem(REFRESH_KEY) || "";
    if (!rt) return false;
    try {
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) return false;
      const b: any = await res.json();
      if (!b?.token) return false;
      api.setToken(b.token);
      if (b.refreshToken) api.setRefreshToken(b.refreshToken);
      return true;
    } catch {
      return false;
    }
  },

  /* ---- identity ---- */
  health: () => fetch(`${BASE}/api/health`).then(j),
  engine: () => fetch(`${BASE}/api/engine`).then(j),
  demoLogin: () => fetch(`${BASE}/api/auth/demo`, { method: "POST" }).then(j),
  guestLogin: () => fetch(`${BASE}/api/auth/guest`, { method: "POST" }).then(j),
  login: (email: string, password: string) =>
    fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, guestToken: localStorage.getItem(TOKEN_KEY) || undefined }),
    }).then(j),
  register: (email: string, password: string, name: string) =>
    fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, guestToken: localStorage.getItem(TOKEN_KEY) || undefined }),
    }).then(j),
  me: () => api.req(`/api/auth/me`).then(j),
  logout: () => {
    api.clearToken();
    location.reload();
  },

  /* ---- workspace ---- */
  dashboard: () => api.req(`/api/dashboard/stats`).then(j),
  upload: async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    const r = await api.req(`/api/upload`, { method: "POST", body: fd });
    return j<{ documentId: string }>(r);
  },
  docStatus: (id: string) => api.req(`/api/documents/${id}/status`).then(j),
  report: (id: string) => api.req(`/api/documents/${id}/report`).then(j),
  docs: () => api.req(`/api/documents`).then(j),
  removeDoc: (id: string) => api.req(`/api/documents/${id}`, { method: "DELETE" }).then(j),
  exportReport: (id: string) => api.req(`/api/documents/${id}/export`).then(j),

  /* ---- knowledge base ---- */
  papers: (p: Record<string, string> = {}) =>
    fetch(`${BASE}/api/papers?` + new URLSearchParams(p)).then(j),
  paper: (id: string) => fetch(`${BASE}/api/papers/${id}`).then(j),
  paperCitations: (id: string) => fetch(`${BASE}/api/papers/${id}/citations`).then(j),
  compare: (ids: string[]) =>
    fetch(`${BASE}/api/papers/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then(j),
  trends: () => fetch(`${BASE}/api/trends`).then(j),
  graph: () => fetch(`${BASE}/api/citations/graph`).then(j),
  kb: () => fetch(`${BASE}/api/knowledge-base/stats`).then(j),
  security: () => fetch(`${BASE}/api/security/summary`).then(j),

  /* ---- ingestion ---- */
  ingest: (domain: string, count: number) =>
    fetch(`${BASE}/api/ingest/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...api.h() },
      body: JSON.stringify({ domain, count }),
    }).then(j),
  ingestStatus: (id: string) => api.req(`/api/ingest/${id}`).then(j),

  /* ---- research ---- */
  savePaper: (id: string) => api.req(`/api/papers/${id}/save`, { method: "POST" }).then(j),
  savedPapers: () => api.req(`/api/papers/saved`).then(j),
  chat: (question: string) =>
    fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...api.h() },
      body: JSON.stringify({ question }),
    }).then(j),
  litReview: (topic: string, paperIds: string[] = []) =>
    api.req(`/api/literature-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, paperIds }),
    }).then(j),
  algorithms: () => fetch(`${BASE}/api/algorithms`).then(j),
};
