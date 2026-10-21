import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useSaved } from "../lib/saved";
import { Card, Empty } from "../components/Layout";
import { Bookmark, Trash2, Inbox, GitCompare } from "lucide-react";

export function Saved() {
  const saved = useSaved();
  const qc = useQueryClient();
  const [error, setError] = useState<string>("");

  const remove = useMutation({
    mutationFn: (id: string) => api.savePaper(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-papers"] }),
    onError: (e: any) => setError(e.message),
  });

  const clearAll = () => {
    for (const id of saved.ids) remove.mutate(id);
  };

  if (saved.isLoading) {
    return <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skel h-36" />)}</div>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-body">Saved papers</h1>
          <p className="mt-1.5 text-sm text-muted">
            {saved.ids.length > 0
              ? `${saved.ids.length} bookmarked paper${saved.ids.length !== 1 ? "s" : ""} · stored on your account`
              : "Your saved research papers"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved.ids.length >= 2 && (
            <Link to={`/app/compare?ids=${saved.ids.join(",")}`} className="btn-secondary btn-sm">
              <GitCompare size={14} /> Compare
            </Link>
          )}
          {saved.ids.length > 0 && (
            <button onClick={clearAll} className="btn-danger btn-sm">
              <Trash2 size={14} /> Clear all
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}

      {saved.ids.length === 0 ? (
        <Empty
          text="No saved papers yet. Browse the Explorer and bookmark the papers you want to keep."
          action={
            <Link to="/app/explorer" className="btn-primary">
              <Inbox size={15} /> Browse the explorer
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {saved.papers.map((p: any) => (
            <Link key={p.id} to={`/app/paper/${p.id}`} className="card card-hover group p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-body transition group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                    {p.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {p.is_demo && <span className="badge badge-amber">DEMO</span>}
                    {p.year && <span className="badge badge-slate">{p.year}</span>}
                  </div>
                  <p className="mt-1.5 truncate text-xs text-muted">
                    {(p.authors || []).join(", ") || "Unknown authors"}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{p.abstract}</p>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); remove.mutate(p.id); }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-600 transition hover:bg-rose-500/15 hover:text-rose-500"
                  title="Remove bookmark"
                  aria-label="Remove bookmark"
                >
                  <Bookmark size={16} fill="currentColor" />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
