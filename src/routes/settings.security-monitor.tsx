import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  Activity,
  ExternalLink,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getSecurityDashboard,
  type SecurityFinding,
} from "@/lib/security-monitor.functions";

export const Route = createFileRoute("/settings/security-monitor")({
  head: () => ({
    meta: [
      { title: "Monitoramento de Segurança · EletricAI" },
      {
        name: "description",
        content:
          "Painel de monitoramento de segurança: findings de scans, problemas residuais e status de alertas no tempo.",
      },
    ],
  }),
  component: SecurityMonitorPage,
});

const SEVERITY_TONE: Record<SecurityFinding["severity"], string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  medium: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  low: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  info: "bg-muted text-muted-foreground border-border",
};

const STATUS_TONE: Record<SecurityFinding["status"], string> = {
  open: "bg-destructive/15 text-destructive border-destructive/30",
  fixed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  ignored: "bg-muted text-muted-foreground border-border",
};

function SecurityMonitorPage() {
  const fetchDashboard = useServerFn(getSecurityDashboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["security", "dashboard"],
    queryFn: () => fetchDashboard({}),
    refetchInterval: 60_000,
  });

  return (
    <div className="flex-1 overflow-auto scrollbar-thin p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" /> Configurações
            </Link>
            <h1 className="mt-1 text-2xl font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Monitoramento de Segurança
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Findings de scans, issues residuais e atividade de alertas nos últimos 30 dias.
            </p>
          </div>
        </div>

        {error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">
              Falha ao carregar dados: {(error as Error).message}
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          <KpiCard
            icon={ShieldAlert}
            label="Issues abertas"
            value={data?.totals.open}
            tone="destructive"
            loading={isLoading}
          />
          <KpiCard
            icon={AlertTriangle}
            label="Críticas"
            value={data?.totals.critical}
            tone="destructive"
            loading={isLoading}
          />
          <KpiCard
            icon={AlertTriangle}
            label="Altas"
            value={data?.totals.high}
            tone="warning"
            loading={isLoading}
          />
          <KpiCard
            icon={CheckCircle2}
            label="Resolvidas"
            value={data?.totals.fixed}
            tone="success"
            loading={isLoading}
          />
          <KpiCard
            icon={Clock}
            label="Ignoradas"
            value={data?.totals.ignored}
            tone="muted"
            loading={isLoading}
          />
        </div>

        {/* Charts */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Alertas industriais por dia (30d)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[260px]">
              {isLoading || !data ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.alertsByDay}>
                    <defs>
                      <linearGradient id="g-all" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g-crit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => format(parseISO(d), "dd/MM", { locale: ptBR })}
                      fontSize={10}
                    />
                    <YAxis fontSize={10} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                      labelFormatter={(d) =>
                        format(parseISO(d as string), "dd MMM yyyy", { locale: ptBR })
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="Total"
                      stroke="hsl(var(--primary))"
                      fill="url(#g-all)"
                    />
                    <Area
                      type="monotone"
                      dataKey="criticalCount"
                      name="Críticos/Altos"
                      stroke="hsl(var(--destructive))"
                      fill="url(#g-crit)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Eventos de auditoria por dia (30d)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[260px]">
              {isLoading || !data ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.auditByDay}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d) => format(parseISO(d), "dd/MM", { locale: ptBR })}
                      fontSize={10}
                    />
                    <YAxis fontSize={10} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        fontSize: 12,
                      }}
                      labelFormatter={(d) =>
                        format(parseISO(d as string), "dd MMM yyyy", { locale: ptBR })
                      }
                    />
                    <Bar dataKey="count" name="Eventos" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Findings list */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Findings de scans
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4">
                    <Skeleton className="h-16 w-full" />
                  </div>
                ))
              : data?.findings.map((f) => (
                  <div key={f.id} className="p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{f.title}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${SEVERITY_TONE[f.severity]}`}
                        >
                          {f.severity}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${STATUS_TONE[f.status]}`}
                        >
                          {f.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{f.scanner}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{f.description}</p>
                      <div className="mt-1 text-[10px] text-muted-foreground flex gap-3">
                        <span>
                          Detectado:{" "}
                          {format(parseISO(f.detectedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                        {f.fixedAt && (
                          <span className="text-emerald-500">
                            Corrigido:{" "}
                            {format(parseISO(f.fixedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                    {f.id === "auth_leaked_password_protection" && (
                      <a
                        href="https://supabase.com/dashboard/project/hcjkwqyxqxnbqikwltvc/auth/providers"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                      >
                        Abrir <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
          </CardContent>
        </Card>

        {/* Recent alerts + audit */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Alertas recentes</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border">
              {isLoading ? (
                <div className="p-4">
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : data && data.recentAlerts.length > 0 ? (
                data.recentAlerts.map((a) => (
                  <div key={a.id} className="p-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase ${
                          SEVERITY_TONE[(a.severity as SecurityFinding["severity"]) ?? "info"] ??
                          SEVERITY_TONE.info
                        }`}
                      >
                        {a.severity}
                      </Badge>
                      <span className="text-sm truncate">{a.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.message}</p>
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseISO(a.triggeredAt), "dd/MM HH:mm", { locale: ptBR })} ·{" "}
                      {a.state}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Nenhum alerta nos últimos 30 dias.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Auditoria recente</CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border">
              {isLoading ? (
                <div className="p-4">
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : data && data.recentAudit.length > 0 ? (
                data.recentAudit.map((a) => (
                  <div key={a.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{a.action}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {a.resourceType ?? "—"}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(parseISO(a.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Nenhum evento de auditoria nos últimos 30 dias.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  tone: "destructive" | "warning" | "success" | "muted";
  loading: boolean;
}) {
  const toneCls =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
      ? "text-orange-500"
      : tone === "success"
      ? "text-emerald-500"
      : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${toneCls}`} />
          {label}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-12 mt-2" />
        ) : (
          <p className={`text-2xl font-semibold mt-1 ${toneCls}`}>{value ?? 0}</p>
        )}
      </CardContent>
    </Card>
  );
}
