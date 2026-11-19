// SCADA SUPERVISÓRIO — Alarmes (ISA-18.2)
// Ativos (com primeiro alarme e racionalização), prateleira com prazo, fora de
// serviço e indicadores de desempenho calculados do histórico gravado.

import { useMemo, useState } from "react";
import {
  DownloadSimple,
  MagnifyingGlass,
  Archive,
  Wrench,
  ChartBar,
  Bell,
  DotsThreeVertical,
} from "@phosphor-icons/react";
import { useScadaStore } from "@/lib/scada/scada-store";
import type { ScadaAlarmItem } from "@/lib/scada/types";
import { buildTagOwnerIndex, equipmentIdForAlarm } from "@/lib/scada/asset-hierarchy";
import {
  alarmPointKey,
  firstOutIds,
  isRationalized,
  type AlarmPointSetting,
} from "@/lib/scada/alarm-management";
import { useAlarmMgmtStore, useAlarmPartition } from "@/lib/scada/alarm-management-store";
import {
  AlarmPointDialog,
  useAlarmPointChange,
  type AlarmPointAction,
} from "@/components/scada/alarm-point-dialog";
import { AlarmKpiPanel } from "@/components/scada/alarm-kpi-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

type Tab = "active" | "shelved" | "oos" | "kpis";

/** Célula CSV sem injeção de fórmula (planilhas executam =, +, -, @). */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const PRIORITY_CLASS: Record<ScadaAlarmItem["priority"], string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "border border-red-500/60 text-red-300",
  MEDIUM: "border border-amber-500/50 text-amber-300",
  LOW: "border border-zinc-600 text-zinc-300",
  INFO: "border border-zinc-700 text-zinc-400",
};

const time = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR");
const dateTime = (ms: number) => new Date(ms).toLocaleString("pt-BR");

