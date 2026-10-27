import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { ClientOnly, useRouter } from "@tanstack/react-router";
import { ModeTabs } from "@/components/mode-tabs";
import { BottomPanel } from "@/components/bottom-panel";
import { RightPanel } from "@/components/right-panel";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  PlusCircle,
  FileText,
} from "lucide-react";
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
import { Download, Bot } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const UnifilarCanvas = lazy(() =>
  import("@/components/canvases/webgl-canvas").then((m) => ({ default: m.WebglCanvas })),
);
const LadderCanvas = lazy(() =>
  import("@/components/canvases/ladder-canvas").then((m) => ({ default: m.LadderCanvas })),
);
const FbdCanvas = lazy(() =>
  import("@/components/canvases/fbd-canvas").then((m) => ({ default: m.FbdCanvas })),
);
const ScadaCanvas = lazy(() =>
  import("@/components/canvases/scada-canvas").then((m) => ({ default: m.ScadaCanvas })),
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
  const [importerTab, setImporterTab] = useState<"input" | "preview" | "render" | "export">("input");

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
    <div className="flex-1 flex min-h-0 h-full w-full relative overflow-hidden">
      {/* Painel Esquerdo */}
      {!leftCollapsed ? (
        <div className="hidden md:flex relative shrink-0 z-10 h-full overflow-hidden">
          <LeftSidebarHost mode={mode} />
          {/* Botão para recolher o painel esquerdo */}
          <button
            onClick={toggleLeftPanel}
            className="flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-3 [@media(pointer:coarse)]:h-16 [@media(pointer:coarse)]:w-7 [@media(pointer:coarse)]:-right-7 bg-panel border border-border border-l-0 rounded-r items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-sm hover:h-14 hover:w-3.5 transition-all touch-manipulation"
            title="Recolher painel esquerdo"
            aria-label="Recolher painel esquerdo"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
        </div>
      ) : (
        /* Alça elegante para expandir o painel esquerdo */
        <button
          onClick={toggleLeftPanel}
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 h-12 w-4 [@media(pointer:coarse)]:h-16 [@media(pointer:coarse)]:w-7 bg-panel/85 backdrop-blur border border-border border-l-0 rounded-r items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-md hover:h-16 hover:w-5 transition-all touch-manipulation"
          title="Expandir painel esquerdo"
          aria-label="Expandir painel esquerdo"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Área Central (Canvas + Controles) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
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
        <div className="flex-1 min-h-0 relative bg-background overflow-hidden h-full w-full flex flex-col">
          {/* ErrorBoundary keyed por `mode`: isola crashes (ex.: React #185)
              ao canvas ativo e cria um boundary fresco ao trocar de aba. */}
          <ErrorBoundary key={mode}>
            {/* ClientOnly é obrigatório: sem ele o SSR resolve os React.lazy abaixo
                e avalia Pixi/Three/Konva no servidor (Worker), o que derruba a
                renderização inteira da rota. */}
            <ClientOnly fallback={<CanvasFallback />}>
              <Suspense fallback={<CanvasFallback />}>
                {mode === "unifilar" && <UnifilarCanvas projectId={projectId} />}
                {mode === "ladder" && <LadderCanvas />}
                {mode === "fbd" && <FbdCanvas />}
                {mode === "scada" && <ScadaCanvas />}
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
        <ErrorBoundary fallback={null}>
          <BottomPanel />
        </ErrorBoundary>
      </div>

      {/* Painel Direito */}
      {!rightCollapsed ? (
        <div className="hidden md:flex relative shrink-0 z-10">
          {/* Botão para recolher o painel direito */}
          <button
            onClick={toggleRightPanel}
            className="flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-3 [@media(pointer:coarse)]:h-16 [@media(pointer:coarse)]:w-7 [@media(pointer:coarse)]:-left-7 bg-panel border border-border border-r-0 rounded-l items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-sm hover:h-14 hover:w-3.5 transition-all touch-manipulation"
            title="Recolher painel direito"
            aria-label="Recolher painel direito"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
          <RightPanel />
        </div>
      ) : (
        /* Alça elegante para expandir o painel direito */
        <button
          onClick={toggleRightPanel}
          className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 h-12 w-4 [@media(pointer:coarse)]:h-16 [@media(pointer:coarse)]:w-7 bg-panel/85 backdrop-blur border border-border border-r-0 rounded-l items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-md hover:h-16 hover:w-5 transition-all touch-manipulation"
          title="Expandir painel direito"
          aria-label="Expandir painel direito"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
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
              <AlertCircle className="h-5 w-5" />
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
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Carregando projeto...</p>
      </div>
    </div>
  );
}

function WorkspaceEmptyState() {
  const router = useRouter();
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="max-w-md text-center space-y-5 px-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
          <FolderOpen className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Nenhum projeto aberto</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Abra um projeto existente ou crie um novo para começar a trabalhar no workspace
            industrial.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.navigate({ to: "/projects" })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <FolderOpen className="h-4 w-4" />
            Abrir projeto
          </button>
          <button
            onClick={() => router.navigate({ to: "/onboarding" })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
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
    <div className="h-7 px-3 flex items-center justify-between text-[11px] text-muted-foreground border-b border-border bg-panel/40">
      <div className="flex items-center gap-1.5 text-[10px]">
        {loading ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando projeto...
          </>
        ) : state === "saving" ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
          </>
        ) : state === "saved" ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-success" /> Salvo
          </>
        ) : state === "error" ? (
          <>
            <AlertCircle className="h-3 w-3 text-destructive" /> Erro ao salvar
          </>
        ) : (
          <>Auto-save ativo (2s)</>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenPrompt}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-all cursor-pointer shadow-xs"
          title="Copiar prompt padronizado para ChatGPT, Claude ou DeepSeek (0 créditos)"
        >
          <Bot className="h-3.5 w-3.5" />
          Prompt IA Externa
        </button>

        <button
          onClick={onOpenImporter}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer shadow-xs"
          title="Importar projetos criados por IAs externas sem consumir créditos"
        >
          <Download className="h-3.5 w-3.5" />
          Importar IA Externa
        </button>

        <button
          onClick={onOpenDossier}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-all cursor-pointer shadow-xs"
          title="Gerar Dossiê Técnico de Engenharia a partir do Canvas"
        >
          <FileText className="h-3.5 w-3.5" />
          Gerar Dossiê Técnico
        </button>
      </div>
    </div>
  );
}
