import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useSaved } from "../lib/saved";
import { Card, PageTitle, Empty } from "../components/Layout";
import { Bookmark, Bookmark as BookmarkFill, GitCompare, Loader2 } from "lucide-react";

export function Explorer() {
  const [s, setS] = useState({ search: "", topic: "", sort: "relevance", page: 1 });
  const q = useQuery({ queryKey: ["papers", s], queryFn: () => api.papers({ ...s, limit: "12", page: String(s.page) }) });
  const total: number = (q.data as any)?.total || 0;
  const totalPages = Math.ceil(total / 12);

  const saved = useSaved();
  const [selected, setSelected] = useState<string[]>([]);
  const qc = useQueryClient();

  const toggleSelect = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 5 ? cur : [...cur, id]));

  return (
    <div>
      <PageTitle title="Research explorer" sub="Search the knowledge base" />
      <Card>
        <div className="grid gap-2 sm:grid-cols-4">
          <input className="input sm:col-span-2" placeholder="Search title / abstract…" value={s.search} onChange={(e) => setS({ ...s, search: e.target.value, page: 1 })} />
          <select className="input" value={s.topic} onChange={(e) => setS({ ...s, topic: e.target.value, page: 1 })}>
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
          <select className="input" value={s.sort} onChange={(e) => setS({ ...s, sort: e.target.value, page: 1 })}><option value="relevance">Relevance</option><option value="year">Newest</option><option value="citations">Cited</option></select>
        </div>
      </Card>

      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-300 bg-indigo-50/60 px-4 py-3 dark:border-indigo-500/30 dark:bg-indigo-500/10">
          <GitCompare size={16} className="text-indigo-600 dark:text-indigo-300" />
          <p className="text-sm font-medium">{selected.length} selected <span className="font-normal text-slate-500">(max 5)</span></p>
          <Link to={`/app/compare?ids=${selected.join(",")}`} className="btn-primary text-xs">Compare papers</Link>
          <button className="btn text-xs" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(q.data as any)?.items?.map((p: any) => (
          <Link key={p.id} to={`/app/paper/${p.id}`} className="card p-4 hover:border-indigo-400 relative">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-medium">{p.title} {p.is_demo && <span className="badge bg-amber-100 text-amber-700">DEMO</span>}</p>
                <p className="mt-1 text-xs text-slate-500">{(p.authors || []).join(", ")} · {p.year} · {p.venue}</p>
                <p className="mt-2 line-clamp-3 text-sm text-slate-500">{p.abstract}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  onClick={(e) => { e.preventDefault(); saved.toggle(p.id); }}
                  className={`p-2 rounded-lg transition-colors ${saved.isSaved(p.id) ? "bg-amber-500/20 text-amber-600" : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"}`}
                  title={saved.isSaved(p.id) ? "Remove bookmark" : "Bookmark"}
                >
                  {saved.isSaved(p.id) ? <BookmarkFill size={18} fill="currentColor" /> : <Bookmark size={18} />}
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); toggleSelect(p.id); }}
                  className={`p-2 rounded-lg transition-colors ${selected.includes(p.id) ? "bg-indigo-500/20 text-indigo-600" : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"}`}
                  title="Select for comparison"
                >
                  <GitCompare size={18} />
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {q.isLoading && <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="skel h-32" /><div className="skel h-32" /></div>}
      {(q.data as any)?.total === 0 && (
        <div className="mt-4 space-y-3">
          <Empty text="No papers match. Try ingesting for this topic." />
          <IngestPanel onDone={() => qc.invalidateQueries({ queryKey: ["papers"] })} />
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button className="btn border border-slate-300 dark:border-white/15" disabled={s.page === 1} onClick={() => setS({ ...s, page: s.page - 1 })}>← Prev</button>
          <span className="text-sm text-slate-500">Page {s.page} of {totalPages}</span>
          <button className="btn border border-slate-300 dark:border-white/15" disabled={s.page >= totalPages} onClick={() => setS({ ...s, page: s.page + 1 })}>Next →</button>
        </div>
      )}
    </div>
  );
}

