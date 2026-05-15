import { Suspense, lazy, useState } from "react";
import { ModeTabs } from "@/components/mode-tabs";
import { BottomPanel } from "@/components/bottom-panel";
import { RightPanel } from "@/components/right-panel";
import type { WorkspaceMode } from "@/lib/workspace-data";
import { Boxes, Cable, Gauge, Search, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { CanvasAiChat } from "@/components/canvas-ai-chat";
import { useProjectPersistence } from "@/lib/use-project-persistence";
import { LADDER_ELEMENTS, type LadderElement } from "@/lib/ladder/definitions";
import {
  isBreakerComponent,
  VOLTAI_COMPONENT_DEFINITIONS,
  type VoltaiComponentDefinition,
} from "@/lib/voltai/component-definitions";

const UnifilarCanvas = lazy(() =>
  import("@/components/canvases/unifilar-canvas").then((module) => ({
    default: module.UnifilarCanvas,
  })),
);
const LadderCanvas = lazy(() =>
  import("@/components/canvases/ladder-canvas").then((module) => ({
    default: module.LadderCanvas,
  })),
);
const FbdCanvas = lazy(() =>
  import("@/components/canvases/fbd-canvas").then((module) => ({ default: module.FbdCanvas })),
);
const ScadaCanvas = lazy(() =>
  import("@/components/canvases/scada-canvas").then((module) => ({
    default: module.ScadaCanvas,
  })),
);
const TwinCanvas = lazy(() =>
  import("@/components/canvases/twin-canvas").then((module) => ({ default: module.TwinCanvas })),
);
const PlcCanvas = lazy(() =>
  import("@/components/canvases/plc-canvas").then((module) => ({ default: module.PlcCanvas })),
);
const SimCanvas = lazy(() =>
  import("@/components/canvases/sim-canvas").then((module) => ({ default: module.SimCanvas })),
);
const AlarmsCanvas = lazy(() =>
  import("@/components/canvases/alarms-canvas").then((module) => ({
    default: module.AlarmsCanvas,
  })),
);

export function IndustrialWorkspace({ projectId = null }: { projectId?: string | null }) {
  const [mode, setMode] = useState<WorkspaceMode>("unifilar");
  const [dragValidation, setDragValidation] = useState(
    "Arraste componentes IEC 60617 para o canvas.",
  );
  const { loading, saveState } = useProjectPersistence(projectId);

  function validateDraggedBreaker(component: VoltaiComponentDefinition) {
    const isBreaker = isBreakerComponent(component.type);
    setDragValidation(
      isBreaker
        ? `${component.type} validado como disjuntor local.`
        : `${component.type} nao e disjuntor; permitido como componente unifilar.`,
    );
    return isBreaker;
  }

  return (
    <div className="flex-1 flex min-h-0">
      {mode === "unifilar" && (
        <EditorBibliotecaSidebar
          dragValidation={dragValidation}
          onValidate={validateDraggedBreaker}
        />
      )}
      {mode === "ladder" && <EditorLadderSidebar />}
      {mode === "scada" && <EditorScadaSidebar />}

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

      <RightPanel />
    </div>
  );
}

function EditorBibliotecaSidebar({
  dragValidation,
  onValidate,
}: {
  dragValidation: string;
  onValidate: (component: VoltaiComponentDefinition) => boolean;
}) {
  const protectionComponents = VOLTAI_COMPONENT_DEFINITIONS.filter(
    (component) => component.category === "Protecao",
  );
  const powerComponents = VOLTAI_COMPONENT_DEFINITIONS.filter(
    (component) =>
      component.category === "Potencia" ||
      component.category === "Fonte" ||
      component.category === "Carga",
  );
  const controlComponents = VOLTAI_COMPONENT_DEFINITIONS.filter(
    (component) => component.category === "Controle" || component.category === "Seguranca",
  );
  const signalComponents = VOLTAI_COMPONENT_DEFINITIONS.filter(
    (component) => component.category === "Sinal" || component.category === "Medicao",
  );

  return (
    <div className="hidden lg:flex w-[220px] shrink-0 flex-col border-r border-border bg-panel/50">
      <SidebarSearch title="Biblioteca VOLTAI" placeholder="IEC 60617..." />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        <PaletteGroup icon={Cable} title="Protecao">
          {protectionComponents.map((component) => (
            <PaletteItem key={component.type} component={component} onValidate={onValidate} />
          ))}
        </PaletteGroup>
        <PaletteGroup icon={Boxes} title="Potencia">
          {powerComponents.map((component) => (
            <PaletteItem key={component.type} component={component} onValidate={onValidate} />
          ))}
        </PaletteGroup>
        <PaletteGroup icon={Gauge} title="Controle">
          {controlComponents.map((component) => (
            <PaletteItem key={component.type} component={component} onValidate={onValidate} />
          ))}
        </PaletteGroup>
        <PaletteGroup icon={Gauge} title="Medicao e Sinal">
          {signalComponents.map((component) => (
            <PaletteItem key={component.type} component={component} onValidate={onValidate} />
          ))}
        </PaletteGroup>
      </div>
      <div className="mt-auto p-3 border-t border-border text-[10px] text-muted-foreground">
        {dragValidation}
      </div>
    </div>
  );
}

function EditorLadderSidebar() {
  const categories = Array.from(new Set(LADDER_ELEMENTS.map((element) => element.category)));
  return (
    <div className="hidden lg:flex w-[240px] shrink-0 flex-col border-r border-border bg-panel/50">
      <SidebarSearch title="Biblioteca Ladder" placeholder="IEC 61131-3..." />
      <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
        {categories.map((category) => (
          <PaletteGroup key={category} icon={Gauge} title={category}>
            {LADDER_ELEMENTS.filter((element) => element.category === category).map((element) => (
              <LadderPaletteItem key={element.id} element={element} />
            ))}
          </PaletteGroup>
        ))}
      </div>
    </div>
  );
}

function EditorScadaSidebar() {
  const widgets = ["Indicador", "Trend", "Botao", "Alarme", "Gauge", "Tanque"];
  return (
    <div className="hidden lg:flex w-[220px] shrink-0 flex-col border-r border-border bg-panel/50">
      <SidebarSearch title="Widgets HMI" placeholder="SCADA..." />
      <div className="px-2 pb-3 space-y-2 overflow-auto scrollbar-thin">
        {widgets.map((widget) => (
          <button
            key={widget}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData("application/scada-widget", widget);
              event.dataTransfer.effectAllowed = "move";
            }}
            className="w-full text-left px-2 py-2 rounded border border-border bg-card/60 text-[11px] hover:bg-accent cursor-grab"
          >
            {widget}
          </button>
        ))}
      </div>
    </div>
  );
}

