// CCM Supervisório — Centro de Controle de Motores (ISA-101 / ISA-18.2).
//
// Cada motor desenhado no UNIFILAR aparece aqui automaticamente (fonte única).
// Clique no motor → partida (VERDE). Clique de novo → parada (CINZA).
// Disparo de proteção → VERMELHO PISCANTE até reconhecer; vermelho fixo até rearmar.
//
// Fronteira de segurança: tudo aqui é SIMULAÇÃO. Escrita em campo bloqueada
// (MCC_FIELD_WRITE_ENABLED = false) — botão de software não substitui E-STOP físico.
import { useEffect, useMemo, useState } from "react";
import {
  ArrowCounterClockwise,
  CheckCircle,
  Lightning,
  Pause,
  Play,
  Stop,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react";
import { useDiagramStore } from "@/lib/diagram/store";
import { useSafetyStore } from "@/lib/simulation/safety-core";
import {
  MCC_FIELD_WRITE_ENABLED,
  isFaultUnacknowledged,
  useMotorControlStore,
  type MccTimeScale,
} from "@/lib/simulation/motor-control-store";
import {
  THERMAL_TRIP_THETA,
  faultLabel,
  magneticTrip_A,
  thermalTripTime_s,
  type InjectedMotorFault,
  type MotorDriveState,
} from "@/lib/simulation/motor-protection-engine";
import type { FleetMotor } from "@/lib/simulation/motor-fleet";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const INJECTABLE: { value: InjectedMotorFault; label: string }[] = [
  { value: "none", label: "mcc.inj_none" },
  { value: "overload", label: "mcc.inj_overload" },
  { value: "short_circuit", label: "mcc.inj_short_circuit" },
  { value: "phase_loss", label: "mcc.inj_phase_loss" },
  { value: "locked_rotor", label: "mcc.inj_locked_rotor" },
  { value: "sensor_speed", label: "mcc.inj_sensor_speed" },
  { value: "sensor_temp", label: "mcc.inj_sensor_temp" },
];

const STATE_TEXT: Record<MotorDriveState["runState"], string> = {
  // chaves i18n (traduzidas na renderização)
  STOPPED: "mcc.st_STOPPED",
  STARTING: "mcc.st_STARTING",
  RUNNING: "mcc.st_RUNNING",
  STOPPING: "mcc.st_STOPPING",
  TRIPPED: "mcc.st_TRIPPED",
};

type Visual = "off" | "starting" | "on" | "fault-blink" | "fault";

function visualOf(d: MotorDriveState | undefined, unack: boolean): Visual {
  if (!d) return "off";
  if (d.fault) return unack ? "fault-blink" : "fault";
  if (d.runState === "RUNNING") return "on";
  if (d.runState === "STARTING") return "starting";
  return "off";
}

const VISUAL_COLORS: Record<Visual, { stroke: string; fill: string; text: string }> = {
  off: { stroke: "#9ca3af", fill: "#3f464d", text: "text-zinc-300" },
  starting: { stroke: "#22c55e", fill: "#14532d", text: "text-green-300" },
  on: { stroke: "#22c55e", fill: "#15803d", text: "text-green-300" },
  "fault-blink": { stroke: "#ef4444", fill: "#b91c1c", text: "text-red-300" },
  fault: { stroke: "#ef4444", fill: "#7f1d1d", text: "text-red-300" },
};

/** Símbolo de motor trifásico (IEC 60617 S00819: círculo com "M 3~"). */
function MotorSymbol({ visual, spinning }: { visual: Visual; spinning: boolean }) {
  const c = VISUAL_COLORS[visual];
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14 shrink-0" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill={c.fill} stroke={c.stroke} strokeWidth="3" />
      {spinning && (
        <circle
          cx="32"
          cy="32"
          r="22"
          fill="none"
          stroke={c.stroke}
          strokeWidth="2"
          strokeDasharray="10 8"
          className="mcc-rotor"
        />
      )}
      <text x="32" y="30" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">
        M
      </text>
      <text x="32" y="46" textAnchor="middle" fontSize="11" fill="#fff">
        3~
      </text>
    </svg>
  );
}

function fmt(v: number, digits = 1): string {
  return Number.isFinite(v) ? v.toFixed(digits) : "—";
}

