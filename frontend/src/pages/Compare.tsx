import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle, Empty, ScoreBar } from "../components/Layout";
import { GitCompare } from "lucide-react";

export function Compare() {
  const [params] = useSearchParams();
  const ids = useMemo(
    () => (params.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5),
    [params]
  );
  const [selected, setSelected] = useState<string[]>(ids);

  const q = useQuery({
    queryKey: ["compare", selected],
    queryFn: () => api.compare(selected),
    enabled: selected.length >= 2,
  });

  if (!ids.length) {
    return (
      <div>
        <PageTitle title="Compare papers" sub="Side-by-side relatedness" />
        <Empty text="Pick two or more papers in the Explorer, then choose “Compare papers”." />
      </div>
    );
  }

  const d: any = q.data;

  return (
    <div>
      <PageTitle title="Compare papers" sub={`${selected.length} papers selected`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {ids.map((id) => (
          <span key={id} className="badge bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
            {id.slice(0, 8)}…
          </span>
        ))}
      </div>

      {q.isLoading && <div className="skel h-64" />}
      {q.isError && <Empty text="Comparison failed." />}
      {d && (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {d.papers.map((p: any) => (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/app/paper/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                  {p.isDemo && <span className="badge bg-amber-100 text-amber-700">DEMO</span>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{(p.authors || []).join(", ")} · {p.year} · {p.venue}</p>
                <p className="mt-2 line-clamp-3 text-sm text-slate-500">{p.abstract}</p>
                {(p.topics || []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.topics.map((t: string) => (<span key={t} className="badge bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">{t}</span>))}
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-400">{p.citationCount} citations</p>
              </Card>
            ))}
          </div>

          <Card className="mt-4">
            <h3 className="flex items-center gap-2 text-sm font-medium"><GitCompare size={15} /> Pairwise relatedness</h3>
            <p className="mt-1 text-xs text-slate-500">
              Semantic = cosine over chunk embeddings. Lexical = Jaccard over title + abstract. Reported separately — these are relatedness scores, not plagiarism findings.
            </p>
            <div className="mt-3 space-y-4">
              {d.pairs.map((p: any) => (
                <div key={`${p.a}-${p.b}`} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                  <p className="text-sm font-medium">{p.aTitle} <span className="text-slate-400">vs</span> {p.bTitle}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-slate-500">Semantic {p.semantic}</p>
                      <ScoreBar v={p.semantic} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Lexical {p.lexical}</p>
                      <ScoreBar v={p.lexical} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Combined {p.combined}</p>
                      <ScoreBar v={p.combined} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.sharedTopics.map((t: string) => (<span key={t} className="badge bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">topic: {t}</span>))}
                    {p.sharedAuthors.map((a: string) => (<span key={a} className="badge bg-amber-500/10 text-amber-600 dark:text-amber-300">author: {a}</span>))}
                    {p.yearGap > 0 && <span className="badge bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400">{p.yearGap} yr apart</span>}
                  </div>
                </div>
              ))}
            </div>
            {d.summary && (
              <p className="mt-4 text-xs text-slate-500">
                Average combined relatedness <b>{d.summary.averageCombined}</b> · {d.summary.sharedTopicCount} shared topic{d.summary.sharedTopicCount === 1 ? "" : "s"}.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
