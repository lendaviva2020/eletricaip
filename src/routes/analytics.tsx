import { createFileRoute } from "@tanstack/react-router";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, BarChart, Bar, AreaChart, Area } from "recharts";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics · EletricAI" }, { name: "description", content: "Métricas industriais consolidadas." }] }),
  component: AnalyticsPage,
});

const energy = Array.from({ length: 24 }, (_, i) => ({ h: `${i}h`, kwh: 200 + Math.sin(i / 3) * 80 + Math.random() * 30 }));
const oee = Array.from({ length: 14 }, (_, i) => ({ d: `D${i+1}`, v: 70 + Math.random() * 25 }));

function AnalyticsPage() {
  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <h1 className="text-2xl font-semibold">Analytics industrial</h1>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Consumo de energia (24h)">
            <ResponsiveContainer><AreaChart data={energy}>
              <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="oklch(0.78 0.17 200)" stopOpacity={0.5}/><stop offset="100%" stopColor="oklch(0.78 0.17 200)" stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="h" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ background: "oklch(0.20 0.015 250)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 11 }}/>
              <Area type="monotone" dataKey="kwh" stroke="oklch(0.78 0.17 200)" strokeWidth={2} fill="url(#g1)"/>
            </AreaChart></ResponsiveContainer>
          </Card>
          <Card title="OEE (14d)">
            <ResponsiveContainer><BarChart data={oee}>
              <XAxis dataKey="d" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ background: "oklch(0.20 0.015 250)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 11 }}/>
              <Bar dataKey="v" fill="oklch(0.78 0.18 150)" radius={[4,4,0,0]}/>
            </BarChart></ResponsiveContainer>
          </Card>
        </div>

        <Card title="Saúde dos PLCs">
          <ResponsiveContainer><LineChart data={Array.from({length: 50}, (_, i) => ({ t: i, plc1: 8 + Math.sin(i/3), plc2: 9 + Math.cos(i/4), plc3: 7 + Math.sin(i/5)}))}>
            <XAxis dataKey="t" hide/><YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{ background: "oklch(0.20 0.015 250)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 11 }}/>
            <Line type="monotone" dataKey="plc1" stroke="oklch(0.78 0.17 200)" dot={false}/>
            <Line type="monotone" dataKey="plc2" stroke="oklch(0.86 0.20 90)" dot={false}/>
            <Line type="monotone" dataKey="plc3" stroke="oklch(0.78 0.18 150)" dot={false}/>
          </LineChart></ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{title}</div>
      <div className="h-64">{children}</div>
    </div>
  );
}
