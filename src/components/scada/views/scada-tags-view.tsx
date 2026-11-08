// SCADA SUPERVISÓRIO — View 6: Registro de TAGs Industriais (Tag Registry)
// Real-time tag dictionary with data types, engineering units, quality flags, and force overrides

import { useState } from "react";
import {
  Tag,
  MagnifyingGlass,
  Funnel,
  ShieldWarning,
  CheckCircle,
  PencilSimple,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { type ScadaTagDefinition, resolveTagProvenance, type DataSourceProvenance } from "@/lib/scada/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ScadaTagsView() {
  const tags = useScadaStore((s) => s.tags);
  const forceTagValue = useScadaStore((s) => s.forceTagValue);
  const unforceTag = useScadaStore((s) => s.unforceTag);

  const [search, setSearch] = useState("");
  const [driverFilter, setDriverFilter] = useState("ALL");
  const [forcingTagId, setForcingTagId] = useState<string | null>(null);
  const [newVal, setNewVal] = useState("");

  const tagList = Object.values(tags)
    .filter((t): t is ScadaTagDefinition => Boolean(t && t.name))
    .filter((t) => {
      if (
        search &&
        !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !(t.description || "").toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      if (driverFilter !== "ALL") {
        const provenance = resolveTagProvenance(t.quality, t.driver, t.forced, t.isSimulated);
        if (driverFilter.startsWith("PROV_")) {
          const targetProv = driverFilter.replace("PROV_", "");
          if (provenance !== targetProv) return false;
        } else if (t.driver !== driverFilter) {
          return false;
        }
      }
      return true;
    });

  const handleApplyForce = (id: string) => {
    if (!newVal) return;
    const num = Number(newVal);
    const parsed = isNaN(num) ? newVal : num;
    forceTagValue(id, parsed);
    toast.warning(`TAG ${id} forçada para o valor: ${parsed}`);
    setForcingTagId(null);
    setNewVal("");
  };

  const handleReleaseForce = (id: string) => {
    unforceTag(id);
    toast.info(`Forçamento liberado para a TAG ${id}`);
  };

  const PROV_BADGE_CONFIG: Record<DataSourceProvenance, { label: string; cls: string }> = {
    PHYSICAL_DATA: { label: "FÍSICO", cls: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
    INTERNAL_RUNTIME: { label: "RUNTIME", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    SIMULATED_DATA: { label: "SIMULADO", cls: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
    CALCULATED_DATA: { label: "CALCULADO", cls: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
    FORCED_DATA: { label: "FORÇADO", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
    STALE_DATA: { label: "STALE", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
    BAD_QUALITY: { label: "BAD", cls: "bg-red-500/15 text-red-400 border-red-500/40" },
    NOT_CONNECTED: { label: "OFFLINE", cls: "bg-zinc-800 text-zinc-400 border-zinc-700" },
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto min-h-0 bg-[#080b11] text-zinc-200 space-y-4">
      {/* 1. Header & Filters */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <h2 className="text-sm font-mono font-bold uppercase text-white">
            Registro Oficial de TAGs Industriais (IEC 61131-3)
          </h2>
          <p className="text-[11px] text-zinc-400 font-mono">
            {Object.keys(tags).length} tags catalogadas • Sincronização em tempo real (100 ms)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-[220px]">
            <MagnifyingGlass className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou descrição..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <select
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-300 font-mono"
          >
            <option value="ALL">Todas as TAGs</option>
            <optgroup label="Proveniência dos Dados (ISA-101)">
              <option value="PROV_PHYSICAL_DATA">Telemetria Física (PHYSICAL_DATA)</option>
              <option value="PROV_SIMULATED_DATA">Simulação Virtual (SIMULATED_DATA)</option>
              <option value="PROV_INTERNAL_RUNTIME">Runtime Interno (INTERNAL_RUNTIME)</option>
              <option value="PROV_FORCED_DATA">Forçadas por Operador (FORCED_DATA)</option>
              <option value="PROV_STALE_DATA">Dados Estagnados (STALE_DATA)</option>
              <option value="PROV_BAD_QUALITY">Falha de Leitura (BAD_QUALITY)</option>
              <option value="PROV_NOT_CONNECTED">Não Conectado (NOT_CONNECTED)</option>
            </optgroup>
            <optgroup label="Protocolos Industriais">
              <option value="OPC_UA">OPC UA</option>
              <option value="MODBUS_TCP">Modbus TCP</option>
              <option value="MQTT">MQTT Sparkplug B</option>
            </optgroup>
          </select>
        </div>
      </div>

      {/* 2. Tags Table */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg overflow-hidden flex-1 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase text-zinc-400 bg-zinc-900/90">
                <th className="py-2.5 px-3">Nome da TAG</th>
                <th className="py-2.5 px-3">Descrição Funcional</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3">Valor Atual</th>
                <th className="py-2.5 px-3">Unidade</th>
                <th className="py-2.5 px-3">Qualidade</th>
                <th className="py-2.5 px-3">Proveniência</th>
                <th className="py-2.5 px-3">Driver</th>
                <th className="py-2.5 px-3">Endereço CLP</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
              {tagList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-zinc-500 font-mono text-xs">
                    Nenhuma variável ou TAG localizada neste projeto.
                  </td>
                </tr>
              ) : (
                tagList.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-900/60 transition-colors">
                    <td className="py-2 px-3 font-bold text-white whitespace-nowrap">{t.name}</td>
                    <td className="py-2 px-3 text-zinc-300 max-w-xs truncate">{t.description}</td>
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">
                      <span className="bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded text-[10px] text-zinc-300">
                        {t.dataType}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-bold text-cyan-400 whitespace-nowrap">
                      {typeof t.value === "number" ? t.value.toFixed(1) : String(t.value)}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">{t.unit || "—"}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded",
                          t.quality === "GOOD"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : t.quality === "FORCED"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : "bg-red-500/20 text-red-400 border border-red-500/40",
                        )}
                      >
                        {t.quality}
                      </span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {(() => {
                        const prov = resolveTagProvenance(t.quality, t.driver, t.forced, t.isSimulated);
                        const badge = PROV_BADGE_CONFIG[prov];
                        return (
                          <span className={cn("text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border", badge.cls)}>
                            {badge.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">{t.driver}</td>
                    <td className="py-2 px-3 text-zinc-500 whitespace-nowrap">{t.sourceAddress}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      {t.forced ? (
                        <button
                          onClick={() => handleReleaseForce(t.name)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/30 text-[10px] font-semibold transition-colors"
                        >
                          <ArrowCounterClockwise className="w-3 h-3" />
                          <span>Liberar</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setForcingTagId(t.name);
                            setNewVal(String(t.value));
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-[10px] font-semibold transition-colors"
                        >
                          <PencilSimple className="w-3 h-3" />
                          <span>Forçar</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Force Value Dialog */}
      {forcingTagId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-zinc-700 rounded-lg p-5 max-w-sm w-full space-y-4 shadow-2xl font-mono text-xs">
            <h3 className="text-sm font-bold text-amber-400 uppercase flex items-center gap-2">
              <ShieldWarning className="w-4 h-4" />
              <span>Forçamento de TAG</span>
            </h3>
            <p className="text-zinc-300 text-[11px]">
              Insira o valor simulado para forçar a tag{" "}
              <strong className="text-white">{forcingTagId}</strong>. Essa operação será registrada
              na trilha de auditoria.
            </p>
            <input
              type="text"
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              placeholder="Novo valor..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-white"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setForcingTagId(null)}
                className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleApplyForce(forcingTagId)}
                className="px-3 py-1.5 bg-amber-600 text-white rounded font-bold hover:bg-amber-500"
              >
                Confirmar Forçamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
