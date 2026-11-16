/**
 * Fiação (Documentação EletricAI): condutores, numeração por POTENCIAL, régua de
 * bornes gerada na fronteira painel ↔ campo e lista de cabos.
 *
 * Regras (sem fabricar dados):
 * - os condutores de uma ligação vêm do `circuitConfig` explícito; sem ele,
 *   são inferidos do equipamento do lado da carga e marcados "inferred";
 * - o terminal de cada condutor é o terminal REAL do equipamento (IEC 60947:
 *   2/T1, 4/T2…; motor U1/V1/W1; inversor U/V/W). PE/N sem terminal no
 *   equipamento de painel vão para a barra PE/N;
 * - numeração por potencial: tudo que está galvanicamente ligado (mesmo
 *   terminal, mesmo barramento/fase) recebe o mesmo número;
 * - bornes só existem onde o condutor cruza a fronteira painel → campo
 *   (motores, cargas, instrumentos, segurança). Alimentadores de
 *   transformador/gerador entram direto no disjuntor (sem borne);
 * - seção/comprimento ausentes viram PENDÊNCIA, nunca um valor inventado.
 */
import type { CanonicalEquipment, ElectricalConnection } from "@/lib/model/unified-schema";
import type { DeviceDesignation } from "./device-designation";

export type ConductorFunction = "L1" | "L2" | "L3" | "N" | "PE" | "SIG";

export interface ConnectionConductors {
  connectionId: string;
  functions: ConductorFunction[];
  source: "explicit" | "inferred";
}

export interface WireRow {
  wireNumber: string;
  potential: string;
  function: ConductorFunction;
  connectionId: string;
  from: string;
  fromTerminal: string;
  to: string;
  toTerminal: string;
  sectionMm2: number | null;
  configSource: "explicit" | "inferred";
}

export interface TerminalRow {
  strip: string;
  terminal: string;
  function: ConductorFunction;
  wireNumber: string;
  panelSide: string;
  panelTerminal: string;
  fieldSide: string;
  fieldTerminal: string;
  cable: string;
}

export interface CableRow {
  cable: string;
  from: string;
  to: string;
  conductors: number;
  composition: string;
  functions: ConductorFunction[];
  sectionMm2: number | null;
  lengthM: number | null;
  insulation: string | null;
  connectionId: string;
}

export interface WiringIssue {
  code:
    "MISSING_SECTION" | "MISSING_LENGTH" | "MISSING_PE" | "INFERRED_CONFIG" | "DANGLING_CONNECTION";
  severity: "error" | "warning" | "info";
  connectionId: string;
  message: string;
}

const CONFIG_FUNCTIONS: Readonly<Record<string, ConductorFunction[]>> = {
  F: ["L1"],
  "F+N": ["L1", "N"],
  "F+N+PE": ["L1", "N", "PE"],
  "3F": ["L1", "L2", "L3"],
  "3F+N": ["L1", "L2", "L3", "N"],
  "3F+N+PE": ["L1", "L2", "L3", "N", "PE"],
  N: ["N"],
  PE: ["PE"],
};

const PHASES_FUNCTIONS: Readonly<Record<string, ConductorFunction[]>> = {
  "1F": ["L1", "N"],
  "2F": ["L1", "L2"],
  "3F": ["L1", "L2", "L3"],
  "F+N": ["L1", "N"],
  "F+N+PE": ["L1", "N", "PE"],
  "3F+N": ["L1", "L2", "L3", "N"],
  "3F+N+PE": ["L1", "L2", "L3", "N", "PE"],
  N: ["N"],
  PE: ["PE"],
};

