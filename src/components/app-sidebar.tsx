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
} from "lucide-react";
import { BrandBolt } from "@/components/brand-bolt";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useCurrentProject } from "@/lib/current-project";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Projetos", url: "/projects", icon: FolderKanban },
  { title: "Industrial Workspace", url: "/workspace", icon: Cpu, accent: true },
  { title: "IA Industrial", url: "/ai", icon: Sparkles, core: true },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Clientes", url: "/clients", icon: Users },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const project = useCurrentProject((s) => s.project);
  const hydrate = useCurrentProject((s) => s.hydrateFromStorage);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <aside className="hidden md:flex w-[240px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
        <div
          className="relative h-8 w-8 rounded-md flex items-center justify-center"
          style={{ background: "var(--gradient-primary)" }}
        >
          <BrandBolt className="h-4 w-4 text-primary-foreground" />
          <span className="absolute -inset-px rounded-md ring-1 ring-primary/40 glow-primary" />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
            EletricAI
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Industrial OS
          </div>
        </div>
      </div>

      {project && (
        <Link
          to="/onboarding"
          className="mx-3 mt-3 rounded-md border border-border bg-card/60 hover:bg-accent/40 transition-colors p-2.5 group"
        >
          <div className="flex items-center gap-2">
            <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Projeto ativo
              </div>
              <div className="text-[12px] font-medium truncate text-sidebar-foreground">
                {project.name}
              </div>
            </div>
          </div>
        </Link>
      )}

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {items.map((item) => {
          const active = path === item.url || path.startsWith(item.url + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all",
                "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                active && "bg-sidebar-accent text-sidebar-foreground",
                (item.accent || item.core) && active && "ring-1 ring-primary/40",
              )}
            >
              <Icon
                className={cn("h-4 w-4", active && "text-primary", item.core && "text-primary")}
              />
              <span className="flex-1">{item.title}</span>
              {item.accent && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-primary/80">
                  OS
                </span>
              )}
              {item.core && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-primary/80">
                  CORE
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-sidebar-border">
        <div className="rounded-md glass p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success energized" />
            Runtime online · 24ms
          </div>
          <div className="mt-1 text-[10px] font-mono text-muted-foreground">
            v0.1.0 · build 2026.05
          </div>
        </div>
      </div>
    </aside>
  );
}
