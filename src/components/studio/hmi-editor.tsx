import React from "react";
import { useStudioStore } from "../../lib/studio/studio-store";
import {
  Drop,
  Gauge,
  WarningCircle,
  ShieldCheck,
  ArrowsClockwise,
  Power,
  Sliders,
} from "@phosphor-icons/react";

interface HmiEditorProps {
  pageId?: string;
}

export const HmiEditor: React.FC<HmiEditorProps> = ({ pageId }) => {
  const { project, scheduler, isSimulating, forceVariable, unforceVariable, forcedVariables } =
    useStudioStore();

  const hmiPage = project.hmiPages[0];

  // Obter valores simulados atuais
  const getTagValue = (tagName: string, defaultVal: any) => {
    if (forcedVariables[tagName] !== undefined) return forcedVariables[tagName];
    if (scheduler?.globalVariables[tagName] !== undefined) return scheduler.globalVariables[tagName];
    const tag = project.tags.find((t) => t.name === tagName);
    return tag ? tag.currentValue : defaultVal;
  };

  const tankLevel = Number(getTagValue("Tanque_Nivel_Percent", 65.0));
  const pumpRunning = Boolean(getTagValue("Bomba_01_Run", false));
  const pumpSpeed = Number(getTagValue("Bomba_01_SpeedRPM", 0));
  const eStopHealthy = Boolean(getTagValue("E_STOP_Circuito_01", true));

  // Toggle do botão de emergência simulado
  const handleToggleEStop = () => {
    if (forcedVariables["E_STOP_Circuito_01"] !== undefined) {
      unforceVariable("E_STOP_Circuito_01");
    } else {
      forceVariable("E_STOP_Circuito_01", !eStopHealthy);
    }
  };

  // Forçar nível do tanque
  const handleLevelSlider = (val: number) => {
    forceVariable("Tanque_Nivel_Percent", val);
  };

  return (
    <div className="flex flex-col h-full bg-[#141417] text-zinc-200">
      {/* Barra de Topo da IHM */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#101013] border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Sliders className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold text-sm text-zinc-100">
            {hmiPage?.name || "HMI_Estacao_Principal"}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
            Modo Runtime Integrado
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!eStopHealthy && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded bg-rose-950/60 border border-rose-600 text-rose-300 text-xs font-mono font-bold animate-pulse">
              <WarningCircle className="w-4 h-4" /> CIRCUITO DE EMERGÊNCIA ATUADO
            </span>
          )}
        </div>
      </div>

      {/* Painel Sinótico da Estação Industrial */}
      <div className="flex-1 overflow-auto p-6 flex flex-col items-center justify-center bg-[#0d0d10] gap-8">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Reservatório / Tanque com Nível */}
          <div className="bg-[#18181b] p-5 rounded-xl border border-zinc-800 flex flex-col items-center relative shadow-md">
            <div className="flex items-center justify-between w-full pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Drop className="w-5 h-5 text-cyan-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Tanque TK-101
                </span>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-cyan-300 font-bold">
                {tankLevel.toFixed(1)} %
              </span>
            </div>

            {/* Visual do Tanque Vertical */}
            <div className="w-28 h-56 border-2 border-zinc-600 rounded-lg relative my-5 overflow-hidden bg-zinc-950 flex flex-col justify-end">
              {/* Linha de Limite Alto 85% */}
              <div
                className="absolute w-full border-b border-dashed border-rose-500/80 z-10"
                style={{ bottom: "85%" }}
                title="Limite Alto: 85%"
              />
              {/* Linha de Limite Baixo 40% */}
              <div
                className="absolute w-full border-b border-dashed border-amber-500/80 z-10"
                style={{ bottom: "40%" }}
                title="Limite Baixo: 40%"
              />

              {/* Coluna de Líquido */}
              <div
                className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all duration-300 relative"
                style={{ height: `${Math.min(100, Math.max(0, tankLevel))}%` }}
              >
                <div className="absolute top-0 w-full h-1 bg-cyan-200/50 animate-pulse" />
              </div>
            </div>

            {/* Slider de Forcing de Nível para Teste do Operador */}
            <div className="w-full flex flex-col gap-1 text-[11px] font-mono text-zinc-400">
              <div className="flex justify-between">
                <span>Simular Nível:</span>
                <span>{tankLevel.toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={tankLevel}
                onChange={(e) => handleLevelSlider(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Card 2: Bomba Centrífuga PMP-01 */}
          <div className="bg-[#18181b] p-5 rounded-xl border border-zinc-800 flex flex-col items-center justify-between shadow-md">
            <div className="flex items-center justify-between w-full pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <ArrowsClockwise className="w-5 h-5 text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Bomba PMP-01
                </span>
              </div>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded font-bold ${
                  pumpRunning
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {pumpRunning ? "EM OPERAÇÃO" : "PARADA"}
              </span>
            </div>

            {/* Animação do Rotor da Bomba */}
            <div className="my-6 relative flex items-center justify-center">
              <div
                className={`w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all ${
                  pumpRunning
                    ? "border-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-500/20"
                    : "border-zinc-700 bg-zinc-900"
                }`}
              >
                <ArrowsClockwise
                  className={`w-16 h-16 ${
                    pumpRunning ? "text-emerald-400 animate-spin" : "text-zinc-600"
                  }`}
                  style={{ animationDuration: pumpRunning ? "1s" : "0s" }}
                />
              </div>
            </div>

            <div className="w-full flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 font-mono text-xs">
              <span className="text-zinc-400">Velocidade:</span>
              <span className="font-bold text-zinc-100">{pumpRunning ? "1750 RPM" : "0 RPM"}</span>
            </div>
          </div>

          {/* Card 3: E-STOP e Segurança Operacional */}
          <div className="bg-[#18181b] p-5 rounded-xl border border-zinc-800 flex flex-col items-center justify-between shadow-md">
            <div className="flex items-center justify-between w-full pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-rose-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                  E-STOP & Intertravamento
                </span>
              </div>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded font-bold ${
                  eStopHealthy
                    ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                    : "bg-rose-950 text-rose-300 border border-rose-800"
                }`}
              >
                {eStopHealthy ? "FECHADO (OK)" : "DISPARADO"}
              </span>
            </div>

            {/* Botão Cogumelo de Parada de Emergência */}
            <div className="my-6 flex flex-col items-center gap-2">
              <button
                onClick={handleToggleEStop}
                className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all transform active:scale-95 shadow-xl ${
                  eStopHealthy
                    ? "bg-rose-600 hover:bg-rose-500 border-rose-800 text-white"
                    : "bg-zinc-800 border-zinc-600 text-rose-500"
                }`}
                title="Clique para acionar ou destravar parada de emergência"
              >
                <Power className="w-10 h-10" weight="bold" />
              </button>
              <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono">
                {eStopHealthy ? "Emergência Pronta" : "Emergência Atuada"}
              </span>
            </div>

            <div className="w-full text-[11px] text-zinc-400 text-center border-t border-zinc-800 pt-2 font-mono">
              Tag: {project.tags.find((t) => t.code === "ES-01")?.name || "E_STOP"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
