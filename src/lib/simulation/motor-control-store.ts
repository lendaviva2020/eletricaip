// Store do CCM supervisório (Centro de Controle de Motores) — zustand EFÊMERO.
//
// Sem persist: telemetria de 100 ms não polui o snapshot do projeto nem dispara
// autosave (AGENTS.md §11.1 item 5). A frota vem do unifilar (motor-fleet.ts);
// o estado de manobra é ESPELHADO de volta no unifilar via `deviceStates` do
// editor — clicar no motor fecha o contator no canvas e o curto abre o
// disjuntor, energizando/desenergizando os condutores a jusante.
//
// Fronteira de segurança (NR-10/NR-12, AGENTS.md §9 item 21 e §11.1 item 2):
// todos os comandos aqui são SIMULATION_HALT/simulação. Nenhuma escrita em
// campo é feita por este store — `fieldWriteEnabled` é constante `false`.
import { create } from "zustand";
import type { DiagramDoc } from "@/lib/diagram/schema";
import { computeCircuitEnergization } from "@/lib/diagram/electrical-simulation";
import { useEditorStore } from "@/lib/editor/store";
import { useDiagramStore } from "@/lib/diagram/store";
import { useSafetyStore } from "@/lib/simulation/safety-core";
import {
  createMotorDriveState,
  resetMotorFault,
  startPermissive,
  stepMotorDrive,
  type InjectedMotorFault,
  type MotorDriveState,
  type MotorEvent,
} from "./motor-protection-engine";
import { buildMotorFleet, type FleetMotor } from "./motor-fleet";

export const MCC_TICK_MS = 100;
const MAX_EVENTS = 200;
export const MCC_FIELD_WRITE_ENABLED = false as const;

export type MccTimeScale = 1 | 10 | 60;

export interface MccRejection {
  motorId: string;
  reason: string;
  at: number;
}

interface MotorControlState {
  fleet: FleetMotor[];
  drives: Record<string, MotorDriveState>;
  commands: Record<string, boolean>;
  injected: Record<string, InjectedMotorFault>;
  feederEnergized: Record<string, boolean>;
  busVoltage_V: number;
  t: number;
  ticking: boolean;
  timeScale: MccTimeScale;
  events: MotorEvent[];
  lastRejection: MccRejection | null;
  /** ISA-18.2: falha reconhecida (motorId → carimbo `t` da falha). Pisca até reconhecer. */
  acknowledged: Record<string, number>;
  /** Documento de origem (referência) — evita reconstruir a frota sem mudança. */
  sourceDoc: DiagramDoc | null;

  syncFromDiagram: (doc: DiagramDoc) => void;
  setTicking: (on: boolean) => void;
  setTimeScale: (s: MccTimeScale) => void;
  setBusVoltage: (v: number) => void;
  tick: (dtOverride_s?: number) => void;
  toggleMotor: (motorId: string) => void;
  commandMotor: (motorId: string, run: boolean) => void;
  stopAll: () => void;
  resetMotor: (motorId: string) => void;
  resetAllFaults: () => void;
  injectFault: (motorId: string, fault: InjectedMotorFault) => void;
  clearRejection: () => void;
  acknowledgeFault: (motorId: string) => void;
  acknowledgeAll: () => void;
  teardown: () => void;
}

function pushEvents(prev: MotorEvent[], next: MotorEvent[]): MotorEvent[] {
  if (next.length === 0) return prev;
  const merged = [...prev, ...next];
  return merged.length > MAX_EVENTS ? merged.slice(merged.length - MAX_EVENTS) : merged;
}

// Cache de energização: BFS + diagnósticos normativos só quando doc ou manobras mudam.
let energizationCache: {
  doc: DiagramDoc | null;
  deviceStates: Record<string, boolean> | null;
  emergency: boolean;
  result: Record<string, boolean>;
} = { doc: null, deviceStates: null, emergency: false, result: {} };

