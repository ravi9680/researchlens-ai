import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle, Empty, ScoreBar } from "../components/Layout";
import { GitCompare, Info, BookOpen, Users, Layers } from "lucide-react";

export function Compare() {
  const [params] = useSearchParams();
  const ids = useMemo(
    () => (params.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5),
    [params]
  );

  const q = useQuery<any>({
    queryKey: ["compare", ids],
    queryFn: () => api.compare(ids),
    enabled: ids.length >= 2,
  });

  if (!ids.length) {
    return (
      <div>
        <PageTitle title="Compare papers" sub="Side-by-side relatedness" />
        <Empty
          text="Pick two or more papers in the Explorer, then choose “Compare papers”."
          action={<Link to="/app/explorer" className="btn-primary">Open the explorer</Link>}
        />
      </div>
    );
  }

  if (ids.length === 1) {
    return (
      <div>
        <PageTitle title="Compare papers" sub="Select at least two papers" />
        <Empty
          text="You selected one paper. Add another from the Explorer to see a pairwise comparison."
          action={<Link to="/app/explorer" className="btn-primary">Pick another paper</Link>}
        />
      </div>
    );
  }

  if (q.isLoading) return <div className="skel h-80" />;
  if (q.isError) return <Empty text="Comparison failed." />;
  const d: any = q.data;

  const toneFor = (v: number) => (v >= 60 ? "badge-emerald" : v >= 35 ? "badge-amber" : "badge-rose");

  return (
    <div>
      <PageTitle
        title="Compare papers"
        sub={`${d.papers.length} papers · ${d.pairs.length} pairwise comparisons`}
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {d.papers.map((p: any) => (
          <Card key={p.id} className="card-hover flex flex-col">
            <Link to={`/app/paper/${p.id}`} className="font-semibold leading-snug text-body transition hover:text-indigo-700 dark:hover:text-indigo-300">
              {p.title}
            </Link>
            <p className="mt-1.5 text-xs text-muted">
              {(p.authors || []).join(", ") || "Unknown authors"}
            </p>
            <p className="mt-0.5 text-xs text-faint">{p.year ?? "—"} · {p.venue || "—"}</p>
            <p className="mt-2.5 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">{p.abstract}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.isDemo && <span className="badge badge-amber">DEMO</span>}
              {(p.topics || []).slice(0, 3).map((t: string) => (
                <span key={t} className="badge badge-slate">{t}</span>
              ))}
            </div>
            <p className="mt-2.5 flex items-center gap-1.5 text-xs text-faint">
              <BookOpen size={12} /> {p.citationCount} citations
            </p>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-body">
          <GitCompare size={15} className="text-indigo-600 dark:text-indigo-300" /> Pairwise relatedness
        </h3>
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
          <Info size={13} className="mt-0.5 shrink-0" />
          Semantic is cosine similarity over chunk embeddings; lexical is Jaccard over title and abstract.
          They are reported separately — these measure relatedness, not plagiarism.
        </p>

        <div className="mt-4 space-y-3">
          {d.pairs.map((p: any) => (
            <div key={`${p.a}-${p.b}`} className="rounded-xl border border-slate-200/80 p-4 transition hover:border-indigo-300 dark:border-white/10 dark:hover:border-indigo-400/40">
              <p className="text-sm font-semibold leading-snug text-body">
                {p.aTitle} <span className="font-normal text-faint">vs</span> {p.bTitle}
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {([["Semantic", p.semantic], ["Lexical", p.lexical], ["Combined", p.combined]] as [string, number][]).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted">{k}</span>
                      <span className={`badge ${toneFor(v)}`}>{v}</span>
                    </div>
                    <div className="mt-1.5"><ScoreBar v={v} /></div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.sharedTopics.map((t: string) => (
                  <span key={t} className="badge badge-emerald gap-1">
                    <Layers /> topic: {t}
                  </span>
                ))}
                {p.sharedAuthors.map((a: string) => (
                  <span key={a} className="badge badge-amber gap-1">
                    <Users size={11} /> author: {a}
                  </span>
                ))}
                {p.yearGap > 0 && <span className="badge badge-slate">{p.yearGap} yr apart</span>}
                {!p.sharedTopics.length && !p.sharedAuthors.length && (
                  <span className="badge badge-slate">no shared topics or authors</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {d.summary && (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-200/70 pt-4 text-sm dark:border-white/10">
            <p className="text-muted">
              Average combined <b className="stat-num text-body">{d.summary.averageCombined}</b>
            </p>
            <p className="text-muted">
              Shared topics <b className="stat-num text-body">{d.summary.sharedTopicCount}</b>
            </p>
            {d.summary.mostSimilar && (
              <p className="text-muted">
                Closest pair <b className="text-body">{d.summary.mostSimilar.combined}</b> —{" "}
                <span className="text-body">{d.summary.mostSimilar.aTitle}</span>
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
