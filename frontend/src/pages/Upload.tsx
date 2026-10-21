import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { Card, PageTitle } from "../components/Layout";

const STAGES = ["PARSING", "CHUNKING", "EMBEDDING", "C_ENGINE", "SEMANTIC_SEARCH", "SIMILARITY", "AI_SIGNALS", "GAPS", "REPORT"];

export function Upload() {
  const nav = useNavigate();
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  async function send(f: File) {
    setErr(""); setBusy(true); setFile(f);
    try {
      if (!/\.(pdf|docx|txt)$/i.test(f.name)) throw new Error("Only PDF, DOCX and TXT files are accepted.");
      if (f.size > 25 * 1024 * 1024) throw new Error("That file is over the 25 MB limit.");
      const r = await api.upload(f);
      nav(`/app/processing/${r.documentId}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <div>
      <PageTitle title="Upload paper" sub="PDF, DOCX or TXT · up to 25 MB" />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) send(f); }}
            className={`relative grid place-items-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all duration-300 ${
              drag
                ? "scale-[1.01] border-indigo-500 bg-indigo-50/70 shadow-lg shadow-indigo-500/10 dark:bg-indigo-500/10"
                : "border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.02] dark:hover:border-white/25"
            }`}
          >
            {busy ? (
              <>
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/25">
                  <Loader2 size={28} className="animate-spin" />
                </span>
                <p className="mt-4 font-medium text-body">Uploading {file?.name}</p>
                <p className="mt-1 text-sm text-muted">Running the analysis pipeline…</p>
              </>
            ) : (
              <>
                <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/25 transition-transform duration-300 hover:scale-110">
                  <UploadCloud size={28} />
                </span>
                <p className="mt-4 text-lg font-semibold tracking-tight text-body">Drag &amp; drop your paper here</p>
                <p className="mt-1 text-sm text-muted">or choose a file from your computer</p>
                <label className="btn-primary mt-5 cursor-pointer">
                  <FileText size={15} /> Browse files
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f); }}
                  />
                </label>
              </>
            )}
          </div>

          {err && (
            <div className="field-error mt-4 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span className="flex-1">{err}</span>
              <button className="font-semibold underline underline-offset-2" onClick={() => setErr("")}>dismiss</button>
            </div>
          )}

          <div className="mt-6">
            <p className="label">Processing pipeline</p>
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((s, i) => (
                <span key={s} className="badge badge-slate font-mono text-[11px] tracking-wide">
                  <span className="text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className="ml-0.5">{s.replace(/_/g, " ")}</span>
                </span>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-body">What happens next</h3>
            <ol className="mt-3 space-y-3">
              {[
                ["Parse & chunk", "The document is split into overlapping passages."],
                ["Embed", "Each passage becomes a 384-d IDF-weighted vector."],
                ["Match", "The C engine scores lexical overlap; embeddings score meaning."],
                ["Report", "Similar papers, passage matches, gaps and AI signals."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-indigo-600/10 text-[11px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-body">{t}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-body">Accepted files</h3>
            <ul className="mt-3 space-y-2">
              {["PDF (.pdf)", "Word (.docx)", "Plain text (.txt)"].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted">
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" /> {f}
                </li>
              ))}
            </ul>
            <div className="note mt-4">
              Your analysis is private to your account and never shown to other users.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
