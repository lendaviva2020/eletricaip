import { useState } from "react";
import { ModeTabs } from "@/components/mode-tabs";
import { BottomPanel } from "@/components/bottom-panel";
import { RightPanel } from "@/components/right-panel";
import type { WorkspaceMode } from "@/lib/workspace-data";
import { UnifilarCanvas } from "@/components/canvases/unifilar-canvas";
import { LadderCanvas } from "@/components/canvases/ladder-canvas";
import { FbdCanvas } from "@/components/canvases/fbd-canvas";
import { ScadaCanvas } from "@/components/canvases/scada-canvas";
import { TwinCanvas } from "@/components/canvases/twin-canvas";
import { PlcCanvas } from "@/components/canvases/plc-canvas";
import { SimCanvas } from "@/components/canvases/sim-canvas";
import { AlarmsCanvas } from "@/components/canvases/alarms-canvas";
import { Boxes, Cable, Gauge, Search } from "lucide-react";

export function IndustrialWorkspace() {
  const [mode, setMode] = useState<WorkspaceMode>("unifilar");

  return (
    <div className="flex-1 flex min-h-0">
      {/* Tool palette (left of workspace) */}
      <div className="hidden lg:flex w-[220px] shrink-0 flex-col border-r border-border bg-panel/50">
        <div className="h-9 flex items-center px-3 border-b border-border text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Projeto industrial
        </div>
        <div className="px-2 py-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="Equipamentos…" className="w-full h-8 pl-8 pr-2 rounded bg-input/60 border border-border text-[11px] outline-none focus:ring-1 focus:ring-ring"/>
          </div>
        </div>
        <div className="px-2 pb-3 space-y-3 overflow-auto scrollbar-thin">
          <PaletteGroup icon={Cable} title="Elétrica">
            {["Disjuntor", "Contator", "Relé", "Transformador", "Inversor VFD", "Soft-Starter", "Fonte 24V", "QGBT", "CCM"].map(n => <PaletteItem key={n} name={n} />)}
          </PaletteGroup>
          <PaletteGroup icon={Boxes} title="Mecânica">
            {["Motor 3F", "Esteira", "Rosca", "Válvula", "Bomba", "Tanque", "Reator", "Cilindro"].map(n => <PaletteItem key={n} name={n} />)}
          </PaletteGroup>
          <PaletteGroup icon={Gauge} title="Instrumentação">
            {["Sensor PT100", "Pressão", "Vazão", "Nível", "E-STOP", "Cortina de luz", "Encoder"].map(n => <PaletteItem key={n} name={n} />)}
          </PaletteGroup>
        </div>
        <div className="mt-auto p-3 border-t border-border text-[10px] text-muted-foreground">
          Arraste para o canvas ou descreva à IA.
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <ModeTabs mode={mode} onChange={setMode} />
        <div className="flex-1 min-h-0 relative bg-background">
          {mode === "unifilar" && <UnifilarCanvas />}
          {mode === "ladder" && <LadderCanvas />}
          {mode === "fbd" && <FbdCanvas />}
          {mode === "scada" && <ScadaCanvas />}
          {mode === "twin" && <TwinCanvas />}
          {mode === "plc" && <PlcCanvas />}
          {mode === "sim" && <SimCanvas />}
          {mode === "alarms" && <AlarmsCanvas />}
        </div>
        <BottomPanel />
      </div>

      <RightPanel />
    </div>
  );
}

function PaletteGroup({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3 w-3" />{title}
      </div>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function PaletteItem({ name }: { name: string }) {
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/eletricai", name);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group flex items-center gap-2 text-left px-2 py-1.5 rounded text-[11px] text-foreground/85
                 hover:bg-accent hover:text-foreground border border-transparent hover:border-border transition-all cursor-grab active:cursor-grabbing"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary/60 group-hover:bg-primary group-hover:glow-primary" />
      {name}
    </button>
  );
}
