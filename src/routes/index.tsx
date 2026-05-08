import { createFileRoute, Link } from "@tanstack/react-router";
import { Cpu, Zap, Activity, AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Area, AreaChart } from "recharts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · EletricAI Industrial OS" },
      { name: "description", content: "Visão geral em tempo real da planta industrial." },
    ],
  }),
  component: Dashboard,
});

const trend = Array.from({ length: 24 }, (_, i) => ({ v: 50 + Math.sin(i / 2) * 12 + Math.random() * 6 }));

function Dashboard() {
  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">

        <div className="rounded-xl p-6 border border-border glass-strong relative overflow-hidden">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
               style={{ background: "var(--gradient-primary)" }} />
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-2">
                <Sparkles className="h-3 w-3" /> Industrial OS · v0.1
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">Bem-vindo de volta, Engenheiro.</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                3 plantas online · 142 tags ativas · 2 alarmes pendentes. Acesse o
                <span className="text-foreground font-medium"> Industrial Workspace </span>
                para projetar, simular e operar tudo em um único lugar.
              </p>
              <div className="mt-4 flex gap-2">
                <Link to="/workspace" className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-semibold text-primary-foreground glow-primary"
                      style={{ background: "var(--gradient-primary)" }}>
                  Abrir Workspace <ArrowRight className="h-4 w-4"/>
                </Link>
                <Link to="/ai" className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium border border-border hover:bg-accent">
                  <Sparkles className="h-4 w-4 text-primary"/> Conversar com IA
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 min-w-[300px]">
              <Kpi icon={Cpu} label="PLCs Online" v="12 / 12" tone="success"/>
              <Kpi icon={Zap} label="Consumo" v="312 kW" tone="primary"/>
              <Kpi icon={Activity} label="OEE" v="87.4 %" tone="success"/>
              <Kpi icon={AlertTriangle} label="Alarmes" v="2 ⚠" tone="warning"/>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard title="Energia (kWh)" color="oklch(0.78 0.17 200)" />
          <ChartCard title="Produção (un/h)" color="oklch(0.78 0.18 150)" />
          <ChartCard title="Temperatura média" color="oklch(0.86 0.20 90)" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Plantas industriais</h2>
              <Link to="/projects" className="text-[11px] text-primary hover:underline">Ver todos</Link>
            </div>
            <div className="space-y-2">
              {[
                { n: "Linha 03 · Engarrafamento", oee: 94.1, st: "online" },
                { n: "Subestação SE-02", oee: 99.0, st: "online" },
                { n: "CCM-03 · Motores", oee: 78.4, st: "warn" },
                { n: "Reator R-401", oee: 82.0, st: "online" },
              ].map((p) => (
                <div key={p.n} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/40 transition-colors">
                  <span className={`h-2 w-2 rounded-full ${p.st === "online" ? "bg-success" : "bg-warning"} energized`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{p.n}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">OEE {p.oee}%</div>
                  </div>
                  <div className="w-32 h-8">
                    <ResponsiveContainer><LineChart data={trend}><Line type="monotone" dataKey="v" stroke="oklch(0.78 0.17 200)" strokeWidth={1.5} dot={false}/></LineChart></ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-3">Atividade da IA</h2>
            <ul className="space-y-3 text-[12px]">
              {[
                "Gerou unifilar para Linha 03 (12 motores).",
                "Sugeriu redimensionar cabo CCM-03 → NBR 5410.",
                "Detectou rolamento M-03 desgastando.",
                "Criou ladder para nova esteira E-04.",
              ].map((t, i) => (
                <li key={i} className="flex gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5"/>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, v, tone }: any) {
  const colors: any = {
    success: "text-success",
    primary: "text-primary",
    warning: "text-warning",
  };
  return (
    <div className="rounded-lg border border-border bg-card/70 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3"/> {label}
      </div>
      <div className={`text-xl font-mono mt-1 ${colors[tone]}`}>{v}</div>
    </div>
  );
}

function ChartCard({ title, color }: { title: string; color: string }) {
  const data = Array.from({ length: 30 }, (_, i) => ({ v: 30 + Math.sin(i / 2) * 10 + Math.random() * 8 }));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{title}</span>
        <span className="font-mono text-sm" style={{ color }}>● live</span>
      </div>
      <div className="h-32">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id={title} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.5}/>
                <stop offset="100%" stopColor={color} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${title})`}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
