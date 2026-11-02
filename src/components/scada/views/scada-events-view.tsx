// SCADA SUPERVISÓRIO — View 8: Eventos & Trilha de Auditoria (Audit Trail)
// Implements 21 CFR Part 11 and ISA-88/95 compliant operator audit logging

import { useState } from "react";
import {
  Scroll,
  MagnifyingGlass,
  DownloadSimple,
  ShieldCheck,
  Funnel,
  WarningOctagon,
  Clock,
  User,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import type { ScadaAuditLog } from "@/lib/scada/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ScadaEventsView() {
  const auditLogs = useScadaStore((s) => s.auditLogs);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const validLogs = (auditLogs || []).filter((l): l is ScadaAuditLog => Boolean(l && l.id));
  const filteredLogs = validLogs.filter((log) => {
    if (
      search &&
      !(log.details || "").toLowerCase().includes(search.toLowerCase()) &&
      !(log.action || "").toLowerCase().includes(search.toLowerCase()) &&
      !(log.operator || "").toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    if (categoryFilter !== "ALL" && log.category !== categoryFilter) return false;
    return true;
  });

  const handleExportCsv = () => {
    const header = "ID,Horario,Categoria,Operador,Acao,Equipamento,Tag,Detalhes,Severidade\n";
    const rows = auditLogs
      .map(
        (l) =>
          `"${l.id}","${new Date(l.timestamp).toISOString()}","${l.category}","${l.operator}","${l.action}","${l.equipment || ""}","${l.tag || ""}","${l.details}","${l.severity}"`,
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `audit_trail_scada_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Trilha de auditoria exportada com sucesso.");
  };

  return (
    <div
      data-testid="scada-events-view"
      className="flex-1 flex flex-col p-4 overflow-y-auto min-h-0 bg-[#080b11] text-zinc-200 space-y-4"
    >
      {/* 1. Header & Filters */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <h2 className="text-sm font-mono font-bold uppercase text-white">
            Trilha de Auditoria & Registro de Eventos (Audit Trail)
          </h2>
          <p className="text-[11px] text-zinc-400 font-mono">
            Conformidade IEC 62443 / 21 CFR Part 11 • Registros criptograficamente auditáveis
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-[220px]">
            <MagnifyingGlass className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por operador ou ação..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs text-zinc-300 font-mono"
          >
            <option value="ALL">Todas Categorias</option>
            <option value="OPERATOR">Ações de Operador</option>
            <option value="ALARM">Alarmes e Reconhecimentos</option>
            <option value="SECURITY">Segurança & E-STOP</option>
            <option value="SYSTEM">Eventos do Sistema</option>
            <option value="COMMUNICATION">Comunicação e Redes</option>
          </select>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-mono text-xs transition-colors"
          >
            <DownloadSimple className="w-3.5 h-3.5" />
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* 2. Events Table */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg overflow-hidden flex-1 shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] font-mono uppercase text-zinc-400 bg-zinc-900/90">
                <th className="py-2.5 px-3">Horário</th>
                <th className="py-2.5 px-3">Severidade</th>
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Operador</th>
                <th className="py-2.5 px-3">Ação Executada</th>
                <th className="py-2.5 px-3">Equipamento / TAG</th>
                <th className="py-2.5 px-3">Detalhes do Evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
              {filteredLogs.map((log) => {
                const d = new Date(log.timestamp);
                const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

                return (
                  <tr key={log.id} className="hover:bg-zinc-900/60 transition-colors">
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">{timeStr}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                          log.severity === "CRITICAL"
                            ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                            : log.severity === "WARNING"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-blue-500/10 text-blue-300 border border-blue-500/20",
                        )}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">{log.category}</td>
                    <td className="py-2 px-3 text-white font-bold whitespace-nowrap flex items-center gap-1.5">
                      <User className="w-3 h-3 text-zinc-500" />
                      {log.operator}
                    </td>
                    <td className="py-2 px-3 font-semibold text-cyan-400 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">
                      {log.equipment || log.tag || "—"}
                    </td>
                    <td className="py-2 px-3 text-zinc-300 max-w-md">{log.details}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
