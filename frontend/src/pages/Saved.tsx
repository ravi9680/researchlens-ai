import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";
import { Bookmark } from "lucide-react";

export function Saved() {
  const [saved, setSaved] = useState<any[]>([]);

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

  // Load on mount
  const [loaded, setLoaded] = useState(false);
  if (!loaded) {
    loadSaved();
    setLoaded(true);
  }

  return (
    <div>
      <PageTitle title="Saved Papers" sub="Your saved research papers" />
      {saved.length === 0 ? (
        <Empty text="No saved papers yet. Browse the Explorer and bookmark papers you like." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {saved.map((p: any) => (
            <Link key={p.id} to={`/app/paper/${p.id}`} className="card p-4 hover:border-indigo-400">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium">{p.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{(p.authors || []).join(", ")} · {p.year} · {p.venue}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.abstract}</p>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); removeSave(p.id); }}
                  className="p-2 rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"
                >
                  <Bookmark size={16} />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
