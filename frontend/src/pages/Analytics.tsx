import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#84cc16"];

export function Trends() {
  const q = useQuery({ queryKey: ["trends"], queryFn: api.trends });
  if (q.isLoading) return <div className="skel h-64" />;
  if (q.isError) return <Empty text="Trends unavailable." />;
  const d: any = q.data;
  return (
    <div>
      <PageTitle title="Research trends" sub={`${d.total} indexed papers (${d.demoCount} demo)`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h3 className="mb-2 text-sm font-medium">Publication volume by year</h3>
          <div className="h-64"><ResponsiveContainer><BarChart data={d.papersByYear}><XAxis dataKey="year" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="count" fill="#6366f1" radius={6} /></BarChart></ResponsiveContainer></div></Card>
        <Card><h3 className="mb-2 text-sm font-medium">Topic distribution</h3>
          <div className="h-64"><ResponsiveContainer><PieChart><Pie data={d.topics} dataKey="count" nameKey="topic" outerRadius={100} label>{d.topics.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></Card>
      </div>
      <Card className="mt-4"><h3 className="text-sm font-medium">Popular vs emerging</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">{(d.topics || []).map((t: any, i: number) => (<span key={t.topic} className="badge bg-indigo-500/10 text-indigo-600">{t.topic} · {t.count}{i === 0 ? " · popular" : i >= d.topics.length - 2 ? " · emerging" : ""}</span>))}</div></Card>
    </div>
  );
}

export function CitationGraph() {
  const q = useQuery({ queryKey: ["graph"], queryFn: api.graph });
  const nav = useNavigate();
  const [t, setT] = useState({ x: 0, y: 0, k: 1 });
  const [drag, setDrag] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [sel, setSel] = useState<any>(null);
  const [fq, setFq] = useState("");
  if (q.isLoading) return <div className="skel h-96" />;
  if (q.isError) return <Empty text="Graph unavailable." />;
  const d: any = q.data;
  const W = 680, H = 420;
  const nodes = (d.nodes || []).filter((n: any) => !fq || (n.title || "").toLowerCase().includes(fq.toLowerCase()));
  const vis = new Set(nodes.map((n: any) => n.index));
  const pos = (d.nodes || []).map((_: any, i: number, a: any[]) => ({ x: 60 + (W - 120) * (i / Math.max(1, a.length - 1)), y: H / 2 + Math.sin(i * 1.7) * 120 }));
  const id2i: Map<string, number> = new Map((d.nodes || []).map((n: any) => [String(n.id), Number(n.index)]));
  const zoom = (f: number) => setT((p) => ({ ...p, k: Math.min(3, Math.max(0.4, p.k * f)) }));
  return (
    <div>
      <PageTitle title="Citation graph" sub={`BFS · DFS · connected components · PageRank (C engine${d.analysis ? "" : " unavailable — layout only"})`} />
      <Card>
        <div className="mb-2 flex flex-wrap gap-2">
          <input className="input max-w-xs" placeholder="Search nodes…" value={fq} onChange={(e) => setFq(e.target.value)} />
          <button className="btn border border-slate-300 dark:border-white/15" onClick={() => zoom(1.25)}>+</button>
          <button className="btn border border-slate-300 dark:border-white/15" onClick={() => zoom(0.8)}>−</button>
          <button className="btn border border-slate-300 dark:border-white/15" onClick={() => setT({ x: 0, y: 0, k: 1 })}>Reset</button>
          <span className="ml-auto text-xs text-slate-500">drag to pan · scroll to zoom · click a node</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-grab rounded-xl bg-slate-50 dark:bg-white/[0.02]"
          onWheel={(e) => zoom(e.deltaY < 0 ? 1.1 : 0.9)}
          onMouseDown={(e) => setDrag({ sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y })}
          onMouseMove={(e) => { if (drag) setT((p) => ({ ...p, x: drag.ox + (e.clientX - drag.sx), y: drag.oy + (e.clientY - drag.sy) })); }}
          onMouseUp={() => setDrag(null)} onMouseLeave={() => setDrag(null)}>
          <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
            {(d.edges || []).slice(0, 120).map((e: any, i: number) => {
              const a = pos[id2i.get(e.citing_paper_id) ?? -1], b = pos[id2i.get(e.cited_paper_id) ?? -1];
              if (!a || !b) return null;
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#6366f1" strokeOpacity={0.35} />;
            })}
            {pos.map((p: any, i: number) => {
              if (!vis.has(i)) return null;
              return (
                <g key={i} className="cursor-pointer" onClick={() => setSel(d.nodes[i])}>
                  <circle cx={p.x} cy={p.y} r={7 + Math.min(10, (d.nodes[i]?.pagerank || 0) * 40)} fill={sel?.index === i ? "#8b5cf6" : "#6366f1"} fillOpacity={0.85} />
                  <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.7}>{(d.nodes[i]?.title || "").slice(0, 26)}…</text>
                </g>
              );
            })}
          </g>
        </svg>
        <div className="mt-2 text-xs text-slate-500">Nodes sized by PageRank · {d.analysis?.num_components ?? "?"} component(s).</div>
        {sel && (
          <div className="mt-3 rounded-xl border border-indigo-300 p-3 text-sm dark:border-indigo-500/30">
            <p className="font-medium">{sel.title}</p>
            <p className="text-xs text-slate-500">{sel.year} · cited by {sel.citations} · PageRank {(sel.pagerank ?? 0).toFixed(4)}</p>
            <button className="btn-primary mt-2" onClick={() => nav(`/app/paper/${sel.id}`)}>Open paper →</button>
          </div>
        )}
      </Card>
    </div>
  );
}

export function Knowledge() {
  const q = useQuery({ queryKey: ["kb"], queryFn: api.kb });
  if (q.isLoading) return <div className="skel h-64" />;
  if (q.isError) return <Empty text="Knowledge base unavailable." />;
  const d: any = q.data;
  return (
    <div>
      <PageTitle title="Knowledge base" sub={`${d.papers} papers · ${d.chunks} chunks · ${d.demoPapers} demo`} />
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Papers", d.papers], ["Authors", d.authors], ["Topics", d.topics], ["Chunks", d.chunks]].map(([k, v]) => (
          <Card key={k}><p className="text-xs text-slate-500">{k}</p><p className="text-3xl font-semibold">{String(v)}</p></Card>
        ))}
      </div>
      <Card className="mt-4"><h3 className="text-sm font-medium">Ingestion jobs</h3>
        {(d.jobs || []).map((j: any) => (<p key={j.id} className="mt-1 text-sm text-slate-500">{j.domain} · target {j.target_count} · {j.status} · {j.progress}% (ok {j.succeeded}, dup {j.duplicates}, fail {j.failed})</p>))}
        {!(d.jobs || []).length && <p className="mt-1 text-sm text-slate-500">No ingestion jobs yet.</p>}
      </Card>
    </div>
  );
}

