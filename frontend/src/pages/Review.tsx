import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";
import { BookOpen, Loader2 } from "lucide-react";

export function Review() {
  const [topic, setTopic] = useState("");
  const [submitted, setSubmitted] = useState("");

  const m = useMutation({
    mutationFn: (t: string) => api.litReview(t),
    onSuccess: (_d, t) => setSubmitted(t),
  });

  const d: any = m.data;

  return (
    <div>
      <PageTitle title="Literature review" sub="Theme-wise outline grounded in indexed papers only" />

      <Card>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1 min-w-[220px]"
            placeholder="Research topic, e.g. retrieval augmented generation"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && topic.trim().length > 2) m.mutate(topic.trim()); }}
          />
          <button
            className="btn-primary"
            disabled={topic.trim().length < 3 || m.isPending}
            onClick={() => m.mutate(topic.trim())}
          >
            {m.isPending ? <><Loader2 size={15} className="animate-spin" /> Building…</> : <><BookOpen size={15} /> Generate</>}
          </button>
        </div>
        {m.isError && <p className="mt-2 text-sm text-rose-500">{(m.error as any)?.message || "Could not build a review."}</p>}
        <p className="mt-2 text-xs text-slate-500">
          Themes are extracted from retrieved papers only — no citation is invented. Papers are ranked by semantic similarity to your topic.
        </p>
      </Card>

      {m.isPending && <div className="mt-4 skel h-64" />}

      {d && (
        <div className="mt-4 space-y-4">
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Review outline</h3>
              <span className="badge bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">{d.paperCount} papers · {d.retrieval}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{d.note}</p>
          </Card>

          <Card>
            <h3 className="text-sm font-medium">Themes</h3>
            <div className="mt-3 space-y-3">
              {(d.themes || []).map((t: any) => (
                <div key={t.theme} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                  <p className="font-medium capitalize">{t.theme}</p>
                  <ul className="mt-1.5 space-y-1">
                    {(t.papers || []).map((p: any) => (
                      <li key={p.id} className="text-sm text-slate-600 dark:text-slate-300">
                        <Link to={`/app/paper/${p.id}`} className="hover:underline">{p.title}</Link>
                        {p.year ? <span className="ml-1 text-xs text-slate-400">({p.year})</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {!(d.themes || []).length && <p className="text-sm text-slate-500">No themes could be extracted from the retrieved papers.</p>}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <h3 className="text-sm font-medium">Methods</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {(d.methods || []).map((m2: string, i: number) => (<li key={i}>• {m2}</li>))}
              </ul>
            </Card>
            <Card>
              <h3 className="text-sm font-medium">Limitations</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {(d.limitations || []).map((l: string, i: number) => (<li key={i}>• {l}</li>))}
              </ul>
            </Card>
            <Card>
              <h3 className="text-sm font-medium">Future directions</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                {(d.futureDirections || []).map((f: string, i: number) => (<li key={i}>• {f}</li>))}
              </ul>
            </Card>
          </div>

          <Card>
            <h3 className="text-sm font-medium">Papers in this review</h3>
            <div className="mt-2 space-y-1.5">
              {(d.papers || []).map((p: any) => (
                <div key={p.id} className="flex items-start justify-between gap-2 text-sm">
                  <Link to={`/app/paper/${p.id}`} className="hover:underline">{p.title}</Link>
                  <span className="shrink-0 text-xs text-slate-400">{p.year ?? "—"}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {!d && !m.isPending && (
        <div className="mt-4">
          <Empty text="Enter a topic to generate a literature review." />
        </div>
      )}
    </div>
  );
}
