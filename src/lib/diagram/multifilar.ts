// Modo multifilar — base de dados/lógica: inferência de condutores por
// circuito e geração da sheet "multifilar" a partir da "unifilar".
import type { Command } from "./commands";
import { makeEdge, makeNode } from "./model";
import type { CircuitConfig, DiagramDoc, DiagramEdge, DiagramNode, NodeKind } from "./schema";
import { classifyMargin, type Severity } from "../diagnostics/types";

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
}

/**
 * Calcula a queda de tensão real para circuitos com cabos configurados segundo NBR 5410:
 * ΔV = √3 · I · (R · cosφ + X · sinφ) para circuitos trifásicos a 380V
 * ΔV = 2 · I · (R · cosφ + X · sinφ) para circuitos monofásicos a 220V
 */
export function calculateVoltageDropNbr5410(doc: DiagramDoc): VoltageDropResult[] {
  const results: VoltageDropResult[] = [];
  const RHO_COPPER_70C = 0.0215; // Ω·mm²/m para cobre a 70°C (isolamento PVC)
  const REACTANCE_X_PER_M = 0.00008; // 0.08 Ω/km = 0.00008 Ω/m

  // Avalia conexões canônicas (evita duplicar cálculos entre unifilar e multifilar)
  const canonicalEdges = Object.values(doc.edges).filter(
    (e) => e.sheet === "unifilar" || !e.id.startsWith("mf_"),
  );

  for (const e of canonicalEdges) {
    const src = doc.nodes[e.source];
    const tgt = doc.nodes[e.target];
    if (!src || !tgt) continue;

    const cable = e.cable;
    const assumptions: string[] = [];
    if (!cable?.length_m) assumptions.push("Comprimento adotado como padrão (25 m)");
    if (!cable?.section_mm2) assumptions.push("Seção adotada como padrão (4 mm²)");

    // Se o cabo não estiver explícito na aresta, infere valores nominais da carga ou padrão
    const length_m = cable?.length_m ?? 25;
    const section_mm2 = cable?.section_mm2 ?? 4;

    // Determina a corrente do circuito a partir dos parâmetros do nó de carga ou proteção
    let current_A = 20;
    const loadNode = [tgt, src].find(
      (n) => n.params.kind === "motor" || n.params.kind === "load" || n.params.kind === "breaker",
    );
    if (loadNode) {
      const p = loadNode.params;
      if (p.kind === "motor") {
        current_A =
          (p as any).current_A ??
          (p as any).fla_A ??
          Math.round(
            ((p as any).power_kW * 1000) / (Math.sqrt(3) * (p as any).voltage_V * 0.85 * 0.88),
          );
      } else if (p.kind === "breaker") {
        current_A = (p as any).in_A ?? 20;
      } else if (p.kind === "load") {
        current_A = Math.round((p as any).power_W / ((p as any).voltage_V * (p as any).fp));
      }
    } else {
      assumptions.push("Corrente adotada como padrão (20 A)");
    }

    const config = e.circuitConfig ?? inferCircuitConfig(e, src, tgt);
    const isThreePhase = config.startsWith("3F");
    const voltage_V = isThreePhase ? 380 : 220;
    const cosPhi = 0.85;
    const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);

    const R = (RHO_COPPER_70C * length_m) / section_mm2;
    const X = REACTANCE_X_PER_M * length_m;
    const impedanceFactor = R * cosPhi + X * sinPhi;

    const drop_V = isThreePhase
      ? Math.sqrt(3) * current_A * impedanceFactor
      : 2 * current_A * impedanceFactor;

    const drop_pct = Number(((drop_V / voltage_V) * 100).toFixed(1));
    const max_allowed_pct = 4.0; // NBR 5410 Tabela 33 para circuitos terminais
    const compliant = drop_pct <= max_allowed_pct;

    const cableName = (e as any).label || `W${results.length + 1}`;
    results.push({
      edgeId: e.id,
      sourceLabel: src.label || src.id,
      targetLabel: tgt.label || tgt.id,
      length_m,
      section_mm2,
      current_A,
      drop_V: Number(drop_V.toFixed(2)),
      drop_pct,
      max_allowed_pct,
      compliant,
      message: `Queda de tensão no cabo ${cableName}: ${drop_pct}% (Permitido < ${max_allowed_pct.toFixed(1)}% NBR 5410)`,
      assumptions: assumptions.length > 0 ? assumptions : undefined,
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
    const marginRatio = vd.max_allowed_pct > 0 ? vd.drop_pct / vd.max_allowed_pct : 1;
    const severity = classifyMargin(marginRatio, 0.9);
    const targetNodeId = doc.edges[vd.edgeId]?.target;

    if (severity === "error") {
      alerts.push({
        id: `vd_err_${vd.edgeId}`,
        type: "ERRO",
        severity: "error",
        message: `Excesso de queda de tensão: ${vd.drop_pct}% > ${vd.max_allowed_pct}% (NBR 5410). Aumente a seção do cabo.`,
        nodeId: targetNodeId,
        edgeId: vd.edgeId,
        assumptions: vd.assumptions,
      });
    } else if (severity === "warning") {
      alerts.push({
        id: `vd_warn_${vd.edgeId}`,
        type: "AVISO",
        severity: "warning",
        message: `Atenção: queda de tensão ${vd.drop_pct}% próxima ao limite de ${vd.max_allowed_pct}% (NBR 5410, margem >= 90%).`,
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

  // 4. Verificação de conectividade contínua
  if (
    edges.length > 0 &&
    alerts.filter((a) => a.type === "ERRO" || a.severity === "error").length === 0
  ) {
    alerts.push({
      id: "conn_ok",
      type: "OK",
      severity: "ok",
      message: "Conectividade validada",
    });
  }

  return alerts;
}
