// SCADA SUPERVISÓRIO — View 1: Visão Geral (Overview)
// Faithful reproduction of the Industrial Reference Layout
// Architecture:
// 1. Top Industrial Sector Tabs & Canvas Fit Controls
// 2. Center: Large P&ID Synoptic (Left/Center) + Right Panel Stack (Alarmes ISA-18.2, KPIs Operacionais 2x2, Tendências 2h)
// 3. Bottom: Industrial Multi-tab Dock (Active Project Card + 7 Tabs: TAGs, Eventos, Alarmes, Logs, OPC UA, Modbus, MQTT + Driver Health)

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Bell,
  CheckCircle,
  Tag,
  ArrowsClockwise,
  Clock,
  ChartLine,
  PlugsConnected,
  Scroll,
  ShieldCheck,
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  ArrowsOut,
  FolderOpen,
  WifiHigh,
  CaretUp,
  CaretDown,
  Broadcast,
} from "@phosphor-icons/react";
import { EteSynopticPAndId } from "../synoptic/ete-synoptic-p-and-id";
import { useScadaStore } from "@/lib/scada/scada-store";
import type {
  ScadaSynopticSector,
  ScadaTagDefinition,
  ScadaAlarmItem,
  ScadaAuditLog,
} from "@/lib/scada/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DockTabId = "tags" | "events" | "alarms" | "logs" | "opcua" | "modbus" | "mqtt";

