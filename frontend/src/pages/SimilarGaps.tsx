import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { Card, PageTitle, ScoreBar, Empty } from "../components/Layout";
import {
  Target, ArrowRight, CheckCircle, AlertTriangle, TrendingUp,
  ExternalLink, BookOpen, Layers, Info
} from "lucide-react";

/* ── confidence colours ── */
function ConfidencePill({ c }: { c: string }) {
  const map: Record<string, string> = {
    strong: "bg-rose-500/15 text-rose-600 border border-rose-200 dark:border-rose-500/30",
    moderate: "bg-amber-500/15 text-amber-600 border border-amber-200 dark:border-amber-500/30",
    emerging: "bg-indigo-500/10 text-indigo-600 border border-indigo-200 dark:border-indigo-500/30",
  };
  return <span className={`badge ${map[c] || map.emerging} text-xs uppercase tracking-wide font-semibold px-2.5 py-0.5`}>{c}</span>;
}

function MatchTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    "EXACT": "bg-rose-500/15 text-rose-600 border border-rose-200",
    "NEAR-EXACT": "bg-amber-500/15 text-amber-600 border border-amber-200",
    "SEMANTIC": "bg-indigo-500/10 text-indigo-600 border border-indigo-200",
    "CONCEPTUAL": "bg-slate-100 text-slate-600 border border-slate-200",
  };
  return <span className={`badge ${map[type] || map["CONCEPTUAL"]} text-xs`}>{type}</span>;
}

/* ── Tabs ── */
const TABS = ["Similar Papers", "Research Gaps", "Passage Matches"];

