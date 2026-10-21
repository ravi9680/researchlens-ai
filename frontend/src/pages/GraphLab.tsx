import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";
import { Network } from "lucide-react";

const W = 820, H = 560, CX = W / 2, CY = H / 2, R = 200;

export function GraphLab() {
  const q = useQuery({ queryKey: ["citation-graph"], queryFn: api.graph });
  const [active, setActive] = useState<any>(null);
  const [showLabels, setShowLabels] = useState(true);

  if (q.isLoading) return <div className="skel h-[560px]" />;
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

  const compColors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"];
  const colorOf = (c: number) => compColors[c % compColors.length];
  const radiusOf = (n: any) => 5 + 20 * ((n.pagerank || 0) / maxPr);

  const neighbours = new Set<number>();
  if (active) {
    for (const e of edges) {
      if (e.source === active.index) neighbours.add(e.target);
      if (e.target === active.index) neighbours.add(e.source);
    }
  }

  return (
    <div>
      <PageTitle title="Citation graph" sub={`${d.stats.nodes} papers · ${d.stats.edges} citations · ${d.numComponents} connected component${d.numComponents === 1 ? "" : "s"}`} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="badge bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">Node size = PageRank</span>
            <span className="badge bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">Colour = community</span>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Labels
            </label>
            {active && (
              <button className="btn text-xs" onClick={() => setActive(null)}>Clear focus</button>
            )}
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
            </defs>

            {/* edges: citing -> cited */}
            {edges.map((e, i) => {
              const a = pos.get(e.source), b = pos.get(e.target);
              if (!a || !b) return null;
              const on = !active || e.source === active.index || e.target === active.index;
              return (
                <line
                  key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={on ? "#94a3b8" : "#e2e8f0"} strokeWidth={on ? 1.4 : 0.6}
                  strokeOpacity={on ? 0.7 : 0.25} markerEnd="url(#arrow)"
                  className="dark:stroke-slate-600"
                />
              );
            })}

            {/* nodes */}
            {nodes.map((n) => {
              const p = pos.get(n.index)!;
              const isActive = active?.index === n.index;
              const isNeighbour = neighbours.has(n.index);
              const dim = active && !isActive && !isNeighbour;
              return (
                <g key={n.id} onClick={() => setActive(n)} className="cursor-pointer">
                  <circle
                    cx={p.x} cy={p.y} r={radiusOf(n)}
                    fill={colorOf(n.component)} fillOpacity={dim ? 0.15 : 0.85}
                    stroke={isActive ? "#0f172a" : "white"} strokeWidth={isActive ? 2.5 : 1.5}
                    className="dark:stroke-slate-900"
                  />
                  {showLabels && !dim && (
                    <text
                      x={p.x} y={p.y - radiusOf(n) - 4} textAnchor="middle"
                      fontSize={9} fill="currentColor" className="text-slate-600 dark:text-slate-300"
                    >
                      {(n.title || "").length > 26 ? `${n.title.slice(0, 25)}…` : n.title}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <p className="mt-3 text-xs text-slate-500">{d.note}</p>
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="flex items-center gap-2 text-sm font-medium"><Network size={15} /> Engine</h3>
            <p className="mt-2 text-xs text-slate-500">Algorithms run in the C engine:</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(d.algorithms || []).map((a: string) => (<span key={a} className="badge bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">{a}</span>))}
            </div>
            <dl className="mt-3 space-y-1 text-xs">
              {[["Nodes", d.stats.nodes], ["Edges", d.stats.edges], ["Communities", d.numComponents], ["Indexed papers", d.stats.papers]].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="font-medium">{String(v)}</dd></div>
              ))}
            </dl>
          </Card>

          <Card>
            <h3 className="text-sm font-medium">{active ? "Selected node" : "Select a node"}</h3>
            {active ? (
              <div className="mt-2">
                <p className="font-medium">{active.title}</p>
                <p className="mt-1 text-xs text-slate-500">Year {active.year ?? "—"} · {active.citationCount} citations · community {active.component}</p>
                <p className="mt-2 text-xs text-slate-500">PageRank <b>{(active.pagerank || 0).toFixed(5)}</b></p>
                <p className="mt-1 text-xs text-slate-500">BFS distance from root: {active.distance === -1 ? "unreachable" : active.distance}</p>
                <p className="mt-1 text-xs text-slate-500">{neighbours.size} directly connected paper{neighbours.size === 1 ? "" : "s"}</p>
                <Link to={`/app/paper/${active.id}`} className="btn-primary mt-3 text-xs">Open paper</Link>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Click any node to inspect its PageRank, community and citation neighbours.</p>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-medium">Most central papers</h3>
            <ol className="mt-2 space-y-1.5">
              {[...nodes].sort((a, b) => b.pagerank - a.pagerank).slice(0, 6).map((n, i) => (
                <li key={n.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 font-semibold text-slate-400">{i + 1}</span>
                  <button onClick={() => setActive(n)} className="flex-1 text-left hover:underline">
                    {n.title}
                    <span className="ml-1 text-slate-400">pr {(n.pagerank || 0).toFixed(4)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
