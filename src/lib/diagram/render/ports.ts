// Catálogo de portas (handles) por NodeKind em coordenadas LOCAIS do símbolo.
// Cada porta tem id estável, posição local e "side" (lado lógico — útil para
// roteamento ortogonal de edges). Mapeamos kinds para arquétipos para evitar
// duplicação; novos kinds caem no fallback "twoTerminal".
import type { NodeKind } from "../schema";

export type PortSide = "left" | "right" | "top" | "bottom" | "center";

export interface PortDef {
  id: string;
  x: number;
  y: number;
  side: PortSide;
  /** Compatibilidade de conexão. Edges de "power" só conectam em "power"|"any". */
  accepts?: ReadonlyArray<"power" | "signal" | "ground" | "pipe" | "any">;
}

const twoTerminalH: ReadonlyArray<PortDef> = [
  { id: "L", x: -24, y: 0, side: "left", accepts: ["power", "any"] },
  { id: "R", x: 24, y: 0, side: "right", accepts: ["power", "any"] },
];

const twoTerminalV: ReadonlyArray<PortDef> = [
  { id: "T", x: 0, y: -16, side: "top", accepts: ["power", "any"] },
  { id: "B", x: 0, y: 16, side: "bottom", accepts: ["power", "any"] },
];

const fourTerminal: ReadonlyArray<PortDef> = [
  { id: "L", x: -24, y: 0, side: "left", accepts: ["any"] },
  { id: "R", x: 24, y: 0, side: "right", accepts: ["any"] },
  { id: "T", x: 0, y: -14, side: "top", accepts: ["any"] },
  { id: "B", x: 0, y: 14, side: "bottom", accepts: ["any"] },
];

const referenceTop: ReadonlyArray<PortDef> = [
  { id: "T", x: 0, y: -12, side: "top", accepts: ["ground", "any"] },
];

const singleCenter: ReadonlyArray<PortDef> = [
  { id: "C", x: 0, y: 0, side: "center", accepts: ["any"] },
];

const busbarPorts: ReadonlyArray<PortDef> = [
  { id: "T", x: 0, y: -4, side: "top", accepts: ["power", "any"] },
  { id: "B1", x: -40, y: 4, side: "bottom", accepts: ["power", "any"] },
  { id: "B2", x: -20, y: 4, side: "bottom", accepts: ["power", "any"] },
  { id: "B", x: 0, y: 4, side: "bottom", accepts: ["power", "any"] },
  { id: "B3", x: 20, y: 4, side: "bottom", accepts: ["power", "any"] },
  { id: "B4", x: 40, y: 4, side: "bottom", accepts: ["power", "any"] },
  { id: "L", x: -60, y: 0, side: "left", accepts: ["power", "any"] },
  { id: "R", x: 60, y: 0, side: "right", accepts: ["power", "any"] },
];

const REGISTRY: Partial<Record<NodeKind, ReadonlyArray<PortDef>>> = {
  // proteção / manobra (4 portas para suportar encaminhamento vertical e derivações)
  breaker: fourTerminal,
  rcd: fourTerminal,
  contactor: fourTerminal,
  fuse: fourTerminal,
  disconnector: fourTerminal,
  relay: fourTerminal,
  thermal_relay: fourTerminal,
  // cargas e conversores
  motor: twoTerminalV,
  load: twoTerminalV,
  lamp: twoTerminalV,
  socket: twoTerminalV,
  capacitor_bank: twoTerminalV,
  generator: twoTerminalV,
  // automação e fontes
  transformer: fourTerminal,
  psu: fourTerminal,
  vfd: fourTerminal,
  softstarter: fourTerminal,
  busbar: busbarPorts,
  ccm: fourTerminal,
  plc: fourTerminal,
  hmi: fourTerminal,
  // referências de terra/neutro: porta única no topo
  ground: referenceTop,
  neutral: referenceTop,
  // instrumentação e bornes: duas portas verticais para liberar o centro do símbolo para seleção/arraste
  terminal: twoTerminalV,
  pt100: twoTerminalV,
  pressure: twoTerminalV,
  flow: twoTerminalV,
  level: twoTerminalV,
  encoder: twoTerminalV,
  estop: twoTerminalH,
  lightcurtain: twoTerminalH,
};

export function getPorts(kind: NodeKind): ReadonlyArray<PortDef> {
  return REGISTRY[kind] ?? twoTerminalH;
}

/**
 * Aplica rotação (em graus) à posição local de uma porta.
 * Útil para hit-test e roteamento quando o símbolo está rotacionado.
 */
export function rotatePort(p: PortDef, rotationDeg: number): { x: number; y: number } {
  if (!rotationDeg) return { x: p.x, y: p.y };
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos };
}

export function findPort(kind: NodeKind, portId: string | undefined): PortDef | null {
  if (!portId) return null;
  return getPorts(kind).find((p) => p.id === portId) ?? null;
}
