// SCADA SUPERVISÓRIO — Industrial Header Bar
// Faithful to Visual Reference (media_1793565570167_72290aaf.jpg)

import { useEffect, useState } from "react";
import {
  SpeakerHigh,
  SpeakerSlash,
  WarningOctagon,
  ArrowsCounterClockwise,
  Broadcast,
  Clock,
  ShieldWarning,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/**
 * Relógio isolado: tem seu próprio tique de 1 s, então só ELE re-renderiza a
 * cada segundo — não o cabeçalho inteiro. O ciclo da simulação foi movido para
 * `useScadaSimTick` (nível de layout), desacoplado da UI.
 */
function ScadaClock() {
  const [timeStr, setTimeStr] = useState("");
  useEffect(() => {
    const render = () => {
      const now = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      setTimeStr(
        `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())} ${p(now.getDate())}/${MONTHS[now.getMonth()]}/${now.getFullYear()}`,
      );
    };
    render();
    const id = setInterval(render, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden 2xl:flex items-center gap-1.5 text-xs font-mono text-zinc-300 bg-zinc-900/90 border border-zinc-800 px-2.5 py-1 rounded-md shadow-inner shrink-0">
      <Clock className="w-3.5 h-3.5 text-zinc-400" />
      <span>{timeStr || "--:--:--"}</span>
    </div>
  );
}

export function ScadaHeader() {
  // Seletores por campo: o cabeçalho só re-renderiza quando ALGO que ele mostra
  // muda, não a cada tique da simulação (que atualiza tags/alarmes/histórico).
  const currentProjectName = useScadaStore((s) => s.currentProjectName);
  const isDemoProject = useScadaStore((s) => s.isDemoProject);
  const isSimulationMode = useScadaStore((s) => s.isSimulationMode);
  const audioAlertMuted = useScadaStore((s) => s.audioAlertMuted);
  const estopActive = useScadaStore((s) => s.estopActive);
  const totalFlowM3h = useScadaStore((s) => s.totalFlowM3h);
  const totalPowerKw = useScadaStore((s) => s.totalPowerKw);
  const powerFactor = useScadaStore((s) => s.powerFactor);
  const systemEfficiencyPct = useScadaStore((s) => s.systemEfficiencyPct);
  const criticalAlarmsCount = useScadaStore((s) => s.criticalAlarmsCount);
  const warningAlarmsCount = useScadaStore((s) => s.warningAlarmsCount);
  const toggleAudioMute = useScadaStore((s) => s.toggleAudioMute);
  const toggleSimulationMode = useScadaStore((s) => s.toggleSimulationMode);
  const triggerEstop = useScadaStore((s) => s.triggerEstop);
  const rearmEstop = useScadaStore((s) => s.rearmEstop);

  const handleEstopToggle = () => {
    if (estopActive) {
      rearmEstop();
      toast.success("Simulação de Processo Rearmada", {
        description: "Sistema virtual liberado para partida em modo simulação.",
      });
    } else {
      triggerEstop();
      toast.error("PARADA DA SIMULAÇÃO (VIRTUAL) ACIONADA!", {
        description:
          "Modelos de processo em memória interrompidos. Atenção: ação virtual, sem desenergização física ou atuação em relé de segurança de campo (NR-10 / NR-12).",
      });
    }
  };

  return (
    <header className="flex flex-col shrink-0 border-b border-border bg-[#0a0d14] select-none text-foreground z-40 relative">
      {/* Permanent Safety Operational Disclaimer (NR-10, NR-12, ISO 13849-1, IEC 62061) */}
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 xl:px-4 py-1 flex items-center justify-between text-[10.5px] font-mono text-amber-300">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldWarning className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-semibold tracking-wide truncate">
            AVISO DE SEGURANÇA OPERACIONAL (NR-10 / NR-12): Este supervisório opera em modo de
            simulação/engenharia. Comandos virtuais de parada não substituem o botão físico de
            parada de emergência e relés de segurança certificados cabeados em campo.
          </span>
        </div>
        <span className="hidden md:inline-block text-[9.5px] text-amber-400/80 uppercase font-bold shrink-0 ml-2">
          CONTROLE FÍSICO BLOQUEADO
        </span>
      </div>

      {/* Main Bar */}
      <div className="h-14 xl:h-16 px-3 xl:px-4 flex items-center justify-between gap-2 xl:gap-4 overflow-hidden">
        {/* Left: Plant & Process Identity */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <div className="w-9 h-9 rounded-md bg-blue-950/60 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-inner shrink-0">
            <Broadcast className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs xl:text-sm font-bold tracking-tight text-white uppercase truncate">
                {currentProjectName || "Supervisório Industrial"}
              </h1>
              <div
                className={cn(
                  "hidden sm:flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-medium shrink-0",
                  estopActive
                    ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                    : "bg-amber-500/10 text-amber-300 border border-amber-500/30",
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    estopActive ? "bg-red-500 motion-safe:animate-ping" : "bg-amber-300",
                  )}
                />
                {estopActive ? "PARADA VIRTUAL" : "SIMULAÇÃO ATIVA"}
              </div>
            </div>
            <p className="text-[10px] text-zinc-400 font-mono truncate">
              ElétricAi SCADA • Supervisão
            </p>
          </div>
        </div>

        {/* Centro: KPIs só no projeto de demonstração (rotulados). Em projeto de
            cliente não há KPI sem fonte calculável — os alarmes ficam no rodapé. */}
        <div className="hidden lg:flex items-center gap-2 flex-1 justify-center min-w-0">
          {isDemoProject ? (
            <div
              className="flex items-center gap-3 px-3 py-1 rounded-md border border-[#1E293B] bg-[#151C24] text-[11px] font-mono text-zinc-300"
              data-testid="scada-demo-kpis"
            >
              <span className="text-[9px] uppercase text-amber-300">Demonstração</span>
              <span>Vazão {totalFlowM3h.toFixed(1)} m³/h</span>
              <span>Potência {totalPowerKw.toFixed(1)} kW</span>
              <span>FP {powerFactor.toFixed(2)}</span>
              <span>Efic. {systemEfficiencyPct.toFixed(1)} %</span>
            </div>
          ) : (
            <span className="text-[10px] font-mono text-zinc-500">
              {criticalAlarmsCount + warningAlarmsCount > 0
                ? `${criticalAlarmsCount} crítico(s) · ${warningAlarmsCount} advertência(s)`
                : "Sem alarmes críticos"}
            </span>
          )}
        </div>

        {/* Right Controls & E-STOP */}
        <div className="flex items-center gap-2 xl:gap-3 shrink-0">
          {/* Audio toggle button */}
          <button
            onClick={toggleAudioMute}
            className={cn(
              "p-1.5 xl:p-2 rounded-md border text-xs font-mono transition-colors shrink-0",
              audioAlertMuted
                ? "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
                : "bg-blue-950/40 border-blue-500/40 text-blue-400 hover:bg-blue-900/50",
            )}
            title={audioAlertMuted ? "Alarme sonoro mutado" : "Alarme sonoro ativo"}
          >
            {audioAlertMuted ? (
              <SpeakerSlash className="w-4 h-4" />
            ) : (
              <SpeakerHigh className="w-4 h-4" />
            )}
          </button>

          {/* Simulation mode indicator / toggle */}
          <button
            onClick={toggleSimulationMode}
            className={cn(
              "hidden 2xl:flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-mono transition-colors shrink-0",
              isSimulationMode
                ? "bg-amber-500/10 border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white",
            )}
            title="Alternar entre modo simulação e telemetria física"
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                isSimulationMode ? "bg-amber-400 animate-pulse" : "bg-zinc-500",
              )}
            />
            <span>SIMULAÇÃO</span>
          </button>

          {/* Real-time Clock */}
          <ScadaClock />

          {/* Virtual Simulation Halt Button (E-STOP) */}
          <button
            onClick={handleEstopToggle}
            data-testid="scada-estop-btn"
            title="Parada de Emergência da Simulação (Ação virtual em memória)"
            className={cn(
              "flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 rounded-md font-bold text-[11px] xl:text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 shrink-0",
              estopActive
                ? "bg-amber-500 hover:bg-amber-600 text-black border-2 border-amber-300 animate-pulse"
                : "bg-red-600 hover:bg-red-700 text-white border border-red-500/60 shadow-red-900/40",
            )}
          >
            {estopActive ? (
              <>
                <ArrowsCounterClockwise className="w-3.5 h-3.5 animate-spin" />
                <span>Rearmar</span>
              </>
            ) : (
              <>
                <WarningOctagon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">E-STOP Virtual</span>
                <span className="sm:hidden">E-STOP</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
