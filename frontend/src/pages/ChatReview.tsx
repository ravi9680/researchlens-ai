import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle } from "../components/Layout";
import { Send, Trash2, Sparkles, User, Quote, ShieldCheck, Loader2 } from "lucide-react";

const STORAGE_KEY = "researchlens_chat_history";

interface Message {
  role: "user" | "assistant";
  text: string;
  evidence?: any[];
  references?: any[];
  grounded?: boolean;
  note?: string;
}

const SUGGESTIONS = [
  "What datasets are frequently used?",
  "What are the limitations of existing approaches?",
  "Which papers discuss gradient boosting?",
  "What research gaps appear in this area?",
];

export function Chat() {
  const [qq, setQ] = useState("");
  const [history, setHistory] = useState<Message[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, busy]);

  async function ask(question?: string) {
    const q = (question ?? qq).trim();
    if (!q || busy) return;
    setQ("");
    setBusy(true);
    setErr("");
    setHistory((h) => [...h, { role: "user", text: q }]);
    try {
      const res: any = await api.chat(q);
      setHistory((h) => [...h, {
        role: "assistant",
        text: res.answer,
        evidence: res.evidence,
        references: res.references,
        grounded: res.grounded,
        note: res.note,
      }]);
    } catch (e: any) {
      setErr(e.message);
      setHistory((h) => h.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <PageTitle
          title="Chat with research"
          sub="Answers are grounded in retrieved chunks — the assistant abstains when evidence is thin"
        />
        {history.length > 0 && (
          <button onClick={clearHistory} className="btn-danger btn-sm">
            <Trash2 size={13} /> Clear chat
          </button>
        )}
      </div>

      {/* ---------- conversation ---------- */}
      {history.length > 0 && (
        <div className="mb-4 max-h-[58vh] space-y-4 overflow-y-auto pr-1">
          {history.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
                msg.role === "user"
                  ? "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                  : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-600/20"
              }`}>
                {msg.role === "user" ? <User size={15} /> : <Sparkles size={15} />}
              </span>

              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                msg.role === "user"
                  ? "rounded-tr-sm bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-indigo-600/20"
                  : "card rounded-tl-sm"
              }`}>
                <p className="leading-relaxed text-body whitespace-pre-wrap">{msg.text}</p>

                {msg.role === "assistant" && (
                  <>
                    {msg.grounded === false && (
                      <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/[0.08] dark:text-amber-200">
                        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                        Not enough indexed evidence to answer this.
                      </p>
                    )}

                    {msg.evidence && msg.evidence.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-slate-200/70 pt-3 dark:border-white/10">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">Evidence</p>
                        {msg.evidence.map((e: any, j: number) => (
                          <div key={j} className="rounded-xl border border-slate-200/70 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                            <div className="flex flex-wrap items-center gap-2">
                              <Quote size={12} className="shrink-0 text-faint" />
                              <b className="truncate text-xs font-semibold text-body">{e.paper}</b>
                              <span className="badge badge-indigo ml-auto">{e.relevance}% match</span>
                            </div>
                            <p className="mt-1.5 text-[13px] italic leading-relaxed text-muted">"{e.excerpt}…"</p>
                            <p className="mt-1 text-[11px] text-faint">section: {e.section}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.references && msg.references.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-200/70 pt-3 dark:border-white/10">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">Refs</span>
                        {msg.references.map((r: any, j: number) => (
                          <Link key={j} to={`/app/paper/${r.id}`} className="badge badge-slate transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:border-indigo-400/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200">
                            {r.title}{r.year ? ` (${r.year})` : ""}
                          </Link>
                        ))}
                      </div>
                    )}

                    {msg.note && <p className="mt-2 text-[11px] italic text-faint">{msg.note}</p>}
                  </>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                <Sparkles size={15} />
              </span>
              <div className="card flex items-center gap-2.5 rounded-tl-sm px-4 py-3 text-sm text-muted">
                <Loader2 size={14} className="animate-spin text-indigo-600 dark:text-indigo-300" />
                Searching indexed literature…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ---------- composer ---------- */}
      <Card className="mt-auto transition-shadow duration-300 focus-within:shadow-xl focus-within:shadow-indigo-500/10">
        <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex items-end gap-2">
          <textarea
            className="input max-h-32 min-h-[2.75rem] flex-1 resize-none py-3"
            rows={1}
            value={qq}
            placeholder="Ask a research question about the indexed literature…"
            aria-label="Research question"
            onChange={(e) => {
              setQ(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(128, e.target.scrollHeight)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); }
            }}
          />
          <button
            type="submit"
            className="btn-primary h-11 w-11 shrink-0 p-0 disabled:opacity-40"
            disabled={busy || !qq.trim()}
            aria-label="Send"
            title="Send question"
          >
            {busy
              ? <Loader2 size={16} className="animate-spin" />
              : <Send size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />}
          </button>
        </form>

        {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}

        {history.length === 0 && (
          <div className="mt-4">
            <p className="label">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-[11px] text-faint">
          Press <span className="kbd">Enter</span> to send · <span className="kbd">Shift</span> + <span className="kbd">Enter</span> for a new line.
          Answers only cite retrieved passages.
        </p>
      </Card>
    </div>
  );
}
