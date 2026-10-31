import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts";
import { getAiUsageSummary } from "@/lib/ai-usage.functions";
import { getDashboardTelemetry } from "@/lib/iot.functions";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics · EletricAI" },
      { name: "description", content: "Métricas industriais e uso de IA por tenant." },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const fetchUsage = useServerFn(getAiUsageSummary);
  const { data: usage } = useQuery({
    queryKey: ["ai-usage-summary"],
    queryFn: () => fetchUsage({}),
    staleTime: 60_000,
  });

  const fetchTelemetry = useServerFn(getDashboardTelemetry);
  const { data: telemetryRes, isLoading: telemetryLoading } = useQuery({
    queryKey: ["dashboard-telemetry", 24],
    queryFn: () =>
      fetchTelemetry({
        data: {
          hours: 24,
          tagPatterns: [
            "energy",
            "power",
            "consumption",
            "production",
            "count",
            "output",
            "temperature",
            "temp",
          ],
        },
      }),
    staleTime: 60_000,
  });

  const series = telemetryRes?.ok ? telemetryRes.series : {};

  const energyTag = Object.keys(series).find((k) =>
    /energy|power|consumo|consumption|kwh/i.test(k),
  );
  const energySeries = (energyTag ? series[energyTag] : undefined) ?? [];
  const energyData = energySeries.map((s) => ({
    h: new Date(s.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    kwh: Math.round(s.value * 10) / 10,
  }));

  const oeeTag = Object.keys(series).find((k) => /oee|prod|count|output/i.test(k));
  const oeeSeries = (oeeTag ? series[oeeTag] : undefined) ?? [];
  const oeeData = oeeSeries.map((s) => ({
    d: new Date(s.timestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    v: Math.round(s.value * 10) / 10,
  }));

  const plcTags = Object.keys(series)
    .filter((k) => k !== energyTag && k !== oeeTag)
    .slice(0, 3);
  const plcData = (() => {
    if (plcTags.length === 0) return [];
    const timeMap = new Map<string, Record<string, any>>();
    for (const tag of plcTags) {
      for (const pt of series[tag] || []) {
        const timeKey = new Date(pt.timestamp).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        const entry = timeMap.get(timeKey) ?? { t: timeKey };
        entry[tag] = Math.round(pt.value * 100) / 100;
        timeMap.set(timeKey, entry);
      }
    }
    return Array.from(timeMap.values());
  })();

  const usedPct =
    usage && !usage.unlimited && usage.maxCredits > 0
      ? Math.min(100, Math.round((usage.used / usage.maxCredits) * 100))
      : 0;

  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Analytics industrial</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Energia, OEE, saúde dos PLCs e uso de IA do tenant atual.
            </p>
          </div>
          {usage && (
            <div className="text-right text-xs text-muted-foreground">
              <div>
                Plano{" "}
                <span className="text-foreground font-medium">{usage.plan.toUpperCase()}</span>
              </div>
              <div className="font-mono">
                {usage.unlimited
                  ? `${usage.used} créditos · ilimitado`
                  : `${usage.used} / ${usage.maxCredits} créditos (${usedPct}%)`}
              </div>
            </div>
          )}
        </div>

        {/* AI usage — dados reais */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Tokens de IA consumidos (últimos 12 meses)">
            <ResponsiveContainer>
              <BarChart data={usage?.history ?? []}>
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.20 0.015 250)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                />
                <Bar
                  dataKey="tokensUsed"
                  fill="oklch(0.78 0.17 200)"
                  radius={[4, 4, 0, 0]}
                  name="Tokens"
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card title="Custo de crédito por operação de IA">
            <ResponsiveContainer>
              <BarChart data={usage?.costsByOperation ?? []} layout="vertical">
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="operation"
                  width={140}
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.20 0.015 250)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                />
                <Bar
                  dataKey="credits"
                  fill="oklch(0.78 0.18 320)"
                  radius={[0, 4, 4, 0]}
                  name="Créditos"
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* #AI-03 — Custo real por operação e evolução mensal */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Custo real por operação (últimos 12 meses)">
            {usage && usage.topOperations.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={usage.topOperations} layout="vertical">
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="operation"
                    width={160}
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.20 0.015 250)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                    formatter={(v: number, _n, p) => [
                      `${v} créditos · ${p.payload.events} chamadas`,
                      p.payload.operation,
                    ]}
                  />
                  <Bar
                    dataKey="credits"
                    fill="oklch(0.78 0.18 40)"
                    radius={[0, 4, 4, 0]}
                    name="Créditos consumidos"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="Sem eventos de IA registrados ainda." />
            )}
          </Card>
          <Card title="Créditos consumidos por operação · mensal">
            {usage && usage.monthlyByOperation.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={usage.monthlyByOperation}>
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.20 0.015 250)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  />
                  {usage.operationKeys.map((op, i) => (
                    <Bar
                      key={op}
                      dataKey={op}
                      stackId="ops"
                      fill={`oklch(0.75 0.17 ${(i * 47) % 360})`}
                      name={op}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="Sem consumo agregado por operação neste período." />
            )}
          </Card>
        </div>

        {/* Telemetria industrial — dados reais da tabela tag_samples */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Consumo de energia (24h)">
            {telemetryLoading ? (
              <EmptyState label="Carregando telemetria de energia..." />
            ) : energyData.length > 0 ? (
              <ResponsiveContainer>
                <AreaChart data={energyData}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.78 0.17 200)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="oklch(0.78 0.17 200)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="h"
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.20 0.015 250)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="kwh"
                    stroke="oklch(0.78 0.17 200)"
                    strokeWidth={2}
                    fill="url(#g1)"
                    name="kWh"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="Nenhum dado de energia registrado nas últimas 24h. Conecte dispositivos IoT ou envie telemetria via ingestão de tags." />
            )}
          </Card>
          <Card title="OEE / Produção (14d)">
            {telemetryLoading ? (
              <EmptyState label="Carregando dados de produção..." />
            ) : oeeData.length > 0 ? (
              <ResponsiveContainer>
                <BarChart data={oeeData}>
                  <XAxis
                    dataKey="d"
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.20 0.015 250)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  />
                  <Bar dataKey="v" fill="oklch(0.78 0.18 150)" radius={[4, 4, 0, 0]} name="Valor" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="Sem dados de OEE ou produção registrados para o tenant no período." />
            )}
          </Card>
        </div>

        <Card title="Saúde dos PLCs & Controladores">
          {telemetryLoading ? (
            <EmptyState label="Verificando telemetria dos controladores..." />
          ) : plcData.length > 0 ? (
            <ResponsiveContainer>
              <LineChart data={plcData}>
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.20 0.015 250)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                />
                {plcTags.map((tag, idx) => (
                  <Line
                    key={tag}
                    type="monotone"
                    dataKey={tag}
                    stroke={`oklch(0.78 0.18 ${(idx * 110 + 60) % 360})`}
                    dot={false}
                    name={tag}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState label="Nenhum CLP ou controlador enviando telemetria em tempo real no período." />
          )}
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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center px-4">
      {label}
    </div>
  );
}
