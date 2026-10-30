import { useRef, useState } from "react";
import { Card, PageTitle } from "../components/Layout";
import { api } from "../lib/api";
import { FileText } from "lucide-react";

function splitList(s: string, sep = /[\n,;]+/) {
  return s.split(sep).map((x) => x.trim()).filter(Boolean);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function firstPara(content: string) {
  const line = (content || "").split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  return line || "";
}

/** Print-ready HTML for the IEEE paper — Times New Roman, A4, two-column body. */
function buildIeeePrintHtml(content: string, meta: { title: string; authors: string; keywords: string; abstract: string }) {
  const title = meta.title.trim() || firstPara(content).slice(0, 120) || "Untitled research paper";
  const authorsTxt = meta.authors.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).join(", ") || "Author";
  const keywordsTxt = meta.keywords.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).join(", ") || "research";
  const abstractTxt = meta.abstract.trim() || firstPara(content);
  const paras = content
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((b) => b.split("\n").map((l) => l.trim()).filter(Boolean));
  const body = paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 1in; }
  html, body { font-family: "Times New Roman", Times, serif; color: #000; }
  body { font-size: 11pt; line-height: 1.5; }
  h1 { font-size: 18pt; text-align: center; margin: 0 0 12pt; }
  .authors { text-align: center; font-size: 11pt; margin-bottom: 10pt; }
  .lbl { font-weight: bold; font-size: 11pt; margin-top: 10pt; }
  .abs { font-size: 10.5pt; font-style: italic; margin-bottom: 6pt; }
  .kws { font-size: 10.5pt; margin-bottom: 12pt; }
  .body { column-count: 2; column-gap: 12mm; text-align: justify; }
  p { margin: 0 0 8pt; text-align: justify; break-after: avoid; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="authors">${escapeHtml(authorsTxt)}</div>
  <div class="lbl">Abstract</div>
  <div class="abs">${escapeHtml(abstractTxt)}</div>
  <div class="lbl">Index Terms</div>
  <div class="kws">${escapeHtml(keywordsTxt)}</div>
  <div class="body">${body}</div>
</body>
</html>`;
}

/** Trigger a browser download for an API response blob. */
async function saveBlob(res: Response, name: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function IeeeFormat() {
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [keywords, setKeywords] = useState("");
  const [abstract, setAbstract] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const sourceOk = mode === "paste" ? content.trim().length >= 40 : Boolean(file && file.size > 0);
  const valid = sourceOk && !busy;

  const prepare = async () => {
    if (!valid) return;
    setBusy(true);
    setError("");
    setReady(false);
    try {
      const filename = `ieee-paper-${Date.now()}.docx`;
      const res =
        mode === "paste"
          ? await api.ieeeFormat(content, {
              title,
              authors: splitList(authors),
              keywords: splitList(keywords),
              abstract,
            })
          : await api.ieeeFormatFile(file!, {
              title,
              authors: authors || "",
              keywords: keywords || "",
              abstract,
            });
      await saveBlob(res, filename);
      setReady(true);
    } catch (e: any) {
      setError(e?.message || "Could not prepare the IEEE paper right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  /* Print-to-PDF variant: opens a print-ready IEEE-styled HTML and hands it
   * to the browser print dialog (user saves as PDF). Paste mode only — an
   * uploaded file's text is not available client-side. */
  const preparePdf = async () => {
    if (mode !== "paste" || !sourceOk || busy) return;
    setBusy(true);
    setError("");
    setReady(false);
    try {
      const html = buildIeeePrintHtml(content, {
        title,
        authors: authors || "Author",
        keywords: keywords || "research",
        abstract,
      });
      const w = window.open("", "_blank", "width=960,height=820");
      if (!w) {
        setError("Popup blocked — please allow popups for this site to use the PDF export.");
        return;
      }
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
      setReady(true);
    } catch (e: any) {
      setError(e?.message || "Could not open the PDF view right now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageTitle
        title="IEEE paper formatter"
        sub="Paste the raw content of your research paper — or upload a text / PDF / Word file — and get back a properly formatted IEEE conference research paper (.docx or print-to-PDF) built around your content."
      />

      <Card>
        {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

        <div className="mb-4">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={() => setMode("paste")}
              className={`btn-sm rounded-lg ${mode === "paste" ? "btn-primary" : "btn-ghost"}`}
            >
              Paste text
            </button>
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`btn-sm rounded-lg ${mode === "upload" ? "btn-primary" : "btn-ghost"}`}
            >
              Upload file
            </button>
          </div>
        </div>

        {mode === "paste" ? (
          <textarea
            className="input min-h-[220px] w-full resize-y py-3"
            placeholder="Paste the full raw text of your research paper here — abstract, sections, results, references…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-white/10">
            <input
              ref={fileRef}
              id="ieee-file"
              type="file"
              accept=".txt,.md,.text,.pdf,.docx"
              className="input"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
              }}
            />
            <p className="mt-2 text-xs text-muted">TXT / MD / PDF / DOCX — text is extracted automatically before formatting.</p>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="ieee-title">Paper title</label>
            <input
              id="ieee-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title of the paper"
            />
          </div>
          <div>
            <label className="label" htmlFor="ieee-keywords">Keywords (comma separated)</label>
            <input
              id="ieee-keywords"
              className="input"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="machine learning, similarity"
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="label" htmlFor="ieee-authors">Authors</label>
          <textarea
            id="ieee-authors"
            className="input min-h-[90px] w-full resize-y py-3"
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder={"A. Sharma — IIT Delhi\nB. Lee — Stanford University"}
          />
        </div>

        <div className="mt-3">
          <label className="label" htmlFor="ieee-abstract">Abstract (optional — the first paragraph is used if left empty)</label>
          <textarea
            id="ieee-abstract"
            className="input min-h-[110px] w-full resize-y py-3"
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            placeholder="Optional abstract for the IEEE paper…"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" onClick={prepare} disabled={!valid}>
            <FileText size={15} className="mr-1.5" /> {busy ? "Preparing your IEEE paper…" : "Prepare my IEEE paper (.docx)"}
          </button>
          <button type="button" className="btn-secondary" onClick={preparePdf} disabled={mode !== "paste" || !sourceOk || busy}>
            <FileText size={15} className="mr-1.5" /> Prepare my IEEE paper (PDF / print)
          </button>
          <p className="text-xs text-muted">Output: Word (.docx) or print-to-PDF — both in IEEE conference format.</p>
        </div>

        {ready ? (
          <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">
            Your IEEE-formatted research paper is ready. Check your downloads — .docx should open in Word or LibreOffice.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
