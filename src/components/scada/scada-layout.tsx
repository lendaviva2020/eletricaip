// SCADA SUPERVISÓRIO — Industrial Supervisory Layout Shell
// Standards: IEC 62443 (Multi-tenant Authorization), ISA-101 (HMI Ergonomics)

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  ShieldWarning,
  LockSimple,
  FolderOpen,
  Broadcast,
  CircleNotch,
  ArrowRight,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import {
  resolveScadaProjectContext,
  listAccessibleScadaProjects,
} from "@/lib/scada/scada.functions";
import { DEMO_ETE_PROJECT_ID } from "@/lib/scada/demo-ete-seed";
import { syncUnifiedDocToScada } from "@/lib/scada/canonical-bridge";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { Button } from "@/components/ui/button";
import { ScadaHeader } from "./scada-header";
import { ScadaSidebar } from "./scada-sidebar";
import { ScadaOsStatusBar } from "./scada-os-status-bar";
import { EquipmentInspectorDrawer } from "./equipment-inspector-drawer";
import { ScadaOverviewView } from "./views/scada-overview-view";
import { ScadaSynopticsView } from "./views/scada-synoptics-view";
import { ScadaAlarmsView } from "./views/scada-alarms-view";
import { ScadaTrendsView } from "./views/scada-trends-view";
import { ScadaEquipmentView } from "./views/scada-equipment-view";
import { ScadaTagsView } from "./views/scada-tags-view";
import { ScadaCommunicationView } from "./views/scada-communication-view";
import { ScadaEventsView } from "./views/scada-events-view";
import { ScadaReportsView } from "./views/scada-reports-view";
import { ScadaHmiEditorView } from "./views/scada-hmi-editor-view";
import { ScadaSettingsView } from "./views/scada-settings-view";

interface ScadaLayoutProps {
  projectId?: string | null;
}

