import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  Cpu,
  BarChart3,
  Users,
  Sparkles,
  Settings,
  FolderOpen,
  Box,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect } from "react";
import { BrandBolt } from "@/components/brand-bolt";
import { cn } from "@/lib/utils";
import { useCurrentProject } from "@/lib/current-project";
import { useI18n } from "@/lib/i18n";
import { useEditorStore } from "@/lib/editor/store";
import { useProjectStore } from "@/lib/project-store";

type NavItem = {
  key: string;
  defaultTitle: string;
  url: string;
  icon: typeof LayoutDashboard;
  accent?: boolean;
  core?: boolean;
};

const items: NavItem[] = [
  { key: "dashboard", defaultTitle: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { key: "projects", defaultTitle: "Projetos", url: "/projects", icon: FolderKanban },
  { key: "workspace", defaultTitle: "Industrial Workspace", url: "/workspace", icon: Cpu, accent: true },
  { key: "twin", defaultTitle: "Digital Twin", url: "/digital-twin", icon: Box, accent: true },
  { key: "ai", defaultTitle: "IA Industrial", url: "/ai", icon: Sparkles, core: true },
  { key: "analytics", defaultTitle: "Analytics", url: "/analytics", icon: BarChart3 },
  { key: "clients", defaultTitle: "Clientes", url: "/clients", icon: Users },
  { key: "settings", defaultTitle: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { t } = useI18n();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const project = useCurrentProject((s) => s.project);
  const hydrate = useCurrentProject((s) => s.hydrateFromStorage);

  const collapsed = useEditorStore((s) => s.appSidebarCollapsed);
  const toggleCollapsed = useEditorStore((s) => s.toggleAppSidebar);
  const simulationStatus = useEditorStore((s) => s.simulationStatus);
  const runtime = useProjectStore((s) => s.runtime);
  const isSimActive = runtime.connected || simulationStatus === "running";
  const isSimPaused = !isSimActive && simulationStatus === "paused";

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <aside
      className={cn(
        "hidden md:flex shrink-0 flex-col border-r border-border bg-sidebar transition-all duration-200 select-none",
        collapsed ? "w-14" : "w-[240px]",
      )}
      data-testid="app-sidebar"
    >
      {/* 1. Brand Header */}
      <div className="flex items-center justify-between px-3 h-14 border-b border-sidebar-border">
        <div className="flex items-center gap-2 overflow-hidden">
          <div
            className="relative h-8 w-8 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-primary)" }}
            title="EletricAI Industrial OS"
          >
            <BrandBolt className="h-4 w-4 text-primary-foreground" />
            <span className="absolute -inset-px rounded-md ring-1 ring-primary/40 glow-primary" />
          </div>
          {!collapsed && (
            <div className="leading-tight truncate">
              <div className="text-[13px] font-semibold tracking-tight text-sidebar-foreground truncate">
                EletricAI
              </div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground truncate">
                {t("nav.industrialOs")}
              </div>
            </div>
          )}
        </div>

        {/* Botão de alternância recolher/expandir */}
        <button
          onClick={toggleCollapsed}
          className={cn(
            "h-7 w-7 rounded-md border border-border/60 bg-muted/30 hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0",
            collapsed && "mx-auto mt-1",
          )}
          title={collapsed ? "Expandir menu principal" : "Recolher menu principal"}
          aria-label={collapsed ? "Expandir menu principal" : "Recolher menu principal"}
          data-testid="toggle-app-sidebar"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* 2. Projeto Ativo */}
      {project && (
        <Link
          to="/onboarding"
          className={cn(
            "rounded-md border border-border bg-card/60 hover:bg-accent/40 transition-colors group",
            collapsed ? "mx-2 mt-2 p-2 flex justify-center" : "mx-3 mt-3 p-2.5",
          )}
          title={collapsed ? `Projeto: ${project.name}` : undefined}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("nav.activeProject")}
                </div>
                <div className="text-[12px] font-medium truncate text-sidebar-foreground">
                  {project.name}
                </div>
              </div>
            )}
          </div>
        </Link>
      )}

      {/* 3. Navegação Principal */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto scrollbar-none">
        {items.map((item) => {
          const active = path === item.url || path.startsWith(item.url + "/");
          const Icon = item.icon;
          const title = t(`nav.${item.key}`) || item.defaultTitle;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "group flex items-center rounded-md text-sm transition-all",
                collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2",
                "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                active && "bg-sidebar-accent text-sidebar-foreground",
                (item.accent || item.core) && active && "ring-1 ring-primary/40",
              )}
              title={collapsed ? title : undefined}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground group-hover:text-sidebar-foreground",
                  active && "text-primary",
                  item.core && "text-primary",
                )}
              />
              {!collapsed && <span className="flex-1 truncate">{title}</span>}
              {!collapsed && item.accent && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-primary/80">
                  OS
                </span>
              )}
              {!collapsed && item.core && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-primary/80">
                  CORE
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 4. Rodapé do Sidebar com Estado Real do Runtime */}
      <div className="p-2 border-t border-sidebar-border">
        <div className={cn("rounded-md glass", collapsed ? "p-2 flex justify-center" : "p-2.5")}>
          {collapsed ? (
            <div
              className="flex items-center justify-center"
              title={
                isSimActive
                  ? `Simulação Ativa · ${runtime.cycleMs || 100}ms`
                  : isSimPaused
                    ? "Simulação Pausada"
                    : "Simulação Parada"
              }
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  isSimActive
                    ? "bg-emerald-400 energized"
                    : isSimPaused
                      ? "bg-amber-400"
                      : "bg-muted-foreground/40",
                )}
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    isSimActive
                      ? "bg-emerald-400 energized"
                      : isSimPaused
                        ? "bg-amber-400"
                        : "bg-muted-foreground/40",
                  )}
                />
                <span
                  className={
                    isSimActive
                      ? "text-emerald-400 font-semibold"
                      : isSimPaused
                        ? "text-amber-300 font-semibold"
                        : ""
                  }
                >
                  {isSimActive
                    ? "Simulação Ativa"
                    : isSimPaused
                      ? "Simulação Pausada"
                      : "Simulação Parada"}
                </span>
              </div>
              <div className="mt-1 text-[10px] font-mono text-muted-foreground/80 flex items-center justify-between">
                <span>v0.1.0</span>
                <span>IEC / NBR</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