export function SimilarPapers() {
  const { id = "" } = useParams();
  const [sort, setSort] = useState("similarity");
  const [tab, setTab] = useState(0);
  const q = useQuery({ queryKey: ["report", id], queryFn: () => api.report(id) });

  if (q.isLoading) return <div className="space-y-3"><div className="skel h-12" /><div className="skel h-64" /></div>;
  if (q.isError) return <Empty text="Load the report first." />;
  const r: any = q.data;

  const papers = [...(r.similarPapers || [])].sort((a: any, b: any) =>
    sort === "year" ? (b.year || 0) - (a.year || 0)
    : sort === "citations" ? (b.citationCount || 0) - (a.citationCount || 0)
    : b.score - a.score
  );

  const gaps: any[] = r.gaps || [];
  const passages: any[] = r.passageMatches || [];

  return (
    <div>
      <PageTitle title="Full Analysis Report" sub={`${papers.length} similar papers · ${gaps.length} research gaps · ${passages.length} passage matches`} />

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-2xl border border-slate-200/70 bg-slate-50 p-1 transition-colors dark:border-white/10 dark:bg-white/5">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition-all duration-200 ${
              tab === i
                ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/70 dark:bg-white/10 dark:text-indigo-300 dark:ring-white/10"
                : "text-muted hover:bg-white/60 hover:text-slate-800 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
            }`}
          >
            {t}
            {i === 1 && gaps.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {gaps.length}
              </span>
            )}
            {i === 2 && passages.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white">
                {passages.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab 0: Similar Papers ── */}
      {tab === 0 && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Sort by:</span>
            {[["similarity", "Similarity"], ["year", "Year"], ["citations", "Citations"]].map(([v, l]) => (
              <button
                key={v}
                onClick={() => setSort(v)}
                className={`btn text-xs border ${sort === v ? "border-indigo-500 bg-indigo-500/10 text-indigo-600" : "border-slate-200 dark:border-white/15 text-muted"}`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {papers.map((p: any, i: number) => (
              <Card key={p.paperId}>
                <div className="flex flex-wrap items-start gap-3">
                  {/* Rank badge */}
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold
                    ${i === 0 ? "bg-indigo-600 text-white" : i === 1 ? "bg-indigo-400/20 text-indigo-600" : "bg-slate-100 dark:bg-white/10 text-slate-600"}`}>
                    #{i + 1}
                  </span>

                  {/* Paper info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/app/paper/${p.paperId}`} className="font-semibold hover:text-indigo-500 hover:underline">{p.title}</Link>
                      {p.isDemo && <span className="badge bg-amber-100 text-amber-700">DEMO (synthetic)</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {(p.authors || []).slice(0, 3).join(", ")}{p.authors?.length > 3 ? " et al." : ""}
                      {p.year ? ` · ${p.year}` : ""} {p.venue ? `· ${p.venue}` : ""}
                      {p.doi ? ` · DOI: ${p.doi}` : ""}
                    </p>

                    {/* Score bars */}
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="w-24 shrink-0 text-muted">Semantic</span>
                        <div className="flex-1"><ScoreBar v={p.score} /></div>
                        <span className={`w-10 text-right font-bold ${p.score >= 70 ? "text-rose-500" : p.score >= 40 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"}`}>{p.score}%</span>
                      </div>
                      {p.lexical && (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="w-24 shrink-0 text-muted">Lexical (C)</span>
                          <div className="flex-1"><ScoreBar v={Math.min(100, Math.round(p.lexical.score))} /></div>
                          <span className="w-10 text-right font-semibold text-muted">{Math.min(100, Math.round(p.lexical.score))}%</span>
                        </div>
                      )}
                    </div>

                    {/* Why similar */}
                    <p className="mt-2 text-sm text-muted italic">{p.whySimilar}</p>

                    {/* Section scores chips */}
                    {Object.keys(p.sectionScores || {}).length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted mb-1">Section overlaps:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(p.sectionScores || {}).map(([k, v]) => (
                            <span key={k} className={`badge text-xs ${
                              (v as number) >= 70 ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" :
                              (v as number) >= 40 ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" :
                              "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300"
                            }`}>
                              {k}: {v as number}%
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Matched concepts */}
                    {p.matchedConcepts?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="text-xs text-muted">Shared concepts:</span>
                        {p.matchedConcepts.map((c: string) => (
                          <span key={c} className="badge bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-xs">{c}</span>
                        ))}
                      </div>
                    )}

                    {/* Lexical details */}
                    {p.lexical && (
                      <p className="mt-2 text-xs text-muted bg-slate-50 dark:bg-white/5 rounded-lg px-2 py-1">
                        C engine — Jaccard: {p.lexical.jaccard?.toFixed(3)} · TF-IDF: {p.lexical.tfidf?.toFixed(3)} · KMP hits: {p.lexical.kmpHits}
                      </p>
                    )}

                    {/* Top passage matches for this paper */}
                    {(p.topMatches || []).length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-medium text-muted">Top passage matches:</p>
                        {p.topMatches.map((m: any, j: number) => (
                          <div key={j} className="rounded-xl border border-slate-200/70 dark:border-white/10 overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-white/5">
                              <MatchTypeBadge type={m.matchType} />
                              <span className="text-xs text-muted">{m.similarity}% · {m.section}</span>
                            </div>
                            <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-white/5">
                              <p className="p-2 text-xs text-slate-600 dark:text-slate-300">"{m.userPassage?.slice(0, 180)}…"</p>
                              <p className="p-2 text-xs text-muted">"{m.sourcePassage?.slice(0, 180)}…"</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-3">
                      <Link to={`/app/paper/${p.paperId}`} className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
                        <BookOpen size={12} /> Full paper details
                      </Link>
                      {p.sourceUrl && (
                        <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-indigo-500 flex items-center gap-1">
                          <ExternalLink size={12} /> Source
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {papers.length === 0 && <Empty text="No similar papers found in the current knowledge base." />}
          </div>
        </div>
      )}

      {/* ── Tab 1: Research Gaps ── */}
      {tab === 1 && (
        <div>
          <div className="mb-4 rounded-xl border border-amber-200/60 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 p-4">
            <div className="flex items-start gap-2">
              <Info size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">About Research Gaps</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  These gaps are identified by comparing your paper against the indexed knowledge base using keyword analysis, methodology detection, and dataset coverage checks.
                  Each gap includes a confidence level, detailed description, and a concrete future direction you can act on.
                </p>
              </div>
            </div>
          </div>

          {/* Gap summary stats */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {(["strong", "moderate", "emerging"] as const).map((level) => {
              const count = gaps.filter((g: any) => g.confidence === level).length;
              return (
                <div key={level} className={`rounded-xl p-3 text-center border ${
                  level === "strong" ? "border-rose-200 bg-rose-50/50 dark:bg-rose-500/5 dark:border-rose-500/20"
                  : level === "moderate" ? "border-amber-200 bg-amber-50/50 dark:bg-amber-500/5 dark:border-amber-500/20"
                  : "border-indigo-200 bg-indigo-50/50 dark:bg-indigo-500/5 dark:border-indigo-500/20"
                }`}>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className={`text-xs font-semibold uppercase mt-0.5 ${
                    level === "strong" ? "text-rose-600" : level === "moderate" ? "text-amber-600" : "text-indigo-600"
                  }`}>{level}</p>
                </div>
              );
            })}
          </div>

          {gaps.length === 0 ? (
            <Empty text="No research gaps detected. Your paper appears well-rounded against the indexed literature." />
          ) : (
            <div className="space-y-5">
              {gaps.map((g: any, i: number) => (
                <div key={i} className="rounded-2xl overflow-hidden border border-slate-200/70 dark:border-white/10 shadow-sm">
                  {/* Gap header */}
                  <div className={`px-5 py-4 border-b ${
                    g.confidence === "strong" ? "border-rose-200/60 bg-rose-50/80 dark:bg-rose-500/10 dark:border-rose-500/20"
                    : g.confidence === "moderate" ? "border-amber-200/60 bg-amber-50/80 dark:bg-amber-500/10 dark:border-amber-500/20"
                    : "border-indigo-200/60 bg-indigo-50/60 dark:bg-indigo-500/10 dark:border-indigo-500/20"
                  }`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold text-white ${
                        g.confidence === "strong" ? "bg-rose-500" : g.confidence === "moderate" ? "bg-amber-500" : "bg-indigo-500"
                      }`}>{i + 1}</span>
                      <h4 className="text-base font-semibold">{g.title}</h4>
                      <ConfidencePill c={g.confidence} />
                    </div>
                  </div>

                  {/* Gap body */}
                  <div className="p-5 space-y-4">
                    {/* Description */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Gap Description</p>
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{g.description}</p>
                    </div>

                    {/* Future direction — highlighted */}
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20 p-4">
                      <div className="flex items-start gap-2">
                        <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 mb-1">Suggested Future Direction</p>
                          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{g.futureDirection}</p>
                        </div>
                      </div>
                    </div>

                    {/* Supporting papers */}
                    {g.supportingPapers?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Evidence from Knowledge Base</p>
                        <div className="space-y-2">
                          {g.supportingPapers.map((sp: any) => (
                            <Link
                              key={sp.id}
                              to={`/app/paper/${sp.id}`}
                              className="flex items-center gap-2 rounded-xl border border-slate-200/70 dark:border-white/10 px-3 py-2 hover:border-indigo-400 transition-colors"
                            >
                              <BookOpen size={13} className="shrink-0 text-indigo-500" />
                              <span className="text-sm flex-1 truncate">{sp.title}</span>
                              <ArrowRight size={13} className="shrink-0 text-muted" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Overall recommendations */}
          {gaps.length > 0 && (
            <Card className="mt-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-indigo-500" />
                <p className="font-semibold text-sm">How to strengthen your paper</p>
              </div>
              <ul className="space-y-2">
                {(r.summary?.improvements || [
                  "Add public-benchmark evaluation with fixed train/test splits",
                  "Include ablation study comparing individual components",
                  "Add explicit Limitations section",
                  "Cite and compare the top similar papers from this knowledge base",
                ]).map((s: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-600">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* ── Tab 2: Passage Matches ── */}
      {tab === 2 && (
        <div>
          <div className="mb-4 rounded-xl border border-slate-200/70 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-3 flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
            <p className="text-xs text-muted leading-relaxed">
              These matches compare your text against the knowledge base at the sentence level.
              <b> EXACT/NEAR-EXACT</b> matches warrant review. <b>SEMANTIC/CONCEPTUAL</b> means similar ideas expressed differently — normal in academic writing.
            </p>
          </div>

          {/* Match type legend */}
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              ["EXACT", "bg-rose-500/15 text-rose-600 border-rose-200", "Identical or near-identical text"],
              ["NEAR-EXACT", "bg-amber-500/15 text-amber-600 border-amber-200", ">85% fuzzy match"],
              ["SEMANTIC", "bg-indigo-500/10 text-indigo-600 border-indigo-200", "Same meaning, different words"],
              ["CONCEPTUAL", "bg-slate-100 text-slate-600 border-slate-200", "Related concept area"],
            ].map(([label, cls, desc]) => (
              <div key={label} className="flex items-center gap-2">
                <span className={`badge border ${cls} text-xs`}>{label}</span>
                <span className="text-xs text-muted">{desc}</span>
              </div>
            ))}
          </div>

          {passages.length === 0 ? (
            <Empty text="No strong passage-level matches found." />
          ) : (
            <div className="space-y-3">
              {passages.slice(0, 15).map((m: any, i: number) => (
                <div key={i} className="rounded-2xl border border-slate-200/70 dark:border-white/10 overflow-hidden">
                  {/* Match header */}
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-slate-50 dark:bg-white/5 border-b border-slate-200/70 dark:border-white/10">
                    <span className="text-xs text-muted">#{i + 1}</span>
                    <MatchTypeBadge type={m.matchType} />
                    <span className="text-xs font-semibold">{m.similarity}% match</span>
                    <span className="text-xs text-muted">·</span>
                    <Link to={`/app/paper/${m.paperId}`} className="text-xs text-indigo-500 hover:underline">
                      {m.paperTitle}
                    </Link>
                    <span className="text-xs text-muted">[{m.section}]</span>
                  </div>
                  {/* Passage comparison */}
                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/70 dark:divide-white/10">
                    <div className="p-4">
                      <p className="text-xs font-semibold text-indigo-500 mb-2 flex items-center gap-1">
                        <Layers size={11} /> Your paper
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{m.userPassage}</p>
                    </div>
                    <div className="p-4">
                      <p className="text-xs font-semibold text-muted mb-2 flex items-center gap-1">
                        <BookOpen size={11} /> Source: {m.paperTitle}
                      </p>
                      <p className="text-sm text-muted dark:text-muted leading-relaxed">{m.sourcePassage}</p>
                    </div>
                  </div>
                </div>
              ))}
              {passages.length > 15 && (
                <p className="text-center text-xs text-muted">Showing 15 of {passages.length} matches</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
