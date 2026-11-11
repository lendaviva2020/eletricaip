import React, { useState } from "react";
import { useStudioStore } from "../../lib/studio/studio-store";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "../../lib/studio/canonical/types";
import {
  Play,
  Pause,
  ArrowRight,
  ArrowCounterClockwise,
  Lock,
  LockOpen,
  ShieldCheck,
  Lightning,
  Eye,
  Sliders,
} from "@phosphor-icons/react";

export const SimulationMonitor: React.FC = () => {
  const {
    project,
    scheduler,
    isSimulating,
    simulationCycleMs,
    startSimulation,
    pauseSimulation,
    stepSimulation,
    resetSimulation,
    setCycleInterval,
    forceVariable,
    unforceVariable,
    forcedVariables,
  } = useStudioStore();

  const [forceInputs, setForceInputs] = useState<Record<string, string>>({});

  const handleToggleForce = (varName: string, currentVal: any) => {
    if (forcedVariables[varName] !== undefined) {
      unforceVariable(varName);
    } else {
      const inputVal = forceInputs[varName] ?? String(currentVal);
      let parsedVal: any = inputVal;
      if (inputVal === "true") parsedVal = true;
      else if (inputVal === "false") parsedVal = false;
      else if (!isNaN(Number(inputVal))) parsedVal = Number(inputVal);

      forceVariable(varName, parsedVal);
    }
  };

  const handleInputChange = (varName: string, val: string) => {
    setForceInputs((prev) => ({ ...prev, [varName]: val }));
  };

  const metrics = scheduler?.getCycleMetrics() || {
    cycleCount: 0,
    accumulatedTimeMs: 0,
    lastDurationMs: 0,
  };

  return (
    <div className="flex flex-col h-full bg-[#141417] text-zinc-200 border-t border-zinc-800">
      {/* Barra de Controle de Simulação */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#101013] border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {isSimulating ? (
              <button
                onClick={pauseSimulation}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                <Pause className="w-4 h-4" weight="fill" /> Pausar
              </button>
            ) : (
              <button
                onClick={startSimulation}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                <Play className="w-4 h-4" weight="fill" /> Executar Simulação
              </button>
            )}

            <button
              onClick={() => stepSimulation(simulationCycleMs)}
              disabled={isSimulating}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors disabled:opacity-40"
              title="Executar exatamente 1 ciclo de varredura (Scan Cycle)"
            >
              <ArrowRight className="w-4 h-4" /> Passo (1 Ciclo)
            </button>

            <button
              onClick={resetSimulation}
              className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              title="Resetar Simulação"
            >
              <ArrowCounterClockwise className="w-4 h-4" />
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-700 mx-1" />

          {/* Configuração do Ciclo de Varredura */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-zinc-400">Scan Cycle:</span>
            <select
              value={simulationCycleMs}
              onChange={(e) => setCycleInterval(Number(e.target.value))}
              className="bg-zinc-900 border border-zinc-700 text-zinc-200 rounded px-2 py-1 text-xs focus:outline-none"
            >
              <option value={10}>10 ms (100 Hz)</option>
              <option value={20}>20 ms (50 Hz)</option>
              <option value={50}>50 ms (20 Hz)</option>
              <option value={100}>100 ms (10 Hz)</option>
            </select>
          </div>
        </div>

        {/* Métricas do Runtime Determinístico */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1 text-zinc-400">
            <span>Ciclos:</span>
            <span className="text-zinc-100 font-bold">{metrics.cycleCount}</span>
          </div>

          <div className="flex items-center gap-1 text-zinc-400">
            <span>Tempo Simulado:</span>
            <span className="text-indigo-400 font-bold">
              {(metrics.accumulatedTimeMs / 1000).toFixed(2)}s
            </span>
          </div>

          {/* Barreira de Isolamento Físico */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/40 border border-rose-800/80 text-rose-300 text-[11px] font-mono">
            <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
            <span>BARREIRA ATIVA: IS_PHYSICAL_CONTROL_ALLOWED: FALSE</span>
          </div>
        </div>
      </div>

      {/* Tabela de Observação de Variáveis e Forcing */}
      <div className="flex-1 overflow-auto p-3">
        <div className="border border-zinc-800 rounded-lg overflow-hidden bg-[#121215]">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/80 text-zinc-400 uppercase font-mono text-[10px] border-b border-zinc-800">
              <tr>
                <th className="py-2 px-3">Variável / Tag</th>
                <th className="py-2 px-3">Origem</th>
                <th className="py-2 px-3">Tipo IEC</th>
                <th className="py-2 px-3">Valor Atual</th>
                <th className="py-2 px-3">Forcing Simulado (In-Memory)</th>
                <th className="py-2 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {project.tags.map((tag) => {
                const isForced = forcedVariables[tag.name] !== undefined;
                const forcedVal = forcedVariables[tag.name];
                const displayVal = isForced
                  ? String(forcedVal)
                  : String(
                      scheduler?.globalVariables[tag.name] ??
                        scheduler?.inputProcessImage[tag.name] ??
                        tag.currentValue,
                    );

                return (
                  <tr
                    key={tag.id}
                    className={`hover:bg-zinc-800/30 transition-colors ${
                      isForced ? "bg-amber-950/20" : ""
                    }`}
                  >
                    <td className="py-2 px-3 font-semibold text-zinc-200 flex items-center gap-2">
                      <span className="text-zinc-500 font-normal">[{tag.code}]</span>
                      <span>{tag.name}</span>
                    </td>
                    <td className="py-2 px-3 text-zinc-400 text-[11px] font-sans">
                      Tag de Processo
                    </td>
                    <td className="py-2 px-3 text-indigo-400">{tag.dataType}</td>
                    <td className="py-2 px-3 font-bold">
                      <span
                        className={
                          isForced
                            ? "text-amber-400 bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-800"
                            : "text-emerald-400"
                        }
                      >
                        {displayVal}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={forceInputs[tag.name] ?? (isForced ? String(forcedVal) : displayVal)}
                        onChange={(e) => handleInputChange(tag.name, e.target.value)}
                        placeholder="Novo valor..."
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-xs text-zinc-200 w-32 focus:outline-none focus:border-indigo-500"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => handleToggleForce(tag.name, tag.currentValue)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                          isForced
                            ? "bg-amber-600 hover:bg-amber-500 text-white"
                            : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        }`}
                      >
                        {isForced ? (
                          <>
                            <LockOpen className="w-3.5 h-3.5" /> Liberar Force
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" /> Forçar (Sim)
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
