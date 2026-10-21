import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../lib/api";
import { useReducedMotion } from "../lib/motion";
import { Card, PageTitle, ScoreBar, Empty } from "../components/Layout";
import {
  Trash2, BookOpen, Users, Tags, Gauge, Upload, Layers, Network, Cpu, Database, ArrowRight, ShieldCheck,
} from "lucide-react";

export function Dashboard() {
  const reduced = useReducedMotion();
  const dash = useQuery({ queryKey: ["dash"], queryFn: api.dashboard });
  const trends = useQuery({ queryKey: ["trends"], queryFn: api.trends });
  const kb = useQuery<any>({ queryKey: ["kb-stats"], queryFn: api.kb });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  if (dash.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-28" />)}</div>
        <div className="grid gap-4 lg:grid-cols-2"><div className="skel h-72" /><div className="skel h-72" /></div>
      </div>
    );
  }
  if (dash.isError) return <Empty text="Backend unreachable. Start it with `npm --prefix backend run dev`." />;
  const d: any = dash.data;

  const cards = [
    { k: "Indexed papers", v: d.totalPapers, icon: BookOpen, tint: "from-indigo-500 to-violet-600" },
    { k: "Authors", v: d.totalAuthors, icon: Users, tint: "from-sky-500 to-cyan-600" },
    { k: "Topics", v: d.totalTopics, icon: Tags, tint: "from-emerald-500 to-teal-600" },
    { k: "Avg similarity", v: `${d.avgSimilarity}%`, icon: Gauge, tint: "from-amber-500 to-orange-600" },
  ];

  async function doDelete(id: string) {
    try {
      await api.removeDoc(id);
      setDeletingId(null);
      dash.refetch();
    } catch (e: any) {
      setDeleteError(e.message);
    }
  }

  const k: any = kb.data;

  return (
    <div>
      <PageTitle
        title="Dashboard"
        sub="Research intelligence at a glance"
        action={
          <Link to="/app/upload" className="btn-primary">
            <Upload size={15} /> New analysis
          </Link>
        }
      />

      {/* ---------- stat cards ---------- */}
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ k: key, v, icon: Icon, tint }) => (
          <div key={key} className="card card-hover group relative overflow-hidden p-5">
            <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${tint} opacity-[0.07] transition-all duration-500 group-hover:scale-150 group-hover:opacity-[0.16]`} />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-faint">{key}</p>
                <p className="stat-num mt-1.5 text-3xl font-semibold text-body">{String(v)}</p>
              </div>
              <span className={`grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br ${tint} text-white shadow-md transition-transform duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
                <Icon size={17} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ---------- charts + recent ---------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-body">Papers by year</h3>
            <Link to="/app/trends" className="link text-xs">All trends →</Link>
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={(trends.data as any)?.papersByYear || []} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(99,102,241,0.08)" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}
                />
                <Bar dataKey="count" fill="url(#barFill)" radius={[6, 6, 0, 0]} maxBarSize={44} isAnimationActive={!reduced} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-body">Recent analyses</h3>
            <span className="badge badge-slate">{d.analyses} total</span>
          </div>
          <div className="space-y-2">
            {(d.recent || []).map((r: any) => (
              <div key={r.id} className="group rounded-xl border border-slate-200/80 p-3 transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-white/10 dark:hover:border-indigo-400/40 dark:hover:bg-indigo-500/[0.06]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={r.stage === "DONE" ? `/app/results/${r.id}` : `/app/processing/${r.id}`}
                      className="block truncate font-medium text-body transition hover:text-indigo-700 dark:hover:text-indigo-300"
                    >
                      {r.title || "Untitled"}
                    </Link>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className={`badge ${r.stage === "DONE" ? "badge-emerald" : r.stage === "FAILED" ? "badge-rose" : "badge-sky"}`}>
                        {r.stage}
                      </span>
                      <span className="text-xs text-muted">{r.progress}%</span>
                    </div>
                    <div className="mt-2"><ScoreBar v={r.progress} /></div>
                  </div>
                  <button
                    className="icon-btn-sm shrink-0 rounded-lg text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                    title="Delete analysis"
                    aria-label={`Delete ${r.title || "analysis"}`}
                    onClick={() => { setDeleteError(""); setDeletingId(r.id); }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {deletingId === r.id && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-500/10">
                    <p className="flex-1 text-xs font-medium text-rose-700 dark:text-rose-300">Delete this analysis?</p>
                    <button className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300" onClick={() => doDelete(r.id)}>Yes, delete</button>
                    <button className="text-xs text-muted hover:underline" onClick={() => setDeletingId(null)}>Cancel</button>
                  </div>
                )}
                {deletingId === r.id && deleteError && <p className="mt-1.5 text-xs text-rose-600">{deleteError}</p>}
              </div>
            ))}
            {!(d.recent || []).length && (
              <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center dark:border-white/15">
                <p className="text-sm text-muted">No analyses yet — upload your first paper.</p>
                <Link to="/app/upload" className="btn-primary btn-sm mt-3">Upload paper</Link>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ---------- knowledge base ---------- */}
      {k && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-body">
              <Database size={16} className="text-indigo-600 dark:text-indigo-300" /> Knowledge base
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="badge badge-indigo">{k.embeddingProvider} · {k.embeddingDimension}-d</span>
              <span className={`badge ${k.cEngine ? "badge-emerald" : "badge-amber"}`}>
                C engine {k.cEngine ? "available" : "fallback"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {([
              ["Indexed chunks", k.chunks, Layers],
              ["Real papers", k.realPapers, BookOpen],
              ["Demo papers", k.demoPapers, Tags],
              ["Citation edges", k.citations, Network],
              ["Avg chunks/paper", k.avgChunksPerPaper, Cpu],
              ["Avg citations", k.avgCitations, Gauge],
            ] as [string, any, any][]).map(([key, val, Icon]) => (
              <div key={key} className="card-inset transition hover:bg-slate-100 dark:hover:bg-white/[0.07]">
                <div className="flex items-center gap-1.5">
                  <Icon size={13} className="text-faint" />
                  <p className="text-[11px] font-medium uppercase tracking-wider text-faint">{key}</p>
                </div>
                <p className="stat-num mt-1 text-xl font-semibold text-body">{String(val)}</p>
              </div>
            ))}
          </div>

          {k.topTopics?.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {k.topTopics.map((t: any) => (
                <span key={t.topic} className="badge badge-slate">{t.topic} · {t.count}</span>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ---------- quick links ---------- */}
      <div className="stagger mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: "/app/explorer", label: "Browse papers", d: "Search the knowledge base", icon: BookOpen },
          { to: "/app/graph", label: "Citation graph", d: "BFS & PageRank exploration", icon: Network },
          { to: "/app/review", label: "Literature review", d: "Grounded theme outline", icon: Layers },
          { to: "/app/security", label: "Security", d: "Live posture & controls", icon: ShieldCheck },
        ].map((q) => (
          <Link key={q.to} to={q.to} className="card card-hover group flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600/10 text-indigo-600 transition-all duration-300 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-500/15 dark:text-indigo-300">
              <q.icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-body">{q.label}</span>
              <span className="block truncate text-xs text-muted">{q.d}</span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-faint transition-all duration-300 group-hover:translate-x-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}
