import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, PageTitle, ScoreBar } from "../components/Layout";
import { CheckCircle2, AlertCircle, Loader2, Cpu, RotateCw, Clock, WifiOff } from "lucide-react";

const STAGES = ["QUEUED", "PARSING", "CHUNKING", "EMBEDDING", "C_ENGINE", "SEMANTIC_SEARCH", "SIMILARITY", "AI_SIGNALS", "GAPS", "REPORT", "DONE"];

function elapsedLabel(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function Processing() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["doc", id], queryFn: () => api.docStatus(id), refetchInterval: 1200 });
  const d: any = q.data;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");

  useEffect(() => { if (d?.done) nav(`/app/results/${id}`); }, [d, id, nav]);

  /* The server repairs a stalled analysis by re-running it the moment it
   * notices the stage has stopped advancing. When that happens the stage
   * changes under us, so pull the new state straight away instead of
   * waiting for the next poll. */
  useEffect(() => {
    if (d?.recovered) q.refetch();
  }, [d?.recovered]);

  /* A local ticker so the elapsed time keeps moving between polls. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const idx = STAGES.indexOf(d?.stage || "QUEUED");
  const progress = d?.progress ?? 0;
  const elapsed = d?.elapsedMs != null ? d.elapsedMs + (now - (d?.__t ?? now)) : 0;

  async function retry() {
    setRetrying(true); setRetryError("");
    try {
      await api.retryDoc(id);
      q.refetch();
    } catch (e: any) {
      setRetryError(e.message);
    } finally {
      setRetrying(false);
    }
  }

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
            <div className="mt-3 flex flex-wrap gap-2">
              {d.canRetry && (
                <button className="btn-primary btn-sm" onClick={retry} disabled={retrying}>
                  <RotateCw size={13} className={retrying ? "animate-spin" : ""} /> {retrying ? "Retrying…" : "Retry analysis"}
                </button>
              )}
              <button className="btn-secondary btn-sm" onClick={() => nav("/app/upload")}>Upload a different file</button>
            </div>
            {retryError && <p className="mt-2 text-xs text-rose-600">{retryError}</p>}
          </div>
        ) : d?.stale ? (
          /* The analysis stopped advancing — usually the free-tier container
             was recycled mid-run. Say so plainly and offer a way out rather
             than leaving an endless progress bar on screen. */
          <div className="field-ok !border-amber-200 !bg-amber-50 !text-amber-900 dark:!border-amber-500/30 dark:!bg-amber-500/10 dark:!text-amber-200">
            <div className="flex items-start gap-2">
              <WifiOff size={17} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">This analysis stopped responding</p>
                <p className="mt-0.5 text-sm leading-relaxed">
                  It has been stuck on <b>{(d.stage || "").replace(/_/g, " ")}</b> for{" "}
                  {elapsedLabel(elapsed)}. The shared free-tier server was most likely restarted
                  while the job was running. Retry — your file is still stored.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primary btn-sm" onClick={retry} disabled={retrying}>
                <RotateCw size={13} className={retrying ? "animate-spin" : ""} /> {retrying ? "Retrying…" : "Retry analysis"}
              </button>
              <button className="btn-secondary btn-sm" onClick={() => nav("/app")}>Back to dashboard</button>
            </div>
            {retryError && <p className="mt-2 text-xs text-rose-600">{retryError}</p>}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Loader2 size={16} className="animate-spin text-indigo-600 dark:text-indigo-300" />
                <span className="font-semibold text-body">{(d?.stage || "QUEUED").replace(/_/g, " ")}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden items-center gap-1 text-xs text-muted sm:flex">
                  <Clock size={12} /> {elapsedLabel(elapsed)}
                </span>
                <span className="stat-num text-sm font-semibold text-body">{progress}%</span>
              </div>
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
              the report is ready — and if the server is interrupted it will offer a retry instead of
              hanging here.
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
