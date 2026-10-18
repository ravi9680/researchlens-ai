import { useState } from "react";
import { api } from "../lib/api";
import { Card, PageTitle } from "../components/Layout";

export function Chat() {
  const [qq, setQ] = useState("What methods are commonly used for phishing URL detection?");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function ask() {
    setBusy(true); setErr("");
    try { setRes(await api.chat(qq)); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div>
      <PageTitle title="Chat with research" sub="Grounded in retrieved chunks — abstains when evidence is thin" />
      <Card>
        <div className="flex gap-2"><input className="input" value={qq} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} />
          <button className="btn-primary" disabled={busy} onClick={ask}>{busy ? "…" : "Ask"}</button></div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {["What datasets are frequently used?", "What are the limitations of existing approaches?", "Which papers discuss XGBoost?", "What research gaps appear in this area?"].map((s) => (
            <button key={s} className="badge bg-slate-100 hover:bg-indigo-100 dark:bg-white/5" onClick={() => setQ(s)}>{s}</button>))}
        </div>
        {err && <p className="mt-2 text-sm text-rose-500">{err}</p>}
      </Card>
      {res && (
        <Card className="mt-4">
          <p className="text-sm leading-relaxed">{res.answer}</p>
          <p className="mt-2 text-xs text-slate-500">{res.grounded ? "Grounded in evidence below." : "No strong evidence found."} {res.note}</p>
          <div className="mt-3 space-y-2">
            {(res.evidence || []).map((e: any, i: number) => (<div key={i} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5"><b>{e.paper}</b> <span className="text-xs text-slate-500">[{e.section} · {e.relevance}%]</span><p className="mt-1 text-slate-500">“{e.excerpt}…”</p></div>))}
          </div>
          <p className="mt-3 text-xs text-slate-500">References: {(res.references || []).map((r: any) => `${r.title} (${r.year})`).join(" · ") || "—"}</p>
        </Card>
      )}
    </div>
  );
}