/** Cargas com massa metálica acessível: PE obrigatório (NBR 5410 5.1.2.2 / 6.4.3). */
const NEEDS_PE = new Set(["motor", "socket"]);
/** Equipamentos de campo: o condutor sai do painel por borne. */
const FIELD_TYPES = new Set([
  "motor",
  "load",
  "lamp",
  "socket",
  "pt100",
  "pressure",
  "flow",
  "level",
  "encoder",
  "estop",
  "lightcurtain",
]);
/** Fontes externas ao painel: alimentador vai direto ao dispositivo de entrada. */
const EXTERNAL_SOURCES = new Set(["transformer", "generator"]);
/** Elementos que equipotencializam todas as suas conexões por fase. */
const PASS_THROUGH = new Set(["busbar", "terminal", "ccm"]);
const ORDER: ConductorFunction[] = ["L1", "L2", "L3", "N", "PE", "SIG"];

function loadSide(
  from: CanonicalEquipment | undefined,
  to: CanonicalEquipment | undefined,
): CanonicalEquipment | undefined {
  if (to && (FIELD_TYPES.has(to.catalogType) || to.category === "load")) return to;
  if (from && (FIELD_TYPES.has(from.catalogType) || from.category === "load")) return from;
  return to ?? from;
}

export function conductorsForConnection(
  conn: ElectricalConnection,
  equipments: Readonly<Record<string, CanonicalEquipment>>,
): ConnectionConductors {
  if (conn.kind === "ground") {
    return { connectionId: conn.id, functions: ["PE"], source: "explicit" };
  }
  if (conn.kind === "signal") {
    return { connectionId: conn.id, functions: ["SIG"], source: "explicit" };
  }
  if (conn.circuitConfig && CONFIG_FUNCTIONS[conn.circuitConfig]) {
    return {
      connectionId: conn.id,
      functions: [...CONFIG_FUNCTIONS[conn.circuitConfig]],
      source: "explicit",
    };
  }
  const load = loadSide(equipments[conn.fromEquipmentId], equipments[conn.toEquipmentId]);
  let functions: ConductorFunction[];
  if (load?.catalogType === "motor") functions = ["L1", "L2", "L3", "PE"];
  else functions = [...(PHASES_FUNCTIONS[load?.phases ?? "3F"] ?? ["L1", "L2", "L3"])];
  if (load && NEEDS_PE.has(load.catalogType) && !functions.includes("PE")) functions.push("PE");
  return { connectionId: conn.id, functions, source: "inferred" };
}

/** Terminal real do equipamento para a função do condutor, no lado da ligação. */
export function terminalCodeFor(
  eq: CanonicalEquipment | undefined,
  fn: ConductorFunction,
  side: "in" | "out",
  fallbackTerminalId: string,
): string {
  if (!eq) return fallbackTerminalId.split(":").pop() ?? fn;
  if (fn === "SIG") {
    const t = eq.terminals.find((x) => x.id === fallbackTerminalId);
    return t?.code ?? fallbackTerminalId.split(":").pop() ?? "SIG";
  }
  const sameKind = eq.terminals.filter((t) => t.kind === fn);
  const sided =
    sameKind.find((t) => t.direction === side) ??
    sameKind.find((t) => t.direction === "bidirectional") ??
    sameKind[0];
  if (sided) return sided.code;
  if (fn === "PE") return "PE";
  if (fn === "N") return "N";
  return fn;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p !== x) {
      p = this.find(p);
      this.parent.set(x, p);
    }
    return p;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

export interface WiringResult {
  wires: WireRow[];
  terminals: TerminalRow[];
  cables: CableRow[];
  issues: WiringIssue[];
}

