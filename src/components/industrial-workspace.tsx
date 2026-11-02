import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { ClientOnly, useRouter } from "@tanstack/react-router";
import { ModeTabs } from "@/components/mode-tabs";
import { UnifiedBottomDock } from "@/components/editor/unified-bottom-dock";
import { RightPanel } from "@/components/right-panel";
import {
  CircleNotch,
  CheckCircle,
  WarningCircle,
  CaretLeft,
  CaretRight,
  FolderOpen,
  PlusCircle,
  FileText,
  DownloadSimple,
  Robot,
} from "@phosphor-icons/react";
import { CanvasAiChat } from "@/components/canvas-ai-chat";
import { useProjectPersistence } from "@/lib/use-project-persistence";
import { isBreakerComponent, type VoltaiComponentType } from "@/lib/palette/component-catalog";
import { LeftSidebarHost } from "@/components/editor/left-sidebar-host";
import { useEditorStore } from "@/lib/editor/store";
import { shouldAutoCollapsePanels } from "@/lib/editor/tablet-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { EditorAiConfigBanner } from "@/components/editor-ai-config-banner";
import { OnboardingTour } from "@/components/onboarding-tour";
import { EngineeringDossierModal } from "@/components/dossier/engineering-dossier-modal";
import { UniversalImportModal } from "@/components/importer/universal-import-modal";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

const UnifilarCanvas = lazy(() =>
  import("@/components/canvases/webgl-canvas").then((m) => ({ default: m.WebglCanvas })),
);
const LadderCanvas = lazy(() =>
  import("@/components/canvases/ladder-canvas").then((m) => ({ default: m.LadderCanvas })),
);
const FbdCanvas = lazy(() =>
  import("@/components/canvases/fbd-canvas").then((m) => ({ default: m.FbdCanvas })),
);
const ScadaLayout = lazy(() =>
  import("@/components/scada/scada-layout").then((m) => ({ default: m.ScadaLayout })),
);
const TwinCanvas = lazy(() =>
  import("@/components/canvases/twin-canvas").then((m) => ({ default: m.TwinCanvas })),
);
const PlcCanvas = lazy(() =>
  import("@/components/canvases/plc-canvas").then((m) => ({ default: m.PlcCanvas })),
);
const SimCanvas = lazy(() =>
  import("@/components/canvases/sim-canvas").then((m) => ({ default: m.SimCanvas })),
);
const AlarmsCanvas = lazy(() =>
  import("@/components/canvases/alarms-canvas").then((m) => ({ default: m.AlarmsCanvas })),
);

