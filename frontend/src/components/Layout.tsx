import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { LayoutDashboard, Upload, FlaskConical, MessagesSquare, TrendingUp, Network, Database, Settings, Sparkles, BookOpen, GitCompare, Library, Moon, Sun, Cpu } from "lucide-react";

const LINKS = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/upload", label: "Upload", icon: Upload },
  { to: "/app/explorer", label: "Explorer", icon: BookOpen },
  { to: "/app/compare", label: "Compare", icon: GitCompare },
  { to: "/app/chat", label: "Chat", icon: MessagesSquare },
  { to: "/app/review", label: "Lit. Review", icon: Library },
  { to: "/app/trends", label: "Trends", icon: TrendingUp },
  { to: "/app/graph", label: "Citations", icon: Network },
  { to: "/app/algorithms", label: "Algorithms", icon: Cpu },
  { to: "/app/knowledge", label: "Knowledge", icon: Database },
  { to: "/app/admin", label: "Ingestion", icon: FlaskConical },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  const nav = useNavigate();
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  useEffect(() => {
    if (!localStorage.getItem("rl_token")) {
      fetch("/api/auth/demo", { method: "POST" }).then((r) => r.json()).then((d) => d.token && localStorage.setItem("rl_token", d.token)).catch(() => {});
    }
  }, []);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-[#0a0f1e]/70">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button onClick={() => nav("/")} className="flex min-w-0 items-center gap-2 text-sm font-semibold sm:text-base">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Sparkles size={16} /></span>
            <span className="truncate">ResearchLens AI</span>
          </button>
          <span className="badge hidden shrink-0 bg-amber-100 text-amber-800 min-[420px]:inline-flex dark:bg-amber-400/10 dark:text-amber-300">DEMO DATA</span>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn" onClick={() => { const d = !dark; setDark(d); document.documentElement.classList.toggle("dark", d); }} aria-label="theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button className="btn-primary whitespace-nowrap text-xs sm:text-sm" onClick={() => nav("/app/upload")}><Upload size={15} /> <span className="hidden sm:inline">Analyze paper</span><span className="sm:hidden">Analyze</span></button>
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