function computeFeederEnergization(doc: DiagramDoc, fleet: FleetMotor[]): Record<string, boolean> {
  const deviceStates = useEditorStore.getState().deviceStates;
  const emergency = useSafetyStore.getState().emergencyLatched;
  if (
    energizationCache.doc === doc &&
    energizationCache.deviceStates === deviceStates &&
    energizationCache.emergency === emergency
  ) {
    return energizationCache.result;
  }
  const result: Record<string, boolean> = {};
  try {
    const en = computeCircuitEnergization(doc, "running", deviceStates);
    const hasAnyPowerEdge = Object.values(doc.edges).some((e) => e.kind === "power");
    for (const m of fleet) {
      // O lado de linha do primeiro dispositivo de manobra do ramal define se há tensão.
      const probe = m.chain.contactorId ?? m.chain.driveId ?? m.nodeId;
      // Motor sem nenhuma ligação de potência: considerado alimentado por barramento
      // implícito, mas a falta de topologia é sinalizada em `issues` pela frota.
      result[m.config.id] = hasAnyPowerEdge ? en.energizedNodeIds.has(probe) : !emergency;
    }
  } catch (err) {
    // Falha de avaliação nunca deve energizar silenciosamente: fail-safe = desenergizado.
    console.error("[CCM] Falha ao avaliar energização do unifilar:", err);
    for (const m of fleet) result[m.config.id] = false;
  }
  energizationCache = { doc, deviceStates, emergency, result };
  return result;
}

/** Espelha contatores/disjuntores no unifilar (só escreve quando muda). */
function mirrorToUnifilar(fleet: FleetMotor[], drives: Record<string, MotorDriveState>): void {
  const editor = useEditorStore.getState();
  const patch: Record<string, boolean> = {};
  for (const m of fleet) {
    const d = drives[m.config.id];
    if (!d) continue;
    if (m.chain.contactorId && editor.deviceStates[m.chain.contactorId] !== d.contactorClosed) {
      patch[m.chain.contactorId] = d.contactorClosed;
    }
    if (m.chain.breakerId && (editor.deviceStates[m.chain.breakerId] ?? true) !== d.breakerClosed) {
      patch[m.chain.breakerId] = d.breakerClosed;
    }
  }
  if (Object.keys(patch).length > 0) {
    useEditorStore.setState((s) => ({ deviceStates: { ...s.deviceStates, ...patch } }));
  }
}

// Laço e assinatura vivem no MÓDULO, não no componente: o operador liga um motor
// no CCM, troca para a aba Unifilar e continua vendo o ramal energizado.
let tickTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeDiagram: (() => void) | null = null;

function startLoop(): void {
  if (tickTimer === null) {
    tickTimer = setInterval(() => useMotorControlStore.getState().tick(), MCC_TICK_MS);
  }
  if (unsubscribeDiagram === null) {
    // Edição ao vivo do unifilar (novo motor, disjuntor trocado) reflete no CCM.
    unsubscribeDiagram = useDiagramStore.subscribe(
      (st) => st.doc,
      (doc) => useMotorControlStore.getState().syncFromDiagram(doc),
    );
  }
}

function stopLoop(): void {
  if (tickTimer !== null) clearInterval(tickTimer);
  tickTimer = null;
  unsubscribeDiagram?.();
  unsubscribeDiagram = null;
}