/** Starts a real OpenAlex ingestion job and polls it to completion. */
export function IngestPanel({ onDone }: { onDone?: () => void }) {
  const [domain, setDomain] = useState("");
  const [count, setCount] = useState(15);
  const [jobId, setJobId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const job = useQuery({
    queryKey: ["ingest", jobId],
    queryFn: () => api.ingestStatus(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (q) => {
      const st = (q.state.data as any)?.status;
      return st && st !== "done" && st !== "failed" ? 2000 : false;
    },
  });

  const start = async () => {
    setErr("");
    try {
      const r: any = await api.ingest(domain, count);
      setJobId(r.jobId || r.id);
    } catch (e: any) { setErr(e.message); }
  };

  const j: any = job.data;
  const running = j && j.status !== "done" && j.status !== "failed";

  return (
    <Card>
      <h3 className="text-sm font-medium">Ingest real papers</h3>
      <p className="mt-1 text-xs text-slate-500">
        Pulls open-access metadata from OpenAlex. Falls back to clearly-labelled synthetic papers when offline.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input className="input flex-1 min-w-[180px]" placeholder="e.g. federated learning privacy" value={domain} onChange={(e) => setDomain(e.target.value)} disabled={Boolean(jobId)} />
        <input className="input w-24" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={Boolean(jobId)} />
        {!jobId && <button className="btn-primary" onClick={start} disabled={domain.trim().length < 2}>Start</button>}
        {jobId && <button className="btn border border-slate-300 dark:border-white/15" onClick={() => { setJobId(null); onDone?.(); }}>Close</button>}
      </div>
      {err && <p className="mt-2 text-xs text-rose-500">{err}</p>}
      {j && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5">
          {running && <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Loader2 size={14} className="animate-spin" /> Ingesting “{j.domain}”… {j.progress}%</p>}
          {j.status === "done" && (
            <>
              <p className="font-medium text-emerald-600">Done — {j.succeeded} added, {j.duplicates} duplicate, {j.failed} failed.</p>
              {(j.log || []).map((l: string, i: number) => (<p key={i} className="mt-1 text-xs text-slate-500">{l}</p>))}
            </>
          )}
          {j.status === "failed" && <p className="font-medium text-rose-500">Ingestion failed.</p>}
        </div>
      )}
    </Card>
  );
}

export function PaperDetails() {
  const { id = "" } = useParams();
  const saved = useSaved();

  const q = useQuery({ queryKey: ["paper", id], queryFn: () => api.paper(id) });

  if (q.isLoading) return <div className="skel h-64" />;
  if (q.isError) return <Empty text="Paper not found." />;
  const p: any = q.data;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageTitle title={p.title} sub={`${(p.authors || []).join(", ")} · ${p.year} · ${p.venue}`} />
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => saved.toggle(id)}
            className={`p-2 rounded-lg transition-colors ${saved.isSaved(id) ? "bg-amber-500/20 text-amber-600" : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"}`}
            title={saved.isSaved(id) ? "Remove bookmark" : "Bookmark"}
          >
            {saved.isSaved(id) ? <BookmarkFill size={18} fill="currentColor" /> : <Bookmark size={18} />}
          </button>
          <Link to={`/app/compare?ids=${id}`} className="btn border border-slate-300 dark:border-white/15" title="Compare this paper">
            <GitCompare size={16} />
          </Link>
        </div>
      </div>
      {p.is_demo && <p className="badge mb-3 bg-amber-100 text-amber-700">DEMO — synthetic metadata, not a real citation</p>}
      <Card><h3 className="text-sm font-medium">Abstract</h3><p className="mt-2 text-sm leading-relaxed">{p.abstract}</p>
        <p className="mt-3 text-xs text-slate-500">DOI: {p.doi || "—"} · Citations: {p.citation_count} · Source: {p.source_url || "—"}</p></Card>
      <Card className="mt-4"><h3 className="text-sm font-medium">Indexed chunks</h3>
        {(p.chunks || []).map((c: any, i: number) => (<p key={i} className="mt-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5"><b>{c.section}:</b> {c.excerpt}…</p>))}</Card>
    </div>
  );
}
