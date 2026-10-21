import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { LayoutDashboard, Upload, FlaskConical, MessagesSquare, TrendingUp, Database, Settings, Sparkles, BookOpen, GitCompare, Cpu, Sun, Moon, LogOut, User, Shield, Settings as SettingsIcon, Bookmark, Network, BookMarked } from "lucide-react";
import { api } from "../lib/api";

const LINKS = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/upload", label: "Upload", icon: Upload },
  { to: "/app/explorer", label: "Explorer", icon: BookOpen },
  { to: "/app/saved", label: "Saved", icon: Bookmark },
  { to: "/app/chat", label: "Chat", icon: MessagesSquare },
  { to: "/app/graph", label: "Graph", icon: Network },
  { to: "/app/review", label: "Review", icon: BookMarked },
  { to: "/app/trends", label: "Trends", icon: TrendingUp },
  { to: "/app/algorithms", label: "Algorithms", icon: Cpu },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon },
];

export function Layout() {
  const nav = useNavigate();
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("rl_dark");
    if (saved !== null) return saved === "true";
    return document.documentElement.classList.contains("dark");
  });
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const token = localStorage.getItem("rl_token");
    if (!token) {
      nav("/app/auth");
      return;
    }
    api.token = token;
    api.me().then((d: any) => {
      setUser(d);
      if (d.role === "admin") setIsAdmin(true);
    }).catch(() => {
      localStorage.removeItem("rl_token");
      nav("/app/auth");
    }).finally(() => setAuthLoading(false));
  }, [nav]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white animate-pulse">
            <Sparkles size={22} />
          </span>
          <p className="text-sm text-slate-500">Loading ResearchLens…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-[#0a0f1e]/70">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button onClick={() => nav("/")} className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Sparkles size={16} /></span>
            ResearchLens AI
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/5 text-sm">
              <User size={14} className="mr-1" />
              <span className="font-medium">{user.name || user.email}</span>
              {isAdmin && <span className="badge bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">ADMIN</span>}
            </div>
            <button className="btn" onClick={() => { const d = !dark; setDark(d); localStorage.setItem("rl_dark", String(d)); }} aria-label="theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button className="btn-primary whitespace-nowrap text-xs sm:text-sm" onClick={() => nav("/app/upload")}><Upload size={15} /> Upload paper</button>
            <button className="btn border border-slate-300 dark:border-white/15" onClick={() => { api.token = ""; localStorage.removeItem("rl_token"); nav("/app/auth"); }}><LogOut size={15} /> Logout</button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-52 shrink-0 flex-col gap-1 lg:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${isActive ? "bg-indigo-600/10 font-medium text-indigo-600 dark:text-indigo-300" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`}>
              <l.icon size={16} /> {l.label}
            </NavLink>
          ))}
          {isAdmin && (
            <div className="mt-4 px-3">
              <NavLink to="/app/settings" end className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm bg-indigo-600/10 font-medium text-indigo-600 dark:text-indigo-300">
                <Shield size={16} /> Admin Settings
              </NavLink>
            </div>
          )}
        </aside>
        <main className="min-w-0 flex-1"><Outlet /></main>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex gap-1 overflow-x-auto border-t border-slate-200 bg-white/90 p-2 backdrop-blur lg:hidden dark:border-white/10 dark:bg-[#0a0f1e]/90">
        {LINKS.map((l) => (<NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs ${isActive ? "bg-indigo-600/10 text-indigo-600" : "text-slate-500"}`}><l.icon size={14} />{l.label}</NavLink>))}
      </nav>
      <div className="h-16 lg:hidden" />
    </div>
  );
}

export function Card({ children, className = "" }: any) { return <div className={`card p-5 ${className}`}>{children}</div>; }
export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return <div className="mb-5"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{sub && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}</div>;
}
export function Empty({ text }: { text: string }) { return <div className="card p-10 text-center text-sm text-slate-500">{text}</div>; }
export function ScoreBar({ v }: { v: number }) {
  const c = v >= 70 ? "bg-rose-500" : v >= 40 ? "bg-amber-500" : "bg-emerald-500";
  return <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><div className={`h-full rounded-full ${c}`} style={{ width: `${Math.min(100, v)}%` }} /></div>;
}