export const useMotorControlStore = create<MotorControlState>((set, get) => ({
  fleet: [],
  drives: {},
  commands: {},
  injected: {},
  feederEnergized: {},
  busVoltage_V: 380,
  t: 0,
  ticking: false,
  timeScale: 1,
  events: [],
  lastRejection: null,
  acknowledged: {},
  sourceDoc: null,

  syncFromDiagram: (doc) => {
    if (get().sourceDoc === doc) return;
    const fleet = buildMotorFleet(doc);
    const prev = get();
    const drives: Record<string, MotorDriveState> = {};
    const commands: Record<string, boolean> = {};
    const injected: Record<string, InjectedMotorFault> = {};
    for (const m of fleet) {
      const id = m.config.id;
      // Preserva o estado de motores que continuam no diagrama (edição ao vivo).
      drives[id] = prev.drives[id] ?? createMotorDriveState(m.config);
      commands[id] = prev.commands[id] ?? false;
      injected[id] = prev.injected[id] ?? "none";
    }
    set({ fleet, drives, commands, injected, sourceDoc: doc });
  },

  setTicking: (on) => {
    if (on) {
      const check = useSafetyStore.getState().canStartSimulation();
      if (!check.allowed) {
        set({
          ticking: false,
          lastRejection: { motorId: "*", reason: check.reason ?? "Bloqueado", at: get().t },
        });
        return;
      }
      // Liga a simulação elétrica do unifilar para colorir condutores energizados.
      useEditorStore.getState().setSimulationStatus("running");
      useMotorControlStore.getState().syncFromDiagram(useDiagramStore.getState().doc);
      startLoop();
    } else {
      // Pausa congela a física mas mantém a assinatura do diagrama.
      if (tickTimer !== null) clearInterval(tickTimer);
      tickTimer = null;
    }
    set({ ticking: on });
  },
  setTimeScale: (timeScale) => set({ timeScale }),
  setBusVoltage: (v) =>
    set({ busVoltage_V: Number.isFinite(v) ? Math.max(0, Math.min(v, 1000)) : 0 }),

  tick: (dtOverride_s) => {
    const s = get();
    if (!s.ticking && dtOverride_s === undefined) return;
    if (!s.sourceDoc) return;
    const dt = (dtOverride_s ?? MCC_TICK_MS / 1000) * s.timeScale;
    const emergency = useSafetyStore.getState().emergencyLatched;
    // Sub-passos de no máx. 0,1 s preservam a estabilidade numérica em 10×/60×.
    const steps = Math.max(1, Math.ceil(dt / 0.1));
    const h = dt / steps;
    let drives = s.drives;
    let commands = s.commands;
    let t = s.t;
    const newEvents: MotorEvent[] = [];
    // E-STOP derruba todos os comandos: após o rearme NÃO há religamento automático.
    if (emergency && Object.values(commands).some(Boolean)) {
      commands = Object.fromEntries(Object.keys(commands).map((k) => [k, false]));
    }
    for (let i = 0; i < steps; i++) {
      t += h;
      const feeder = computeFeederEnergization(s.sourceDoc, s.fleet);
      const nextDrives: Record<string, MotorDriveState> = {};
      for (const m of s.fleet) {
        const id = m.config.id;
        const prev = drives[id] ?? createMotorDriveState(m.config);
        const r = stepMotorDrive(
          prev,
          m.config,
          {
            commandRun: commands[id] ?? false,
            feederEnergized: feeder[id] ?? false,
            busVoltage_V: s.busVoltage_V,
            emergencyStop: emergency,
            injected: s.injected[id] ?? "none",
          },
          h,
          t,
        );
        nextDrives[id] = r.state;
        // Disparo derruba o selo do comando (contato 95-96 abre o circuito de comando).
        if (r.state.fault && commands[id]) commands = { ...commands, [id]: false };
        newEvents.push(...r.events);
      }
      drives = nextDrives;
      mirrorToUnifilar(s.fleet, drives);
      if (i === steps - 1) set({ feederEnergized: feeder });
    }
    set({ drives, commands, t, events: pushEvents(s.events, newEvents) });
  },

  toggleMotor: (motorId) => {
    const s = get();
    const d = s.drives[motorId];
    if (!d) return;
    const running = s.commands[motorId] || d.runState === "STARTING" || d.runState === "RUNNING";
    get().commandMotor(motorId, !running);
  },

  commandMotor: (motorId, run) => {
    const s = get();
    const m = s.fleet.find((f) => f.config.id === motorId);
    const d = s.drives[motorId];
    if (!m || !d) return;
    if (!run) {
      set({ commands: { ...s.commands, [motorId]: false }, lastRejection: null });
      return;
    }
    if (!s.ticking) {
      set({
        lastRejection: {
          motorId,
          reason: "Simulação parada — inicie o supervisório (▶) para comandar motores",
          at: s.t,
        },
      });
      return;
    }
    const feeder = s.sourceDoc ? computeFeederEnergization(s.sourceDoc, s.fleet) : {};
    const permissive = startPermissive(
      d,
      {
        feederEnergized: feeder[motorId] ?? false,
        busVoltage_V: s.busVoltage_V,
        emergencyStop: useSafetyStore.getState().emergencyLatched,
      },
      m.config,
    );
    if (!permissive.allowed) {
      const reason = permissive.reason ?? "Partida bloqueada";
      set({
        lastRejection: { motorId, reason, at: s.t },
        events: pushEvents(s.events, [
          { t: s.t, motorId, kind: "start_rejected", message: `${m.config.tag} — ${reason}` },
        ]),
      });
      return;
    }
    set({ commands: { ...s.commands, [motorId]: true }, lastRejection: null });
  },

  stopAll: () =>
    set((s) => ({
      commands: Object.fromEntries(Object.keys(s.commands).map((k) => [k, false])),
    })),

  resetMotor: (motorId) => {
    const s = get();
    const m = s.fleet.find((f) => f.config.id === motorId);
    const d = s.drives[motorId];
    if (!m || !d) return;
    const r = resetMotorFault(d, m.config, s.injected[motorId] ?? "none", s.t);
    if (!r.ok) {
      set({ lastRejection: { motorId, reason: r.reason ?? "Rearme bloqueado", at: s.t } });
      return;
    }
    const drives = { ...s.drives, [motorId]: r.state };
    mirrorToUnifilar(s.fleet, drives);
    set({
      drives,
      lastRejection: null,
      events: r.event ? pushEvents(s.events, [r.event]) : s.events,
    });
  },

  resetAllFaults: () => {
    for (const m of get().fleet) {
      if (get().drives[m.config.id]?.fault) get().resetMotor(m.config.id);
    }
  },

  injectFault: (motorId, fault) => set((s) => ({ injected: { ...s.injected, [motorId]: fault } })),
  clearRejection: () => set({ lastRejection: null }),
  acknowledgeFault: (motorId) =>
    set((s) => {
      const f = s.drives[motorId]?.fault;
      return f ? { acknowledged: { ...s.acknowledged, [motorId]: f.t } } : {};
    }),
  acknowledgeAll: () =>
    set((s) => {
      const acknowledged = { ...s.acknowledged };
      for (const [id, d] of Object.entries(s.drives)) if (d.fault) acknowledged[id] = d.fault.t;
      return { acknowledged };
    }),

  teardown: () => {
    stopLoop();
    const { fleet } = get();
    // Devolve contatores/disjuntores do unifilar ao estado de projeto (fechados/padrão).
    const editor = useEditorStore.getState();
    const next = { ...editor.deviceStates };
    for (const m of fleet) {
      if (m.chain.contactorId) delete next[m.chain.contactorId];
      if (m.chain.breakerId) delete next[m.chain.breakerId];
    }
    useEditorStore.setState({ deviceStates: next });
    energizationCache = { doc: null, deviceStates: null, emergency: false, result: {} };
    set({
      fleet: [],
      drives: {},
      commands: {},
      injected: {},
      feederEnergized: {},
      t: 0,
      ticking: false,
      events: [],
      lastRejection: null,
      acknowledged: {},
      sourceDoc: null,
    });
  },
}));

