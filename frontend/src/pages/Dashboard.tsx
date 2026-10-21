import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../lib/api";
import { Card, PageTitle, ScoreBar, Empty } from "../components/Layout";
import { Trash2 } from "lucide-react";

export function Dashboard() {
  const dash = useQuery({ queryKey: ["dash"], queryFn: api.dashboard });
  const trends = useQuery({ queryKey: ["trends"], queryFn: api.trends });
  const kb = useQuery<any>({ queryKey: ["kb-stats"], queryFn: api.kb });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  if (dash.isLoading) return <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-24" />)}</div>;
  if (dash.isError) return <Empty text="Backend unreachable. Start it with `npm --prefix backend run dev`." />;
  const d: any = dash.data;
  const cards = [
    ["Indexed papers", d.totalPapers], ["Authors", d.totalAuthors], ["Topics", d.totalTopics], ["Avg similarity", `${d.avgSimilarity}%`],
  ];

  async function confirmDelete(id: string) {
    setDeletingId(id);
    setDeleteError("");
  }

  async function doDelete(id: string) {
    try {
      await api.removeDoc(id);
      setDeletingId(null);
      dash.refetch();
    } catch (e: any) {
      setDeleteError(e.message);
    }
  }

  return (
    <div>
      <PageTitle title="Dashboard" sub="Research intelligence at a glance" />
      <div className="grid gap-4 sm:grid-cols-4">
        {cards.map(([k, v]) => (<Card key={k}><p className="text-xs text-slate-500">{k}</p><p className="mt-1 text-3xl font-semibold">{String(v)}</p></Card>))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium">Papers by year</h3>
          <div className="h-56"><ResponsiveContainer><BarChart data={(trends.data as any)?.papersByYear || []}><XAxis dataKey="year" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="count" fill="#6366f1" radius={6} /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-medium">Recent analyses</h3>
          <div className="space-y-2">
            {(d.recent || []).map((r: any) => (
              <div key={r.id} className="rounded-xl border border-slate-200 p-3 text-sm hover:border-indigo-400 dark:border-white/10">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link to={r.stage === "DONE" ? `/app/results/${r.id}` : `/app/processing/${r.id}`} className="font-medium hover:underline truncate block">{r.title || "Untitled"}</Link>
                    <p className="mt-1 text-xs text-slate-500">{r.stage} · {r.progress}%</p>
                    <div className="mt-2"><ScoreBar v={r.progress} /></div>
                  </div>
                  <button
                    className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                    title="Delete analysis"
                    onClick={() => confirmDelete(r.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {/* Inline delete confirmation */}
                {deletingId === r.id && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 dark:bg-rose-500/10">
                    <p className="flex-1 text-xs text-rose-600">Delete this analysis?</p>
                    <button className="text-xs font-medium text-rose-600 hover:underline" onClick={() => doDelete(r.id)}>Yes, delete</button>
                    <button className="text-xs text-slate-500 hover:underline" onClick={() => { setDeletingId(null); setDeleteError(""); }}>Cancel</button>
                  </div>
                )}
                {deletingId === r.id && deleteError && <p className="mt-1 text-xs text-rose-500">{deleteError}</p>}
              </div>
            ))}
            {!(d.recent || []).length && <p className="text-sm text-slate-500">No analyses yet — upload your first paper.</p>}
          </div>
          <Link to="/app/upload" className="btn-primary mt-4">New analysis</Link>
        </Card>
      </div>

      {kb.data && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Knowledge base</h3>
            <span className="badge bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">
              {(kb.data as any).embeddingProvider} · {(kb.data as any).embeddingDimension}-d embeddings
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {([
              ["Indexed chunks", (kb.data as any).chunks],
              ["Real papers", (kb.data as any).realPapers],
              ["Demo papers", (kb.data as any).demoPapers],
              ["Citation edges", (kb.data as any).citations],
              ["Avg chunks/paper", (kb.data as any).avgChunksPerPaper],
              ["C engine", (kb.data as any).cEngine ? "available" : "fallback"],
            ] as [string, any][]).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-xs text-slate-500">{k}</p>
                <p className="mt-1 text-lg font-semibold">{String(v)}</p>
              </div>
            ))}
          </div>
          {(kb.data as any).topTopics?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(kb.data as any).topTopics.map((t: any) => (
                <span key={t.topic} className="badge bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{t.topic} · {t.count}</span>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
