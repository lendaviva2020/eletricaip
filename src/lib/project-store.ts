import { create } from "zustand";

export type NodeCategory = "power" | "mech" | "inst" | "logic";

export type NodeKind =
  // power
  | "breaker" | "contactor" | "relay" | "transformer" | "vfd" | "softstarter" | "psu" | "busbar" | "ccm"
  // mech
  | "motor" | "conveyor" | "screw" | "valve" | "pump" | "tank" | "reactor" | "cylinder"
  // inst
  | "pt100" | "pressure" | "flow" | "level" | "estop" | "lightcurtain" | "encoder"
  // logic
  | "pid" | "scale" | "ai" | "ao" | "di" | "do";

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

export const KIND_CATALOG: Record<string, { kind: NodeKind; category: NodeCategory; label: string; defaults?: Record<string, any> }> = {
  Disjuntor: { kind: "breaker", category: "power", label: "Disjuntor", defaults: { In: "63A", Icc: "10kA" } },
  Contator: { kind: "contactor", category: "power", label: "Contator", defaults: { In: "32A" } },
  "Relé": { kind: "relay", category: "power", label: "Relé térmico", defaults: { faixa: "10-16A" } },
  Transformador: { kind: "transformer", category: "power", label: "Trafo", defaults: { S: "1500kVA", U: "13.8/0.38kV" } },
  "Inversor VFD": { kind: "vfd", category: "power", label: "Inversor VFD", defaults: { P: "7.5kW", rampa: "3s" } },
  "Soft-Starter": { kind: "softstarter", category: "power", label: "Soft-Starter", defaults: { P: "11kW" } },
  "Fonte 24V": { kind: "psu", category: "power", label: "Fonte 24Vcc", defaults: { I: "10A" } },
  QGBT: { kind: "busbar", category: "power", label: "QGBT", defaults: { U: "380V", I: "2500A" } },
  CCM: { kind: "ccm", category: "power", label: "CCM", defaults: { colunas: 6 } },
  "Motor 3F": { kind: "motor", category: "mech", label: "Motor 3F", defaults: { P: "7.5kW", U: "380V", IN: "16A" } },
  Esteira: { kind: "conveyor", category: "mech", label: "Esteira", defaults: { v: "1.2 m/s" } },
  Rosca: { kind: "screw", category: "mech", label: "Rosca", defaults: { Q: "8 t/h" } },
  "Válvula": { kind: "valve", category: "mech", label: "Válvula", defaults: { tipo: "globo", pos: "0%" } },
  Bomba: { kind: "pump", category: "mech", label: "Bomba", defaults: { Q: "120 m³/h" } },
  Tanque: { kind: "tank", category: "mech", label: "Tanque", defaults: { V: "20 m³", nivel: "50%" } },
  Reator: { kind: "reactor", category: "mech", label: "Reator", defaults: { T: "82°C" } },
  Cilindro: { kind: "cylinder", category: "mech", label: "Cilindro", defaults: { curso: "200mm" } },
  "Sensor PT100": { kind: "pt100", category: "inst", label: "PT100", defaults: { faixa: "-50..200°C" } },
  "Pressão": { kind: "pressure", category: "inst", label: "Pressão", defaults: { faixa: "0..10 bar" } },
  "Vazão": { kind: "flow", category: "inst", label: "Vazão", defaults: { faixa: "0..200 m³/h" } },
  "Nível": { kind: "level", category: "inst", label: "Nível", defaults: { tipo: "ultrasônico" } },
  "E-STOP": { kind: "estop", category: "inst", label: "E-STOP", defaults: { categoria: "0" } },
  "Cortina de luz": { kind: "lightcurtain", category: "inst", label: "Cortina luz", defaults: { res: "14mm" } },
  Encoder: { kind: "encoder", category: "inst", label: "Encoder", defaults: { ppr: 1024 } },
};

