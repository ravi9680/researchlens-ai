import { randomUUID } from "node:crypto";
import { all, get, run } from "../db.js";
import { chunkText } from "./textUtils.js";
import { embedSync } from "./embedding.js";
import { invalidateChunkCache } from "./similarity.js";
import { config } from "../config.js";

/* Ingestion from legitimate open-access APIs (OpenAlex).
 * Respects rate limits, stores metadata + permitted abstracts only.
 * Falls back to synthetic demo seeding when offline / no keys. */

/* ---------- OpenAlex helpers ---------- */

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": `ResearchLensAI/1.0 (mailto:${config.crossrefEmail || "demo@example.com"})`,
        ...headers,
      },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** OpenAlex returns abstracts as an inverted index ({ word: [positions] }).
 *  Rebuilding it is what makes ingested papers actually searchable — without
 *  this the corpus stores a placeholder string and retrieval finds nothing. */
export function reconstructAbstract(inverted: any): string {
  if (!inverted || typeof inverted !== "object") return "";
  const positions: { pos: number; word: string }[] = [];
  for (const [word, idxs] of Object.entries(inverted)) {
    if (!Array.isArray(idxs)) continue;
    for (const i of idxs) positions.push({ pos: Number(i), word });
  }
  if (!positions.length) return "";
  positions.sort((a, b) => a.pos - b.pos);
  return positions.map((p) => p.word).join(" ").replace(/\s+([.,;:!?])/g, "$1").trim();
}

/** OpenAlex work id → our internal paper id, matched through source_url. */
function findPaperByOpenAlexId(openAlexId: string): string | null {
  if (!openAlexId) return null;
  const row = get<any>("SELECT id FROM papers WHERE source_url = ?", [openAlexId]);
  return row?.id || null;
}

function savePaper(p: {
  doi?: string | null; title: string; abstract?: string; year?: number | null; venue?: string;
  sourceUrl?: string; authors?: string[]; topics?: string[]; citations?: number; isDemo?: boolean;
  referencedWorks?: string[];
}) {
  if (!p.title) return null;
  const existing = p.doi
    ? get<any>("SELECT id FROM papers WHERE doi = ?", [p.doi])
    : get<any>("SELECT id FROM papers WHERE title = ?", [p.title]);
  if (existing) return { id: existing.id, duplicate: true };

  const id = randomUUID();
  run(
    "INSERT INTO papers (id, doi, title, abstract, year, venue, source_url, citation_count, is_demo, full_text) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id, p.doi || null, p.title, (p.abstract || "").slice(0, 8000), p.year || null, p.venue || "",
     p.sourceUrl || "", p.citations || 0, p.isDemo ? 1 : 0, (p.abstract || "").slice(0, 20000)]
  );

  for (let i = 0; i < (p.authors || []).length; i++) {
    const name = p.authors![i];
    let a = get<any>("SELECT id FROM authors WHERE name = ?", [name]);
    if (!a) { const aid = randomUUID(); run("INSERT INTO authors (id, name) VALUES (?,?)", [aid, name]); a = { id: aid }; }
    run("INSERT OR IGNORE INTO paper_authors (paper_id, author_id, position) VALUES (?,?,?)", [id, a.id, i]);
  }
  for (const t of p.topics || []) {
    let row = get<any>("SELECT id FROM topics WHERE name = ?", [t]);
    if (!row) { const tid = randomUUID(); run("INSERT INTO topics (id, name) VALUES (?,?)", [tid, t]); row = { id: tid }; }
    run("INSERT OR IGNORE INTO paper_topics (paper_id, topic_id, score) VALUES (?,?,?)", [id, row.id, 0.8]);
  }

  /* chunk + embed the abstract */
  const chunks = chunkText(p.abstract || p.title, 180, 30).slice(0, 6);
  for (const c of chunks) {
    run("INSERT INTO paper_chunks (id, paper_id, section, content, embedding) VALUES (?,?,?,?,?)",
      [randomUUID(), id, "Abstract", c, JSON.stringify(embedSync(c))]);
  }

  /* Citation edges: link this work to the papers it references, but only when
   * the referenced work is already in the index. Without this the citation
   * graph stays empty after ingestion. */
  let edges = 0;
  for (const ref of p.referencedWorks || []) {
    const targetId = findPaperByOpenAlexId(ref);
    if (!targetId || targetId === id) continue;
    try {
      run("INSERT OR IGNORE INTO citations (citing_paper_id, cited_paper_id) VALUES (?,?)", [id, targetId]);
      edges++;
    } catch { /* duplicate edge */ }
  }
  return { id, duplicate: false, edges };
}

