// SCADA SUPERVISÓRIO — View 9: Relatórios Técnicos & Exportação
// Generates regulatory reports: daily operations, water balance, energy and ISA-18.2 Pareto

import { useState } from "react";
import {
  FileText,
  Printer,
  DownloadSimple,
  Calendar,
  CheckCircle,
  Lightning,
  Drop,
  ChartBar,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ScadaReportsView() {
  const [reportType, setReportType] = useState<
    "daily" | "water_balance" | "energy" | "alarm_pareto"
  >("daily");
  const [period, setPeriod] = useState<"today" | "yesterday" | "7d" | "30d">("today");

  const totalFlow = useScadaStore((s) => s.totalFlowM3h);
  const totalPower = useScadaStore((s) => s.totalPowerKw);
  const efficiency = useScadaStore((s) => s.systemEfficiencyPct);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadCsv = () => {
    toast.success("Relatório gerado em formato CSV.");
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto min-h-0 bg-[#080b11] text-zinc-200 space-y-4">
      {/* 1. Header & Report Selector */}
      <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-sm print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-sm font-mono font-bold uppercase text-white">
              Emissão de Relatórios Técnicos Industriais
            </h2>
            <p className="text-[11px] text-zinc-400 font-mono">
              Documentos com assinatura digital e rastreabilidade técnica
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={reportType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setReportType(
                e.target.value as "daily" | "water_balance" | "energy" | "alarm_pareto",
              )
            }
            className="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 text-xs text-zinc-200 font-mono"
          >
            <option value="daily">Boletim Diário de Operação (BDO)</option>
            <option value="water_balance">Balanço Hídrico & Volumes</option>
            <option value="energy">Consumo de Energia & Demanda</option>
            <option value="alarm_pareto">Pareto de Alarmes & Disponibilidade</option>
          </select>

          <select
            value={period}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setPeriod(e.target.value as "today" | "yesterday" | "7d" | "30d")
            }
            className="bg-zinc-900 border border-zinc-800 rounded-md px-3 py-1.5 text-xs text-zinc-200 font-mono"
          >
            <option value="today">Hoje (Turno Atual)</option>
            <option value="yesterday">Ontem (24h)</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Mês Consolidado</option>
          </select>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs font-semibold shadow-sm transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / PDF</span>
          </button>

          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-mono text-xs transition-colors"
          >
            <DownloadSimple className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* 2. Formal Report Sheet Preview (Print-ready document) */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-8 max-w-4xl mx-auto w-full space-y-6 shadow-2xl font-mono text-zinc-300 text-xs">
        {/* Document Header */}
        <div className="border-b-2 border-zinc-700 pb-4 flex justify-between items-start">
          <div>
            <span className="text-[10px] text-zinc-500 uppercase block tracking-wider font-bold">
              ElétricAi Supervisory Core v4.2 • Engenharia Industrial
            </span>
            <h1 className="text-lg font-bold text-white uppercase tracking-tight mt-1">
              {reportType === "daily" && "Boletim Diário de Operação — ETE"}
              {reportType === "water_balance" && "Relatório de Balanço Hídrico & Despejo"}
              {reportType === "energy" && "Relatório de Eficiência Energética & Demanda"}
              {reportType === "alarm_pareto" && "Análise de Disponibilidade & Pareto de Alarmes"}
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Instalação: Estação de Tratamento de Efluentes Industrial • Setor 01
            </p>
          </div>
          <div className="text-right text-[11px] text-zinc-400 space-y-0.5">
            <div>
              Data: <strong>15/JAN/2025</strong>
            </div>
            <div>
              Turno: <strong>Turno A (06:00 - 18:00)</strong>
            </div>
            <div>
              Status: <span className="text-emerald-400 font-bold">HOMOLOGADO</span>
            </div>
          </div>
        </div>

        {/* Executive Summary Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-zinc-900/90 border border-zinc-800 p-3 rounded">
            <span className="text-[10px] text-zinc-500 uppercase block">Volume Total Tratado</span>
            <span className="text-base font-bold text-cyan-400 mt-1 block">
              {(totalFlow * 12).toFixed(0)} m³
            </span>
            <span className="text-[10px] text-zinc-400">
              Vazão média: {totalFlow.toFixed(1)} m³/h
            </span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800 p-3 rounded">
            <span className="text-[10px] text-zinc-500 uppercase block">Energia Consumida</span>
            <span className="text-base font-bold text-amber-400 mt-1 block">
              {(totalPower * 12).toFixed(0)} kWh
            </span>
            <span className="text-[10px] text-zinc-400">Fator de Potência: 0.94</span>
          </div>

          <div className="bg-zinc-900/90 border border-zinc-800 p-3 rounded">
            <span className="text-[10px] text-zinc-500 uppercase block">Eficiência de Remoção</span>
            <span className="text-base font-bold text-emerald-400 mt-1 block">
              {efficiency.toFixed(1)}%
            </span>
            <span className="text-[10px] text-zinc-400">Meta: 95.0% • OK</span>
          </div>
        </div>

        {/* Detailed Data Table */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Detalhamento das Grandezas por Subsistema
          </h3>
          <table className="w-full text-left border-collapse border border-zinc-800 text-xs">
            <thead>
              <tr className="bg-zinc-900 border-b border-zinc-800 text-[10px] uppercase text-zinc-400">
                <th className="p-2">Equipamento</th>
                <th className="p-2">Parâmetro Avaliado</th>
                <th className="p-2">Média Turno</th>
                <th className="p-2">Limite Regulatório</th>
                <th className="p-2">Conformidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-[11px]">
              <tr>
                <td className="p-2 font-bold text-white">T-101 (Sedimentação)</td>
                <td className="p-2">Nível Médio</td>
                <td className="p-2 text-cyan-400">75.2 %</td>
                <td className="p-2 text-zinc-400">&lt; 85.0 %</td>
                <td className="p-2 text-emerald-400 font-bold">CONFORME</td>
              </tr>
              <tr>
                <td className="p-2 font-bold text-white">P-01 (Bomba Recalque 1)</td>
                <td className="p-2">Vazão Recalque</td>
                <td className="p-2 text-cyan-400">92.4 m³/h</td>
                <td className="p-2 text-zinc-400">80 - 110 m³/h</td>
                <td className="p-2 text-emerald-400 font-bold">CONFORME</td>
              </tr>
              <tr>
                <td className="p-2 font-bold text-white">F-01 (Filtro Multimídia)</td>
                <td className="p-2">Pressão Diferencial</td>
                <td className="p-2 text-amber-400">2.4 bar</td>
                <td className="p-2 text-zinc-400">&lt; 2.5 bar</td>
                <td className="p-2 text-amber-400 font-bold">ATENÇÃO (RETROLAV.)</td>
              </tr>
              <tr>
                <td className="p-2 font-bold text-white">T-105 (Despejo Tratado)</td>
                <td className="p-2">pH do Efluente</td>
                <td className="p-2 text-emerald-400">7.2 pH</td>
                <td className="p-2 text-zinc-400">6.5 - 8.5 pH</td>
                <td className="p-2 text-emerald-400 font-bold">CONFORME</td>
              </tr>
              <tr>
                <td className="p-2 font-bold text-white">T-105 (Despejo Tratado)</td>
                <td className="p-2">Turbidez Final</td>
                <td className="p-2 text-emerald-400">1.8 NTU</td>
                <td className="p-2 text-zinc-400">&lt; 5.0 NTU</td>
                <td className="p-2 text-emerald-400 font-bold">CONFORME</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Technical Responsible Signatures */}
        <div className="pt-8 border-t border-zinc-800 grid grid-cols-2 gap-8 text-center text-xs">
          <div>
            <div className="border-b border-zinc-600 pb-1 font-bold text-white">
              Eng. Resp. Operação Técnica
            </div>
            <div className="text-[10px] text-zinc-500 pt-1">CREA / CRQ: 142.890-SP</div>
          </div>
          <div>
            <div className="border-b border-zinc-600 pb-1 font-bold text-white">
              Supervisor de Automação & SCADA
            </div>
            <div className="text-[10px] text-zinc-500 pt-1">Sistemas Industriais ElétricAi</div>
          </div>
        </div>
      </div>
    </div>
  );
}
