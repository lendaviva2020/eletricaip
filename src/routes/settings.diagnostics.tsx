import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  TimerReset,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDiagnostics, getAiRateLimitMetrics } from "@/lib/diagnostics.functions";
import { getAiCredits } from "@/lib/ai-architect.functions";
import { installDiagnosticsInterceptor, useDiagnosticsCounter } from "@/lib/diagnostics-counter";

const MAX_SAMPLES = 60; // 60 × 5s ≈ 5min

interface RateSample {
  t: number;
  label: string;
  upstashAllowed: number;
  upstashBlocked: number;
  fallbackAllowed: number;
  fallbackBlocked: number;
  quotaBlocked: number;
}
interface CreditSample {
  t: number;
  label: string;
  used: number;
  remaining: number;
}


export const Route = createFileRoute("/settings/diagnostics")({
  head: () => ({
    meta: [
      { title: "Diagnósticos · EletricAI" },
      {
        name: "description",
        content:
          "Status do Supabase, permissões (RLS/GRANT) e contadores de 500/503 em tempo real.",
      },
    ],
  }),
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  useEffect(() => {
    installDiagnosticsInterceptor();
  }, []);

  const fn = useServerFn(getDiagnostics);
  const q = useQuery({
    queryKey: ["diagnostics", "checks"],
    queryFn: () => fn({}),
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });

  const fnAi = useServerFn(getAiRateLimitMetrics);
  const qAi = useQuery({
    queryKey: ["diagnostics", "ai-rate-limit"],
    queryFn: () => fnAi(),
    refetchInterval: 5_000,
    refetchOnWindowFocus: false,
  });

  const fnCredits = useServerFn(getAiCredits);
  const qCredits = useQuery({
    queryKey: ["diagnostics", "ai-credits"],
    queryFn: () => fnCredits(),
    refetchInterval: 5_000,
    refetchOnWindowFocus: false,
  });

  // Ring buffers for time-series charts.
  const [rateSeries, setRateSeries] = useState<RateSample[]>([]);
  const [creditSeries, setCreditSeries] = useState<CreditSample[]>([]);
  const prevTotalsRef = useRef<typeof qAi.data extends infer T ? unknown : never>(null);

  useEffect(() => {
    if (!qAi.data) return;
    const totals = qAi.data.totals;
    const prev = prevTotalsRef.current as null | typeof totals;
    prevTotalsRef.current = totals as never;
    if (!prev) return; // need 2 samples to compute a delta
    const t = qAi.data.ts;
    const sample: RateSample = {
      t,
      label: new Date(t).toLocaleTimeString().slice(0, 8),
      upstashAllowed: Math.max(0, totals.upstashAllowed - prev.upstashAllowed),
      upstashBlocked: Math.max(0, totals.upstashBlocked - prev.upstashBlocked),
      fallbackAllowed: Math.max(0, totals.fallbackAllowed - prev.fallbackAllowed),
      fallbackBlocked: Math.max(0, totals.fallbackBlocked - prev.fallbackBlocked),
      quotaBlocked: Math.max(0, totals.quotaBlocked - prev.quotaBlocked),
    };
    setRateSeries((s) => [...s, sample].slice(-MAX_SAMPLES));
  }, [qAi.data]);

  useEffect(() => {
    if (!qCredits.data || !qCredits.data.ok) return;
    const t = Date.now();
    const { used, remaining } = qCredits.data;
    setCreditSeries((s) =>
      [
        ...s,
        {
          t,
          label: new Date(t).toLocaleTimeString().slice(0, 8),
          used,
          remaining: Math.max(0, remaining),
        },
      ].slice(-MAX_SAMPLES),
    );
  }, [qCredits.data]);

  const counter = useDiagnosticsCounter();
  const errorRate = counter.total > 0 ? ((counter.total - counter.ok) / counter.total) * 100 : 0;

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[960px] mx-auto p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-primary mb-1 flex items-center gap-2">
              <Activity className="h-3 w-3" /> Plataforma
            </div>
            <h1 className="text-2xl font-semibold">Diagnósticos</h1>
            <p className="text-sm text-muted-foreground">
              Status do Supabase, permissões e contadores de erros em tempo real.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
            Recarregar
          </Button>
        </header>

        {/* Counters */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Total /_serverFn" value={counter.total} />
          <Stat label="OK" value={counter.ok} tone="success" />
          <Stat
            label="500"
            value={counter.count500}
            tone={counter.count500 ? "destructive" : undefined}
          />
          <Stat
            label="503"
            value={counter.count503}
            tone={counter.count503 ? "destructive" : undefined}
          />
          <Stat
            label="4xx"
            value={counter.count4xx}
            tone={counter.count4xx ? "warning" : undefined}
          />
        </section>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Taxa de erro:{" "}
            <span className={errorRate > 5 ? "text-destructive font-medium" : "text-foreground"}>
              {errorRate.toFixed(1)}%
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={counter.reset}>
            <TimerReset className="h-3.5 w-3.5 mr-1.5" /> Zerar contadores
          </Button>
        </div>

        {/* Server-side checks */}
        <section>
          <h2 className="text-sm font-medium mb-2 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" /> Checagens Supabase / RLS / RPC
          </h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {q.isLoading && (
                <div className="p-4 text-sm text-muted-foreground">Executando checagens…</div>
              )}
              {q.error && (
                <div className="p-4 text-sm text-destructive">
                  Falha ao carregar: {(q.error as Error).message}
                </div>
              )}
              {q.data?.checks.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {c.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <span className="font-mono text-xs truncate">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-mono truncate max-w-[420px] ${c.ok ? "text-muted-foreground" : "text-destructive"}`}
                    >
                      {c.detail}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-5">
                      {c.durationMs}ms
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* Live charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Credits (consumo)
                </h3>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {qCredits.data?.ok
                    ? `${qCredits.data.used}/${qCredits.data.unlimited ? "∞" : qCredits.data.max_credits}`
                    : "--"}
                </span>
              </div>
              <div className="h-[160px]">
                {creditSeries.length < 2 ? (
                  <Placeholder text="Coletando amostras…" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={creditSeries}>
                      <defs>
                        <linearGradient id="gUsed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 11,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="used"
                        stroke="hsl(var(--primary))"
                        fill="url(#gUsed)"
                        name="usados"
                      />
                      <Line
                        type="monotone"
                        dataKey="remaining"
                        stroke="hsl(var(--success))"
                        dot={false}
                        name="restantes"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Burst limits (req / 5s)
                </h3>
                <span className="text-[10px] text-muted-foreground font-mono">
                  fonte: {qAi.data?.topUsers[0]?.lastSource ?? "—"}
                </span>
              </div>
              <div className="h-[160px]">
                {rateSeries.length < 2 ? (
                  <Placeholder text="Coletando amostras…" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rateSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="upstashAllowed" stroke="hsl(var(--primary))" dot={false} name="ups OK" />
                      <Line type="monotone" dataKey="upstashBlocked" stroke="hsl(var(--destructive))" dot={false} name="ups 429" />
                      <Line type="monotone" dataKey="fallbackAllowed" stroke="hsl(var(--success))" dot={false} name="fb OK" />
                      <Line type="monotone" dataKey="fallbackBlocked" stroke="#f59e0b" dot={false} name="fb 429" />
                      <Line type="monotone" dataKey="quotaBlocked" stroke="#a855f7" dot={false} name="quota" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> Top usuários — eventos por janela
                </h3>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {qAi.data?.topUsers.length ?? 0} usuário(s)
                </span>
              </div>
              <div className="h-[180px]">
                {!qAi.data || qAi.data.topUsers.length === 0 ? (
                  <Placeholder text="Sem atividade nesta instância." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={qAi.data.topUsers.slice(0, 10).map((u) => ({
                        userId: u.userId.slice(0, 6),
                        upstash: u.upstashAllowed + u.upstashBlocked,
                        fallback: u.fallbackAllowed + u.fallbackBlocked,
                        bloqueios: u.upstashBlocked + u.fallbackBlocked + u.quotaBlocked,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="userId" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line type="monotone" dataKey="upstash" stroke="hsl(var(--primary))" name="upstash" />
                      <Line type="monotone" dataKey="fallback" stroke="hsl(var(--success))" name="fallback" />
                      <Line type="monotone" dataKey="bloqueios" stroke="hsl(var(--destructive))" name="bloqueios" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </section>


        {/* AI Rate-limit metrics */}
        <section>
          <h2 className="text-sm font-medium mb-2 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" /> AI Rate-limit · Upstash / Fallback
          </h2>
          <Card>
            <CardContent className="p-4 space-y-3">
              {!qAi.data ? (
                <div className="text-sm text-muted-foreground">Carregando métricas…</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={qAi.data.upstashConfigured ? "default" : "secondary"}>
                      Upstash: {qAi.data.upstashConfigured ? "configurado" : "ausente"}
                    </Badge>
                    <Badge
                      variant={
                        qAi.data.breaker.state === "closed"
                          ? "default"
                          : qAi.data.breaker.state === "open"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      Breaker: {qAi.data.breaker.state}
                      {qAi.data.breaker.state === "open"
                        ? ` · retry em ${Math.ceil(qAi.data.breaker.msUntilRetry / 1000)}s`
                        : ""}
                    </Badge>
                    <Badge variant="outline">falhas: {qAi.data.breaker.failures}</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <MiniStat label="Upstash OK" value={qAi.data.totals.upstashAllowed} />
                    <MiniStat
                      label="Upstash 429"
                      value={qAi.data.totals.upstashBlocked}
                      tone={qAi.data.totals.upstashBlocked ? "warning" : undefined}
                    />
                    <MiniStat label="Fallback OK" value={qAi.data.totals.fallbackAllowed} />
                    <MiniStat
                      label="Fallback 429"
                      value={qAi.data.totals.fallbackBlocked}
                      tone={qAi.data.totals.fallbackBlocked ? "warning" : undefined}
                    />
                    <MiniStat
                      label="Quota 429"
                      value={qAi.data.totals.quotaBlocked}
                      tone={qAi.data.totals.quotaBlocked ? "destructive" : undefined}
                    />
                    <MiniStat
                      label="Breaker skip"
                      value={qAi.data.totals.breakerOpenSkipped}
                      tone={qAi.data.totals.breakerOpenSkipped ? "warning" : undefined}
                    />
                    <MiniStat
                      label="Upstash erros"
                      value={qAi.data.totals.upstashError}
                      tone={qAi.data.totals.upstashError ? "destructive" : undefined}
                    />
                    <MiniStat label="Sem config" value={qAi.data.totals.unconfigured} />
                  </div>
                  {qAi.data.topUsers.length > 0 && (
                    <div className="border border-border rounded">
                      <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground border-b border-border">
                        Top usuários (instância atual)
                      </div>
                      <div className="divide-y divide-border">
                        {qAi.data.topUsers.map((u) => (
                          <div
                            key={u.userId}
                            className="px-3 py-1.5 text-xs font-mono flex items-center gap-2"
                          >
                            <span className="truncate flex-1">{u.userId.slice(0, 8)}…</span>
                            <Badge variant="outline" className="text-[10px] h-5">
                              {u.lastSource}
                            </Badge>
                            <span className="text-muted-foreground">
                              ups {u.upstashAllowed}/{u.upstashBlocked} · fb {u.fallbackAllowed}/
                              {u.fallbackBlocked} · q {u.quotaBlocked}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </section>


        {/* Recent client errors */}
        <section>
          <h2 className="text-sm font-medium mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" /> Últimos erros (cliente)
          </h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {counter.recentErrors.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  Nenhum erro registrado nesta sessão.
                </div>
              ) : (
                counter.recentErrors.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 px-4 py-2 text-xs font-mono"
                  >
                    <span className="text-muted-foreground">
                      {new Date(e.ts).toLocaleTimeString()}
                    </span>
                    <Badge
                      variant={e.status >= 500 ? "destructive" : "secondary"}
                      className="text-[10px] h-5"
                    >
                      {e.status || "ERR"}
                    </Badge>
                    <span className="flex-1 truncate">{e.path}</span>
                    <span className="text-muted-foreground">{e.durationMs}ms</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "destructive" | "warning";
}) {
  const colorClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "warning"
          ? "text-amber-500"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
        <div className={`text-2xl font-mono mt-1 ${colorClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "destructive" | "warning";
}) {
  const colorClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "warning"
          ? "text-amber-500"
          : "text-foreground";
  return (
    <div className="border border-border rounded px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</div>
      <div className={`text-lg font-mono mt-0.5 ${colorClass}`}>{value}</div>
    </div>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}
