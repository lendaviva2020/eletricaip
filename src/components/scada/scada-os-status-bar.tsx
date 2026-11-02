// SCADA SUPERVISÓRIO — Industrial OS Status Bar
// Anchored at the bottom of the viewport: displays system version, runtime mode, sync, and execution state

import {
  ShieldCheck,
  Pulse,
  Play,
  Monitor,
  CheckCircle,
  ShieldWarning,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { toast } from "sonner";

export function ScadaOsStatusBar() {
  const isPhysicalControlAllowed = useScadaStore((s) => s.isPhysicalControlAllowed);

  const handleRuntimeClick = () => {
    toast.info("Modo Runtime em Execução Contínua (Virtual)", {
      description: "Supervisório conectado ao barramento determinístico industrial de simulação.",
    });
  };

  return (
    <footer
      className="h-7 shrink-0 bg-[#070A0E] border-t border-[#1E293B] px-3 flex items-center justify-between text-[11px] font-mono text-[#A7B0BB] select-none z-30"
      data-testid="scada-os-status-bar"
    >
      {/* Left: Industrial OS Identification */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-white font-semibold tracking-wide">
          <Monitor className="w-3.5 h-3.5 text-[#FF8A00]" />
          <span>ElétricAi Industrial OS v2.0.0</span>
        </div>

        <span className="text-zinc-600">•</span>

        <div className="flex items-center gap-1 text-zinc-300">
          <span className="text-[10px] uppercase text-zinc-500">Modo:</span>
          <span className="text-[#38BDF8] font-medium">Supervisão ISA-101</span>
        </div>

        <span className="text-zinc-600 hidden md:inline">•</span>

        <div className="hidden md:flex items-center gap-1.5 text-zinc-300">
          <Pulse className="w-3.5 h-3.5 text-emerald-400" />
          <span>Status: 60Hz Sync</span>
        </div>
      </div>

      {/* Center: Deterministic Bus & Security */}
      <div className="hidden lg:flex items-center gap-2 xl:gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span>Drivers 100% OK</span>
        </div>

        <span className="text-zinc-600 hidden xl:inline">•</span>

        <div className="hidden xl:flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-zinc-400">Segurança: IEC 62443 SL-2</span>
        </div>

        <span className="text-zinc-600 hidden xl:inline">•</span>

        <div className="hidden xl:flex items-center gap-1.5 text-amber-400">
          <ShieldWarning className="w-3.5 h-3.5" />
          <span className="text-[10px] uppercase font-bold tracking-wider">
            {isPhysicalControlAllowed ? "FÍSICO HABILITADO" : "CONTROLE FÍSICO BLOQUEADO"}
          </span>
        </div>
      </div>

      {/* Right: Station ID & Runtime Button */}
      <div className="flex items-center gap-2 xl:gap-3 shrink-0">
        <div className="flex items-center gap-1 text-zinc-400 shrink-0">
          <span className="text-[10px] text-zinc-500">ESTAÇÃO:</span>
          <span className="text-zinc-300 font-semibold">ENG-OP-01</span>
        </div>

        <span className="text-zinc-600">•</span>

        <button
          onClick={handleRuntimeClick}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#FF8A00]/15 hover:bg-[#FF8A00]/25 text-[#FF8A00] border border-[#FF8A00]/40 text-[10px] font-bold uppercase tracking-wider transition-colors shrink-0"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Entrar no Runtime</span>
        </button>
      </div>
    </footer>
  );
}