export function ScadaOverviewView() {
  const isDemoProject = useScadaStore((s) => s.isDemoProject);
  const currentProjectName = useScadaStore((s) => s.currentProjectName);
  const equipments = useScadaStore((s) => s.equipments);
  const selectedEquipmentId = useScadaStore((s) => s.selectedEquipmentId);
  const selectEquipment = useScadaStore((s) => s.selectEquipment);

  const alarms = useScadaStore((s) => s.alarms);
  const acknowledgeAlarm = useScadaStore((s) => s.acknowledgeAlarm);
  const acknowledgeAllAlarms = useScadaStore((s) => s.acknowledgeAllAlarms);
  const trendHistory = useScadaStore((s) => s.trendHistory);
  const tags = useScadaStore((s) => s.tags);
  const auditLogs = useScadaStore((s) => s.auditLogs);
  const gatewayStatus = useScadaStore((s) => s.gatewayStatus);
  const forceTagValue = useScadaStore((s) => s.forceTagValue);
  const unforceTag = useScadaStore((s) => s.unforceTag);

  const selectedSector = useScadaStore((s) => s.selectedSector);
  const setSelectedSector = useScadaStore((s) => s.setSelectedSector);

  const [trendRange, setTrendRange] = useState<"15m" | "1h" | "2h" | "6h">("2h");
  const [activeDockTab, setActiveDockTab] = useState<
    "tags" | "events" | "alarms" | "logs" | "opcua" | "modbus" | "mqtt"
  >("tags");
  const [isDockCollapsed, setIsDockCollapsed] = useState(false);

  // Sector tabs definitions
  const sectors: { id: ScadaSynopticSector; label: string }[] = isDemoProject
    ? [
        { id: "ete_geral", label: "ETE Geral" },
        { id: "pumping", label: "Bombagem & Recalque" },
        { id: "filtration", label: "Filtros & Decantadores" },
        { id: "tanks", label: "Reservatórios & Dosagem" },
        { id: "electrical", label: "Distribuição Elétrica" },
      ]
    : [
        { id: "ete_geral", label: "Planta Geral" },
        { id: "electrical", label: "Distribuição Elétrica" },
        { id: "pumping", label: "Motores & Acionamentos" },
      ];

  // Format trend points for chart
  const chartData = (trendHistory.length > 0 ? trendHistory : generateInitialTrend(isDemoProject))
    .filter(Boolean)
    .map((pt) => {
      const d = new Date(pt.timestamp || Date.now());
      const timeLabel = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
      return {
        time: timeLabel,
        vazao: pt.totalFlow ?? 0,
        nivelT101: typeof pt.levelT101 === "number" ? +pt.levelT101.toFixed(1) : 0,
        pressao: pt.pressureFiltro ?? 0,
      };
    });

  const handleAck = (id: string, tag: string) => {
    acknowledgeAlarm(id);
    toast.success(`Alarme [${tag}] reconhecido pelo operador.`);
  };

  const handleAckAll = () => {
    acknowledgeAllAlarms();
    toast.success("Todos os alarmes foram reconhecidos.");
  };

  const handleForceToggle = (
    tagId: string,
    currentForced: boolean,
    currentValue: number | boolean | string,
  ) => {
    if (currentForced) {
      unforceTag(tagId);
      toast.info(`Forçamento do TAG ${tagId} removido.`);
    } else {
      const nextVal =
        typeof currentValue === "number" ? +(currentValue * 1.05).toFixed(1) : currentValue;
      forceTagValue(tagId, nextVal);
      toast.warning(`TAG ${tagId} forçado para ${nextVal}.`);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-full w-full min-h-0 bg-[#080B11] text-[#F1F5F9] overflow-hidden select-none"
      data-testid="scada-overview-view"
    >
      {/* 1. TOP INDUSTRIAL SECTOR TABS & VIEWPORT CONTROLS */}
      <div className="h-10 shrink-0 bg-[#0B0F14] border-b border-[#1E293B] px-3 flex items-center justify-between">
        {/* Sector Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {sectors.map((sec) => {
            const isActive = selectedSector === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => setSelectedSector(sec.id)}
                className={cn(
                  "px-3 py-1.5 rounded-t-md text-xs font-mono font-medium transition-all whitespace-nowrap border-b-2",
                  isActive
                    ? "bg-[#151C24] text-[#38BDF8] border-[#38BDF8] font-bold shadow-sm"
                    : "text-[#A7B0BB] hover:text-white border-transparent hover:bg-zinc-800/40",
                )}
              >
                {sec.label}
              </button>
            );
          })}
        </div>

        {/* Viewport Zoom & Fit Controls */}
        <div className="hidden xl:flex items-center gap-1 text-xs font-mono text-[#A7B0BB] shrink-0">
          <button
            onClick={() => toast.info("Zoom In (+10%)")}
            className="p-1.5 rounded hover:bg-[#151C24] hover:text-white transition-colors"
            title="Aumentar Zoom"
          >
            <MagnifyingGlassPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => toast.info("Zoom Out (-10%)")}
            className="p-1.5 rounded hover:bg-[#151C24] hover:text-white transition-colors"
            title="Diminuir Zoom"
          >
            <MagnifyingGlassMinus className="w-3.5 h-3.5" />
          </button>
          <span className="px-1.5 text-[10px] text-zinc-500">100%</span>
          <button
            onClick={() => toast.info("Enquadramento 100% ajustado")}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#151C24] hover:bg-[#1E293B] text-[10px] text-zinc-300 transition-colors"
            title="Enquadrar Sinótico Completo"
          >
            <ArrowsOut className="w-3 h-3 text-[#38BDF8]" />
            <span>Ajustar à Tela</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN CENTER ROW: LARGE SYNOPTIC (LEFT) + RIGHT PANEL (3-CARD STACK) */}
      <div className="flex-1 flex min-h-0 overflow-hidden p-2 gap-2">
        {/* Left/Center: Large Industrial P&ID Synoptic */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          {isDemoProject ? (
            <EteSynopticPAndId />
          ) : Object.keys(equipments).length === 0 ? (
            <div className="relative w-full h-full min-h-[380px] bg-[#070A0E] border border-[#1E293B] rounded-lg overflow-hidden flex flex-col items-center justify-center p-8 text-center shadow-2xl">
              <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4">
                <Broadcast className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-white">
                Sinótico do Projeto Industrial — {currentProjectName || "Projeto Ativo"}
              </h3>
              <p className="text-xs text-zinc-400 font-mono max-w-md mt-2 leading-relaxed">
                Nenhum equipamento foi cadastrado ainda neste projeto. Insira motores,
                transformadores, painéis ou sensores nos diagramas Unifilar / Multifilar para
                projetar o sinótico SCADA em tempo real.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400">
                  ISOLAMENTO MULTI-TENANT ATIVO (IEC 62443)
                </span>
              </div>
            </div>
          ) : (
            <CustomerProjectSynoptic
              equipments={equipments}
              selectedEquipmentId={selectedEquipmentId}
              onSelect={selectEquipment}
            />
          )}
        </div>

        {/* Right: Vertical 3-Card Stack (Alarmes ISA-18.2, KPIs Operacionais 2x2, Tendências 2h) */}
        <aside
          className="w-[380px] xl:w-[410px] shrink-0 flex flex-col gap-2 min-h-0 overflow-hidden"
          data-testid="scada-right-panel"
        >
          {/* Card 1: Alarmes Ativos (ISA-18.2) */}
          <div className="flex-1 flex flex-col min-h-[140px] max-h-[35%] bg-[#151C24] border border-[#1E293B] rounded-lg overflow-hidden shadow-md">
            <div className="px-3 py-1.5 bg-[#0F141C] border-b border-[#1E293B] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-[#F59E0B]" />
                <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-white">
                  Alarmes Ativos (ISA-18.2)
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[#A7B0BB]">
                  {alarms.filter((a) => a && a.state === "UNACK").length} pendentes
                </span>
                <button
                  onClick={handleAckAll}
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[9.5px] font-mono font-semibold text-zinc-200 transition-colors"
                >
                  ACK Todos
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#1E293B]/60 font-mono text-[11px]">
              {alarms.filter((alm) => Boolean(alm && alm.id)).length === 0 ? (
                <div className="p-4 text-center text-zinc-500 text-xs italic">
                  Nenhum alarme ativo. Processo em conformidade operacional.
                </div>
              ) : (
                alarms
                  .filter((alm): alm is ScadaAlarmItem => Boolean(alm && alm.id))
                  .map((alm) => {
                    const d = new Date(alm.timestamp);
                    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

                    return (
                      <div
                        key={alm.id}
                        className={cn(
                          "p-2 flex items-center justify-between gap-2 hover:bg-[#1E293B]/40 transition-colors",
                          alm.priority === "CRITICAL"
                            ? "bg-red-950/20"
                            : alm.priority === "HIGH"
                              ? "bg-amber-950/20"
                              : "",
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "px-1 py-0.2 rounded text-[8.5px] font-bold uppercase shrink-0",
                              alm.priority === "CRITICAL"
                                ? "bg-red-500 text-white animate-pulse"
                                : alm.priority === "HIGH"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                  : "bg-blue-500/20 text-blue-300 border border-blue-500/30",
                            )}
                          >
                            {alm.priority}
                          </span>
                          <div className="min-w-0 truncate">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-white text-[10.5px]">{alm.tag}</span>
                              <span className="text-[9.5px] text-zinc-500">{timeStr}</span>
                            </div>
                            <p
                              className="text-[10px] text-zinc-300 truncate"
                              title={alm.description}
                            >
                              {alm.description}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {alm.state === "UNACK" ? (
                            <button
                              onClick={() => handleAck(alm.id, alm.tag)}
                              className="px-2 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/40 text-[9.5px] font-semibold transition-colors"
                            >
                              ACK
                            </button>
                          ) : (
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                              <CheckCircle className="w-3 h-3" /> OK
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Card 2: KPIs Operacionais (2x2 Grid) */}
          <div className="shrink-0 bg-[#151C24] border border-[#1E293B] rounded-lg p-2.5 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-[#1E293B] mb-2">
              <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-white">
                KPIs Operacionais & Confiabilidade
              </h2>
              <span className="text-[9.5px] font-mono text-emerald-400">Tempo Real</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* KPI 1: Disponibilidade */}
              <div className="bg-[#0F141C] border border-[#1E293B] p-2 rounded">
                <div className="text-[9.5px] font-mono text-[#A7B0BB] uppercase">
                  Disponibilidade
                </div>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-base font-bold font-mono text-emerald-400">99.2%</span>
                  <span className="text-[9px] font-mono text-zinc-500">Meta &gt;98%</span>
                </div>
              </div>

              {/* KPI 2: OEE */}
              <div className="bg-[#0F141C] border border-[#1E293B] p-2 rounded">
                <div className="text-[9.5px] font-mono text-[#A7B0BB] uppercase">
                  OEE Operacional
                </div>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-base font-bold font-mono text-[#38BDF8]">91.4%</span>
                  <span className="text-[9px] font-mono text-zinc-500">Meta &gt;85%</span>
                </div>
              </div>

              {/* KPI 3: MTBF */}
              <div className="bg-[#0F141C] border border-[#1E293B] p-2 rounded">
                <div className="text-[9.5px] font-mono text-[#A7B0BB] uppercase">
                  MTBF (Confiabilidade)
                </div>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-base font-bold font-mono text-[#F59E0B]">420h</span>
                  <span className="text-[9px] font-mono text-zinc-500">Entre Falhas</span>
                </div>
              </div>

              {/* KPI 4: MTTR */}
              <div className="bg-[#0F141C] border border-[#1E293B] p-2 rounded">
                <div className="text-[9.5px] font-mono text-[#A7B0BB] uppercase">
                  MTTR (Manutenibilidade)
                </div>
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-base font-bold font-mono text-zinc-200">18min</span>
                  <span className="text-[9px] font-mono text-zinc-500">Para Reparo</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Tendências Principais (Multi-pen Line Chart) */}
          <div className="flex-1 flex flex-col min-h-[160px] bg-[#151C24] border border-[#1E293B] rounded-lg overflow-hidden shadow-md">
            <div className="px-3 py-1.5 bg-[#0F141C] border-b border-[#1E293B] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChartLine className="w-3.5 h-3.5 text-[#38BDF8]" />
                <h2 className="text-[11px] font-mono font-bold uppercase tracking-wider text-white">
                  Tendências Principais (2h)
                </h2>
              </div>
              <div className="flex items-center gap-1 bg-[#070A0E] p-0.5 rounded border border-[#1E293B] text-[9.5px] font-mono">
                {(["15m", "1h", "2h", "6h"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTrendRange(r)}
                    className={cn(
                      "px-1.5 py-0.5 rounded font-semibold transition-colors",
                      trendRange === r
                        ? "bg-blue-600 text-white"
                        : "text-[#A7B0BB] hover:text-white",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 p-1 min-h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#64748B"
                    fontSize={9}
                    tickLine={false}
                    fontFamily="monospace"
                  />
                  <YAxis
                    stroke="#64748B"
                    fontSize={9}
                    tickLine={false}
                    fontFamily="monospace"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      borderColor: "#334155",
                      fontSize: "10px",
                      fontFamily: "monospace",
                      borderRadius: "4px",
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "9px", fontFamily: "monospace", paddingTop: "2px" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="vazao"
                    name="Vazão (m³/h)"
                    stroke="#06B6D4"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="nivelT101"
                    name="Nível T-101 (%)"
                    stroke="#F59E0B"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="pressao"
                    name="Pressão F-01"
                    stroke="#10B981"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </aside>
      </div>

      {/* 3. BOTTOM INDUSTRIAL DOCK (ACTIVE PROJECT CARD + 7 TABS + DRIVER HEALTH) */}
      <div
        className={cn(
          "shrink-0 bg-[#0B0F14] border-t border-[#1E293B] flex flex-col transition-all",
          isDockCollapsed ? "h-8" : "h-44",
        )}
        data-testid="scada-bottom-dock"
      >
        {/* Dock Header with Tabs, Project Card, and Toggle */}
        <div className="h-8 shrink-0 bg-[#0F141C] border-b border-[#1E293B] px-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Active Project Mini-Card */}
            <div className="flex items-center gap-1.5 text-xs font-mono border-r border-[#1E293B] pr-3">
              <FolderOpen className="w-3.5 h-3.5 text-[#FF8A00]" />
              <span className="font-bold text-white text-[11px]">Subestação & ETE Industrial</span>
              <span className="text-[10px] text-zinc-500 font-normal hidden xl:inline">
                • PRJ-ETE-2026-IND-01
              </span>
            </div>

            {/* 7 Industrial Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {(
                [
                  { id: "tags", label: "Variáveis & TAGs", icon: Tag },
                  { id: "events", label: "Eventos", icon: Scroll },
                  { id: "alarms", label: "Alarmes", icon: Bell },
                  { id: "logs", label: "Logs do Sistema", icon: ShieldCheck },
                  { id: "opcua", label: "Driver OPC UA", icon: PlugsConnected },
                  { id: "modbus", label: "Driver Modbus TCP", icon: PlugsConnected },
                  { id: "mqtt", label: "Driver MQTT", icon: WifiHigh },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const isActive = activeDockTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveDockTab(tab.id);
                      if (isDockCollapsed) setIsDockCollapsed(false);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded text-[10.5px] font-mono transition-colors whitespace-nowrap",
                      isActive
                        ? "bg-[#151C24] text-[#38BDF8] font-bold border border-[#1E293B]"
                        : "text-[#A7B0BB] hover:text-white hover:bg-zinc-800/40",
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Status & Collapse/Expand Button */}
          <div className="flex items-center gap-2 xl:gap-3 text-xs font-mono shrink-0">
            <div className="hidden xl:flex items-center gap-1.5 text-emerald-400 text-[10px] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Drivers 100% OK • Latência 1.8ms</span>
            </div>
            <div className="hidden sm:flex xl:hidden items-center gap-1 text-emerald-400 text-[10px] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>100% OK</span>
            </div>

            <button
              onClick={() => setIsDockCollapsed(!isDockCollapsed)}
              className="p-1 rounded hover:bg-[#151C24] text-[#A7B0BB] hover:text-white transition-colors"
              title={isDockCollapsed ? "Expandir Painel Inferior" : "Recolher Painel Inferior"}
            >
              {isDockCollapsed ? (
                <CaretUp className="w-3.5 h-3.5" />
              ) : (
                <CaretDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Dock Content Body */}
        {!isDockCollapsed && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 bg-[#080B11] font-mono text-xs">
            {/* Tab 1: Variáveis & TAGs */}
            {activeDockTab === "tags" && (
              <div className="overflow-x-auto h-full">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[9.5px] uppercase text-[#A7B0BB] bg-[#0F141C]">
                      <th className="py-1 px-2.5">Nome do TAG</th>
                      <th className="py-1 px-2">Descrição</th>
                      <th className="py-1 px-2">Tipo</th>
                      <th className="py-1 px-2">Valor Atual</th>
                      <th className="py-1 px-2">Unidade</th>
                      <th className="py-1 px-2">Qualidade</th>
                      <th className="py-1 px-2">Driver</th>
                      <th className="py-1 px-2">Endereço CLP</th>
                      <th className="py-1 px-2.5 text-right">Ação Operador</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]/60">
                    {Object.values(tags).filter((t): t is ScadaTagDefinition =>
                      Boolean(t && t.name),
                    ).length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="py-6 text-center text-zinc-500 font-mono text-xs"
                        >
                          Nenhuma variável ou TAG associada a este projeto.
                        </td>
                      </tr>
                    ) : (
                      Object.values(tags)
                        .filter((t): t is ScadaTagDefinition => Boolean(t && t.name))
                        .map((t) => (
                          <tr key={t.id} className="hover:bg-[#151C24]/50 transition-colors">
                            <td className="py-1 px-2.5 font-bold text-white whitespace-nowrap">
                              {t.name}
                            </td>
                            <td
                              className="py-1 px-2 text-zinc-300 truncate max-w-[220px]"
                              title={t.description}
                            >
                              {t.description}
                            </td>
                            <td className="py-1 px-2 text-zinc-400">{t.dataType}</td>
                            <td className="py-1 px-2 font-bold text-[#38BDF8] whitespace-nowrap">
                              {typeof t.value === "number" ? t.value.toFixed(1) : String(t.value)}
                            </td>
                            <td className="py-1 px-2 text-zinc-400">{t.unit || "-"}</td>
                            <td className="py-1 px-2 whitespace-nowrap">
                              <span
                                className={cn(
                                  "px-1.5 py-0.2 rounded text-[9px] font-bold uppercase",
                                  t.forced
                                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                                    : t.quality === "GOOD"
                                      ? "bg-emerald-500/15 text-emerald-400"
                                      : "bg-red-500/15 text-red-400",
                                )}
                              >
                                {t.forced ? "FORÇADO" : t.quality}
                              </span>
                            </td>
                            <td className="py-1 px-2 text-zinc-400">{t.driver}</td>
                            <td className="py-1 px-2 text-zinc-500">{t.sourceAddress}</td>
                            <td className="py-1 px-2.5 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleForceToggle(t.id, t.forced, t.value)}
                                className={cn(
                                  "px-2 py-0.5 rounded text-[9.5px] font-semibold transition-colors",
                                  t.forced
                                    ? "bg-amber-600/30 hover:bg-amber-600 text-amber-300 border border-amber-500/40"
                                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300",
                                )}
                              >
                                {t.forced ? "Desforçar" : "Forçar"}
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 2: Eventos */}
            {activeDockTab === "events" && (
              <div className="overflow-x-auto h-full">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[9.5px] uppercase text-[#A7B0BB] bg-[#0F141C]">
                      <th className="py-1 px-2.5">Horário</th>
                      <th className="py-1 px-2">Categoria</th>
                      <th className="py-1 px-2">Operador</th>
                      <th className="py-1 px-2">Ação</th>
                      <th className="py-1 px-2">Equipamento</th>
                      <th className="py-1 px-2.5">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]/60">
                    {auditLogs.filter((log) => Boolean(log && log.id)).length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-6 text-center text-zinc-500 font-mono text-xs"
                        >
                          Nenhum evento registrado no histórico.
                        </td>
                      </tr>
                    ) : (
                      auditLogs
                        .filter((log): log is ScadaAuditLog => Boolean(log && log.id))
                        .map((log) => {
                          const d = new Date(log.timestamp);
                          const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
                          return (
                            <tr key={log.id} className="hover:bg-[#151C24]/50">
                              <td className="py-1 px-2.5 text-zinc-400 whitespace-nowrap">
                                {timeStr}
                              </td>
                              <td className="py-1 px-2">
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-500/15 text-blue-300">
                                  {log.category}
                                </span>
                              </td>
                              <td className="py-1 px-2 text-white font-semibold">{log.operator}</td>
                              <td className="py-1 px-2 text-zinc-300 font-bold">{log.action}</td>
                              <td className="py-1 px-2 text-[#38BDF8]">{log.equipment || "-"}</td>
                              <td className="py-1 px-2.5 text-zinc-400">{log.details}</td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 3: Alarmes (Histórico / Todos) */}
            {activeDockTab === "alarms" && (
              <div className="overflow-x-auto h-full">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-[9.5px] uppercase text-[#A7B0BB] bg-[#0F141C]">
                      <th className="py-1 px-2.5">Prioridade</th>
                      <th className="py-1 px-2">TAG</th>
                      <th className="py-1 px-2">Descrição</th>
                      <th className="py-1 px-2">Valor</th>
                      <th className="py-1 px-2">Limite</th>
                      <th className="py-1 px-2">Estado</th>
                      <th className="py-1 px-2.5">Horário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]/60">
                    {alarms.filter((alm) => Boolean(alm && alm.id)).length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-6 text-center text-zinc-500 font-mono text-xs"
                        >
                          Nenhum alarme registrado.
                        </td>
                      </tr>
                    ) : (
                      alarms
                        .filter((alm): alm is ScadaAlarmItem => Boolean(alm && alm.id))
                        .map((alm) => (
                          <tr key={alm.id} className="hover:bg-[#151C24]/50">
                            <td className="py-1 px-2.5">
                              <span
                                className={cn(
                                  "px-1.5 py-0.2 rounded text-[9px] font-bold",
                                  alm.priority === "CRITICAL"
                                    ? "bg-red-500 text-white"
                                    : alm.priority === "HIGH"
                                      ? "bg-amber-500/20 text-amber-300"
                                      : "bg-blue-500/20 text-blue-300",
                                )}
                              >
                                {alm.priority}
                              </span>
                            </td>
                            <td className="py-1 px-2 font-bold text-white whitespace-nowrap">
                              {alm.tag}
                            </td>
                            <td
                              className="py-1 px-2 text-zinc-300 max-w-[200px] truncate"
                              title={alm.description}
                            >
                              {alm.description}
                            </td>
                            <td className="py-1 px-2 text-[#38BDF8]">{alm.currentValue}</td>
                            <td className="py-1 px-2 text-zinc-400">{alm.setpointLimit}</td>
                            <td className="py-1 px-2">
                              <span
                                className={cn(
                                  "px-1.5 py-0.2 rounded text-[9px] font-bold uppercase",
                                  alm.state === "UNACK"
                                    ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
                                )}
                              >
                                {alm.state}
                              </span>
                            </td>
                            <td className="py-1 px-2.5 text-zinc-400 whitespace-nowrap">
                              {new Date(alm.timestamp).toLocaleTimeString("pt-BR")}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tab 4: Logs do Sistema */}
            {activeDockTab === "logs" && (
              <div className="space-y-1 overflow-y-auto h-full">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-2 py-0.5 px-2 rounded hover:bg-[#151C24]/60 text-[10.5px]"
                  >
                    <span className="text-zinc-500">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="px-1 rounded bg-zinc-800 text-zinc-400 text-[9px] uppercase font-bold">
                      {log.severity}
                    </span>
                    <span className="text-[#38BDF8] font-bold">{log.operator}</span>
                    <span className="text-zinc-300">{log.action}:</span>
                    <span className="text-zinc-400">{log.details}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tab 5: Driver OPC UA */}
            {activeDockTab === "opcua" && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-2">
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Endpoint OPC UA</div>
                  <div className="text-xs font-bold text-white mt-1">
                    {gatewayStatus.opcua.endpoint}
                  </div>
                </div>
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Sessões / Assinaturas</div>
                  <div className="text-xs font-bold text-emerald-400 mt-1">
                    {gatewayStatus.opcua.sessions} Sessão • {gatewayStatus.opcua.subscriptions}{" "}
                    Monitored Items
                  </div>
                </div>
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Amostragem</div>
                  <div className="text-xs font-bold text-[#38BDF8] mt-1">
                    {gatewayStatus.opcua.samplingIntervalMs} ms determinístico
                  </div>
                </div>
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Taxa de Transferência</div>
                  <div className="text-xs font-bold text-zinc-300 mt-1">
                    RX: {(gatewayStatus.opcua.rxBytes / 1024).toFixed(1)} KB • TX:{" "}
                    {(gatewayStatus.opcua.txBytes / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
            )}

            {/* Tab 6: Driver Modbus TCP */}
            {activeDockTab === "modbus" && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-2">
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Host / Porta / Unit ID</div>
                  <div className="text-xs font-bold text-white mt-1">
                    {gatewayStatus.modbus.host}:{gatewayStatus.modbus.port} (Unit{" "}
                    {gatewayStatus.modbus.unitId})
                  </div>
                </div>
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Holding Registers</div>
                  <div className="text-xs font-bold text-emerald-400 mt-1">
                    40001 - 40050 ({gatewayStatus.modbus.holdingRegisters} mapeados)
                  </div>
                </div>
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">
                    Polling Rate / Requisições
                  </div>
                  <div className="text-xs font-bold text-[#38BDF8] mt-1">
                    {gatewayStatus.modbus.pollIntervalMs} ms • {gatewayStatus.modbus.requestsCount}{" "}
                    req
                  </div>
                </div>
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Erros de CRC / Frame</div>
                  <div className="text-xs font-bold text-emerald-400 mt-1">
                    {gatewayStatus.modbus.crcErrors} (0.00% taxa de erro)
                  </div>
                </div>
              </div>
            )}

            {/* Tab 7: Driver MQTT */}
            {activeDockTab === "mqtt" && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-2">
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Broker MQTT</div>
                  <div className="text-xs font-bold text-white mt-1">
                    {gatewayStatus.mqtt.broker}
                  </div>
                </div>
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Client ID / QoS</div>
                  <div className="text-xs font-bold text-emerald-400 mt-1">
                    {gatewayStatus.mqtt.clientId} • QoS 1
                  </div>
                </div>
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Tópicos Inscritos</div>
                  <div className="text-xs font-bold text-[#38BDF8] mt-1">
                    {gatewayStatus.mqtt.subscribedTopics.length} tópicos (telemetry/#)
                  </div>
                </div>
                <div className="bg-[#0F141C] p-2.5 rounded border border-[#1E293B]">
                  <div className="text-[10px] text-zinc-500 uppercase">Mensagens Processadas</div>
                  <div className="text-xs font-bold text-zinc-300 mt-1">
                    RX: {gatewayStatus.mqtt.messagesRx} • TX: {gatewayStatus.mqtt.messagesTx}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerProjectSynoptic({
  equipments,
  selectedEquipmentId,
  onSelect,
}: {
  equipments: Record<string, any>;
  selectedEquipmentId: string | null;
  onSelect: (id: string) => void;
}) {
  const eqList = Object.values(equipments).filter((e): e is any => Boolean(e && e.id));

  return (
    <div
      className="relative w-full h-full min-h-[380px] bg-[#070A0E] border border-[#1E293B] rounded-lg overflow-hidden select-none flex flex-col p-4 shadow-2xl"
      data-testid="scada-p-and-id-synoptic"
    >
      <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono uppercase tracking-wider text-white font-bold">
            Sinótico Canônico do Projeto ({eqList.length} Ativos Conectados)
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-400">
          Clique no equipamento para abrir telemetria e comandos
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {eqList.map((eq) => {
          const isSelected = selectedEquipmentId === eq.id;
          const isRunning = eq.status === "RUNNING";
          const isTripped = eq.status === "TRIPPED";

          return (
            <div
              key={eq.id}
              onClick={() => onSelect(eq.id)}
              className={cn(
                "p-3 rounded-lg border text-xs font-mono transition-all cursor-pointer flex flex-col justify-between",
                isSelected
                  ? "bg-[#1E293B] border-blue-400 shadow-md ring-1 ring-blue-400"
                  : "bg-[#151C24] border-[#1E293B] hover:border-zinc-600 hover:bg-[#1A232E]",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-white uppercase truncate">{eq.tag || eq.id}</span>
                <span
                  className={cn(
                    "px-1.5 py-0.2 rounded text-[9px] font-bold uppercase",
                    isRunning
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : isTripped
                        ? "bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse"
                        : "bg-zinc-800 text-zinc-400 border border-zinc-700",
                  )}
                >
                  {eq.status || "STANDBY"}
                </span>
              </div>
              <p className="text-[11px] text-zinc-300 truncate mb-2">{eq.name || eq.id}</p>
              <div className="pt-2 border-t border-[#1E293B]/80 flex items-center justify-between text-[10px] text-zinc-400">
                <span>{eq.voltageV || 380}V</span>
                <span className="text-amber-400 font-bold">{(eq.powerKw || 0).toFixed(1)} kW</span>
                <span className="text-cyan-400">{(eq.currentA || 0).toFixed(1)} A</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function generateInitialTrend(isDemo = true) {
  if (!isDemo) return [];
  const pts = [];
  const now = Date.now();
  for (let i = 20; i >= 0; i--) {
    const ts = now - i * 3000;
    pts.push({
      timestamp: ts,
      totalFlow: 182.7 + Math.sin(i) * 1.5,
      levelT101: 75.2 + Math.cos(i) * 0.4,
      pressureFiltro: 2.4 + Math.sin(i) * 0.05,
    });
  }
  return pts;
}
