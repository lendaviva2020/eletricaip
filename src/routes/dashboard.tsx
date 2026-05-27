import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Cpu,
  FolderKanban,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import { LineChart, Line, ResponsiveContainer, Area, AreaChart } from "recharts";
import { getAiCredits } from "@/lib/ai-architect.functions";
import { listProjects } from "@/lib/projects.functions";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard - EletricAI Industrial OS" },
      { name: "description", content: "Visão geral em tempo real da planta industrial." },
    ],
  }),
  component: Dashboard,
});

const trend = Array.from({ length: 24 }, (_, index) => ({
  v: 50 + Math.sin(index / 2) * 12 + ((index * 7) % 6),
}));

type ProjectSummary = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  client?: string | null;
  updated_at?: string | null;
};

function Dashboard() {
  const list = useServerFn(listProjects);
  const creditsFn = useServerFn(getAiCredits);

  const projectsQuery = useQuery({
    queryKey: ["dashboard", "projects"],
    queryFn: () => list({}),
  });

  const creditsQuery = useQuery({
    queryKey: ["dashboard", "ai-credits"],
    queryFn: () => creditsFn({}),
  });

  const projects = (projectsQuery.data?.projects ?? []) as ProjectSummary[];
  const activeProjects = projects.filter((project) => (project.status ?? "active") !== "archived");
  const latestProject = activeProjects[0] ?? projects[0] ?? null;
  const credits = creditsQuery.data;
  const creditsLabel =
    credits?.ok === true
      ? credits.unlimited
        ? "Ilimitado"
        : `${credits.remaining}/${credits.max_credits}`
      : "Indisp.";

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        <div className="rounded-xl p-6 border border-border glass-strong relative overflow-hidden">
          <div
            className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
            style={{ background: "var(--gradient-primary)" }}
          />
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-2">
                <Sparkles className="h-3 w-3" /> Industrial OS - v0.1
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Bem-vindo de volta, Engenheiro.
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                {projectsQuery.isLoading
                  ? "Carregando seus projetos industriais..."
                  : activeProjects.length > 0
                    ? `${activeProjects.length} projeto(s) ativo(s). Continue em ${latestProject?.name ?? "seu workspace"} ou crie uma nova planta.`
                    : "Crie seu primeiro projeto para começar a projetar, simular e operar no workspace industrial."}
              </p>
              <div className="mt-4 flex gap-2">
                {latestProject ? (
                  <Link
                    to="/workspace"
                    search={{ projectId: latestProject.id }}
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-semibold text-primary-foreground glow-primary"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    Abrir Workspace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <Link
                    to="/projects"
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-semibold text-primary-foreground glow-primary"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    Criar projeto
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
                <Link
                  to="/ai"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium border border-border hover:bg-accent"
                >
                  <Sparkles className="h-4 w-4 text-primary" /> Conversar com IA
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 min-w-[300px]">
              <Kpi
                icon={FolderKanban}
                label="Projetos"
                value={String(activeProjects.length)}
                tone="primary"
              />
              <Kpi icon={Sparkles} label="Créditos IA" value={creditsLabel} tone="success" />
              <Kpi
                icon={Cpu}
                label="Último projeto"
                value={latestProject ? "Pronto" : "Novo"}
                tone="success"
              />
              <Kpi
                icon={AlertTriangle}
                label="Pendências"
                value={projectsQuery.isError ? "Erro" : "0"}
                tone="warning"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard id="energy" title="Energia (kWh)" color="oklch(0.78 0.17 200)" />
          <ChartCard id="production" title="Produção (un/h)" color="oklch(0.78 0.18 150)" />
          <ChartCard id="temperature" title="Temperatura média" color="oklch(0.86 0.20 90)" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Projetos recentes</h2>
              <Link to="/projects" className="text-[11px] text-primary hover:underline">
                Ver todos
              </Link>
            </div>
            {projectsQuery.isLoading ? (
              <div className="h-36 grid place-items-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : projectsQuery.isError ? (
              <EmptyState text="Não foi possível carregar seus projetos." />
            ) : activeProjects.length === 0 ? (
              <EmptyState text="Nenhum projeto ativo encontrado." />
            ) : (
              <div className="space-y-2">
                {activeProjects.slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    to="/workspace"
                    search={{ projectId: project.id }}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/40 transition-colors"
                  >
                    <span className="h-2 w-2 rounded-full bg-success energized" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{project.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono truncate">
                        {project.client ?? project.description ?? "Sem cliente vinculado"}
                      </div>
                    </div>
                    <div className="w-32 h-8">
                      <ResponsiveContainer>
                        <LineChart data={trend}>
                          <Line
                            type="monotone"
                            dataKey="v"
                            stroke="oklch(0.78 0.17 200)"
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-3">Atividade recente</h2>
            <ul className="space-y-3 text-[12px]">
              {projects.slice(0, 5).map((project) => (
                <li key={project.id} className="flex gap-2">
                  <Activity className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span>
                    {project.name} atualizado em{" "}
                    {project.updated_at
                      ? new Date(project.updated_at).toLocaleDateString("pt-BR")
                      : "data indisponível"}
                  </span>
                </li>
              ))}
              {projects.length === 0 && (
                <li className="flex gap-2 text-muted-foreground">
                  <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Sem atividade recente. Crie um projeto para iniciar.</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "success" | "primary" | "warning";
}) {
  const colors = { success: "text-success", primary: "text-primary", warning: "text-warning" };
  return (
    <div className="rounded-lg border border-border bg-card/70 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`text-xl font-mono mt-1 ${colors[tone]}`}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-36 grid place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ChartCard({ id, title, color }: { id: string; title: string; color: string }) {
  const data = Array.from({ length: 30 }, (_, index) => ({
    v: 30 + Math.sin(index / 2) * 10 + ((index * 5) % 8),
  }));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{title}</span>
        <span className="font-mono text-sm" style={{ color }}>
          live
        </span>
      </div>
      <div className="h-32">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`chart-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill={`url(#chart-${id})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