export async function ingestDomain(domain: string, targetCount: number, jobId: string) {
  const log: string[] = [];
  let succeeded = 0, failed = 0, duplicates = 0, edges = 0;
  const tick = (s: number, f: number, d: number) => {
    run("UPDATE ingestion_jobs SET progress = ?, succeeded = ?, failed = ?, duplicates = ? WHERE id = ?",
      [Math.round(((s + f + d) / Math.max(targetCount, 1)) * 100), s, f, d, jobId]);
  };

  try {
    // 1) OpenAlex (no key needed, polite pool)
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(domain)}&per-page=${Math.min(targetCount, 50)}&mailto=${encodeURIComponent(config.openalexEmail || config.crossrefEmail || "demo@example.com")}`;
    const data = await fetchJson(url);
    const works = data?.results || [];
    log.push(`OpenAlex returned ${works.length} works for "${domain}"`);

    if (!works.length) {
      log.push("OpenAlex found no matching works — falling back to clearly-labelled demo papers.");
      throw new Error("no-results");
    }

    for (const w of works) {
      if (succeeded + duplicates >= targetCount) break;
      try {
        const abstract = w.abstract || reconstructAbstract(w.abstract_inverted_index);
        /* Some works have no abstract at all. Rather than store an empty
         * string (which shows up in the UI as a blank card and makes the
         * index look broken), record an explicit "not available" marker so
         * the omission is visible and honest rather than silent. */
        const abstractText = abstract.trim()
          ? abstract
          : "Abstract not available from the source index — bibliographic metadata only.";
        const r = savePaper({
          doi: w.doi || null,
          title: w.title || "",
          abstract: abstractText,
          year: w.publication_year || null,
          venue: w.primary_location?.source?.display_name || "",
          sourceUrl: w.id || w.doi || "",
          authors: (w.authorships || []).slice(0, 6).map((a: any) => a.author?.display_name).filter(Boolean),
          topics: (w.topics || []).slice(0, 3).map((t: any) => t.display_name).filter(Boolean),
          citations: w.cited_by_count || 0,
          isDemo: false,
          referencedWorks: (w.referenced_works || []).slice(0, 50),
        });
        if (!r) failed++;
        else if (r.duplicate) duplicates++;
        else { succeeded++; edges += r.edges || 0; }
      } catch { failed++; }
      tick(succeeded, failed, duplicates);
    }
    if (edges) log.push(`Linked ${edges} citation edge(s) to papers already in the index.`);
  } catch (e: any) {
    if (e?.message !== "no-results") {
      log.push(`OpenAlex unavailable (${e.message}); using demo-safe synthetic seed for "${domain}"`);
    }
    // Offline fallback: clearly-labeled demo papers so the UI keeps working
    for (let i = 0; i < Math.min(targetCount, 10) && succeeded < targetCount; i++) {
      const r = savePaper({
        title: `[DEMO] ${domain}: open-access survey paper ${i + 1}`,
        abstract: `Demo abstract for ${domain}. Covers datasets, baselines, evaluation metrics and limitations. Replace with real ingestion when online.`,
        year: 2022 + (i % 3), venue: "Demo venue (synthetic)", authors: ["Demo Author"],
        topics: [domain], sourceUrl: "", isDemo: true,
      });
      if (r && !r.duplicate) succeeded++; else duplicates++;
      tick(succeeded, failed, duplicates);
    }
  }

  invalidateChunkCache();
  run("UPDATE ingestion_jobs SET status = ?, progress = ?, log_json = ? WHERE id = ?",
    ["done", 100, JSON.stringify(log), jobId]);
}

/** OpenAlex returns at most 50 works per page, so a larger target never
 *  fetches more — capping here keeps the stored target honest. */
export const MAX_INGEST_COUNT = 50;

export function startIngestJob(domain: string, targetCount: number, userId?: string | null): string {
  const id = randomUUID();
  run("INSERT INTO ingestion_jobs (id, user_id, domain, target_count, status, progress) VALUES (?,?,?,?,?,?)",
    [id, userId || null, domain, targetCount, "running", 0]);
  ingestDomain(domain, targetCount, id).catch((e) => {
    run("UPDATE ingestion_jobs SET status = ?, log_json = ? WHERE id = ?", ["failed", JSON.stringify([String(e)]), id]);
  });
  return id;
}
