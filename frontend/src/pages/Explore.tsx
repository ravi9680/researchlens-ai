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
          <select className="input" value={s.topic} onChange={(e) => setS({ ...s, topic: e.target.value })}>
            <option value="">All topics</option>
            <option value="Phishing & URL Security">Phishing & URL Security</option>
            <option value="Transformers & LLMs">Transformers & LLMs</option>
            <option value="Retrieval-Augmented Generation">Retrieval-Augmented Generation</option>
            <option value="Computer Vision">Computer Vision</option>
            <option value="Graph Learning">Graph Learning</option>
            <option value="Anomaly Detection">Anomaly Detection</option>
            <option value="Time Series & Forecasting">Time Series & Forecasting</option>
            <option value="Recommender Systems">Recommender Systems</option>
            <option value="Medical AI">Medical AI</option>
            <option value="NLP & Text Classification">NLP & Text Classification</option>
          </select>
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
