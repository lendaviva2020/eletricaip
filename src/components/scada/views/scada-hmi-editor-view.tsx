// SCADA SUPERVISÓRIO — View 10: Editor HMI
// "Tela de processo": equipamentos 2D interligados (desenho ↔ código ↔ IA) e
// operação simulada. "Widgets e scripts": o editor Konva + sandbox anterior,
// preservado (AGENTS §11.1.6).

import { useState } from "react";
import { Palette, SquaresFour } from "@phosphor-icons/react";
import { ScadaCanvas } from "@/components/canvases/scada-canvas";
import { HmiProcessStudio } from "@/components/hmi/hmi-process-studio";

type HmiTab = "process" | "widgets";

export function ScadaHmiEditorView() {
  const [tab, setTab] = useState<HmiTab>("process");
  return (
    <div className="flex-1 flex flex-col min-h-0 h-full w-full bg-[#080b11] text-zinc-200">
      <div className="shrink-0 bg-zinc-950 border-b border-zinc-800 px-3 py-1.5 flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setTab("process")}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 ${
            tab === "process" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
          }`}
          data-testid="hmi-tab-process"
        >
          <SquaresFour className="w-4 h-4 text-sky-400" /> Tela de processo
        </button>
        <button
          type="button"
          onClick={() => setTab("widgets")}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 ${
            tab === "widgets" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
          }`}
        >
          <Palette className="w-4 h-4 text-purple-400" /> Widgets e scripts
        </button>
      </div>
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {tab === "process" ? <HmiProcessStudio /> : <ScadaCanvas />}
      </div>
    </div>
  );
}
