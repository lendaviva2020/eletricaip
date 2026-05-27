// Industrial project store — manages nodes, edges, tags, logs, and runtime state
import { create } from "zustand";

export type NodeCategory = "power" | "mech" | "inst" | "logic";

export type NodeKind =
  // power
  | "breaker"
  | "contactor"
  | "relay"
  | "transformer"
  | "vfd"
  | "softstarter"
  | "psu"
  | "busbar"
  | "ccm"
  // mech
  | "motor"
  | "conveyor"
  | "screw"
  | "valve"
  | "pump"
  | "tank"
  | "reactor"
  | "cylinder"
  | "pipe"
  // inst
  | "pt100"
  | "pressure"
  | "flow"
  | "level"
  | "estop"
  | "lightcurtain"
  | "encoder"
  // logic
  | "pid"
  | "scale"
  | "ai"
  | "ao"
  | "di"
  | "do"
  // HMI widgets
  | "gauge"
  | "display"
  | "trend"
  | "button"
  | "switch"
  | "slider"
  | "input"
  | "alarm_banner"
  | "alarm_table"
  | "label";

export interface IndustrialNode {
  id: string;
  kind: NodeKind;
  category: NodeCategory;
  label: string;
  position: { x: number; y: number };
  params: Record<string, string | number | boolean>;
  energized?: boolean;
}

export interface IndustrialEdge {
  id: string;
  source: string;
  target: string;
  kind: "power" | "signal" | "pipe";
}

export interface KindCatalogEntry {
  kind: NodeKind;
  category: NodeCategory;
  label: string;
  defaults?: Record<string, string | number | boolean>;
}

