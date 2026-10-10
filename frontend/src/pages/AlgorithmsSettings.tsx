import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";

const ALGOS = [
  { name: "KMP string matching", why: "Exact pattern occurrences (overlapping) for passage evidence.", io: "text + pattern → count", tc: "O(n+m) time, O(m) space", where: "C engine: match_passages, analyze (phrase probes)" },
  { name: "Rabin-Karp", why: "Rolling-hash scan for candidate phrase matches.", io: "text + pattern → count", tc: "O(n+m) avg, O(1) space", where: "C engine: analyze (cross-checks KMP)" },
  { name: "Edit distance (DP)", why: "Near-exact comparison of potentially similar strings.", io: "two strings → distance + normalized similarity", tc: "O(m·n) time, O(min) space", where: "C engine + passage classification" },
  { name: "LCS", why: "Longest common subsequence for structural overlap.", io: "two strings → length", tc: "O(m·n) time, O(n) space", where: "C engine tests; passage support" },
  { name: "TF-IDF + inverted index", why: "Importance-weighted keyword retrieval across the KB.", io: "tokenized docs + query → ranked doc ids", tc: "O(postings) query", where: "C engine: analyze candidate retrieval" },
  { name: "Jaccard / cosine(TF) / trigram", why: "Lexical similarity at token, frequency and character level.", io: "two texts → 0..1", tc: "O(tokens²) small-chunk bounded", where: "C engine: lexical_score = 0.4cos+0.3jac+0.3tri" },
  { name: "Hash table (chaining)", why: "Term frequencies, fingerprint maps.", io: "term → count", tc: "O(1) avg", where: "C engine: keywords; JS mirrors" },
  { name: "Trie", why: "Keyword + prefix search.", io: "word/prefix → count", tc: "O(L) lookup", where: "C engine: keywords module" },
  { name: "Min-heap top-K", why: "Efficient top-K paper/passage retrieval.", io: "stream of (id,score) → top-K desc", tc: "O(n log K)", where: "C engine ranking; TF-IDF search" },
  { name: "BST (year index)", why: "Sorted metadata lookup / range counts.", io: "year range → count", tc: "O(log n) avg", where: "C engine ranking module" },
  { name: "BFS / DFS / components / PageRank", why: "Citation-graph exploration and importance.", io: "graph + start → order/distances/ranks", tc: "O(V+E), PageRank O(iters·(V+E))", where: "C engine: graph command; Citation page" },
  { name: "Semantic embeddings + cosine", why: "Meaning-level retrieval beyond keywords. NOT in C — needs vector models.", io: "384-d vectors → cosine", tc: "O(d) per compare; HNSW in prod pgvector", where: "Backend semanticSearch + pgvector-ready schema" },
];

export function Algorithms() {
  const q = useQuery({ queryKey: ["algos"], queryFn: api.algorithms });
  const live: any = q.data;
  return (
    <div>
      <PageTitle title="Algorithm explorer" sub="What runs where during an analysis — C outputs vs AI interpretations are labeled separately" />
      <Card>
        <p className="text-sm"><b>C engine:</b> {live?.cEngine?.available ? `available (${live.cEngine.binary})` : "unavailable — JS fallback active"}. Interface: {live?.cEngine?.interface || "JSON over stdin/stdout"}.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{(live?.pipeline || []).map((p: any) => (<span key={p.stage} className="badge bg-indigo-500/10 text-indigo-600">{p.stage}: {(p.algorithms || []).join(", ")}</span>))}</div>
      </Card>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {ALGOS.map((a) => (
          <Card key={a.name}>
            <h3 className="font-medium">{a.name}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{a.why}</p>
            <p className="mt-1 text-xs text-slate-500"><b>I/O:</b> {a.io}</p>
            <p className="text-xs text-slate-500"><b>Complexity:</b> {a.tc}</p>
            <p className="text-xs text-slate-500"><b>Used in:</b> {a.where}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-4"><p className="text-xs text-slate-500">Limitations: C lexical methods detect wording overlap, not meaning — semantic gaps need embeddings. Edit distance/LCS are bounded to short heads for performance. PageRank reflects graph position, never research quality. Full viva-ready details: <code>docs/DSA_IMPLEMENTATION.md</code>.</p></Card>
    </div>
  );
}

export function Settings() {
  const q = useQuery({ queryKey: ["engine"], queryFn: api.engine });
  const dark = document.documentElement.classList.contains("dark");
  return (
    <div>
      <PageTitle title="Settings" sub="Environment, providers and safety notes" />
      <Card>
        <p className="text-sm"><b>Theme:</b> {dark ? "dark" : "light"} (toggle in header)</p>
        <p className="mt-1 text-sm"><b>Embedding provider:</b> local (modular — swap for OpenAI/Cohere via EMBEDDING_PROVIDER)</p>
        <p className="mt-1 text-sm"><b>C engine:</b> {(q.data as any)?.available ? "available" : "unavailable (JS fallback)"}</p>
        <p className="mt-1 text-sm"><b>Database:</b> SQLite (dev) · Postgres + pgvector schema in <code>backend/migrations/postgres.sql</code></p>
        <p className="mt-3 text-xs text-slate-500">Never put API keys in frontend code. AI-writing detection is probabilistic and can produce false positives/negatives — never proof of authorship. Semantic similarity is not plagiarism. Demo papers are synthetic.</p>
        <button className="btn mt-3 border border-slate-300 dark:border-white/15" onClick={() => { api.token = ""; localStorage.removeItem("rl_token"); location.reload(); }}>Logout (fresh guest on next visit)</button>
      </Card>
    </div>
  );
}
