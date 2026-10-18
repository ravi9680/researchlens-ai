import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Upload, Brain, Network, MessagesSquare, ShieldAlert, ArrowRight } from "lucide-react";

const FEATS = [
  { icon: Brain, t: "Semantic + lexical similarity", d: "Embeddings for meaning, C engine (KMP, TF-IDF, Jaccard) for exact/near-exact evidence. Never conflated with plagiarism." },
  { icon: ShieldAlert, t: "Probabilistic AI-writing signals", d: "Burstiness, vocabulary diversity and repetition signals with LOW / MODERATE / HIGH bands — never proof of authorship." },
  { icon: Network, t: "Gaps, trends & citation graph", d: "Research gaps with supporting papers, trend analytics, and BFS/PageRank citation exploration." },
  { icon: MessagesSquare, t: "Grounded research chat", d: "RAG answers cite only retrieved chunks and abstain when evidence is insufficient." },
];

export function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav className="flex items-center gap-2 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">◈</span> ResearchLens AI
        <Link to="/app" className="btn ml-auto">Open app</Link><Link to="/app/upload" className="btn-primary">Analyze a paper <ArrowRight size={15} /></Link>
      </nav>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-16 max-w-3xl">
        <h1 className="bg-gradient-to-br from-slate-900 to-slate-500 bg-clip-text text-5xl font-bold tracking-tight text-transparent dark:from-white dark:to-slate-400">Research intelligence,<br />not just similarity scores.</h1>
        <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">Upload a paper → semantic + lexical analysis → similar papers, passage matches, research gaps, literature review and grounded chat. Powered by a C algorithm engine + embeddings.</p>
        <div className="mt-6 flex gap-3">
          <Link to="/app/upload" className="btn-primary"><Upload size={16} /> Upload paper</Link>
          <Link to="/app/algorithms" className="btn border border-slate-300 dark:border-white/15">How the algorithms work</Link>
        </div>
        <p className="mt-4 text-xs text-slate-400">Similarity ≠ plagiarism · AI signals are probabilistic · Demo papers are synthetic, never real citations.</p>
      </motion.div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {FEATS.map((f, i) => (<motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }} className="card p-5"><f.icon className="text-indigo-500" size={20} /><h3 className="mt-2 font-medium">{f.t}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{f.d}</p></motion.div>))}
      </div>
      <div className="card mt-6 p-5 text-sm text-slate-500 dark:text-slate-400">
        <b className="text-slate-700 dark:text-slate-200">Pipeline:</b> Upload (PDF/DOCX/TXT) → Parse → Chunk → Embed → C lexical engine → Semantic search → Passage matches → AI signals → Gaps → Report.
      </div>
    </div>
  );
}
