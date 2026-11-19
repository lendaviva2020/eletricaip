// SCADA SUPERVISÓRIO — Faceplate único por equipamento canônico (ISA-101 nível 3)
// Uma tela só por equipamento: estado, alarmes, desvios, tendência, comandos
// (simulação), dados de placa, tags e documentos. Aberto a partir de qualquer
// alarme, da árvore de ativos ou da visão geral (1 clique) — a tendência já
// aparece aberta no faceplate (2º clique só para trocar o tag).

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Cpu,
  Power,
  WarningCircle,
  Tag,
  Lightning,
  ChartLine,
  FileText,
  CheckCircle,
} from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useScadaStore } from "@/lib/scada/scada-store";
import { isRotatingEquipment, type ScadaTagDefinition } from "@/lib/scada/types";
import {
  areaLabelOf,
  buildAssetHierarchy,
  buildTagOwnerIndex,
  equipmentIdForAlarm,
  type Deviation,
} from "@/lib/scada/asset-hierarchy";
import {
  ensureTagTrendRecorder,
  plotValue,
  useTagTrendStore,
  type TrendPoint,
} from "@/lib/scada/tag-trend-buffer";
import { sourceLabel } from "@/lib/scada/tag-hub";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useAlarmMgmtStore, useAlarmPartition } from "@/lib/scada/alarm-management-store";
import { alarmPointKey, isRationalized } from "@/lib/scada/alarm-management";
import { toast } from "sonner";
import { ForceTagDialog } from "@/components/scada/force-tag-dialog";
import { TagSparkline } from "@/components/scada/tag-sparkline";

const EMPTY_SERIES: readonly TrendPoint[] = [];

/** Valor de placa ou "—" quando o projeto não informou (nunca um padrão presumido). */
function fmtOrDash(v: number | undefined, unit: string, digits: number): string {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? `${v.toFixed(digits)}${unit}` : "—";
}

const STATUS_LABEL: Record<string, string> = {
  RUNNING: "scada2.faceplate.statusRunning",
  STOPPED: "scada2.faceplate.statusStopped",
  TRIPPED: "scada2.faceplate.statusTripped",
  STANDBY: "scada2.faceplate.statusStandby",
  OPEN: "scada2.faceplate.statusOpen",
  CLOSED: "scada2.faceplate.statusClosed",
  MAINTENANCE: "scada2.faceplate.statusMaintenance",
};

const DEVIATION_LABEL: Record<Deviation["kind"], string> = {
  ALARM_UNACK: "scada2.faceplate.devAlarmUnack",
  ALARM_ACK: "scada2.faceplate.devAlarmAck",
  TRIPPED: "scada2.faceplate.devTripped",
  MAINTENANCE: "scada2.faceplate.devMaintenance",
  BAD_QUALITY: "scada2.faceplate.devBadQuality",
  STALE: "scada2.faceplate.devStale",
  FORCED: "scada2.faceplate.devForced",
};

/** Qualidade com cor só quando anormal (ISA-101). */
function qualityClass(t: ScadaTagDefinition): string {
  if (t.forced) return "border-amber-500/60 text-amber-300";
  if (t.quality === "BAD" || t.quality === "STALE") return "border-red-500/60 text-red-300";
  if (t.quality === "GOOD") return "border-zinc-700 text-zinc-300";
  return "border-zinc-700 text-zinc-500";
}

