// SCADA SUPERVISÓRIO — Visão Geral (ISA-101 nível 1)
// Só o que exige atenção: estado por área (`=planta+local`) e a lista de
// desvios. Nenhum KPI sem fonte calculável. Tudo leva ao faceplate em 1 clique.
// O sinótico P&ID da ETE existe apenas no projeto de demonstração (Sinóticos).

import { useMemo, useState } from "react";
import { TreeStructure, WarningCircle, CheckCircle, ArrowRight } from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import {
  buildAssetHierarchy,
  UNASSIGNED_AREA_KEY,
  type AreaSummary,
  type Deviation,
} from "@/lib/scada/asset-hierarchy";
import { AssetTree, HEALTH_LABEL, healthDotClass } from "@/components/scada/asset-tree";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useVisibleAlarms } from "@/lib/scada/alarm-management-store";

const KIND_LABEL: Record<Deviation["kind"], string> = {
  ALARM_UNACK: "scada2.kind.alarmUnack",
  ALARM_ACK: "scada2.kind.alarmAck",
  TRIPPED: "scada2.kind.tripped",
  MAINTENANCE: "scada2.kind.maintenance",
  BAD_QUALITY: "scada2.kind.badQuality",
  STALE: "scada2.kind.stale",
  FORCED: "scada2.kind.forced",
};

function areaBorder(a: AreaSummary, selected: boolean): string {
  if (selected) return "border-zinc-300";
  if (a.health === "ALARM") return "border-red-500/70";
  if (a.health === "DEVIATION") return "border-amber-400/60";
  if (a.health === "NO_DATA") return "border-dashed border-zinc-700";
  return "border-zinc-800";
}

