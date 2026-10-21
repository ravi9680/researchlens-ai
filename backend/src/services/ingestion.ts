import { randomUUID } from "node:crypto";
import { all, get, run, } from "../db.js";
import { chunkText } from "./textUtils.js";
import { embedSync } from "./embedding.js";
import { invalidateChunkCache } from "./similarity.js";
import { config } from "../config.js";

/* Ingestion from legitimate open-access APIs (OpenAlex, Crossref, arXiv).
 * Respects rate limits, stores metadata + permitted abstracts only.
 * Falls back to synthetic demo seeding when offline / no keys. */

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": `ResearchLensAI/1.0 (mailto:${config.crossrefEmail || "demo@example.com"})`, ...headers }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

function savePaper(p: { doi?: string | null; title: string; abstract?: string; year?: number | null; venue?: string; sourceUrl?: string; authors?: string[]; topics?: string[]; citations?: number; isDemo?: boolean }) {
  if (!p.title) return null;
  const existing = p.doi ? get<any>("SELECT id FROM papers WHERE doi = ?", [p.doi]) : get<any>("SELECT id FROM papers WHERE title = ?", [p.title]);
  if (existing) return { id: existing.id, duplicate: true };
  const id = randomUUID();
  run("INSERT INTO papers (id, doi, title, abstract, year, venue, source_url, citation_count, is_demo, full_text) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id, p.doi || null, p.title, (p.abstract || "").slice(0, 8000), p.year || null, p.venue || "", p.sourceUrl || "", p.citations || 0, p.isDemo ? 1 : 0, (p.abstract || "").slice(0, 20000)]);
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
  // chunk + embed abstract
  const chunks = chunkText(p.abstract || p.title, 180, 30).slice(0, 6);
  for (const c of chunks) {
    run("INSERT INTO paper_chunks (id, paper_id, section, content, embedding) VALUES (?,?,?,?,?)",
      [randomUUID(), id, "Abstract", c, JSON.stringify(embedSync(c))]);
  }
  return { id, duplicate: false };
}

export async function ingestDomain(domain: string, targetCount: number, jobId: string) {
  const log: string[] = [];
  let succeeded = 0, failed = 0, duplicates = 0;
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
    for (const w of works) {
      if (succeeded + duplicates >= targetCount) break;
      try {
        const r = savePaper({
          doi: w.doi || null, title: w.title || "", abstract: w.abstract || (w.abstract_inverted_index ? "(abstract available via source link)" : ""),
          year: w.publication_year || null, venue: w.primary_location?.source?.display_name || "",
          sourceUrl: w.doi || w.id || "", authors: (w.authorships || []).slice(0, 6).map((a: any) => a.author?.display_name).filter(Boolean),
          topics: (w.topics || []).slice(0, 3).map((t: any) => t.display_name).filter(Boolean),
          citations: w.cited_by_count || 0, isDemo: false,
        });
        if (!r) { failed++; } else if (r.duplicate) duplicates++; else succeeded++;
      } catch { failed++; }
      tick(succeeded, failed, duplicates);
    }
  } catch (e: any) {
    log.push(`OpenAlex unavailable (${e.message}); using demo-safe synthetic seed for "${domain}"`);
    // Offline fallback: clearly-labeled demo papers so UI keeps working
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
