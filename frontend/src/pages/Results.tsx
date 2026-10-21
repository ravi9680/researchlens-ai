import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { Card, PageTitle, ScoreBar, Empty } from "../components/Layout";
import {
  Download, ChevronDown, ChevronUp, FileText, Zap, Brain,
  TrendingUp, AlertTriangle, CheckCircle, BookOpen, Target,
  BarChart2, ArrowRight, Layers, Info
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from "recharts";

/* ── helpers ─────────────────────────────────────────── */
function Level({ l }: { l: string }) {
  const c = l.includes("HIGH")
    ? "bg-rose-500/15 text-rose-600 border border-rose-200 dark:border-rose-500/30"
    : l.includes("MODERATE")
    ? "bg-amber-500/15 text-amber-600 border border-amber-200 dark:border-amber-500/30"
    : "bg-emerald-500/15 text-emerald-600 border border-emerald-200 dark:border-emerald-500/30";
  return <span className={`badge ${c} px-3 py-1 text-sm font-semibold`}>{l}</span>;
}

function SimilarityGauge({ value }: { value: number }) {
  const color = value >= 70 ? "#ef4444" : value >= 40 ? "#f59e0b" : "#10b981";
  const label = value >= 70 ? "High Relatedness" : value >= 40 ? "Moderate" : "Low";
  const description =
    value >= 70
      ? "Strong conceptual overlap with indexed literature."
      : value >= 40
      ? "Moderate overlap — shares topic area and methods."
      : "Low overlap — your paper covers novel ground.";
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-36 w-36 items-center justify-center">
        <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-200 dark:text-white/10" />
          <circle
            cx="60" cy="60" r="50" fill="none"
            stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 50 * value / 100} ${2 * Math.PI * 50 * (1 - value / 100)}`}
            className="transition-all duration-700"
          />
        </svg>
        <div className="text-center">
          <p className="text-3xl font-bold" style={{ color }}>{value}%</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-slate-500 max-w-[180px]">{description}</p>
      <p className="mt-1 text-center text-xs font-medium text-slate-400">Relatedness — <b className="text-slate-500">NOT</b> plagiarism</p>
    </div>
  );
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

function Collapsible({ title, icon: Icon, children, defaultOpen = false }: any) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="mt-4">
      <button className="flex w-full items-center justify-between" onClick={() => setOpen(!open)}>
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-indigo-500" />
          <h3 className="font-semibold text-base">{title}</h3>
        </div>
        {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </Card>
  );
}

/* ── main component ───────────────────────────────────── */
export function Results() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["report", id], queryFn: () => api.report(id) });
  if (q.isLoading) return (
    <div className="space-y-4">
      {[140, 200, 160, 180].map((h, i) => <div key={i} className={`skel h-${h === 140 ? "36" : h === 200 ? "48" : h === 160 ? "40" : "44"}`} />)}
    </div>
  );
  if (q.isError) return <Empty text={`Report unavailable: ${(q.error as Error).message}`} />;
  const r: any = q.data;

  // Radar data for section similarity
  const radarData = Object.entries(r.sectionScores || {}).map(([key, val]) => ({
    section: key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    value: val as number,
  }));

  // Bar chart data for similar papers
  const paperBarData = (r.similarPapers || []).slice(0, 6).map((p: any) => ({
    name: p.title?.slice(0, 22) + "…",
    score: p.score,
    lexical: p.lexical?.score ? Math.round(p.lexical.score) : null,
  }));

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{r.title || "Research Analysis"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {r.filename} · {(r.userChunkCount || 0)} chunks analysed · {r.topics?.[0]?.topic}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => window.print()}
        >
          <Download size={15} /> Export PDF
        </button>
      </div>

      {/* ── Top stats row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col items-center py-5">
          <SimilarityGauge value={r.overallSimilarity} />
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">AI-Writing Signal</p>
          <div className="mt-3">
            <Level l={r.ai?.level || "LOW"} />
            <p className="mt-3 text-4xl font-bold">{r.ai?.score}<span className="text-lg text-slate-400">/100</span></p>
          </div>
          <p className="mt-3 text-xs text-slate-500 leading-relaxed">{r.ai?.disclaimer}</p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Primary Topic</p>
          <p className="mt-3 text-lg font-semibold leading-snug">{r.topics?.[0]?.topic || "General ML"}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(r.keywords || []).slice(0, 8).map((k: string) => (
              <span key={k} className="badge bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{k}</span>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Document Sections</p>
          <div className="mt-3 space-y-1.5">
            {(r.sections || []).slice(0, 6).map((s: any) => (
              <div key={s.name} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{s.name}</span>
                <span className="text-xs text-slate-400">{(s.chars / 1000).toFixed(1)}k chars</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── About this paper ── */}
      <Card className="mt-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={18} className="text-indigo-500" />
          <h3 className="font-semibold text-base">Research Intelligence Summary</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">About</p>
            <p className="text-sm leading-relaxed">{r.summary?.about}</p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Comparison</p>
            <p className="text-sm leading-relaxed">{r.summary?.comparison}</p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Suggested Improvements</p>
            <ul className="space-y-1.5">
              {(r.summary?.improvements || []).map((s: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* ── Similarity deep-dive ── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Similar papers with rich bars */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={18} className="text-indigo-500" />
              <h3 className="font-semibold">Top Similar Papers</h3>
            </div>
            <Link to={`/app/similar/${id}`} className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
              Full ranking <ArrowRight size={12} />
            </Link>
          </div>
          <div className="space-y-3">
            {(r.similarPapers || []).slice(0, 5).map((p: any, i: number) => (
              <div key={p.paperId} className="rounded-xl border border-slate-200/70 dark:border-white/10 p-3">
                <div className="flex items-start gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold
                    ${i === 0 ? "bg-indigo-600 text-white" : "bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/app/paper/${p.paperId}`} className="text-sm font-medium hover:text-indigo-500 hover:underline line-clamp-1">
                      {p.title}
                    </Link>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {(p.authors || []).slice(0, 2).join(", ")}{p.authors?.length > 2 ? " et al." : ""} · {p.year} · {p.venue}
                      {p.isDemo && <span className="ml-1 badge bg-amber-100 text-amber-700">DEMO</span>}
                    </p>
                  </div>
                  <span className={`shrink-0 text-lg font-bold ${p.score >= 70 ? "text-rose-500" : p.score >= 40 ? "text-amber-500" : "text-emerald-500"}`}>
                    {p.score}%
                  </span>
                </div>
                {/* Semantic bar */}
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="w-16 shrink-0">Semantic</span>
                    <div className="flex-1"><ScoreBar v={p.score} /></div>
                  </div>
                  {p.lexical && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="w-16 shrink-0">Lexical (C)</span>
                      <div className="flex-1"><ScoreBar v={Math.min(100, Math.round(p.lexical.score))} /></div>
                      <span className="text-xs text-slate-400">{Math.min(100, Math.round(p.lexical.score))}%</span>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500 italic">{p.whySimilar}</p>
                {p.matchedConcepts?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.matchedConcepts.map((c: string) => (
                      <span key={c} className="badge bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-xs">{c}</span>
                    ))}
                  </div>
                )}
                {p.lexical && (
                  <p className="mt-1 text-xs text-slate-400">
                    Jaccard: {p.lexical.jaccard?.toFixed(2)} · KMP hits: {p.lexical.kmpHits}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Section similarity radar */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Layers size={18} className="text-indigo-500" />
            <h3 className="font-semibold">Section-Level Similarity</h3>
          </div>
          {radarData.length > 2 ? (
            <>
              <div className="h-52">
                <ResponsiveContainer>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(100,100,100,0.15)" />
                    <PolarAngleAxis dataKey="section" tick={{ fontSize: 11 }} />
                    <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {radarData.map((d) => (
                  <div key={d.section} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-1.5 text-sm">
                    <span className="text-slate-600 dark:text-slate-300 text-xs truncate">{d.section}</span>
                    <span className={`font-semibold text-xs ml-2 ${d.value >= 70 ? "text-rose-500" : d.value >= 40 ? "text-amber-500" : "text-emerald-500"}`}>{d.value}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {radarData.map((d) => (
                <div key={d.section} className="rounded-xl border border-slate-200 dark:border-white/10 p-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{d.section}</span>
                    <span className="font-bold">{d.value}%</span>
                  </div>
                  <ScoreBar v={d.value} />
                </div>
              ))}
              {radarData.length === 0 && <p className="text-sm text-slate-500">No section-level scores available.</p>}
            </div>
          )}
        </Card>
      </div>

      {/* ── Similarity bar chart ── */}
      {paperBarData.length > 0 && (
        <Card className="mt-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-indigo-500" />
            <h3 className="font-semibold">Similarity Score Comparison</h3>
            <span className="text-xs text-slate-400">(semantic % per paper)</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={paperBarData} layout="vertical" margin={{ left: 8, right: 24 }}>
                <XAxis type="number" domain={[0, 100]} fontSize={11} />
                <YAxis type="category" dataKey="name" width={130} fontSize={10} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                  {paperBarData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.score >= 70 ? "#ef4444" : entry.score >= 40 ? "#f59e0b" : "#10b981"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-400 flex items-center gap-1">
            <Info size={12} /> Colour: <span className="text-emerald-500">green = low</span>, <span className="text-amber-500">amber = moderate</span>, <span className="text-rose-500">red = high</span> relatedness
          </p>
        </Card>
      )}

      {/* ── Passage matches ── */}
      <Collapsible title="Similar Passages" icon={BookOpen} defaultOpen>
        <p className="mb-3 text-xs text-slate-400 flex items-center gap-1">
          <AlertTriangle size={12} className="text-amber-400" />
          Semantic matches are NOT proof of copying. Only EXACT/NEAR-EXACT warrant closer inspection.
        </p>
        {(r.passageMatches || []).length === 0 ? (
          <p className="text-sm text-slate-500">No strong passage-level matches found.</p>
        ) : (
          <div className="space-y-3">
            {(r.passageMatches || []).slice(0, 8).map((m: any, i: number) => (
              <div key={i} className="rounded-xl border border-slate-200/70 dark:border-white/10 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-white/5">
                  <MatchTypeBadge type={m.matchType} />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{m.similarity}% match</span>
                  <span className="text-xs text-slate-400">· {m.paperTitle} [{m.section}]</span>
                </div>
                <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/70 dark:divide-white/10">
                  <div className="p-3">
                    <p className="text-xs font-semibold text-indigo-500 mb-1">Your paper</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{m.userPassage}</p>
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-semibold text-slate-400 mb-1">Source: {m.paperTitle}</p>
                    <p className="text-sm text-slate-500 leading-relaxed">{m.sourcePassage}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Collapsible>

      {/* ── Research Gaps ── */}
      <Collapsible title={`Research Gaps (${(r.gaps || []).length} identified)`} icon={Target} defaultOpen>
        <div className="space-y-4">
          {(r.gaps || []).length === 0 ? (
            <p className="text-sm text-slate-500">No specific gaps detected. Your paper appears well-positioned.</p>
          ) : (
            (r.gaps || []).map((g: any, i: number) => (
              <div key={i} className={`rounded-xl border-l-4 p-4 ${
                g.confidence === "strong" ? "border-rose-500 bg-rose-50/50 dark:bg-rose-500/5"
                : g.confidence === "moderate" ? "border-amber-500 bg-amber-50/50 dark:bg-amber-500/5"
                : "border-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/5"
              }`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    g.confidence === "strong" ? "text-rose-600" : g.confidence === "moderate" ? "text-amber-600" : "text-indigo-600"
                  }`}>
                    {g.confidence}
                  </span>
                  <h4 className="font-semibold text-sm">{g.title}</h4>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{g.description}</p>

                <div className="mt-3 rounded-lg bg-white/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 p-3">
                  <p className="text-xs font-semibold text-emerald-600 mb-1 flex items-center gap-1">
                    <ArrowRight size={12} /> Suggested Future Direction
                  </p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{g.futureDirection}</p>
                </div>

                {g.supportingPapers?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-400 mb-1">Supporting papers from knowledge base:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.supportingPapers.map((sp: any) => (
                        <Link
                          key={sp.id}
                          to={`/app/paper/${sp.id}`}
                          className="text-xs text-indigo-500 hover:underline badge bg-indigo-500/10"
                        >
                          {sp.title?.slice(0, 50)}{sp.title?.length > 50 ? "…" : ""}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Collapsible>

      {/* ── AI Signal reasoning ── */}
      <Collapsible title="AI-Writing Signal — Why this result?" icon={Brain}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium mb-2">Signal indicators:</p>
            <ul className="space-y-2">
              {(r.ai?.reasons || []).map((x: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm rounded-lg bg-slate-50 dark:bg-white/5 p-2">
                  <Zap size={14} className="mt-0.5 shrink-0 text-amber-500" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-amber-50/50 dark:bg-amber-500/5 border border-amber-200/60 dark:border-amber-500/20 p-4">
            <p className="text-xs font-semibold text-amber-600 mb-2">⚠ Disclaimer</p>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{r.ai?.disclaimer}</p>
            <p className="mt-3 text-xs text-slate-500">
              AI-writing signals use statistical heuristics (burstiness, type-token ratio, trigram repetition). False positives/negatives are possible. This is never proof.
            </p>
          </div>
        </div>
      </Collapsible>

      {/* ── C Engine ── */}
      <Collapsible title="Algorithm Engine Details" icon={Zap}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400 mb-2">Engine Used</p>
            <p className="text-sm font-medium">{r.cEngine?.used ? "✅ Native C Engine" : "⚙️ JavaScript Fallback"}</p>
            {r.cEngine?.reason && <p className="text-xs text-slate-500 mt-1">{r.cEngine.reason}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(r.cEngine?.algorithms || []).map((a: string) => (
                <span key={a} className="badge bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-xs">{a}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400 mb-2">C Engine Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {(r.cEngine?.keywords || []).map((k: string) => (
                <span key={k} className="badge bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-xs">{k}</span>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-400">
          Lexical (C) and semantic (embeddings) scores are computed independently and reported separately — never conflated.
          See <Link className="underline text-indigo-500" to="/app/algorithms">Algorithm Explorer</Link> for full details.
        </p>
      </Collapsible>

      {/* ── Recommended reading ── */}
      <Collapsible title="Recommended Reading" icon={BookOpen}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(r.summary?.reading || []).map((p: any) => (
            <Link key={p.id} to={`/app/paper/${p.id}`}
              className="rounded-xl border border-slate-200/70 dark:border-white/10 p-3 hover:border-indigo-400 transition-colors">
              <p className="text-sm font-medium line-clamp-2">{p.title}</p>
              <p className="mt-1 text-xs text-indigo-500 flex items-center gap-1">View paper <ArrowRight size={10} /></p>
            </Link>
          ))}
          {!(r.summary?.reading || []).length && <p className="text-sm text-slate-500">No recommendations available.</p>}
        </div>
      </Collapsible>
    </div>
  );
}
