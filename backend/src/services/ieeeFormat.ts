import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { detectSections, extractTitle } from "./documentParser.js";
import { normalizeWhitespace } from "./textUtils.js";

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

/** Split prose into paragraphs (blank-line separated; hard newlines become paragraph breaks). */
function toParagraphs(text: string): string[] {
  const cleaned = (text || "").replace(/\r\n?/g, "\n");
  const blocks = cleaned
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter((b) => b.length > 0);
  const out: string[] = [];
  for (const b of blocks) {
    const lines = b.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length > 1) out.push(...lines);
    else if (b) out.push(b);
  }
  return out;
}

/** Render raw content into the IEEE front matter + two-column body. */
export async function generateIeeeDocx(content: string, meta: IeeeMeta = {}): Promise<Buffer> {
  const text = normalizeWhitespace(content).slice(0, MAX_CONTENT_CHARS);
  const title = (meta.title?.trim() || extractTitle(text, "research-paper") || "Untitled research paper").trim().slice(0, 300);
  const authors = (meta.authors || []).map((a) => String(a).trim()).filter(Boolean).slice(0, 20);
  const keywords = (meta.keywords || []).map((k) => String(k).trim()).filter(Boolean).slice(0, 15);
  const abstractText = (meta.abstract?.trim() || firstParagraph(text)).trim();

  const frontMatter: Paragraph[] = [
    para(title, { heading: HeadingLevel.TITLE, size: 36, bold: true }),
  ];
  if (authors.length) frontMatter.push(para(authors.join(", "), { size: 22, bold: true }));
  if (abstractText) frontMatter.push(para(`Abstract: ${abstractText}`, { size: 20, italics: true }));
  if (keywords.length) frontMatter.push(para(`Index Terms — ${keywords.join("; ")}.`, { size: 20 }));

  const body: Paragraph[] = [];
  for (const section of detectSections(text)) {
    const contentText = (section.content || "").trim();
    if (!contentText) continue;
    body.push(para(section.name, { heading: HeadingLevel.HEADING_1, size: 26, bold: true }));
    for (const p of toParagraphs(contentText)) body.push(para(p, { size: 20 }));
  }
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
