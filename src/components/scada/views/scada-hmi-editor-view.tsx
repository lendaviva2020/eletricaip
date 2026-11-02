// SCADA SUPERVISÓRIO — View 10: Editor HMI (Konva Canvas + Script Sandbox)
// Preserves and integrates the existing custom HMI screen editor and Monaco script engine

import { Suspense, lazy } from "react";
import { Palette, CodeBlock, Play, Info } from "@phosphor-icons/react";
import { ScadaCanvas } from "@/components/canvases/scada-canvas";

export function ScadaHmiEditorView() {
  return (
    <div className="flex-1 flex flex-col min-h-0 h-full w-full bg-[#080b11] text-zinc-200">
      {/* Informative Subheader */}
      <div className="shrink-0 bg-zinc-950 border-b border-zinc-800 px-4 py-2 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-purple-400" />
          <span className="font-bold text-white uppercase">
            Editor HMI Sinótico & Sandbox JavaScript
          </span>
          <span className="text-zinc-500 hidden md:inline">
            • Arraste componentes, vincule TAGs do CLP e execute scripts de animação
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-400">
          <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
            Engine Konva 2D + Monaco Editor
          </span>
        </div>
      </div>

      {/* Embedded Existing ScadaCanvas */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <ScadaCanvas />
      </div>
    </div>
  );
}
