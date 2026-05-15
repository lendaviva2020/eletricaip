import { create } from "zustand";
import { z } from "zod";
import {
  createVoltaiDefaultState,
  getVoltaiFactoryParams,
  VOLTAI_COMPONENT_BY_TYPE,
  type VoltaiComponentType,
  type VoltaiSimulationState,
} from "./component-definitions";

export interface VoltaiDiagramComponent {
  id: string;
  type: VoltaiComponentType;
  label: string;
  position: { x: number; y: number };
  params: Record<string, unknown>;
  simulationState: VoltaiSimulationState;
}

export interface VoltaiDiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  role: "power" | "control" | "signal" | "neutral";
}

interface VoltaiStore {
  components: VoltaiDiagramComponent[];
  edges: VoltaiDiagramEdge[];
  selectedId: string | null;
  lastSimulationJson: string;
  dirty: boolean;
  addComponent: (type: VoltaiComponentType, position: { x: number; y: number }) => string;
  updateComponentParam: (id: string, key: string, value: unknown) => void;
  restoreFactoryParams: (id: string) => void;
  updateComponentPosition: (id: string, position: { x: number; y: number }) => void;
  selectComponent: (id: string | null) => void;
  addEdge: (edge: Omit<VoltaiDiagramEdge, "id">) => void;
  simulateStep: (stepMs: number) => void;
  setAll: (components: VoltaiDiagramComponent[], edges: VoltaiDiagramEdge[]) => void;
  markSaved: () => void;
}

const SimulationPayloadSchema = z.object({
  ts: z.number(),
  cycleMs: z.number(),
  components: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      label: z.string(),
      state: z.record(z.unknown()),
    }),
  ),
});

const COMPACT_STATE_KEYS: Record<string, string> = {
  energized: "en",
  tripped: "tr",
  open: "op",
  failed: "fl",
  blown: "bl",
  running: "rn",
  currentA: "i",
  voltageV: "v",
  elapsedMs: "t",
  thermalMs: "th",
  i2tA2s: "i2t",
  coilEnergized: "ce",
  contactClosed: "cc",
  count: "ct",
  output: "out",
  alarm: "al",
  timerMode: "tm",
  pulseRemainingMs: "pr",
};

const counters: Partial<Record<VoltaiComponentType, number>> = {};
const nextId = (type: VoltaiComponentType) => {
  counters[type] = (counters[type] ?? 0) + 1;
  return `${VOLTAI_COMPONENT_BY_TYPE[type].tagPrefix}-${String(counters[type]).padStart(2, "0")}`;
};

const asNumber = (value: unknown, fallback: number) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").match(/[\d.]+/)?.[0]);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};

const curveMagneticMultiplier = (curve: unknown) => {
  if (curve === "B") return 5;
  if (curve === "D") return 20;
  return 10;
};

function serializeSimulationPayload(components: VoltaiDiagramComponent[], stepMs: number) {
  const payload = SimulationPayloadSchema.parse({
    ts: Date.now(),
    cycleMs: stepMs,
    components: components.map((component) => ({
      id: component.id,
      type: component.type,
      label: component.label,
      state: component.simulationState,
    })),
  });
  let json = JSON.stringify(payload);
  if (json.length <= 10_240) return json;

  const compact = {
    ts: payload.ts,
    ms: payload.cycleMs,
    c: payload.components.map((component) => ({
      id: component.id,
      ty: component.type,
      lb: component.label,
      st: Object.fromEntries(
        Object.entries(component.state).map(([key, value]) => [
          COMPACT_STATE_KEYS[key] ?? key,
          value,
        ]),
      ),
    })),
  };
  json = JSON.stringify(compact);
  z.string().min(1).parse(json);
  return json;
}