export function ScadaLayout({ projectId }: ScadaLayoutProps) {
  const navigate = useNavigate();
  const activeView = useScadaStore((s) => s.activeView);
  const setProjectContext = useScadaStore((s) => s.setProjectContext);
  const clearProjectContext = useScadaStore((s) => s.clearProjectContext);

  const resolveContextFn = useServerFn(resolveScadaProjectContext);
  const listProjectsFn = useServerFn(listAccessibleScadaProjects);

  // 1. If projectId is provided, authorize and resolve context server-side
  const {
    data: projectContext,
    isLoading: isContextLoading,
    error: contextError,
    refetch: refetchContext,
  } = useQuery({
    queryKey: ["scada-project-context", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return resolveContextFn({ data: { projectId } });
    },
    enabled: Boolean(projectId),
    retry: false,
    staleTime: 60 * 1000,
  });

  // 2. If projectId is absent, query user's accessible projects
  const { data: accessibleProjects, isLoading: isListLoading } = useQuery({
    queryKey: ["scada-accessible-projects"],
    queryFn: async () => listProjectsFn(),
    enabled: !projectId,
    staleTime: 30 * 1000,
  });

  // 3. Effect: Synchronize resolved context with useScadaStore
  useEffect(() => {
    if (!projectContext) {
      if (!projectId) {
        clearProjectContext();
      }
      return;
    }

    const { project, isDemo } = projectContext;

    if (isDemo) {
      setProjectContext({
        projectId: project.id,
        tenantId: project.tenantId,
        projectName: project.name,
        isDemo: true,
      });
      return;
    }

    // Customer project: Check if unified store has matching document
    const unifiedDoc = useUnifiedProjectStore.getState().doc;
    if (unifiedDoc && unifiedDoc.metadata.id === project.id) {
      syncUnifiedDocToScada(unifiedDoc, project.tenantId);
    } else {
      setProjectContext({
        projectId: project.id,
        tenantId: project.tenantId,
        projectName: project.name,
        isDemo: false,
      });
    }
  }, [projectContext, projectId, setProjectContext, clearProjectContext]);

  // ── Render: Loading State ────────────────────────────────────────────────
  if (projectId && isContextLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#080b11] text-foreground p-6">
        <CircleNotch className="w-10 h-10 text-primary animate-spin mb-4" />
        <h2 className="text-base font-bold text-white uppercase tracking-wider">
          Autenticando Contexto SCADA
        </h2>
        <p className="text-xs text-zinc-400 font-mono mt-1">
          Validando credenciais, isolamento multi-tenant e integridade do projeto...
        </p>
      </div>
    );
  }

  // ── Render: Security Error / Cross-tenant Rejection / Not Found ───────────
  if (projectId && contextError) {
    const errorMsg = contextError instanceof Error ? contextError.message : String(contextError);
    const isNotFound = errorMsg.includes("NOT_FOUND");
    const isForbidden = errorMsg.includes("FORBIDDEN");
    const isDbUnavailable =
      errorMsg.includes("DB_ERROR") || errorMsg.includes("fetch") || errorMsg.includes("Network");

    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#080b11] text-foreground p-6 select-none">
        <div className="max-w-md w-full bg-[#0d121c] border border-red-500/40 rounded-lg p-6 shadow-2xl text-center">
          <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 mx-auto mb-4">
            {isNotFound ? <FolderOpen className="w-6 h-6" /> : <LockSimple className="w-6 h-6" />}
          </div>

          <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider font-mono">
            {isNotFound
              ? "PROJETO NÃO ENCONTRADO (404)"
              : isForbidden
                ? "ACESSO NÃO AUTORIZADO (403 FORBIDDEN)"
                : isDbUnavailable
                  ? "SERVIÇO INDISPONÍVEL (503)"
                  : "ERRO DE CONTEXTO DO PROJETO"}
          </h2>
          <p className="text-xs text-zinc-300 font-mono mt-2 leading-relaxed">
            {isNotFound
              ? "O projeto solicitado não foi localizado no sistema ou o identificador informado é inválido."
              : isForbidden
                ? "Violação de fronteira multi-tenant. Você não possui permissão para acessar este supervisório (IEC 62443)."
                : errorMsg}
          </p>

          <div className="mt-6 flex flex-col gap-2">
            {isDbUnavailable && (
              <Button
                variant="default"
                size="sm"
                onClick={() => refetchContext()}
                className="w-full flex items-center justify-center gap-2"
              >
                <CircleNotch className="w-4 h-4" />
                <span>Tentar Novamente</span>
              </Button>
            )}

            <Button
              variant="default"
              size="sm"
              onClick={() => navigate({ to: "/projects" })}
              className="w-full flex items-center justify-center gap-2"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Ver Meus Projetos Autorizados</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate({
                  to: "/scada",
                  search: { projectId: DEMO_ETE_PROJECT_ID },
                })
              }
              className="w-full flex items-center justify-center gap-2 border-zinc-700 text-zinc-300 hover:text-white"
            >
              <Broadcast className="w-4 h-4 text-blue-400" />
              <span>Abrir Planta de Demonstração (Demo ETE)</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Project Selection (When projectId is missing) ─────────────────
  if (!projectId) {
    return (
      <div className="flex flex-col h-full w-full bg-[#080b11] text-foreground overflow-y-auto p-6 md:p-10 select-none">
        <div className="max-w-3xl w-full mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-md bg-blue-950/60 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-inner">
              <Broadcast className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white uppercase tracking-tight">
                SCADA Supervisório Industrial · Seleção de Planta
              </h1>
              <p className="text-xs text-zinc-400 font-mono">
                Cada supervisório opera sob contexto persistente de projeto com isolamento
                multi-tenant (IEC 62443).
              </p>
            </div>
          </div>

          {/* Project List */}
          <div className="space-y-4">
            <div className="text-xs font-mono font-semibold uppercase text-zinc-400 tracking-wider">
              Projetos do seu Workspace:
            </div>

            {isListLoading ? (
              <div className="p-8 flex items-center justify-center text-xs text-zinc-500 font-mono">
                <CircleNotch className="w-5 h-5 text-primary animate-spin mr-2" />
                Carregando projetos disponíveis...
              </div>
            ) : (accessibleProjects?.length ?? 0) > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {accessibleProjects?.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      navigate({
                        to: "/scada",
                        search: { projectId: p.id },
                      })
                    }
                    className="flex flex-col text-left p-4 rounded-lg bg-[#0e141f] border border-[#1e293b] hover:border-primary/50 hover:bg-[#131b2a] transition-all group shadow-sm"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-bold text-white text-sm group-hover:text-primary transition-colors truncate">
                        {p.name}
                      </span>
                      <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                    <p className="text-xs text-zinc-400 line-clamp-2">
                      {p.description || "Projeto de engenharia elétrica e automação industrial."}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span>ID: {p.id.slice(0, 8)}...</span>
                      <span>
                        Atualizado em: {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-lg bg-[#0e141f] border border-dashed border-zinc-800 text-center">
                <p className="text-xs text-zinc-400 font-mono">
                  Nenhum projeto encontrado no seu workspace atual.
                </p>
                <Button size="sm" onClick={() => navigate({ to: "/projects" })} className="mt-3">
                  Criar Novo Projeto no Workspace
                </Button>
              </div>
            )}

            {/* Demo Plant Option */}
            <div className="pt-6 border-t border-[#1e293b]">
              <div className="text-xs font-mono font-semibold uppercase text-amber-400 tracking-wider mb-3 flex items-center gap-2">
                <ShieldWarning className="w-4 h-4" />
                <span>Ambiente Demonstrativo Isolado:</span>
              </div>

              <button
                onClick={() =>
                  navigate({
                    to: "/scada",
                    search: { projectId: DEMO_ETE_PROJECT_ID },
                  })
                }
                className="w-full flex items-center justify-between p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 hover:border-amber-500/50 transition-all text-left group"
              >
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm group-hover:text-amber-300 transition-colors">
                      Estação de Tratamento de Efluentes (Demo ETE)
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      SIMULAÇÃO VIRTUAL
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 mt-1">
                    Planta completa com 11 visões, P&ID vetorial, alarmes ISA-18.2 e tendências
                    senoidais em memória para validação de layout.
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-amber-400 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Full SCADA Supervisory Layout ─────────────────────────────────
  return (
    <div
      className="flex flex-col h-full w-full bg-[#080b11] overflow-hidden select-none"
      data-testid="scada-supervisory-system"
    >
      {/* Top SCADA Header */}
      <ScadaHeader />

      {/* Main SCADA Workspace: Sidebar + Central View */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <ScadaSidebar />

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {activeView === "overview" && <ScadaOverviewView />}
          {activeView === "synoptics" && <ScadaSynopticsView />}
          {activeView === "alarms" && <ScadaAlarmsView />}
          {activeView === "trends" && <ScadaTrendsView />}
          {activeView === "equipments" && <ScadaEquipmentView />}
          {activeView === "tags" && <ScadaTagsView />}
          {activeView === "communication" && <ScadaCommunicationView />}
          {activeView === "events" && <ScadaEventsView />}
          {activeView === "reports" && <ScadaReportsView />}
          {activeView === "hmi" && <ScadaHmiEditorView />}
          {activeView === "settings" && <ScadaSettingsView />}
        </main>

        {/* Equipment Slide-over Inspector */}
        <EquipmentInspectorDrawer />
      </div>

      {/* Bottom Industrial OS Status Bar */}
      <ScadaOsStatusBar />
    </div>
  );
}