const seedNodes = (): IndustrialNode[] => [
  { id: "TR-01", kind: "transformer", category: "power", label: "TR-01", position: { x: 60, y: 80 }, params: { S: "1500kVA", U: "13.8/0.38kV" }, energized: true },
  { id: "QGBT-01", kind: "busbar", category: "power", label: "QGBT-01", position: { x: 60, y: 220 }, params: { U: "380V" }, energized: true },
  { id: "M-01", kind: "motor", category: "mech", label: "M-01", position: { x: 280, y: 360 }, params: { P: "7.5kW", IN: "16A" }, energized: true },
  { id: "M-02", kind: "motor", category: "mech", label: "M-02", position: { x: 460, y: 360 }, params: { P: "15kW", IN: "30A" }, energized: true },
  { id: "TQ-101", kind: "tank", category: "mech", label: "TQ-101", position: { x: 700, y: 100 }, params: { nivel: "64%" } },
  { id: "P-201", kind: "pump", category: "mech", label: "P-201", position: { x: 700, y: 260 }, params: { Q: "142 m³/h" }, energized: true },
  { id: "V-303", kind: "valve", category: "mech", label: "V-303", position: { x: 700, y: 380 }, params: { pos: "78%" } },
];

const seedEdges = (): IndustrialEdge[] => [
  { id: "e1", source: "TR-01", target: "QGBT-01", kind: "power" },
  { id: "e2", source: "QGBT-01", target: "M-01", kind: "power" },
  { id: "e3", source: "QGBT-01", target: "M-02", kind: "power" },
  { id: "e4", source: "TQ-101", target: "P-201", kind: "pipe" },
  { id: "e5", source: "P-201", target: "V-303", kind: "pipe" },
];

interface ProjectState {
  nodes: IndustrialNode[];
  edges: IndustrialEdge[];
  selectedId: string | null;
  addNode: (kindLabel: string, position: { x: number; y: number }) => string;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  updateNodeParam: (id: string, key: string, value: any) => void;
  removeNode: (id: string) => void;
  addEdge: (e: Omit<IndustrialEdge, "id">) => void;
  removeEdge: (id: string) => void;
  select: (id: string | null) => void;
  reset: () => void;
}

let counter = 1;
const nextId = (kind: NodeKind) => `${kind.toUpperCase()}-${String(counter++).padStart(2, "0")}`;

export const useProjectStore = create<ProjectState>((set) => ({
  nodes: seedNodes(),
  edges: seedEdges(),
  selectedId: "M-01",
  addNode: (kindLabel, position) => {
    const meta = KIND_CATALOG[kindLabel];
    if (!meta) return "";
    const id = nextId(meta.kind);
    const node: IndustrialNode = {
      id, kind: meta.kind, category: meta.category, label: id,
      position, params: { ...(meta.defaults ?? {}) }, energized: meta.category === "power" || meta.category === "mech",
    };
    set((s) => ({ nodes: [...s.nodes, node], selectedId: id }));
    return id;
  },
  updateNodePosition: (id, position) =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)) })),
  updateNodeParam: (id, key, value) =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)) })),
  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
  addEdge: (e) => set((s) => ({ edges: [...s.edges, { ...e, id: `e${Date.now()}` }] })),
  removeEdge: (id) => set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
  select: (id) => set({ selectedId: id }),
  reset: () => set({ nodes: seedNodes(), edges: seedEdges(), selectedId: null }),
}));

export const KIND_GLYPH: Record<NodeKind, string> = {
  breaker: "⎚", contactor: "K", relay: "F", transformer: "⊗", vfd: "≋", softstarter: "S", psu: "+24", busbar: "▭", ccm: "▤",
  motor: "M", conveyor: "▶▶", screw: "⌇", valve: "▷◁", pump: "⊕", tank: "⌷", reactor: "◍", cylinder: "▭",
  pt100: "T°", pressure: "P", flow: "Q", level: "L", estop: "■", lightcurtain: "‖", encoder: "⟳",
  pid: "PID", scale: "×", ai: "AI", ao: "AO", di: "DI", do: "DO",
};
