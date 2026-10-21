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

  /* Remove bookmarks one after another. Firing every mutation at once
   * would issue N parallel writes and invalidate the query N times; the
   * sequential version is both gentler on the server and leaves the list
   * in a consistent state. */
  const [clearing, setClearing] = useState(false);
  const clearAll = async () => {
    setClearing(true);
    setError("");
    try {
      for (const id of saved.ids) {
        await api.savePaper(id).catch((e: any) => setError(e.message));
      }
      qc.invalidateQueries({ queryKey: ["saved-papers"] });
    } finally {
      setClearing(false);
    }
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
            <button onClick={clearAll} className="btn-danger btn-sm" disabled={clearing}>
              <Trash2 size={14} /> {clearing ? "Clearing…" : "Clear all"}
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
            /* Stretched link: the card is a container, the link covers it,
               and the remove button sits above it. Nesting a <button>
               inside a <Link> is invalid HTML and breaks keyboard use. */
            <div key={p.id} className="card card-hover group relative p-4">
              <Link
                to={`/app/paper/${p.id}`}
                className="absolute inset-0 z-0 rounded-2xl"
                aria-label={p.title}
              >
                <span className="sr-only">Open {p.title}</span>
              </Link>
              <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
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
                  onClick={() => remove.mutate(p.id)}
                  className="pointer-events-auto relative z-20 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/20 text-amber-600 transition hover:bg-rose-500/15 hover:text-rose-500"
                  title="Remove bookmark"
                  aria-label={`Remove bookmark for ${p.title}`}
                >
                  <Bookmark size={16} fill="currentColor" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
