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

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics · EletricAI" },
      { name: "description", content: "Métricas industriais e uso de IA por tenant." },
    ],
  }),
  component: AnalyticsPage,
});

const energy = Array.from({ length: 24 }, (_, i) => ({
  h: `${i}h`,
  kwh: 200 + Math.sin(i / 3) * 80 + Math.random() * 30,
}));
const oee = Array.from({ length: 14 }, (_, i) => ({ d: `D${i + 1}`, v: 70 + Math.random() * 25 }));

function AnalyticsPage() {
  const fetchUsage = useServerFn(getAiUsageSummary);
  const { data: usage } = useQuery({
    queryKey: ["ai-usage-summary"],
    queryFn: () => fetchUsage({}),
    staleTime: 60_000,
  });

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
                Plano <span className="text-foreground font-medium">{usage.plan.toUpperCase()}</span>
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

        {/* Industrial — placeholders enquanto agregamos telemetria real */}
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Consumo de energia (24h)">
            <ResponsiveContainer>
              <AreaChart data={energy}>
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
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card title="OEE (14d)">
            <ResponsiveContainer>
              <BarChart data={oee}>
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
                <Bar dataKey="v" fill="oklch(0.78 0.18 150)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Card title="Saúde dos PLCs">
          <ResponsiveContainer>
            <LineChart
              data={Array.from({ length: 50 }, (_, i) => ({
                t: i,
                plc1: 8 + Math.sin(i / 3),
                plc2: 9 + Math.cos(i / 4),
                plc3: 7 + Math.sin(i / 5),
              }))}
            >
              <XAxis dataKey="t" hide />
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
              <Line type="monotone" dataKey="plc1" stroke="oklch(0.78 0.17 200)" dot={false} />
              <Line type="monotone" dataKey="plc2" stroke="oklch(0.86 0.20 90)" dot={false} />
              <Line type="monotone" dataKey="plc3" stroke="oklch(0.78 0.18 150)" dot={false} />
            </LineChart>
          </ResponsiveContainer>
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
