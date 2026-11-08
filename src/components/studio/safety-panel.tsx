import React, { useState } from "react";
import { SafetyEngineeringAdvisory } from "../../lib/studio/safety/safety-advisory";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "../../lib/studio/canonical/types";
import {
  ShieldCheck,
  ShieldWarning,
  WarningCircle,
  Lock,
  CheckCircle,
  ArrowsLeftRight,
} from "@phosphor-icons/react";

export const SafetyPanel: React.FC = () => {
  const [ch1, setCh1] = useState(true);
  const [ch2, setCh2] = useState(true);
  const [discrepancyTimeMs, setDiscrepancyTimeMs] = useState(0);
  const [maxToleranceMs, setMaxToleranceMs] = useState(500);

  const evaluation = SafetyEngineeringAdvisory.analyzeEStopTopology(
    ch1,
    ch2,
    discrepancyTimeMs,
    maxToleranceMs
  );

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-zinc-200 overflow-y-auto p-6 space-y-6">
      {/* Aviso Mandatório de Segurança e Trava Física */}
      <div className="p-4 rounded-xl bg-rose-950/40 border-2 border-rose-600/80 shadow-lg">
        <div className="flex items-start gap-3">
          <ShieldWarning className="w-8 h-8 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-rose-200 flex items-center gap-2">
              Painel Consultivo de Engenharia de Segurança (NR-12 / ISO 13849-1 / IEC 62061)
              <span className="text-[10px] px-2 py-0.5 rounded bg-black/60 font-mono text-rose-300 border border-rose-800">
                IS_PHYSICAL_CONTROL_ALLOWED: {String(IS_PHYSICAL_CONTROL_ALLOWED)}
              </span>
            </h2>
            <p className="text-xs text-rose-200/90 mt-1 leading-relaxed">
              {SafetyEngineeringAdvisory.LEGAL_DISCLAIMER}
            </p>
          </div>
        </div>
      </div>

      {/* Analisador de Discrepância de Dois Canais para Parada de Emergência */}
      <div className="bg-[#121215] p-5 rounded-xl border border-zinc-800 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <ArrowsLeftRight className="w-5 h-5 text-indigo-400" />
              Monitor de Discrepância de Canal Duplo (E-STOP Dual-Channel Loop)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Simulação de contatos de segurança redundantes e detecção de falha de cabeamento ou curto
            </p>
          </div>

          <span
            className={`text-xs px-3 py-1 rounded font-bold font-mono flex items-center gap-1.5 ${
              evaluation.isCompliantWithDualChannel
                ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700"
                : "bg-rose-950/80 text-rose-300 border border-rose-700 animate-pulse"
            }`}
          >
            {evaluation.isCompliantWithDualChannel ? (
              <>
                <CheckCircle className="w-4 h-4" /> Loop Conforme
              </>
            ) : (
              <>
                <WarningCircle className="w-4 h-4" /> Falha de Discrepância
              </>
            )}
          </span>
        </div>

        {/* Controles de Teste do Loop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Seletor de Contatos dos Canais */}
          <div className="space-y-3 bg-[#18181b] p-4 rounded-lg border border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Estado dos Contatos Físicos
            </span>

            <div className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-xs font-mono">Canal 1 (Contato NF A):</span>
              <button
                onClick={() => setCh1(!ch1)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors ${
                  ch1 ? "bg-emerald-600 text-white" : "bg-rose-700 text-white"
                }`}
              >
                {ch1 ? "FECHADO (1)" : "ABERTO (0)"}
              </button>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-zinc-900 border border-zinc-800">
              <span className="text-xs font-mono">Canal 2 (Contato NF B):</span>
              <button
                onClick={() => setCh2(!ch2)}
                className={`px-3 py-1 rounded text-xs font-mono font-bold transition-colors ${
                  ch2 ? "bg-emerald-600 text-white" : "bg-rose-700 text-white"
                }`}
              >
                {ch2 ? "FECHADO (1)" : "ABERTO (0)"}
              </button>
            </div>
          </div>

          {/* Configuração de Tempo de Discrepância */}
          <div className="space-y-3 bg-[#18181b] p-4 rounded-lg border border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Temporização de Discrepância
            </span>

            <div className="space-y-1 font-mono text-xs">
              <div className="flex justify-between text-zinc-400">
                <span>Tempo de Discrepância Atual:</span>
                <span className="font-bold text-amber-400">{discrepancyTimeMs} ms</span>
              </div>
              <input
                type="range"
                min="0"
                max="1000"
                step="50"
                value={discrepancyTimeMs}
                onChange={(e) => setDiscrepancyTimeMs(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </div>

            <div className="space-y-1 font-mono text-xs pt-1">
              <div className="flex justify-between text-zinc-400">
                <span>Tolerância Máxima Permitida:</span>
                <span className="text-zinc-200">{maxToleranceMs} ms</span>
              </div>
              <input
                type="range"
                min="100"
                max="1000"
                step="50"
                value={maxToleranceMs}
                onChange={(e) => setMaxToleranceMs(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Diagnóstico e Recomendações */}
        <div className="pt-2 space-y-2">
          {evaluation.issues.map((issue, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/60 text-xs text-rose-300 font-mono flex items-start gap-2"
            >
              <WarningCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{issue}</span>
            </div>
          ))}

          {evaluation.recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-900/60 text-xs text-indigo-300 font-mono flex items-start gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <span>{rec}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
