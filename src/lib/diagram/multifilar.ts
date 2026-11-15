// Modo multifilar — base de dados/lógica: inferência de condutores por
// circuito e geração da sheet "multifilar" a partir da "unifilar".
import type { Command } from "./commands";
import { makeEdge, makeNode } from "./model";
import type { CircuitConfig, DiagramDoc, DiagramEdge, DiagramNode, NodeKind } from "./schema";
import { classifyMargin, type Severity } from "../diagnostics/types";
import { validateElectricalTopology } from "./connection/graph-validator";
import { calcVoltageDrop, nbr5410VoltageDropLimits } from "../electrical-calc";
import { estimateCircuitCurrent } from "./circuit-current";

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
  generator: "3F+N",
  vfd: "3F+N",
  softstarter: "3F+N",
  busbar: "3F+N",
  ccm: "3F+N",
  capacitor_bank: "3F",
  thermal_relay: "3F",
  plc: "F+N",
  hmi: "F+N",
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
  "generator",
  "vfd",
  "softstarter",
  "ccm",
  "capacitor_bank",
  "thermal_relay",
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

/**
 * Converte a representação Multifilar de volta para Unifilar, consolidando feixes
 * de condutores em circuitos simplificados e sincronizando propriedades dos equipamentos.
 */
export function buildUnifilarFromMultifilarCommands(doc: DiagramDoc): Command[] {
  const mfNodes = Object.values(doc.nodes).filter((n) => n.sheet === "multifilar");
  const mfEdges = Object.values(doc.edges).filter((e) => e.sheet === "multifilar");
  const commands: Command[] = [];
  const idMap = new Map<string, string>();

  for (const n of mfNodes) {
    const equipmentId = equipmentIdOf(n);
    const uniNodeId = n.id.startsWith("mf_") ? n.id.slice(3) : equipmentId;
    const existingUni = doc.nodes[uniNodeId];

    if (existingUni) {
      idMap.set(n.id, existingUni.id);
      if (JSON.stringify(existingUni.params) !== JSON.stringify(n.params)) {
        commands.push({
          type: "UpdateNodeParams",
          nodeId: existingUni.id,
          from: existingUni.params,
          to: n.params,
        });
      }
      if (existingUni.label !== n.label) {
        commands.push({
          type: "UpdateNodeLabel",
          nodeId: existingUni.id,
          from: existingUni.label,
          to: n.label,
        });
      }
    } else {
      const clone: DiagramNode = {
        ...makeNode({
          id: uniNodeId,
          sheet: "unifilar",
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
  }

  for (const e of mfEdges) {
    const uniSource = idMap.get(e.source);
    const uniTarget = idMap.get(e.target);
    if (!uniSource || !uniTarget) continue;
    const uniEdgeId = e.id.startsWith("mf_") ? e.id.slice(3) : `uni_${e.id}`;
    const existingUniEdge = doc.edges[uniEdgeId];
    if (existingUniEdge) {
      continue;
    }
    const clone = makeEdge({
      id: uniEdgeId,
      sheet: "unifilar",
      source: uniSource,
      target: uniTarget,
      sourcePort: e.sourcePort,
      targetPort: e.targetPort,
      kind: e.kind,
      cable: e.cable,
      circuitConfig: e.circuitConfig,
    });
    commands.push({ type: "AddEdge", edge: clone });
  }

  return commands;
}

// ── Diagnósticos e Cálculos Elétricos Reais (NBR 5410) ──────────

export interface VoltageDropResult {
  edgeId: string;
  sourceLabel: string;
  targetLabel: string;
  length_m: number;
  section_mm2: number;
  current_A: number;
  drop_V: number;
  drop_pct: number;
  max_allowed_pct: number;
  compliant: boolean;
  message: string;
  assumptions?: readonly string[];
  /** Queda acumulada desde a origem da instalação até o fim deste trecho (%). F2.4. */
  cumulative_drop_pct: number;
  /** Limite a partir da origem (7% transformador/gerador próprio; 5% fornecimento BT). */
  origin_limit_pct: number;
  /** Trecho que alimenta diretamente um equipamento de utilização (limite próprio de 4%). */
  is_terminal_circuit: boolean;
  /** Maior razão medido/limite entre os critérios aplicáveis (sem arredondamento prévio). */
  margin_ratio: number;
  /**
   * true quando o resultado depende de dado ausente deste trecho ou a montante
   * (comprimento/seção do cabo, corrente real). Nesse caso não pode ser "OK".
   */
  requires_confirmation: boolean;
}

/** Equipamentos de utilização: o trecho que os alimenta é tratado como circuito terminal. */
const UTILIZATION_KINDS = new Set(["motor", "load", "lamp", "socket"]);
/** Nós que caracterizam origem com transformador/gerador próprio. */
const OWN_SOURCE_KINDS = new Set(["transformer", "generator"]);

/**
 * Queda de tensão por trecho e ACUMULADA desde a origem (auditoria F2.4/F2.7),
 * usando o motor único `calcVoltageDrop` (ρ na temperatura de serviço, X para
 * S ≥ 35 mm², tensão e fases coerentes) e a corrente de `estimateCircuitCurrent`.
 *
 * Critérios (ABNT NBR 5410:2004 §6.2.7, por referência de seção):
 * - queda acumulada da origem ≤ 7% (transformador/gerador próprio a montante)
 *   ou ≤ 5% (fornecimento em BT — premissa quando não há fonte própria no diagrama);
 * - trecho terminal (alimenta equipamento de utilização) ≤ 4%.
 * A conformidade é decidida sobre os valores sem arredondamento.
 * Premissa de topologia: a aresta vai da origem (montante) para o destino (jusante).
 */
export function calculateVoltageDropNbr5410(doc: DiagramDoc): VoltageDropResult[] {
  // Conexões canônicas de potência (evita duplicar unifilar/multifilar e ignora sinal/controle).
  const canonicalEdges = Object.values(doc.edges).filter(
    (e) =>
      (e.sheet === "unifilar" || !e.id.startsWith("mf_")) &&
      (e.kind === "power" || e.cable !== undefined),
  );

  type Segment = {
    edge: DiagramEdge;
    src: DiagramNode;
    tgt: DiagramNode;
    length_m: number;
    section_mm2: number;
    current_A: number;
    drop_V: number;
    rawPct: number;
    assumptions: string[];
    /** Premissa crítica: dado de entrada do próprio circuito ausente (ver F2.7). */
    critical: boolean;
  };

  // Arestas que saem de cada nó (para somar a carga a jusante de alimentadores).
  const outgoing = new Map<string, DiagramEdge[]>();
  for (const e of canonicalEdges) {
    const list = outgoing.get(e.source) ?? [];
    list.push(e);
    outgoing.set(e.source, list);
  }
  /** Soma das correntes das cargas a jusante de um nó (sem fator de demanda). */
  const downstreamLoadCurrent = (
    nodeId: string,
    isThreePhase: boolean,
    seen = new Set<string>(),
  ): number => {
    if (seen.has(nodeId)) return 0;
    seen.add(nodeId);
    let sum = 0;
    for (const out of outgoing.get(nodeId) ?? []) {
      const child = doc.nodes[out.target];
      if (!child) continue;
      if (UTILIZATION_KINDS.has(child.params.kind)) {
        sum += estimateCircuitCurrent([child], isThreePhase).current_A ?? 0;
      } else {
        sum += downstreamLoadCurrent(child.id, isThreePhase, seen);
      }
    }
    return sum;
  };

  const segments = new Map<string, Segment>();
  for (const e of canonicalEdges) {
    const src = doc.nodes[e.source];
    const tgt = doc.nodes[e.target];
    if (!src || !tgt) continue;

    const cable = e.cable;
    const assumptions: string[] = [];
    if (!cable?.length_m) assumptions.push("Comprimento adotado como padrão (25 m)");
    if (!cable?.section_mm2) assumptions.push("Seção adotada como padrão (4 mm²)");
    const length_m = cable?.length_m ?? 25;
    const section_mm2 = cable?.section_mm2 ?? 4;

    const config = e.circuitConfig ?? inferCircuitConfig(e, src, tgt);
    const isThreePhase = config.startsWith("3F");
    const est = estimateCircuitCurrent([tgt, src], isThreePhase);
    // No canvas, as premissas informativas também são listadas ao usuário.
    assumptions.push(...est.assumptions, ...(est.informativeAssumptions ?? []));
    let current_A = est.current_A;
    let derivedFromDownstream = false;
    if (current_A === undefined || est.currentFromProtectionRating) {
      // Alimentador/distribuição: corrente = soma das cargas a jusante (F2.4).
      const downstream = UTILIZATION_KINDS.has(tgt.params.kind)
        ? 0
        : downstreamLoadCurrent(tgt.id, isThreePhase);
      if (downstream > 0) {
        current_A = downstream;
        derivedFromDownstream = true;
        // A premissa do disjuntor (se houver) deixa de valer: corrente real das cargas.
        assumptions.length = 0;
        if (!cable?.length_m) assumptions.push("Comprimento adotado como padrão (25 m)");
        if (!cable?.section_mm2) assumptions.push("Seção adotada como padrão (4 mm²)");
        assumptions.push(
          `Corrente do trecho = soma das cargas a jusante (${downstream.toFixed(1)} A), sem fator de demanda`,
        );
      }
    }
    if (current_A === undefined) {
      current_A = 20;
      assumptions.push("Corrente de projeto não definida por nenhuma carga; adotado 20 A");
    }
    // Críticas: faltam dados do próprio circuito (cabo ou corrente real). As demais
    // premissas (cosφ/η/fp típicos, tipo de origem) são informativas e listadas.
    const critical =
      !cable?.length_m ||
      !cable?.section_mm2 ||
      (!derivedFromDownstream &&
        (est.current_A === undefined || est.currentFromProtectionRating === true));
    const voltage_V = est.voltage_V ?? (isThreePhase ? 380 : 220);
    const calc = calcVoltageDrop(current_A, length_m, section_mm2, voltage_V, est.cosphi, {
      phases: isThreePhase ? 3 : 1,
      insulation: cable?.insulation ?? "PVC",
    });
    segments.set(e.id, {
      edge: e,
      src,
      tgt,
      length_m,
      section_mm2,
      current_A,
      drop_V: calc.deltaV_V,
      rawPct: (calc.deltaV_V / voltage_V) * 100,
      assumptions,
      critical,
    });
  }

  // Arestas que chegam em cada nó (para caminhar a montante).
  const incoming = new Map<string, Segment[]>();
  for (const seg of segments.values()) {
    const list = incoming.get(seg.tgt.id) ?? [];
    list.push(seg);
    incoming.set(seg.tgt.id, list);
  }

  // Queda acumulada A MONTANTE de um nó, somando apenas trechos com comprimento
  // DECLARADO. Ligações sem cabo declarado (ex.: barramento→disjuntor dentro do
  // mesmo painel) não recebem os 25 m padrão no acumulado — isso inventaria
  // metros de cabo inexistentes; elas ficam marcadas como premissa crítica.
  const upstreamMemo = new Map<string, number>();
  const declaredContributionUpTo = (seg: Segment, visiting: Set<string>): number => {
    const cached = upstreamMemo.get(seg.edge.id);
    if (cached !== undefined) return cached;
    if (visiting.has(seg.edge.id)) return 0; // ciclo: não acumula de novo
    visiting.add(seg.edge.id);
    let upstream = 0;
    for (const up of incoming.get(seg.src.id) ?? []) {
      upstream = Math.max(upstream, declaredContributionUpTo(up, visiting));
    }
    visiting.delete(seg.edge.id);
    const own = seg.edge.cable?.length_m ? seg.rawPct : 0;
    const total = own + upstream;
    upstreamMemo.set(seg.edge.id, total);
    return total;
  };
  const cumulativePct = (seg: Segment): number => {
    let upstream = 0;
    for (const up of incoming.get(seg.src.id) ?? []) {
      upstream = Math.max(upstream, declaredContributionUpTo(up, new Set()));
    }
    return seg.rawPct + upstream;
  };

  const hasOwnSourceUpstream = (nodeId: string, seen = new Set<string>()): boolean => {
    if (seen.has(nodeId)) return false;
    seen.add(nodeId);
    const node = doc.nodes[nodeId];
    if (node && OWN_SOURCE_KINDS.has(node.params.kind)) return true;
    return (incoming.get(nodeId) ?? []).some((up) => hasOwnSourceUpstream(up.src.id, seen));
  };

  // Premissa crítica neste trecho ou em qualquer trecho a montante (afeta o acumulado).
  const hasCriticalOnPath = (seg: Segment, seen = new Set<string>()): boolean => {
    if (seg.critical) return true;
    if (seen.has(seg.edge.id)) return false;
    seen.add(seg.edge.id);
    return (incoming.get(seg.src.id) ?? []).some((up) => hasCriticalOnPath(up, seen));
  };

  const results: VoltageDropResult[] = [];
  for (const seg of segments.values()) {
    const cumulative = cumulativePct(seg);
    const ownSource = hasOwnSourceUpstream(seg.src.id);
    const limits = nbr5410VoltageDropLimits(ownSource ? "OWN_TRANSFORMER" : "LV_UTILITY");
    const assumptions = [...seg.assumptions];
    if (!ownSource) {
      assumptions.push(
        `Origem sem transformador/gerador próprio no diagrama: adotado fornecimento em BT (limite ${limits.fromOriginMaxPct}% desde a origem)`,
      );
    }
    const isTerminal = UTILIZATION_KINDS.has(seg.tgt.params.kind);
    const ownRatio = isTerminal ? seg.rawPct / limits.terminalCircuitMaxPct : 0;
    const originRatio = cumulative / limits.fromOriginMaxPct;
    const margin_ratio = Math.max(ownRatio, originRatio);
    const compliant = margin_ratio <= 1 + 1e-12;
    const max_allowed_pct = isTerminal ? limits.terminalCircuitMaxPct : limits.fromOriginMaxPct;
    const drop_pct = Number(seg.rawPct.toFixed(2));
    const cumulative_drop_pct = Number(cumulative.toFixed(2));
    const cableName = (seg.edge as { label?: string }).label || `W${results.length + 1}`;
    results.push({
      edgeId: seg.edge.id,
      sourceLabel: seg.src.label || seg.src.id,
      targetLabel: seg.tgt.label || seg.tgt.id,
      length_m: seg.length_m,
      section_mm2: seg.section_mm2,
      current_A: Number(seg.current_A.toFixed(2)),
      drop_V: Number(seg.drop_V.toFixed(2)),
      drop_pct,
      max_allowed_pct,
      compliant,
      message: isTerminal
        ? `Queda de tensão no cabo ${cableName}: ${drop_pct}% no circuito terminal (limite ${limits.terminalCircuitMaxPct}%) e ${cumulative_drop_pct}% desde a origem (limite ${limits.fromOriginMaxPct}%) — NBR 5410 §6.2.7`
        : `Queda de tensão no cabo ${cableName}: ${drop_pct}% no trecho; ${cumulative_drop_pct}% acumulado desde a origem (limite ${limits.fromOriginMaxPct}%) — NBR 5410 §6.2.7`,
      assumptions: assumptions.length > 0 ? assumptions : undefined,
      cumulative_drop_pct,
      origin_limit_pct: limits.fromOriginMaxPct,
      is_terminal_circuit: isTerminal,
      margin_ratio,
      requires_confirmation: hasCriticalOnPath(seg),
    });
  }

  return results;
}

export interface DiagnosticAlert {
  id: string;
  type: "AVISO" | "ERRO" | "OK";
  severity?: Severity;
  message: string;
  nodeId?: string;
  edgeId?: string;
  assumptions?: readonly string[];
}

/**
 * Executa a bateria de validação do diagrama elétrico em tempo real:
 * - Validação de conectividade elétrica contínua
 * - Detecção de tags ausentes em componentes
 * - Queda de tensão segundo NBR 5410
 * - Incompatibilidade de pólos e fases
 */
export function runDiagramDiagnostics(doc: DiagramDoc): DiagnosticAlert[] {
  const alerts: DiagnosticAlert[] = [];
  // Avalia equipamentos canônicos (evita duplicar alertas entre representação unifilar e espelho multifilar)
  const nodes = Object.values(doc.nodes).filter(
    (n) => n.sheet === "unifilar" || !n.id.startsWith("mf_"),
  );
  const edges = Object.values(doc.edges).filter(
    (e) => e.sheet === "unifilar" || !e.id.startsWith("mf_"),
  );

  if (nodes.length === 0) {
    return [
      { id: "empty", type: "AVISO", severity: "warning", message: "Diagrama elétrico vazio." },
    ];
  }

  // 1. Verificação de tags obrigatórias
  for (const n of nodes) {
    const hasTag = (n.params as any).tag || (n.label && n.label.trim().length > 0);
    if (!hasTag && n.params.kind !== "ground" && n.params.kind !== "terminal") {
      alerts.push({
        id: `tag_${n.id}`,
        type: "ERRO",
        severity: "error",
        message: `${n.id} sem tag definida`,
        nodeId: n.id,
      });
    }
  }

  // 2. Verificação de inconsistências de fases
  const mismatches = detectMultifilarPhaseMismatches(doc);
  for (const m of mismatches) {
    alerts.push({
      id: `mismatch_${m.edgeId}`,
      type: "ERRO",
      severity: "error",
      message: `Inconsistência de fases: dispositivo possui ${m.availablePoles} pólos, mas a carga exige ${m.requiredPoles} fases.`,
      edgeId: m.edgeId,
    });
  }

  // 3. Verificação de queda de tensão NBR 5410 com classificação determinística de margem
  const voltageDrops = calculateVoltageDropNbr5410(doc);
  for (const vd of voltageDrops) {
    // F2.7: margem calculada sobre valores não arredondados e sobre os dois
    // critérios (trecho terminal e acumulado desde a origem).
    const severity = classifyMargin(vd.margin_ratio, 0.9);
    const targetNodeId = doc.edges[vd.edgeId]?.target;
    const hasAssumptions = vd.requires_confirmation;

    if (severity === "error") {
      alerts.push({
        id: `vd_err_${vd.edgeId}`,
        type: "ERRO",
        severity: "error",
        message: `Excesso de queda de tensão: ${vd.message}. Aumente a seção do cabo.`,
        nodeId: targetNodeId,
        edgeId: vd.edgeId,
        assumptions: vd.assumptions,
      });
    } else if (severity === "warning") {
      alerts.push({
        id: `vd_warn_${vd.edgeId}`,
        type: "AVISO",
        severity: "warning",
        message: `Atenção: queda de tensão próxima ao limite (margem ≥ 90%): ${vd.message}.`,
        nodeId: targetNodeId,
        edgeId: vd.edgeId,
        assumptions: vd.assumptions,
      });
    } else if (hasAssumptions) {
      // F2.7: conformidade que depende de premissas não é apresentada como "OK".
      alerts.push({
        id: `vd_warn_${vd.edgeId}`,
        type: "AVISO",
        severity: "warning",
        message: `Queda de tensão dentro do limite somente sob premissas não confirmadas: ${vd.message}. Informe os dados reais para validar.`,
        nodeId: targetNodeId,
        edgeId: vd.edgeId,
        assumptions: vd.assumptions,
      });
    } else {
      alerts.push({
        id: `vd_ok_${vd.edgeId}`,
        type: "OK",
        severity: "ok",
        message: `Queda de tensão em conformidade: ${vd.drop_pct}% (< ${vd.max_allowed_pct.toFixed(1)}% NBR 5410).`,
        nodeId: targetNodeId,
        edgeId: vd.edgeId,
        assumptions: vd.assumptions,
      });
    }
  }

  // 4. Verificação de topologia elétrica, nós desconectados e cargas sem alimentação
  const topology = validateElectricalTopology(doc);
  for (const disconn of topology.disconnectedNodes) {
    if (disconn.kind !== "ground" && disconn.kind !== "neutral") {
      alerts.push({
        id: `disconn_${disconn.nodeId}`,
        type: "ERRO",
        severity: "error",
        message: `Equipamento '${disconn.label || disconn.nodeId}' (${disconn.kind}) está totalmente desconectado.`,
        nodeId: disconn.nodeId,
      });
    }
  }

  for (const missing of topology.missingConnections) {
    alerts.push({
      id: `missing_${missing.equipmentId}_${missing.terminalCode}`,
      type: missing.severity === "error" ? "ERRO" : "AVISO",
      severity: missing.severity,
      message: missing.reason,
      nodeId: missing.equipmentId,
    });
  }

  for (const invalid of topology.invalidConnections) {
    alerts.push({
      id: `invalid_${invalid.edgeId}`,
      type: "ERRO",
      severity: "error",
      message: invalid.reason,
      edgeId: invalid.edgeId,
    });
  }

  // 5. Verificação de conectividade contínua
  if (
    edges.length > 0 &&
    alerts.filter((a) => a.type === "ERRO" || a.severity === "error").length === 0
  ) {
    alerts.push({
      id: "conn_ok",
      type: "OK",
      severity: "ok",
      message: "Conectividade validada com sucesso.",
    });
  }

  return alerts;
}
