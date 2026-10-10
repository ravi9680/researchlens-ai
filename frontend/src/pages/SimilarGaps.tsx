import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { Card, PageTitle, ScoreBar, Empty } from "../components/Layout";

export function SimilarPapers() {
  const { id = "" } = useParams();
  const [sort, setSort] = useState("similarity");
  const q = useQuery({ queryKey: ["report", id], queryFn: () => api.report(id) });
  if (q.isLoading) return <div className="skel h-64" />;
  if (q.isError) return <Empty text="Load the report first." />;
  const r: any = q.data;
  const papers = [...(r.similarPapers || [])].sort((a: any, b: any) =>
    sort === "year" ? (b.year || 0) - (a.year || 0) : sort === "citations" ? (b.citationCount || 0) - (a.citationCount || 0) : b.score - a.score);
  return (
    <div>
      <PageTitle title="Similar papers" sub={`${papers.length} ranked candidates`} />
      <div className="mb-3 flex gap-2 text-sm">
        {[["similarity", "Similarity"], ["year", "Year"], ["citations", "Citations"]].map(([v, l]) => (
          <button key={v} onClick={() => setSort(v)} className={`btn border ${sort === v ? "border-indigo-500 text-indigo-600" : "border-slate-300 dark:border-white/15"}`}>{l}</button>
        ))}
      </div>
      <div className="space-y-3">
        {papers.map((p: any, i: number) => (
          <Card key={p.paperId}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600/10 font-semibold text-indigo-600">#{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Link to={`/app/paper/${p.paperId}`} className="font-medium hover:underline">{p.title}</Link>
                <p className="text-xs text-slate-500">{(p.authors || []).join(", ")} · {p.year} · {p.venue} {p.doi ? `· DOI ${p.doi}` : ""} {p.isDemo && "· DEMO (synthetic)"}</p>
              </div>
              <span className="text-xl font-bold">{p.score}%</span>
            </div>
            <div className="mt-2"><ScoreBar v={p.score} /></div>
            <div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(p.sectionScores || {}).map(([k, v]) => <span key={k} className="badge bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">{k}: {v as number}%</span>)}</div>
            <p className="mt-2 text-sm text-slate-500">{p.whySimilar}</p>
            {(p.topMatches || []).map((m: any, j: number) => (<p key={j} className="mt-1 rounded-lg bg-slate-50 p-2 text-xs dark:bg-white/5"><b>{m.matchType} {m.similarity}%:</b> “{m.sourcePassage?.slice(0, 160)}…”</p>))}
            {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-indigo-500 underline">Source link</a>}
          </Card>
        ))}
      </div>
    </div>
  );
}

export function Gaps() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["report", id], queryFn: () => api.report(id) });
  if (q.isLoading) return <div className="skel h-64" />;
  if (q.isError) return <Empty text="Load the report first." />;
  const r: any = q.data;
  return (
    <div>
      <PageTitle title="Research gaps" sub=" grounded in retrieved literature — every gap lists supporting papers" />
      <div className="space-y-3">
        {(r.gaps || []).map((g: any, i: number) => (
          <Card key={i}>
            <div className="flex items-center gap-2"><h3 className="font-medium">{g.title}</h3><span className="badge bg-indigo-500/10 text-indigo-600">{g.confidence}</span></div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{g.description}</p>
            <p className="mt-2 text-sm"><b>Future direction:</b> {g.futureDirection}</p>
            <p className="mt-2 text-xs text-slate-500">Supporting: {(g.supportingPapers || []).map((p: any) => p.title).join(" · ") || "—"}</p>
          </Card>
        ))}
        {!(r.gaps || []).length && <Empty text="No gaps detected." />}
      </div>
    </div>
  );
}