export function IndustrialWorkspace({ projectId = null }: { projectId?: string | null }) {
  const router = useRouter();
  const mode = useEditorStore((s) => s.activeMode);
  const setMode = useEditorStore((s) => s.setActiveMode);
  const leftCollapsed = useEditorStore((s) => s.leftCollapsed);
  const rightCollapsed = useEditorStore((s) => s.rightCollapsed);
  const toggleLeftPanel = useEditorStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useEditorStore((s) => s.toggleRightPanel);
  const setDragValidation = useEditorStore((s) => s.setDragValidation);
  const setValidateComponent = useEditorStore((s) => s.setValidateComponent);

  const validateDraggedBreaker = useCallback(
    (componentType: VoltaiComponentType): boolean => {
      const isBreaker: boolean = isBreakerComponent(componentType);
      setDragValidation(
        isBreaker
          ? `${componentType} validado como disjuntor local.`
          : `${componentType} não é disjuntor; permitido como componente unifilar.`,
      );
      return isBreaker;
    },
    [setDragValidation],
  );

  useEffect(() => {
    setValidateComponent(validateDraggedBreaker);
    return () => setValidateComponent(null);
  }, [validateDraggedBreaker, setValidateComponent]);

  // Fase 8.1: em tablets (< 1280px, ex.: 1024x768) inicia com painéis recolhidos
  // para maximizar a área de desenho. Roda só na montagem; o usuário reabre pelas alças.
  const setPanelsCollapsed = useEditorStore((s) => s.setPanelsCollapsed);
  useEffect(() => {
    if (typeof window !== "undefined" && shouldAutoCollapsePanels(window.innerWidth)) {
      setPanelsCollapsed(true, true);
    }
  }, [setPanelsCollapsed]);

  const { loading, saveState, conflict, resolveConflict } = useProjectPersistence(projectId);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [importerOpen, setImporterOpen] = useState(false);
  const [importerPayload, setImporterPayload] = useState<string>("");
  const [importerTab, setImporterTab] = useState<"input" | "preview" | "render" | "export">(
    "input",
  );

  // Interceptador e ouvinte global para pacotes colados no chat ou acionados na interface
  useEffect(() => {
    const handler = (e: any) => {
      const payload = e?.detail?.payload || "";
      const tab = e?.detail?.initialTab || (payload ? "input" : "export");
      setImporterPayload(payload);
      setImporterTab(tab);
      setImporterOpen(true);
    };
    window.addEventListener("eletricai-open-importer", handler);
    return () => window.removeEventListener("eletricai-open-importer", handler);
  }, []);

  if (!projectId) {
    return <WorkspaceEmptyState />;
  }

  if (loading) {
    return <WorkspaceLoading />;
  }

  return (
    <div className="flex-1 flex min-h-0 min-w-0 h-full w-full relative overflow-hidden">
      {/* Backdrop para gavetas móveis/tablet (< 1024px) quando algum painel lateral estiver aberto */}
      {(!leftCollapsed || !rightCollapsed) && (
        <div
          onClick={() => setPanelsCollapsed(true, true)}
          className="lg:hidden absolute inset-0 z-30 bg-black/50"
          aria-hidden="true"
        />
      )}

      {/* Gaveta esquerda em mobile/tablet (< 1024px) */}
      {!leftCollapsed && mode !== "scada" && (
        <div className="lg:hidden flex absolute left-0 inset-y-0 z-40 border-r border-border bg-panel h-full overflow-hidden">
          <LeftSidebarHost mode={mode} />
          <button
            onClick={toggleLeftPanel}
            className="flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-3 [@media(pointer:coarse)]:h-16 [@media(pointer:coarse)]:w-7 [@media(pointer:coarse)]:-right-7 bg-panel border border-border border-l-0 rounded-r-sm items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors touch-manipulation"
            title="Recolher painel esquerdo"
            aria-label="Recolher painel esquerdo"
          >
            <CaretLeft className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Alça para expandir o painel esquerdo quando recolhido */}
      {leftCollapsed && mode !== "scada" && (
        <button
          onClick={toggleLeftPanel}
          className="flex absolute left-0 top-1/2 -translate-y-1/2 z-30 h-12 w-4 [@media(pointer:coarse)]:h-16 [@media(pointer:coarse)]:w-6 bg-panel border border-border border-l-0 rounded-r-sm items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors touch-manipulation"
          title="Expandir biblioteca de componentes"
          aria-label="Expandir painel esquerdo"
        >
          <CaretRight className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Layout Redimensionável de 3 Colunas (Biblioteca | Canvas | Propriedades) */}
      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 min-h-0 min-w-0 h-full w-full"
      >
        {!leftCollapsed && mode !== "scada" && (
          <>
            <ResizablePanel
              id="workspace-left-panel"
              defaultSize={280}
              minSize={220}
              maxSize={420}
              groupResizeBehavior="preserve-pixel-size"
              className="hidden lg:flex relative h-full min-h-0 min-w-0 overflow-hidden"
            >
              <div className="flex relative w-full h-full min-h-0 min-w-0 overflow-hidden">
                <LeftSidebarHost mode={mode} />
                <button
                  onClick={toggleLeftPanel}
                  className="flex absolute right-0 top-1/2 -translate-y-1/2 z-20 h-10 w-3 bg-panel border border-border border-r-0 rounded-l-sm items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  title="Recolher painel esquerdo"
                  aria-label="Recolher painel esquerdo"
                >
                  <CaretLeft className="h-3 w-3" />
                </button>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className="hidden lg:flex" />
          </>
        )}

        {/* Área Central (Canvas + Controles) */}
        <ResizablePanel
          id="workspace-center-panel"
          minSize="30%"
          className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden"
        >
          <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
            <ModeTabs />
            <ErrorBoundary fallback={null}>
              <EditorAiConfigBanner />
            </ErrorBoundary>
            <SaveBadge
              projectId={projectId}
              loading={loading}
              state={saveState}
              onOpenDossier={() => setDossierOpen(true)}
              onOpenPrompt={() => {
                setImporterPayload("");
                setImporterTab("export");
                setImporterOpen(true);
              }}
              onOpenImporter={() => {
                setImporterPayload("");
                setImporterTab("input");
                setImporterOpen(true);
              }}
            />
            <div className="flex-1 min-h-0 min-w-0 relative bg-background overflow-hidden h-full w-full flex flex-col">
              {/* ErrorBoundary keyed por `mode`: isola crashes (ex.: React #185)
                  ao canvas ativo e cria um boundary fresco ao trocar de aba. */}
              <ErrorBoundary key={mode}>
                {/* ClientOnly é obrigatório: sem ele o SSR resolve os React.lazy abaixo
                    e avalia Pixi/Three/Konva no servidor (Worker), o que derruba a
                    renderização inteira da rota. */}
                <ClientOnly fallback={<CanvasFallback />}>
                  <Suspense fallback={<CanvasFallback />}>
                    {mode === "unifilar" && (
                      <UnifilarCanvas projectId={projectId} sheet="unifilar" />
                    )}
                    {mode === "multifilar" && (
                      <UnifilarCanvas projectId={projectId} sheet="multifilar" />
                    )}
                    {mode === "ladder" && <LadderCanvas />}
                    {mode === "fbd" && <FbdCanvas />}
                    {mode === "scada" && <ScadaLayout projectId={projectId} />}
                    {mode === "twin" && <TwinCanvas />}
                    {mode === "plc" && <PlcCanvas />}
                    {mode === "sim" && <SimCanvas />}
                    {mode === "alarms" && <AlarmsCanvas />}
                  </Suspense>
                </ClientOnly>
              </ErrorBoundary>

              <ErrorBoundary fallback={null}>
                <CanvasAiChat />
              </ErrorBoundary>
            </div>
            {mode !== "scada" && (
              <ErrorBoundary fallback={null}>
                <UnifiedBottomDock />
              </ErrorBoundary>
            )}
          </div>
        </ResizablePanel>

        {!rightCollapsed && mode !== "scada" && (
          <>
            <ResizableHandle withHandle className="hidden lg:flex" />
            <ResizablePanel
              id="workspace-right-panel"
              defaultSize={320}
              minSize={260}
              maxSize={480}
              groupResizeBehavior="preserve-pixel-size"
              className="hidden lg:flex relative h-full min-h-0 min-w-0 overflow-hidden"
            >
              <div className="flex relative w-full h-full min-h-0 min-w-0 overflow-hidden">
                <button
                  onClick={toggleRightPanel}
                  className="flex absolute left-0 top-1/2 -translate-y-1/2 z-20 h-10 w-3 bg-panel border border-border border-l-0 rounded-r-sm items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  title="Recolher painel direito"
                  aria-label="Recolher painel direito"
                >
                  <CaretRight className="h-3 w-3" />
                </button>
                <RightPanel />
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Gaveta direita em mobile/tablet (< 1024px) */}
      {!rightCollapsed && mode !== "scada" && (
        <div className="lg:hidden flex absolute right-0 inset-y-0 z-40 border-l border-border bg-panel h-full">
          <button
            onClick={toggleRightPanel}
            className="flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-3 [@media(pointer:coarse)]:h-16 [@media(pointer:coarse)]:w-7 [@media(pointer:coarse)]:-left-7 bg-panel border border-border border-r-0 rounded-l-sm items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors touch-manipulation"
            title="Recolher painel direito"
            aria-label="Recolher painel direito"
          >
            <CaretRight className="h-3 w-3" />
          </button>
          <RightPanel />
        </div>
      )}

      {/* Alça para expandir o painel direito quando recolhido */}
      {rightCollapsed && mode !== "scada" && (
        <button
          onClick={toggleRightPanel}
          className="flex absolute right-0 top-1/2 -translate-y-1/2 z-30 h-12 w-4 [@media(pointer:coarse)]:h-16 [@media(pointer:coarse)]:w-6 bg-panel border border-border border-r-0 rounded-l-sm items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors touch-manipulation"
          title="Expandir painel de propriedades e IA"
          aria-label="Expandir painel direito"
        >
          <CaretLeft className="h-3.5 w-3.5" />
        </button>
      )}

      <OnboardingTour />

      {/* Modal de Conflito de Versão Concorrente */}
      <Dialog
        open={!!conflict}
        onOpenChange={(open) => {
          if (!open && conflict) resolveConflict("reload");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <WarningCircle className="h-5 w-5" />
              Conflito de Versão Detectado
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm text-foreground/80 space-y-2">
              <span className="block">
                Este projeto foi modificado no servidor por outra sessão ou usuário.
              </span>
              <span className="block text-xs text-muted-foreground bg-muted p-2.5 rounded font-mono break-all">
                {conflict?.message}
              </span>
              <span className="block text-xs">
                Para evitar inconsistências ou perda de alterações, escolha como prosseguir:
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2 mt-2">
            <button
              onClick={() => resolveConflict("reload")}
              className="px-4 py-2 text-sm font-medium rounded-md border border-border bg-background hover:bg-accent text-foreground transition-colors"
            >
              Recarregar do servidor
            </button>
            <button
              onClick={() => resolveConflict("overwrite")}
              className="px-4 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              Sobrescrever servidor
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Interativo do Dossiê Técnico de Engenharia */}
      <EngineeringDossierModal
        projectId={projectId}
        open={dossierOpen}
        onOpenChange={setDossierOpen}
      />

      {/* Modal do Importador Universal Seguro (0 Créditos de IA) */}
      <UniversalImportModal
        open={importerOpen}
        onOpenChange={setImporterOpen}
        initialPayload={importerPayload}
        initialTab={importerTab}
        projectId={projectId}
      />
    </div>
  );
}

function CanvasFallback() {
  return (
    <div className="h-full w-full grid place-items-center text-[11px] text-muted-foreground">
      Carregando canvas...
    </div>
  );
}

function WorkspaceLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <CircleNotch className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Carregando projeto...</p>
      </div>
    </div>
  );
}

function WorkspaceEmptyState() {
  const router = useRouter();
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="max-w-md text-center space-y-4 px-6 py-8 rounded-md border border-border bg-card">
        <div className="w-10 h-10 mx-auto rounded-md border border-border bg-secondary flex items-center justify-center">
          <FolderOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Nenhum projeto aberto</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Abra um projeto existente ou crie um novo para trabalhar no workspace industrial.
          </p>
        </div>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => router.navigate({ to: "/projects" })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Abrir projeto
          </button>
          <button
            onClick={() => router.navigate({ to: "/onboarding" })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-accent transition-colors"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Novo projeto
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveBadge({
  projectId,
  loading,
  state,
  onOpenDossier,
  onOpenImporter,
  onOpenPrompt,
}: {
  projectId: string | null;
  loading: boolean;
  state: "idle" | "saving" | "saved" | "error";
  onOpenDossier: () => void;
  onOpenImporter?: () => void;
  onOpenPrompt?: () => void;
}) {
  if (!projectId) return null;
  return (
    <div className="h-7 px-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground border-b border-border bg-panel/40 overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-1.5 text-[10px] shrink-0">
        {loading ? (
          <>
            <CircleNotch className="h-3 w-3 animate-spin" /> Carregando projeto...
          </>
        ) : state === "saving" ? (
          <>
            <CircleNotch className="h-3 w-3 animate-spin" /> Salvando...
          </>
        ) : state === "saved" ? (
          <>
            <CheckCircle className="h-3 w-3 text-success" /> Salvo
          </>
        ) : state === "error" ? (
          <>
            <WarningCircle className="h-3 w-3 text-destructive" /> Erro ao salvar
          </>
        ) : (
          <>Auto-save ativo (2s)</>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onOpenPrompt}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-all cursor-pointer shadow-xs whitespace-nowrap"
          title="Copiar prompt padronizado para ChatGPT, Claude ou DeepSeek (0 créditos)"
        >
          <Robot className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prompt IA Externa</span>
          <span className="sm:hidden">Prompt IA</span>
        </button>

        <button
          onClick={onOpenImporter}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer shadow-xs whitespace-nowrap"
          title="Importar projetos criados por IAs externas sem consumir créditos"
        >
          <DownloadSimple className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Importar IA Externa</span>
          <span className="sm:hidden">Importar</span>
        </button>

        <button
          onClick={onOpenDossier}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all cursor-pointer shadow-xs whitespace-nowrap"
          title="Gerar Dossiê Técnico de Engenharia a partir do Canvas"
        >
          <FileText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Gerar Dossiê Técnico</span>
          <span className="sm:hidden">Dossiê</span>
        </button>
      </div>
    </div>
  );
}
