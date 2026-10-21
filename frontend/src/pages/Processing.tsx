import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, PageTitle, ScoreBar } from "../components/Layout";
import { CheckCircle2, AlertCircle, Loader2, Cpu } from "lucide-react";

const STAGES = ["QUEUED", "PARSING", "CHUNKING", "EMBEDDING", "C_ENGINE", "SEMANTIC_SEARCH", "SIMILARITY", "AI_SIGNALS", "GAPS", "REPORT", "DONE"];

export function Processing() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["doc", id], queryFn: () => api.docStatus(id), refetchInterval: 1200 });
  const d: any = q.data;
  useEffect(() => { if (d?.done) nav(`/app/results/${id}`); }, [d, id, nav]);
  const idx = STAGES.indexOf(d?.stage || "QUEUED");
  const progress = d?.progress ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Analyzing your paper" sub={d?.title || id} />

      <Card>
        {d?.failed ? (
          <div className="field-ok !border-rose-200 !bg-rose-50 !text-rose-700 dark:!border-rose-500/30 dark:!bg-rose-500/10 dark:!text-rose-300">
            <div className="flex items-start gap-2">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Analysis failed</p>
                <p className="mt-0.5 text-sm">{d.error || "Unknown error"}</p>
              </div>
            </div>
            <button className="btn-primary btn-sm mt-3" onClick={() => nav("/app/upload")}>Try again</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Loader2 size={16} className="animate-spin text-indigo-600 dark:text-indigo-300" />
                <span className="font-semibold text-body">{(d?.stage || "QUEUED").replace(/_/g, " ")}</span>
              </div>
              <span className="stat-num text-sm font-semibold text-body">{progress}%</span>
            </div>
            <div className="mt-3"><ScoreBar v={progress} /></div>

            <ol className="mt-6 space-y-1.5">
              {STAGES.filter((s) => s !== "DONE").map((s, i) => {
                const done = i < idx;
                const active = i === idx;
                return (
                  <li
                    key={s}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                      active
                        ? "bg-indigo-600/10 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200"
                        : done
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-muted"
                    }`}
                  >
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400"
                    }`}>
                      {done ? <CheckCircle2 size={13} /> : i + 1}
                    </span>
                    <span className="font-mono text-[13px] tracking-wide">{s.replace(/_/g, " ")}</span>
                    {s === "C_ENGINE" && (
                      <span className="badge badge-indigo ml-auto gap-1">
                        <Cpu size={11} /> C engine
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            <div className="note mt-5">
              Large papers are chunked before reaching the C engine. This page advances automatically when
              the report is ready.
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
