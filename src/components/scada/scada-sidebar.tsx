// SCADA SUPERVISÓRIO — Left Navigation Rail
// Contains all 11 mandatory industrial supervisory views

import {
  Gauge,
  TreeStructure,
  Bell,
  ChartLineUp,
  Cpu,
  Tag,
  PlugsConnected,
  Scroll,
  FileText,
  Palette,
  Gear,
  CheckCircle,
  WifiHigh,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import type { ScadaViewId } from "@/lib/scada/types";
import { cn } from "@/lib/utils";

interface NavItemDef {
  id: ScadaViewId;
  label: string;
  icon: typeof Gauge;
  badge?: number | string;
  badgeVariant?: "destructive" | "warning" | "default";
}

export function ScadaSidebar() {
  const activeView = useScadaStore((s) => s.activeView);
  const setActiveView = useScadaStore((s) => s.setActiveView);
  const warningAlarmsCount = useScadaStore((s) => s.warningAlarmsCount);
  const criticalAlarmsCount = useScadaStore((s) => s.criticalAlarmsCount);
  const totalAlarms = warningAlarmsCount + criticalAlarmsCount;
  const gatewayStatus = useScadaStore((s) => s.gatewayStatus);

  const navItems: NavItemDef[] = [
    { id: "overview", label: "Visão Geral", icon: Gauge },
    { id: "synoptics", label: "Sinóticos Industriais", icon: TreeStructure },
    {
      id: "alarms",
      label: "Alarmes",
      icon: Bell,
      badge: totalAlarms > 0 ? totalAlarms : undefined,
      badgeVariant: criticalAlarmsCount > 0 ? "destructive" : "warning",
    },
    { id: "trends", label: "Tendências", icon: ChartLineUp },
    { id: "equipments", label: "Equipamentos", icon: Cpu },
    { id: "tags", label: "TAGs Industriais", icon: Tag },
    { id: "communication", label: "Comunicação", icon: PlugsConnected },
    { id: "events", label: "Eventos e Logs", icon: Scroll },
    { id: "reports", label: "Relatórios", icon: FileText },
    { id: "hmi", label: "Editor HMI", icon: Palette },
    { id: "settings", label: "Configurações", icon: Gear },
  ];

  return (
    <aside
      className="w-60 shrink-0 border-r border-border bg-[#0a0d14] flex flex-col justify-between select-none text-zinc-300"
      data-testid="scada-sidebar"
    >
      {/* Navigation List */}
      <div className="flex flex-col py-3 px-2 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 pt-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-800/80 mb-1">
          Navegação Supervisório
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              data-testid={`scada-nav-${item.id}`}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all group",
                isActive
                  ? "bg-blue-600/15 text-white border-l-2 border-blue-500 font-semibold shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50",
              )}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    isActive ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-300",
                  )}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold",
                    item.badgeVariant === "destructive"
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/30",
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Industrial Gateway Health Summary */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/60 text-[11px] font-mono space-y-2">
        <div className="flex items-center justify-between text-zinc-400 text-[10px] uppercase font-bold tracking-wider">
          <span>Drivers Industriais</span>
          <span className="text-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            100% OK
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 pt-1">
          <div className="flex items-center gap-1 text-[10px] text-zinc-300 bg-zinc-900/90 border border-zinc-800 px-1.5 py-1 rounded">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                gatewayStatus.opcua.status === "CONNECTED" ? "bg-emerald-400" : "bg-red-500",
              )}
            />
            <span className="truncate">OPC UA</span>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-zinc-300 bg-zinc-900/90 border border-zinc-800 px-1.5 py-1 rounded">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                gatewayStatus.modbus.status === "CONNECTED" ? "bg-emerald-400" : "bg-red-500",
              )}
            />
            <span className="truncate">Modbus</span>
          </div>

          <div className="flex items-center gap-1 text-[10px] text-zinc-300 bg-zinc-900/90 border border-zinc-800 px-1.5 py-1 rounded">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0",
                gatewayStatus.mqtt.status === "CONNECTED" ? "bg-emerald-400" : "bg-red-500",
              )}
            />
            <span className="truncate">MQTT</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-0.5">
          <span>Scan Cycle: 100 ms</span>
          <span className="text-zinc-400 font-mono">v4.2 PRO</span>
        </div>
      </div>
    </aside>
  );
}
