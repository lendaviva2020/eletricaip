import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { motion } from "framer-motion";
import {
  Pulse,
  ArrowRight,
  FolderOpen,
  Sparkle,
  Plus,
  DotsThree,
  CaretUp,
  CaretDown,
  FileText,
  Table as TableIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { getAiCredits } from "@/lib/ai-architect.functions";
import { listProjects } from "@/lib/projects.functions";
import { getDashboardTelemetry } from "@/lib/iot.functions";
import { useAuth } from "@/hooks/use-auth";
import { prefetchRouteQuery } from "@/lib/query-prefetch";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/dashboard")({
  loader: ({ context }) => {
    prefetchRouteQuery(context.queryClient, {
      queryKey: ["dashboard", "projects"],
      queryFn: () => listProjects({}),
    });
    prefetchRouteQuery(context.queryClient, {
      queryKey: ["dashboard", "ai-credits"],
      queryFn: () => getAiCredits({}),
    });
  },
  head: () => ({
    meta: [
      { title: "Dashboard - EletricAI Industrial OS" },
      { name: "description", content: "Visão geral operacional e projetos industriais." },
    ],
  }),
  component: Dashboard,
});

type ProjectSummary = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  client?: string | null;
  updated_at?: string | null;
};

const rtfPtBr = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

