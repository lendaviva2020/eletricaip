// SCADA SUPERVISÓRIO — Equipment Details Slide-Over Inspector
// Interactive drawer providing real-time telemetry, electrical parameters and operator commands

import { useState } from "react";
import {
  X,
  Cpu,
  Power,
  SlidersHorizontal,
  WarningCircle,
  Tag,
  Lightning,
  ArrowsClockwise,
  CheckCircle,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function EquipmentInspectorDrawer() {
  const selectedId = useScadaStore((s) => s.selectedEquipmentId);
  const selectEquipment = useScadaStore((s) => s.selectEquipment);
  const equipments = useScadaStore((s) => s.equipments);
  const tags = useScadaStore((s) => s.tags);
  const commandEquipment = useScadaStore((s) => s.commandEquipment);
  const forceTagValue = useScadaStore((s) => s.forceTagValue);
  const unforceTag = useScadaStore((s) => s.unforceTag);
  const alarms = useScadaStore((s) => s.alarms);

  const [forceVal, setForceVal] = useState<string>("");
  const [selectedTagToForce, setSelectedTagToForce] = useState<string | null>(null);

  if (!selectedId) return null;
  const eq = equipments[selectedId];
  if (!eq) return null;

  const eqAlarms = alarms.filter(
    (a) => a.tag.includes(selectedId) || a.description.includes(selectedId),
  );

  const handleCommand = (cmd: "START" | "STOP" | "OPEN" | "CLOSE" | "AUTO" | "MANUAL") => {
    commandEquipment(selectedId, cmd);
    toast.success(`Comando ${cmd} executado em ${eq.tag}`);
  };

  const handleApplyForce = (tagId: string) => {
    if (!forceVal) return;
    const num = Number(forceVal);
    const val = isNaN(num) ? forceVal : num;
    forceTagValue(tagId, val);
    toast.warning(`Tag ${tagId} forçada para: ${val}`);
    setSelectedTagToForce(null);
    setForceVal("");
  };

  const handleRemoveForce = (tagId: string) => {
    unforceTag(tagId);
    toast.info(`Forçamento removido da tag ${tagId}`);
  };

  return (
    <div
      className="absolute inset-y-0 right-0 w-[420px] bg-[#0c1018] border-l border-zinc-800 shadow-2xl z-30 flex flex-col select-none text-zinc-200 animate-in slide-in-from-right duration-200"
      data-testid="scada-equipment-drawer"
    >
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-blue-950/60 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-blue-400">{eq.tag}</span>
              <span
                className={cn(
                  "text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold",
                  eq.status === "RUNNING" || eq.status === "OPEN"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : eq.status === "TRIPPED"
                      ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                      : "bg-zinc-800 text-zinc-400",
                )}
              >
                {eq.status}
              </span>
            </div>
            <h2 className="text-sm font-bold text-white truncate max-w-[260px]">{eq.name}</h2>
          </div>
        </div>

        <button
          onClick={() => selectEquipment(null)}
          className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Fechar painel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans">
        {/* Mode & Quick Commands */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-semibold uppercase text-zinc-400">
              Modo de Controle
            </span>
            <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-800">
              <button
                onClick={() => handleCommand("AUTO")}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors",
                  eq.mode === "AUTO"
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                AUTO
              </button>
              <button
                onClick={() => handleCommand("MANUAL")}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors",
                  eq.mode === "MANUAL"
                    ? "bg-amber-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200",
                )}
              >
                MANUAL
              </button>
            </div>
          </div>

          {/* Action buttons based on equipment category */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {eq.category === "PUMP" ? (
              <>
                <button
                  onClick={() => handleCommand("START")}
                  disabled={eq.status === "RUNNING"}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium text-xs transition-colors"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Partida (Start)</span>
                </button>
                <button
                  onClick={() => handleCommand("STOP")}
                  disabled={eq.status === "STOPPED"}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-medium text-xs transition-colors"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Parada (Stop)</span>
                </button>
              </>
            ) : eq.category === "VALVE" ? (
              <>
                <button
                  onClick={() => handleCommand("OPEN")}
                  disabled={eq.status === "OPEN"}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium text-xs transition-colors"
                >
                  <span>Abrir Válvula</span>
                </button>
                <button
                  onClick={() => handleCommand("CLOSE")}
                  disabled={eq.status === "CLOSED"}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white font-medium text-xs transition-colors"
                >
                  <span>Fechar Válvula</span>
                </button>
              </>
            ) : (
              <div className="col-span-2 text-center text-[11px] text-zinc-500 italic py-1">
                Equipamento passivo monitorado em tempo real pelo CLP-01.
              </div>
            )}
          </div>
        </div>

        {/* Electrical & Mechanical Ratings */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2">
          <div className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
            <Lightning className="w-3.5 h-3.5 text-amber-400" />
            <span>Dados Elétricos & Operacionais</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
              <span className="text-zinc-500 block text-[10px]">TENSÃO NOMINAL</span>
              <span className="font-semibold text-zinc-200">
                {typeof eq.voltageV === "number" && eq.voltageV > 0 ? `${eq.voltageV} V` : "380 V"}
              </span>
            </div>
            <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
              <span className="text-zinc-500 block text-[10px]">CORRENTE REAL</span>
              <span className="font-semibold text-amber-400">
                {typeof eq.currentA === "number" && eq.currentA > 0
                  ? `${eq.currentA.toFixed(1)} A`
                  : "0.0 A"}
              </span>
            </div>
            <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
              <span className="text-zinc-500 block text-[10px]">POTÊNCIA ATIVA</span>
              <span className="font-semibold text-cyan-400">
                {typeof eq.powerKw === "number" && eq.powerKw > 0
                  ? `${eq.powerKw.toFixed(1)} kW`
                  : "0.0 kW"}
              </span>
            </div>
            <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
              <span className="text-zinc-500 block text-[10px]">FATOR DE POTÊNCIA</span>
              <span className="font-semibold text-zinc-200">
                {typeof eq.powerFactor === "number" ? eq.powerFactor.toFixed(2) : "0.92"}
              </span>
            </div>
            {eq.flowRateM3h !== undefined && (
              <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
                <span className="text-zinc-500 block text-[10px]">VAZÃO OPERACIONAL</span>
                <span className="font-semibold text-emerald-400">
                  {typeof eq.flowRateM3h === "number"
                    ? `${eq.flowRateM3h.toFixed(1)} m³/h`
                    : "0.0 m³/h"}
                </span>
              </div>
            )}
            {eq.levelPct !== undefined && (
              <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
                <span className="text-zinc-500 block text-[10px]">NÍVEL ATUAL</span>
                <span className="font-semibold text-cyan-400">
                  {typeof eq.levelPct === "number" ? `${eq.levelPct.toFixed(1)} %` : "0.0 %"}
                </span>
              </div>
            )}
            {eq.pressureBar !== undefined && (
              <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
                <span className="text-zinc-500 block text-[10px]">PRESSÃO PROCESSO</span>
                <span className="font-semibold text-amber-400">
                  {typeof eq.pressureBar === "number"
                    ? `${eq.pressureBar.toFixed(1)} bar`
                    : "0.0 bar"}
                </span>
              </div>
            )}
            {eq.temperatureC !== undefined && (
              <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
                <span className="text-zinc-500 block text-[10px]">TEMPERATURA</span>
                <span className="font-semibold text-zinc-200">
                  {typeof eq.temperatureC === "number"
                    ? `${eq.temperatureC.toFixed(1)} °C`
                    : "25.0 °C"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Linked Tags Table with Forcing Capability */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2">
          <div className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-blue-400" />
            <span>TAGs Vinculadas no CLP</span>
          </div>

          <div className="space-y-1.5">
            {eq.linkedTags.map((tagName) => {
              const tag = tags[tagName];
              if (!tag) {
                return (
                  <div
                    key={tagName}
                    className="p-2 rounded bg-zinc-950/50 border border-zinc-800 flex justify-between font-mono text-[11px]"
                  >
                    <span className="text-zinc-400">{tagName}</span>
                    <span className="text-zinc-600">Off-line</span>
                  </div>
                );
              }

              const isBeingForced = selectedTagToForce === tagName;

              return (
                <div
                  key={tagName}
                  className="p-2 rounded bg-zinc-950/80 border border-zinc-800 text-[11px] font-mono space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{tag.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded text-[9px] font-bold",
                          tag.forced
                            ? "bg-amber-500/30 text-amber-300 border border-amber-500/50"
                            : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
                        )}
                      >
                        {tag.quality}
                      </span>
                      <span className="text-xs font-bold text-cyan-400">
                        {String(tag.value)} {tag.unit}
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-zinc-500 flex justify-between items-center pt-0.5">
                    <span>{tag.description}</span>
                    {tag.forced ? (
                      <button
                        onClick={() => handleRemoveForce(tag.name)}
                        className="text-amber-400 hover:underline"
                      >
                        Liberar Forçamento
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedTagToForce(isBeingForced ? null : tagName)}
                        className="text-blue-400 hover:underline"
                      >
                        {isBeingForced ? "Cancelar" : "Forçar Valor"}
                      </button>
                    )}
                  </div>

                  {isBeingForced && (
                    <div className="pt-2 flex items-center gap-2 border-t border-zinc-800 mt-1">
                      <input
                        type="text"
                        value={forceVal}
                        onChange={(e) => setForceVal(e.target.value)}
                        placeholder={`Novo valor (${tag.unit})`}
                        className="bg-zinc-900 border border-zinc-700 px-2 py-1 rounded text-white flex-1 text-xs"
                      />
                      <button
                        onClick={() => handleApplyForce(tag.name)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold"
                      >
                        Aplicar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Maintenance & Lifetime Metrics */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-1.5 text-zinc-400 font-mono text-[11px]">
          <div className="flex justify-between">
            <span>Horas em Operação:</span>
            <span className="text-white font-semibold">{eq.runningHours} h</span>
          </div>
          <div className="flex justify-between">
            <span>Partidas Acumuladas:</span>
            <span className="text-white font-semibold">{eq.startsCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Última Manutenção Preventiva:</span>
            <span className="text-zinc-300 font-semibold">{eq.lastMaintenance}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
