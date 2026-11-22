/* Adapted from PaperForge (MIT License). Original Copyright (c) PaperForge contributors. */
/* ResearchLens AI — browser app.
 * A JavaScript port of the Python package's humanizer, parser, and renderers,
 * so the whole thing runs client-side on GitHub Pages (no server, no upload).
 *
 * Sections below mirror the Python modules:
 *   HUMANIZER  <- researchlens-ai/humanizer.py
 *   PARSER     <- researchlens-ai/parsers/*  (heuristics + text/docx readers)
 *   LATEX      <- researchlens-ai/renderers/latex_render.py
 *   DOCX       <- researchlens-ai/renderers/docx_render.py  (via docx.js)
 *   UI         <- the Tkinter GUI, as a web page
 */
(function () {
  "use strict";

  /* =======================================================================
   * HUMANIZER
   * ===================================================================== */
  const PHRASE_MAP = [
    ["it is important to note that", ""], ["it is worth noting that", ""],
    ["it should be noted that", ""], ["it is worth mentioning that", ""],
    ["needless to say,", ""], ["as a matter of fact,", ""],
    ["at the end of the day,", ""], ["when it comes to", "for"],
    ["in order to", "to"], ["due to the fact that", "because"],
    ["owing to the fact that", "because"], ["in light of the fact that", "because"],
    ["in the event that", "if"], ["in the event of", "if there is"],
    ["for the purpose of", "to"], ["with the aim of", "to"],
    ["a large number of", "many"], ["a significant number of", "many"],
    ["a wide range of", "many"], ["a plethora of", "many"],
    ["a myriad of", "many"], ["a majority of", "most"],
    ["the vast majority of", "most"], ["a small number of", "a few"],
    ["plays a crucial role in", "is central to"],
    ["plays a vital role in", "is central to"],
    ["plays a key role in", "is central to"],
    ["plays a significant role in", "matters in"],
    ["in the realm of", "in"], ["in the world of", "in"],
    ["with regard to", "about"], ["with respect to", "about"],
    ["in terms of", "for"], ["prior to", "before"], ["subsequent to", "after"],
    ["in conclusion,", ""], ["in summary,", ""], ["to summarize,", ""],
    ["first and foremost,", "first,"], ["last but not least,", "finally,"],
    ["a testament to", "proof of"], ["stands as a testament to", "shows"],
    ["paving the way for", "enabling"], ["paves the way for", "enables"],
    ["the ever-evolving", "the changing"], ["ever-evolving", "changing"],
    ["an integral part of", "a key part of"],
    ["in today's fast-paced world,", ""], ["in today's digital age,", ""],
    ["it goes without saying that", ""],
  ];

  const WORD_MAP = [
    ["utilize", "use"], ["utilizes", "uses"], ["utilized", "used"],
    ["utilizing", "using"], ["utilization", "use"],
    ["leverage", "use"], ["leverages", "uses"], ["leveraging", "using"],
    ["facilitate", "help"], ["facilitates", "helps"], ["facilitated", "helped"],
    ["facilitating", "helping"],
    ["delve", "look"], ["delves", "looks"], ["delving", "looking"],
    ["commence", "start"], ["commences", "starts"], ["commenced", "started"],
    ["endeavor", "try"], ["endeavors", "tries"], ["ascertain", "find out"],
    ["demonstrate", "show"], ["demonstrates", "shows"], ["demonstrated", "showed"],
    ["subsequently", "then"], ["furthermore", "also"], ["moreover", "also"],
    ["additionally", "also"], ["consequently", "so"], ["therefore", "so"],
    ["nevertheless", "still"], ["nonetheless", "still"],
    ["approximately", "about"], ["numerous", "many"], ["myriad", "many"],
    ["plethora", "plenty"], ["pivotal", "key"], ["crucial", "key"],
    ["paramount", "key"], ["robust", "strong"], ["seamless", "smooth"],
    ["seamlessly", "smoothly"], ["comprehensive", "complete"],
    ["intricate", "complex"], ["multifaceted", "complex"],
    ["realm", "area"], ["landscape", "area"], ["underscore", "highlight"],
    ["underscores", "highlights"], ["underscored", "highlighted"],
    ["showcase", "show"], ["showcases", "shows"], ["showcasing", "showing"],
    ["encompass", "include"], ["encompasses", "includes"],
    ["elucidate", "explain"], ["elucidates", "explains"],
    ["ameliorate", "improve"], ["optimal", "best"],
    ["aforementioned", "above"], ["henceforth", "from now on"],
  ];

  const FILLER_WORDS = [
    "very", "really", "quite", "actually", "basically", "essentially",
    "literally", "simply", "just", "definitely", "certainly", "arguably",
    "notably", "interestingly", "importantly",
  ];

  const CONTRACTIONS = [
    ["do not", "don't"], ["does not", "doesn't"], ["did not", "didn't"],
    ["is not", "isn't"], ["are not", "aren't"], ["was not", "wasn't"],
    ["were not", "weren't"], ["has not", "hasn't"], ["have not", "haven't"],
    ["had not", "hadn't"], ["will not", "won't"], ["would not", "wouldn't"],
    ["can not", "can't"], ["cannot", "can't"], ["could not", "couldn't"],
    ["should not", "shouldn't"], ["it is", "it's"], ["that is", "that's"],
    ["there is", "there's"], ["they are", "they're"], ["we are", "we're"],
    ["you are", "you're"], ["we will", "we'll"], ["they will", "they'll"],
    ["we have", "we've"], ["they have", "they've"],
  ];

  function optionsForLevel(level) {
    if (level === "light")
      return { vocab: true, filler: false, contractions: false, split: false };
    if (level === "strong")
      return { vocab: true, filler: true, contractions: true, split: true };
    return { vocab: true, filler: true, contractions: false, split: true };
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function matchCase(original, repl) {
    if (!repl) return repl;
    const c = original.charAt(0);
    if (c === c.toUpperCase() && c !== c.toLowerCase())
      return repl.charAt(0).toUpperCase() + repl.slice(1);
    return repl;
  }

  function applyPhrases(text, counter) {
    for (const [phrase, repl] of PHRASE_MAP) {
      const re = new RegExp(escapeRegex(phrase).replace(/ /g, "\\s+"), "gi");
      text = text.replace(re, (m) => { counter.n++; return repl ? matchCase(m, repl) : ""; });
    }
    return text;
  }

  function applyWords(text, mapping, counter) {
    for (const [word, repl] of mapping) {
      const re = new RegExp("\\b" + escapeRegex(word) + "\\b", "gi");
      text = text.replace(re, (m) => { counter.n++; return matchCase(m, repl); });
    }
    return text;
  }

  function removeFiller(text, counter) {
    for (const word of FILLER_WORDS) {
      const re = new RegExp("\\b" + escapeRegex(word) + "\\b\\s?", "gi");
      text = text.replace(re, () => { counter.n++; return ""; });
    }
    return text;
  }

  function splitLongSentences(text, maxWords, counter) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const out = [];
    for (let s of sentences) {
      if (s.split(/\s+/).length > maxWords && s.includes("; ")) {
        let parts = s.split("; ").map((p) => p.trim()).filter(Boolean);
        parts = parts.map((p) => (/[.!?]$/.test(p) ? p : p + "."));
        parts = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1));
        counter.n += parts.length - 1;
        out.push(parts.join(" "));
      } else out.push(s);
    }
    return out.join(" ");
  }

  function cleanup(text) {
    text = text.replace(/[ \t]{2,}/g, " ");
    text = text.replace(/\s+([,.;:!?])/g, "$1");
    text = text.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
    text = text.replace(/,\s*,/g, ",");
    text = text.trim();
    text = text.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
    return text.trim();
  }

  function humanizeText(text, level, opts) {
    if (text == null) text = "";
    opts = opts || optionsForLevel(level);
    const counter = { n: 0 };
    if (opts.vocab) {
      text = applyPhrases(text, counter);
      text = applyWords(text, WORD_MAP, counter);
    }
    if (opts.contractions) text = applyWords(text, CONTRACTIONS, counter);
    if (opts.filler) text = removeFiller(text, counter);
    if (opts.split) text = splitLongSentences(text, 32, counter);
    text = cleanup(text);
    return { text: text, changes: counter.n };
  }

  /* =======================================================================
   * PARSER  (heuristics + readers)
   * ===================================================================== */
  const ABSTRACT_RE = /^\s*abstract\b[\s:.\-—]*/i;
  const KEYWORDS_RE = /^\s*(keywords|key words|index terms)\b[\s:.\-—]*/i;
  const REFERENCES_RE = /^\s*(references|bibliography)\s*$/i;
  const REFERENCES_START_RE = /^\s*(references|bibliography)\b[\s:.\-—]*/i;
  const AFFIL_KEYWORDS_RE = /\b(university|department|dept\.?|institute|laborator|school|college|faculty|centre|center|academy|hospital|corporation|company|inc\.?|ltd\.?)/i;
  const NUM_HEADING_RE = /^\s*(?:(\d+(?:\.\d+)*)\.?|([IVXLC]+)\.|([A-Z])\.)\s+(\S.*)$/;
  const REF_ITEM_RE = /^\s*(?:\[(\d+)\]|(\d+)\.)\s+/;

  function isTitleCase(s) {
    let foundCased = false, prevCased = false, ok = true;
    for (const ch of s) {
      if (/[a-zA-Z]/.test(ch)) {
        const upper = ch === ch.toUpperCase();
        if (!prevCased) { if (!upper) { ok = false; break; } foundCased = true; }
        else if (upper) { ok = false; break; }
        prevCased = true;
      } else prevCased = false;
    }
    return ok && foundCased;
  }

  function looksLikeHeading(text) {
    const t = (text || "").trim();
    if (!t || t.length > 120) return null;
    const m = NUM_HEADING_RE.exec(t);
    if (m) {
      if (m[1]) return m[1].split(".").length;
      if (m[3]) return 2; // A. B. C. subsections
      // Roman numeral - but single chars C,I,V,X can be letter subsections
      if (m[2] && m[2].length === 1 && /[A-Z]/.test(m[2])) {
        const title = m[4] || "";
        const hasLetter = /[a-zA-Z]/.test(title);
        const isAllCaps = hasLetter && title === title.toUpperCase();
        if (!isAllCaps) return 2;
      }
      return 1;
    }
    if (t.split(/\s+/).length <= 10 && !/[.,;:]$/.test(t)) {
      const hasLetter = /[a-zA-Z]/.test(t);
      const isUpper = t === t.toUpperCase() && hasLetter;
      if (hasLetter && (isUpper || isTitleCase(t))) return 1;
    }
    return null;
  }

  function stripHeadingNumber(text) {
    const m = NUM_HEADING_RE.exec(text.trim());
    return m ? m[4].trim() : text.trim();
  }

  function splitReferences(blob) {
    const refs = [];
    let parts;
    if (/\[\d+\]/.test(blob)) parts = blob.split(/(?=\[\d+\])/);
    else parts = blob.split(/(?=^\s*\d+\.\s)/m);
    let i = 0;
    for (let part of parts) {
      part = part.trim();
      if (!part) continue;
      const clean = part.replace(REF_ITEM_RE, "").trim();
      refs.push({ raw: clean, key: "ref" + (++i) });
    }
    return refs;
  }

  function normalizeLevels(sections, depth) {
    for (const sec of sections) {
      sec.level = depth;
      normalizeLevels(sec.children, depth + 1);
    }
  }

  function buildPaper(blocks) {
    const paper = { title: "", authors: [], abstract: "", keywords: [],
                    sections: [], references: [], warnings: [] };
    blocks = blocks.filter((b) => b.text && b.text.trim());
    if (!blocks.length) { paper.warnings.push("No readable text found."); return paper; }

    let i = 0; const n = blocks.length;
    paper.title = blocks[0].text.trim().replace(/^(title|paper\s*title)\s*[:\-–—]\s*/i, "").trim(); i = 1;

    const authorLines = [];
    while (i < n && !ABSTRACT_RE.test(blocks[i].text)) {
      const t = blocks[i].text.trim();
      if (REFERENCES_RE.test(t) || NUM_HEADING_RE.test(t)) break;
      if (/^(keywords?|index\s*terms?)\b/i.test(t)) break;
      if (authorLines.length && looksLikeHeading(t)) break;
      authorLines.push(t); i++;
      if (authorLines.length >= 6) break;
    }
    const cleanAuthorLines = authorLines
      .map((l) => l.replace(/^(authors?|author\s*names?|by)\s*[:\-–—]\s*/i, "").trim())
      .filter((l) => l && !/^(authors?|author\s*names?)$/i.test(l));
    if (cleanAuthorLines.length) {
      const first = cleanAuthorLines[0];
      let namePart = first, gluedAffil = "";
      const m = AFFIL_KEYWORDS_RE.exec(first);
      if (m) { namePart = first.slice(0, m.index).replace(/[ ,;]+$/, ""); gluedAffil = first.slice(m.index).trim(); }
      const names = namePart.split(/,|;|\band\b/).map((nm) => nm.trim()).filter(Boolean);
      const looksAffil = (s) => AFFIL_KEYWORDS_RE.test(s) || /@/.test(s) || /\b(india|usa|uk|germany|china|university|institute|college|department|school|lab|laboratory)\b/i.test(s);
      if (names.length === 1 && looksAffil(names[0])) {
        paper.authors.push({ name: names[0], affiliation: "", email: "" });
      } else {
        for (const nm of names) paper.authors.push({ name: nm, affiliation: "", email: "" });
      }
      const affil = [gluedAffil].concat(cleanAuthorLines.slice(1)).join(" ").trim();
      if (affil && paper.authors.length) paper.authors.forEach((a) => (a.affiliation = affil));
      // If we accidentally put the only name as affiliation-like, try to recover
      if (paper.authors.length === 1 && /^authors?$/i.test(paper.authors[0].name)) paper.authors = [];
    }

    if (i < n && ABSTRACT_RE.test(blocks[i].text)) {
      let abs = blocks[i].text.replace(ABSTRACT_RE, "").trim(); i++;
      while (i < n) {
        const t = blocks[i].text.trim();
        if (KEYWORDS_RE.test(t) || looksLikeHeading(t) || REFERENCES_RE.test(t)) break;
        abs += (abs ? "\n\n" : "") + t; i++;
      }
      paper.abstract = abs.trim();
    }

    if (i < n && KEYWORDS_RE.test(blocks[i].text)) {
      const kw = blocks[i].text.replace(KEYWORDS_RE, "").trim().replace(/\.$/, "");
      paper.keywords = kw.split(/[,;]/).map((k) => k.trim()).filter(Boolean); i++;
    }

    let current = null, parentStack = [], refMode = false; const refBlob = [];
    for (; i < n; i++) {
      const b = blocks[i]; const t = b.text.trim();
      if (!refMode && REFERENCES_START_RE.test(t)) {
        refMode = true;
        const remainder = t.replace(REFERENCES_START_RE, "").trim();
        if (remainder) refBlob.push(remainder);
        continue;
      }
      if (refMode) { refBlob.push(t); continue; }

      const level = (b.level && b.level > 0) ? b.level : looksLikeHeading(t);
      if (level) {
        const sec = { title: stripHeadingNumber(t), level: level, paragraphs: [], children: [] };
        if (level === 1 || !parentStack.length) { paper.sections.push(sec); parentStack = [sec]; }
        else {
          while (parentStack.length && parentStack[parentStack.length - 1].level >= level) parentStack.pop();
          (parentStack.length ? parentStack[parentStack.length - 1].children : paper.sections).push(sec);
          parentStack.push(sec);
        }
        current = sec;
      } else {
        if (!current) { current = { title: "Introduction", level: 1, paragraphs: [], children: [] }; paper.sections.push(current); parentStack = [current]; }
        current.paragraphs.push(t);
      }
    }
    if (refBlob.length) paper.references = splitReferences(refBlob.join("\n"));
    normalizeLevels(paper.sections, 1);

    if (!paper.abstract) paper.warnings.push("No abstract detected.");
    if (!paper.sections.length) paper.warnings.push("No sections detected.");
    if (!paper.references.length) paper.warnings.push("No references detected.");
    return paper;
  }

  // --- readers ---
  function markdownLevel(line) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    return m ? { level: m[1].length, title: m[2].trim() } : null;
  }

  function stripLatex(src) {
    return src
      .replace(/(?<!\\)%.*$/gm, "")
      .replace(/\\(textbf|textit|emph|texttt|section|subsection|title|author)\*?\{([^}]*)\}/g, "$2")
      .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
      .replace(/[{}]/g, " ");
  }

  function splitCollapsedPaper(raw) {
    const t = (raw || "").replace(/\r\n?/g, "\n").trim();
    if (!t) return t;
    const nl = (t.match(/\n/g) || []).length;
    if (nl >= 8) return t; // already has structure
    let s = t;
    const major = [
      /(?=(?:\b|(?<=[a-z]))Title\s*[:\-–—]\s*)/gi,
      /(?=(?:\b|(?<=[a-z]))Authors?\s*[:\-–—]\s*)/gi,
      /(?=(?:\b|(?<=[a-z]))Abstract\s*[—–\-:]\s*)/gi,
      /(?=(?:\b|(?<=[a-z]))Keywords?\s*[—–\-:]\s*)/gi,
      /(?=(?:\b|(?<=[a-z]))Index\s+Terms?\s*[—–\-:]\s*)/gi,
      /(?=(?:\b|(?<=[a-z]))(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s+[A-Z])/g,
      /(?=(?:\b|(?<=[a-z]))REFERENCES\b)/g,
      /(?=\[\d+\]\s+[A-Z])/g
    ];
    for (const re of major) s = s.replace(re, "\n\n");
    // Split letter subheadings only before REFERENCES
    const refIdx = s.search(/\n\nREFERENCES\b/);
    const splitSubs = (part) => part.replace(/(?=(?:\b|(?<=[a-z.:;]))[A-D]\.\s+[A-Z][a-z])/g, "\n\n");
    if (refIdx >= 0) s = splitSubs(s.slice(0, refIdx)) + s.slice(refIdx);
    else s = splitSubs(s);
    s = s.replace(/\s*(Department of [A-Z])/g, "\n$1");
    s = s.replace(/((?:Engineering|University|Institute|College|Technology|Science|Sciences|Research))([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z])/g, "$1\n$2");
    // Split glued colon-labeled list/table items: "...status.Behavioral and Contextual Telemetry: ..."
    s = s.replace(/([.;\):])(?=[A-Z][A-Za-z\s/\-]{2,45}:)/g, "$1\n\n");
    // Separate glued heading from body: "I. INTRODUCTIONFor decades..." -> heading + body
    s = s.replace(/^((?:I{1,3}|IV|V|VI{0,3}|IX|X)\.\s+[A-Z][A-Z\s/&\-:]{2,})([A-Z][a-z].+|[A-Z]\s.+)$/gm, "$1\n\n$2");
    s = s.replace(/^([A-D]\.\s+[^\n]{5,})$/gm, (line) => {
      // Split glued body: ")Together..." or "AccessMicro-segmentation divides..."
      let m = line.match(/^([A-D]\.\s+.+?\))([A-Z][a-z].+)$/);
      if (m) return m[1] + "\n\n" + m[2];
      m = line.match(/^([A-D]\.\s+.{10,}?[a-z])([A-Z][a-z]+[\s\-][a-z].+)$/);
      if (m) return m[1] + "\n\n" + m[2];
      m = line.match(/^([A-D]\.\s+[A-Z][A-Z\s/&\-:]{2,})([A-Z][a-z].+)$/);
      if (m) return m[1] + "\n\n" + m[2];
      return line;
    });
    s = s.replace(/\n{3,}/g, "\n\n").trim();
    return s;
  }

  function textToBlocks(raw, isLatex) {
    if (isLatex) raw = stripLatex(raw);
    raw = splitCollapsedPaper(raw);
    const blocks = [];
    for (let chunk of raw.split(/\n\s*\n/)) {
      chunk = chunk.replace(/^\n+|\n+$/g, "");
      if (!chunk.trim()) continue;
      const md = markdownLevel(chunk.trim());
      if (md && !chunk.trim().includes("\n")) { blocks.push({ text: md.title, level: md.level }); continue; }
      const lines = chunk.split("\n");
      const firstLine = lines[0].trim();
      const head = markdownLevel(firstLine);
      // A chunk often holds a heading immediately followed (next line) by its
      // body — common when pasting a thesis. Split the leading heading line off
      // so chapters are detected instead of being glued into one paragraph.
      const headingLevel = head ? head.level
        : (lines.length > 1 ? looksLikeHeading(firstLine) : null);
      if (head) {
        blocks.push({ text: head.title, level: head.level });
        const body = lines.slice(1).join("\n").trim();
        if (body) blocks.push({ text: body.replace(/\n/g, " ").trim(), level: 0 });
      } else if (headingLevel) {
        blocks.push({ text: firstLine, level: headingLevel });
        const body = lines.slice(1).join("\n").trim();
        if (body) blocks.push({ text: body.replace(/\n/g, " ").trim(), level: 0 });
      } else blocks.push({ text: chunk.replace(/\n/g, " ").trim(), level: 0 });
    }
    return blocks;
  }

  function htmlToBlocks(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    const blocks = [];
    for (const el of div.children) {
      const text = (el.textContent || "").trim();
      if (!text) continue;
      const tag = el.tagName.toLowerCase();
      const hm = /^h([1-6])$/.exec(tag);
      blocks.push({ text: text, level: hm ? parseInt(hm[1], 10) : 0 });
    }
    if (!blocks.some((b) => b.level)) blocks.forEach((b) => (b.level = 0));
    return blocks;
  }

  async function readFileToPaper(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".docx")) {
      const buf = await file.arrayBuffer();
      const res = await mammoth.convertToHtml({ arrayBuffer: buf });
      return buildPaper(htmlToBlocks(res.value));
    }
    const text = await file.text();
    const blocks = textToBlocks(text, name.endsWith(".tex"));
    const paper = buildPaper(blocks);
    if (!paper.title) paper.title = file.name.replace(/\.[^.]+$/, "");
    return paper;
  }

  function extractParagraphs(paper) {
    const out = [];
    if (paper.abstract) out.push(paper.abstract);
    (function walk(secs) {
      for (const s of secs) { s.paragraphs.forEach((p) => out.push(p)); walk(s.children); }
    })(paper.sections);
    return out;
  }

  /* =======================================================================
   * LATEX RENDERER
   * ===================================================================== */
  const TEX_ESCAPES = { "\\": "\\textbackslash{}", "&": "\\&", "%": "\\%", "$": "\\$",
    "#": "\\#", "_": "\\_", "{": "\\{", "}": "\\}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}" };
  function texEsc(t) { return (t || "").split("").map((c) => TEX_ESCAPES[c] || c).join(""); }

  function texSections(sections, lines) {
    const cmd = { 1: "section", 2: "subsection", 3: "subsubsection" };
    for (const sec of sections) {
      lines.push("\\" + (cmd[sec.level] || "section") + "{" + texEsc(sec.title) + "}");
      for (const p of sec.paragraphs) { lines.push(texEsc(p)); lines.push(""); }
      if (sec.children.length) texSections(sec.children, lines);
    }
  }

  function renderLatex(paper, publisher) {
    const L = [];
    const bib = (width) => {
      if (!paper.references.length) return;
      L.push("\\begin{thebibliography}{" + width + "}");
      paper.references.forEach((r, i) => L.push("\\bibitem{" + (r.key || "ref" + (i + 1)) + "} " + texEsc(r.raw)));
      L.push("\\end{thebibliography}");
    };
    if (publisher === "ieee") {
      L.push("\\documentclass[conference]{IEEEtran}", "\\IEEEoverridecommandlockouts",
        "\\usepackage{cite,amsmath,amssymb,amsfonts,graphicx,textcomp,xcolor}",
        "\\begin{document}", "\\title{" + texEsc(paper.title) + "}");
      if (paper.authors.length) {
        const blocks = paper.authors.map((a) => {
          let b = "\\IEEEauthorblockN{" + texEsc(a.name) + "}";
          if (a.affiliation) b += "\n\\IEEEauthorblockA{" + texEsc(a.affiliation) + "}";
          return b;
        });
        L.push("\\author{" + blocks.join("\n\\and\n") + "}");
      }
      L.push("\\maketitle");
      if (paper.abstract) L.push("\\begin{abstract}\n" + texEsc(paper.abstract) + "\n\\end{abstract}");
      if (paper.keywords.length) L.push("\\begin{IEEEkeywords}\n" + texEsc(paper.keywords.join(", ")) + "\n\\end{IEEEkeywords}");
      texSections(paper.sections, L); bib("9"); L.push("\\end{document}");
    } else if (publisher === "springer") {
      L.push("\\documentclass[runningheads]{llncs}", "\\usepackage{graphicx,amsmath,amssymb}",
        "\\begin{document}", "\\title{" + texEsc(paper.title) + "}");
      if (paper.authors.length) {
        L.push("\\author{" + paper.authors.map((a) => texEsc(a.name)).join(" \\and ") + "}");
        const affils = [...new Set(paper.authors.map((a) => a.affiliation).filter(Boolean))];
        L.push("\\institute{" + (affils.map(texEsc).join("\\and ") || "Affiliation") + "}");
      }
      L.push("\\maketitle");
      if (paper.abstract) {
        let kw = paper.keywords.length ? "\n\\keywords{" + paper.keywords.map(texEsc).join(" \\and ") + "}" : "";
        L.push("\\begin{abstract}\n" + texEsc(paper.abstract) + kw + "\n\\end{abstract}");
      }
      texSections(paper.sections, L); bib("8"); L.push("\\end{document}");
    } else {
      L.push("\\documentclass[preprint,12pt]{elsarticle}", "\\usepackage{graphicx,amsmath,amssymb,lineno}",
        "\\journal{Journal Name}", "\\begin{document}", "\\begin{frontmatter}",
        "\\title{" + texEsc(paper.title) + "}");
      paper.authors.forEach((a) => { L.push("\\author{" + texEsc(a.name) + "}"); if (a.affiliation) L.push("\\address{" + texEsc(a.affiliation) + "}"); });
      if (paper.abstract) L.push("\\begin{abstract}\n" + texEsc(paper.abstract) + "\n\\end{abstract}");
      if (paper.keywords.length) L.push("\\begin{keyword}\n" + paper.keywords.map(texEsc).join(" \\sep ") + "\n\\end{keyword}");
      L.push("\\end{frontmatter}", "\\linenumbers");
      texSections(paper.sections, L); bib("00"); L.push("\\end{document}");
    }
    return L.join("\n") + "\n";
  }

  /* =======================================================================
   * PDF RENDERER  (print-to-PDF: styled HTML + window.print())
   * ===================================================================== */
  function htmlEsc(t) {
    return (t || "").replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function pdfSections(sections, numbering, prefix) {
    let html = "";
    sections.forEach((sec, idx) => {
      const num = prefix + (idx + 1);
      if (sec.level === 1) {
        const h = numbering === "roman"
          ? romanize(num) + ".&nbsp;&nbsp;" + htmlEsc(sec.title.toUpperCase())
          : num + "&nbsp;&nbsp;" + htmlEsc(sec.title);
        html += '<h2 class="lvl1">' + h + "</h2>";
      } else {
        html += '<h3 class="lvln">' + num + "&nbsp;&nbsp;" + htmlEsc(sec.title) + "</h3>";
      }
      for (const p of sec.paragraphs) html += '<p class="body">' + htmlEsc(p) + "</p>";
      if (sec.children.length) html += pdfSections(sec.children, numbering, num + ".");
    });
    return html;
  }

  function pdfRefs(refs) {
    if (!refs.length) return "";
    let h = '<h2 class="lvl1 refs-h">REFERENCES</h2><ol class="refs">';
    refs.forEach((r) => (h += "<li>" + htmlEsc(r.raw) + "</li>"));
    return h + "</ol>";
  }

  function renderPdfDoc(paper, publisher, docTitle) {
    const numbering = publisher === "ieee" ? "roman" : "arabic";
    const authors = paper.authors.map((a) => a.name).join(",&nbsp;&nbsp;");
    const affils = [...new Set(paper.authors.map((a) => a.affiliation).filter(Boolean))];

    let css, header, content;
    if (publisher === "ieee") {
      css = `
        @page { size: letter; margin: 0.75in 0.6in; }
        body { font-family:"Times New Roman",Times,serif; font-size:10pt; line-height:1.25; margin:0; }
        .header { text-align:center; margin-bottom:12pt; }
        .title { font-size:20pt; font-weight:bold; margin:0 0 8pt; }
        .authors { font-size:11pt; margin:0 0 2pt; }
        .affil { font-size:10pt; font-style:italic; margin:0 0 2pt; }
        .content { column-count:2; column-gap:0.25in; text-align:justify; }
        .abstract, .keywords { font-style:italic; margin:0 0 6pt; }
        .abstract b, .keywords b { font-weight:bold; font-style:italic; }
        h2.lvl1 { font-size:10pt; font-weight:bold; text-align:center; font-variant:small-caps; margin:8pt 0 4pt; break-after:avoid; }
        h3.lvln { font-size:10pt; font-style:italic; margin:6pt 0 3pt; break-after:avoid; }
        p.body { margin:0 0 6pt; text-indent:0.2in; }
        ol.refs { font-size:9pt; margin:0; padding-left:1.4em; } ol.refs li { margin:0 0 3pt; }
        h2.refs-h { font-variant:normal; }`;
    } else if (publisher === "springer") {
      css = `
        @page { size: A4; margin: 1in 1.2in; }
        body { font-family:"Times New Roman",Times,serif; font-size:10pt; line-height:1.3; margin:0; }
        .header { margin-bottom:10pt; }
        .title { font-size:16pt; font-weight:bold; margin:0 0 8pt; }
        .authors { font-size:11pt; margin:0 0 2pt; }
        .affil { font-size:9pt; font-style:italic; margin:0 0 8pt; }
        .content { text-align:justify; }
        .abstract { font-size:9pt; margin:0 0 4pt 0.4in; padding-right:0.4in; }
        .keywords { font-size:9pt; margin:0 0 10pt 0.4in; }
        h2.lvl1 { font-size:11pt; font-weight:bold; margin:10pt 0 4pt; break-after:avoid; }
        h3.lvln { font-size:10pt; font-weight:bold; font-style:italic; margin:6pt 0 3pt; break-after:avoid; }
        p.body { margin:0 0 6pt; text-indent:0.2in; }
        ol.refs { font-size:9pt; margin:0; padding-left:1.4em; } ol.refs li { margin:0 0 3pt; }`;
    } else {
      css = `
        @page { size: A4; margin: 1in; }
        body { font-family:"Times New Roman",Times,serif; font-size:12pt; line-height:1.4; margin:0; }
        .header { margin-bottom:12pt; }
        .title { font-size:18pt; font-weight:bold; margin:0 0 10pt; }
        .authors { font-size:12pt; margin:0; }
        .affil { font-size:10pt; font-style:italic; margin:0 0 2pt; }
        .abstract { margin:6pt 0; } .abstract b { font-weight:bold; }
        .keywords { margin:0 0 10pt; }
        .content { text-align:justify; }
        h2.lvl1 { font-size:13pt; font-weight:bold; margin:10pt 0 4pt; break-after:avoid; }
        h3.lvln { font-size:12pt; font-weight:bold; margin:6pt 0 3pt; break-after:avoid; }
        p.body { margin:0 0 6pt; }
        ol.refs { font-size:11pt; margin:0; padding-left:1.4em; } ol.refs li { margin:0 0 4pt; }`;
    }

    header = '<div class="header"><p class="title">' + htmlEsc(paper.title) + "</p>";
    if (authors) header += '<p class="authors">' + authors + "</p>";
    affils.forEach((af) => (header += '<p class="affil">' + htmlEsc(af) + "</p>"));
    header += "</div>";

    let body = "";
    if (paper.abstract) {
      const lead = publisher === "ieee" ? "Abstract&mdash;" : (publisher === "springer" ? "Abstract. " : "Abstract<br>");
      body += '<p class="abstract"><b>' + lead + "</b>" + htmlEsc(paper.abstract) + "</p>";
    }
    if (paper.keywords.length) {
      const lead = publisher === "ieee" ? "Index Terms&mdash;" : "Keywords: ";
      body += '<p class="keywords"><b>' + lead + "</b>" + htmlEsc(paper.keywords.join(", ")) + "</p>";
    }
    body += pdfSections(paper.sections, numbering, "");
    body += pdfRefs(paper.references);
    content = '<div class="content">' + body + "</div>";

    return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" +
      htmlEsc(docTitle) + "</title><style>" + css + "</style></head><body>" +
      header + content +
      "<script>window.onload=function(){setTimeout(function(){window.print();},150);};<\/script>" +
      "</body></html>";
  }

  /* =======================================================================
   * DOCX RENDERER  (docx.js)
   * ===================================================================== */
  function romanize(num) {
    let n = parseInt(String(num).split(".")[0], 10);
    if (isNaN(n)) return String(num);
    const map = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],
      [50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
    let out = "";
    for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
    return out;
  }

  async function ensureDocx() {
    if (window.docx && window.docx.Document) return window.docx;
    const srcs = [
      "https://unpkg.com/docx@8.5.0/build/index.umd.js",
      "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js"
    ];
    for (const src of srcs) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = src; s.async = true; s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
        if (window.docx && window.docx.Document) return window.docx;
      } catch {}
    }
    throw new Error("Word export library (docx.js) failed to load. Check your internet connection and try again.");
  }

  async function buildDocx(paper, publisher) {
    const D = await ensureDocx();
    const { Document, Packer, Paragraph, TextRun, AlignmentType, SectionType, convertInchesToTwip } = D;
    const FONT = "Times New Roman";

    function para(text, o) {
      o = o || {};
      return new Paragraph({
        alignment: o.align,
        spacing: { after: (o.after != null ? o.after : 6) * 20, before: 0 },
        indent: o.indent,
        children: [new TextRun({ text: text, bold: !!o.bold, italics: !!o.italic,
          size: (o.size || 10) * 2, font: FONT, color: o.color })],
      });
    }

    function refPara(i, raw, size) {
      return new Paragraph({
        spacing: { after: 3 * 20 },
        indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) },
        children: [new TextRun({ text: "[" + i + "] " + raw, size: size * 2, font: FONT })],
      });
    }

    function writeSections(sections, bodySize, numbering, prefix, out) {
      sections.forEach((sec, idx) => {
        const num = prefix + (idx + 1);
        if (sec.level === 1) {
          const h = numbering === "roman" ? romanize(num) + ".  " + sec.title.toUpperCase() : num + "  " + sec.title;
          out.push(para(h, { size: bodySize + 1, bold: true, after: 4 }));
        } else {
          out.push(para(num + "  " + sec.title, { size: bodySize, bold: true, italic: true, after: 3 }));
        }
        for (const p of sec.paragraphs)
          out.push(para(p, { size: bodySize, align: AlignmentType.JUSTIFIED, after: 6,
            indent: { firstLine: convertInchesToTwip(0.2) } }));
        if (sec.children.length) writeSections(sec.children, bodySize, numbering, num + ".", out);
      });
    }

    function refs(out, size) {
      if (!paper.references.length) return;
      out.push(para("REFERENCES", { size: size + 1, bold: true, after: 4 }));
      paper.references.forEach((r, i) => out.push(refPara(i + 1, r.raw, size)));
    }

    let sections;
    if (publisher === "ieee") {
      const titleBlock = [];
      titleBlock.push(para(paper.title, { size: 24, align: AlignmentType.CENTER, after: 8 }));
      if (paper.authors.length) {
        titleBlock.push(para(paper.authors.map((a) => a.name).join(",  "), { size: 11, align: AlignmentType.CENTER, after: 2 }));
        [...new Set(paper.authors.map((a) => a.affiliation).filter(Boolean))]
          .forEach((af) => titleBlock.push(para(af, { size: 10, italic: true, align: AlignmentType.CENTER, after: 2 })));
      }
      const body = [];
      if (paper.abstract) body.push(new Paragraph({ spacing: { after: 120 }, children: [
        new TextRun({ text: "Abstract—", bold: true, italics: true, size: 18, font: FONT }),
        new TextRun({ text: paper.abstract, italics: true, size: 18, font: FONT })] }));
      if (paper.keywords.length) body.push(new Paragraph({ children: [
        new TextRun({ text: "Index Terms—", bold: true, italics: true, size: 18, font: FONT }),
        new TextRun({ text: paper.keywords.join(", "), italics: true, size: 18, font: FONT })] }));
      writeSections(paper.sections, 10, "roman", "", body);
      refs(body, 9);
      const margin = { top: 1080, bottom: 1080, left: 900, right: 900 };
      sections = [
        { properties: { page: { size: { width: 12240, height: 15840 }, margin: margin } }, children: titleBlock },
        { properties: { type: SectionType.CONTINUOUS, column: { count: 2, space: 360 }, page: { margin: margin } }, children: body },
      ];
    } else if (publisher === "springer") {
      const out = [];
      out.push(para(paper.title, { size: 16, bold: true, after: 8 }));
      if (paper.authors.length) {
        out.push(para(paper.authors.map((a) => a.name).join(" and "), { size: 11, after: 2 }));
        [...new Set(paper.authors.map((a) => a.affiliation).filter(Boolean))]
          .forEach((af) => out.push(para(af, { size: 9, italic: true, after: 8 })));
      }
      if (paper.abstract) {
        out.push(para("Abstract.", { size: 9, bold: true, after: 0 }));
        out.push(para(paper.abstract, { size: 9, align: AlignmentType.JUSTIFIED, after: 4,
          indent: { left: convertInchesToTwip(0.4), right: convertInchesToTwip(0.4) } }));
      }
      if (paper.keywords.length)
        out.push(para("Keywords: " + paper.keywords.join(" · "), { size: 9, after: 10,
          indent: { left: convertInchesToTwip(0.4), right: convertInchesToTwip(0.4) } }));
      writeSections(paper.sections, 10, "arabic", "", out);
      refs(out, 9);
      sections = [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1728, right: 1728 } } }, children: out }];
    } else {
      const out = [];
      out.push(para(paper.title, { size: 18, bold: true, after: 10 }));
      paper.authors.forEach((a) => {
        out.push(para(a.name, { size: 12, after: 0 }));
        if (a.affiliation) out.push(para(a.affiliation, { size: 10, italic: true, after: 2 }));
      });
      if (paper.abstract) { out.push(para("Abstract", { size: 12, bold: true, after: 2 }));
        out.push(para(paper.abstract, { size: 11, align: AlignmentType.JUSTIFIED, after: 6 })); }
      if (paper.keywords.length) out.push(para("Keywords: " + paper.keywords.join(", "), { size: 11, after: 10 }));
      writeSections(paper.sections, 12, "arabic", "", out);
      refs(out, 11);
      sections = [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: out }];
    }

    const doc = new Document({ sections: sections });
    return Packer.toBlob(doc);
  }

  /* =======================================================================
   * THESIS -> ARTICLE
   * Maps a long thesis/dissertation into a short article skeleton and
   * condenses each section (extractive: keep the leading sentences of the
   * leading paragraphs). Pure client-side; no summarization model required.
   * An optional LLM hook mirrors the Python humanizer's set_llm_backend.
   * ===================================================================== */

  // Built-in target shapes. Order matters — it's the article's section order.
  const ARTICLE_TEMPLATES = {
    journal: {
      name: "Journal article",
      desc: "Standard research-paper shape for most journals.",
      sections: ["Introduction", "Related Work", "Methodology", "Results and Discussion", "Conclusion"],
    },
    conference: {
      name: "Conference paper",
      desc: "Compact, results-focused short paper.",
      sections: ["Introduction", "Related Work", "Method", "Results", "Conclusion"],
    },
    review: {
      name: "Review article",
      desc: "Survey / literature-review shape.",
      sections: ["Introduction", "Background", "Thematic Review", "Discussion", "Conclusion and Future Work"],
    },
  };

  // Canonical buckets a thesis chapter (or a target section title) maps to.
  // Leading \b + stem (no trailing \b) so inflections match: "introduc" hits
  // "Introduction"/"introductory", "result" hits "Results", etc.
  const SECTION_SYNONYMS = [
    { canon: "Introduction", re: /\b(introduc|overview|motivation|problem statement|aim|objective|scope)/i },
    { canon: "Related Work", re: /\b(literature|related work|background|prior work|state of the art|survey|review of|theoretical)/i },
    { canon: "Methodology", re: /\b(method|approach|material|experimental|design|implementation|propos|system|model|framework|algorithm|architecture|procedure)/i },
    { canon: "Results", re: /\b(result|finding|evaluation|experiment|performance|analysis|observation)/i },
    { canon: "Discussion", re: /\b(discussion|interpretation|implication|limitation|threat to validity)/i },
    { canon: "Conclusion", re: /\b(conclusion|concluding|summary|future work|future direction|recommendation|closing)/i },
  ];

  // How much survives per section, by strength.
  const CONDENSE = {
    light:  { sentencesPerPara: 3, maxParas: 6 },
    medium: { sentencesPerPara: 2, maxParas: 4 },
    strong: { sentencesPerPara: 1, maxParas: 2 },
  };

  let THESIS_LLM = null;            // optional async (text, level) => string
  function setThesisLLM(fn) { THESIS_LLM = fn; }

  function splitSentences(text) {
    return (text || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  }

  function classifyTitle(title) {
    for (const { canon, re } of SECTION_SYNONYMS) if (re.test(title || "")) return canon;
    return null;
  }

  // Depth-first collect every paragraph under a chapter (section + descendants).
  function collectParagraphs(section) {
    const out = section.paragraphs.slice();
    for (const child of section.children) {
      for (const p of collectParagraphs(child)) out.push(p);
    }
    return out;
  }

  // Extractive condense: keep the leading sentences of the leading paragraphs.
  function condenseParagraphs(paragraphs, level) {
    const cfg = CONDENSE[level] || CONDENSE.medium;
    const out = [];
    for (const p of paragraphs.slice(0, cfg.maxParas)) {
      const kept = splitSentences(p).slice(0, cfg.sentencesPerPara).join(" ");
      if (kept) out.push(kept);
    }
    return out;
  }

  function wordCount(paragraphs) {
    return paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  }

  // Build an abstract from the intro + conclusion topic sentences when missing.
  function synthAbstract(chapters, level) {
    const pick = (canon) => {
      const ch = chapters.find((c) => classifyTitle(c.title) === canon);
      if (!ch) return [];
      return ch.paragraphs.flatMap((p) => splitSentences(p).slice(0, 1));
    };
    const lead = [...pick("Introduction"), ...pick("Conclusion")];
    const limit = level === "strong" ? 3 : level === "light" ? 6 : 4;
    return lead.slice(0, limit).join(" ");
  }

  /**
   * Convert a parsed thesis Paper into a condensed article Paper.
   * opts = { template: "journal"|"conference"|"review",
   *          customSections: [titles] | null,   // from an uploaded sample
   *          level: "light"|"medium"|"strong",
   *          makeAbstract: bool }
   */
  function thesisToArticle(paper, opts) {
    opts = opts || {};
    const level = opts.level || "medium";
    const article = {
      title: paper.title || "Untitled",
      authors: (paper.authors || []).map((a) => ({ name: a.name, affiliation: a.affiliation, email: a.email })),
      abstract: paper.abstract || "",
      keywords: (paper.keywords || []).slice(),
      sections: [],
      references: (paper.references || []).slice(),
      warnings: [],
    };

    // Flatten chapters and tag each with a canonical bucket.
    const chapters = (paper.sections || []).map((s) => ({
      title: s.title,
      canon: classifyTitle(s.title),
      paragraphs: collectParagraphs(s),
    }));

    if (!chapters.length) {
      article.warnings.push("No chapters/sections were detected in the thesis.");
      return article;
    }

    // Target section list: an uploaded sample's structure, or a template.
    const targetTitles = (opts.customSections && opts.customSections.length)
      ? opts.customSections
      : (ARTICLE_TEMPLATES[opts.template] || ARTICLE_TEMPLATES.journal).sections;

    const usedCanons = new Set();
    const usedChapters = new Set();

    for (const targetTitle of targetTitles) {
      const canon = classifyTitle(targetTitle);
      // Gather all thesis chapters whose bucket matches this target section.
      let paras = [];
      chapters.forEach((ch, idx) => {
        if (canon && ch.canon === canon && !usedCanons.has(canon)) {
          paras = paras.concat(ch.paragraphs);
          usedChapters.add(idx);
        }
      });
      if (canon) usedCanons.add(canon);
      const condensed = condenseParagraphs(paras, level);
      article.sections.push({
        title: targetTitle,
        level: 1,
        paragraphs: condensed.length ? condensed : [],
        children: [],
      });
    }

    // Any thesis chapter that mapped nowhere becomes its own extra section,
    // inserted just before the final (conclusion-like) section so no content
    // is silently dropped.
    const orphans = chapters.filter((_, idx) => !usedChapters.has(idx));
    if (orphans.length) {
      const extras = orphans.map((ch) => ({
        title: ch.title,
        level: 1,
        paragraphs: condenseParagraphs(ch.paragraphs, level),
        children: [],
      })).filter((s) => s.paragraphs.length);
      if (extras.length) {
        const insertAt = Math.max(0, article.sections.length - 1);
        article.sections.splice(insertAt, 0, ...extras);
        article.warnings.push(
          extras.length + " chapter(s) did not match a standard section and were kept as extra sections — review their placement.");
      }
    }

    // Drop target sections that ended up empty (no matching thesis content).
    const empties = article.sections.filter((s) => !s.paragraphs.length).map((s) => s.title);
    article.sections = article.sections.filter((s) => s.paragraphs.length);
    if (empties.length) {
      article.warnings.push("No content found for: " + empties.join(", ") + ".");
    }

    if (!article.abstract && opts.makeAbstract) {
      const a = synthAbstract(chapters, level);
      if (a) { article.abstract = a; article.warnings.push("Abstract was auto-generated from the introduction and conclusion — review it."); }
    }

    if (!article.references.length) article.warnings.push("No references were detected.");
    article.warnings.push("Condensing is extractive (it shortens, it does not rewrite). Proofread before submitting.");
    return article;
  }

  // Read a sample article and return just its top-level section titles, in order.
  async function readFormatStructure(file) {
    const paper = await readFileToPaper(file);
    const titles = (paper.sections || []).map((s) => s.title).filter(Boolean);
    return titles;
  }

  /* =======================================================================
   * PAPER CHECK
   * A rule-based reviewer: scans a parsed Paper for structure, formatting,
   * and language problems and returns a checklist. Read-only — it never
   * edits the paper. The language check reuses the humanizer's phrase/word
   * lists to flag "AI-sounding" wording.
   * ===================================================================== */
  const CHECK_RULES = {
    ieee:     { abstract: [150, 250], keywords: [3, 6], minRefs: 8 },
    springer: { abstract: [150, 250], keywords: [3, 6], minRefs: 6 },
    elsevier: { abstract: [120, 300], keywords: [3, 7], minRefs: 6 },
    generic:  { abstract: [100, 300], keywords: [3, 8], minRefs: 5 },
  };

  function walkSections(sections, cb) {
    for (const s of sections) { cb(s); walkSections(s.children, cb); }
  }

  function allBodyParagraphs(paper) {
    const out = [];
    if (paper.abstract) out.push(paper.abstract);
    walkSections(paper.sections, (s) => s.paragraphs.forEach((p) => out.push(p)));
    return out;
  }

  function wordsIn(text) { return (text || "").split(/\s+/).filter(Boolean).length; }

  // Flag AI-sounding phrases/words by reusing the humanizer dictionaries.
  function detectAILanguage(text) {
    const found = [];
    let total = 0;
    const scan = (mapping, isPhrase) => {
      for (const [term] of mapping) {
        const pat = isPhrase
          ? escapeRegex(term).replace(/ /g, "\\s+")
          : "\\b" + escapeRegex(term) + "\\b";
        const m = text.match(new RegExp(pat, "gi"));
        if (m && m.length) { found.push({ term: term, count: m.length }); total += m.length; }
      }
    };
    scan(PHRASE_MAP, true);
    scan(WORD_MAP, false);
    found.sort((a, b) => b.count - a.count);
    return { items: found, total: total };
  }

  function checkPaper(paper, publisher, opts) {
    opts = opts || {};
    const rules = CHECK_RULES[publisher] || CHECK_RULES.generic;
    const issues = [];
    const add = (level, title, detail, extra) =>
      issues.push(Object.assign({ level: level, title: title, detail: detail }, extra || {}));

    // --- title / authors ---
    if (!paper.title || !paper.title.trim()) {
      add("error", "No title detected", "The first line is read as the title — add one.");
    } else {
      if (wordsIn(paper.title) > 20)
        add("warn", "Title looks long", "It's " + wordsIn(paper.title) + " words. Most paper titles are under 20.");
      if (paper.title === paper.title.toUpperCase() && /[A-Z]/.test(paper.title))
        add("tip", "Title is all caps", "Use title case; the renderer applies the publisher's capitalization.");
    }
    if (!paper.authors || !paper.authors.length) {
      add("warn", "No authors detected", "Add author names on the line(s) after the title.");
    } else if (!paper.authors.some((a) => a.affiliation)) {
      add("tip", "No affiliation found", "Add an affiliation so the byline renders fully.");
    }

    // --- abstract ---
    const [aMin, aMax] = rules.abstract;
    if (!paper.abstract || !paper.abstract.trim()) {
      add("error", "No abstract", "Add an 'Abstract' section. " + publisher.toUpperCase() +
        " expects roughly " + aMin + "–" + aMax + " words.");
    } else {
      const w = wordsIn(paper.abstract);
      if (w < aMin) add("warn", "Abstract may be too short", "It's " + w + " words; aim for " + aMin + "–" + aMax + ".");
      else if (w > aMax) add("warn", "Abstract may be too long", "It's " + w + " words; aim for " + aMin + "–" + aMax + ".");
    }

    // --- keywords ---
    const [kMin, kMax] = rules.keywords;
    if (!paper.keywords || !paper.keywords.length) {
      add("warn", "No keywords", "Add a 'Keywords:' line; " + publisher.toUpperCase() + " expects " + kMin + "–" + kMax + ".");
    } else if (paper.keywords.length < kMin) {
      add("tip", "Few keywords", "Only " + paper.keywords.length + "; " + kMin + "–" + kMax + " is typical.");
    } else if (paper.keywords.length > kMax) {
      add("tip", "Many keywords", paper.keywords.length + " keywords; " + kMin + "–" + kMax + " is typical.");
    }

    // --- structure ---
    const topTitles = paper.sections.map((s) => (s.title || "").toLowerCase());
    if (!paper.sections.length) {
      add("error", "No sections detected", "Use clear headings (e.g. 'Introduction', '2. Methods').");
    } else {
      if (paper.sections.length < 3)
        add("warn", "Very few sections", "Only " + paper.sections.length + " section(s) detected — check your headings.");
      if (!topTitles.some((t) => /introduc/.test(t)))
        add("tip", "No Introduction section", "Most papers open with an Introduction.");
      if (!topTitles.some((t) => /conclusion|concluding|summary/.test(t)))
        add("tip", "No Conclusion section", "Consider adding a Conclusion.");
      // empty sections
      let empties = 0;
      walkSections(paper.sections, (s) => { if (!s.paragraphs.length && !s.children.length) empties++; });
      if (empties) add("warn", "Empty section(s)", empties + " heading(s) have no text under them.");
    }

    // --- references & citations ---
    const body = allBodyParagraphs(paper).join("\n");
    if (!paper.references || !paper.references.length) {
      add("warn", "No references", "Add a 'References' section with your sources.");
    } else {
      if (paper.references.length < rules.minRefs)
        add("tip", "Few references", paper.references.length + " found; " + rules.minRefs + "+ is typical for " + publisher.toUpperCase() + ".");
      const cited = (body.match(/\[\d+\]/g) || []).length;
      if (cited === 0)
        add("warn", "References never cited in text", "Found " + paper.references.length +
          " references but no [n] citations in the body — make sure each is cited.");
    }

    // --- formatting / readability ---
    const paras = allBodyParagraphs(paper);
    let longSentences = 0;
    paras.forEach((p) => splitSentences(p).forEach((s) => { if (wordsIn(s) > 40) longSentences++; }));
    if (longSentences) add("tip", longSentences + " very long sentence(s)", "Sentences over 40 words are hard to read — consider splitting them (try the AI → Human tab).");
    if (/\s{2,}/.test(body)) add("tip", "Double spaces found", "There are repeated spaces in the body text.");
    if (/\s[,.;:]/.test(body)) add("tip", "Spacing before punctuation", "Some commas/periods have a space before them.");

    // --- AI-sounding language ---
    if (opts.checkAI !== false) {
      const ai = detectAILanguage(body + "\n" + (paper.title || ""));
      if (ai.total >= 1) {
        const level = ai.total >= 6 ? "warn" : "tip";
        add(level, ai.total + " AI-sounding phrase(s)/word(s)",
          "Flagged wording that often reads as AI-generated or inflated. Rewrite on the AI → Human tab.",
          { terms: ai.items.slice(0, 12) });
      }
    }

    const counts = { error: 0, warn: 0, tip: 0 };
    issues.forEach((i) => counts[i.level]++);
    let score = 100 - counts.error * 15 - counts.warn * 6 - counts.tip * 1.5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      score: score,
      counts: counts,
      issues: issues,
      stats: {
        words: wordsIn(body),
        sections: paper.sections.length,
        references: (paper.references || []).length,
      },
    };
  }

  /* =======================================================================
   * UI
   * ===================================================================== */
  function $(id) { return document.getElementById(id); }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function printHtml(html, onBlocked) {
    const clean = html.replace(/<script>window\.onload=function\(\)\{setTimeout\(function\(\)\{window\.print\(\);\},150\);\};<\/script>/, "");
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0"; iframe.style.bottom = "0";
    iframe.style.width = "0"; iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(clean); doc.close();
    const win = iframe.contentWindow;
    const cleanup = () => setTimeout(() => { try { iframe.remove(); } catch {} }, 1500);
    if (!win) { iframe.remove(); onBlocked && onBlocked(); return; }
    setTimeout(() => { try { win.focus(); win.print(); } catch { onBlocked && onBlocked(); } cleanup(); }, 350);
  }

  // tabs / page navigation
  function activateTab(id, pushHash = true) {
    const btn = document.querySelector(`.tab[data-tab="${id}"]`);
    if (!btn) return;
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    const panel = $(id);
    if (panel) panel.classList.add("active");
    if (pushHash) location.hash = id;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
  window.addEventListener("hashchange", () => {
    const id = (location.hash || "#convert").replace("#", "");
    activateTab(id, false);
  });
  activateTab((location.hash || "#convert").replace("#", ""), false);

  // ---- converter ----
  let convPaper = null;

  async function getConvPaper() {
    const file = $("conv-file").files[0];
    if (file) return await readFileToPaper(file);
    const text = $("conv-text").value.trim();
    if (text) { const p = buildPaper(textToBlocks(text, false)); if (!p.title) p.title = "paper"; return p; }
    return null;
  }

  function publisher() { return document.querySelector('input[name="pub"]:checked').value; }
  function convStatus(msg, cls) { const el = $("conv-status"); el.textContent = msg; el.className = "status " + (cls || ""); }

  function paperStem(paper) {
    const file = $("conv-file").files[0];
    let stem = file ? file.name.replace(/\.[^.]+$/, "") : (paper.title || "paper");
    return stem.replace(/[^\w.-]+/g, "_").slice(0, 60) || "paper";
  }

  $("btn-tex").addEventListener("click", async () => {
    try {
      convStatus("Parsing…");
      const paper = await getConvPaper();
      if (!paper) { convStatus("Add a file or paste some text first.", "warn"); return; }
      const tex = renderLatex(paper, publisher());
      download(new Blob([tex], { type: "text/x-tex" }), paperStem(paper) + "_" + publisher() + ".tex");
      convStatus("LaTeX ready. " + summary(paper), "ok");
    } catch (e) { convStatus("Error: " + e.message, "warn"); console.error(e); }
  });

  $("btn-docx").addEventListener("click", async () => {
    try {
      convStatus("Parsing & building Word file…");
      const paper = await getConvPaper();
      if (!paper) { convStatus("Add a file or paste some text first.", "warn"); return; }
      const blob = await buildDocx(paper, publisher());
      download(blob, paperStem(paper) + "_" + publisher() + ".docx");
      convStatus("Word file ready. " + summary(paper), "ok");
    } catch (e) { convStatus("Error: " + e.message, "warn"); console.error(e); }
  });

  $("btn-pdf").addEventListener("click", async () => {
    try {
      convStatus("Parsing & preparing PDF…");
      const paper = await getConvPaper();
      if (!paper) { convStatus("Add a file or paste some text first.", "warn"); return; }
      const name = paperStem(paper) + "_" + publisher();
      const html = renderPdfDoc(paper, publisher(), name);
      printHtml(html, () => convStatus("Could not open print dialog. Please allow printing for this site.", "warn"));
      convStatus('Print dialog opened — choose "Save as PDF" as the destination. ' + summary(paper), "ok");
    } catch (e) { convStatus("Error: " + e.message, "warn"); console.error(e); }
  });

  function summary(p) {
    let s = "Authors: " + p.authors.length + ", sections: " + p.sections.length + ", refs: " + p.references.length + ".";
    if (p.warnings.length) s += " Note: " + p.warnings[0];
    return s;
  }

  // ---- humanizer ----
  let humParagraphs = [];

  $("hum-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const paper = await readFileToPaper(file);
      humParagraphs = extractParagraphs(paper);
      const sel = $("hum-para");
      sel.innerHTML = "";
      const optAll = document.createElement("option");
      optAll.value = "all"; optAll.textContent = "All paragraphs";
      sel.appendChild(optAll);
      humParagraphs.forEach((p, idx) => {
        const o = document.createElement("option");
        o.value = String(idx); o.textContent = "Para " + (idx + 1) + ": " + p.slice(0, 50) + "…";
        sel.appendChild(o);
      });
      sel.classList.remove("hidden");
      showSelectedPara();
    } catch (err) { alert("Could not read file: " + err.message); }
  });

  function showSelectedPara() {
    const sel = $("hum-para");
    if (sel.classList.contains("hidden") || !humParagraphs.length) return;
    const v = sel.value;
    $("hum-input").value = v === "all" ? humParagraphs.join("\n\n") : (humParagraphs[parseInt(v, 10)] || "");
  }
  $("hum-para").addEventListener("change", showSelectedPara);

  function humOptions() {
    return { vocab: $("opt-vocab").checked, filler: $("opt-filler").checked,
      contractions: $("opt-contractions").checked, split: $("opt-split").checked };
  }
  document.querySelectorAll('input[name="level"]').forEach((r) =>
    r.addEventListener("change", () => {
      const o = optionsForLevel(r.value);
      $("opt-vocab").checked = o.vocab; $("opt-filler").checked = o.filler;
      $("opt-contractions").checked = o.contractions; $("opt-split").checked = o.split;
    }));

  $("btn-humanize").addEventListener("click", () => {
    const text = $("hum-input").value.trim();
    if (!text) { alert("Enter or load some text first."); return; }
    const level = document.querySelector('input[name="level"]:checked').value;
    const res = humanizeText(text, level, humOptions());
    $("hum-output").value = res.text;
    $("hum-count").textContent = "(" + res.changes + " change" + (res.changes === 1 ? "" : "s") + ")";
  });

  $("btn-copy").addEventListener("click", async () => {
    const t = $("hum-output").value;
    if (!t) return;
    try { await navigator.clipboard.writeText(t); $("btn-copy").textContent = "Copied!"; setTimeout(() => ($("btn-copy").textContent = "Copy"), 1200); }
    catch (e) { $("hum-output").select(); document.execCommand("copy"); }
  });

  $("btn-save-txt").addEventListener("click", () => {
    const t = $("hum-output").value;
    if (!t) { alert("Run Humanize first."); return; }
    download(new Blob([t], { type: "text/plain" }), "humanized.txt");
  });

  // ---- theme toggle ----
  (function theme() {
    const root = document.documentElement;
    const btn = $("theme-toggle");
    const saved = (function () { try { return localStorage.getItem("pf-theme"); } catch (e) { return null; } })();
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    function apply(mode) {
      root.setAttribute("data-theme", mode);
      if (btn) btn.textContent = mode === "dark" ? "☀️" : "🌙";
    }
    apply(saved || (prefersDark ? "dark" : "light"));
    if (btn) btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next);
      try { localStorage.setItem("pf-theme", next); } catch (e) {}
    });
  })();

  // ---- thesis -> article ----
  let thCustomSections = null;   // section titles learned from an uploaded sample

  function thLevel() {
    const r = document.querySelector('input[name="thlevel"]:checked');
    return r ? r.value : "medium";
  }
  function thTemplate() {
    const r = document.querySelector('input[name="thtpl"]:checked');
    return r ? r.value : "journal";
  }
  function thPublisher() {
    const r = document.querySelector('input[name="thpub"]:checked');
    return r ? r.value : "ieee";
  }
  function thStatus(msg, cls) { const el = $("th-status"); if (el) { el.textContent = msg; el.className = "status " + (cls || ""); } }

  // render template chooser cards
  (function renderTemplates() {
    const wrap = $("th-templates");
    if (!wrap) return;
    Object.entries(ARTICLE_TEMPLATES).forEach(([key, t], i) => {
      const id = "tpl-" + key;
      const label = document.createElement("label");
      label.className = "tpl-card";
      label.innerHTML =
        '<input type="radio" name="thtpl" value="' + key + '" id="' + id + '"' + (i === 0 ? " checked" : "") + ' />' +
        '<p class="tpl-name">' + htmlEsc(t.name) + '</p>' +
        '<p class="tpl-desc">' + htmlEsc(t.desc) + '</p>' +
        '<p class="tpl-secs">' + t.sections.length + ' sections</p>';
      wrap.appendChild(label);
    });
  })();

  // uploaded sample -> learn its structure
  $("th-format-file") && $("th-format-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    const st = $("th-format-status");
    if (!file) { thCustomSections = null; if (st) { st.textContent = ""; st.className = "status"; } return; }
    try {
      const titles = await readFormatStructure(file);
      if (!titles.length) {
        thCustomSections = null;
        if (st) { st.textContent = "Couldn't find clear section headings in that file — falling back to the chosen template."; st.className = "status warn"; }
        return;
      }
      thCustomSections = titles;
      if (st) { st.textContent = "Mimicking structure: " + titles.join(" · "); st.className = "status ok"; }
    } catch (err) {
      thCustomSections = null;
      if (st) { st.textContent = "Could not read that file: " + err.message; st.className = "status warn"; }
    }
  });

  async function getThesisPaper() {
    const file = $("th-file").files[0];
    if (file) return await readFileToPaper(file);
    const text = $("th-text").value.trim();
    if (text) { const p = buildPaper(textToBlocks(text, false)); if (!p.title) p.title = "thesis"; return p; }
    return null;
  }

  // optionally plain-language the condensed article in place
  async function maybeHumanizeArticle(article) {
    if (!$("th-humanize").checked) return;
    const lvl = "medium";
    if (THESIS_LLM) {
      // advanced users can plug in a real model
      if (article.abstract) article.abstract = await THESIS_LLM(article.abstract, lvl);
      for (const sec of article.sections)
        sec.paragraphs = await Promise.all(sec.paragraphs.map((p) => THESIS_LLM(p, lvl)));
      return;
    }
    if (article.abstract) article.abstract = humanizeText(article.abstract, lvl).text;
    for (const sec of article.sections)
      sec.paragraphs = sec.paragraphs.map((p) => humanizeText(p, lvl).text);
  }

  async function buildArticle() {
    const paper = await getThesisPaper();
    if (!paper) { thStatus("Upload a thesis file or paste some text first.", "warn"); return null; }
    const article = thesisToArticle(paper, {
      template: thTemplate(),
      customSections: thCustomSections,
      level: thLevel(),
      makeAbstract: $("th-abstract").checked,
    });
    await maybeHumanizeArticle(article);
    return article;
  }

  function renderPreview(article) {
    const pv = $("th-pv");
    if (!pv) return;
    let html = "<h4>" + htmlEsc(article.title) + "</h4>";
    const meta = [
      article.authors.length + " author" + (article.authors.length === 1 ? "" : "s"),
      article.sections.length + " sections",
      article.references.length + " references",
    ];
    html += '<p class="pv-meta">' + meta.join(" · ") + "</p>";
    if (article.abstract) {
      html += '<div class="pv-sec"><div class="pv-sec-title">Abstract <span class="pv-words">' +
        article.abstract.split(/\s+/).filter(Boolean).length + ' words</span></div>' +
        '<p class="pv-body">' + htmlEsc(article.abstract) + "</p></div>";
    }
    article.sections.forEach((s) => {
      html += '<div class="pv-sec"><div class="pv-sec-title">' + htmlEsc(s.title) +
        ' <span class="pv-words">' + wordCount(s.paragraphs) + ' words</span></div>' +
        '<p class="pv-body">' + htmlEsc((s.paragraphs[0] || "").slice(0, 220)) +
        (s.paragraphs.length ? "…" : "<em>(no content matched)</em>") + "</p></div>";
    });
    if (article.warnings.length) {
      html += '<div class="pv-sec"><div class="pv-sec-title">Review notes</div><p class="pv-body">• ' +
        article.warnings.map(htmlEsc).join("<br>• ") + "</p></div>";
    }
    pv.innerHTML = html;
  }

  $("th-preview") && $("th-preview").addEventListener("click", async () => {
    try {
      thStatus("Reading thesis and building article…");
      const article = await buildArticle();
      if (!article) return;
      renderPreview(article);
      thStatus("Article built — " + article.sections.length + " sections. Scroll the preview, then download below.", "ok");
    } catch (e) { thStatus("Error: " + e.message, "warn"); console.error(e); }
  });

  function thStem(article) {
    const file = $("th-file").files[0];
    let stem = file ? file.name.replace(/\.[^.]+$/, "") : (article.title || "article");
    return (stem.replace(/[^\w.-]+/g, "_").slice(0, 60) || "article") + "_article";
  }

  $("th-tex") && $("th-tex").addEventListener("click", async () => {
    try {
      thStatus("Building LaTeX…");
      const article = await buildArticle();
      if (!article) return;
      renderPreview(article);
      const tex = renderLatex(article, thPublisher());
      download(new Blob([tex], { type: "text/x-tex" }), thStem(article) + "_" + thPublisher() + ".tex");
      thStatus("LaTeX ready.", "ok");
    } catch (e) { thStatus("Error: " + e.message, "warn"); console.error(e); }
  });

  $("th-docx") && $("th-docx").addEventListener("click", async () => {
    try {
      thStatus("Building Word file…");
      const article = await buildArticle();
      if (!article) return;
      renderPreview(article);
      const blob = await buildDocx(article, thPublisher());
      download(blob, thStem(article) + "_" + thPublisher() + ".docx");
      thStatus("Word file ready.", "ok");
    } catch (e) { thStatus("Error: " + e.message, "warn"); console.error(e); }
  });

  $("th-pdf") && $("th-pdf").addEventListener("click", async () => {
    try {
      thStatus("Preparing PDF…");
      const article = await buildArticle();
      if (!article) return;
      renderPreview(article);
      const name = thStem(article) + "_" + thPublisher();
      const html = renderPdfDoc(article, thPublisher(), name);
      printHtml(html, () => thStatus("Could not open print dialog. Please allow printing for this site.", "warn"));
      thStatus('Print dialog opened — choose "Save as PDF" as the destination.', "ok");
    } catch (e) { thStatus("Error: " + e.message, "warn"); console.error(e); }
  });

  // ---- paper check ----
  function chkPublisher() {
    const r = document.querySelector('input[name="chkpub"]:checked');
    return r ? r.value : "ieee";
  }
  function chkStatus(msg, cls) { const el = $("chk-status"); if (el) { el.textContent = msg; el.className = "status " + (cls || ""); } }

  async function getChkPaper() {
    const file = $("chk-file").files[0];
    if (file) return await readFileToPaper(file);
    const text = $("chk-text").value.trim();
    if (text) { const p = buildPaper(textToBlocks(text, false)); if (!p.title) p.title = "paper"; return p; }
    return null;
  }

  const ICONS = { error: "!", warn: "!", tip: "i" };
  const GROUPS = [
    { level: "error", heading: "Must fix" },
    { level: "warn", heading: "Should review" },
    { level: "tip", heading: "Suggestions" },
  ];

  function renderReport(report) {
    const card = $("chk-result-card");
    const el = $("chk-report");
    let band = report.score >= 80 ? "good" : report.score >= 55 ? "ok" : "bad";
    let verdict = report.score >= 80 ? "Looking good — minor polish only."
      : report.score >= 55 ? "Some things to tidy up before submitting."
      : "Several issues to address before this is submission-ready.";

    let html = '<div class="report-head">' +
      '<div class="score ' + band + '"><span class="num">' + report.score + '</span><span class="lbl">/ 100</span></div>' +
      '<div class="report-summary"><h4>' + verdict + '</h4>' +
      '<p>' + report.stats.words + ' words · ' + report.stats.sections + ' sections · ' +
      report.stats.references + ' references</p>' +
      '<div class="tally">' +
        '<span class="t-err">' + report.counts.error + ' must fix</span>' +
        '<span class="t-warn">' + report.counts.warn + ' review</span>' +
        '<span class="t-tip">' + report.counts.tip + ' tips</span>' +
      '</div></div></div>';

    if (!report.issues.length) {
      html += '<div class="pass-note">✓ No problems detected. Still proofread before submitting.</div>';
    } else {
      for (const g of GROUPS) {
        const items = report.issues.filter((i) => i.level === g.level);
        if (!items.length) continue;
        html += '<div class="chk-group"><h5>' + g.heading + ' (' + items.length + ')</h5>';
        for (const it of items) {
          let terms = "";
          if (it.terms && it.terms.length) {
            terms = '<div class="ai-terms">' + it.terms.map((t) =>
              "<code>" + htmlEsc(t.term) + (t.count > 1 ? " ×" + t.count : "") + "</code>").join("") + "</div>";
          }
          const cls = g.level === "error" ? "error" : g.level === "warn" ? "warn" : "tip";
          html += '<div class="issue ' + cls + '"><span class="ico">' + ICONS[g.level] + '</span>' +
            '<div class="msg"><b>' + htmlEsc(it.title) + '</b><p>' + htmlEsc(it.detail) + '</p>' + terms + '</div></div>';
        }
        html += '</div>';
      }
    }
    el.innerHTML = html;
    card.style.display = "";
  }

  $("chk-run") && $("chk-run").addEventListener("click", async () => {
    try {
      chkStatus("Reading and checking your paper…");
      const paper = await getChkPaper();
      if (!paper) { chkStatus("Upload a file or paste your paper first.", "warn"); return; }
      const report = checkPaper(paper, chkPublisher(), { checkAI: $("chk-ai").checked });
      renderReport(report);
      chkStatus("Done — score " + report.score + "/100. See the report below.", "ok");
      $("chk-result-card").scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    } catch (e) { chkStatus("Error: " + e.message, "warn"); console.error(e); }
  });

  // expose for quick console/testing
  window.ResearchLensAI = {
    humanizeText, buildPaper, textToBlocks, renderLatex, optionsForLevel,
    thesisToArticle, ARTICLE_TEMPLATES, setThesisLLM, checkPaper, detectAILanguage,
  };
})();
