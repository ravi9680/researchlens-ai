import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";

export function Saved() {
  const savedQ = useQuery({ queryKey: ["savedPapers"], queryFn: () => fetch("/api/papers/saved", { headers: api.h() }).then((r: Response) => r.json()) });

  if (savedQ.isLoading) return <div className="skel h-96" />;
  if (savedQ.isError) return <Empty text="Unable to load saved papers." />;

  const saved: any[] = savedQ.data || [];

  return (
    <div>
      <PageTitle title="Saved Papers" sub="Your saved research papers" />
      {saved.length === 0 ? (
        <Empty text="No saved papers yet. Browse the Explorer and bookmark papers you like." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {saved.map((p: any) => (
            <Link key={p.id} to={`/app/paper/${p.id}`} className="card p-4 hover:border-indigo-400">
              <p className="font-medium">{p.title}</p>
              <p className="mt-1 text-xs text-slate-500">{(p.authors || []).join(", ")} · {p.year} · {p.venue}</p>
              <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.abstract}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
