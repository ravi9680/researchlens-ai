import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";
import { Network, Cpu, Info, Layers, TrendingUp } from "lucide-react";

const W = 820, H = 560, CX = W / 2, CY = H / 2, R = 205;

const COMP_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#ec4899", "#84cc16", "#14b8a6", "#f97316",
];

export function GraphLab() {
  const q = useQuery<any>({ queryKey: ["citation-graph"], queryFn: api.graph });
  const [active, setActive] = useState<any>(null);
  const [showLabels, setShowLabels] = useState(true);

  if (q.isLoading) return <div className="skel h-[600px]" />;
  if (q.isError) return <Empty text="Citation graph unavailable." />;
  const d: any = q.data;

  const nodes: any[] = d.nodes || [];
  const edges: any[] = d.edges || [];

  if (!nodes.length) {
    return (
      <div>
        <PageTitle title="Citation graph" sub="BFS · DFS · connected components · PageRank" />
        <Empty text="No citations indexed yet. Ingest papers to build the graph." />
      </div>
    );
  }

  // Deterministic circular layout keeps the graph stable between renders.
  const pos = new Map<number, { x: number; y: number }>();
  const maxPr = Math.max(...nodes.map((n) => n.pagerank || 0), 1e-9);
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.index, { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) });
  });

  const colorOf = (c: number) => COMP_COLORS[c % COMP_COLORS.length];
  const radiusOf = (n: any) => 5 + 20 * ((n.pagerank || 0) / maxPr);

  const neighbours = new Set<number>();
  if (active) {
    for (const e of edges) {
      if (e.source === active.index) neighbours.add(e.target);
      if (e.target === active.index) neighbours.add(e.source);
    }
  }

  const top = [...nodes].sort((a, b) => b.pagerank - a.pagerank).slice(0, 6);

  return (
    <div>
      <PageTitle
        title="Citation graph"
        sub={`${d.stats.nodes} papers · ${d.stats.edges} citations · ${d.numComponents} connected component${d.numComponents === 1 ? "" : "s"}`}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="badge badge-indigo">Node size = PageRank</span>
            <span className="badge badge-emerald">Colour = community</span>
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted">
              <input type="checkbox" className="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
              Labels
            </label>
            {active && (
              <button className="btn-ghost btn-sm" onClick={() => setActive(null)}>Clear focus</button>
            )}
          </div>

          <div className="overflow-hidden rounded-xl bg-slate-50/60 dark:bg-white/[0.02]">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
              </defs>

              {edges.map((e, i) => {
                const a = pos.get(e.source), b = pos.get(e.target);
                if (!a || !b) return null;
                const on = !active || e.source === active.index || e.target === active.index;
                return (
                  <line
                    key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={on ? "#94a3b8" : "#cbd5e1"} strokeWidth={on ? 1.4 : 0.6}
                    strokeOpacity={on ? 0.75 : 0.25} markerEnd="url(#arrow)"
                    className={on ? "dark:stroke-slate-500" : "dark:stroke-slate-700"}
                  />
                );
              })}

              {nodes.map((n) => {
                const p = pos.get(n.index)!;
                const isActive = active?.index === n.index;
                const isNeighbour = neighbours.has(n.index);
                const dim = active && !isActive && !isNeighbour;
                return (
                  <g key={n.id} onClick={() => setActive(n)} className="cursor-pointer">
                    {isActive && (
                      <circle cx={p.x} cy={p.y} r={radiusOf(n) + 7} fill={colorOf(n.component)} fillOpacity={0.15} />
                    )}
                    <circle
                      cx={p.x} cy={p.y} r={radiusOf(n)}
                      fill={colorOf(n.component)} fillOpacity={dim ? 0.15 : 0.88}
                      stroke={isActive ? "#0f172a" : "white"} strokeWidth={isActive ? 2.5 : 1.5}
                      className="transition-all duration-200 dark:stroke-slate-900"
                    />
                    {showLabels && !dim && (
                      <text
                        x={p.x} y={p.y - radiusOf(n) - 5} textAnchor="middle"
                        fontSize={9.5} className="fill-slate-600 dark:fill-slate-300"
                      >
                        {(n.title || "").length > 26 ? `${n.title.slice(0, 25)}…` : n.title}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
            <Info size={13} className="mt-0.5 shrink-0" /> {d.note}
          </p>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-body">
              <Cpu size={15} className="text-indigo-600 dark:text-indigo-300" /> Engine
            </h3>
            <p className="mt-2 text-xs text-muted">Algorithms run natively in the C engine:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(d.algorithms || []).map((a: string) => (
                <span key={a} className="badge badge-slate font-mono text-[10px]">{a}</span>
              ))}
            </div>
            <dl className="mt-4 space-y-1.5 border-t border-slate-200/70 pt-3 text-xs dark:border-white/10">
              {[["Nodes", d.stats.nodes], ["Edges", d.stats.edges], ["Communities", d.numComponents], ["Indexed papers", d.stats.papers]].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className="stat-num font-semibold text-body">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold tracking-tight text-body">
              {active ? "Selected node" : "Select a node"}
            </h3>
            {active ? (
              <div className="mt-2.5">
                <p className="font-medium leading-snug text-body">{active.title}</p>
                <p className="mt-1 text-xs text-muted">
                  Year {active.year ?? "—"} · {active.citationCount} citations · community {active.component}
                </p>
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted">PageRank</span>
                    <span className="stat-num font-semibold text-body">{(active.pagerank || 0).toFixed(5)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">BFS distance from root</span>
                    <span className="stat-num font-semibold text-body">
                      {active.distance === -1 ? "unreachable" : active.distance}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Direct connections</span>
                    <span className="stat-num font-semibold text-body">{neighbours.size}</span>
                  </div>
                </div>
                <Link to={`/app/paper/${active.id}`} className="btn-primary btn-sm mt-4">Open paper</Link>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Click any node to inspect its PageRank, community and citation neighbours. Neighbouring nodes
                stay highlighted while the rest dims.
              </p>
            )}
          </Card>

          <Card>
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-body">
              <TrendingUp size={15} className="text-emerald-600 dark:text-emerald-400" /> Most central papers
            </h3>
            <ol className="mt-3 space-y-2">
              {top.map((n, i) => (
                <li key={n.id} className="flex items-start gap-2.5 text-xs">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-slate-100 text-[10px] font-bold text-muted dark:bg-white/10">
                    {i + 1}
                  </span>
                  <button onClick={() => setActive(n)} className="flex-1 text-left leading-relaxed text-body transition hover:text-indigo-700 dark:hover:text-indigo-300">
                    {n.title}
                    <span className="ml-1 text-faint">pr {(n.pagerank || 0).toFixed(4)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-body">
              <Layers size={15} className="text-slate-500" /> Communities
            </h3>
            <p className="mt-2 text-xs text-muted">
              Weakly connected components: citation links are followed in both directions, so a cluster is a
              community regardless of who cites whom.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Array.from({ length: Math.min(d.numComponents, 12) }, (_, i) => (
                <span key={i} className="badge" style={{ backgroundColor: `${colorOf(i)}1f`, color: colorOf(i) }}>
                  <span className="badge-dot" /> community {i}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
