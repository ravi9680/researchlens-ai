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

function romanize(num: number) {
  let n = Math.max(1, Math.floor(num));
  const map: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

/** Print-ready HTML for the IEEE paper — closer to PaperForge IEEE output. */
function buildIeeePrintHtml(content: string, meta: { title: string; authors: string; keywords: string; abstract: string }) {
  const title = meta.title.trim() || firstPara(content).slice(0, 120) || "Untitled research paper";
  const authorsTxt = splitList(meta.authors).join(",  ") || "Author";
  const keywordsTxt = splitList(meta.keywords, /[,;]+/).join(", ");
  const abstractTxt = meta.abstract.trim() || firstPara(content);
  const lines = content.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean);
  const isKnownHeading = /^(abstract|keywords?|index\s+terms?|references?|bibliography|introduction|related\s+work|background|literature\s+review|methodology|methods?|approach|model|architecture|proposed\s+method|experiments?|evaluation|results?|discussion|conclusion|conclusions|future\s+(work|scope)|appendix|appendices|acknowledgements?|research\s+gap|problem\s+statement|implementation)\b/i;
  const romanMain = /^((?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII)[.)]?\s+[A-Z])/i;
  const isHeading = (l: string) => isKnownHeading.test(l) || romanMain.test(l) || (/^[A-Z][.)]\s+\S/.test(l) && l.length <= 90);

  const absIdx = lines.findIndex((l) => /^abstract\b/i.test(l));
  const kwIdx = lines.findIndex((l) => /^(keywords?|index\s+terms?)\b/i.test(l));
  const blockEnd = (start: number) => { for (let i = start; i < lines.length; i++) if (isHeading(lines[i])) return i; return lines.length; };
  const bodyStart = Math.max(absIdx >= 0 ? blockEnd(absIdx + 1) : 0, kwIdx >= 0 ? blockEnd(kwIdx + 1) : 0);

  let n1 = 0, n2 = 0;
  const body = lines.slice(bodyStart).map((p) => {
    const t = p.trim();
    if (romanMain.test(t) || isKnownHeading.test(t)) {
      n1 += 1; n2 = 0;
      const clean = t.replace(/^\s*(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII)[.)]?\s*/i, "").trim();
      return `<h2 class="lvl1">${romanize(n1)}.&nbsp;&nbsp;${escapeHtml(clean.toUpperCase())}</h2>`;
    }
    if (/^[A-Z][.)]\s+\S/.test(t) && t.length <= 90) {
      n2 += 1;
      const clean = t.replace(/^[A-Z][.)]\s+/, "").trim();
      return `<h3 class="lvln">${n1}.${n2}&nbsp;&nbsp;${escapeHtml(clean)}</h3>`;
    }
    return `<p class="body-p">${escapeHtml(t)}</p>`;
  }).join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: letter; margin: 0.75in 0.625in; }
  html, body { font-family: "Times New Roman", Times, serif; color: #000; margin: 0; }
  body { font-size: 10pt; line-height: 1.25; }
  .header { text-align: center; margin-bottom: 12pt; }
  .title { font-size: 20pt; font-weight: bold; margin: 0 0 8pt; }
  .authors { font-size: 11pt; margin: 0 0 2pt; }
  .content { column-count: 2; column-gap: 0.25in; text-align: justify; }
  .abstract, .keywords { font-style: italic; margin: 0 0 6pt; font-size: 9pt; }
  .abstract b, .keywords b { font-weight: bold; font-style: italic; }
  h2.lvl1 { font-size: 10pt; font-weight: bold; text-align: center; font-variant: small-caps; margin: 8pt 0 4pt; break-after: avoid; }
  h3.lvln { font-size: 10pt; font-style: italic; font-weight: bold; margin: 6pt 0 3pt; break-after: avoid; }
  .body-p { margin: 0 0 6pt; text-align: justify; text-indent: 0.2in; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">${escapeHtml(title)}</div>
    <div class="authors">${escapeHtml(authorsTxt)}</div>
  </div>
  <div class="content">
    ${abstractTxt ? `<p class="abstract"><b>Abstract—</b>${escapeHtml(abstractTxt)}</p>` : ""}
    ${keywordsTxt ? `<p class="keywords"><b>Index Terms—</b>${escapeHtml(keywordsTxt)}</p>` : ""}
    ${body}
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},150);};<\/script>
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
