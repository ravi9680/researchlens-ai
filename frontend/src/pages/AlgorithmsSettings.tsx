import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";
import { Cpu, Info, LogOut, Settings2, Terminal, Layers } from "lucide-react";

const ALGOS = [
  { name: "KMP string matching", why: "Exact pattern occurrences (overlapping) for passage evidence.", io: "text + pattern → count", tc: "O(n+m) time, O(m) space", where: "C engine: match_passages, analyze (phrase probes)" },
  { name: "Rabin-Karp", why: "Rolling-hash scan for candidate phrase matches.", io: "text + pattern → count", tc: "O(n+m) avg, O(1) space", where: "C engine: analyze (cross-checks KMP)" },
  { name: "Edit distance (DP)", why: "Near-exact comparison of potentially similar strings.", io: "two strings → distance + normalized similarity", tc: "O(m·n) time, O(min) space", where: "C engine + passage classification" },
  { name: "LCS", why: "Longest common subsequence for structural overlap.", io: "two strings → length", tc: "O(m·n) time, O(n) space", where: "C engine tests; passage support" },
  { name: "TF-IDF + inverted index", why: "Importance-weighted keyword retrieval across the KB.", io: "tokenized docs + query → ranked doc ids", tc: "O(postings) query", where: "C engine: analyze candidate retrieval" },
  { name: "Jaccard / cosine(TF) / trigram", why: "Lexical similarity at token, frequency and character level.", io: "two texts → 0..1", tc: "O(tokens²) small-chunk bounded", where: "C engine: lexical_score = 0.4cos + 0.3jac + 0.3tri" },
  { name: "Hash table (chaining)", why: "Term frequencies, fingerprint maps.", io: "term → count", tc: "O(1) avg", where: "C engine: keywords; JS mirrors" },
  { name: "Trie", why: "Keyword + prefix search.", io: "word/prefix → count", tc: "O(L) lookup", where: "C engine: keywords module" },
  { name: "Min-heap top-K", why: "Efficient top-K paper/passage retrieval.", io: "stream of (id,score) → top-K desc", tc: "O(n log K)", where: "C engine ranking; TF-IDF search" },
  { name: "BST (year index)", why: "Sorted metadata lookup / range counts.", io: "year range → count", tc: "O(log n) avg", where: "C engine ranking module" },
  { name: "BFS / DFS / components / PageRank", why: "Citation-graph exploration and importance.", io: "graph + start → order/distances/ranks", tc: "O(V+E), PageRank O(iters·(V+E))", where: "C engine: graph command; Citation page" },
  { name: "Semantic embeddings + cosine", why: "Meaning-level retrieval beyond keywords. NOT in C — needs vector models.", io: "384-d vectors → cosine", tc: "O(d) per compare; HNSW in prod pgvector", where: "Backend semanticSearch + pgvector-ready schema" },
];

export function Algorithms() {
  const q = useQuery<any>({ queryKey: ["algos"], queryFn: api.algorithms });
  const live: any = q.data;

  return (
    <div>
      <PageTitle
        title="Algorithm explorer"
        sub="What runs where during an analysis — C outputs and AI interpretations are labeled separately"
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-body">
              <Cpu size={16} className="text-indigo-600 dark:text-indigo-300" /> C engine
            </h3>
            <p className="mt-1.5 text-sm text-muted">
              {live?.cEngine?.available
                ? <>Available — <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-white/10">{live.cEngine.binary}</code></>
                : "Unavailable — the TypeScript mirrors are used instead."}
            </p>
            <p className="mt-1 text-xs text-faint">Interface: {live?.cEngine?.interface || "JSON over stdin/stdout"}</p>
          </div>
          <span className={`badge ${live?.cEngine?.available ? "badge-emerald" : "badge-amber"}`}>
            <span className="badge-dot" />
            {live?.cEngine?.available ? "Running native" : "JS fallback"}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {(live?.pipeline || []).map((p: any) => (
            <div key={p.stage} className="card-inset">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-indigo font-mono text-[11px]">{p.stage}</span>
                <span className="text-xs text-faint">{p.output}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(p.algorithms || []).map((a: string) => (
                  <span key={a} className="badge badge-slate font-mono text-[10px]">{a}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {ALGOS.map((a) => (
          <Card key={a.name} className="card-hover">
            <h3 className="font-semibold tracking-tight text-body">{a.name}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{a.why}</p>
            <dl className="mt-3 space-y-1 border-t border-slate-200/70 pt-3 text-xs dark:border-white/10">
              {[["I/O", a.io], ["Complexity", a.tc], ["Used in", a.where]].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-20 shrink-0 font-semibold text-faint">{k}</dt>
                  <dd className="text-muted">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>

      <div className="note mt-4 flex items-start gap-2.5">
        <Info size={15} className="mt-0.5 shrink-0" />
        <p>
          <b className="font-semibold">Limitations.</b> C lexical methods detect wording overlap, not meaning —
          semantic gaps need embeddings. Edit distance and LCS are bounded to short heads for performance.
          PageRank reflects graph position, never research quality. Full viva-ready details live in{" "}
          <code className="rounded bg-black/5 px-1 dark:bg-white/10">docs/DSA_IMPLEMENTATION.md</code>.
        </p>
      </div>
    </div>
  );
}

export function Settings() {
  const q = useQuery<any>({ queryKey: ["engine"], queryFn: api.engine });
  const dark = document.documentElement.classList.contains("dark");
  const e: any = q.data;

  const rows = [
    { icon: Settings2, k: "Theme", v: dark ? "Dark" : "Light", d: "Toggle in the header. Your choice is remembered." },
    { icon: Layers, k: "Embedding provider", v: e?.semantic ? "Modular" : "—", d: "Local IDF-weighted 384-d by default; swap with EMBEDDING_PROVIDER=openai and run npm run reembed." },
    { icon: Terminal, k: "C engine", v: e?.available ? "Available" : "Unavailable (JS fallback)", d: e?.binary || "" },
    { icon: Cpu, k: "Database", v: "SQLite (dev)", d: "Postgres + pgvector schema ships in backend/migrations/postgres.sql" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Settings" sub="Environment, providers and safety notes" />

      <Card>
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.k} className="flex gap-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                <r.icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-body">{r.k}</p>
                <p className="mt-0.5 text-sm text-body">{r.v}</p>
                {r.d && <p className="mt-0.5 break-words text-xs leading-relaxed text-muted">{r.d}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="note mt-5">
          Never put API keys in frontend code. AI-writing detection is probabilistic and can produce false
          positives and false negatives — it is never proof of authorship. Semantic similarity is not plagiarism.
          Demo papers are synthetic.
        </div>

        <button
          className="btn-danger btn-sm mt-5"
          onClick={() => { api.token = ""; localStorage.removeItem("rl_token"); location.reload(); }}
        >
          <LogOut size={14} /> Log out (fresh guest on next visit)
        </button>
      </Card>
    </div>
  );
}
