import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  TimerReset,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDiagnostics } from "@/lib/diagnostics.functions";
import { installDiagnosticsInterceptor, useDiagnosticsCounter } from "@/lib/diagnostics-counter";

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
