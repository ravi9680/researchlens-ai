import { AlignmentType, Document, Packer, Paragraph, SectionType, TextRun, convertInchesToTwip } from "docx";

/* IEEE paper export — takes raw research content (or an extracted file
 *  body) and renders it as a downloadable Word document in IEEE conference
 *  format. Output style is aligned closely with PaperForge's IEEE export:
 *  Times New Roman, Letter page, two-column body, and IEEE front matter. */

export interface IeeeMeta {
  title?: string;
  authors?: string[];
  keywords?: string[];
  abstract?: string;
}

const MAX_CONTENT_CHARS = 500_000;
const BODY_FONT = "Times New Roman";

function firstParagraph(text: string): string {
  const line = (text || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line || "";
}

function headingBlock(line: string): { text: string; level: 1 | 2 } | undefined {
  const t = (line || "").trim();
  if (!t) return undefined;
  const known = /^(abstract|keywords?|index\s+terms?|references?|bibliography|introduction|related\s+work|background|literature\s+review|methodology|methods?|approach|model|architecture|proposed\s+method|experiments?|evaluation|results?|discussion|conclusion|conclusions|future\s+(work|scope)|appendix|appendices|acknowledgements?|research\s+gap|problem\s+statement|implementation)\b/i;
  if (known.test(t)) return { text: t.replace(/\s+/g, " ").trim(), level: 1 };
  if (t.length > 90) return undefined;
  const romanMain = /^((?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII)[.)]?\s+[A-Z])/;
  if (romanMain.test(t)) return { text: t.replace(/^\s*(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII)[.)]?\s*/i, "").replace(/\s+/g, " ").trim(), level: 1 };
  if (/^[A-Z][.)]\s+\S/.test(t)) return { text: t.replace(/^[A-Z][.)]\s+/, "").replace(/\s+/g, " ").trim(), level: 2 };
  return undefined;
}

function blockEnd(lines: string[], start: number): number {
  for (let i = start; i < lines.length; i++) if (headingBlock(lines[i])) return i;
  return lines.length;
}

