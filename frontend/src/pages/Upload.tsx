import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud } from "lucide-react";
import { api } from "../lib/api";
import { Card, PageTitle } from "../components/Layout";

const STAGES = ["PARSING", "CHUNKING", "EMBEDDING", "C_ENGINE", "SEMANTIC_SEARCH", "SIMILARITY", "AI_SIGNALS", "GAPS", "REPORT"];

export function Upload() {
  const nav = useNavigate();
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(f: File) {
    setErr(""); setBusy(true);
    try {
      if (!/\.(pdf|docx|txt)$/i.test(f.name)) throw new Error("Only PDF, DOCX, TXT allowed");
      if (f.size > 25 * 1024 * 1024) throw new Error("File over 25 MB");
      const r = await api.upload(f);
      nav(`/app/processing/${r.documentId}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div>
      <PageTitle title="Upload paper" sub="PDF, DOCX or TXT · max 25 MB" />
      <Card>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) send(f); }}
          className={`grid place-items-center rounded-2xl border-2 border-dashed p-12 text-center transition ${drag ? "border-indigo-500 bg-indigo-500/5" : "border-slate-300 dark:border-white/15"}`}
        >
          <UploadCloud size={36} className="text-indigo-500" />
          <p className="mt-3 font-medium">Drag & drop your paper here</p>
          <p className="text-sm text-slate-500">or</p>
          <label className="btn-primary mt-2 cursor-pointer">
            Browse files
            <input type="file" accept=".pdf,.docx,.txt" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); }} />
          </label>
          {busy && <p className="mt-3 text-sm text-indigo-500">Uploading…</p>}
          {err && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-600">{err} <button className="underline" onClick={() => setErr("")}>retry</button></p>}
        </div>
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Processing pipeline</p>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s, i) => (<span key={s} className="badge bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">{i + 1} · {s.replace(/_/g, " ")}</span>))}
          </div>
        </div>
      </Card>
    </div>
  );
}
