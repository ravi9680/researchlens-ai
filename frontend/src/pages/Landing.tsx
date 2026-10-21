import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Upload, Brain, Network, MessagesSquare, ShieldAlert, ArrowRight, GitCompare,
  BookMarked, Cpu, Sparkles, CheckCircle2,
} from "lucide-react";

const FEATS = [
  {
    icon: Brain,
    tint: "from-indigo-500 to-violet-600",
    t: "Semantic + lexical similarity",
    d: "Embeddings for meaning, C engine (KMP, TF-IDF, Jaccard) for exact and near-exact evidence. Reported separately, never conflated with plagiarism.",
  },
  {
    icon: ShieldAlert,
    tint: "from-amber-500 to-orange-600",
    t: "Probabilistic AI-writing signals",
    d: "Burstiness, vocabulary diversity and repetition signals with LOW / MODERATE / HIGH bands — a probability, never proof of authorship.",
  },
  {
    icon: Network,
    tint: "from-emerald-500 to-teal-600",
    t: "Gaps, trends & citation graph",
    d: "Research gaps with supporting papers, trend analytics, and BFS / PageRank citation exploration over the indexed network.",
  },
  {
    icon: MessagesSquare,
    tint: "from-sky-500 to-cyan-600",
    t: "Grounded research chat",
    d: "RAG answers cite only retrieved chunks and abstain outright when the evidence is too thin to support an answer.",
  },
  {
    icon: GitCompare,
    tint: "from-rose-500 to-pink-600",
    t: "Side-by-side comparison",
    d: "Put two to five papers next to each other with separate semantic and lexical scores, shared topics and shared authors.",
  },
  {
    icon: BookMarked,
    tint: "from-fuchsia-500 to-purple-600",
    t: "Literature review generator",
    d: "A theme-wise outline built only from papers actually retrieved for your topic — no fabricated citations, ever.",
  },
];

const PIPELINE = [
  "UPLOAD", "PARSE", "CHUNK", "EMBED", "C_ENGINE",
  "SEMANTIC_SEARCH", "SIMILARITY", "AI_SIGNALS", "GAPS", "REPORT",
];

const STATS = [
  { k: "C engine", v: "10 algorithms" },
  { k: "Pipeline", v: "10 stages" },
  { k: "Embedding", v: "384-d, offline" },
  { k: "Graph", v: "BFS · PageRank" },
];

export function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      {/* ---------- nav ---------- */}
      <nav className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-600/25">
          <Sparkles size={17} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">ResearchLens AI</span>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/app" className="btn-secondary btn-sm">Open app</Link>
          <Link to="/app/upload" className="btn-primary btn-sm">
            Analyze a paper <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      {/* ---------- hero ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-14 max-w-3xl"
      >
        <span className="badge badge-indigo mb-5 gap-1.5 px-3 py-1">
          <span className="badge-dot" /> Similarity ≠ plagiarism · signals ≠ proof
        </span>

        <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-body sm:text-6xl">
          Research intelligence,
          <br />
          <span className="gradient-text">not just similarity scores.</span>
        </h1>

        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Upload a paper → semantic + lexical analysis → similar papers, passage matches,
          research gaps, a literature review and grounded chat. Powered by a C algorithm
          engine with real embeddings on top.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/app/upload" className="btn-primary btn-lg">
            <Upload size={17} /> Upload paper
          </Link>
          <Link to="/app/algorithms" className="btn-secondary btn-lg">
            <Cpu size={17} /> How the algorithms work
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          {["No API key needed", "PDF · DOCX · TXT", "Runs fully offline"].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" /> {t}
            </span>
          ))}
        </div>
      </motion.div>

      {/* ---------- stats ---------- */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {STATS.map((s) => (
          <div key={s.k} className="card card-hover p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-faint">{s.k}</p>
            <p className="stat-num mt-1 text-lg font-semibold text-body">{s.v}</p>
          </div>
        ))}
      </motion.div>

      {/* ---------- features ---------- */}
      <h2 className="mt-16 text-2xl font-semibold tracking-tight text-body">What you get</h2>
      <p className="mt-1.5 text-sm text-muted">Six analysis surfaces, all grounded in what is actually indexed.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATS.map((f, i) => (
          <motion.div
            key={f.t}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.45 }}
            className="card card-hover group p-5"
          >
            <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${f.tint} text-white shadow-md transition duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
              <f.icon size={19} />
            </span>
            <h3 className="mt-3.5 font-semibold tracking-tight text-body">{f.t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.d}</p>
          </motion.div>
        ))}
      </div>

      {/* ---------- pipeline ---------- */}
      <div className="card panel mt-6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold tracking-tight text-body">The pipeline</h3>
          <span className="badge badge-slate">Every stage is inspectable</span>
        </div>
        <p className="mt-1.5 text-sm text-muted">
          Upload (PDF / DOCX / TXT) → parse → chunk → embed → C lexical engine → semantic
          search → passage matches → AI signals → gaps → report.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {PIPELINE.map((s, i) => (
            <span key={s} className="badge badge-slate font-mono text-[11px] tracking-wide">
              <span className="text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="ml-0.5">{s.replace(/_/g, " ")}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ---------- honesty footer ---------- */}
      <div className="note mt-6">
        <p>
          <b className="font-semibold">Honesty contract.</b>{" "}
          Similarity measures relatedness, not plagiarism. AI-writing scores are probabilistic and
          can be wrong in both directions. Demo papers are synthetic and badged{" "}
          <span className="badge badge-amber mx-0.5 align-middle">DEMO</span>
          — real ingestion pulls open-access metadata from OpenAlex within its rate limits.
        </p>
      </div>
    </div>
  );
}
