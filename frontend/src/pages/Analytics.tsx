import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip as PieTooltip,
} from "recharts";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";
import { TrendingUp, PieChart as PieIcon, Flame } from "lucide-react";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#84cc16", "#14b8a6", "#f97316"];

export function Trends() {
  const q = useQuery<any>({ queryKey: ["trends"], queryFn: api.trends });

  if (q.isLoading) return <div className="grid gap-4 lg:grid-cols-2"><div className="skel h-72" /><div className="skel h-72" /></div>;
  if (q.isError) return <Empty text="Trends unavailable." />;
  const d: any = q.data;
  const topics: any[] = d.topics || [];

  const tooltipStyle = {
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    fontSize: 12,
    boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
  };

  return (
    <div>
      <PageTitle
        title="Research trends"
        sub={`${d.total} indexed papers · ${d.demoCount} synthetic demo`}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        {[
          { k: "Total papers", v: d.total, icon: TrendingUp, tint: "from-indigo-500 to-violet-600" },
          { k: "Demo papers", v: d.demoCount, icon: Flame, tint: "from-amber-500 to-orange-600" },
          { k: "Distinct topics", v: topics.length, icon: PieIcon, tint: "from-emerald-500 to-teal-600" },
        ].map(({ k: key, v, icon: Icon, tint }) => (
          <div key={key} className="card card-hover flex items-center gap-3.5 p-4">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${tint} text-white shadow-md`}>
              <Icon size={19} />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-faint">{key}</p>
              <p className="stat-num mt-0.5 text-2xl font-semibold text-body">{String(v)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold tracking-tight text-body">Publication volume by year</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={d.papersByYear} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="trendBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="year" fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" />
                <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="#94a3b8" allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(99,102,241,0.08)" }} contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="url(#trendBar)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold tracking-tight text-body">Topic distribution</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <defs>
                  {COLORS.map((c, i) => (
                    <linearGradient key={i} id={`pie${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={c} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.65} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={topics} dataKey="count" nameKey="topic" outerRadius={96} innerRadius={48} paddingAngle={2}
                  label={({ topic, count }: any) => `${topic} · ${count}`}
                  labelLine={false}
                >
                  {topics.map((_: any, i: number) => <Cell key={i} fill={`url(#pie${i % COLORS.length})`} />)}
                </Pie>
                <PieTooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <h3 className="text-sm font-semibold tracking-tight text-body">Popular vs emerging</h3>
        <p className="mt-1 text-xs text-muted">
          Ranked by paper count. The first entry is the most represented topic; the last two are the thinnest.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {topics.map((t: any, i: number) => (
            <span
              key={t.topic}
              className={`badge ${i === 0 ? "badge-indigo" : i >= topics.length - 2 ? "badge-emerald" : "badge-slate"}`}
            >
              {t.topic} · {t.count}
              {i === 0 && " · popular"}
              {i >= topics.length - 2 && " · emerging"}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
