import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";
import { Bookmark, Trash2 } from "lucide-react";

export function Saved() {
  const [saved, setSaved] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load saved papers from localStorage
  const loadSaved = () => {
    const savedIds = JSON.parse(localStorage.getItem("researchlens_saved") || "[]");
    if (savedIds.length === 0) {
      setSaved([]);
      return;
    }
    // Fetch details for each saved paper; use allSettled so one failure doesn't wipe the list
    Promise.allSettled(savedIds.map((id: string) => api.paper(id))).then((results) => {
      const papers = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value != null)
        .map((r) => r.value);
      setSaved(papers);
    });
  };

  const removeSave = (id: string) => {
    const current = JSON.parse(localStorage.getItem("researchlens_saved") || "[]");
    localStorage.setItem("researchlens_saved", JSON.stringify(current.filter((x: string) => x !== id)));
    loadSaved();
  };

  const clearAll = () => {
    localStorage.setItem("researchlens_saved", "[]");
    setSaved([]);
  };

  // Load on mount
  if (!loaded) {
    loadSaved();
    setLoaded(true);
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saved Papers</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {saved.length > 0 ? `${saved.length} bookmarked paper${saved.length !== 1 ? "s" : ""}` : "Your saved research papers"}
          </p>
        </div>
        {saved.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-rose-500/10 hover:text-rose-500 transition-colors border border-slate-200 dark:border-white/10"
          >
            <Trash2 size={14} /> Clear all
          </button>
        )}
      </div>
      {saved.length === 0 ? (
        <Empty text="No saved papers yet. Browse the Explorer and bookmark papers you like." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {saved.map((p: any) => (
            <Link key={p.id} to={`/app/paper/${p.id}`} className="card p-4 hover:border-indigo-400">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{(p.authors || []).join(", ")} · {p.year} · {p.venue}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.abstract}</p>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); removeSave(p.id); }}
                  className="shrink-0 p-2 rounded-lg bg-amber-500/20 text-amber-600 hover:bg-rose-500/15 hover:text-rose-500 transition-colors ml-2"
                  title="Remove bookmark"
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
