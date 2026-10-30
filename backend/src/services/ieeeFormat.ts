import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

/* IEEE paper export — takes raw research content (or an extracted file
 *  body) and renders it as a downloadable Word document in IEEE conference
 *  format. Backed by the `docx` generator; typography follows the IEEE
 *  conference paper conventions (Times New Roman, 10 pt body, A4 page,
 *  two-column body, front matter with title/authors/abstract/keywords). */

export interface IeeeMeta {
  title?: string;
  authors?: string[];
  keywords?: string[];
  abstract?: string;
}

const MAX_CONTENT_CHARS = 500_000;
const INCH_TWIPS = 1440;
const BODY_FONT = "Times New Roman";
const A4_WIDTH = 11906; // A4 width in twips
const A4_HEIGHT = 16838; // A4 height in twips

type HeadingVal = "Title" | "Heading1" | "Heading2";
type AlignVal = "start" | "end" | "center" | "both" | "distribute" | "mediumKashida" | "thaiDistribute" | "numTab" | "highKashida" | "lowKashida" | "left" | "right";

function para(text: string, opts: { heading?: HeadingVal; size?: number; bold?: boolean; italics?: boolean; alignment?: AlignVal } = {}): Paragraph {
  return new Paragraph({
    ...(opts.heading ? { heading: opts.heading } : {}),
    alignment: opts.alignment,
    children: [
      new TextRun({
        text,
        size: opts.size ?? 20, // docx sizes are half-points → 20 = 10 pt
        bold: opts.bold ?? false,
        italics: opts.italics ?? false,
        font: BODY_FONT,
      }),
    ],
  });
}

function firstParagraph(text: string): string {
  const line = (text || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line || "";
}

function headingBlock(line: string): { text: string; level: "Heading1" | "Heading2" } | undefined {
  const t = (line || "").trim();
  if (!t) return undefined;
  const known = /^(abstract|keywords?|index\s+terms?|references?|bibliography|introduction|related\s+work|background|literature\s+review|methodology|methods?|approach|model|architecture|proposed\s+method|experiments?|evaluation|results?|discussion|conclusion|conclusions|future\s+work|appendix|appendices|acknowledgements?)\b/i;
  if (known.test(t)) return { text: t.replace(/\s+/g, " ").trim(), level: "Heading1" };
  if (t.length > 90) return undefined;
  if (/^[IVXLCDM]+[\.\)]?\s+\S/.test(t)) return { text: t.replace(/\s+/g, " ").trim(), level: "Heading1" };
  if (/^[A-Z][.)]\s+\S/.test(t)) return { text: t.replace(/\s+/g, " ").trim(), level: "Heading2" };
  return undefined;
}

function isHeadingLine(line: string): boolean {
  return headingBlock(line) !== undefined;
}

function blockEnd(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) if (isHeadingLine(lines[i])) return i;
  return lines.length;
}

/** Extract author names + affiliation from content lines like "Author: ...", "Department: ...". */
function authorsFromContent(lines: string[], beforeIdx: number): { authors: string[]; affiliation: string } {
  const authors: string[] = [];
  const affiliationParts: string[] = [];
  for (let i = 0; i < beforeIdx; i++) {
    const l = lines[i];
    const m = l.match(/^(author|department|institution|university|affiliation|author affiliation)\b[:\-]?\s*(.*)$/i);
    if (m) {
      const v = (m[2] || "").trim();
      if (!v) continue;
      if (/^(author|author affiliation)/i.test(m[1])) authors.push(v);
      else affiliationParts.push(v);
    }
  }
  return { authors, affiliation: affiliationParts.filter(Boolean).join(", ") };
}

/** First author surname of a IEEE-style reference line, e.g. "[1] A. L. Buczak and E. Guven, ...". */
function refAuthorKey(refLine: string): string {
  const m = refLine.match(/([A-Z][a-z]+)/);
  const author = m ? m[1] : refLine.trim().replace(/^\[\d+\]\s*/, "");
  return author.toLowerCase();
}

/** Append an IEEE in-text citation "[n]" to a content line when its author is cited. */
function citeLine(line: string, refKeys: string[]): string {
  let out = line;
  for (let n = 0; n < refKeys.length; n++) {
    const key = refKeys[n];
    if (key && !out.includes(`[${n + 1}]`) && out.toLowerCase().includes(key)) out = out + ` [${n + 1}]`;
  }
  return out;
}

