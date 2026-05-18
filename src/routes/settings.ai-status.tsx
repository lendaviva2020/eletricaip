import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Key,
  ShieldAlert,
  ExternalLink,
  ArrowLeft,
  Activity,
  Clock,
  Cpu,
  Wifi,
  WifiOff,
  Loader2,
  Brain,
  Network,
  Bot,
  Gauge,
  HardDrive,
  Server,
  Database,
  Zap,
  AlertTriangle,
  Info,
  ChevronRight,
  Layers,
  Radio,
  Eye,
  EyeOff,
  Play,
  Pause,
  BarChart3,
  TrendingUp,
  Terminal,
  Globe,
  Heart,
} from "lucide-react";
import { pingArchitectHealth, getStatusEvents } from "@/lib/ai-architect-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NeuralBg } from "@/components/premium/neural-bg";
import { MetricCard } from "@/components/premium/metric-card";
import { ActivityTimeline } from "@/components/premium/activity-timeline";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

export const Route = createFileRoute("/settings/ai-status")({
  head: () => ({
    meta: [
      { title: "Núcleo Neural · EletricAI" },
      { name: "description", content: "Centro de operações neurais da IA industrial." },
    ],
  }),
  component: AiStatusPage,
});

type StatusTone = "ok" | "warn" | "err";
type DemoEvent = { ts: number; ok: boolean; code?: string; ms: number };

const agentData = [
  {
    id: "supervisor",
    name: "Supervisão",
    status: "online" as const,
    icon: Eye,
    consumption: 28,
    uptime: "14d 7h",
    priority: "Alta",
    function: "Monitora parâmetros da planta",
  },
  {
    id: "diagnostic",
    name: "Diagnóstico",
    status: "online" as const,
    icon: Activity,
    consumption: 22,
    uptime: "14d 7h",
    priority: "Alta",
    function: "Análise de falhas e anomalias",
  },
  {
    id: "plc",
    name: "PLC",
    status: "online" as const,
    icon: Cpu,
    consumption: 18,
    uptime: "12d 3h",
    priority: "Média",
    function: "Otimização de controladores lógicos",
  },
  {
    id: "security",
    name: "Segurança",
    status: "online" as const,
    icon: ShieldAlert,
    consumption: 15,
    uptime: "14d 7h",
    priority: "Crítica",
    function: "Monitoramento de segurança cibernética",
  },
  {
    id: "predictive",
    name: "Predictive",
    status: "degraded" as const,
    icon: TrendingUp,
    consumption: 12,
    uptime: "10d 2h",
    priority: "Média",
    function: "Manutenção preditiva via ML",
  },
];

