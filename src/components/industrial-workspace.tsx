import { Suspense, lazy, useEffect, useState } from "react";
import { ModeTabs } from "@/components/mode-tabs";
import { BottomPanel } from "@/components/bottom-panel";
import { RightPanel } from "@/components/right-panel";
import type { WorkspaceMode } from "@/lib/workspace-data";
import { Loader2, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { CanvasAiChat } from "@/components/canvas-ai-chat";
import { useProjectPersistence } from "@/lib/use-project-persistence";
import {
  isBreakerComponent,
  type VoltaiComponentDefinition,
} from "@/lib/voltai/component-definitions";
import { LeftSidebarHost } from "@/components/editor/left-sidebar-host";
import { useEditorStore } from "@/lib/editor/store";

const UnifilarCanvas = lazy(() =>
  import("@/components/canvases/unifilar-canvas").then((m) => ({ default: m.UnifilarCanvas })),
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
  const [mode, setMode] = useState<WorkspaceMode>("unifilar");
  const [dragValidation, setDragValidation] = useState(
    "Arraste componentes IEC 60617 para o canvas.",
  );
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const { loading, saveState } = useProjectPersistence(projectId);
  const setActiveMode = useEditorStore((s) => s.setActiveMode);

  useEffect(() => {
    setActiveMode(mode);
  }, [mode, setActiveMode]);

  function validateDraggedBreaker(component: VoltaiComponentDefinition) {
    const isBreaker = isBreakerComponent(component.type);
    setDragValidation(
      isBreaker
        ? `${component.type} validado como disjuntor local.`
        : `${component.type} não é disjuntor; permitido como componente unifilar.`,
    );
    return isBreaker;
  }

  return (
    <div className="flex-1 flex min-h-0 relative">
      {/* Painel Esquerdo */}
      {!leftCollapsed ? (
        <div className="relative flex shrink-0 z-10">
          <LeftSidebarHost
            mode={mode}
            unifilar={{ dragValidation, onValidate: validateDraggedBreaker }}
          />
          {/* Botão para recolher o painel esquerdo */}
          <button
            onClick={() => setLeftCollapsed(true)}
            className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-3 bg-panel border border-border border-l-0 rounded-r items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-sm hover:h-14 hover:w-3.5 transition-all"
            title="Recolher painel esquerdo"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
        </div>
      ) : (
        /* Alça elegante para expandir o painel esquerdo */
        <button
          onClick={() => setLeftCollapsed(false)}
          className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 h-12 w-4 bg-panel/85 backdrop-blur border border-border border-l-0 rounded-r items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-md hover:h-16 hover:w-5 transition-all"
          title="Expandir painel esquerdo"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Área Central (Canvas + Controles) */}
      <div className="flex-1 flex flex-col min-w-0">
        <ModeTabs mode={mode} onChange={setMode} />
        <SaveBadge projectId={projectId} loading={loading} state={saveState} />
        <div className="flex-1 min-h-0 relative bg-background">
          <Suspense fallback={<CanvasFallback />}>
            {mode === "unifilar" && <UnifilarCanvas />}
            {mode === "ladder" && <LadderCanvas />}
            {mode === "fbd" && <FbdCanvas />}
            {mode === "scada" && <ScadaCanvas />}
            {mode === "twin" && <TwinCanvas />}
            {mode === "plc" && <PlcCanvas />}
            {mode === "sim" && <SimCanvas />}
            {mode === "alarms" && <AlarmsCanvas />}
          </Suspense>
          <CanvasAiChat />
        </div>
        <BottomPanel />
      </div>

      {/* Painel Direito */}
      {!rightCollapsed ? (
        <div className="relative flex shrink-0 z-10">
          {/* Botão para recolher o painel direito */}
          <button
            onClick={() => setRightCollapsed(true)}
            className="hidden lg:flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-3 bg-panel border border-border border-r-0 rounded-l items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-sm hover:h-14 hover:w-3.5 transition-all"
            title="Recolher painel direito"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
          <RightPanel />
        </div>
      ) : (
        /* Alça elegante para expandir o painel direito */
        <button
          onClick={() => setRightCollapsed(false)}
          className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 h-12 w-4 bg-panel/85 backdrop-blur border border-border border-r-0 rounded-l items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer shadow-md hover:h-16 hover:w-5 transition-all"
          title="Expandir painel direito"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
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

function SaveBadge({
  projectId,
  loading,
  state,
}: {
  projectId: string | null;
  loading: boolean;
  state: "idle" | "saving" | "saved" | "error";
}) {
  if (!projectId) return null;
  return (
    <div className="h-6 px-3 flex items-center gap-1.5 text-[10px] text-muted-foreground border-b border-border bg-panel/40">
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
  );
}
