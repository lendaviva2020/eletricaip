import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Coffee,
  Cpu,
  FolderKanban,
  Loader2,
  Moon,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Zap,
} from "lucide-react";
import type { ComponentType } from "react";
import { useMemo } from "react";
import { LineChart, Line, ResponsiveContainer, Area, AreaChart } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getAiCredits } from "@/lib/ai-architect.functions";
import { listProjects } from "@/lib/projects.functions";
import { useAuth } from "@/hooks/use-auth";

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

function getGreeting(hour: number) {
  if (hour < 5) return { text: "Boa madrugada", icon: Moon, hint: "Trabalhando até tarde, hein?" };
  if (hour < 12) return { text: "Bom dia", icon: Sunrise, hint: "Bom café e mãos à obra." };
  if (hour < 14) return { text: "Bom almoço", icon: Coffee, hint: "Hora de uma pausa breve." };
  if (hour < 18) return { text: "Boa tarde", icon: Sun, hint: "Pico de produtividade." };
  if (hour < 22) return { text: "Boa noite", icon: Sunset, hint: "Encerre o dia com chave de ouro." };
  return { text: "Boa noite", icon: Moon, hint: "Cuide do descanso também." };
}

function getFirstName(user: ReturnType<typeof useAuth>["user"]): string {
  if (!user) return "Engenheiro";
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const full = (meta.full_name as string) || (meta.name as string) || "";
  if (full) return full.split(" ")[0];
  if (user.email) return user.email.split("@")[0].split(".")[0];
  return "Engenheiro";
}

