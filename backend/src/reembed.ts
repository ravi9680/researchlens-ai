import { all, run } from "./db.js";
import { embedSync, provider, buildIdf } from "./services/embedding.js";

// Recompute every chunk embedding with the current provider.
// Required after switching EMBEDDING_PROVIDER (dimensions differ).
buildIdf();
const rows = all<any>("SELECT id, content FROM paper_chunks");
let n = 0;
for (const r of rows) {
  run("UPDATE paper_chunks SET embedding = ? WHERE id = ?", [JSON.stringify(embedSync(r.content)), r.id]);
  n++;
}
console.log(`reembedded ${n} chunks with provider=${provider()}`);
