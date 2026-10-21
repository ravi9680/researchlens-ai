import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Upload, MessagesSquare, TrendingUp, Settings as SettingsIcon, Sparkles,
  BookOpen, Cpu, Sun, Moon, LogOut, User, Shield, Bookmark, Network, BookMarked, Menu, X,
  ShieldCheck, Command,
} from "lucide-react";
import { api } from "../lib/api";

const LINKS = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, group: "Overview" },
  { to: "/app/upload", label: "Upload", icon: Upload, group: "Workspace" },
  { to: "/app/explorer", label: "Explorer", icon: BookOpen, group: "Workspace" },
  { to: "/app/saved", label: "Saved", icon: Bookmark, group: "Workspace" },
  { to: "/app/chat", label: "Chat", icon: MessagesSquare, group: "Explore" },
  { to: "/app/graph", label: "Graph", icon: Network, group: "Explore" },
  { to: "/app/review", label: "Review", icon: BookMarked, group: "Explore" },
  { to: "/app/trends", label: "Trends", icon: TrendingUp, group: "Explore" },
  { to: "/app/algorithms", label: "Algorithms", icon: Cpu, group: "Reference" },
  { to: "/app/security", label: "Security", icon: ShieldCheck, group: "Reference" },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon, group: "Reference" },
];

const GROUPS = ["Overview", "Workspace", "Explore", "Reference"];

const TITLES: Record<string, string> = {
  "/app": "Dashboard", "/app/upload": "Upload paper", "/app/explorer": "Research explorer",
  "/app/saved": "Saved papers", "/app/chat": "Research chat", "/app/graph": "Citation graph",
  "/app/review": "Literature review", "/app/trends": "Research trends",
  "/app/algorithms": "Algorithms", "/app/security": "Security", "/app/settings": "Settings",
};