function MotorTile({
  motor,
  drive,
  unack,
  selected,
  feederOk,
  onToggle,
  onSelect,
}: {
  motor: FleetMotor;
  drive: MotorDriveState | undefined;
  unack: boolean;
  selected: boolean;
  feederOk: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const visual = visualOf(drive, unack);
  const c = VISUAL_COLORS[visual];
  const thetaPct = drive ? Math.min(100, (drive.thermalTheta / THERMAL_TRIP_THETA) * 100) : 0;
  const stateText = drive ? t(STATE_TEXT[drive.runState]) : "—";
  const spinning = !!drive && drive.speed_rpm > 20;
  return (
    <div
      className={cn(
        "relative rounded-md border-2 bg-[#2b3036] p-2 transition-colors",
        visual === "fault-blink" && "mcc-blink",
        selected
          ? "border-sky-400"
          : visual.startsWith("fault")
            ? "border-red-500"
            : "border-[#4b535b]",
      )}
      data-testid={`mcc-motor-${motor.config.tag}`}
      data-state={drive?.runState ?? "UNKNOWN"}
      data-visual={visual}
    >
      <button
        type="button"
        onClick={() => {
          onSelect();
          onToggle();
        }}
        aria-pressed={drive?.runState === "RUNNING" || drive?.runState === "STARTING"}
        aria-label={`${motor.config.tag} ${stateText}. ${t(
          drive?.runState === "RUNNING" || drive?.runState === "STARTING"
            ? "mcc.clickToStop"
            : "mcc.clickToStart",
        )}`}
        className="flex w-full items-center gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <MotorSymbol visual={visual} spinning={spinning} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-sm font-bold text-white">{motor.config.tag}</span>
            <span className={cn("font-mono text-[10px] font-bold", c.text)}>{stateText}</span>
          </div>
          <div className="truncate text-[11px] text-zinc-400" title={motor.config.label}>
            {motor.config.label}
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1 font-mono text-[11px] text-zinc-200">
            <span title={t("mcc.current")}>{fmt(drive?.current_A ?? 0)} A</span>
            <span title={t("mcc.speedSensor")}>{fmt(drive?.sensorSpeed_rpm ?? 0, 0)} rpm</span>
            <span title={t("mcc.windingTemp")}>{fmt(drive?.sensorTemp_C ?? Number.NaN, 0)} °C</span>
          </div>
        </div>
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="mt-1 block w-full text-left"
        aria-label={t("mcc.detailsOf", { tag: motor.config.tag })}
      >
        <div
          className="h-1.5 w-full overflow-hidden rounded bg-zinc-700"
          title={t("mcc.thermalMemory")}
        >
          <div
            className={cn(
              "h-full",
              thetaPct >= 85 ? "bg-red-500" : thetaPct >= 60 ? "bg-amber-400" : "bg-sky-500",
            )}
            style={{ width: `${thetaPct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400">
          <span>
            {motor.config.power_kW} kW · {motor.config.startMethod} · {motor.io.commandOutput}
          </span>
          {!feederOk && <span className="font-bold text-amber-400">{t("mcc.noVoltage")}</span>}
          {drive?.fault && (
            <span className="truncate font-bold text-red-300">
              {t(`mcc.fs_${drive.fault.code}`)}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function MotorDetail({ motor, drive }: { motor: FleetMotor; drive: MotorDriveState | undefined }) {
  const { t } = useI18n();
  const injected = useMotorControlStore((s) => s.injected[motor.config.id] ?? "none");
  const injectFault = useMotorControlStore((s) => s.injectFault);
  const resetMotor = useMotorControlStore((s) => s.resetMotor);
  const ack = useMotorControlStore((s) => s.acknowledgeFault);
  const cfg = motor.config;
  const running = drive?.runState === "RUNNING" || drive?.runState === "STARTING";
  // Escala de AI S7: 0..27648 = 0..20 mA ↔ 0..2·In (transdutor dimensionado em 2·In).
  const rawCurrent = Math.round(Math.min(1, (drive?.current_A ?? 0) / (cfg.In_A * 2)) * 27648);
  const rawSpeed = Math.round(Math.min(1, (drive?.sensorSpeed_rpm ?? 0) / 1800) * 27648);

  return (
    <div className="space-y-3 text-xs text-zinc-300" data-testid="mcc-motor-detail">
      <div>
        <div className="font-mono text-base font-bold text-white">{cfg.tag}</div>
        <div className="text-zinc-400">{cfg.label}</div>
      </div>

      {drive?.fault && (
        <div className="rounded border border-red-500 bg-red-950/60 p-2" role="alert">
          <div className="flex items-center gap-1 font-bold text-red-300">
            <WarningOctagon size={14} weight="fill" /> {t(`mcc.f_${drive.fault.code}`)}
          </div>
          <div className="mt-1 text-red-200">{drive.fault.message}</div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => ack(cfg.id)}
              className="rounded bg-zinc-700 px-2 py-1 font-bold text-white hover:bg-zinc-600"
            >
              {t("mcc.acknowledge")}
            </button>
            <button
              type="button"
              onClick={() => resetMotor(cfg.id)}
              className="flex items-center gap-1 rounded bg-sky-700 px-2 py-1 font-bold text-white hover:bg-sky-600"
            >
              <ArrowCounterClockwise size={12} /> {t("mcc.reset")}
            </button>
          </div>
        </div>
      )}
      {drive && drive.warnings.length > 0 && (
        <div className="rounded border border-amber-500/60 bg-amber-950/40 p-2 text-amber-200">
          {drive.warnings.map((w) => (
            <div key={w}>
              ⚠{" "}
              {t(
                w === "HIGH_CURRENT"
                  ? "mcc.wHighCurrent"
                  : w === "HIGH_TEMPERATURE"
                    ? "mcc.wHighTemp"
                    : "mcc.wThermal",
              )}
            </div>
          ))}
        </div>
      )}

      <section>
        <h4 className="mb-1 font-bold uppercase tracking-wide text-zinc-400">
          {t("mcc.protections")}
        </h4>
        <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono">
          <dt>{t("mcc.ratedIn")}</dt>
          <dd>{fmt(cfg.In_A)} A</dd>
          <dt>{t("mcc.thermalIr")}</dt>
          <dd>
            {fmt(cfg.thermalSetting_A)} A · cl.{cfg.thermalClass}
          </dd>
          <dt>{t("mcc.tripAt72")}</dt>
          <dd>{fmt(thermalTripTime_s(7.2, cfg.thermalClass))} s</dd>
          <dt>{t("mcc.breaker")}</dt>
          <dd>
            {cfg.breakerIn_A} A {t("mcc.curve")} {cfg.breakerCurve}
          </dd>
          <dt>{t("mcc.magneticIm")}</dt>
          <dd>{Math.round(magneticTrip_A(cfg))} A</dd>
          <dt>{t("mcc.start")}</dt>
          <dd>{cfg.startMethod}</dd>
          <dt>{t("mcc.starts")}</dt>
          <dd>{drive?.starts ?? 0}</dd>
          <dt>{t("mcc.runHours")}</dt>
          <dd>{fmt((drive?.runSeconds ?? 0) / 3600, 3)} h</dd>
        </dl>
      </section>

      <section>
        <h4 className="mb-1 font-bold uppercase tracking-wide text-zinc-400">
          {t("mcc.plcImage")}
        </h4>
        <table className="w-full font-mono">
          <tbody>
            {[
              [motor.io.commandOutput, t("mcc.ioCoil"), running ? "1" : "0"],
              [motor.io.runFeedbackInput, t("mcc.ioAux"), drive?.contactorClosed ? "1" : "0"],
              [motor.io.faultInput, t("mcc.ioOl"), drive?.fault ? "1" : "0"],
              [motor.io.currentAnalogInput, t("mcc.ioCurrent"), String(rawCurrent)],
              [motor.io.speedAnalogInput, t("mcc.ioSpeed"), String(rawSpeed)],
            ].map(([addr, desc, val]) => (
              <tr key={addr} className="border-b border-zinc-800">
                <td className="py-0.5 text-sky-300">{addr}</td>
                <td className="py-0.5 text-zinc-400">{desc}</td>
                <td className="py-0.5 text-right text-white">{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-zinc-500">
          {t("mcc.fieldWrite")}:{" "}
          {MCC_FIELD_WRITE_ENABLED ? t("mcc.fieldEnabled") : t("mcc.fieldBlocked")}
        </p>
      </section>

      <section>
        <label
          className="mb-1 block font-bold uppercase tracking-wide text-zinc-400"
          htmlFor="mcc-inject"
        >
          {t("mcc.inject")}
        </label>
        <select
          id="mcc-inject"
          value={injected}
          onChange={(e) => injectFault(cfg.id, e.target.value as InjectedMotorFault)}
          className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-zinc-100"
        >
          {INJECTABLE.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.label)}
            </option>
          ))}
        </select>
      </section>

      {motor.issues.length > 0 && (
        <section className="rounded border border-amber-600/50 p-2 text-amber-200">
          <h4 className="mb-1 font-bold">{t("mcc.branchEng")}</h4>
          <ul className="list-disc pl-4">
            {motor.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function ScadaMotorsView() {
  const { t } = useI18n();
  const doc = useDiagramStore((s) => s.doc);
  const fleet = useMotorControlStore((s) => s.fleet);
  const drives = useMotorControlStore((s) => s.drives);
  const ticking = useMotorControlStore((s) => s.ticking);
  const timeScale = useMotorControlStore((s) => s.timeScale);
  const events = useMotorControlStore((s) => s.events);
  const acknowledged = useMotorControlStore((s) => s.acknowledged);
  const feederEnergized = useMotorControlStore((s) => s.feederEnergized);
  const busVoltage = useMotorControlStore((s) => s.busVoltage_V);
  const lastRejection = useMotorControlStore((s) => s.lastRejection);
  const actions = useMotorControlStore.getState();
  const emergencyLatched = useSafetyStore((s) => s.emergencyLatched);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    useMotorControlStore.getState().syncFromDiagram(doc);
  }, [doc]);

  // O laço de 100 ms vive no store: trocar de aba (ex.: Unifilar) NÃO para os motores.
  // Encerrar explicitamente devolve o unifilar ao estado de projeto.

  const counts = useMemo(() => {
    let on = 0;
    let faults = 0;
    let unack = 0;
    for (const m of fleet) {
      const d = drives[m.config.id];
      if (d?.runState === "RUNNING" || d?.runState === "STARTING") on++;
      if (d?.fault) faults++;
      if (isFaultUnacknowledged(d, acknowledged, m.config.id)) unack++;
    }
    return { on, faults, unack };
  }, [fleet, drives, acknowledged]);

  const selected = fleet.find((m) => m.config.id === selectedId) ?? fleet[0];

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[#3a4047] text-zinc-100"
      data-testid="scada-motors-view"
    >
      <style>{`
        @keyframes mcc-blink { 0%,49% { background-color:#7f1d1d; } 50%,100% { background-color:#2b3036; } }
        .mcc-blink { animation: mcc-blink 0.8s steps(1,end) infinite; }
        @keyframes mcc-spin { to { transform: rotate(360deg); } }
        .mcc-rotor { transform-origin: 32px 32px; animation: mcc-spin 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .mcc-blink { animation: none; background-image: repeating-linear-gradient(45deg,#7f1d1d 0 8px,#2b3036 8px 16px); }
          .mcc-rotor { animation: none; }
        }
      `}</style>

      <div
        className="flex items-center gap-2 border-b border-amber-600 bg-amber-500/90 px-3 py-1 text-[11px] font-bold text-black"
        role="status"
      >
        <Warning size={14} weight="fill" />
        {t("mcc.simBanner")}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-700 bg-[#2b3036] px-3 py-2">
        <span className="mr-2 font-mono text-sm font-bold tracking-wide">{t("mcc.title")}</span>
        <button
          type="button"
          onClick={() => actions.setTicking(!ticking)}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1 text-xs font-bold",
            ticking ? "bg-zinc-600 hover:bg-zinc-500" : "bg-green-700 hover:bg-green-600",
          )}
          data-testid="mcc-run-toggle"
        >
          {ticking ? <Pause size={14} /> : <Play size={14} />}
          {ticking ? t("mcc.pause") : t("mcc.run")}
        </button>
        <label className="flex items-center gap-1 text-xs">
          {t("mcc.time")}
          <select
            value={timeScale}
            onChange={(e) => actions.setTimeScale(Number(e.target.value) as MccTimeScale)}
            className="rounded border border-zinc-600 bg-zinc-900 px-1 py-0.5"
          >
            <option value={1}>{t("mcc.realTime")}</option>
            <option value={10}>10×</option>
            <option value={60}>60×</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs" title={t("mcc.undervoltageTest")}>
          {t("mcc.bus")}
          <input
            type="number"
            min={0}
            max={460}
            step={5}
            value={busVoltage}
            onChange={(e) => actions.setBusVoltage(Number(e.target.value))}
            className="w-16 rounded border border-zinc-600 bg-zinc-900 px-1 py-0.5 font-mono"
          />
          V
        </label>
        <button
          type="button"
          onClick={() => {
            actions.teardown();
            actions.syncFromDiagram(doc);
          }}
          className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600"
          title={t("mcc.endTitle")}
        >
          {t("mcc.end")}
        </button>
        <button
          type="button"
          onClick={actions.stopAll}
          className="flex items-center gap-1 rounded bg-zinc-600 px-2 py-1 text-xs font-bold hover:bg-zinc-500"
        >
          <Stop size={14} /> {t("mcc.stopAll")}
        </button>
        <button
          type="button"
          onClick={actions.acknowledgeAll}
          disabled={counts.unack === 0}
          className="flex items-center gap-1 rounded bg-zinc-600 px-2 py-1 text-xs font-bold hover:bg-zinc-500 disabled:opacity-40"
        >
          <CheckCircle size={14} /> {t("mcc.ackCount", { count: counts.unack })}
        </button>
        <button
          type="button"
          onClick={actions.resetAllFaults}
          disabled={counts.faults === 0}
          className="flex items-center gap-1 rounded bg-sky-700 px-2 py-1 text-xs font-bold hover:bg-sky-600 disabled:opacity-40"
        >
          <ArrowCounterClockwise size={14} /> {t("mcc.resetFaults")}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {emergencyLatched ? (
            <button
              type="button"
              onClick={() => useSafetyStore.getState().rearmEmergency("Operador CCM")}
              className="rounded border-2 border-red-500 bg-zinc-800 px-2 py-1 text-xs font-bold text-red-300"
            >
              {t("mcc.rearmEstop")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                useSafetyStore.getState().triggerEmergency({
                  source: "CCM supervisório",
                  reason: "SIMULATION_HALT acionado pelo operador",
                })
              }
              className="rounded-full border-4 border-yellow-400 bg-red-600 px-3 py-1 text-xs font-black text-white hover:bg-red-500"
              title={t("mcc.estopTitle")}
            >
              E-STOP SIM
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 border-b border-zinc-700 bg-[#30363c] px-3 py-1 font-mono text-[11px]">
        <span>{t("mcc.motors", { count: fleet.length })}</span>
        <span className="text-green-300">{t("mcc.on", { count: counts.on })}</span>
        <span className={counts.faults ? "font-bold text-red-300" : ""}>
          {t("mcc.faulted", { count: counts.faults })}
        </span>
        {lastRejection && (
          <span className="flex items-center gap-1 text-amber-300" role="alert">
            <Lightning size={12} weight="fill" />
            {lastRejection.reason}
            <button type="button" className="underline" onClick={actions.clearRejection}>
              ok
            </button>
          </span>
        )}
      </div>

      {fleet.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-md text-sm text-zinc-300">{t("mcc.empty")}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {/* Barramento CCM */}
            <div className="mb-3 flex items-center gap-2">
              <div
                className={cn(
                  "h-2 flex-1 rounded",
                  // 323 V = 85 % de 380 V (limiar de subtensão do motor de proteção).
                  !ticking || emergencyLatched || busVoltage < 323 ? "bg-zinc-500" : "bg-green-500",
                )}
              />
              <span className="font-mono text-[11px] text-zinc-300">
                {t("mcc.busLabel")} {busVoltage} V {emergencyLatched ? "· E-STOP" : ""}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
              {fleet.map((m) => (
                <MotorTile
                  key={m.config.id}
                  motor={m}
                  drive={drives[m.config.id]}
                  unack={isFaultUnacknowledged(drives[m.config.id], acknowledged, m.config.id)}
                  selected={selected?.config.id === m.config.id}
                  feederOk={feederEnergized[m.config.id] ?? true}
                  onToggle={() => actions.toggleMotor(m.config.id)}
                  onSelect={() => setSelectedId(m.config.id)}
                />
              ))}
            </div>

            <section className="mt-4">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-400">
                {t("mcc.soe")}
              </h3>
              <ol className="max-h-48 overflow-y-auto rounded bg-[#2b3036] p-2 font-mono text-[11px]">
                {events.length === 0 && <li className="text-zinc-500">{t("mcc.noEvents")}</li>}
                {[...events]
                  .reverse()
                  .slice(0, 60)
                  .map((e, i) => (
                    <li
                      key={`${e.t}-${e.motorId}-${e.kind}-${i}`}
                      className={cn(
                        e.kind === "trip"
                          ? "text-red-300"
                          : e.kind === "start_rejected"
                            ? "text-amber-300"
                            : e.kind === "running"
                              ? "text-green-300"
                              : "text-zinc-300",
                      )}
                    >
                      t={e.t.toFixed(1)} s · {e.message}
                    </li>
                  ))}
              </ol>
            </section>
          </div>
          <aside className="max-h-[45%] w-full shrink-0 overflow-y-auto border-t border-zinc-700 bg-[#2b3036] p-3 md:max-h-none md:w-80 md:border-l md:border-t-0">
            {selected && <MotorDetail motor={selected} drive={drives[selected.config.id]} />}
          </aside>
        </div>
      )}
    </div>
  );
}
