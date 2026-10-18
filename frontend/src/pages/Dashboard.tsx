import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../lib/api";
import { Card, PageTitle, ScoreBar, Empty } from "../components/Layout";

export function Dashboard() {
  const dash = useQuery({ queryKey: ["dash"], queryFn: api.dashboard });
  const trends = useQuery({ queryKey: ["trends"], queryFn: api.trends });
  if (dash.isLoading) return <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skel h-24" />)}</div>;
  if (dash.isError) return <Empty text="Backend unreachable. Start it with `npm --prefix backend run dev`." />;
  const d: any = dash.data;
  const cards = [
    ["Indexed papers", d.totalPapers], ["Authors", d.totalAuthors], ["Topics", d.totalTopics], ["Avg similarity", `${d.avgSimilarity}%`],
  ];
  async function delDoc(id: string) {
    if (!confirm("Delete this analysis?")) return;
    try {
      await api.removeDoc(id);
      dash.refetch();
    } catch (e: any) { alert(e.message); }
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
              <div key={r.id} className="rounded-xl border border-slate-200 p-3 text-sm hover:border-indigo-400 dark:border-white/10 flex items-center justify-between">
                <div>
                  <Link to={r.stage === "DONE" ? `/app/results/${r.id}` : `/app/processing/${r.id}`} className="font-medium hover:underline">{r.title || "Untitled"}</Link>
                  <p className="mt-1 text-xs text-slate-500">{r.stage} · {r.progress}%</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="mt-2"><ScoreBar v={r.progress} /></div>
                  <button className="btn text-xs border border-slate-300 dark:border-white/15" onClick={() => delDoc(r.id)}>Delete</button>
                </div>
              </div>
            ))}
            {!(d.recent || []).length && <p className="text-sm text-slate-500">No analyses yet — upload your first paper.</p>}
          </div>
          <Link to="/app/upload" className="btn-primary mt-4">New analysis</Link>
        </Card>
      </div>
    </div>
  );
}
