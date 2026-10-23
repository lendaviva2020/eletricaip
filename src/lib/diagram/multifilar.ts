// Modo multifilar — base de dados/lógica: inferência de condutores por
// circuito e geração da sheet "multifilar" a partir da "unifilar".
import type { Command } from "./commands";
import { makeEdge, makeNode } from "./model";
import type { CircuitConfig, DiagramDoc, DiagramEdge, DiagramNode, NodeKind } from "./schema";

export const CONDUCTOR_LABELS: Record<CircuitConfig, string[]> = {
  F: ["L1"],
  "F+N": ["L1", "N"],
  "F+N+PE": ["L1", "N", "PE"],
  "3F": ["L1", "L2", "L3"],
  "3F+N": ["L1", "L2", "L3", "N"],
  "3F+N+PE": ["L1", "L2", "L3", "N", "PE"],
  N: ["N"],
  PE: ["PE"],
};

const CONFIG_BY_KIND: Partial<Record<NodeKind, CircuitConfig>> = {
  motor: "3F",
  load: "F+N",
  lamp: "F+N",
  socket: "F+N",
  transformer: "3F+N",
  vfd: "3F+N",
  softstarter: "3F+N",
  busbar: "3F+N",
  ccm: "3F+N",
  psu: "F+N",
};

/**
 * Infere a configuração de circuito de uma edge a partir dos nós que ela
 * conecta. edge.circuitConfig explícito sempre tem prioridade. Nós
 * "ground"/"neutral" forçam PE/N (são o próprio condutor de referência).
 * Para dispositivos de passagem (disjuntor, contator etc.) sem um nó de
 * carga do outro lado, usa o campo `poles` do disjuntor/DR quando
 * disponível; senão assume "F+N" (caso mais comum) como fallback seguro.
 */
export function inferCircuitConfig(
  edge: DiagramEdge,
  srcNode: DiagramNode | undefined,
  tgtNode: DiagramNode | undefined,
): CircuitConfig {
  if (edge.circuitConfig) return edge.circuitConfig;

  for (const node of [srcNode, tgtNode]) {
    if (node?.params.kind === "ground") return "PE";
    if (node?.params.kind === "neutral") return "N";
  }
  for (const node of [srcNode, tgtNode]) {
    const cfg = node && CONFIG_BY_KIND[node.params.kind];
    if (cfg) return cfg;
  }
  for (const node of [srcNode, tgtNode]) {
    const p = node?.params;
    if (p && (p.kind === "breaker" || p.kind === "rcd") && "poles" in p) {
      if (p.poles === 1) return "F";
      if (p.poles === 2) return "F+N";
      if (p.poles === 3) return "3F";
      if (p.poles === 4) return "3F+N";
    }
  }
  return "F+N";
}

/** Comandos para remover tudo que hoje está na sheet "multifilar" (usado
 * antes de regenerar, pra não duplicar a cada clique). Cascade de RemoveNode
 * já cuida das edges dependentes, mas removemos edges primeiro por
 * segurança/clareza. */
export function clearMultifilarCommands(doc: DiagramDoc): Command[] {
  const commands: Command[] = [];
  for (const e of Object.values(doc.edges)) {
    if (e.sheet === "multifilar") commands.push({ type: "RemoveEdge", edgeId: e.id });
  }
  for (const n of Object.values(doc.nodes)) {
    if (n.sheet === "multifilar") commands.push({ type: "RemoveNode", nodeId: n.id });
  }
  return commands;
}

/** Identidade canônica do equipamento de um nó (ui.equipmentId ou o próprio id). */
export function equipmentIdOf(node: DiagramNode): string {
  const ui = node.ui?.equipmentId;
  return typeof ui === "string" && ui.length > 0 ? ui : node.id;
}

/** Id determinístico do espelho multifilar de um equipamento. */
export const multifilarNodeIdFor = (equipmentId: string): string => `mf_${equipmentId}`;
export const multifilarEdgeIdFor = (unifilarEdgeId: string): string => `mf_${unifilarEdgeId}`;

/** Gera os comandos AddNode/AddEdge que criam a sheet "multifilar" a
 *  partir do estado atual da sheet "unifilar". Cada nó multifilar mantém o
 *  vínculo (`ui.equipmentId`) com o equipamento unifilar de origem. */
