import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";
import { BookOpen, Loader2, AlertCircle, Info, Layers, TriangleAlert, ArrowRight } from "lucide-react";

export function Review() {
  const [topic, setTopic] = useState("");
  const [submitted, setSubmitted] = useState("");

  const m = useMutation<any, Error, string>({
    mutationFn: (t: string) => api.litReview(t),
    onSuccess: (_d, t) => setSubmitted(t),
  });

  const d: any = m.data;

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle
        title="Literature review"
        sub="A theme-wise outline built only from papers actually retrieved for your topic"
      />

      <Card>
        <form
          onSubmit={(e) => { e.preventDefault(); if (topic.trim().length > 2) m.mutate(topic.trim()); }}
          className="flex flex-wrap gap-2"
        >
          <input
            className="input min-w-[220px] flex-1"
            placeholder="Research topic, e.g. retrieval augmented generation"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            aria-label="Research topic"
          />
          <button type="submit" className="btn-primary" disabled={topic.trim().length < 3 || m.isPending}>
            {m.isPending ? (
              <><Loader2 size={15} className="animate-spin" /> Building…</>
            ) : (
              <><BookOpen size={15} /> Generate</>
            )}
          </button>
        </form>

        {m.isError && (
          <p className="field-ok mt-3 flex items-center gap-2 !border-rose-200 !bg-rose-50 !text-rose-700 dark:!border-rose-500/30 dark:!bg-rose-500/10 dark:!text-rose-300">
            <AlertCircle size={15} className="shrink-0" /> {(m.error as any)?.message || "Could not build a review."}
          </p>
        )}

        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
          <Info size={13} className="mt-0.5 shrink-0" />
          Themes are extracted from retrieved papers only — no citation is invented. Papers are ranked by
          semantic similarity to your topic.
        </p>
      </Card>

      {m.isPending && <div className="mt-4 skel h-64" />}

      {d && (
        <div className="mt-4 space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-body">Review outline</h3>
              <p className="mt-1 text-xs text-muted">{d.note}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="badge badge-indigo">{d.paperCount} papers</span>
              <span className="badge badge-slate">{d.retrieval}</span>
            </div>
          </Card>

          <Card>
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-body">
              <Layers size={15} className="text-indigo-600 dark:text-indigo-300" /> Themes
            </h3>
            <div className="mt-3 space-y-2.5">
              {(d.themes || []).map((t: any, i: number) => (
                <div key={t.theme} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                  <p className="font-semibold capitalize tracking-tight text-body">
                    <span className="mr-2 text-xs font-bold text-faint">{String(i + 1).padStart(2, "0")}</span>
                    {t.theme}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {(t.papers || []).map((p: any) => (
                      <li key={p.id} className="flex items-start gap-1.5 text-sm">
                        <ArrowRight size={13} className="mt-1 shrink-0 text-faint" />
                        <span className="text-muted">
                          <Link to={`/app/paper/${p.id}`} className="link">{p.title}</Link>
                          {p.year ? <span className="ml-1.5 text-xs text-faint">({p.year})</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {!(d.themes || []).length && (
                <p className="text-sm text-muted">No themes could be extracted from the retrieved papers.</p>
              )}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {([
              ["Methods", d.methods, "from-indigo-600 to-violet-600", "Methods commonly used in this literature."],
              ["Limitations", d.limitations, "from-amber-500 to-orange-600", "Recurring weaknesses across the indexed work."],
              ["Future directions", d.futureDirections, "from-emerald-500 to-teal-600", "Open problems this literature points toward."],
            ] as [string, string[], string, string][]).map(([title, items, tint, desc]) => (
              <Card key={title}>
                <div className="flex items-start gap-2.5">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${tint} text-white`}>
                    <Layers size={15} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-body">{title}</h3>
                    <p className="mt-0.5 text-xs text-muted">{desc}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {(items || []).map((it, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-body">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                      {it}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-body">
              Papers in this review <span className="font-normal text-muted">({(d.papers || []).length})</span>
            </h3>
            <div className="mt-3 space-y-1.5">
              {(d.papers || []).map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 transition hover:bg-slate-100/70 dark:hover:bg-white/[0.04]"
                >
                  <Link to={`/app/paper/${p.id}`} className="min-w-0 flex-1 truncate text-sm text-body transition hover:text-indigo-700 dark:hover:text-indigo-300">
                    {p.title}
                  </Link>
                  <span className="shrink-0 text-xs text-faint">{p.year ?? "—"}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="note flex items-start gap-2.5">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <p>
              This outline is a <b className="font-semibold">starting point, not a finished review</b>. Every theme
              links only to retrieved papers — read them, then cite them properly in your own work.
            </p>
          </div>
        </div>
      )}

      {!d && !m.isPending && (
        <div className="mt-4">
          <Empty text="Enter a topic to generate a literature review from the indexed knowledge base." />
        </div>
      )}
    </div>
  );
}
