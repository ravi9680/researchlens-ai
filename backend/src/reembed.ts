import { all, run } from "./db.js";
import { embedBatch, provider, buildIdf, DIM } from "./services/embedding.js";

/* Recompute every chunk embedding with the *active* provider.
 *
 * This is what makes the OpenAI swap real: the previous version called the
 * synchronous local embedder, so `EMBEDDING_PROVIDER=openai` silently
 * produced local vectors and the stored index never matched the setting.
 *
 * Required after switching EMBEDDING_PROVIDER (the dimensions differ). */
buildIdf();

const rows = all<any>("SELECT id, content FROM paper_chunks");
let n = 0;
const BATCH = 64;

for (let i = 0; i < rows.length; i += BATCH) {
  const slice = rows.slice(i, i + BATCH);
  const vecs = await embedBatch(slice.map((r: any) => r.content));
  for (let k = 0; k < slice.length; k++) {
    run("UPDATE paper_chunks SET embedding = ? WHERE id = ?", [JSON.stringify(vecs[k]), slice[k].id]);
    n++;
  }
}

console.log(`reembedded ${n} chunks with provider=${provider()} dim=${DIM}`);
