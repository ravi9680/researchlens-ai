import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useSaved } from "../lib/saved";
import { Card, PageTitle, Empty } from "../components/Layout";
import {
  Bookmark, Bookmark as BookmarkFill, GitCompare, Loader2, Search, Inbox, X, AlertCircle,
} from "lucide-react";

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
      <PageTitle
        title="Research explorer"
        sub={`${total} indexed papers · select up to 5 to compare`}
        action={
          selected.length > 0 ? (
            <Link to={`/app/compare?ids=${selected.join(",")}`} className="btn-primary">
              <GitCompare size={15} /> Compare {selected.length}
            </Link>
          ) : undefined
        }
      />

      <Card className="!p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_200px_150px]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input pl-10"
              placeholder="Search titles and abstracts…"
              value={s.search}
              onChange={(e) => setS({ ...s, search: e.target.value, page: 1 })}
            />
          </div>
          <select className="select" value={s.topic} onChange={(e) => setS({ ...s, topic: e.target.value, page: 1 })}>
            <option value="">All topics</option>
            {[
              "Phishing & URL Security", "Transformers & LLMs", "Retrieval-Augmented Generation",
              "Computer Vision", "Graph Learning", "Anomaly Detection",
              "Time Series & Forecasting", "Recommender Systems", "Medical AI",
              "NLP & Text Classification",
            ].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select" value={s.sort} onChange={(e) => setS({ ...s, sort: e.target.value, page: 1 })}>
            <option value="relevance">Relevance</option>
            <option value="year">Newest</option>
            <option value="citations">Most cited</option>
          </select>
        </div>
      </Card>

      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-300 bg-indigo-50/70 px-4 py-3 dark:border-indigo-400/40 dark:bg-indigo-500/10">
          <GitCompare size={16} className="text-indigo-700 dark:text-indigo-300" />
          <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
            {selected.length} selected <span className="font-normal opacity-70">(max 5)</span>
          </p>
          <Link to={`/app/compare?ids=${selected.join(",")}`} className="btn-primary btn-sm">Compare papers</Link>
          <button className="btn-ghost btn-sm" onClick={() => setSelected([])}>
            <X size={13} /> Clear
          </button>
        </div>
      )}

      {q.isLoading && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skel h-36" />)}
        </div>
      )}

      {q.isError && <div className="mt-4"><Empty text="Could not reach the knowledge base." /></div>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {(q.data as any)?.items?.map((p: any) => (
          <Link
            key={p.id}
            to={`/app/paper/${p.id}`}
            className={`card card-hover group relative p-4 ${selected.includes(p.id) ? "border-indigo-400 ring-2 ring-indigo-500/20 dark:border-indigo-400/60" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug text-body transition group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                  {p.title}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {p.is_demo && <span className="badge badge-amber">DEMO</span>}
                  {p.year && <span className="badge badge-slate">{p.year}</span>}
                  {p.citation_count > 0 && <span className="badge badge-sky">{p.citation_count} citations</span>}
                </div>
                <p className="mt-1.5 truncate text-xs text-muted">
                  {(p.authors || []).join(", ") || "Unknown authors"}
                  {p.venue ? ` · ${p.venue}` : ""}
                </p>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{p.abstract}</p>
              </div>

              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  onClick={(e) => { e.preventDefault(); saved.toggle(p.id); }}
                  className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                    saved.isSaved(p.id)
                      ? "bg-amber-500/20 text-amber-600"
                      : "text-slate-400 hover:bg-amber-500/10 hover:text-amber-600"
                  }`}
                  title={saved.isSaved(p.id) ? "Remove bookmark" : "Bookmark"}
                  aria-label={saved.isSaved(p.id) ? "Remove bookmark" : "Bookmark"}
                >
                  {saved.isSaved(p.id) ? <BookmarkFill size={17} fill="currentColor" /> : <Bookmark size={17} />}
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); toggleSelect(p.id); }}
                  className={`grid h-9 w-9 place-items-center rounded-xl transition ${
                    selected.includes(p.id)
                      ? "bg-indigo-500/20 text-indigo-600"
                      : "text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-600"
                  }`}
                  title="Select for comparison"
                  aria-label="Select for comparison"
                >
                  <GitCompare size={17} />
                </button>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {total === 0 && !q.isLoading && (
        <div className="mt-4 space-y-3">
          <Empty
            text="No papers match this query. Ingest real papers for the topic to fill the knowledge base."
            action={
              <button className="btn-secondary" onClick={() => setS({ ...s, search: "", topic: "", page: 1 })}>
                <Inbox size={15} /> Reset filters
              </button>
            }
          />
          <IngestPanel onDone={() => qc.invalidateQueries({ queryKey: ["papers"] })} />
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <button className="btn-secondary btn-sm" disabled={s.page === 1} onClick={() => setS({ ...s, page: s.page - 1 })}>
            ← Prev
          </button>
          <span className="text-sm text-muted">Page {s.page} of {totalPages}</span>
          <button className="btn-secondary btn-sm" disabled={s.page >= totalPages} onClick={() => setS({ ...s, page: s.page + 1 })}>
            Next →
          </button>
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

  const job = useQuery<any>({
    queryKey: ["ingest", jobId],
    queryFn: () => api.ingestStatus(jobId as string),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const st = (query.state.data as any)?.status;
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
      <h3 className="text-sm font-semibold tracking-tight text-body">Ingest real papers</h3>
      <p className="mt-1 text-xs text-muted">
        Pulls open-access metadata from OpenAlex. Falls back to clearly-labelled synthetic papers when offline.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="input min-w-[200px] flex-1"
          placeholder="e.g. federated learning privacy"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          disabled={Boolean(jobId)}
        />
        <input
          className="input w-24"
          type="number" min={1} max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          disabled={Boolean(jobId)}
          aria-label="Number of papers"
        />
        {!jobId && (
          <button className="btn-primary" onClick={start} disabled={domain.trim().length < 2}>Start</button>
        )}
        {jobId && (
          <button className="btn-secondary" onClick={() => { setJobId(null); onDone?.(); }}>Close</button>
        )}
      </div>

      {err && (
        <p className="field-ok mt-3 flex items-center gap-2 !border-rose-200 !bg-rose-50 !text-rose-700 dark:!border-rose-500/30 dark:!bg-rose-500/10 dark:!text-rose-300">
          <AlertCircle size={15} className="shrink-0" /> {err}
        </p>
      )}

      {j && (
        <div className="mt-4 card-inset text-sm">
          {running && (
            <p className="flex items-center gap-2 font-medium text-body">
              <Loader2 size={14} className="animate-spin text-indigo-600 dark:text-indigo-300" />
              Ingesting “{j.domain}”… {j.progress}%
            </p>
          )}
          {j.status === "done" && (
            <>
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                Done — {j.succeeded} added, {j.duplicates} duplicate, {j.failed} failed.
              </p>
              {(j.log || []).map((l: string, i: number) => (
                <p key={i} className="mt-1 text-xs text-muted">{l}</p>
              ))}
            </>
          )}
          {j.status === "failed" && <p className="font-semibold text-rose-600">Ingestion failed.</p>}
        </div>
      )}
    </Card>
  );
}

export function PaperDetails() {
  const { id = "" } = useParams();
  const saved = useSaved();
  const q = useQuery({ queryKey: ["paper", id], queryFn: () => api.paper(id) });

  if (q.isLoading) return <div className="skel h-72" />;
  if (q.isError) return <Empty text="Paper not found." />;
  const p: any = q.data;

  return (
    <div>
      <PageTitle title={p.title} sub={`${(p.authors || []).join(", ")} · ${p.year ?? "—"} · ${p.venue || "—"}`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => saved.toggle(id)}
          className={`btn btn-sm ${saved.isSaved(id) ? "btn-secondary !border-amber-300 !bg-amber-50 !text-amber-700 dark:!border-amber-500/40 dark:!bg-amber-500/10 dark:!text-amber-300" : "btn-secondary"}`}
        >
          {saved.isSaved(id) ? <BookmarkFill size={14} fill="currentColor" /> : <Bookmark size={14} />}
          {saved.isSaved(id) ? "Saved" : "Save"}
        </button>
        <Link to={`/app/compare?ids=${id}`} className="btn-secondary btn-sm">
          <GitCompare size={14} /> Compare
        </Link>
        {p.is_demo && <span className="badge badge-amber">DEMO — synthetic metadata, not a real citation</span>}
      </div>

      <Card>
        <h3 className="text-sm font-semibold tracking-tight text-body">Abstract</h3>
        <p className="mt-2 text-sm leading-relaxed text-body">{p.abstract}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-200/70 pt-3 text-xs text-muted dark:border-white/10">
          <span>DOI: <span className="font-mono text-body">{p.doi || "—"}</span></span>
          <span>Citations: <span className="font-medium text-body">{p.citation_count ?? 0}</span></span>
          <span>Source: <span className="font-medium text-body">{p.source_url || "—"}</span></span>
        </div>
      </Card>

      <Card className="mt-4">
        <h3 className="text-sm font-semibold tracking-tight text-body">Indexed chunks</h3>
        <p className="mt-1 text-xs text-muted">These are the passages the retrieval layer searches over.</p>
        <div className="mt-3 space-y-2">
          {(p.chunks || []).map((c: any, i: number) => (
            <div key={i} className="card-inset text-sm">
              <span className="badge badge-slate mr-2">{c.section}</span>
              <span className="text-body">{c.excerpt}…</span>
            </div>
          ))}
          {!(p.chunks || []).length && <p className="text-sm text-muted">No chunks indexed for this paper.</p>}
        </div>
      </Card>
    </div>
  );
}
