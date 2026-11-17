// SCADA SUPERVISÓRIO — Barra inferior com banner fixo de alarmes (ISA-101 / ISA-18.2)
// Sempre visível: contador de não reconhecidos e o alarme mais importante.
// Um clique abre o faceplate do equipamento dono do alarme (ou a lista).

import { useMemo } from "react";
import { Bell, BellSimpleSlash, CheckCircle, ShieldWarning } from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { summarizeDrivers, type ScadaAlarmItem } from "@/lib/scada/types";
import {
  buildTagOwnerIndex,
  equipmentIdForAlarm,
  isActiveAlarm,
} from "@/lib/scada/asset-hierarchy";
import { cn } from "@/lib/utils";

const RANK: Record<ScadaAlarmItem["priority"], number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

/** Alarme do banner: não reconhecido primeiro, depois prioridade, depois o mais recente. */
export function pickBannerAlarm(alarms: readonly ScadaAlarmItem[]): ScadaAlarmItem | null {
  let best: ScadaAlarmItem | null = null;
  for (const a of alarms) {
    if (!isActiveAlarm(a)) continue;
    if (!best) {
      best = a;
      continue;
    }
    const ua = a.state === "UNACK" ? 0 : 1;
    const ub = best.state === "UNACK" ? 0 : 1;
    if (ua !== ub) {
      if (ua < ub) best = a;
      continue;
    }
    const r = RANK[a.priority] - RANK[best.priority];
    if (r < 0 || (r === 0 && a.timestamp > best.timestamp)) best = a;
  }
  return best;
}

export function ScadaOsStatusBar() {
  const isPhysicalControlAllowed = useScadaStore((s) => s.isPhysicalControlAllowed);
  const gatewayStatus = useScadaStore((s) => s.gatewayStatus);
  const isDemoProject = useScadaStore((s) => s.isDemoProject);
  const alarms = useScadaStore((s) => s.alarms);
  const equipments = useScadaStore((s) => s.equipments);
  const tags = useScadaStore((s) => s.tags);
  const selectEquipment = useScadaStore((s) => s.selectEquipment);
  const setActiveView = useScadaStore((s) => s.setActiveView);
  const drivers = summarizeDrivers(gatewayStatus, isDemoProject);

  const active = alarms.filter(isActiveAlarm);
  const unack = active.filter((a) => a.state === "UNACK").length;
  const top = pickBannerAlarm(alarms);
  const ownerIndex = useMemo(() => buildTagOwnerIndex(equipments, tags), [equipments, tags]);
  const owner = top ? equipmentIdForAlarm(top, equipments, ownerIndex) : null;

  const openTop = () => {
    if (owner) selectEquipment(owner);
    else setActiveView("alarms");
  };

  return (
    <footer
      className="h-8 shrink-0 bg-[#070A0E] border-t border-[#1E293B] px-2 sm:px-3 flex items-center gap-2 text-[11px] font-mono text-[#A7B0BB] select-none z-30"
      data-testid="scada-os-status-bar"
    >
      <button
        onClick={() => setActiveView("alarms")}
        className={cn(
          "flex items-center gap-1.5 px-2 py-0.5 rounded border shrink-0",
          unack > 0
            ? "border-red-500/60 bg-red-500/15 text-red-200 font-bold"
            : active.length > 0
              ? "border-zinc-600 text-zinc-200"
              : "border-zinc-800 text-zinc-500",
        )}
        aria-label={`${unack} alarmes não reconhecidos, ${active.length} ativos`}
        data-testid="scada-alarm-counter"
      >
        {active.length > 0 ? (
          <Bell className="w-3.5 h-3.5" />
        ) : (
          <BellSimpleSlash className="w-3.5 h-3.5" />
        )}
        <span>
          {unack}/{active.length}
        </span>
      </button>

      <button
        onClick={openTop}
        disabled={!top}
        className={cn(
          "flex-1 min-w-0 text-left truncate px-1 rounded",
          top ? "hover:bg-zinc-900 text-zinc-200" : "text-zinc-500",
          top?.state === "UNACK" && "text-red-200",
        )}
        data-testid="scada-alarm-banner"
        title={top ? "Abrir faceplate do equipamento" : undefined}
      >
        {top ? (
          <>
            <span className="font-bold">{top.priority}</span> · {top.tag} · {top.description}
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" /> Sem alarmes ativos
          </span>
        )}
      </button>

      <span className="hidden lg:inline text-zinc-500 shrink-0" data-testid="scada-driver-summary">
        Drivers: {drivers.label}
      </span>
      <span className="hidden md:flex items-center gap-1 text-amber-300 shrink-0 text-[10px] uppercase font-bold">
        <ShieldWarning className="w-3.5 h-3.5" />
        {isPhysicalControlAllowed ? "Físico habilitado" : "Controle físico bloqueado"}
      </span>
    </footer>
  );
}