function formatRelativePtBr(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return "—";
  const diffSec = Math.round((target - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 60) return rtfPtBr.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtfPtBr.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return rtfPtBr.format(diffHour, "hour");
  const diffDay = Math.round(diffHour / 24);
  if (Math.abs(diffDay) < 30) return rtfPtBr.format(diffDay, "day");
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtfPtBr.format(diffMonth, "month");
  return rtfPtBr.format(Math.round(diffDay / 365), "year");
}

function Dashboard() {
  const { locale } = useI18n();
  useAuth();
  const list = useServerFn(listProjects);
  const creditsFn = useServerFn(getAiCredits);
  const telemetryFn = useServerFn(getDashboardTelemetry);

  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "updated_at", desc: true }]);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const projectsQuery = useQuery({
    queryKey: ["dashboard", "projects"],
    queryFn: () => list({}),
  });

  const creditsQuery = useQuery({
    queryKey: ["dashboard", "ai-credits"],
    queryFn: () => creditsFn({}),
  });

  const telemetryQuery = useQuery({
    queryKey: ["dashboard", "telemetry"],
    queryFn: () => telemetryFn({ data: { hours: 24 } }),
  });

  const projects = useMemo(
    () => (projectsQuery.data?.projects ?? []) as ProjectSummary[],
    [projectsQuery.data?.projects],
  );
  const activeProjects = useMemo(
    () => projects.filter((p) => (p.status ?? "active") !== "archived"),
    [projects],
  );

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.name, p.client, p.description, p.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [projects, search]);

  const credits = creditsQuery.data;
  const creditsLabel =
    credits?.ok === true
      ? credits.unlimited
        ? locale === "pt-BR"
          ? "Ilimitado"
          : "Unlimited"
        : `${credits.remaining}/${credits.max_credits}`
      : "—";

  const telemetrySeries = telemetryQuery.data?.ok ? telemetryQuery.data.series : {};
  const hasTelemetry = Object.keys(telemetrySeries).length > 0;
  const energyData =
    telemetrySeries.energy ?? telemetrySeries.power ?? telemetrySeries.consumption ?? [];
  const productionData =
    telemetrySeries.production ?? telemetrySeries.count ?? telemetrySeries.output ?? [];
  const temperatureData = telemetrySeries.temperature ?? telemetrySeries.temp ?? [];

  const columns = useMemo<ColumnDef<ProjectSummary>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Projeto",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${
                  p.status === "archived" ? "bg-muted-foreground/40" : "bg-success"
                }`}
              />
              <div className="min-w-0">
                <Link
                  to="/workspace"
                  search={{ projectId: p.id }}
                  className="font-medium text-foreground hover:text-primary transition-colors truncate block"
                >
                  {p.name}
                </Link>
                {(p.client || p.description) && (
                  <span className="text-[11px] text-muted-foreground truncate block">
                    {p.client ?? p.description}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "mode",
        header: "Modo / Tipo",
        cell: () => (
          <Badge variant="outline" className="font-mono">
            Unifilar / Ladder
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const st = row.original.status ?? "active";
          return (
            <Badge variant={st === "archived" ? "secondary" : "success"}>
              {st === "archived" ? "Arquivado" : "Ativo"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "updated_at",
        header: "Atualizado em",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatRelativePtBr(row.original.updated_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Ações para ${p.name}`}
                    className="h-7 w-7 inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <DotsThree className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/workspace" search={{ projectId: p.id }}>
                      <ArrowRight className="h-3.5 w-3.5" /> Abrir no Workspace
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/projects/$projectId/export" params={{ projectId: p.id }}>
                      <FileText className="h-3.5 w-3.5" /> Dossiê Técnico
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/projects/$projectId/bom" params={{ projectId: p.id }}>
                      <TableIcon className="h-3.5 w-3.5" /> Lista de Materiais (BOM)
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredProjects,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[1400px] mx-auto p-5 space-y-5">
        {/* 1. Barra de topo com título, busca rápida e CTA Novo Projeto */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
              Painel Operacional
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gerenciamento de projetos elétricos, automação CLP e telemetria de planta.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-full sm:w-64">
              <SearchInput
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch("")}
                placeholder="Filtrar projetos..."
                shortcut="/"
              />
            </div>
            <Button asChild size="default">
              <Link to="/projects">
                <Plus className="h-3.5 w-3.5" /> Novo projeto
              </Link>
            </Button>
          </div>
        </div>

        {/* 2. Métricas compactas em linha (máx. 4 indicadores reais) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border border-border rounded-md bg-card divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Projetos Ativos
              </div>
              <div className="text-lg font-mono font-semibold text-foreground tabular-nums mt-0.5">
                {activeProjects.length}
              </div>
            </div>
            <Badge variant="outline" className="font-mono">
              Total: {projects.length}
            </Badge>
          </div>

          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Créditos de IA
              </div>
              <div className="text-lg font-mono font-semibold text-foreground tabular-nums mt-0.5">
                {creditsLabel}
              </div>
            </div>
            <Link to="/ai" className="text-xs text-primary hover:underline font-medium">
              Copiloto
            </Link>
          </div>

          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Telemetria SCADA
              </div>
              <div className="text-sm font-mono font-semibold text-foreground mt-1">
                {hasTelemetry ? "Online (24h)" : "Standby"}
              </div>
            </div>
            <Badge variant={hasTelemetry ? "success" : "secondary"}>
              {hasTelemetry ? "ATIVO" : "AGUARDANDO"}
            </Badge>
          </div>

          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Integridade
              </div>
              <div className="text-sm font-mono font-semibold text-foreground mt-1">
                {projectsQuery.isError ? "Falha de sincronismo" : "Operacional"}
              </div>
            </div>
            <Badge variant={projectsQuery.isError ? "destructive" : "success"}>
              {projectsQuery.isError ? "ERRO" : "OK"}
            </Badge>
          </div>
        </div>

        {/* 3. Tabela densa de projetos (@tanstack/react-table) */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Projetos Recentes ({filteredProjects.length})
            </h2>
            <Link to="/projects" className="text-xs font-medium text-primary hover:underline">
              Gerenciar todos →
            </Link>
          </div>

          {projectsQuery.isLoading ? (
            <TableSkeleton rows={5} columns={5} />
          ) : projectsQuery.isError ? (
            <ErrorState
              title="Falha ao carregar projetos"
              message="Não foi possível sincronizar a lista de projetos com o servidor."
              onRetry={() => projectsQuery.refetch()}
            />
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-5 w-5" />}
              title="Nenhum projeto industrial cadastrado"
              description="Crie seu primeiro projeto para abrir o canvas Unifilar, Multifilar e Ladder IEC 61131-3."
              action={
                <div className="flex items-center gap-2">
                  <Button asChild size="default">
                    <Link to="/projects">
                      <Plus className="h-3.5 w-3.5" /> Novo projeto
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="default">
                    <Link to="/ai">
                      <Sparkle className="h-3.5 w-3.5" /> Gerar com IA
                    </Link>
                  </Button>
                </div>
              }
            />
          ) : filteredProjects.length === 0 ? (
            <EmptyState
              icon={<FolderOpen className="h-5 w-5" />}
              title="Nenhum projeto corresponde ao filtro"
              description={`Nenhum resultado encontrado para "${search}".`}
              action={
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  Limpar busca
                </Button>
              }
            />
          ) : (
            <div className="rounded-md border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="bg-muted/30 hover:bg-muted/30">
                      {headerGroup.headers.map((header) => {
                        const canSort = header.column.getCanSort();
                        const sorted = header.column.getIsSorted();
                        return (
                          <TableHead key={header.id}>
                            {header.isPlaceholder ? null : canSort ? (
                              <button
                                type="button"
                                onClick={header.column.getToggleSortingHandler()}
                                className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer select-none uppercase"
                              >
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {sorted === "asc" && <CaretUp className="h-3 w-3 text-primary" />}
                                {sorted === "desc" && (
                                  <CaretDown className="h-3 w-3 text-primary" />
                                )}
                              </button>
                            ) : (
                              flexRender(header.column.columnDef.header, header.getContext())
                            )}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* 4. Telemetria Compacta de Planta */}
        <section className="space-y-2.5">
          <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
            Séries Temporais de Telemetria (24h)
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <ChartCard
              id="energy"
              title="Energia"
              subtitle="consumo agregado · kWh"
              color="oklch(0.65 0.16 245)"
              data={energyData}
              live={telemetryQuery.data?.ok === true && energyData.length > 0}
            />
            <ChartCard
              id="production"
              title="Produção"
              subtitle="unidades/hora médias"
              color="oklch(0.68 0.16 150)"
              data={productionData}
              live={telemetryQuery.data?.ok === true && productionData.length > 0}
            />
            <ChartCard
              id="temperature"
              title="Temperatura"
              subtitle="média ponderada · °C"
              color="oklch(0.75 0.16 75)"
              data={temperatureData}
              live={telemetryQuery.data?.ok === true && temperatureData.length > 0}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ChartCard({
  id,
  title,
  subtitle,
  color,
  data,
  dataKey = "value",
  live = false,
}: {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  data?: Array<{ timestamp: string; value: number }>;
  dataKey?: string;
  live?: boolean;
}) {
  const hasData = data && data.length > 0;

  return (
    <div className="rounded-md border border-border bg-card p-3.5 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs font-semibold text-foreground">{title}</div>
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
        <Badge variant={live && hasData ? "success" : "outline"} className="font-mono">
          {live && hasData ? "AO VIVO" : hasData ? "DADOS" : "SEM SINAL"}
        </Badge>
      </div>
      {hasData ? (
        <div className="h-24">
          <ResponsiveContainer>
            <AreaChart data={data}>
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                fill={color}
                fillOpacity={0.12}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-24 flex flex-col items-center justify-center text-center p-2 rounded-sm border border-border bg-muted/20">
          <Pulse className="h-4 w-4 text-muted-foreground/50 mb-1" />
          <span className="text-[11px] font-mono text-muted-foreground">
            Sem leituras ({title.toLowerCase()})
          </span>
        </div>
      )}
    </div>
  );
}