export function buildWiring(
  equipmentsById: Readonly<Record<string, CanonicalEquipment>>,
  connections: readonly ElectricalConnection[],
  devices: readonly DeviceDesignation[],
): WiringResult {
  const designationOf = new Map(devices.map((d) => [d.equipmentId, d.designation]));
  const name = (id: string) => designationOf.get(id) ?? id;
  const issues: WiringIssue[] = [];

  const usable = connections
    .filter((c) => c.kind !== "pipe")
    .filter((c) => {
      const ok = Boolean(equipmentsById[c.fromEquipmentId] && equipmentsById[c.toEquipmentId]);
      if (!ok) {
        issues.push({
          code: "DANGLING_CONNECTION",
          severity: "error",
          connectionId: c.id,
          message: `Ligação ${c.id} aponta para equipamento inexistente.`,
        });
      }
      return ok;
    })
    .slice()
    .sort(
      (a, b) =>
        name(a.fromEquipmentId).localeCompare(name(b.fromEquipmentId), "en", { numeric: true }) ||
        name(a.toEquipmentId).localeCompare(name(b.toEquipmentId), "en", { numeric: true }) ||
        a.id.localeCompare(b.id),
    );

  // ── 1. Condutores e extremidades ─────────────────────────────────────────
  interface Conductor {
    conn: ElectricalConnection;
    fn: ConductorFunction;
    fromTerm: string;
    toTerm: string;
    fromKey: string;
    toKey: string;
    source: "explicit" | "inferred";
  }
  const conductors: Conductor[] = [];
  const uf = new UnionFind();
  const PE_KEY = "__PE_BAR__";

  const endpointKey = (eq: CanonicalEquipment, term: string, fn: ConductorFunction) => {
    if (fn === "PE") return PE_KEY; // PE é um único potencial equipotencializado (barra PE).
    if (PASS_THROUGH.has(eq.catalogType)) return `${eq.id}|${fn}`;
    return `${eq.id}|${term}`;
  };

  for (const conn of usable) {
    const from = equipmentsById[conn.fromEquipmentId];
    const to = equipmentsById[conn.toEquipmentId];
    const spec = conductorsForConnection(conn, equipmentsById);
    if (spec.source === "inferred") {
      issues.push({
        code: "INFERRED_CONFIG",
        severity: "info",
        connectionId: conn.id,
        message: `${name(from.id)} → ${name(to.id)}: condutores inferidos (${spec.functions.join("+")}); confirme no multifilar.`,
      });
    }
    const load = loadSide(from, to);
    if (
      conn.kind === "power" &&
      load &&
      NEEDS_PE.has(load.catalogType) &&
      !spec.functions.includes("PE")
    ) {
      issues.push({
        code: "MISSING_PE",
        severity: "error",
        connectionId: conn.id,
        message: `${name(load.id)} sem condutor de proteção PE (NBR 5410 5.1.2.2).`,
      });
    }
    for (const fn of spec.functions) {
      const fromTerm = terminalCodeFor(from, fn, "out", conn.fromTerminalId);
      const toTerm = terminalCodeFor(to, fn, "in", conn.toTerminalId);
      const fromKey = endpointKey(from, fromTerm, fn);
      const toKey = endpointKey(to, toTerm, fn);
      uf.union(fromKey, toKey);
      conductors.push({ conn, fn, fromTerm, toTerm, fromKey, toKey, source: spec.source });
    }
  }

  // ── 2. Numeração por potencial ───────────────────────────────────────────
  const potentialName = new Map<string, string>();
  let powerSeq = 0;
  let signalSeq = 0;
  let neutralSeq = 0;
  const nameFor = (c: Conductor): string => {
    const root = uf.find(c.fromKey);
    const existing = potentialName.get(root);
    if (existing) return existing;
    let label: string;
    if (root === uf.find(PE_KEY)) label = "PE";
    else if (c.fn === "N") label = neutralSeq++ === 0 ? "N" : `N${neutralSeq}`;
    else if (c.fn === "SIG") label = `C${++signalSeq}`;
    else label = String(++powerSeq);
    potentialName.set(root, label);
    return label;
  };

  const wires: WireRow[] = conductors.map((c) => {
    const potential = nameFor(c);
    return {
      wireNumber: potential,
      potential,
      function: c.fn,
      connectionId: c.conn.id,
      from: name(c.conn.fromEquipmentId),
      fromTerminal: c.fromTerm,
      to: name(c.conn.toEquipmentId),
      toTerminal: c.toTerm,
      sectionMm2: c.conn.conductor?.crossSectionMm2 ?? null,
      configSource: c.source,
    };
  });

  // ── 3. Cabos e régua de bornes ───────────────────────────────────────────
  const cables: CableRow[] = [];
  const terminals: TerminalRow[] = [];
  const stripCounters = new Map<string, number>();
  let cableSeq = 0;

  for (const conn of usable) {
    const from = equipmentsById[conn.fromEquipmentId];
    const to = equipmentsById[conn.toEquipmentId];
    const fromField = FIELD_TYPES.has(from.catalogType);
    const toField = FIELD_TYPES.has(to.catalogType);
    const external = EXTERNAL_SOURCES.has(from.catalogType) || EXTERNAL_SOURCES.has(to.catalogType);
    const crossesPanel = fromField !== toField; // painel ↔ campo
    if (!crossesPanel && !external) continue; // fiação interna do painel: fio, não cabo

    const connWires = wires.filter((w) => w.connectionId === conn.id);
    const functions = connWires.map((w) => w.function);
    const section = conn.conductor?.crossSectionMm2 ?? null;
    const length = conn.conductor?.lengthM ?? null;
    const cable = `-W${++cableSeq}`;
    const hasPe = functions.includes("PE");
    const count = functions.length;
    const sectionTxt = section === null ? "?" : String(section).replace(".", ",");
    cables.push({
      cable,
      from: wires.find((w) => w.connectionId === conn.id)?.from ?? name(from.id),
      to: wires.find((w) => w.connectionId === conn.id)?.to ?? name(to.id),
      conductors: count,
      composition: `${count}${hasPe ? "G" : "x"}${sectionTxt} mm²`,
      functions,
      sectionMm2: section,
      lengthM: length,
      insulation: conn.conductor?.insulation ?? null,
      connectionId: conn.id,
    });
    if (section === null) {
      issues.push({
        code: "MISSING_SECTION",
        severity: "warning",
        connectionId: conn.id,
        message: `Cabo ${cable} (${name(from.id)} → ${name(to.id)}) sem seção definida.`,
      });
    }
    if (length === null) {
      issues.push({
        code: "MISSING_LENGTH",
        severity: "warning",
        connectionId: conn.id,
        message: `Cabo ${cable} sem comprimento: queda de tensão não verificável.`,
      });
    }

    if (!crossesPanel) continue; // alimentador externo: sem borne
    const panelIsFrom = !fromField;
    for (const w of connWires) {
      const strip = w.function === "SIG" ? "-X2" : "-X1";
      // Numeração contínua por régua; o borne PE (verde-amarelo) é identificado
      // pela função, não por um nome repetido que tornaria bornes ambíguos.
      const n = (stripCounters.get(strip) ?? 0) + 1;
      stripCounters.set(strip, n);
      const terminal = String(n);
      const panelTerm = panelIsFrom ? w.fromTerminal : w.toTerminal;
      const panelEq = panelIsFrom ? from : to;
      const panelHasTerm = panelEq.terminals.some((t) => t.code === panelTerm);
      terminals.push({
        strip,
        terminal,
        function: w.function,
        wireNumber: w.wireNumber,
        panelSide:
          w.function === "PE" && !panelHasTerm
            ? "-PE"
            : w.function === "N" && !panelHasTerm
              ? "-N"
              : panelIsFrom
                ? w.from
                : w.to,
        panelTerminal: panelTerm,
        fieldSide: panelIsFrom ? w.to : w.from,
        fieldTerminal: panelIsFrom ? w.toTerminal : w.fromTerminal,
        cable,
      });
    }
  }

  wires.sort(
    (a, b) =>
      a.potential.localeCompare(b.potential, "en", { numeric: true }) ||
      ORDER.indexOf(a.function) - ORDER.indexOf(b.function) ||
      a.from.localeCompare(b.from),
  );
  return { wires, terminals, cables, issues };
}
