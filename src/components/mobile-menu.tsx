import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Menu,
  X,
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
import { cn } from "@/lib/utils";
import { useCurrentProject } from "@/lib/current-project";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Projetos", url: "/projects", icon: FolderKanban },
  { title: "Workspace", url: "/workspace", icon: Cpu, accent: true },
  { title: "IA Industrial", url: "/ai", icon: Sparkles, core: true },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Clientes", url: "/clients", icon: Users },
  { title: "Configurações", url: "/settings", icon: Settings },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const project = useCurrentProject((s) => s.project);
  const hydrate = useCurrentProject((s) => s.hydrateFromStorage);

  useEffect(() => {
    hydrate();
  }, [hydrate]);
  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden h-9 w-9 grid place-items-center rounded-md hover:bg-accent/40 text-foreground"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div className="md:hidden fixed inset-0 z-[1000]">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-sidebar border-r border-sidebar-border flex flex-col animate-in slide-in-from-left">
            <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
              <div
                className="h-8 w-8 rounded-md flex items-center justify-center"
                style={{ background: "var(--gradient-primary)" }}
              >
                <BrandBolt className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="leading-tight flex-1">
                <div className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
                  EletricAI
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Industrial OS
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 grid place-items-center rounded hover:bg-accent/40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {project && (
              <Link
                to="/onboarding"
                className="mx-3 mt-3 rounded-md border border-border bg-card/60 hover:bg-accent/40 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Projeto ativo
                    </div>
                    <div className="text-[12px] font-medium truncate">{project.name}</div>
                  </div>
                </div>
              </Link>
            )}

            <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-auto scrollbar-thin">
              {items.map((item) => {
                const active = path === item.url || path.startsWith(item.url + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.url}
                    to={item.url}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all",
                      "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      active && "bg-sidebar-accent text-sidebar-foreground ring-1 ring-primary/30",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        active && "text-primary",
                        item.core && "text-primary",
                      )}
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
          </aside>
        </div>
      )}
    </>
  );
}