/** Falha ativa ainda não reconhecida pelo operador (deve piscar). */
export function isFaultUnacknowledged(
  drive: MotorDriveState | undefined,
  acknowledged: Record<string, number>,
  motorId: string,
): boolean {
  return !!drive?.fault && acknowledged[motorId] !== drive.fault.t;
}

/** Tags de processo derivadas (para alarmes/tendências do supervisório). */
export function mccProcessTags(
  fleet: FleetMotor[],
  drives: Record<string, MotorDriveState>,
): Record<string, number | boolean> {
  const tags: Record<string, number | boolean> = {};
  for (const m of fleet) {
    const d = drives[m.config.id];
    if (!d) continue;
    const tag = m.config.tag;
    tags[`${tag}_RUN`] = d.runState === "RUNNING" || d.runState === "STARTING";
    tags[`${tag}_FAULT`] = d.fault !== null;
    tags[`${tag}_CURRENT_A`] = Math.round(d.current_A * 10) / 10;
    tags[`${tag}_SPEED_RPM`] = Math.round(d.sensorSpeed_rpm);
    tags[`${tag}_TEMP_C`] = Number.isFinite(d.sensorTemp_C)
      ? Math.round(d.sensorTemp_C * 10) / 10
      : -999;
  }
  return tags;
}