function SidebarSearch({ title, placeholder }: { title: string; placeholder: string }) {
  return (
    <>
      <div className="h-9 flex items-center px-3 border-b border-border text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      <div className="px-2 py-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder={placeholder}
            className="w-full h-8 pl-8 pr-2 rounded bg-input/60 border border-border text-[11px] outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    </>
  );
}

function CanvasFallback() {
  return (
    <div className="h-full w-full grid place-items-center text-[11px] text-muted-foreground">
      Carregando canvas...
    </div>
  );
}

function PaletteGroup({
  icon: Icon,
  title,
  children,
}: {
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function PaletteItem({
  component,
  onValidate,
}: {
  component: VoltaiComponentDefinition;
  onValidate: (component: VoltaiComponentDefinition) => boolean;
}) {
  return (
    <button
      draggable
      onDragStart={(event) => {
        onValidate(component);
        event.dataTransfer.setData("application/voltai-component", component.type);
        event.dataTransfer.effectAllowed = "move";
      }}
      className="group flex items-center gap-2 text-left px-2 py-1.5 rounded text-[11px] text-foreground/85
                 hover:bg-accent hover:text-foreground border border-transparent hover:border-border transition-all cursor-grab active:cursor-grabbing"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary/60 group-hover:bg-primary group-hover:glow-primary" />
      <span className="w-12 shrink-0 font-mono text-[10px] text-primary">{component.type}</span>
      <span className="truncate">{component.name}</span>
    </button>
  );
}

function LadderPaletteItem({ element }: { element: LadderElement }) {
  return (
    <button
      draggable
      title={element.description}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/ladder-element", element.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className="group flex items-center gap-2 text-left px-2 py-1.5 rounded text-[11px] text-foreground/85 hover:bg-accent hover:text-foreground border border-transparent hover:border-border transition-all cursor-grab active:cursor-grabbing"
    >
      <span className="w-14 shrink-0 font-mono text-[10px] text-primary">{element.symbol}</span>
      <span className="truncate">{element.label}</span>
    </button>
  );
}