export function Admin() {
  const qq = useQuery({ queryKey: ["kb"], queryFn: api.kb });
  const [domain, setDomain] = useState("phishing detection");
  const [count, setCount] = useState(20);
  const [job, setJob] = useState("");
  const [status, setStatus] = useState<any>(null);
  async function start() {
    const r: any = await api.ingest(domain, count);
    setJob(r.jobId);
    const t = setInterval(async () => {
      const s: any = await api.ingestStatus(r.jobId);
      setStatus(s);
      if (s.status !== "running") { clearInterval(t); qq.refetch(); }
    }, 1500);
  }
  return (
    <div>
      <PageTitle title="Ingestion dashboard" sub="Legitimate open-access sources only (OpenAlex → Crossref → arXiv). Respects rate limits." />
      <Card>
        <div className="grid gap-2 sm:grid-cols-3">
          <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)}>
            {["phishing detection", "retrieval augmented generation", "graph neural networks", "computer vision transformers", "anomaly detection", "recommender systems"].map((d) => <option key={d}>{d}</option>)}
          </select>
          <input className="input" type="number" min={1} max={100} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          <button className="btn-primary" onClick={start}>Start ingestion</button>
        </div>
        {job && <p className="mt-3 text-sm">Job <code>{job}</code> — {status?.status || "starting"} · {status?.progress || 0}% · ok {status?.succeeded || 0} · dup {status?.duplicates || 0} · fail {status?.failed || 0}</p>}
        {status?.log?.map((l: string, i: number) => <p key={i} className="text-xs text-slate-500">{l}</p>)}
        <p className="mt-3 text-xs text-slate-400">Duplicates are detected by DOI/title fingerprinting (C: FNV-1a + normalized title match). Failures can be retried by re-running the domain.</p>
      </Card>
    </div>
  );
}