function authorsFromContent(lines: string[], beforeIdx: number): { authors: string[]; affiliation: string } {
  const authors: string[] = [];
  const affiliationParts: string[] = [];
  for (let i = 0; i < Math.max(0, beforeIdx); i++) {
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

function romanize(num: number): string {
  let n = Math.max(0, Math.floor(num));
  if (!n) return String(num);
  const map: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

function para(text: string, o: { align?: any; after?: number; indent?: any; bold?: boolean; italic?: boolean; size?: number; color?: string } = {}) {
  return new Paragraph({
    alignment: o.align,
    spacing: { after: (o.after ?? 6) * 20, before: 0 },
    indent: o.indent,
    children: [new TextRun({ text, bold: !!o.bold, italics: !!o.italic, size: (o.size ?? 10) * 2, font: BODY_FONT, color: o.color })],
  });
}

function refPara(i: number, raw: string, size: number) {
  return new Paragraph({
    spacing: { after: 3 * 20 },
    indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) },
    children: [new TextRun({ text: `[${i}] ${raw}`, size: size * 2, font: BODY_FONT })],
  });
}

type BodySection = { heading?: string; level: 1 | 2; paras: string[] };

function writeSections(sections: BodySection[], bodySize: number, out: Paragraph[]) {
  let n1 = 0;
  let n2 = 0;
  for (const sec of sections) {
    if (sec.level === 1) { n1 += 1; n2 = 0; } else { n2 += 1; }
    if (sec.heading) {
      if (sec.level === 1) {
        out.push(para(`${romanize(n1)}.  ${sec.heading.toUpperCase()}`, { size: bodySize + 1, bold: true, after: 4 }));
      } else {
        out.push(para(`${n1}.${n2}  ${sec.heading}`, { size: bodySize, bold: true, italic: true, after: 3 }));
      }
    }
    for (const p of sec.paras) {
      out.push(para(p, { size: bodySize, align: AlignmentType.JUSTIFIED, after: 6, indent: { firstLine: convertInchesToTwip(0.2) } }));
    }
  }
}

export async function generateIeeeDocx(content: string, meta: IeeeMeta = {}): Promise<Buffer> {
  const text = (content || "").replace(/\r\n?/g, "\n").slice(0, MAX_CONTENT_CHARS);
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const first = firstParagraph(text);
  const title = ((meta.title && meta.title.trim()) || first || "Untitled research paper").trim().slice(0, 300);

  const absHeadingIdx = lines.findIndex((l) => /^abstract\b/i.test(l));
  const authorInfo =
    meta.authors && meta.authors.length
      ? { authors: meta.authors.map((a) => String(a).trim()).filter(Boolean).slice(0, 20), affiliation: "" }
      : authorsFromContent(lines, absHeadingIdx >= 0 ? absHeadingIdx : lines.length);

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
            if (raw) out.push(...raw.split(/[,;]+/).map((x) => x.trim()).filter(Boolean));
            const end = blockEnd(lines, kwIdx + 1);
            for (let i = kwIdx + 1; i < end; i++) out.push(...lines[i].split(/[,;]+/).map((x) => x.trim()).filter(Boolean));
          }
          return out;
        })();

  const abstract =
    (meta.abstract && meta.abstract.trim()) ||
    (absHeadingIdx >= 0 ? lines.slice(absHeadingIdx + 1, blockEnd(lines, absHeadingIdx + 1)).join(" ").trim() : firstParagraph(text));

  const kwIdx = lines.findIndex((l) => /^(keywords?|index\s+terms?)\b/i.test(l));
  const absEnd = absHeadingIdx >= 0 ? blockEnd(lines, absHeadingIdx + 1) : 0;
  const kwEnd = kwIdx >= 0 ? blockEnd(lines, kwIdx + 1) : absEnd;
  const bodyStart = Math.max(absEnd, kwEnd, 0);

  const bodySections: BodySection[] = [];
  let cur: BodySection = { level: 1, paras: [] };
  const flush = () => { if (cur.heading || cur.paras.length) bodySections.push(cur); cur = { level: 1, paras: [] }; };

  for (const line of lines.slice(bodyStart)) {
    const hb = headingBlock(line);
    if (hb) { flush(); cur = { heading: hb.text, level: hb.level, paras: [] }; }
    else cur.paras.push(line);
  }
  flush();

  // If no headings detected, put remaining content as a single section.
  if (bodySections.length === 0) {
    const fallback = lines.slice(bodyStart).join("\n").trim() || text.slice(0, 2000);
    bodySections.push({ heading: "Introduction", level: 1, paras: fallback.split(/\n+/).map((s) => s.trim()).filter(Boolean) });
  }

  const refs = bodySections.filter((s) => /^references?|bibliography$/i.test(s.heading || ""));
  const contentSections = bodySections.filter((s) => !/^references?|bibliography$/i.test(s.heading || ""));

  const titleBlock: Paragraph[] = [para(title, { size: 24, align: AlignmentType.CENTER, after: 8 })];
  if (authors.length) titleBlock.push(para(authors.join(",  "), { size: 11, align: AlignmentType.CENTER, after: 2 }));
  if (affiliation) titleBlock.push(para(affiliation, { size: 10, italic: true, align: AlignmentType.CENTER, after: 2 }));

  const body: Paragraph[] = [];
  if (abstract) {
    body.push(new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: "Abstract—", bold: true, italics: true, size: 18, font: BODY_FONT }),
        new TextRun({ text: abstract, italics: true, size: 18, font: BODY_FONT }),
      ],
    }));
  }
  if (keywords.length) {
    body.push(new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: "Index Terms—", bold: true, italics: true, size: 18, font: BODY_FONT }),
        new TextRun({ text: keywords.join(", "), italics: true, size: 18, font: BODY_FONT }),
      ],
    }));
  }

  writeSections(contentSections, 10, body);

  const refLines = refs.flatMap((s) => s.paras);
  if (refLines.length) {
    body.push(para("REFERENCES", { size: 11, bold: true, after: 4 }));
    refLines.forEach((r, i) => body.push(refPara(i + 1, r.replace(/^\[\d+\]\s*/, ""), 9)));
  }

  const margin = { top: 1080, bottom: 1080, left: 900, right: 900 }; // 0.75in, 0.625in
  const doc = new Document({
    creator: "ResearchLens AI",
    title,
    sections: [
      { properties: { page: { size: { width: 12240, height: 15840 }, margin } }, children: titleBlock },
      { properties: { type: SectionType.CONTINUOUS, column: { count: 2, space: 360 }, page: { margin } }, children: body },
    ],
  });

  return await Packer.toBuffer(doc);
}
