import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

/* IEEE paper export — takes raw research content (or an extracted file
 *  body) and renders it as a downloadable Word document in IEEE conference
 *  format. Backed by the `docx` generator; typography follows the IEEE
 *  conference paper conventions (Times New Roman, 10 pt body, 1" margins,
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

function para(
  text: string,
  opts: { heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]; size?: number; bold?: boolean; italics?: boolean } = {}
): Paragraph {
  return new Paragraph({
    ...(opts.heading ? { heading: opts.heading } : {}),
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

/** Recognise IEEE-style section headings: known names, or "I. Something". */
function headingOf(line: string): string | undefined {
  const t = (line || "").trim();
  if (!t || t.length > 90) return undefined;
  const known = /^(abstract|keywords?|index\s+terms?|references?|bibliography|introduction|related\s+work|background|literature\s+review|methodology|methods?|approach|model|architecture|proposed\s+method|experiments?|evaluation|results?|discussion|conclusion|conclusions|future\s+work|appendix|appendices|acknowledgements?)\b/i;
  if (known.test(t)) return t.replace(/\s+/g, " ").trim();
  if (/^[IVXLCDM]+[\.\)]?\s+\S/.test(t)) return t.replace(/\s+/g, " ").trim();
  return undefined;
}

function isHeadingLine(line: string): boolean {
  return headingOf(line) !== undefined;
}

function blockEnd(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) if (isHeadingLine(lines[i])) return i;
  return lines.length;
}

/** Extract author names from content lines that look like "Author: ..." metadata. */
function authorsFromContent(lines: string[], beforeIdx: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < beforeIdx; i++) {
    const l = lines[i];
    if (/^author\b/i.test(l)) {
      const v = l.replace(/^author\b[:\-]?\s*/i, "").trim();
      if (v) out.push(v);
    }
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
  const authors =
    meta.authors && meta.authors.length
      ? meta.authors.map((a) => String(a).trim()).filter(Boolean).slice(0, 20)
      : authorsFromContent(lines, lines.findIndex((l) => /^abstract\b/i.test(l)));
  const keywords =
    meta.keywords && meta.keywords.length
      ? meta.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 15)
      : (() => {
          const kwIdx = lines.findIndex((l) => /^(keywords?|index\s+terms?)\b/i.test(l));
          if (kwIdx < 0) return [];
          const end = blockEnd(lines, kwIdx + 1);
          const out: string[] = [];
          for (let i = kwIdx + 1; i < end; i++) out.push(lines[i]);
          return out;
        })();
  const abstract = (meta.abstract && meta.abstract.trim()) || firstParagraph(text);

  const frontMatter: Paragraph[] = [para(title, { heading: HeadingLevel.TITLE, size: 36, bold: true })];
  if (authors.length) frontMatter.push(para(authors.join(", "), { size: 22, bold: true }));
  if (abstract) frontMatter.push(para(`Abstract: ${abstract}`, { size: 20, italics: true }));
  const keywordLine = keywords.length ? `Keywords — ${keywords.join("; ")}.` : undefined;
  if (keywordLine) frontMatter.push(para(keywordLine, { size: 20 }));

  /* Body: everything after the abstract / keywords regions, grouped into
   *  heading-led blocks (IEEE sections) or plain paragraphs. */
  const absIdx = lines.findIndex((l) => /^abstract\b/i.test(l));
  const kwIdx = lines.findIndex((l) => /^(keywords?|index\s+terms?)\b/i.test(l));
  const absEnd = absIdx >= 0 ? blockEnd(lines, absIdx + 1) : lines.length;
  const kwEnd = kwIdx >= 0 ? blockEnd(lines, kwIdx + 1) : absEnd;
  const bodyStart = Math.max(absEnd, kwEnd);

  const body: Paragraph[] = [];
  let cur: { heading?: string; paras: string[] } = { paras: [] };
  const flush = () => {
    if (cur.paras.length) {
      if (cur.heading) body.push(para(cur.heading, { heading: HeadingLevel.HEADING_1, size: 26, bold: true }));
      for (const p of cur.paras) body.push(para(p, { size: 20 }));
    }
    cur = { paras: [] };
  };
  for (const line of lines.slice(bodyStart)) {
    const h = headingOf(line);
    if (h) {
      flush();
      cur = { heading: h, paras: [] };
    } else {
      cur.paras.push(line);
    }
  }
  flush();
  if (body.length === 0) body.push(para(text.slice(0, 2000), { size: 20 }));

  const pageProps = {
    page: { margin: { top: INCH_TWIPS, right: INCH_TWIPS, bottom: INCH_TWIPS, left: INCH_TWIPS } },
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

  return Packer.toBuffer(doc);
}
