// Catálogo de portas (handles) por NodeKind em coordenadas LOCAIS do símbolo.
// Cada porta tem id estável, posição local e "side" (lado lógico — útil para
// roteamento ortogonal de edges). Mapeamos kinds para arquétipos para evitar
// duplicação; novos kinds caem no fallback "twoTerminal".
import type { NodeKind, NodeParams } from "../schema";
import { getEquipmentTerminalProfile } from "../connection/terminal-library";

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

function buildBusbarPorts(tapCount = 8): ReadonlyArray<PortDef> {
  const clamped = Math.max(1, Math.min(64, Math.floor(tapCount)));
  const legacyIds = ["B1", "B2", "B", "B3", "B4"];
  const span = Math.max(80, (clamped - 1) * 20);
  const halfEdge = Math.max(60, Math.ceil(span / 2) + 20);
  const taps: PortDef[] = [];
  for (let i = 1; i <= clamped; i++) {
    const id = i <= legacyIds.length ? legacyIds[i - 1] : `B${i}`;
    const x = clamped === 1 ? 0 : Math.round(-span / 2 + ((i - 1) * span) / (clamped - 1));
    taps.push({ id, x, y: 4, side: "bottom", accepts: ["power", "any"] });
  }
  return [
    { id: "T", x: 0, y: -4, side: "top", accepts: ["power", "any"] },
    ...taps,
    { id: "L", x: -halfEdge, y: 0, side: "left", accepts: ["power", "any"] },
    { id: "R", x: halfEdge, y: 0, side: "right", accepts: ["power", "any"] },
  ];
}

const busbarPorts: ReadonlyArray<PortDef> = buildBusbarPorts(8);

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

export function getPorts(kind: NodeKind, params?: NodeParams): ReadonlyArray<PortDef> {
  if (kind === "busbar" && params && "taps" in params && typeof params.taps === "number") {
    return buildBusbarPorts(params.taps);
  }
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

export function findPort(
  kind: NodeKind,
  portId: string | undefined,
  params?: NodeParams,
): PortDef | null {
  if (!portId) return null;
  return getPorts(kind, params).find((p) => p.id === portId) ?? null;
}

const INPUT_PORT_ALIASES = new Set(["IN", "INPUT", "LINE", "SUPPLY", "IN_R", "IN_S", "IN_T"]);

const OUTPUT_PORT_ALIASES = new Set(["OUT", "OUTPUT", "LOAD", "OUT_U", "OUT_V", "OUT_W"]);

/**
 * Resolves a visual canvas port from a logical terminal code, canonical terminal ID,
 * or explicit visual port ID. Never coerces unknown explicit ports onto arbitrary handles.
 */
export function resolveVisualPort(
  kind: NodeKind,
  portId: string | undefined,
  role: "source" | "target" = "source",
  params?: NodeParams,
): PortDef | undefined {
  const ports = getPorts(kind, params);
  if (ports.length === 0) return undefined;

  const findById = (id: string | undefined): PortDef | undefined => {
    if (!id) return undefined;
    const upper = id.toUpperCase();
    return ports.find((p) => p.id === id) ?? ports.find((p) => p.id.toUpperCase() === upper);
  };

  const shortId = portId?.includes(":")
    ? portId.slice(portId.lastIndexOf(":") + 1).trim()
    : portId?.trim();

  // 1. Direct match on visual port id declared for this component kind ("T", "B", "L", "R", "B1".."BN")
  if (shortId) {
    const direct = findById(portId) ?? findById(shortId);
    if (direct) return direct;

    const profile = getEquipmentTerminalProfile(kind, params);
    const shortUpper = shortId.toUpperCase();
    const normalizedTap = shortUpper.match(/^TAP_?(\d+)$/)
      ? `TAP_${shortUpper.replace(/^TAP_?/, "")}`
      : shortUpper;

    // 2. Canonical terminal profile lookup (IEC terminal code -> visual portId)
    const matchedTerm =
      profile.terminals.find((t) => t.code.toUpperCase() === shortUpper) ??
      profile.terminals.find((t) => t.code.toUpperCase() === normalizedTap) ??
      profile.terminals.find((t) => {
        const tc = t.code.toUpperCase();
        return tc.startsWith(`${shortUpper}/`) || tc.endsWith(`/${shortUpper}`);
      });
    if (matchedTerm) {
      return findById(matchedTerm.portId);
    }

    // 3. Component-specific IEC semantic aliases (only if declared terminals satisfy that role)
    if (kind === "transformer" && (shortUpper === "PRI" || shortUpper === "PRIMARY")) {
      const pri = profile.terminals.find((t) => t.code === "H1");
      if (pri) return findById(pri.portId);
    }
    if (kind === "transformer" && (shortUpper === "SEC" || shortUpper === "SECONDARY")) {
      const sec = profile.terminals.find((t) => t.code === "X1");
      if (sec) return findById(sec.portId);
    }

    if (INPUT_PORT_ALIASES.has(shortUpper)) {
      const inTerm = profile.terminals.find(
        (t) => t.direction === "in" || t.direction === "bidirectional",
      );
      if (inTerm) return findById(inTerm.portId);
    }
    if (OUTPUT_PORT_ALIASES.has(shortUpper)) {
      const outTerm = profile.terminals.find(
        (t) => t.direction === "out" || t.direction === "bidirectional",
      );
      if (outTerm) return findById(outTerm.portId);
    }

    // Explicit unknown or incompatible portId for this component: do NOT coerce blindly.
    return undefined;
  }

  // 4. Role-based resolution only when portId was intentionally omitted
  const profile = getEquipmentTerminalProfile(kind, params);
  if (role === "source") {
    const outTerm = profile.terminals.find(
      (t) => t.direction === "out" || t.direction === "bidirectional",
    );
    return findById(outTerm?.portId ?? profile.defaultOutPort);
  }
  const inTerm = profile.terminals.find(
    (t) => t.direction === "in" || t.direction === "bidirectional",
  );
  return findById(inTerm?.portId ?? profile.defaultInPort);
}