export function buildMultifilarCommands(doc: DiagramDoc): Command[] {
  const unifilarNodes = Object.values(doc.nodes).filter((n) => n.sheet === "unifilar");
  const unifilarEdges = Object.values(doc.edges).filter((e) => e.sheet === "unifilar");
  const commands: Command[] = [];
  const idMap = new Map<string, string>();

  for (const n of unifilarNodes) {
    const equipmentId = equipmentIdOf(n);
    const clone: DiagramNode = {
      ...makeNode({
        id: multifilarNodeIdFor(equipmentId),
        sheet: "multifilar",
        params: n.params,
        position: n.position,
        label: n.label,
        rotation: n.rotation,
      }),
      ui: { ...(n.ui ?? {}), equipmentId },
    };
    idMap.set(n.id, clone.id);
    commands.push({ type: "AddNode", node: clone });
  }

  for (const e of unifilarEdges) {
    const newSource = idMap.get(e.source);
    const newTarget = idMap.get(e.target);
    if (!newSource || !newTarget) continue;
    const config = inferCircuitConfig(e, doc.nodes[e.source], doc.nodes[e.target]);
    const clone = makeEdge({
      id: multifilarEdgeIdFor(e.id),
      sheet: "multifilar",
      source: newSource,
      target: newTarget,
      sourcePort: e.sourcePort,
      targetPort: e.targetPort,
      kind: e.kind,
      cable: e.cable,
      circuitConfig: config,
    });
    commands.push({ type: "AddEdge", edge: clone });
  }

  return commands;
}

/**
 * Sincronização incremental Unifilar → Multifilar. Diferente de limpar e
 * regenerar, preserva os nós já existentes (e portanto a posição ajustada
 * manualmente): atualiza apenas parâmetros e rótulo, adiciona o que falta e
 * remove espelhos cujo equipamento deixou de existir no unifilar.
 */
export function syncMultifilarCommands(doc: DiagramDoc): Command[] {
  const unifilarNodes = Object.values(doc.nodes).filter((n) => n.sheet === "unifilar");
  const unifilarEdges = Object.values(doc.edges).filter((e) => e.sheet === "unifilar");
  const mfNodes = Object.values(doc.nodes).filter((n) => n.sheet === "multifilar");
  const mfEdges = Object.values(doc.edges).filter((e) => e.sheet === "multifilar");
  const commands: Command[] = [];

  const mfByEquipment = new Map<string, DiagramNode>();
  for (const m of mfNodes) mfByEquipment.set(equipmentIdOf(m), m);

  const liveEquipmentIds = new Set<string>();
  const uniToMf = new Map<string, string>();

  for (const n of unifilarNodes) {
    const equipmentId = equipmentIdOf(n);
    liveEquipmentIds.add(equipmentId);
    const existing = mfByEquipment.get(equipmentId);
    if (existing) {
      uniToMf.set(n.id, existing.id);
      if (JSON.stringify(existing.params) !== JSON.stringify(n.params)) {
        commands.push({
          type: "UpdateNodeParams",
          nodeId: existing.id,
          from: existing.params,
          to: n.params,
        });
      }
      if (existing.label !== n.label) {
        commands.push({
          type: "UpdateNodeLabel",
          nodeId: existing.id,
          from: existing.label,
          to: n.label,
        });
      }
    } else {
      const clone: DiagramNode = {
        ...makeNode({
          id: multifilarNodeIdFor(equipmentId),
          sheet: "multifilar",
          params: n.params,
          position: n.position,
          label: n.label,
          rotation: n.rotation,
        }),
        ui: { ...(n.ui ?? {}), equipmentId },
      };
      uniToMf.set(n.id, clone.id);
      commands.push({ type: "AddNode", node: clone });
    }
  }

  const liveMfEdgeIds = new Set<string>();
  for (const e of unifilarEdges) {
    const source = uniToMf.get(e.source);
    const target = uniToMf.get(e.target);
    if (!source || !target) continue;
    const id = multifilarEdgeIdFor(e.id);
    liveMfEdgeIds.add(id);
    const config = inferCircuitConfig(e, doc.nodes[e.source], doc.nodes[e.target]);
    const existing = doc.edges[id];
    if (existing && existing.source === source && existing.target === target) {
      if (existing.circuitConfig !== config) {
        commands.push({ type: "RemoveEdge", edgeId: id });
        commands.push({ type: "AddEdge", edge: { ...existing, circuitConfig: config } });
      }
      continue;
    }
    if (existing) commands.push({ type: "RemoveEdge", edgeId: id });
    commands.push({
      type: "AddEdge",
      edge: makeEdge({
        id,
        sheet: "multifilar",
        source,
        target,
        sourcePort: e.sourcePort,
        targetPort: e.targetPort,
        kind: e.kind,
        cable: e.cable,
        circuitConfig: config,
      }),
    });
  }

  for (const me of mfEdges) {
    if (me.id.startsWith("mf_") && !liveMfEdgeIds.has(me.id)) {
      commands.push({ type: "RemoveEdge", edgeId: me.id });
    }
  }
  for (const m of mfNodes) {
    if (!liveEquipmentIds.has(equipmentIdOf(m)) && m.id.startsWith("mf_")) {
      commands.push({ type: "RemoveNode", nodeId: m.id });
    }
  }

  return commands;
}

