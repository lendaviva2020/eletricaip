// SCADA SUPERVISÓRIO — Industrial Header Bar
// Faithful to Visual Reference (media_1793565570167_72290aaf.jpg)

import { useState, useEffect } from "react";
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

export function ScadaHeader() {
  const {
    currentProjectName,
    isSimulationMode,
    audioAlertMuted,
    estopActive,
    totalFlowM3h,
    totalPowerKw,
    powerFactor,
    systemEfficiencyPct,
    criticalAlarmsCount,
    warningAlarmsCount,
    toggleAudioMute,
    toggleSimulationMode,
    triggerEstop,
    rearmEstop,
    tickSimulation,
  } = useScadaStore();

  const [timeStr, setTimeStr] = useState("");

  // Live simulation tick & clock loop
  useEffect(() => {
    const timer = setInterval(() => {
      tickSimulation();
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const months = [
        "JAN",
        "FEV",
        "MAR",
        "ABR",
        "MAI",
        "JUN",
        "JUL",
        "AGO",
        "SET",
        "OUT",
        "NOV",
        "DEZ",
      ];
      const month = months[now.getMonth()];
      const year = now.getFullYear();
      setTimeStr(`${hours}:${minutes}:${seconds} ${day}/${month}/${year}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [tickSimulation]);

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
            <Broadcast className="w-5 h-5 animate-pulse" />
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
                    : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    estopActive ? "bg-red-500 animate-ping" : "bg-emerald-400",
                  )}
                />
                {estopActive ? "PARADA VIRTUAL" : "SIMULAÇÃO ATIVA"}
              </div>
            </div>
            <p className="text-[10px] text-zinc-400 font-mono truncate">
              ElétricAi Supervisory Core v4.2 • Sinótico Geral
            </p>
          </div>
        </div>

        {/* Center: 4 KPI Cards (Matching Industrial Reference) */}
        <div className="hidden lg:flex items-center gap-1.5 xl:gap-2 flex-1 justify-center max-w-3xl xl:max-w-4xl min-w-0">
          {/* KPI 1: Vazão Total */}
          <div className="flex-1 bg-[#151C24] border border-[#1E293B] rounded-md px-2 py-1 xl:px-3 xl:py-1.5 min-w-[110px] shadow-sm">
            <div className="text-[9px] xl:text-[10px] font-mono uppercase text-[#A7B0BB] font-semibold tracking-wider truncate">
              Vazão Total
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-sm xl:text-base font-bold font-mono text-cyan-400">
                {totalFlowM3h.toFixed(1)}{" "}
                <span className="text-[10px] text-zinc-400 font-normal">m³/h</span>
              </span>
              <span className="text-[9px] font-mono font-semibold px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                +4.2%
              </span>
            </div>
          </div>

          {/* KPI 2: Energia */}
          <div className="flex-1 bg-[#151C24] border border-[#1E293B] rounded-md px-2 py-1 xl:px-3 xl:py-1.5 min-w-[110px] shadow-sm">
            <div className="text-[9px] xl:text-[10px] font-mono uppercase text-[#A7B0BB] font-semibold tracking-wider truncate">
              Energia
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-sm xl:text-base font-bold font-mono text-amber-400">
                {totalPowerKw.toFixed(1)}{" "}
                <span className="text-[10px] text-zinc-400 font-normal">kW</span>
              </span>
              <span className="text-[9px] font-mono text-[#A7B0BB]">
                FP: {powerFactor.toFixed(2)}
              </span>
            </div>
          </div>

          {/* KPI 3: Eficiência */}
          <div className="flex-1 bg-[#151C24] border border-[#1E293B] rounded-md px-2 py-1 xl:px-3 xl:py-1.5 min-w-[110px] shadow-sm">
            <div className="text-[9px] xl:text-[10px] font-mono uppercase text-[#A7B0BB] font-semibold tracking-wider truncate">
              Eficiência
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-sm xl:text-base font-bold font-mono text-emerald-400">
                {systemEfficiencyPct.toFixed(1)}%
              </span>
              <span className="text-[9px] font-mono text-[#A7B0BB]">Set: 95%</span>
            </div>
          </div>

          {/* KPI 4: Alarmes Ativos */}
          <div
            className={cn(
              "flex-1 border rounded-md px-2 py-1 xl:px-3 xl:py-1.5 min-w-[120px] shadow-sm transition-colors",
              criticalAlarmsCount > 0
                ? "bg-red-950/40 border-red-500/50"
                : warningAlarmsCount > 0
                  ? "bg-amber-950/30 border-amber-500/40"
                  : "bg-[#151C24] border-[#1E293B]",
            )}
          >
            <div className="text-[9px] xl:text-[10px] font-mono uppercase text-[#A7B0BB] font-semibold tracking-wider truncate">
              Alarmes Ativos
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span
                className={cn(
                  "text-[11px] xl:text-xs font-bold font-mono",
                  criticalAlarmsCount > 0
                    ? "text-red-400"
                    : warningAlarmsCount > 0
                      ? "text-amber-400"
                      : "text-zinc-300",
                )}
              >
                {criticalAlarmsCount} CRÍT • {warningAlarmsCount} ADV
              </span>
            </div>
          </div>
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
          <div className="hidden 2xl:flex items-center gap-1.5 text-xs font-mono text-zinc-300 bg-zinc-900/90 border border-zinc-800 px-2.5 py-1 rounded-md shadow-inner shrink-0">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>{timeStr || "14:28:45 15/JAN/2025"}</span>
          </div>

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
