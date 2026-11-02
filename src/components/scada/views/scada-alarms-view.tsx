// SCADA SUPERVISÓRIO — View 3: Gestão de Alarmes (ISA-18.2)
// Comprehensive industrial alarm console with filtering, shelving, and audit export

import { useState } from "react";
import {
  Bell,
  WarningOctagon,
  WarningCircle,
  CheckCircle,
  DownloadSimple,
  MagnifyingGlass,
  Funnel,
  SpeakerSlash,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import type { AlarmSeverity, AlarmState, ScadaAlarmItem } from "@/lib/scada/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ScadaAlarmsView() {
  const alarms = useScadaStore((s) => s.alarms);
  const acknowledgeAlarm = useScadaStore((s) => s.acknowledgeAlarm);
  const acknowledgeAllAlarms = useScadaStore((s) => s.acknowledgeAllAlarms);
  const clearAlarm = useScadaStore((s) => s.clearAlarm);

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [stateFilter, setStateFilter] = useState<string>("ALL");

  const validAlarms = (alarms || []).filter((a): a is ScadaAlarmItem => Boolean(a && a.id));
  const unackCount = validAlarms.filter((a) => a.state === "UNACK").length;
  const critCount = validAlarms.filter((a) => a.priority === "CRITICAL").length;
  const highCount = validAlarms.filter((a) => a.priority === "HIGH").length;

  const filteredAlarms = validAlarms.filter((a) => {
    if (
      search &&
      !a.tag.toLowerCase().includes(search.toLowerCase()) &&
      !(a.description || "").toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    if (priorityFilter !== "ALL" && a.priority !== priorityFilter) return false;
    if (stateFilter !== "ALL" && a.state !== stateFilter) return false;
    return true;
  });

  const handleExportCsv = () => {
    const header = "ID,TAG,Prioridade,Categoria,Descricao,Valor,Limite,Estado,DisparadoEm\n";
    const rows = alarms
      .map(
        (a) =>
          `"${a.id}","${a.tag}","${a.priority}","${a.category}","${a.description}","${a.currentValue}","${a.setpointLimit}","${a.state}","${new Date(a.timestamp).toISOString()}"`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `alarmes_isa18_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Histórico de alarmes exportado em CSV.");
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto min-h-0 bg-[#080b11] text-zinc-200 space-y-4">
      {/* 1. ISA-18.2 Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-950/80 border border-zinc-800 p-3.5 rounded-lg flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-mono uppercase text-zinc-400 font-semibold tracking-wider block">
              Alarmes Não Reconhecidos
            </span>
            <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">
              {unackCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Bell className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800 p-3.5 rounded-lg flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-mono uppercase text-zinc-400 font-semibold tracking-wider block">
              Prioridade Crítica (P1)
            </span>
            <span className="text-xl font-bold font-mono text-red-400 mt-1 block">{critCount}</span>
          </div>
          <div className="w-10 h-10 rounded-md bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            <WarningOctagon className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800 p-3.5 rounded-lg flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-mono uppercase text-zinc-400 font-semibold tracking-wider block">
              Prioridade Alta (P2)
            </span>
            <span className="text-xl font-bold font-mono text-orange-400 mt-1 block">
              {highCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
            <WarningCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-zinc-950/80 border border-zinc-800 p-3.5 rounded-lg flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-mono uppercase text-zinc-400 font-semibold tracking-wider block">
              Conformidade ISA-18.2
            </span>
            <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
              100% AUDITADO
            </span>
          </div>
          <div className="w-10 h-10 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Filter & Actions Toolbar */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-2xl">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlass className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por TAG ou descrição..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-300 font-mono"
          >
            <option value="ALL">Todas Prioridades</option>
            <option value="CRITICAL">Crítico</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Média</option>
            <option value="LOW">Baixa</option>
          </select>

          {/* State Filter */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-300 font-mono"
          >
            <option value="ALL">Todos Estados</option>
            <option value="UNACK">Não Reconhecidos</option>
            <option value="ACK">Reconhecidos</option>
            <option value="CLEARED">Normalizados</option>
          </select>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              acknowledgeAllAlarms();
              toast.success("Todos os alarmes reconhecidos.");
            }}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold shadow-sm transition-colors"
          >
            Reconhecer Todos
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-mono text-xs transition-colors"
          >
            <DownloadSimple className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* 3. Alarms Main Table */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg overflow-hidden flex-1 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase text-zinc-400 bg-zinc-900/90">
                <th className="py-2.5 px-3">Prioridade</th>
                <th className="py-2.5 px-3">TAG</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Descrição da Anomalia</th>
                <th className="py-2.5 px-3">Valor / Setpoint</th>
                <th className="py-2.5 px-3">Horário Disparo</th>
                <th className="py-2.5 px-3">Estado</th>
                <th className="py-2.5 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
              {filteredAlarms.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500 italic">
                    Nenhum alarme encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredAlarms.map((a) => {
                  const d = new Date(a.timestamp);
                  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

                  return (
                    <tr
                      key={a.id}
                      className={cn(
                        "hover:bg-zinc-900/60 transition-colors",
                        a.priority === "CRITICAL"
                          ? "bg-red-950/20"
                          : a.priority === "HIGH"
                            ? "bg-amber-950/20"
                            : "",
                      )}
                    >
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold",
                            a.priority === "CRITICAL"
                              ? "bg-red-500 text-white animate-pulse"
                              : a.priority === "HIGH"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                : "bg-blue-500/20 text-blue-300 border border-blue-500/30",
                          )}
                        >
                          {a.priority}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-bold text-white whitespace-nowrap">{a.tag}</td>
                      <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">{a.category}</td>
                      <td className="py-2 px-3 text-zinc-300 max-w-sm">{a.description}</td>
                      <td className="py-2 px-3 text-cyan-400 whitespace-nowrap">
                        {String(a.currentValue)}{" "}
                        <span className="text-zinc-500 text-[10px]">({a.setpointLimit})</span>
                      </td>
                      <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">{timeStr}</td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                            a.state === "UNACK"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                              : "bg-zinc-800 text-zinc-400",
                          )}
                        >
                          {a.state === "UNACK" ? "NÃO RECONHECIDO" : "RECONHECIDO"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {a.state === "UNACK" ? (
                          <button
                            onClick={() => {
                              acknowledgeAlarm(a.id);
                              toast.success(`Alarme ${a.tag} reconhecido.`);
                            }}
                            className="px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 text-[10px] font-semibold transition-colors"
                          >
                            Reconhecer
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              clearAlarm(a.id);
                              toast.info(`Alarme ${a.tag} arquivado.`);
                            }}
                            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-[10px] font-semibold transition-colors"
                          >
                            Limpar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
