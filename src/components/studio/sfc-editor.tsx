import React from "react";
import { useStudioStore } from "../../lib/studio/studio-store";
import {
  Play,
  ArrowRight,
  Clock,
  WarningCircle,
  Lightning,
  CheckCircle,
} from "@phosphor-icons/react";

interface SfcEditorProps {
  pouId: string;
}

export const SfcEditor: React.FC<SfcEditorProps> = ({ pouId }) => {
  const { project, sfcEngine, isSimulating, stepSimulation } = useStudioStore();
  const pou = project.pous.find((p) => p.id === pouId);
  const steps = pou?.networks[0]?.sfcSteps || [];
  const transitions = pou?.networks[0]?.sfcTransitions || [];

  const sfcState = sfcEngine ? sfcEngine.getState() : null;

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-zinc-200">
      {/* Barra de Topo do Editor SFC */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-[#121215]">
        <div className="flex items-center gap-3">
          <Lightning className="w-5 h-5 text-amber-400" />
          <span className="font-semibold text-sm tracking-wide text-zinc-100">
            {pou?.name || "PRG_SFC_Sequencer"}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
            IEC 61131-3 SFC
          </span>
          {sfcState?.isDeadlocked && (
            <span className="flex items-center gap-1 text-xs text-rose-400 bg-rose-950/50 border border-rose-800 px-2 py-0.5 rounded font-mono">
              <WarningCircle className="w-4 h-4" /> DEADLOCK DETECTADO
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isSimulating && (
            <button
              onClick={() => stepSimulation(50)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors"
            >
              <ArrowRight className="w-4 h-4" /> Avançar Ciclo SFC (50ms)
            </button>
          )}
        </div>
      </div>

      {/* Canvas SVG Interativo de SFC */}
      <div className="flex-1 overflow-auto p-8 flex justify-center bg-[#0e0e11] relative">
        <div className="w-[640px] flex flex-col items-center gap-8 py-4">
          {steps.map((step, idx) => {
            const isActive = sfcState ? sfcState.activeStepIds.has(step.id) : step.isInitial;
            const stepTimerMs = sfcState ? sfcState.stepTimers.get(step.id) || 0 : 0;
            const outgoingTransition = transitions.find((t) => t.fromStepIds.includes(step.id));

            return (
              <React.Fragment key={step.id}>
                {/* Cartão do Passo (Step) */}
                <div className="flex items-start gap-4 w-full max-w-lg">
                  {/* Bloco Central do Passo */}
                  <div
                    className={`flex-1 p-4 rounded-lg border-2 transition-all relative ${
                      isActive
                        ? "bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-500/20 text-amber-100 ring-2 ring-amber-500/30"
                        : "bg-[#18181b] border-zinc-700 text-zinc-300"
                    } ${step.isInitial ? "border-double border-4" : ""}`}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-700/50">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm tracking-wide">{step.name}</span>
                        {step.isInitial && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                            INIT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs font-mono text-zinc-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>T#{(stepTimerMs / 1000).toFixed(1)}s</span>
                      </div>
                    </div>

                    {/* Ações Associadas ao Passo */}
                    <div className="mt-2.5 space-y-1.5">
                      {step.actions.length === 0 ? (
                        <div className="text-[11px] text-zinc-500 italic">Sem ações associadas</div>
                      ) : (
                        step.actions.map((act) => (
                          <div
                            key={act.id}
                            className={`flex items-center gap-2 p-1.5 rounded border text-xs font-mono ${
                              isActive
                                ? "bg-amber-900/30 border-amber-700/50 text-amber-200"
                                : "bg-black/30 border-zinc-800 text-zinc-400"
                            }`}
                          >
                            <span className="w-5 h-5 flex items-center justify-center rounded bg-black/60 font-bold text-indigo-400 text-[11px] border border-zinc-700">
                              {act.qualifier}
                            </span>
                            <span className="flex-1 truncate">{act.stCode}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Transição SFC (Linha e Barra Horizontal) */}
                {outgoingTransition && (
                  <div className="flex flex-col items-center w-full max-w-lg my-1">
                    {/* Linha vertical superior */}
                    <div className="w-0.5 h-6 bg-zinc-600" />

                    {/* Barra Transversal da Transição IEC */}
                    <div className="flex items-center gap-3 py-1">
                      <div className="w-16 h-1 bg-zinc-400 rounded-full" />
                      <div
                        className={`px-3 py-1 rounded border text-xs font-mono font-semibold transition-colors ${
                          outgoingTransition.isSatisfied
                            ? "bg-emerald-950/70 border-emerald-500 text-emerald-300 shadow-sm"
                            : "bg-zinc-900 border-zinc-700 text-zinc-400"
                        }`}
                      >
                        {outgoingTransition.conditionST}
                      </div>
                      <div className="w-16 h-1 bg-zinc-400 rounded-full" />
                    </div>

                    {/* Linha vertical inferior */}
                    <div className="w-0.5 h-6 bg-zinc-600" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