/** Render raw content into the IEEE front matter + two-column body. */
export async function generateIeeeDocx(content: string, meta: IeeeMeta = {}): Promise<Buffer> {
  /* Preserve paragraph structure: newlines are meaningful here (IEEE paper
   *  content is heading/paragraph oriented), so do NOT run it through
   *  normalizeWhitespace (which collapses whitespace into one line). */
  const text = (content || "").replace(/\r\n?/g, "\n").slice(0, MAX_CONTENT_CHARS);
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const first = firstParagraph(text);
  const title = ((meta.title && meta.title.trim()) || first || "Untitled research paper").trim().slice(0, 300);
  const authorInfo =
    meta.authors && meta.authors.length
      ? { authors: meta.authors.map((a) => String(a).trim()).filter(Boolean).slice(0, 20), affiliation: "" }
      : authorsFromContent(lines, lines.findIndex((l) => /^abstract\b/i.test(l)));
  const authors = authorInfo.authors;
  const affiliation = authorInfo.affiliation;
  const keywords =
    meta.keywords && meta.keywords.length
      ? meta.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 15)
      : (() => {
          const out: string[] = [];
          const kwIdx = lines.findIndex((l) => /^(keywords?|index\s+terms?)\b/i.test(l));
          if (kwIdx >= 0) {
            const raw = lines[kwIdx].replace(/^(keywords?|index\s+terms?)[—–-]?\s*:?\s*/i, "").trim();
            if (raw) out.push(raw);
            const end = blockEnd(lines, kwIdx + 1);
            for (let i = kwIdx + 1; i < end; i++) out.push(lines[i]);
          }
          return out;
        })();
  const absHeadingIdx = lines.findIndex((l) => /^abstract\b/i.test(l));
  const abstract =
    (meta.abstract && meta.abstract.trim()) ||
    (absHeadingIdx >= 0 ? lines.slice(absHeadingIdx + 1, blockEnd(lines, absHeadingIdx + 1)).join(" ").trim() : firstParagraph(text));

  const frontMatter: Paragraph[] = [
    para(title, { heading: "Title", size: 36, bold: true, alignment: "center" }),
  ];
  if (authors.length) frontMatter.push(para(authors.join(", "), { size: 22, bold: true, alignment: "center" }));
  if (affiliation) frontMatter.push(para(affiliation, { size: 16, alignment: "center" }));
  if (abstract) frontMatter.push(para(`ABSTRACT— ${abstract}`, { size: 20, italics: true, alignment: "both" }));
  const keywordLine = keywords.length ? `INDEX TERMS— ${keywords.join("; ").replace(/[\s.]+$/, "")}.` : undefined;
  if (keywordLine) frontMatter.push(para(keywordLine, { size: 20, alignment: "both" }));

  /* Body: everything after the abstract / keywords regions, grouped into
   *  heading-led blocks (IEEE sections) or plain paragraphs. */
  const absIdx = lines.findIndex((l) => /^abstract\b/i.test(l));
  const kwIdx = lines.findIndex((l) => /^(keywords?|index\s+terms?)\b/i.test(l));
  const absEnd = absIdx >= 0 ? blockEnd(lines, absIdx + 1) : lines.length;
  const kwEnd = kwIdx >= 0 ? blockEnd(lines, kwIdx + 1) : absEnd;
  const bodyStart = Math.max(absEnd, kwEnd);

  /* In-text citations: collect reference lines, then append "[n]" to content
   *  lines that mention the cited author's work. */
  const refIdxs: number[] = [];
  for (let i = bodyStart; i < lines.length; i++) if (/^\[\d+\]/.test(lines[i])) refIdxs.push(i);
  const refKeys: string[] = refIdxs.map((i) => refAuthorKey(lines[i]));
  const cite = (line: string): string => {
    let out = line;
    for (let n = 0; n < refKeys.length; n++) {
      const key = refKeys[n];
      if (key && !out.includes(`[${n + 1}]`) && out.toLowerCase().includes(key)) out = out + ` [${n + 1}]`;
    }
    return out;
  };

  const body: Paragraph[] = [];
  let cur: { heading?: string; level?: "Heading1" | "Heading2"; paras: string[] } = { paras: [] };
  const flush = () => {
    if (cur.paras.length) {
      if (cur.heading) body.push(para(cur.heading, { heading: cur.level ?? "Heading1", size: 26, bold: true }));
      for (const p of cur.paras) body.push(para(p, { size: 20, alignment: "both" }));
    }
    cur = { paras: [] };
  };
  for (const line of lines.slice(bodyStart)) {
    const hb = headingBlock(line);
    if (hb) {
      flush();
      cur = { heading: hb.text, level: hb.level, paras: [] };
    } else {
      cur.paras.push(/^\[/.test(line) ? line : cite(line));
    }
  }
  flush();
  if (body.length === 0) body.push(para(text.slice(0, 2000), { size: 20, alignment: "both" }));

  const pageProps = {
    page: { margin: { top: INCH_TWIPS, right: INCH_TWIPS, bottom: INCH_TWIPS, left: INCH_TWIPS }, width: A4_WIDTH, height: A4_HEIGHT },
  };

  const doc = new Document({
    creator: "ResearchLens AI",
    title,
    sections: [
      /* Front matter: title / authors / abstract / keywords on a single column. */
      { properties: pageProps, children: frontMatter },
      /* Main body: IEEE two-column conference layout. */
      { properties: { ...pageProps, column: { count: 2, space: 720, equalWidth: true } }, children: body },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return buf;
}
