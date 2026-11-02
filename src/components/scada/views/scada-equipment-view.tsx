// SCADA SUPERVISÓRIO — View 5: Inventário Unificado de Equipamentos
// Displays canonical equipment details, operational status and direct inspection

import { useState } from "react";
import {
  Cpu,
  MagnifyingGlass,
  CheckCircle,
  WarningCircle,
  Eye,
  Lightning,
  Funnel,
  Power,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import type { EquipmentTelemetry } from "@/lib/scada/types";
import { cn } from "@/lib/utils";

export function ScadaEquipmentView() {
  const equipments = useScadaStore((s) => s.equipments);
  const selectEquipment = useScadaStore((s) => s.selectEquipment);
  const commandEquipment = useScadaStore((s) => s.commandEquipment);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const equipmentList = Object.values(equipments)
    .filter((eq): eq is EquipmentTelemetry => Boolean(eq && eq.id && eq.tag))
    .filter((eq) => {
      if (
        search &&
        !eq.tag.toLowerCase().includes(search.toLowerCase()) &&
        !(eq.name || "").toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      if (categoryFilter !== "ALL" && eq.category !== categoryFilter) return false;
      return true;
    });

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto min-h-0 bg-[#080b11] text-zinc-200 space-y-4">
      {/* 1. Header & Filters */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <h2 className="text-sm font-mono font-bold uppercase text-white">
            Inventário Unificado de Equipamentos Industriais
          </h2>
          <p className="text-[11px] text-zinc-400 font-mono">
            Sincronizado com diagramas Unifilar, Multifilar, Ladder e Digital Twin
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-[220px]">
            <MagnifyingGlass className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar equipamento..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-300 font-mono"
          >
            <option value="ALL">Todas Categorias</option>
            <option value="PUMP">Bombas & Motores</option>
            <option value="TANK">Tanques & Reservatórios</option>
            <option value="VALVE">Válvulas & Atuadores</option>
            <option value="FILTER">Filtros de Processo</option>
            <option value="TRANSFORMER">Transformadores</option>
            <option value="PANEL">Quadros Elétricos</option>
            <option value="PLC">Controladores (CLP)</option>
          </select>
        </div>
      </div>

      {/* 2. Equipment Table */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg overflow-hidden flex-1 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase text-zinc-400 bg-zinc-900/90">
                <th className="py-2.5 px-3">TAG</th>
                <th className="py-2.5 px-3">Nome do Equipamento</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Estado Operacional</th>
                <th className="py-2.5 px-3">Modo</th>
                <th className="py-2.5 px-3">Tensão / Potência</th>
                <th className="py-2.5 px-3">Horas de Operação</th>
                <th className="py-2.5 px-3">Última Preventiva</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
              {equipmentList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-zinc-500 font-mono text-xs">
                    Nenhum equipamento cadastrado neste projeto.
                  </td>
                </tr>
              ) : (
                equipmentList.map((eq) => (
                  <tr key={eq.id} className="hover:bg-zinc-900/60 transition-colors">
                    <td className="py-2 px-3 font-bold text-blue-400 whitespace-nowrap">
                      {eq.tag}
                    </td>
                    <td className="py-2 px-3 font-semibold text-white whitespace-nowrap">
                      {eq.name}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">{eq.category}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded",
                          eq.status === "RUNNING" || eq.status === "OPEN"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : eq.status === "TRIPPED"
                              ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                              : "bg-zinc-800 text-zinc-400",
                        )}
                      >
                        {eq.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className="text-[10px] text-zinc-300 font-bold bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded">
                        {eq.mode}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-cyan-400 whitespace-nowrap">
                      {eq.voltageV > 0 ? `${eq.voltageV}V / ${eq.powerKw}kW` : "Sinal 24VDC"}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">
                      {eq.runningHours} h
                    </td>
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">
                      {eq.lastMaintenance}
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => selectEquipment(eq.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 text-[11px] font-semibold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspecionar</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