export function Layout() {
  const nav = useNavigate();
  const loc = useLocation();
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("rl_dark");
    if (saved !== null) return saved === "true";
    return document.documentElement.classList.contains("dark");
  });
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  /* Keep the document title in sync with the active route. */
  useEffect(() => {
    document.title = TITLES[loc.pathname]
      ? `${TITLES[loc.pathname]} · ResearchLens AI`
      : "ResearchLens AI — Research Intelligence";
  }, [loc.pathname]);

  /* Close the mobile drawer whenever the route changes. */
  useEffect(() => { setMenuOpen(false); }, [loc.pathname]);

  /* ------------------------------------------------------------------
   * Identity bootstrap.
   *
   * A first-time visitor has no token. The old flow redirected them to the
   * login page, whose "continue as guest" link pointed back here — an
   * infinite loop with no way into the app. Now a guest identity is minted
   * on demand and the visitor lands in the workspace immediately; the
   * login/register page is offered for people who want their work to
   * follow them across devices.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        let token = localStorage.getItem("rl_token");
        if (!token) {
          const g: any = await api.guestLogin();
          if (cancelled) return;
          if (!g?.token) throw new Error("guest identity unavailable");
          api.setToken(g.token);
          if (g.refreshToken) api.setRefreshToken(g.refreshToken);
          token = g.token;
          setNotice("Browsing as a guest — create an account to keep your work across devices.");
          setTimeout(() => !cancelled && setNotice(""), 7000);
        } else {
          api.token = token;
        }

        const d: any = await api.me();
        if (cancelled) return;
        setUser(d);
        if (d.role === "admin") setIsAdmin(true);
      } catch {
        if (!cancelled) {
          api.clearToken();
          nav("/app/auth");
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [nav]);

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/30 animate-pulse">
            <Sparkles size={24} />
          </span>
          <div className="text-center">
            <p className="text-sm font-medium text-body">Loading ResearchLens…</p>
            <p className="mt-1 text-xs text-muted">Restoring your workspace</p>
          </div>
        </div>
      </div>
    );
  }

  const initials = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  const navList = (onNavigate?: () => void) => (
    <>
      {GROUPS.map((g) => {
        const items = LINKS.filter((l) => l.group === g);
        if (!items.length) return null;
        return (
          <div key={g} className="mb-4">
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{g}</p>
            <nav className="space-y-0.5">
              {items.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-200 ease-out ${
                      isActive
                        ? "bg-gradient-to-r from-indigo-600/12 to-violet-600/5 font-semibold text-indigo-700 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.16)] dark:from-indigo-500/20 dark:to-transparent dark:text-indigo-200"
                        : "font-medium text-slate-600 hover:translate-x-0.5 hover:bg-slate-200/70 hover:text-slate-900 hover:shadow-sm dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-indigo-500 to-violet-500 transition-all duration-300 dark:from-indigo-300 dark:to-violet-300 ${
                          isActive ? "opacity-100" : "scale-y-0 opacity-0"
                        }`}
                      />
                      <l.icon
                        size={16}
                        className={`transition-transform duration-200 ${
                          isActive
                            ? "text-indigo-600 dark:text-indigo-300"
                            : "text-slate-400 group-hover:scale-110 group-hover:text-slate-600 dark:group-hover:text-slate-200"
                        }`}
                      />
                      {l.label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-[#0a0f1e]/80">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button onClick={() => nav("/")} className="group flex items-center gap-2.5 rounded-xl pr-2 transition hover:opacity-90">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-600/25 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-lg group-hover:shadow-indigo-600/40">
              <Sparkles size={17} />
            </span>
            <span className="hidden text-[15px] font-semibold tracking-tight sm:block">
              ResearchLens <span className="text-muted">AI</span>
            </span>
          </button>

          <button
            className="icon-btn lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div className="ml-auto flex items-center gap-2">
            {notice && (
              <span className="hidden items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-800 animate-fade-in md:inline-flex dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                <User size={11} /> {notice}
              </span>
            )}

            <div className="hidden items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 py-1.5 pl-1.5 pr-3 transition hover:border-slate-300 hover:shadow-sm sm:flex dark:border-white/10 dark:bg-white/[0.05] dark:hover:border-white/20">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
                {initials}
              </span>
              <span className="max-w-[9rem] truncate text-sm font-medium text-body">{user.name || user.email}</span>
              {isAdmin && <span className="badge badge-indigo">ADMIN</span>}
            </div>

            <button
              className="icon-btn"
              onClick={() => { const d = !dark; setDark(d); localStorage.setItem("rl_dark", String(d)); }}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              <span className="transition-transform duration-300 hover:rotate-45 inline-flex">
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </span>
            </button>

            <button className="btn-primary hidden sm:inline-flex" onClick={() => nav("/app/upload")}>
              <Upload size={15} /> Upload paper
            </button>

            <button
              className="icon-btn hover:!bg-rose-500/10 hover:!text-rose-500"
              onClick={async () => {
                try { await api.req("/api/auth/logout", { method: "POST" }); } catch { /* best effort */ }
                api.clearToken();
                nav("/app/auth");
              }}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6">
        <aside className="hidden w-56 shrink-0 flex-col lg:flex">
          <div className="sticky top-24">{navList()}</div>
        </aside>

        <main className="min-w-0 flex-1 pb-20 lg:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-in overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[#0d1428]">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                <Sparkles size={17} />
              </span>
              <span className="font-semibold tracking-tight">ResearchLens AI</span>
            </div>
            {navList(() => setMenuOpen(false))}
            {isAdmin && (
              <div className="mt-2 rounded-xl bg-indigo-50 p-3 text-xs text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-200">
                <p className="flex items-center gap-1.5 font-semibold"><Shield size={13} /> Admin</p>
                <p className="mt-1 opacity-80">You have admin privileges on this deployment.</p>
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[11px] text-muted dark:border-white/10">
              <Command size={12} /> ResearchLens AI · v1.1
            </div>
          </aside>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-30 flex gap-1 overflow-x-auto border-t border-slate-200 bg-white/90 p-2 backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-[#0a0f1e]/90">
        {LINKS.filter((l) => ["Dashboard", "Upload", "Explorer", "Chat", "Graph"].includes(l.label)).map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 whitespace-nowrap rounded-xl px-2 py-1.5 text-[11px] font-medium transition-all duration-200 ${
              isActive
                ? "bg-indigo-600/12 text-indigo-700 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.18)] dark:bg-indigo-500/20 dark:text-indigo-300"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06]"
            }`}
          >
            <l.icon size={16} className="transition-transform duration-200" /> {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="h-16 lg:hidden" />
    </div>
  );
}

export function Card({ children, className = "" }: any) {
  return <div className={`card p-5 ${className}`}>{children}</div>;
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: any }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-body">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ text, action }: { text: string; action?: any }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <p className="max-w-md text-sm text-muted">{text}</p>
      {action}
    </div>
  );
}

export function ScoreBar({ v }: { v: number }) {
  const c = v >= 70 ? "bg-rose-500" : v >= 40 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
      <div
        className={`h-full rounded-full ${c} transition-all duration-700 ease-out`}
        style={{ width: `${Math.min(100, Math.max(0, v))}%` }}
      />
    </div>
  );
}