export const KIND_CATALOG: Record<string, KindCatalogEntry> = {
  // HMI Widgets
  Gauge: {
    kind: "gauge",
    category: "inst",
    label: "HMI Gauge",
    defaults: { tag: "TANQUE_NIVEL", min: 0, max: 100 },
  },
  "Numeric Display": {
    kind: "display",
    category: "inst",
    label: "HMI Display",
    defaults: { tag: "TEMP_M01", unit: "°C" },
  },
  "Level Indicator": {
    kind: "level",
    category: "inst",
    label: "HMI Level",
    defaults: { tag: "TANQUE_NIVEL" },
  },
  Trend: { kind: "trend", category: "inst", label: "HMI Trend", defaults: { tag: "TEMP_M01" } },
  Button: {
    kind: "button",
    category: "logic",
    label: "HMI Button",
    defaults: { tag: "CMD_START", labelText: "Ligar" },
  },
  Switch: {
    kind: "switch",
    category: "logic",
    label: "HMI Switch",
    defaults: { tag: "AUTO_MAN", labelText: "Auto" },
  },
  Slider: {
    kind: "slider",
    category: "logic",
    label: "HMI Slider",
    defaults: { tag: "SP_SPEED", min: 0, max: 100 },
  },
  "Input Field": {
    kind: "input",
    category: "logic",
    label: "HMI Input",
    defaults: { tag: "SP_TEMP", value: 50 },
  },
  "Alarm Banner": {
    kind: "alarm_banner",
    category: "logic",
    label: "HMI Alarm Banner",
    defaults: {},
  },
  "Alarm Table": { kind: "alarm_table", category: "logic", label: "HMI Alarm Table", defaults: {} },
  Motor: { kind: "motor", category: "mech", label: "HMI Motor", defaults: { tag: "MOTOR_ON" } },
  Pipe: { kind: "pipe", category: "mech", label: "HMI Pipe", defaults: {} },
  Texto: {
    kind: "label",
    category: "logic",
    label: "HMI Texto",
    defaults: { text: "SCADA Screen" },
  },
  Disjuntor: {
    kind: "breaker",
    category: "power",
    label: "Disjuntor",
    defaults: { In: "63A", Icc: "10kA" },
  },
  Contator: { kind: "contactor", category: "power", label: "Contator", defaults: { In: "32A" } },
  Relé: { kind: "relay", category: "power", label: "Relé térmico", defaults: { faixa: "10-16A" } },
  Transformador: {
    kind: "transformer",
    category: "power",
    label: "Trafo",
    defaults: { S: "1500kVA", U: "13.8/0.38kV" },
  },
  "Inversor VFD": {
    kind: "vfd",
    category: "power",
    label: "Inversor VFD",
    defaults: { P: "7.5kW", rampa: "3s" },
  },
  "Soft-Starter": {
    kind: "softstarter",
    category: "power",
    label: "Soft-Starter",
    defaults: { P: "11kW" },
  },
  "Fonte 24V": { kind: "psu", category: "power", label: "Fonte 24Vcc", defaults: { I: "10A" } },
  QGBT: { kind: "busbar", category: "power", label: "QGBT", defaults: { U: "380V", I: "2500A" } },
  CCM: { kind: "ccm", category: "power", label: "CCM", defaults: { colunas: 6 } },
  "Motor 3F": {
    kind: "motor",
    category: "mech",
    label: "Motor 3F",
    defaults: { P: "7.5kW", U: "380V", IN: "16A" },
  },
  Esteira: { kind: "conveyor", category: "mech", label: "Esteira", defaults: { v: "1.2 m/s" } },
  Rosca: { kind: "screw", category: "mech", label: "Rosca", defaults: { Q: "8 t/h" } },
  Válvula: {
    kind: "valve",
    category: "mech",
    label: "Válvula",
    defaults: { tipo: "globo", pos: "0%" },
  },
  Bomba: { kind: "pump", category: "mech", label: "Bomba", defaults: { Q: "120 m³/h" } },
  Tanque: {
    kind: "tank",
    category: "mech",
    label: "Tanque",
    defaults: { V: "20 m³", nivel: "50%" },
  },
  Reator: { kind: "reactor", category: "mech", label: "Reator", defaults: { T: "82°C" } },
  Cilindro: { kind: "cylinder", category: "mech", label: "Cilindro", defaults: { curso: "200mm" } },
  "Sensor PT100": {
    kind: "pt100",
    category: "inst",
    label: "PT100",
    defaults: { faixa: "-50..200°C" },
  },
  Pressão: {
    kind: "pressure",
    category: "inst",
    label: "Pressão",
    defaults: { faixa: "0..10 bar" },
  },
  Vazão: { kind: "flow", category: "inst", label: "Vazão", defaults: { faixa: "0..200 m³/h" } },
  Nível: { kind: "level", category: "inst", label: "Nível", defaults: { tipo: "ultrasônico" } },
  "E-STOP": { kind: "estop", category: "inst", label: "E-STOP", defaults: { categoria: "0" } },
  "Cortina de luz": {
    kind: "lightcurtain",
    category: "inst",
    label: "Cortina luz",
    defaults: { res: "14mm" },
  },
  Encoder: { kind: "encoder", category: "inst", label: "Encoder", defaults: { ppr: 1024 } },
};

// Empty by default — user or AI creates the content.
const seedNodes = (): IndustrialNode[] => [];
const seedEdges = (): IndustrialEdge[] => [];

