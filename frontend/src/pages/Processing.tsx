import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, PageTitle, ScoreBar } from "../components/Layout";

const STAGES = ["QUEUED", "PARSING", "CHUNKING", "EMBEDDING", "C_ENGINE", "SEMANTIC_SEARCH", "SIMILARITY", "AI_SIGNALS", "GAPS", "REPORT", "DONE"];

export function Processing() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["doc", id], queryFn: () => api.docStatus(id), refetchInterval: 1200 });
  const d: any = q.data;
  useEffect(() => { if (d?.done) nav(`/app/results/${id}`); }, [d, id, nav]);
  const idx = STAGES.indexOf(d?.stage || "QUEUED");
  return (
    <div>
      <PageTitle title="Analyzing paper" sub={d?.title || id} />
      <Card>
        {d?.failed ? (
          <div className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-600">Failed: {d.error} <button className="btn-primary ml-3" onClick={() => nav("/app/upload")}>Try again</button></div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm"><span className="font-medium">{(d?.stage || "QUEUED").replace(/_/g, " ")}</span><span>{d?.progress ?? 0}%</span></div>
            <div className="mt-2"><ScoreBar v={d?.progress ?? 0} /></div>
            <ol className="mt-5 space-y-2">
              {STAGES.filter((s) => s !== "DONE").map((s, i) => (
                <li key={s} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${i < idx ? "text-emerald-600" : i === idx ? "bg-indigo-600/10 font-medium text-indigo-600 dark:text-indigo-300" : "text-slate-400"}`}>
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${i < idx ? "bg-emerald-500 text-white" : i === idx ? "bg-indigo-600 text-white animate-pulse" : "bg-slate-200 dark:bg-white/10"}`}>{i < idx ? "✓" : i + 1}</span>
                  {s.replace(/_/g, " ")}{s === "C_ENGINE" && <span className="badge bg-slate-100 text-slate-500 dark:bg-white/10">C engine</span>}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-slate-400">Large papers are chunked before reaching the C engine; the page advances automatically.</p>
          </>
        )}
      </Card>
    </div>
  );
}