export function ScadaAlarmsView() {
  const { t } = useI18n();
  const acknowledgeAlarm = useScadaStore((s) => s.acknowledgeAlarm);
  const acknowledgeAllAlarms = useScadaStore((s) => s.acknowledgeAllAlarms);
  const clearAlarm = useScadaStore((s) => s.clearAlarm);
  const equipments = useScadaStore((s) => s.equipments);
  const tags = useScadaStore((s) => s.tags);
  const selectEquipment = useScadaStore((s) => s.selectEquipment);
  const settings = useAlarmMgmtStore((s) => s.settings);
  const part = useAlarmPartition();
  const runChange = useAlarmPointChange();

  const [tab, setTab] = useState<Tab>("active");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [stateFilter, setStateFilter] = useState<string>("ALL");
  const [dialog, setDialog] = useState<{ alarm: ScadaAlarmItem; action: AlarmPointAction } | null>(
    null,
  );

  const ownerIndex = useMemo(() => buildTagOwnerIndex(equipments, tags), [equipments, tags]);
  const firstOut = useMemo(
    () =>
      firstOutIds(
        part.visible,
        (a) => equipmentIdForAlarm(a, equipments, ownerIndex) ?? "__sem_dono__",
      ),
    [part.visible, equipments, ownerIndex],
  );

  const active = part.visible.filter((a): a is ScadaAlarmItem => Boolean(a && a.id));
  const unackCount = active.filter((a) => a.state === "UNACK").length;
  const q = search.trim().toLowerCase();
  const filtered = active
    .filter((a) => {
      if (q && !a.tag.toLowerCase().includes(q) && !(a.description || "").toLowerCase().includes(q))
        return false;
      if (priorityFilter !== "ALL" && a.priority !== priorityFilter) return false;
      if (stateFilter === "UNACK" && a.state !== "UNACK") return false;
      if (stateFilter === "ACK" && a.state !== "ACK") return false;
      if (stateFilter === "CLEARED" && a.clearedAt == null) return false;
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const handleExportCsv = () => {
    const header =
      "TAG,Prioridade,Categoria,Descricao,Valor,Limite,Estado,DisparadoEm,Causa,Acao\n";
    const rows = active
      .map((a) => {
        const s = settings.get(alarmPointKey(a));
        return [
          a.tag,
          a.priority,
          a.category,
          a.description,
          a.currentValue,
          a.setpointLimit,
          a.state,
          new Date(a.timestamp).toISOString(),
          s?.cause ?? "",
          s?.correctiveAction ?? "",
        ]
          .map(csvCell)
          .join(",");
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alarmes_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const shelvedPoints = [...settings.values()].filter(
    (s) => s.shelvedUntil != null && s.shelvedUntil > part.now,
  );
  const oosPoints = [...settings.values()].filter((s) => s.outOfService);

  const tabs: { id: Tab; label: string; icon: typeof Bell; count?: number }[] = [
    { id: "active", label: t("scada2.alarms.tabActive"), icon: Bell, count: active.length },
    {
      id: "shelved",
      label: t("scada2.alarms.tabShelved"),
      icon: Archive,
      count: shelvedPoints.length,
    },
    { id: "oos", label: t("scada2.alarms.tabOos"), icon: Wrench, count: oosPoints.length },
    { id: "kpis", label: t("scada2.alarms.tabKpis"), icon: ChartBar },
  ];

  return (
    <div
      className="flex-1 flex flex-col p-3 sm:p-4 overflow-y-auto min-h-0 bg-[#080b11] text-zinc-200 space-y-3"
      data-testid="scada-alarms-view"
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-mono border-b-2 -mb-px",
              tab === t.id
                ? "border-zinc-200 text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200",
            )}
            data-testid={`alarm-tab-${t.id}`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "px-1.5 rounded text-[10px]",
                  t.id === "active" && unackCount > 0 ? "bg-red-600 text-white" : "bg-zinc-800",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "active" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-md">
              <MagnifyingGlass className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value.slice(0, 80))}
                placeholder={t("scada2.alarms.searchPlaceholder")}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-8 pr-3 py-1 text-xs text-white placeholder-zinc-500 font-mono"
                aria-label={t("scada2.alarms.searchAria")}
              />
            </div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-300 font-mono"
              aria-label={t("scada2.alarms.priorityAria")}
            >
              <option value="ALL">{t("scada2.alarms.priorityAll")}</option>
              <option value="CRITICAL">{t("scada2.alarms.prioCritical")}</option>
              <option value="HIGH">{t("scada2.alarms.prioHigh")}</option>
              <option value="MEDIUM">{t("scada2.alarms.prioMedium")}</option>
              <option value="LOW">{t("scada2.alarms.prioLow")}</option>
            </select>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-300 font-mono"
              aria-label={t("scada2.alarms.stateAria")}
            >
              <option value="ALL">{t("scada2.alarms.stateAll")}</option>
              <option value="UNACK">{t("scada2.alarms.stUnack")}</option>
              <option value="ACK">{t("scada2.alarms.stAck")}</option>
              <option value="CLEARED">{t("scada2.alarms.stCleared")}</option>
            </select>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => {
                  acknowledgeAllAlarms();
                  toast.success(t("scada2.alarms.ackedToast"));
                }}
                disabled={unackCount === 0}
                className="px-3 py-1.5 rounded-md border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white font-mono text-xs"
              >
                {t("scada2.alarms.ackAll", { n: unackCount })}
              </button>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-mono text-xs"
              >
                <DownloadSimple className="w-3.5 h-3.5" /> {t("scada2.alarms.csv")}
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center" data-testid="alarms-empty">
              {t("scada2.alarms.empty")}
              {q || priorityFilter !== "ALL" || stateFilter !== "ALL"
                ? t("scada2.alarms.emptyFilters")
                : ""}
              .
            </p>
          ) : (
            <ul className="space-y-1.5" data-testid="alarms-active-list">
              {filtered.map((a) => {
                const owner = equipmentIdForAlarm(a, equipments, ownerIndex);
                const s = settings.get(alarmPointKey(a));
                const rationalized = isRationalized(s);
                return (
                  <li
                    key={a.id}
                    className={cn(
                      "rounded-md border px-3 py-2 text-xs",
                      a.state === "UNACK"
                        ? "border-red-500/50 bg-red-500/5"
                        : "border-zinc-800 bg-zinc-950/60",
                    )}
                    data-testid={`alarm-row-${a.id}`}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <span
                        className={cn(
                          "px-1.5 rounded text-[10px] font-bold font-mono",
                          PRIORITY_CLASS[a.priority],
                        )}
                      >
                        {a.priority}
                      </span>
                      {firstOut.has(a.id) && (
                        <span
                          className="px-1.5 rounded text-[10px] font-bold font-mono border border-zinc-300 text-zinc-100"
                          title={t("scada2.alarms.firstOutTitle")}
                          data-testid={`alarm-first-out-${a.id}`}
                        >
                          1º
                        </span>
                      )}
                      {owner ? (
                        <button
                          onClick={() => selectEquipment(owner)}
                          className="font-mono font-bold text-white hover:underline underline-offset-2"
                          title={t("scada2.alarms.faceplateTitle")}
                          data-testid={`alarm-open-faceplate-${a.id}`}
                        >
                          {a.tag}
                        </button>
                      ) : (
                        <span className="font-mono font-bold text-white">{a.tag}</span>
                      )}
                      <span className="text-zinc-300 flex-1 min-w-[160px]">{a.description}</span>
                      <span className="font-mono text-zinc-500 whitespace-nowrap">
                        {time(a.timestamp)}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-mono whitespace-nowrap",
                          a.state === "UNACK" ? "text-red-300 font-bold" : "text-zinc-500",
                        )}
                      >
                        {a.state === "UNACK" ? t("scada2.alarms.unack") : t("scada2.alarms.ack")}
                        {a.clearedAt != null ? t("scada2.alarms.normalized") : ""}
                      </span>
                      <div className="flex items-center gap-1 ml-auto">
                        {a.state === "UNACK" ? (
                          <button
                            onClick={() => acknowledgeAlarm(a.id)}
                            className="px-2 py-0.5 rounded border border-zinc-600 hover:bg-zinc-800 text-[10px]"
                          >
                            {t("scada2.alarms.btnAck")}
                          </button>
                        ) : (
                          a.clearedAt != null && (
                            <button
                              onClick={() => clearAlarm(a.id)}
                              className="px-2 py-0.5 rounded border border-zinc-700 hover:bg-zinc-800 text-[10px] text-zinc-400"
                            >
                              {t("scada2.alarms.btnArchive")}
                            </button>
                          )
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="p-1 rounded hover:bg-zinc-800"
                            aria-label={t("scada2.alarms.menuAria", { tag: a.tag })}
                            data-testid={`alarm-menu-${a.id}`}
                          >
                            <DotsThreeVertical className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={a.category === "SAFETY"}
                              onSelect={() => setDialog({ alarm: a, action: "shelve" })}
                            >
                              {t("scada2.alarms.shelve")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={a.category === "SAFETY"}
                              onSelect={() => setDialog({ alarm: a, action: "outOfService" })}
                            >
                              {t("scada2.alarms.oos")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setDialog({ alarm: a, action: "rationalize" })}
                            >
                              {rationalized
                                ? t("scada2.alarms.editRationalize")
                                : t("scada2.alarms.rationalize")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {rationalized && s ? (
                      <p
                        className="mt-1 text-[11px] text-zinc-300"
                        data-testid={`alarm-action-${a.id}`}
                      >
                        <span className="text-zinc-500">{t("scada2.alarms.actionLabel")}</span>{" "}
                        {s.correctiveAction}
                        {s.responseTimeMin ? (
                          <span className="text-zinc-500">
                            {" "}
                            {t("scada2.alarms.actUpTo", { n: s.responseTimeMin })}
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {t("scada2.alarms.noRationale")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {tab === "shelved" && (
        <PointList
          testId="alarms-shelved-list"
          empty={t("scada2.alarms.emptyShelved")}
          points={shelvedPoints}
          describe={(s) => `Até ${dateTime(s.shelvedUntil ?? 0)} · ${s.shelveReason ?? ""}`}
          actionLabel={t("scada2.alarms.returnNow")}
          onAction={(s) => void runChange(s.pointKey, s.tagName, { kind: "unshelve" })}
          activeCount={(s) => part.shelved.filter((a) => alarmPointKey(a) === s.pointKey).length}
        />
      )}

      {tab === "oos" && (
        <PointList
          testId="alarms-oos-list"
          empty={t("scada2.alarms.emptyOos")}
          points={oosPoints}
          describe={(s) => `Desde ${dateTime(s.oosAt ?? 0)} · ${s.oosReason ?? ""}`}
          actionLabel={t("scada2.alarms.returnService")}
          onAction={(s) => void runChange(s.pointKey, s.tagName, { kind: "returnToService" })}
          activeCount={(s) =>
            part.outOfService.filter((a) => alarmPointKey(a) === s.pointKey).length
          }
        />
      )}

      {tab === "kpis" && <AlarmKpiPanel />}

      <AlarmPointDialog
        alarm={dialog?.alarm ?? null}
        action={dialog?.action ?? null}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

function PointList({
  testId,
  empty,
  points,
  describe,
  actionLabel,
  onAction,
  activeCount,
}: {
  testId: string;
  empty: string;
  points: AlarmPointSetting[];
  describe: (s: AlarmPointSetting) => string;
  actionLabel: string;
  onAction: (s: AlarmPointSetting) => void;
  activeCount: (s: AlarmPointSetting) => number;
}) {
  const { t } = useI18n();
  if (points.length === 0) return <p className="text-sm text-zinc-500 py-8 text-center">{empty}</p>;
  return (
    <ul className="space-y-1.5" data-testid={testId}>
      {points.map((s) => {
        const n = activeCount(s);
        return (
          <li
            key={s.pointKey}
            className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs flex flex-wrap items-center gap-2"
          >
            <span className="font-mono font-bold text-white">{s.tagName}</span>
            <span className="text-[10px] font-mono text-zinc-500">{s.pointKey.split("|")[0]}</span>
            <span className="text-zinc-300 flex-1 min-w-[160px]">{describe(s)}</span>
            {n > 0 && (
              <span className="text-[10px] font-mono text-amber-300">
                {t("scada2.alarms.hiddenActive", { n })}
              </span>
            )}
            <button
              onClick={() => onAction(s)}
              className="px-2 py-0.5 rounded border border-zinc-600 hover:bg-zinc-800 text-[10px]"
            >
              {actionLabel}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
