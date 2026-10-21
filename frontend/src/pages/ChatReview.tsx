import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";
import { Card, PageTitle } from "../components/Layout";
import { Send, Trash2 } from "lucide-react";

const STORAGE_KEY = "researchlens_chat_history";

interface Message {
  role: "user" | "assistant";
  text: string;
  evidence?: any[];
  references?: any[];
  grounded?: boolean;
  note?: string;
}

export function Chat() {
  const [qq, setQ] = useState("");
  const [history, setHistory] = useState<Message[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Persist history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  async function ask() {
    if (!qq.trim()) return;
    const question = qq.trim();
    setQ("");
    setBusy(true);
    setErr("");
    setHistory((h) => [...h, { role: "user", text: question }]);
    try {
      const res: any = await api.chat(question);
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
      setHistory((h) => h.slice(0, -1)); // remove the user message on error
    } finally {
      setBusy(false);
    }
  }

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const SUGGESTIONS = [
    "What datasets are frequently used?",
    "What are the limitations of existing approaches?",
    "Which papers discuss XGBoost?",
    "What research gaps appear in this area?",
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <PageTitle title="Chat with research" sub="Grounded in retrieved chunks — abstains when evidence is thin" />
        {history.length > 0 && (
          <button onClick={clearHistory} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-rose-500/10 hover:text-rose-500 transition-colors border border-slate-200 dark:border-white/10">
            <Trash2 size={14} /> Clear chat
          </button>
        )}
      </div>

      {/* Chat history */}
      {history.length > 0 && (
        <div className="mb-4 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {history.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${msg.role === "user" ? "bg-indigo-600 text-white" : "card"}`}>
                <p className="leading-relaxed">{msg.text}</p>
                {msg.role === "assistant" && msg.evidence && msg.evidence.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-slate-200/60 pt-3 dark:border-white/10">
                    {msg.evidence.map((e: any, j: number) => (
                      <div key={j} className="rounded-xl bg-slate-50 p-2 text-xs dark:bg-white/5">
                        <b>{e.paper}</b> <span className="text-slate-500">[{e.section} · {e.relevance}%]</span>
                        <p className="mt-1 text-slate-500">"{e.excerpt}…"</p>
                      </div>
                    ))}
                    {msg.references && msg.references.length > 0 && (
                      <p className="text-xs text-slate-400 pt-1">Refs: {msg.references.map((r: any) => `${r.title} (${r.year})`).join(" · ")}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="card max-w-[80%] rounded-2xl px-4 py-3 text-sm">
                <span className="animate-pulse text-slate-400">Searching indexed literature…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <Card>
        <div className="flex gap-2">
          <input
            className="input"
            value={qq}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && ask()}
            placeholder="Ask a research question…"
          />
          <button className="btn-primary" disabled={busy || !qq.trim()} onClick={ask}>
            <Send size={15} />
          </button>
        </div>
        {history.length === 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="badge bg-slate-100 hover:bg-indigo-100 dark:bg-white/5 cursor-pointer" onClick={() => setQ(s)}>{s}</button>
            ))}
          </div>
        )}
        {err && <p className="mt-2 text-sm text-rose-500">{err}</p>}
      </Card>
    </div>
  );
}