export function EquipmentInspectorDrawer() {
  const { t: tr } = useI18n();
  const navigate = useNavigate();
  const selectedId = useScadaStore((s) => s.selectedEquipmentId);
  const selectEquipment = useScadaStore((s) => s.selectEquipment);
  const setActiveView = useScadaStore((s) => s.setActiveView);
  const equipments = useScadaStore((s) => s.equipments);
  const tags = useScadaStore((s) => s.tags);
  const part = useAlarmPartition();
  const alarms = part.visible;
  const mgmtSettings = useAlarmMgmtStore((s) => s.settings);
  const isDemo = useScadaStore((s) => s.isDemoProject);
  const projectId = useScadaStore((s) => s.currentProjectId);
  const commandEquipment = useScadaStore((s) => s.commandEquipment);
  const unforceTag = useScadaStore((s) => s.unforceTag);
  const acknowledgeAlarm = useScadaStore((s) => s.acknowledgeAlarm);
  const series = useTagTrendStore((s) => s.series);

  const [forceTarget, setForceTarget] = useState<ScadaTagDefinition | null>(null);
  const [trendTag, setTrendTag] = useState<string | null>(null);

  useEffect(() => {
    ensureTagTrendRecorder();
  }, []);
  useEffect(() => {
    setTrendTag(null);
  }, [selectedId]);

  const hierarchy = useMemo(
    () => buildAssetHierarchy({ equipments, tags, alarms }),
    [equipments, tags, alarms],
  );

  const hierarchyOwnerIndex = useMemo(
    () => buildTagOwnerIndex(equipments, tags),
    [equipments, tags],
  );
  const eq = selectedId ? equipments[selectedId] : undefined;

  const linked = useMemo(() => {
    if (!eq) return [] as ScadaTagDefinition[];
    const names = new Set(eq.linkedTags);
    const out = new Map<string, ScadaTagDefinition>();
    for (const t of Object.values(tags)) {
      if (!t?.name) continue;
      if (names.has(t.name) || t.linkedEquipmentId === eq.id) out.set(t.name, t);
    }
    return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [eq, tags]);

  if (!selectedId || !eq) return null;

  const plottable = linked.filter((t) => plotValue(t.value) !== null);
  const activeTrendTag = trendTag ?? plottable[0]?.name ?? null;
  const activeTrendDef = linked.find((t) => t.name === activeTrendTag);
  const eqAlarms = alarms.filter((a) => hierarchy.alarmOwner.get(a.id) === eq.id);
  const hiddenAlarms = [...part.shelved, ...part.outOfService].filter(
    (al) => equipmentIdForAlarm(al, equipments, hierarchyOwnerIndex) === eq.id,
  ).length;
  const deviations = (hierarchy.byEquipment.get(eq.id) ?? []).filter(
    (d) => d.kind !== "ALARM_UNACK" && d.kind !== "ALARM_ACK",
  );
  const missingTags = eq.linkedTags.filter((n) => !linked.some((t) => t.name === n));

  const handleCommand = (cmd: "START" | "STOP" | "OPEN" | "CLOSE" | "AUTO" | "MANUAL") => {
    commandEquipment(eq.id, cmd);
    toast.success(tr("scada2.faceplate.cmdToast", { cmd, tag: eq.tag }));
  };

  return (
    <div
      className="absolute inset-y-0 right-0 w-full sm:w-[440px] bg-[#0c1018] border-l border-zinc-800 shadow-2xl z-30 flex flex-col select-none text-zinc-200 animate-in slide-in-from-right duration-200"
      data-testid="scada-equipment-drawer"
      role="dialog"
      aria-label={tr("scada2.faceplate.ariaFaceplate", { tag: eq.tag })}
    >
      <div className="p-4 border-b border-zinc-800 flex items-start justify-between gap-2 bg-zinc-950/80">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold text-zinc-100">{eq.tag}</span>
              <span
                className={cn(
                  "text-[10px] font-mono px-1.5 rounded font-semibold border",
                  eq.status === "TRIPPED"
                    ? "bg-red-500/20 text-red-300 border-red-500/50 motion-safe:animate-pulse"
                    : eq.status === "MAINTENANCE"
                      ? "text-amber-300 border-amber-500/40"
                      : "text-zinc-300 border-zinc-700",
                )}
                data-testid="faceplate-status"
              >
                {STATUS_LABEL[eq.status] ? tr(STATUS_LABEL[eq.status]) : eq.status}
              </span>
              <span className="text-[10px] font-mono text-zinc-500">{eq.mode}</span>
            </div>
            <h2 className="text-sm font-bold text-white truncate">{eq.name}</h2>
            <p
              className="text-[10px] font-mono text-zinc-500 truncate"
              data-testid="faceplate-area"
            >
              {eq.designation ?? eq.tag} · {areaLabelOf(eq)}
            </p>
          </div>
        </div>
        <button
          onClick={() => selectEquipment(null)}
          className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          aria-label={tr("scada2.faceplate.close")}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans">
        {/* Alarmes do equipamento */}
        <section className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2">
          <h3 className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
            <WarningCircle className="w-3.5 h-3.5" /> Alarmes ({eqAlarms.length})
          </h3>
          {hiddenAlarms > 0 && (
            <p className="text-[10px] text-amber-300" data-testid="faceplate-hidden-alarms">
              {tr("scada2.faceplate.hiddenAlarms", { n: hiddenAlarms })}
            </p>
          )}
          {eqAlarms.length === 0 ? (
            <p className="text-[11px] text-zinc-500">{tr("scada2.faceplate.noAlarms")}</p>
          ) : (
            <ul className="space-y-1.5" data-testid="faceplate-alarms">
              {eqAlarms.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    "p-2 rounded border text-[11px] flex items-start justify-between gap-2",
                    a.state === "UNACK"
                      ? "border-red-500/50 bg-red-500/10"
                      : "border-zinc-700 bg-zinc-950/60",
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] text-zinc-400">
                      {a.priority} · {a.tag} · {new Date(a.timestamp).toLocaleTimeString("pt-BR")}
                    </div>
                    <div className="text-zinc-200">{a.description}</div>
                    {(() => {
                      const r = mgmtSettings.get(alarmPointKey(a));
                      return isRationalized(r) && r ? (
                        <div
                          className="text-[11px] text-zinc-300 mt-0.5"
                          data-testid="faceplate-alarm-action"
                        >
                          <span className="text-zinc-500">
                            {tr("scada2.faceplate.actionLabel")}
                          </span>{" "}
                          {r.correctiveAction}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  {a.state === "UNACK" && (
                    <button
                      onClick={() => acknowledgeAlarm(a.id)}
                      className="shrink-0 px-2 py-0.5 rounded border border-zinc-600 text-[10px] hover:bg-zinc-800"
                    >
                      {tr("scada2.faceplate.ack")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {deviations.length > 0 && (
            <ul
              className="space-y-1 pt-1 border-t border-zinc-800"
              data-testid="faceplate-deviations"
            >
              {deviations.map((d) => (
                <li key={`${d.kind}:${d.ref}`} className="text-[11px] text-zinc-300">
                  <span className="font-mono text-[10px] text-amber-300">
                    {tr(DEVIATION_LABEL[d.kind])}
                  </span>{" "}
                  — {d.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Tendência */}
        <section className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
              <ChartLine className="w-3.5 h-3.5" /> {tr("scada2.faceplate.trend")}
            </h3>
            {plottable.length > 0 && (
              <select
                value={activeTrendTag ?? ""}
                onChange={(e) => setTrendTag(e.target.value)}
                className="max-w-[230px] bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-[11px] font-mono"
                aria-label={tr("scada2.faceplate.trendSelectAria")}
                data-testid="faceplate-trend-select"
              >
                {plottable.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {activeTrendTag ? (
            <TagSparkline
              points={series[activeTrendTag] ?? EMPTY_SERIES}
              unit={activeTrendDef?.unit ?? ""}
            />
          ) : (
            <p className="text-[11px] text-zinc-500">{tr("scada2.faceplate.noNumericTag")}</p>
          )}
          <button
            onClick={() => setActiveView("trends")}
            className="text-[11px] text-zinc-400 hover:text-zinc-100 underline underline-offset-2"
          >
            {tr("scada2.faceplate.openHistorian")}
          </button>
        </section>

        {/* Comandos (simulação) */}
        <section className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-mono font-semibold uppercase text-zinc-400">
              {tr("scada2.faceplate.command")}
            </h3>
            <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-800">
              {(["AUTO", "MANUAL"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => handleCommand(m)}
                  aria-pressed={eq.mode === m}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-colors",
                    eq.mode === m
                      ? "bg-zinc-200 text-zinc-900"
                      : "text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isRotatingEquipment(eq.category) ? (
              <>
                <button
                  onClick={() => handleCommand("START")}
                  disabled={eq.status === "RUNNING"}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs"
                >
                  <Power className="w-3.5 h-3.5" /> {tr("scada2.faceplate.ligar")}
                </button>
                <button
                  onClick={() => handleCommand("STOP")}
                  disabled={eq.status === "STOPPED"}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs"
                >
                  <Power className="w-3.5 h-3.5" /> {tr("scada2.faceplate.desligar")}
                </button>
              </>
            ) : eq.category === "VALVE" ? (
              <>
                <button
                  onClick={() => handleCommand("OPEN")}
                  disabled={eq.status === "OPEN"}
                  className="py-1.5 rounded border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs"
                >
                  {tr("scada2.faceplate.abrir")}
                </button>
                <button
                  onClick={() => handleCommand("CLOSE")}
                  disabled={eq.status === "CLOSED"}
                  className="py-1.5 rounded border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white text-xs"
                >
                  {tr("scada2.faceplate.fechar")}
                </button>
              </>
            ) : (
              <p className="col-span-2 text-center text-[11px] text-zinc-500 py-1">
                {tr("scada2.faceplate.onlyMonitor")}
              </p>
            )}
          </div>
          <p className="text-[10px] text-zinc-500">{tr("scada2.faceplate.noFieldWrite")}</p>
        </section>

        {/* Dados de placa e medidos */}
        <section className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2">
          <h3 className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
            <Lightning className="w-3.5 h-3.5" /> {tr("scada2.faceplate.dataTitle")}
          </h3>
          <dl className="grid grid-cols-2 gap-2 font-mono">
            <Cell
              label={tr("scada2.faceplate.voltage")}
              value={fmtOrDash(eq.nominal?.voltageV ?? (isDemo ? eq.voltageV : undefined), " V", 0)}
            />
            <Cell
              label={tr("scada2.faceplate.current")}
              value={
                eq.currentA > 0 ? `${eq.currentA.toFixed(1)} A` : tr("scada2.faceplate.noReading")
              }
            />
            <Cell
              label={tr("scada2.faceplate.power")}
              value={fmtOrDash(eq.powerKw > 0 ? eq.powerKw : undefined, " kW", 1)}
            />
            <Cell
              label={tr("scada2.faceplate.pf")}
              value={fmtOrDash(
                eq.nominal?.powerFactor ?? (isDemo ? eq.powerFactor : undefined),
                "",
                2,
              )}
            />
            {typeof eq.flowRateM3h === "number" && (
              <Cell
                label={tr("scada2.faceplate.flow")}
                value={`${eq.flowRateM3h.toFixed(1)} m³/h`}
              />
            )}
            {typeof eq.levelPct === "number" && (
              <Cell label={tr("scada2.faceplate.level")} value={`${eq.levelPct.toFixed(1)} %`} />
            )}
            {typeof eq.pressureBar === "number" && (
              <Cell
                label={tr("scada2.faceplate.pressure")}
                value={`${eq.pressureBar.toFixed(1)} bar`}
              />
            )}
            {typeof eq.temperatureC === "number" && (
              <Cell
                label={tr("scada2.faceplate.temperature")}
                value={`${eq.temperatureC.toFixed(1)} °C`}
              />
            )}
            <Cell
              label={tr("scada2.faceplate.hours")}
              value={eq.runningHours > 0 ? `${eq.runningHours} h` : tr("scada2.faceplate.noRecord")}
            />
            <Cell
              label={tr("scada2.faceplate.starts")}
              value={eq.startsCount > 0 ? String(eq.startsCount) : tr("scada2.faceplate.noRecord")}
            />
          </dl>
        </section>

        {/* Tags */}
        <section className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2">
          <h3 className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> {tr("scada2.faceplate.tagsTitle", { n: linked.length })}
          </h3>
          {linked.length === 0 && missingTags.length === 0 && (
            <p className="text-[11px] text-zinc-500">{tr("scada2.faceplate.noTags")}</p>
          )}
          <ul className="space-y-1.5" data-testid="faceplate-tags">
            {linked.map((tag) => (
              <li
                key={tag.name}
                className="p-2 rounded bg-zinc-950/80 border border-zinc-800 text-[11px] font-mono space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="font-bold text-white truncate text-left hover:underline"
                    onClick={() => plotValue(tag.value) !== null && setTrendTag(tag.name)}
                    title={tr("scada2.faceplate.trendTagTitle")}
                  >
                    {tag.name}
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={cn(
                        "px-1.5 rounded text-[9px] font-bold border",
                        qualityClass(tag),
                      )}
                    >
                      {tag.forced ? "FORÇADO" : tag.quality}
                    </span>
                    <span className="font-bold text-zinc-100">
                      {tag.quality === "NOT_CONNECTED" ? "—" : `${String(tag.value)} ${tag.unit}`}
                    </span>
                  </div>
                </div>
                <div className="text-[10px] text-zinc-500 flex justify-between items-center gap-2">
                  <span className="truncate">
                    {sourceLabel(tag.driver)} · {tag.description}
                  </span>
                  {tag.forced ? (
                    <button
                      onClick={() => unforceTag(tag.id)}
                      className="text-amber-300 hover:underline shrink-0"
                    >
                      {tr("scada2.faceplate.release")}
                    </button>
                  ) : (
                    <button
                      onClick={() => setForceTarget(tag)}
                      className="text-zinc-300 hover:underline shrink-0"
                    >
                      {tr("scada2.faceplate.force")}
                    </button>
                  )}
                </div>
              </li>
            ))}
            {missingTags.map((n) => (
              <li
                key={n}
                className="p-2 rounded bg-zinc-950/50 border border-zinc-800 flex justify-between font-mono text-[11px]"
              >
                <span className="text-zinc-400">{n}</span>
                <span className="text-zinc-600">{tr("scada2.faceplate.notRegistered")}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Documentos */}
        <section className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3 space-y-2">
          <h3 className="text-[11px] font-mono font-semibold uppercase text-zinc-400 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> {tr("scada2.faceplate.docsTitle")}
          </h3>
          <p className="text-[11px] text-zinc-400">
            {tr("scada2.faceplate.designation")}{" "}
            <span className="font-mono text-zinc-200">
              {eq.designation ?? tr("scada2.faceplate.designationNone")}
            </span>
            {!eq.location && tr("scada2.faceplate.designationHint")}
          </p>
          {isDemo || !projectId ? (
            <p className="text-[11px] text-zinc-500">{tr("scada2.faceplate.demoNoDossier")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                className="px-2 py-1 rounded border border-zinc-700 text-[11px] hover:bg-zinc-800"
                onClick={() => void navigate({ to: "/workspace", search: { projectId } })}
              >
                {tr("scada2.faceplate.openUnifilar")}
              </button>
              <button
                className="px-2 py-1 rounded border border-zinc-700 text-[11px] hover:bg-zinc-800"
                onClick={() =>
                  void navigate({ to: "/projects/$projectId/export", params: { projectId } })
                }
              >
                {tr("scada2.faceplate.projectDossier")}
              </button>
            </div>
          )}
        </section>

        {eqAlarms.length === 0 && deviations.length === 0 && (
          <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" /> {tr("scada2.faceplate.noDeviations")}
          </p>
        )}
      </div>
      <ForceTagDialog tag={forceTarget} onClose={() => setForceTarget(null)} />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950/60 p-2 rounded border border-zinc-800/80">
      <dt className="text-zinc-500 text-[10px] uppercase">{label}</dt>
      <dd className="font-semibold text-zinc-200">{value}</dd>
    </div>
  );
}
