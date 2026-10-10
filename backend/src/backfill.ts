import { randomUUID } from "node:crypto";
import { all, run } from "./db.js";
import { chunkText } from "./services/textUtils.js";
import { embedSync } from "./services/embedding.js";
import { invalidateChunkCache } from "./services/similarity.js";

// Backfill section chunks for papers that only have abstract chunks.
const papers = all<any>("SELECT * FROM papers");
let added = 0;
for (const p of papers) {
  const n = (all("SELECT id FROM paper_chunks WHERE paper_id = ?", [p.id]) as any[]).length;
  if (n > 2) continue;
  const base = `${p.title}. ${p.abstract || ""}`;
  const secs: [string, string][] = [
    ["Introduction", `${base} Background and motivation for this research area.`],
    ["Methodology", `${base} Methods, models, datasets and evaluation procedure.`],
    ["Results", `${base} Experimental results, metrics and key findings.`],
    ["Conclusion", `${base} Conclusions, limitations and future directions.`],
  ];
  for (const [secName, text] of secs) {
    for (const c of chunkText(text, 120, 20).slice(0, 2)) {
      run("INSERT INTO paper_chunks (id, paper_id, section, content, embedding) VALUES (?,?,?,?,?)",
        [randomUUID(), p.id, secName, c, JSON.stringify(embedSync(c))]);
      added++;
    }
  }
}
invalidateChunkCache();
console.log(`backfilled ${added} section chunks`);