function AiStatusPage() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [backendError, setBackendError] = useState(false);
  const [events, setEvents] = useState(getStatusEvents());
  const [demoEvents] = useState<DemoEvent[]>(() => generateDemoEvents());
  const [neuralAnimating, setNeuralAnimating] = useState(true);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const result: any = await pingArchitectHealth();
      if (result && !result.error) {
        setHealth(result);
        setBackendError(false);
      } else {
        setHealth(getFallbackHealth());
        setBackendError(true);
      }
    } catch {
      setHealth(getFallbackHealth());
      setBackendError(true);
    }
    setEvents(getStatusEvents());
    setBusy(false);
  }, []);

  useEffect(() => {
    refresh();
    const onEv = () => setEvents(getStatusEvents());
    window.addEventListener("ai-status-event", onEv);
    return () => window.removeEventListener("ai-status-event", onEv);
  }, [refresh]);

  const isDemo = backendError || !health;
  const displayEvents = events.length > 0 ? events : isDemo ? demoEvents : [];
  const last24h = displayEvents.filter((e: any) => Date.now() - e.ts < 24 * 60 * 60 * 1000);
  const auth401Count = last24h.filter((e: any) => e.code === "AUTH_401").length;
  const successCount = last24h.filter((e: any) => e.ok).length;
  const lastHourEvents = useSelectorLastHourEvents(displayEvents);

  const isHealthy = health?.ok;
  const keyOk = health?.keyConfigured && health?.keyFormatValid;
  const pingOk = health?.pingOk;

  const chartData = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, "0")}h`,
      tokens: Math.floor(Math.random() * 4000 + 500),
      requests: Math.floor(Math.random() * 30 + 5),
      latency: Math.floor(Math.random() * 400 + 100),
    }));
  }, []);

  const timelineEntries = useMemo(
    () => [
      {
        id: "tl1",
        icon: <Bot className="h-2.5 w-2.5" />,
        label: "IA detectou falha no PLC",
        desc: "CLP-07 · Corrente fora do padrão",
        time: "2 min",
        status: "err" as const,
      },
      {
        id: "tl2",
        icon: <Activity className="h-2.5 w-2.5" />,
        label: "IA criou OS automática",
        desc: "Ordem de Serviço #1042 gerada",
        time: "5 min",
        status: "ok" as const,
      },
      {
        id: "tl3",
        icon: <Zap className="h-2.5 w-2.5" />,
        label: "IA enviou alerta",
        desc: "Temperatura elevada no motor M-03",
        time: "9 min",
        status: "warn" as const,
      },
      {
        id: "tl4",
        icon: <CheckCircle2 className="h-2.5 w-2.5" />,
        label: "IA corrigiu variável",
        desc: "Pressão da bomba P-02 ajustada",
        time: "14 min",
        status: "ok" as const,
      },
      {
        id: "tl5",
        icon: <Cpu className="h-2.5 w-2.5" />,
        label: "Edge node sincronizado",
        desc: "Firmware SCADA atualizado",
        time: "22 min",
        status: "ok" as const,
      },
    ],
    [],
  );

  const alertEntries = [
    {
      id: "al1",
      severity: "crit" as const,
      label: "Erro na inferência do agente PLC",
      time: "5 min atrás",
    },
    {
      id: "al2",
      severity: "warn" as const,
      label: "Latência alta na API DeepSeek",
      time: "12 min atrás",
    },
    {
      id: "al3",
      severity: "warn" as const,
      label: "Falha em automação de diagnóstico",
      time: "28 min atrás",
    },
    {
      id: "al4",
      severity: "info" as const,
      label: "Conexão restabelecida: edge-node-03",
      time: "45 min atrás",
    },
  ];

  return (
    <div className="flex-1 flex flex-col">
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden border-b border-border/40">
        <NeuralBg />
        <div className="relative z-10 px-6 pt-6 pb-10">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate({ to: "/settings" })}
                  className="flex items-center justify-center h-8 w-8 rounded-lg border border-border/40 hover:bg-muted/40 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <div>
                  <h1 className="text-xl font-semibold flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    Núcleo Neural
                  </h1>
                  <p className="text-[11px] text-muted-foreground/60">
                    {health?.provider || "DeepSeek"} · {health?.model || "deepseek-chat"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={isHealthy === false ? "destructive" : "default"}
                  className="h-7 gap-1.5 text-[10px]"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isHealthy === false ? "bg-red-500" : "bg-emerald-500"} animate-pulse`}
                  />
                  {isHealthy === false ? "Sistema degradado" : "Operacional"}
                </Badge>
                {isDemo && (
                  <Badge variant="secondary" className="h-6 text-[9px] gap-1">
                    <Cpu className="h-2.5 w-2.5" /> Simulação
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-center p-4 rounded-xl border border-border/30 bg-background/40 backdrop-blur">
                <p className="text-2xl font-bold text-primary">42</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Tokens/min</p>
              </div>
              <div className="text-center p-4 rounded-xl border border-border/30 bg-background/40 backdrop-blur">
                <p className="text-2xl font-bold text-emerald-500">7</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Processos ativos</p>
              </div>
              <div className="text-center p-4 rounded-xl border border-border/30 bg-background/40 backdrop-blur">
                <p className="text-2xl font-bold text-amber-500">12</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Threads IA</p>
              </div>
              <div className="text-center p-4 rounded-xl border border-border/30 bg-background/40 backdrop-blur">
                <p className="text-2xl font-bold text-purple-500">89ms</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Latência</p>
              </div>
              <div className="text-center p-4 rounded-xl border border-border/30 bg-background/40 backdrop-blur">
                <p className="text-2xl font-bold text-sky-500">5</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Agentes online</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex-1 overflow-auto scrollbar-thin">
        <div className="max-w-6xl mx-auto p-6 space-y-8">
          {/* ─── Grid de Telemetria ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <MetricCard
              icon={<Bot className="h-4 w-4" />}
              label="Processamento"
              value="12.4K"
              sub="tokens/min · pico 18.2K"
              trend={{ value: 8, positive: true }}
            />
            <MetricCard
              icon={<Gauge className="h-4 w-4" />}
              label="Inferências"
              value="847"
              sub="última hora"
              trend={{ value: 3, positive: true }}
            />
            <MetricCard
              icon={<Wifi className="h-4 w-4" />}
              label="Filas"
              value="3"
              sub="2 pendentes · 1 processando"
              trend={{ value: 12, positive: false }}
            />
          </div>

          {/* ─── Chart ─── */}
          <Card className="overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">
                    Atividade neural (24h)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1"
                    onClick={() => setNeuralAnimating(!neuralAnimating)}
                  >
                    {neuralAnimating ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {neuralAnimating ? "Pausar" : "Animação"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refresh}
                    disabled={busy}
                    className="h-7 text-xs gap-1"
                  >
                    <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} /> Revalidar
                  </Button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="tokensGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3fb6d6" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#3fb6d6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    strokeOpacity={0.3}
                  />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    interval={3}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 11,
                      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke="#3fb6d6"
                    strokeWidth={2}
                    fill="url(#tokensGrad)"
                    dot={false}
                    activeDot={{ r: 3, fill: "#3fb6d6" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="latency"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    fill="none"
                    dot={false}
                    strokeDasharray="4 2"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ─── Grid: Saúde + Automações + Mapa + Agentes ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Saúde do Sistema */}
            <div>
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium block mb-3 flex items-center gap-1.5">
                <Heart className="h-3 w-3" /> Saúde do sistema
              </span>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <HealthItem label="CPU" value={34} max={100} />
                  <HealthItem label="RAM" value={62} max={100} />
                  <HealthItem label="GPU" value={78} max={100} />
                  <HealthItem label="APIs" value={keyOk ? 100 : 0} max={100} />
                  <HealthItem label="Banco de dados" value={92} max={100} />
                  <HealthItem label="Edge nodes" value={4} max={5} />
                </CardContent>
              </Card>
            </div>

            {/* Automações executadas */}
            <div>
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium block mb-3 flex items-center gap-1.5">
                <Activity className="h-3 w-3" /> Automações em tempo real
              </span>
              <Card>
                <CardContent className="p-3">
                  <ActivityTimeline entries={timelineEntries} />
                </CardContent>
              </Card>
            </div>

            {/* Agentes IA */}
            <div>
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium block mb-3 flex items-center gap-1.5">
                <Bot className="h-3 w-3" /> Agentes de IA
              </span>
              <div className="space-y-2">
                {agentData.map((a) => {
                  const AgentIcon = a.icon;
                  const statusDot =
                    a.status === "online"
                      ? "bg-emerald-500"
                      : a.status === "degraded"
                        ? "bg-amber-500"
                        : "bg-red-500";
                  return (
                    <div
                      key={a.id}
                      className="group rounded-xl border border-border/40 p-3 hover:border-primary/20 transition-all duration-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/5">
                          <AgentIcon className="h-4 w-4 text-primary/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold">{a.name}</p>
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
                          </div>
                          <p className="text-[10px] text-muted-foreground/50 truncate">
                            {a.function}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-mono text-primary/80">{a.consumption}%</p>
                          <p className="text-[9px] text-muted-foreground/40">{a.uptime}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── Status Cards + Alerts Row ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Status Diagnostics */}
            <div className="space-y-3">
              <StatusCard
                icon={Key}
                label="Chave DeepSeek"
                tone={keyOk ? "ok" : "err"}
                value={keyOk ? "Configurada" : "Ausente"}
                hint={keyOk ? "sk-... válida" : "Configure a DEEPSEEK_API_KEY"}
              />
              <StatusCard
                icon={pingOk ? Wifi : WifiOff}
                label="Conexão API"
                tone={pingOk ? "ok" : health == null ? "warn" : "err"}
                value={pingOk ? "200 OK" : "Sem conexão"}
                hint={
                  health?.pingError?.slice(0, 80) || (pingOk ? "API respondendo" : "Sem conexão")
                }
              />
              <StatusCard
                icon={ShieldAlert}
                label="Erros 401 (24h)"
                tone={auth401Count === 0 ? "ok" : "err"}
                value={String(auth401Count)}
                hint={`${successCount} sucessos · ${last24h.length} chamadas`}
              />
            </div>

            {/* Historical Table */}
            <div className="lg:col-span-2">
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium block mb-3">
                Histórico de chamadas
              </span>
              <Card>
                <CardContent className="p-0">
                  {displayEvents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                      <Activity className="h-10 w-10 mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma chamada registrada.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-border/40 bg-muted/20">
                            <th className="text-left font-medium text-muted-foreground/60 px-4 py-2.5 uppercase tracking-[0.05em]">
                              Quando
                            </th>
                            <th className="text-left font-medium text-muted-foreground/60 px-4 py-2.5 uppercase tracking-[0.05em]">
                              Resultado
                            </th>
                            <th className="text-left font-medium text-muted-foreground/60 px-4 py-2.5 uppercase tracking-[0.05em]">
                              Código
                            </th>
                            <th className="text-right font-medium text-muted-foreground/60 px-4 py-2.5 uppercase tracking-[0.05em]">
                              Latência
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                          {displayEvents.slice(0, 8).map((e: any, i: number) => (
                            <tr key={i} className="hover:bg-muted/10 transition-colors">
                              <td className="px-4 py-2 font-mono text-muted-foreground/70 text-[10px]">
                                <div className="flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5 text-muted-foreground/40" />
                                  {new Date(e.ts).toLocaleString("pt-BR")}
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <Badge
                                  variant={e.ok ? "default" : "destructive"}
                                  className="text-[8px] h-4 font-mono"
                                >
                                  {e.ok ? "✓ OK" : "✗ Falha"}
                                </Badge>
                              </td>
                              <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground/80">
                                {e.code ?? "—"}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-muted-foreground/70">
                                {e.ms} ms
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ─── Fallback Banner ─── */}
          {isHealthy === false && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h2 className="text-sm font-semibold text-destructive mb-2">
                    Ação necessária para reativar a IA
                  </h2>
                  <ol className="list-decimal list-inside space-y-1 text-xs text-foreground/80">
                    <li>
                      Gere uma nova chave em{" "}
                      <a
                        href="https://platform.deepseek.com/api_keys"
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-primary inline-flex items-center gap-1"
                      >
                        platform.deepseek.com <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </li>
                    <li>
                      No Supabase, atualize a secret{" "}
                      <code className="px-1 py-0.5 rounded bg-muted text-[10px]">
                        DEEPSEEK_API_KEY
                      </code>
                    </li>
                    <li>
                      Volte aqui e clique em <strong>Revalidar</strong>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HealthItem({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  const color = pct > 85 ? "bg-red-500" : pct > 65 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-muted-foreground/70">{label}</span>
        <span className="font-mono text-foreground/80">
          {value}
          {max > 100 ? "%" : ""}
          {max <= 100 ? "" : `/${max}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  tone,
  hint,
}: {
  icon: any;
  label: string;
  value: string;
  tone: StatusTone;
  hint?: string;
}) {
  const borderColor =
    tone === "ok"
      ? "border-emerald-500/30"
      : tone === "warn"
        ? "border-amber-500/30"
        : "border-red-500/30";
  const bgColor =
    tone === "ok" ? "bg-emerald-500/5" : tone === "warn" ? "bg-amber-500/5" : "bg-red-500/5";
  const iconColor =
    tone === "ok" ? "text-emerald-500" : tone === "warn" ? "text-amber-500" : "text-red-500";
  return (
    <Card className={`border ${borderColor} ${bgColor}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-2">
          <Icon className={`h-3 w-3 ${iconColor}`} />
          {label}
        </div>
        <p className="text-lg font-mono font-semibold">{value}</p>
        {hint && <p className="text-[10px] mt-1 text-muted-foreground/60 line-clamp-2">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function generateDemoEvents(): DemoEvent[] {
  const now = Date.now();
  return Array.from({ length: 12 }, (_, i) => ({
    ts: now - i * 3600000 - Math.random() * 1800000,
    ok: Math.random() > 0.25,
    code: ["AUTH_401", "RATE_LIMIT_429", "UPSTREAM_5XX"][Math.floor(Math.random() * 3)],
    ms: Math.floor(Math.random() * 1800) + 200,
  }));
}

function getFallbackHealth() {
  return {
    ok: false,
    keyConfigured: false,
    keyFormatValid: false,
    pingOk: false,
    pingStatus: null,
    pingError: "Ambiente de demonstração — servidor não configurado",
    provider: "deepseek",
    model: "deepseek-chat",
    checkedAt: new Date().toISOString(),
  };
}

/* Timer-based hooks (recharts + useRef) aren't needed; plain selector */
function useSelectorLastHourEvents(events: any[]) {
  const cutoff = Date.now() - 3600000;
  return events.filter((e: any) => e.ts > cutoff);
}
