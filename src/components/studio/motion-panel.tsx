import React, { useState } from "react";
import { useStudioStore } from "../../lib/studio/studio-store";
import {
  Compass,
  Play,
  Stop,
  Power,
  ArrowsClockwise,
  ArrowRight,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";

export const MotionPanel: React.FC = () => {
  const { project, motionSimulator, isSimulating, stepSimulation } = useStudioStore();
  const axis = motionSimulator ? motionSimulator.axis : project.motionAxes[0];

  const [targetPos, setTargetPos] = useState<number>(250);
  const [targetVel, setTargetVel] = useState<number>(100);

  const handlePowerToggle = () => {
    if (!motionSimulator) return;
    const isCurrentlyDisabled = axis.state === "DISABLED";
    motionSimulator.mcPower(isCurrentlyDisabled);
  };

  const handleMoveAbsolute = () => {
    if (!motionSimulator) return;
    motionSimulator.mcMoveAbsolute(targetPos, targetVel);
  };

  const handleMoveVelocity = (vel: number) => {
    if (!motionSimulator) return;
    motionSimulator.mcMoveVelocity(vel);
  };

  const handleStop = () => {
    if (!motionSimulator) return;
    motionSimulator.mcStop();
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case "STANDSTILL":
        return "bg-cyan-950/80 text-cyan-300 border-cyan-700";
      case "DISCRETE_MOTION":
      case "CONTINUOUS_MOTION":
        return "bg-emerald-950/80 text-emerald-300 border-emerald-700 animate-pulse";
      case "ERROR_STOP":
        return "bg-rose-950/80 text-rose-300 border-rose-700";
      default:
        return "bg-zinc-800 text-zinc-400 border-zinc-700";
    }
  };

  const currentPos = axis?.currentPosition || 0;
  const currentVel = axis?.currentVelocity || 0;
  const maxPos = 1000;
  const progressPercent = Math.min(100, Math.max(0, (currentPos / maxPos) * 100));

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-zinc-200 overflow-y-auto p-6 space-y-6">
      {/* Topo do Eixo Motion */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-indigo-400" />
            <h2 className="text-base font-bold text-zinc-100">{axis?.name || "Eixo_Transportador_01"}</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
              PLCopen Motion Control
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Simulador de Controle de Movimento Multi-Eixos com Trajetória Trapezoidal Determinística
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`text-xs px-3 py-1 rounded font-bold font-mono border ${getStateColor(
              axis?.state || "DISABLED"
            )}`}
          >
            ESTADO: {axis?.state || "DISABLED"}
          </span>
        </div>
      </div>

      {/* Régua de Posição Visual */}
      <div className="bg-[#121215] p-5 rounded-xl border border-zinc-800 space-y-3">
        <div className="flex items-center justify-between font-mono text-xs text-zinc-400">
          <span>0.0 mm</span>
          <span className="text-sm font-bold text-indigo-400">
            Posição Atual: {currentPos.toFixed(1)} mm
          </span>
          <span>{maxPos}.0 mm</span>
        </div>

        <div className="w-full h-6 bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700 relative">
          <div
            className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-100"
            style={{ width: `${progressPercent}%` }}
          />
          {/* Marcador do Target */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-amber-400"
            style={{ left: `${(targetPos / maxPos) * 100}%` }}
            title={`Alvo: ${targetPos} mm`}
          />
        </div>

        <div className="flex items-center justify-between font-mono text-xs text-zinc-400 pt-1">
          <span>Velocidade Atual: {currentVel.toFixed(1)} mm/s</span>
          <span>Aceleração Máx: {axis?.maxAcceleration} mm/s²</span>
        </div>
      </div>

      {/* Painel de Comandos PLCopen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bloco de Alimentação e Jog */}
        <div className="bg-[#121215] p-5 rounded-xl border border-zinc-800 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Comandos de Habilitação & Jog
          </h3>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePowerToggle}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-xs font-mono transition-colors ${
                axis?.state !== "DISABLED"
                  ? "bg-rose-700 hover:bg-rose-600 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            >
              <Power className="w-4 h-4" />
              {axis?.state !== "DISABLED" ? "MC_Power (Desabilitar)" : "MC_Power (Habilitar)"}
            </button>

            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs font-mono transition-colors"
            >
              <Stop className="w-4 h-4" /> MC_Stop
            </button>
          </div>

          <div className="space-y-2 pt-2">
            <span className="text-xs font-mono text-zinc-400">Jog Contínuo (MC_MoveVelocity):</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleMoveVelocity(-targetVel)}
                disabled={axis?.state === "DISABLED"}
                className="flex-1 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-xs transition-colors disabled:opacity-40"
              >
                Jog Reverso (-{targetVel} mm/s)
              </button>
              <button
                onClick={() => handleMoveVelocity(targetVel)}
                disabled={axis?.state === "DISABLED"}
                className="flex-1 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-mono text-xs transition-colors disabled:opacity-40"
              >
                Jog Direto (+{targetVel} mm/s)
              </button>
            </div>
          </div>
        </div>

        {/* Bloco de Posicionamento Absoluto (MC_MoveAbsolute) */}
        <div className="bg-[#121215] p-5 rounded-xl border border-zinc-800 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Posicionamento Ponto a Ponto (MC_MoveAbsolute)
          </h3>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Posição Alvo (mm):</span>
              <input
                type="number"
                min="0"
                max={maxPos}
                value={targetPos}
                onChange={(e) => setTargetPos(Number(e.target.value))}
                className="bg-zinc-900 border border-zinc-700 text-zinc-200 rounded px-2 py-1 w-28 text-right focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Velocidade Máxima (mm/s):</span>
              <input
                type="number"
                min="10"
                max="500"
                value={targetVel}
                onChange={(e) => setTargetVel(Number(e.target.value))}
                className="bg-zinc-900 border border-zinc-700 text-zinc-200 rounded px-2 py-1 w-28 text-right focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleMoveAbsolute}
              disabled={axis?.state === "DISABLED"}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs font-mono transition-colors disabled:opacity-40"
            >
              <ArrowRight className="w-4 h-4" /> Executar MC_MoveAbsolute
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
