import React, { useState } from "react";
import { useStudioStore } from "../../lib/studio/studio-store";
import type { HardwareModule, IOChannel } from "../../lib/studio/canonical/types";
import {
  Cpu,
  Plug,
  Broadcast,
  CheckCircle,
  Circle,
  ArrowsLeftRight,
  Database,
  ShieldCheck,
  Plus,
} from "@phosphor-icons/react";

export const DeviceTreeView: React.FC = () => {
  const { project, mapIOChannelToTag, scheduler, isSimulating } = useStudioStore();
  const controller = project.controllers[0];

  const [selectedModuleId, setSelectedModuleId] = useState<string>(
    controller?.rackModules[0]?.id || ""
  );

  const selectedModule = controller?.rackModules.find((m) => m.id === selectedModuleId);

  const handleMapTag = (channelId: string, tagId: string) => {
    mapIOChannelToTag(channelId, tagId || undefined);
  };

  const getModuleIcon = (type: string) => {
    switch (type) {
      case "CPU":
        return <Cpu className="w-5 h-5 text-indigo-400" />;
      case "COMMUNICATION":
        return <Broadcast className="w-5 h-5 text-cyan-400" />;
      case "SAFETY":
        return <ShieldCheck className="w-5 h-5 text-amber-400" />;
      default:
        return <Plug className="w-5 h-5 text-emerald-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#18181b] text-zinc-200">
      {/* Cabeçalho do Hardware Rack */}
      <div className="p-4 border-b border-zinc-800 bg-[#121215] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="w-6 h-6 text-indigo-400" />
            <h2 className="text-base font-bold text-zinc-100">
              {controller?.name || "CODESYS Control Win V3"}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
              IP: {controller?.ipAddress}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Configuração de Rack Físico / Virtual, Módulos de E/S e Mapeamento de Canais IEC
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800 flex items-center gap-1.5 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Online / Sincronizado
          </span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Lista de Slots do Rack (Esquerda) */}
        <div className="w-80 border-r border-zinc-800 bg-[#141417] p-3 flex flex-col gap-2 overflow-y-auto">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider px-2 py-1">
            Módulos no Rack ({controller?.rackModules.length || 0})
          </div>

          {controller?.rackModules.map((module) => {
            const isSelected = module.id === selectedModuleId;
            return (
              <button
                key={module.id}
                onClick={() => setSelectedModuleId(module.id)}
                className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                  isSelected
                    ? "bg-indigo-950/40 border-indigo-700/60 text-indigo-100 shadow-sm"
                    : "bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-800/40 text-zinc-300"
                }`}
              >
                <div className="p-2 rounded bg-black/40 border border-zinc-800 mt-0.5">
                  {getModuleIcon(module.catalogKey.includes("DI") ? "DIGITAL_INPUT" : module.catalogKey.includes("DO") ? "DIGITAL_OUTPUT" : "CPU")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs truncate">{module.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      Slot {module.slotNumber}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
                    {module.catalogKey} ({module.partNumber})
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    {module.channels.length} canais
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tabela de Canais de E/S & Mapeamento de Tags (Direita) */}
        <div className="flex-1 flex flex-col bg-[#18181b] overflow-hidden">
          {selectedModule ? (
            <div className="flex-1 flex flex-col p-4 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    {selectedModule.name}
                    <span className="text-xs font-normal text-zinc-400">
                      (Slot {selectedModule.slotNumber} — {selectedModule.catalogKey})
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Mapeamento de endereço de memória (%I/%Q) para tags canônicas do sistema
                  </p>
                </div>
              </div>

              {selectedModule.channels.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-sm">
                  Este módulo de CPU não possui canais físicos diretos mapeados.
                </div>
              ) : (
                <div className="border border-zinc-800 rounded-lg overflow-hidden bg-[#121215]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-900/80 text-zinc-400 uppercase font-mono text-[10px] border-b border-zinc-800">
                      <tr>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Canal</th>
                        <th className="py-2.5 px-3">Endereço IEC</th>
                        <th className="py-2.5 px-3">Tipo</th>
                        <th className="py-2.5 px-3">Tag Canônica Vinculada</th>
                        <th className="py-2.5 px-3">Valor no Process Image</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-mono">
                      {selectedModule.channels.map((ch) => {
                        const mappedTag = project.tags.find((t) => t.id === ch.mappedTagId);
                        let processVal = "---";
                        if (scheduler) {
                          if (ch.direction.includes("INPUT")) {
                            processVal = String(
                              scheduler.inputProcessImage[ch.iecAddress] ??
                                (mappedTag ? mappedTag.currentValue : "0")
                            );
                          } else {
                            processVal = String(
                              scheduler.outputProcessImage[ch.iecAddress] ??
                                (mappedTag ? mappedTag.currentValue : "0")
                            );
                          }
                        }

                        const isActive = processVal === "true" || Number(processVal) > 0;

                        return (
                          <tr key={ch.id} className="hover:bg-zinc-800/20 transition-colors">
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-block w-2.5 h-2.5 rounded-full ${
                                  isActive
                                    ? "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                                    : "bg-zinc-700"
                                }`}
                                title={isActive ? "Canal Ativo" : "Canal Inativo"}
                              />
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-zinc-200">{ch.name}</td>
                            <td className="py-2.5 px-3 text-indigo-400 font-bold">
                              {ch.iecAddress}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-400">
                              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px]">
                                {ch.direction} ({ch.electricalSignal})
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-sans">
                              <select
                                value={ch.mappedTagId || ""}
                                onChange={(e) => handleMapTag(ch.id, e.target.value)}
                                className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1 w-full focus:outline-none focus:border-indigo-500"
                              >
                                <option value="">-- Não mapeado --</option>
                                {project.tags.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name} ({t.dataType}) — [{t.code}]
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`font-bold ${
                                  isActive ? "text-emerald-400" : "text-zinc-500"
                                }`}
                              >
                                {processVal}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
              Selecione um módulo no rack para inspecionar os canais.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
