import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";

export function Explorer() {
  const [s, setS] = useState({ search: "", topic: "", sort: "relevance" });
  const q = useQuery({ queryKey: ["papers", s], queryFn: () => api.papers({ ...s, limit: "12" }) });
  return (
    <div>
      <PageTitle title="Research explorer" sub="Search the knowledge base" />
      <Card>
        <div className="grid gap-2 sm:grid-cols-4">
          <input className="input sm:col-span-2" placeholder="Search title / abstract…" value={s.search} onChange={(e) => setS({ ...s, search: e.target.value })} />
          <input className="input" placeholder="Topic filter…" value={s.topic} onChange={(e) => setS({ ...s, topic: e.target.value })} />
          <select className="input" value={s.sort} onChange={(e) => setS({ ...s, sort: e.target.value })}><option value="relevance">Relevance</option><option value="year">Newest</option><option value="citations">Cited</option></select>
        </div>
      </Card>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(q.data as any)?.items?.map((p: any) => (
          <Link key={p.id} to={`/app/paper/${p.id}`} className="card p-4 hover:border-indigo-400">
            <p className="font-medium">{p.title} {p.is_demo && <span className="badge bg-amber-100 text-amber-700">DEMO</span>}</p>
            <p className="mt-1 text-xs text-slate-500">{(p.authors || []).join(", ")} · {p.year} · {p.venue}</p>
            <p className="mt-2 line-clamp-3 text-sm text-slate-500">{p.abstract}</p>
          </Link>
        ))}
      </div>
      {q.isLoading && <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="skel h-32" /><div className="skel h-32" /></div>}
      {(q.data as any)?.total === 0 && <div className="mt-4"><Empty text="No papers match. Try ingestion for this topic." /></div>}
    </div>
  );
}

export function PaperDetails() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["paper", id], queryFn: () => api.paper(id) });
  if (q.isLoading) return <div className="skel h-64" />;
  if (q.isError) return <Empty text="Paper not found." />;
  const p: any = q.data;
  return (
    <div>
      <PageTitle title={p.title} sub={`${(p.authors || []).join(", ")} · ${p.year} · ${p.venue}`} />
      {p.is_demo && <p className="badge mb-3 bg-amber-100 text-amber-800">DEMO — synthetic metadata, not a real citation</p>}
      <Card><h3 className="text-sm font-medium">Abstract</h3><p className="mt-2 text-sm leading-relaxed">{p.abstract}</p>
        <p className="mt-3 text-xs text-slate-500">DOI: {p.doi || "—"} · Citations: {p.citation_count} · Source: {p.source_url || "—"}</p></Card>
      <Card className="mt-4"><h3 className="text-sm font-medium">Indexed chunks</h3>
        {(p.chunks || []).map((c: any, i: number) => (<p key={i} className="mt-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5"><b>{c.section}:</b> {c.excerpt}…</p>))}</Card>
    </div>
  );
}

export function Compare() {
  const [q, setQ] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState("");
  const search = useQuery({ queryKey: ["cmp-search", q], queryFn: () => api.papers({ search: q, limit: "8" }), enabled: q.length >= 2 });
  function toggle(id: string) {
    setIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 4 ? prev : [...prev, id]);
  }
  return (
    <div>
      <PageTitle title="Paper comparison" sub="Search and pick up to 4 papers" />
      <Card>
        <input className="input" placeholder="Search papers to compare…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 space-y-1.5">
          {((search.data as any)?.items || []).map((p: any) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 p-2 text-sm dark:border-white/10">
              <input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} />
              <span className="min-w-0 flex-1 truncate">{p.title} <span className="text-xs text-slate-500">({p.year})</span></span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-slate-500">{ids.length}/4 selected</span>
          <button className="btn-primary ml-auto" disabled={ids.length < 2} onClick={async () => { setErr(""); try { setRes(await api.compare(ids)); } catch (e: any) { setErr(e.message); } }}>Compare</button>
        </div>
        {err && <p className="mt-2 text-sm text-rose-500">{err}</p>}
      </Card>
      {res && (
        <Card className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr><th className="text-left">Feature</th>{res.papers.map((p: any) => <th key={p.id} className="text-left">{p.title.slice(0, 40)}…</th>)}</tr></thead>
            <tbody>{res.table.map((r: any) => (<tr key={r.feature} className="border-t border-slate-100 dark:border-white/5"><td className="py-2 font-medium">{r.feature}</td>{r.values.map((v: string, i: number) => <td key={i} className="py-2 pr-3 text-slate-500">{String(v).slice(0, 140)}</td>)}</tr>))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