function Dashboard() {
  const { user } = useAuth();
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
  const activeProjects = projects.filter((p) => (p.status ?? "active") !== "archived");
  const latestProject = useMemo(
    () =>
      [...activeProjects].sort((a, b) => {
        const da = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const db = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return db - da;
      })[0] ?? null,
    [activeProjects],
  );

  const credits = creditsQuery.data;
  const creditsLabel =
    credits?.ok === true
      ? credits.unlimited
        ? "Ilimitado"
        : `${credits.remaining}/${credits.max_credits}`
      : "Indisp.";

  const now = new Date();
  const greeting = getGreeting(now.getHours());
  const firstName = getFirstName(user);
  const GreetIcon = greeting.icon;
  const lastEdited = latestProject?.updated_at
    ? formatDistanceToNow(new Date(latestProject.updated_at), {
        addSuffix: true,
        locale: ptBR,
      })
    : null;

  const plantHealth = projectsQuery.isError
    ? { label: "Verifique a conexão", tone: "warning" as const }
    : activeProjects.length === 0
      ? { label: "Aguardando primeiro projeto", tone: "primary" as const }
      : { label: "Tudo operando bem", tone: "success" as const };

  return (
    <div className="flex-1 overflow-auto scrollbar-thin">
      <div className="max-w-[1400px] mx-auto p-6 space-y-6">
        <div className="rounded-xl p-6 border border-border glass-strong relative overflow-hidden">
          <div
            className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-30 blur-3xl"
            style={{ background: "var(--gradient-primary)" }}
          />
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-primary mb-2 flex items-center gap-2">
                <GreetIcon className="h-3 w-3" />
                {now.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {greeting.text}, {firstName}.
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                {projectsQuery.isLoading
                  ? "Buscando o estado das suas plantas..."
                  : latestProject
                    ? `${greeting.hint} Você mexeu pela última vez em "${latestProject.name}" ${lastEdited ?? "há pouco"}.`
                    : `${greeting.hint} Crie sua primeira planta para começar a projetar, simular e operar.`}
              </p>
              <div className="mt-4 flex gap-2 flex-wrap">
                {latestProject ? (
                  <Link
                    to="/workspace"
                    search={{ projectId: latestProject.id }}
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-semibold text-primary-foreground glow-primary"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    Voltar para {latestProject.name}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <Link
                    to="/projects"
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-semibold text-primary-foreground glow-primary"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    Criar primeiro projeto
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
                <Link
                  to="/ai"
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm font-medium border border-border hover:bg-accent"
                >
                  <Sparkles className="h-4 w-4 text-primary" /> Pedir ajuda à IA
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 min-w-[300px]">
              <Kpi
                icon={FolderKanban}
                label="Projetos ativos"
                value={String(activeProjects.length)}
                hint={
                  activeProjects.length === 0
                    ? "Nenhum por enquanto"
                    : `${projects.length - activeProjects.length} arquivado(s)`
                }
                tone="primary"
              />
              <Kpi
                icon={Sparkles}
                label="Créditos IA"
                value={creditsLabel}
                hint="renovam diariamente"
                tone="success"
              />
              <Kpi
                icon={Cpu}
                label="Status da planta"
                value={plantHealth.label}
                tone={plantHealth.tone}
              />
              <Kpi
                icon={AlertTriangle}
                label="Pendências"
                value={projectsQuery.isError ? "Erro" : "Nenhuma"}
                hint={projectsQuery.isError ? "tente recarregar" : "respira fundo"}
                tone={projectsQuery.isError ? "warning" : "success"}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard
            id="energy"
            title="Energia"
            subtitle="consumo agregado · kWh"
            color="oklch(0.78 0.17 200)"
          />
          <ChartCard
            id="production"
            title="Produção"
            subtitle="unidades/hora médias"
            color="oklch(0.78 0.18 150)"
          />
          <ChartCard
            id="temperature"
            title="Temperatura"
            subtitle="média ponderada · °C"
            color="oklch(0.86 0.20 90)"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold">Onde você parou</h2>
                <p className="text-[11px] text-muted-foreground">
                  Seus projetos recentes, prontos para continuar.
                </p>
              </div>
              <Link to="/projects" className="text-[11px] text-primary hover:underline">
                Ver todos
              </Link>
            </div>
            {projectsQuery.isLoading ? (
              <div className="h-36 grid place-items-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : projectsQuery.isError ? (
              <EmptyState text="Não conseguimos carregar seus projetos agora. Tente novamente em instantes." />
            ) : activeProjects.length === 0 ? (
              <EmptyState text="Sua estante de projetos está vazia. Comece criando uma planta." />
            ) : (
              <div className="space-y-2">
                {activeProjects.slice(0, 5).map((project) => {
                  const when = project.updated_at
                    ? formatDistanceToNow(new Date(project.updated_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })
                    : "data desconhecida";
                  return (
                    <Link
                      key={project.id}
                      to="/workspace"
                      search={{ projectId: project.id }}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/40 transition-colors group"
                    >
                      <span className="h-2 w-2 rounded-full bg-success energized" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {project.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {project.client ?? project.description ?? "Sem cliente vinculado"} ·{" "}
                          atualizado {when}
                        </div>
                      </div>
                      <div className="w-32 h-8 hidden sm:block">
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
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-1">Linha do tempo</h2>
            <p className="text-[11px] text-muted-foreground mb-3">
              Pequenas movimentações da sua oficina digital.
            </p>
            <ul className="space-y-3 text-[12px]">
              {projects.slice(0, 6).map((project) => {
                const when = project.updated_at
                  ? formatDistanceToNow(new Date(project.updated_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })
                  : "há algum tempo";
                return (
                  <li key={project.id} className="flex gap-2">
                    <Activity className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    <span>
                      <span className="font-medium">{project.name}</span>{" "}
                      <span className="text-muted-foreground">recebeu ajustes {when}</span>
                    </span>
                  </li>
                );
              })}
              {projects.length === 0 && (
                <li className="flex gap-2 text-muted-foreground">
                  <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Nada por aqui ainda. Quando você criar algo, a história começa.</span>
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
  hint,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone: "success" | "primary" | "warning";
}) {
  const colors = { success: "text-success", primary: "text-primary", warning: "text-warning" };
  return (
    <div className="rounded-lg border border-border bg-card/70 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`text-lg font-mono mt-1 truncate ${colors[tone]}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-36 grid place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground px-4 text-center">
      {text}
    </div>
  );
}

function ChartCard({
  id,
  title,
  subtitle,
  color,
}: {
  id: string;
  title: string;
  subtitle: string;
  color: string;
}) {
  const data = Array.from({ length: 30 }, (_, index) => ({
    v: 30 + Math.sin(index / 2) * 10 + ((index * 5) % 8),
  }));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-xs font-semibold">{title}</div>
          <div className="text-[10px] text-muted-foreground">{subtitle}</div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color }}>
          ● ao vivo
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