export interface MultifilarPhaseMismatch {
  code: "MULTIFILAR_PHASE_MISMATCH";
  edgeId: string;
  /** equipmentIds envolvidos */
  entityIds: string[];
  /** Pólos disponíveis no dispositivo de proteção/manobra. */
  availablePoles: number;
  /** Pólos exigidos pela carga/equipamento trifásico. */
  requiredPoles: number;
}

const THREE_PHASE_KINDS: ReadonlySet<NodeKind> = new Set([
  "motor",
  "transformer",
  "vfd",
  "softstarter",
  "ccm",
]);

/**
 * Detecta ramos em que um dispositivo de proteção com menos pólos alimenta
 * um equipamento trifásico. A expansão automática desse ramo NÃO deve ser
 * considerada válida: o usuário precisa decidir (nunca inventamos pólos).
 */
export function detectMultifilarPhaseMismatches(doc: DiagramDoc): MultifilarPhaseMismatch[] {
  const out: MultifilarPhaseMismatch[] = [];
  for (const e of Object.values(doc.edges)) {
    if (e.sheet !== "unifilar" || e.kind !== "power") continue;
    const src = doc.nodes[e.source];
    const tgt = doc.nodes[e.target];
    if (!src || !tgt) continue;
    for (const [device, load] of [
      [src, tgt],
      [tgt, src],
    ] as const) {
      const p = device.params;
      if ((p.kind === "breaker" || p.kind === "rcd") && THREE_PHASE_KINDS.has(load.params.kind)) {
        if (p.poles < 3) {
          out.push({
            code: "MULTIFILAR_PHASE_MISMATCH",
            edgeId: e.id,
            entityIds: [equipmentIdOf(device), equipmentIdOf(load)],
            availablePoles: p.poles,
            requiredPoles: 3,
          });
        }
      }
    }
  }
  return out;
}

// ── Memorial descritivo ────────────────────────────────────────

export interface ConductorSummaryRow {
  config: CircuitConfig;
  circuits: number;
  conductorsPerCircuit: number;
  totalConductors: number;
  labels: string[];
}

export interface ConductorSummary {
  rows: ConductorSummaryRow[];
  totalCircuits: number;
  totalConductors: number;
}

/** Resumo dos condutores da sheet "multifilar": quantos circuitos existem por
 * configuração e quantas linhas paralelas (condutores) cada um representa.
 * Função pura — usada pelo memorial descritivo em PDF. */
export function summarizeConductors(doc: DiagramDoc): ConductorSummary {
  const byConfig = new Map<CircuitConfig, number>();
  for (const e of Object.values(doc.edges)) {
    if (e.sheet !== "multifilar") continue;
    const config =
      e.circuitConfig ?? inferCircuitConfig(e, doc.nodes[e.source], doc.nodes[e.target]);
    byConfig.set(config, (byConfig.get(config) ?? 0) + 1);
  }

  const order = Object.keys(CONDUCTOR_LABELS) as CircuitConfig[];
  const rows: ConductorSummaryRow[] = order
    .filter((c) => byConfig.has(c))
    .map((config) => {
      const labels = CONDUCTOR_LABELS[config];
      const circuits = byConfig.get(config) ?? 0;
      return {
        config,
        circuits,
        conductorsPerCircuit: labels.length,
        totalConductors: circuits * labels.length,
        labels,
      };
    });

  return {
    rows,
    totalCircuits: rows.reduce((s, r) => s + r.circuits, 0),
    totalConductors: rows.reduce((s, r) => s + r.totalConductors, 0),
  };
}
