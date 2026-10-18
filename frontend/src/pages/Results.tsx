import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, PageTitle, ScoreBar, Empty } from "../components/Layout";

function Level({ l }: { l: string }) {
  const c = l.includes("HIGH") ? "bg-rose-500/15 text-rose-600" : l.includes("MODERATE") ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600";
  return <span className={`badge ${c}`}>{l}</span>;
}

export function Results() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["report", id], queryFn: () => api.report(id) });
  if (q.isLoading) return <div className="space-y-3"><div className="skel h-40" /><div className="skel h-40" /></div>;
  if (q.isError) return <Empty text={`Report unavailable: ${(q.error as Error).message}`} />;
  const r: any = q.data;
  return (
    <div>
      <PageTitle title="Research analysis" sub={r.title} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <p className="text-xs text-slate-500">OVERALL SEMANTIC SIMILARITY</p>
          <p className="text-5xl font-bold">{r.overallSimilarity}<span className="text-xl">%</span></p>
          <div className="mt-2"><ScoreBar v={r.overallSimilarity} /></div>
          <p className="mt-2 text-xs text-slate-500">Relatedness to indexed literature — <b>not</b> plagiarism.</p>
        </Card>
        <Card className="lg:col-span-1">
          <p className="text-xs text-slate-500">AI-WRITING SIGNAL</p>
          <p className="mt-2"><Level l={r.ai.level} /></p>
          <p className="mt-2 text-2xl font-semibold">{r.ai.score}/100</p>
          <p className="mt-2 text-xs text-slate-500">{r.ai.disclaimer}</p>
        </Card>
        <Card className="lg:col-span-1">
          <p className="text-xs text-slate-500">TOPIC & KEYWORDS</p>
          <p className="mt-1 font-medium">{(r.topics || [])[0]?.topic}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{(r.keywords || []).slice(0, 10).map((k: string) => <span key={k} className="badge bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{k}</span>)}</div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-medium">Top similar papers</h3>
          <div className="mt-3 space-y-2">
            {(r.similarPapers || []).slice(0, 5).map((p: any, i: number) => (
              <div key={p.paperId} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <p className="text-sm font-medium">#{i + 1} {p.title} {p.isDemo && <span className="badge bg-amber-100 text-amber-700">DEMO</span>}</p>
                <p className="text-xs text-slate-500">{(p.authors || []).join(", ")} · {p.year} · {p.venue}</p>
                <div className="mt-2 flex items-center gap-2 text-sm"><ScoreBar v={p.score} /><span className="w-10 text-right font-semibold">{p.score}%</span></div>
                <p className="mt-1 text-xs text-slate-500">{p.whySimilar}</p>
                {(p as any).lexical && <p className="mt-1 text-xs text-slate-400">C lexical: {Math.round((p as any).lexical.score)} · Jaccard {(p as any).lexical.jaccard.toFixed(2)} · KMP hits {(p as any).lexical.kmpHits}</p>}
              </div>
            ))}
          </div>
          <Link to={`/app/similar/${id}`} className="btn mt-3 border border-slate-300 dark:border-white/15">Full ranking →</Link>
        </Card>
        <Card>
          <h3 className="font-medium">Research intelligence summary</h3>
          <p className="mt-2 text-sm"><b>About:</b> {r.summary?.about}</p>
          <p className="mt-1 text-sm"><b>Comparison:</b> {r.summary?.comparison}</p>
          <p className="mt-1 text-sm"><b>Suggested improvements:</b></p>
          <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">{(r.summary?.improvements || []).map((s: string) => <li key={s}>{s}</li>)}</ul>
          <p className="mt-2 text-sm"><b>Recommended reading:</b></p>
          <ul className="list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">{(r.summary?.reading || []).map((p: any) => <li key={p.id}>{p.title}</li>)}</ul>
        </Card>
      </div>

      <Card className="mt-4">
        <h3 className="font-medium">Similar passages <span className="text-xs font-normal text-slate-500">(semantic matches are not proof of copying)</span></h3>
        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          {(r.passageMatches || []).slice(0, 6).map((m: any, i: number) => (
            <div key={i} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5">
              <span className={`badge ${m.matchType === "EXACT" ? "bg-rose-500/15 text-rose-600" : m.matchType === "NEAR-EXACT" ? "bg-amber-500/15 text-amber-600" : "bg-indigo-500/10 text-indigo-600"}`}>{m.matchType} · {m.similarity}%</span>
              <p className="mt-2"><b>Yours:</b> {m.userPassage}</p>
              <p className="mt-1 text-slate-500"><b>Source ({m.paperTitle}):</b> {m.sourcePassage}</p>
            </div>
          ))}
          {!(r.passageMatches || []).length && <p className="text-sm text-slate-500">No strong passage-level matches.</p>}
        </div>
      </Card>

      <Card className="mt-4">
        <h3 className="font-medium">Section similarity</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(r.sectionScores || {}).map(([k, v]) => (<div key={k} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10"><p className="font-medium">{k}</p><div className="mt-2"><ScoreBar v={v as number} /></div><p className="mt-1 text-xs text-slate-500">{v as number}%</p></div>))}
        </div>
      </Card>

      <Card className="mt-4">
        <h3 className="font-medium">Why this AI-signal result?</h3>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 dark:text-slate-300">{(r.ai.reasons || []).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
        <p className="mt-2 text-xs text-slate-500">Engine: C lexical (TF-IDF, Jaccard, KMP/Rabin-Karp, edit distance, heap top-K) + embedding semantic search. See <Link className="underline" to="/app/algorithms">Algorithm Explorer</Link>.</p>
      </Card>
    </div>
  );
}