// Demo project containing INTENTIONAL violations for normative validator testing.
// Used by "Carregar exemplo com falhas" button.
export const demoFaultyNodes = (): IndustrialNode[] => [
  {
    id: "TR-01",
    kind: "transformer",
    category: "power",
    label: "TR-01 (subdim.)",
    position: { x: 60, y: 80 },
    params: { kVA: 150, primary_kV: 13.8, secondary_V: 380 },
    energized: true,
  },
  {
    id: "QGBT-01",
    kind: "busbar",
    category: "power",
    label: "QGBT-01",
    position: { x: 60, y: 220 },
    params: { U: 380 },
    energized: true,
  },
  {
    id: "DJ-01",
    kind: "breaker",
    category: "power",
    label: "DJ-01 (curva ?)",
    position: { x: 280, y: 220 },
    params: { In: 20 },
    energized: true,
  },
  {
    id: "DJ-02",
    kind: "breaker",
    category: "power",
    label: "DJ-02 (super)",
    position: { x: 460, y: 220 },
    params: { In: 250, curva: "C" },
    energized: true,
  },
  {
    id: "M-01",
    kind: "motor",
    category: "mech",
    label: "M-01 75kW",
    position: { x: 280, y: 380 },
    params: { P: 75, U: 380, cable_mm2: 6, breaker_A: 20, startMethod: "DOL" },
    energized: true,
  },
  {
    id: "M-02",
    kind: "motor",
    category: "mech",
    label: "M-02 110kW",
    position: { x: 460, y: 380 },
    params: { P: 110, U: 380, cable_mm2: 10, breaker_A: 250, startMethod: "DOL" },
    energized: true,
  },
  {
    id: "M-03",
    kind: "motor",
    category: "mech",
    label: "M-03 esteira",
    position: { x: 640, y: 380 },
    params: { P: 22, U: 380, cable_mm2: 4, breaker_A: 32 },
    energized: true,
  },
];
export const demoFaultyEdges = (): IndustrialEdge[] => [
  { id: "e1", source: "TR-01", target: "QGBT-01", kind: "power" },
  { id: "e2", source: "QGBT-01", target: "DJ-01", kind: "power" },
  { id: "e3", source: "QGBT-01", target: "DJ-02", kind: "power" },
  { id: "e4", source: "DJ-01", target: "M-01", kind: "power" },
  { id: "e5", source: "DJ-02", target: "M-02", kind: "power" },
  { id: "e6", source: "QGBT-01", target: "M-03", kind: "power" },
];

export interface RuntimeLog {
  t: string;
  tag: string;
  msg: string;
  lvl: "info" | "warn" | "err" | "ok";
  channel?: "Logs" | "Alarmes" | "IA" | "Eventos" | "OPC-UA" | "Modbus" | "Runtime" | "Terminal";
}

export interface RuntimeStatus {
  connected: boolean;
  source: "supabase" | "local" | "off";
  url?: string;
  lastTick?: number;
  cycleMs?: number;
  error?: string;
}

interface ProjectState {
  nodes: IndustrialNode[];
  edges: IndustrialEdge[];
  selectedId: string | null;
  // Persistence
  projectId: string | null;
  dirty: boolean;
  lastSavedAt: number | null;
  // Runtime
  tags: Record<string, number | boolean | string>;
  logs: RuntimeLog[];
  runtime: RuntimeStatus;
  addNode: (kindLabel: string, position: { x: number; y: number }) => string;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  updateNodeParam: (id: string, key: string, value: string | number | boolean) => void;
  removeNode: (id: string) => void;
  addEdge: (e: Omit<IndustrialEdge, "id">) => void;
  removeEdge: (id: string) => void;
  select: (id: string | null) => void;
  applyTick: (payload: TickPayload) => void;
  pushLog: (log: RuntimeLog) => void;
  setRuntime: (status: Partial<RuntimeStatus>) => void;
  reset: () => void;
  loadDemoFaulty: () => void;
  setAll: (nodes: IndustrialNode[], edges: IndustrialEdge[]) => void;
  hydrateSnapshot: (
    nodes: IndustrialNode[],
    edges: IndustrialEdge[],
    tags?: Record<string, number | boolean | string>,
  ) => void;
  setProjectId: (id: string | null) => void;
  markSaved: () => void;
}

export interface TickPayload {
  ts?: number;
  cycleMs?: number;
  tags?: Record<string, number | boolean | string>;
  energized?: Record<string, boolean>;
  params?: Record<string, Record<string, string | number>>;
  logs?: RuntimeLog[];
}

let counter = 1;
const nextId = (kind: NodeKind) => `${kind.toUpperCase()}-${String(counter++).padStart(2, "0")}`;

