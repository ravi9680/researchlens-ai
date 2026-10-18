import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { api } from "../lib/api";
import { Card, PageTitle, Empty } from "../components/Layout";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#84cc16"];

export function Trends() {
  const q = useQuery({ queryKey: ["trends"], queryFn: api.trends });
  if (q.isLoading) return <div className="skel h-64" />;
  if (q.isError) return <Empty text="Trends unavailable." />;
  const d: any = q.data;
  return (
    <div>
      <PageTitle title="Research trends" sub={`${d.total} indexed papers`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h3 className="mb-2 text-sm font-medium">Publication volume by year</h3>
          <div className="h-64"><ResponsiveContainer><BarChart data={d.papersByYear}><XAxis dataKey="year" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="count" fill="#6366f1" radius={6} /></BarChart></ResponsiveContainer></div></Card>
        <Card><h3 className="mb-2 text-sm font-medium">Topic distribution</h3>
          <div className="h-64"><ResponsiveContainer><PieChart><Pie data={d.topics} dataKey="count" nameKey="topic" outerRadius={100} label>{d.topics.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></Card>
      </div>
      <Card className="mt-4"><h3 className="text-sm font-medium">Popular vs emerging</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">{(d.topics || []).map((t: any, i: number) => (<span key={t.topic} className="badge bg-indigo-500/10 text-indigo-600">{t.topic} · {t.count}{i === 0 ? " · popular" : i >= d.topics.length - 2 ? " · emerging" : ""}</span>))}</div></Card>
    </div>
  );
}