function simulateComponent(
  component: VoltaiDiagramComponent,
  stepMs: number,
): VoltaiDiagramComponent {
  const params = component.params;
  const state = {
    ...component.simulationState,
    elapsedMs: component.simulationState.elapsedMs + stepMs,
  };
  const stepSeconds = stepMs / 1000;

  if (component.type === "QF" || component.type === "MCB_AUX") {
    const ratedCurrent = asNumber(params.ratedCurrent, 100);
    const thermalLimit = ratedCurrent * ratedCurrent * asNumber(params.thermalDelay, 300);
    const magneticMultiplier =
      component.type === "MCB_AUX" ? 5 : curveMagneticMultiplier(params.curve);

    if (state.currentA > ratedCurrent * magneticMultiplier) {
      state.tripped = true;
      state.open = true;
      state.alarm = "Disparo magnetico instantaneo";
    } else if (state.currentA > ratedCurrent * 1.13) {
      state.thermalMs = (state.thermalMs ?? 0) + stepMs;
      state.i2tA2s = (state.i2tA2s ?? 0) + state.currentA * state.currentA * stepSeconds;
      if (state.i2tA2s > thermalLimit) {
        state.tripped = true;
        state.open = true;
        state.alarm = "Disparo termico I2t por sobrecarga";
      }
    } else {
      state.thermalMs = 0;
      state.i2tA2s = Math.max(0, (state.i2tA2s ?? 0) - ratedCurrent * ratedCurrent * stepSeconds);
    }
  }

  if (component.type === "FU") {
    state.i2tA2s = (state.i2tA2s ?? 0) + state.currentA * state.currentA * stepSeconds;
    if (state.i2tA2s > asNumber(params.i2t, 200)) {
      state.blown = true;
      state.failed = true;
      state.alarm = "Fusivel rompido por I2t";
    }
  }

  if (component.type === "KM" || component.type === "KA" || component.type === "CR") {
    const pullIn = asNumber(params.pullInTime, 20);
    const dropOut = asNumber(params.dropOutTime, 10);
    if (state.coilEnergized) {
      state.contactClosed = state.elapsedMs >= pullIn;
    } else if (state.elapsedMs >= dropOut) {
      state.contactClosed = false;
    }
  }

  if (component.type === "M") {
    const ratedCurrent = asNumber(params.ratedCurrent, 14.5);
    const startingTimeMs = asNumber(params.startingTime, 8) * 1000;
    const ratio = asNumber(params.startingCurrentRatio, 6.5);
    state.running = state.energized && !state.failed;
    state.currentA =
      state.running && state.elapsedMs < startingTimeMs
        ? ratedCurrent * ratio
        : state.running
          ? ratedCurrent
          : 0;
  }

  if (component.type === "FR" || component.type === "MPCB") {
    const ratedCurrent = asNumber(params.ratedCurrent, 10);
    const tripClassMs = asNumber(params.tripClass, 10) * 1000;
    if (state.currentA > ratedCurrent * 1.2) {
      state.thermalMs = (state.thermalMs ?? 0) + stepMs;
      if (state.thermalMs > tripClassMs) {
        state.tripped = true;
        state.alarm = "Sobrecarga conforme classe de disparo";
      }
    }
  }

  if (component.type === "KT") {
    const setTimeMs = asNumber(params.setTime, 5) * 1000;
    const pulseDurationMs = asNumber(params.pulseDuration, 0.5) * 1000;
    const input = !!state.energized;
    const wasInput = !!state.lastInput;
    const elapsed = input === wasInput ? state.elapsedMs : 0;
    state.elapsedMs = elapsed;
    state.lastInput = input;

    if (params.pulseMode || params.function === "intervalo") {
      if (input && !wasInput) state.pulseRemainingMs = pulseDurationMs;
      state.pulseRemainingMs = Math.max(0, (state.pulseRemainingMs ?? 0) - stepMs);
      state.contactClosed = (state.pulseRemainingMs ?? 0) > 0;
      state.timerMode = state.contactClosed ? "pulse" : "idle";
    } else if (params.function === "off-delay") {
      if (input) {
        state.contactClosed = true;
        state.timerMode = "done";
      } else {
        state.contactClosed = elapsed < setTimeMs;
        state.timerMode = state.contactClosed ? "timing" : "idle";
      }
    } else {
      state.contactClosed = input && elapsed >= setTimeMs;
      state.timerMode = state.contactClosed ? "done" : input ? "timing" : "idle";
    }
  }

  if (component.type === "CT") {
    const preset = asNumber(params.preset, 100);
    const input = !!state.energized;
    const rising = input && !state.lastCountInput;
    if (rising) {
      state.count =
        params.countDirection === "down"
          ? Math.max(0, (state.count ?? preset) - 1)
          : (state.count ?? 0) + 1;
    }
    state.lastCountInput = input;
    state.output =
      params.countDirection === "down"
        ? (state.count ?? preset) <= 0
        : (state.count ?? 0) >= preset;
  }

  if (component.type === "UPS" && !state.energized) {
    state.batteryRemainingMin = Math.max(
      0,
      (state.batteryRemainingMin ?? asNumber(params.batteryAutonomy, 15)) - stepMs / 60000,
    );
    state.failed = state.batteryRemainingMin <= 0;
  }

  return { ...component, simulationState: state };
}

export const useVoltaiStore = create<VoltaiStore>((set) => ({
  components: [],
  edges: [],
  selectedId: null,
  lastSimulationJson: "",
  dirty: false,
  addComponent: (type, position) => {
    const definition = VOLTAI_COMPONENT_BY_TYPE[type];
    const id = nextId(type);
    set((store) => ({
      components: [
        ...store.components,
        {
          id,
          type,
          label: id,
          position,
          params: getVoltaiFactoryParams(type),
          simulationState: createVoltaiDefaultState(type),
        },
      ],
      selectedId: id,
      dirty: true,
    }));
    return id;
  },
  updateComponentParam: (id, key, value) =>
    set((store) => ({
      components: store.components.map((component) =>
        component.id === id
          ? { ...component, params: { ...component.params, [key]: value } }
          : component,
      ),
      dirty: true,
    })),
  restoreFactoryParams: (id) =>
    set((store) => ({
      components: store.components.map((component) =>
        component.id === id
          ? {
              ...component,
              params: getVoltaiFactoryParams(component.type),
              simulationState: createVoltaiDefaultState(component.type),
            }
          : component,
      ),
      dirty: true,
    })),
  updateComponentPosition: (id, position) =>
    set((store) => ({
      components: store.components.map((component) =>
        component.id === id ? { ...component, position } : component,
      ),
      dirty: true,
    })),
  selectComponent: (id) => set({ selectedId: id }),
  addEdge: (edge) =>
    set((store) => ({
      edges: [...store.edges, { ...edge, id: `ve-${Date.now()}-${store.edges.length}` }],
      dirty: true,
    })),
  simulateStep: (stepMs) =>
    set((store) => {
      const components = store.components.map((component) => simulateComponent(component, stepMs));
      return {
        components,
        lastSimulationJson: serializeSimulationPayload(components, stepMs),
      };
    }),
  setAll: (components, edges) => set({ components, edges, selectedId: null, dirty: false }),
  markSaved: () => set({ dirty: false }),
}));