export const useProjectStore = create<ProjectState>((set) => {
  const dirty = () => ({ dirty: true });
  return {
    nodes: seedNodes(),
    edges: seedEdges(),
    selectedId: null,
    projectId: null,
    dirty: false,
    lastSavedAt: null,
    addNode: (kindLabel, position) => {
      const meta = KIND_CATALOG[kindLabel];
      if (!meta) return "";
      const id = nextId(meta.kind);
      const node: IndustrialNode = {
        id,
        kind: meta.kind,
        category: meta.category,
        label: id,
        position,
        params: { ...(meta.defaults ?? {}) },
        energized: meta.category === "power" || meta.category === "mech",
      };
      set((s) => ({ nodes: [...s.nodes, node], selectedId: id, ...dirty() }));
      return id;
    },
    updateNodePosition: (id, position) =>
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
        ...dirty(),
      })),
    updateNodeParam: (id, key, value) =>
      set((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n,
        ),
        ...dirty(),
      })),
    removeNode: (id) =>
      set((s) => ({
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
        ...dirty(),
      })),
    addEdge: (e) =>
      set((s) => ({ edges: [...s.edges, { ...e, id: `e${Date.now()}` }], ...dirty() })),
    removeEdge: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id), ...dirty() })),
    select: (id) => set({ selectedId: id }),
    tags: {},
    logs: [],
    runtime: { connected: false, source: "off" },
    applyTick: (payload) =>
      set((s) => {
        const nextTags = { ...s.tags, ...(payload.tags ?? {}) };
        let nextNodes = s.nodes;
        if (payload.energized) {
          nextNodes = nextNodes.map((n) =>
            payload.energized![n.id] !== undefined
              ? { ...n, energized: !!payload.energized![n.id] }
              : n,
          );
        }
        if (payload.params) {
          nextNodes = nextNodes.map((n) =>
            payload.params![n.id] ? { ...n, params: { ...n.params, ...payload.params![n.id] } } : n,
          );
        }
        const nextLogs = payload.logs?.length ? [...payload.logs, ...s.logs].slice(0, 200) : s.logs;
        return {
          nodes: nextNodes,
          tags: nextTags,
          logs: nextLogs,
          runtime: {
            ...s.runtime,
            lastTick: payload.ts ?? Date.now(),
            cycleMs: payload.cycleMs ?? s.runtime.cycleMs,
          },
        };
      }),
    pushLog: (log) => set((s) => ({ logs: [log, ...s.logs].slice(0, 200) })),
    setRuntime: (status) => set((s) => ({ runtime: { ...s.runtime, ...status } })),
    reset: () =>
      set({
        nodes: seedNodes(),
        edges: seedEdges(),
        selectedId: null,
        tags: {},
        logs: [],
        dirty: false,
      }),
    loadDemoFaulty: () =>
      set({
        nodes: demoFaultyNodes(),
        edges: demoFaultyEdges(),
        selectedId: null,
        dirty: true,
        logs: [
          {
            t: new Date().toISOString(),
            tag: "DEMO",
            msg: "Projeto demo com falhas carregado (cabos subdim, DJ incorretos, sem DR/E-STOP).",
            lvl: "warn",
            channel: "IA",
          },
        ],
      }),
    setAll: (nodes, edges) => set({ nodes, edges, selectedId: null, dirty: false }),
    hydrateSnapshot: (nodes, edges, tags = {}) =>
      set({ nodes, edges, tags, selectedId: null, dirty: false }),
    setProjectId: (id) => set({ projectId: id, dirty: false }),
    markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),
  };
});

export const KIND_GLYPH: Record<NodeKind, string> = {
  breaker: "⎚",
  contactor: "K",
  relay: "F",
  transformer: "⊗",
  vfd: "≋",
  softstarter: "S",
  psu: "+24",
  busbar: "▭",
  ccm: "▤",
  motor: "M",
  conveyor: "▶▶",
  screw: "⌇",
  valve: "▷◁",
  pump: "⊕",
  tank: "⌷",
  reactor: "◍",
  cylinder: "▭",
  pipe: "═",
  pt100: "T°",
  pressure: "P",
  flow: "Q",
  level: "L",
  estop: "■",
  lightcurtain: "‖",
  encoder: "⟳",
  pid: "PID",
  scale: "×",
  ai: "AI",
  ao: "AO",
  di: "DI",
  do: "DO",
  gauge: "◵",
  display: "0.0",
  trend: "📈",
  button: "🔘",
  switch: "⏽",
  slider: "⊶",
  input: "✎",
  alarm_banner: "⚠",
  alarm_table: "🖿",
  label: "🖹",
};