export function ScadaOverviewView() {
  const { t } = useI18n();
  const isDemoProject = useScadaStore((s) => s.isDemoProject);
  const projectName = useScadaStore((s) => s.currentProjectName);
  const equipments = useScadaStore((s) => s.equipments);
  const tags = useScadaStore((s) => s.tags);
  const alarms = useVisibleAlarms();
  const selectedEquipmentId = useScadaStore((s) => s.selectedEquipmentId);
  const selectEquipment = useScadaStore((s) => s.selectEquipment);
  const setActiveView = useScadaStore((s) => s.setActiveView);
  const [areaKey, setAreaKey] = useState<string | null>(null);

  const h = useMemo(
    () => buildAssetHierarchy({ equipments, tags, alarms }),
    [equipments, tags, alarms],
  );

  const area = areaKey ? h.areas.find((a) => a.key === areaKey) : undefined;
  const deviations = area ? area.deviations : h.areas.flatMap((a) => a.deviations);
  const unack =
    h.areas.reduce((n, a) => n + a.unackAlarms, 0) +
    h.orphanAlarms.filter((a) => a.state === "UNACK").length;
  const hasUnassigned = h.areas.some((a) => a.key === UNASSIGNED_AREA_KEY);
  const equipmentCount = Object.keys(equipments).length;

  return (
    <div
      className="flex-1 flex flex-col md:flex-row h-full w-full min-h-0 bg-[#0b0e13] text-zinc-200 overflow-hidden"
      data-testid="scada-overview-view"
    >
      {/* Árvore de ativos */}
      <aside className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-zinc-800 p-3 max-h-56 md:max-h-none flex flex-col">
        <h2 className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5 mb-2">
          <TreeStructure className="w-3.5 h-3.5" /> Ativos
        </h2>
        <AssetTree
          nodes={h.tree}
          selectedEquipmentId={selectedEquipmentId}
          onSelectEquipment={selectEquipment}
        />
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto p-3 sm:p-4 space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold text-white">
              {projectName || t("scada2.overview.projectFallback")}
            </h1>
            <p className="text-[11px] text-zinc-500">
              {t("scada2.overview.summary", { n: equipmentCount, areas: h.areas.length })}
            </p>
          </div>
          <div
            className="flex items-center gap-3 text-[11px] font-mono"
            data-testid="overview-summary"
          >
            <span className={unack > 0 ? "text-red-300 font-bold" : "text-zinc-400"}>
              {t("scada2.overview.unack", { n: unack })}
            </span>
            <span className="text-zinc-400">
              {t("scada2.overview.deviations", { n: deviations.length })}
            </span>
            {isDemoProject && (
              <button
                onClick={() => setActiveView("synoptics")}
                className="px-2 py-0.5 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300"
              >
                {t("scada2.overview.demoSynoptic")}
              </button>
            )}
          </div>
        </header>

        {/* Áreas */}
        <section aria-label={t("scada2.overview.assets")}>
          {h.areas.length === 0 ? (
            <p className="text-[12px] text-zinc-500 border border-dashed border-zinc-800 rounded p-4">
              {t("scada2.overview.emptyProject")}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {h.areas.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setAreaKey((k) => (k === a.key ? null : a.key))}
                  aria-pressed={areaKey === a.key}
                  className={cn(
                    "text-left p-3 rounded-lg border bg-zinc-900/60 hover:bg-zinc-900 transition-colors",
                    areaBorder(a, areaKey === a.key),
                  )}
                  data-testid={`overview-area-${a.key}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] font-bold text-zinc-100 truncate">
                      {a.label}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <span className={cn("w-2 h-2 rounded-full", healthDotClass(a.health))} />
                      {t(HEALTH_LABEL[a.health])}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] font-mono text-zinc-400">
                    <span>{t("scada2.overview.areaEquip", { n: a.equipmentIds.length })}</span>
                    <span className={a.unackAlarms > 0 ? "text-red-300 font-bold" : ""}>
                      {t("scada2.overview.areaAlarms", { n: a.activeAlarms })}
                    </span>
                    <span>
                      {a.totalTags > 0
                        ? t("scada2.overview.areaTags", { c: a.connectedTags, t: a.totalTags })
                        : t("scada2.overview.areaNoTags")}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {hasUnassigned && (
            <p className="mt-2 text-[10px] text-zinc-500">{t("scada2.overview.unassignedNote")}</p>
          )}
        </section>

        {/* Desvios */}
        <section aria-label="Desvios" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <WarningCircle className="w-3.5 h-3.5" /> {t("scada2.overview.deviationsTitle")}{" "}
              {area ? `— ${area.label}` : ""}
            </h2>
            {area && (
              <button
                className="text-[11px] text-zinc-400 hover:text-zinc-100 underline"
                onClick={() => setAreaKey(null)}
              >
                {t("scada2.overview.allAreas")}
              </button>
            )}
          </div>
          {deviations.length === 0 ? (
            <p
              className="text-[12px] text-zinc-500 flex items-center gap-1.5"
              data-testid="overview-no-deviation"
            >
              <CheckCircle className="w-4 h-4" /> {t("scada2.overview.noDeviation")}
            </p>
          ) : (
            <ul
              className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden"
              data-testid="overview-deviations"
            >
              {deviations.slice(0, 200).map((d) => {
                const eq = equipments[d.equipmentId];
                const critical = d.kind === "ALARM_UNACK" || d.kind === "TRIPPED";
                return (
                  <li key={`${d.kind}:${d.ref}:${d.equipmentId}`}>
                    <button
                      type="button"
                      onClick={() => selectEquipment(d.equipmentId)}
                      className={cn(
                        "w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-zinc-900",
                        critical && "bg-red-500/5",
                      )}
                    >
                      <span
                        className={cn(
                          "text-[10px] font-mono w-24 shrink-0",
                          critical ? "text-red-300 font-bold" : "text-amber-300",
                        )}
                      >
                        {t(KIND_LABEL[d.kind])}
                        {d.priority ? ` · ${d.priority}` : ""}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-100 w-28 shrink-0 truncate">
                        {eq?.tag ?? d.equipmentId}
                      </span>
                      <span className="text-[11px] text-zinc-300 truncate flex-1">{d.message}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!area && h.orphanAlarms.length > 0 && (
            <button
              onClick={() => setActiveView("alarms")}
              className="text-[11px] text-zinc-400 hover:text-zinc-100 underline"
            >
              {t("scada2.overview.orphanAlarms", { n: h.orphanAlarms.length })}
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
