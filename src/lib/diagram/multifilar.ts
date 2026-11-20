// Modo multifilar — base de dados/lógica: inferência de condutores por
// circuito e geração da sheet "multifilar" a partir da "unifilar".
import type { Command } from "./commands";
import { makeEdge, makeNode } from "./model";
import type { CircuitConfig, DiagramDoc, DiagramEdge, DiagramNode, NodeKind } from "./schema";
import { classifyMargin, type Severity } from "../diagnostics/types";
import { validateElectricalTopology } from "./connection/graph-validator";
import { cableName, isFieldCable, sizeDiagramCables } from "./connection/cable-sizing";
import { analyzeNetwork } from "./connection/network-calculation";
import { nodeDisplayName } from "./connection/cable-sizing";
import { analyzeSurgeProtection } from "./connection/surge-protection";
import { analyzeArcFlash } from "./connection/arc-flash";
import { analyzeProtectionCoordination } from "./connection/protection-coordination";

export const CONDUCTOR_LABELS: Record<CircuitConfig, string[]> = {
  F: ["L1"],
  "F+N": ["L1", "N"],
  "F+N+PE": ["L1", "N", "PE"],
  "3F": ["L1", "L2", "L3"],
  "3F+PE": ["L1", "L2", "L3", "PE"],
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
  spd: "3F+N",
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

/** Cargas: o cabo que chega a elas leva o condutor de proteção (NBR 5410: todo circuito com PE). */
const LOAD_CONFIG: Partial<Record<NodeKind, CircuitConfig>> = {
  motor: "3F+PE",
  capacitor_bank: "3F+PE",
  load: "F+N+PE",
  lamp: "F+N+PE",
  socket: "F+N+PE",
};

function localConfig(
  edge: DiagramEdge,
  src: DiagramNode | undefined,
  tgt: DiagramNode | undefined,
): CircuitConfig | undefined {
  if (edge.circuitConfig) return edge.circuitConfig;
  for (const node of [src, tgt]) {
    if (node?.params.kind === "ground") return "PE";
    if (node?.params.kind === "neutral") return "N";
  }
  // Carga primeiro: inversor → motor não tem neutro (antes saía "3F+N" do inversor).
  for (const node of [tgt, src]) {
    const cfg = node && LOAD_CONFIG[node.params.kind];
    if (cfg) {
      // Carga trifásica de tensão ≥ 300 V ou motor: trifásico; carga monofásica fica F+N+PE.
      if (cfg === "F+N+PE" && node.params.kind === "load") {
        const V = (node.params as { voltage_V?: number }).voltage_V;
        if (V !== undefined && V >= 300) return "3F+PE";
      }
      return cfg;
    }
  }
  for (const node of [src, tgt]) {
    const cfg = node && CONFIG_BY_KIND[node.params.kind];
    if (cfg) return cfg;
  }
  for (const node of [src, tgt]) {
    const p = node?.params;
    if (p && (p.kind === "breaker" || p.kind === "rcd") && "poles" in p) {
      if (p.poles === 1) return "F";
      if (p.poles === 2) return "F+N";
      if (p.poles === 3) return "3F";
      if (p.poles === 4) return "3F+N";
    }
  }
  return undefined;
}

/**
 * Configuração do circuito considerando o DOCUMENTO: quando os dois lados são
 * dispositivos de passagem sem informação (contator → relé, borne → borne), o
 * trecho herda a configuração do circuito a jusante (a carga define as fases) e,
 * sem carga, a de montante. Só sem nenhuma informação no caminho cai em "F+N".
 * Dentro do painel o PE da carga não é repetido nas pontes internas.
 */
export function inferCircuitConfigInDoc(doc: DiagramDoc, edge: DiagramEdge): CircuitConfig {
  const direct = localConfig(edge, doc.nodes[edge.source], doc.nodes[edge.target]);
  if (direct) return stripPeInside(doc, edge, direct);
  const power = Object.values(doc.edges).filter(
    (e) => e.sheet === edge.sheet && e.kind === "power" && e.id !== edge.id,
  );
  const walk = (start: string, downstream: boolean): CircuitConfig | undefined => {
    const seen = new Set<string>([edge.id]);
    let frontier = [start];
    for (let depth = 0; depth < 20 && frontier.length; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of power) {
          if (seen.has(e.id) || (downstream ? e.source : e.target) !== id) continue;
          seen.add(e.id);
          const cfg = localConfig(e, doc.nodes[e.source], doc.nodes[e.target]);
          if (cfg && cfg !== "PE" && cfg !== "N") return cfg;
          next.push(downstream ? e.target : e.source);
        }
      }
      frontier = next;
    }
    return undefined;
  };
  const found = walk(edge.target, true) ?? walk(edge.source, false);
  return found ? stripPeInside(doc, edge, found) : "F+N";
}

/** Ponte interna (não chega à carga): sem o PE, que segue direto da barra de terra à carga. */
function stripPeInside(doc: DiagramDoc, edge: DiagramEdge, cfg: CircuitConfig): CircuitConfig {
  if (edge.circuitConfig) return cfg;
  const tgt = doc.nodes[edge.target];
  const src = doc.nodes[edge.source];
  const touchesLoad = !!(
    (tgt && LOAD_CONFIG[tgt.params.kind]) ||
    (src && LOAD_CONFIG[src.params.kind])
  );
  if (touchesLoad) return cfg;
  if (cfg === "3F+PE") return "3F";
  if (cfg === "F+N+PE") return "F+N";
  return cfg;
}

/**
 * Saída do contator de reversão (função "reverse"): o multifilar desenha L1 e L3
 * trocados — é a inversão de fases que muda o sentido de giro (IEC 60947-4-1).
 */
export function isPhaseSwapFeed(doc: DiagramDoc, edge: DiagramEdge): boolean {
  const src = doc.nodes[edge.source];
  return src?.params.kind === "contactor" && (src.params as { role?: string }).role === "reverse";
}

/** Rótulos dos condutores com a inversão L1↔L3 aplicada quando for o caso. */
export function conductorLabelsFor(
  config: CircuitConfig,
  phaseSwap: boolean | undefined,
): string[] {
  const base = CONDUCTOR_LABELS[config];
  if (!phaseSwap) return base;
  return base.map((l) => (l === "L1" ? "L3" : l === "L3" ? "L1" : l));
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
    const config = inferCircuitConfigInDoc(doc, e);
    const clone = makeEdge({
      ...(isPhaseSwapFeed(doc, e) ? { phaseSwap: true } : {}),
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
    const config = inferCircuitConfigInDoc(doc, e);
    const existing = doc.edges[id];
    if (existing && existing.source === source && existing.target === target) {
      // Seção/comprimento editados no unifilar também valem no multifilar
      // (antes só a configuração era sincronizada e o cabo ficava desatualizado).
      const cableChanged = JSON.stringify(existing.cable) !== JSON.stringify(e.cable);
      const swap = isPhaseSwapFeed(doc, e);
      if (
        existing.circuitConfig !== config ||
        cableChanged ||
        Boolean(existing.phaseSwap) !== swap
      ) {
        const updated: DiagramEdge = { ...existing, circuitConfig: config };
        if (swap) updated.phaseSwap = true;
        else delete updated.phaseSwap;
        if (e.cable) updated.cable = e.cable;
        else delete updated.cable;
        commands.push({ type: "RemoveEdge", edgeId: id });
        commands.push({ type: "AddEdge", edge: updated });
      }
      continue;
    }
    if (existing) commands.push({ type: "RemoveEdge", edgeId: id });
    commands.push({
      type: "AddEdge",
      edge: makeEdge({
        ...(isPhaseSwapFeed(doc, e) ? { phaseSwap: true } : {}),
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
    const config = e.circuitConfig ?? inferCircuitConfigInDoc(doc, e);
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
  drop_pct: number;
  max_allowed_pct: number;
  compliant: boolean;
  message: string;
  assumptions?: readonly string[];
}

/**
 * Queda de tensão por trecho (NBR 5410) — a MESMA da tabela de cabos
 * (`sizeDiagramCables`): tensão da fonte do diagrama, Ib das cargas a jusante.
 * Trecho sem seção, comprimento ou corrente não é calculado (pendência).
 */
export function calculateVoltageDropNbr5410(doc: DiagramDoc): VoltageDropResult[] {
  const results: VoltageDropResult[] = [];

  // Avalia conexões canônicas (evita duplicar cálculos entre unifilar e multifilar)
  const canonicalEdges = Object.values(doc.edges).filter(
    (e) => e.sheet === "unifilar" || !e.id.startsWith("mf_"),
  );

  // Mesma corrente de projeto (Ib = cargas a jusante) do dimensionamento NBR 5410:
  // diagnóstico e tabela de cabos mostram o mesmo número.
  const rowByEdge = new Map(sizeDiagramCables(doc).rows.map((r) => [r.edgeId, r]));

  for (const e of canonicalEdges) {
    const src = doc.nodes[e.source];
    const tgt = doc.nodes[e.target];
    if (!src || !tgt) continue;

    const cable = e.cable;
    // Sem comprimento ou seção informados a queda NÃO é calculada: valor
    // presumido (antes 25 m / 4 mm²) virava ERRO falso no diagnóstico e
    // pintava o condutor como falha na simulação. Fica como pendência
    // (`listCablesMissingData`).
    if (!cable?.length_m || !cable?.section_mm2) continue;
    const assumptions: string[] = [];
    const length_m = cable.length_m;
    const section_mm2 = cable.section_mm2;

    // Corrente do trecho = a MESMA da tabela de cabos (Ib das cargas a jusante; sem
    // carga conhecida, o In da proteção — declarado como premissa). Sem nenhuma das
    // duas a queda não é calculada: antes adotava 20 A "padrão".
    const row = rowByEdge.get(e.id);
    if (!row || row.Ib_A <= 0) continue;
    const current_A = row.Ib_A;
    if (row.protection_A !== undefined && row.protection_A === row.Ib_A) {
      assumptions.push(
        `Corrente adotada = In da proteção (${current_A} A): carga a jusante sem potência informada`,
      );
    }

    // Queda do trecho = a MESMA da tabela de cabos (tensão da fonte do diagrama,
    // cos φ declarado nas premissas). Antes: 380/220 V e cos φ 0,85 fixos aqui.
    if (row.drop_pct === undefined) continue;
    const drop_pct = Math.round(row.drop_pct * 10) / 10;
    const max_allowed_pct = 4.0; // NBR 5410 Tabela 33 para circuitos terminais
    const compliant = drop_pct <= max_allowed_pct;

    const name = cableName(doc, e);
    results.push({
      edgeId: e.id,
      sourceLabel: src.label || src.id,
      targetLabel: tgt.label || tgt.id,
      length_m,
      section_mm2,
      current_A,
      drop_pct,
      max_allowed_pct,
      compliant,
      message: `Queda de tensão no cabo ${name}: ${drop_pct}% (Permitido < ${max_allowed_pct.toFixed(1)}% NBR 5410)`,
      assumptions: assumptions.length > 0 ? assumptions : undefined,
    });
  }

  return results;
}

/**
 * Cabos de CAMPO (painel → carga) e ALIMENTADORES (fonte externa → painel) sem
 * comprimento ou seção — só eles precisam de dado de obra para a queda de
 * tensão. A fiação interna do painel (Q0 → QS → DR → barramento → Q → K → F)
 * tem ~1 m e queda desprezível: não é cobrada aqui (antes 9 de 11 avisos eram
 * pontes internas que nenhuma correção conseguia "resolver").
 */
export function listCablesMissingData(doc: DiagramDoc): string[] {
  return Object.values(doc.edges)
    .filter((e) => e.sheet === "unifilar" && e.kind === "power")
    .filter((e) => isFieldCable(doc, e))
    .filter((e) => !e.cable?.length_m || !e.cable?.section_mm2)
    .map((e) => e.id);
}

/** Ligações de potência ainda sem seção dimensionada (resolvível pela NBR 5410, sem dado de obra). */
export function listConductorsWithoutSection(doc: DiagramDoc): string[] {
  return Object.values(doc.edges)
    .filter((e) => e.sheet === "unifilar" && e.kind === "power")
    .filter((e) => !isFieldCable(doc, e) && !e.cable?.section_mm2)
    .map((e) => e.id);
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

  // 2b. Coordenação das proteções (NBR 5410 §5.3 / IEC 60947): proteção × carga,
  //     relé térmico × motor, contator AC-3, seletividade e capacidade de interrupção.
  for (const f of analyzeProtectionCoordination(doc).findings) {
    alerts.push({
      id: `coord_${f.code.toLowerCase()}_${f.nodeId}`,
      type: f.severity === "error" ? "ERRO" : "AVISO",
      severity: f.severity,
      message: f.message,
      nodeId: f.nodeId,
      ...(f.assumptions ? { assumptions: f.assumptions } : {}),
    });
  }

  // 2c. Cálculo de rede: proteção contra choque, queda total, suportabilidade térmica.
  const networkReport = analyzeNetwork(doc);
  for (const f of networkReport.findings) {
    alerts.push({
      id: `net_${f.code.toLowerCase()}_${f.nodeId ?? f.edgeId ?? "rede"}`,
      type: f.severity === "error" ? "ERRO" : "AVISO",
      severity: f.severity,
      message: `${f.message} (${f.clause})`,
      ...(f.nodeId ? { nodeId: f.nodeId } : {}),
      ...(f.edgeId ? { edgeId: f.edgeId } : {}),
    });
  }

  // 2c'. Valores sugeridos (biblioteca, IA, migração) ainda não confirmados pelo engenheiro.
  for (const n of Object.values(doc.nodes)) {
    const pending = (n.params as { unconfirmed?: string[] }).unconfirmed;
    if (n.sheet !== "unifilar" || !pending?.length) continue;
    alerts.push({
      id: `defaults_${n.id}`,
      type: "AVISO",
      severity: "warning",
      message: `${nodeDisplayName(n)}: ${pending.join(", ")} são valores sugeridos (biblioteca ou IA), ainda não confirmados — confira com os dados de placa/catálogo ou use "Confirmar valores" nas propriedades.`,
      nodeId: n.id,
    });
  }

  // 2c''. Energia incidente de arco por quadro (IEEE 1584-2002 / NR-10).
  for (const f of analyzeArcFlash(doc, networkReport).findings) {
    alerts.push({
      id: `arc_${f.code.toLowerCase()}_${f.nodeId}`,
      type: f.severity === "error" ? "ERRO" : "AVISO",
      severity: f.severity,
      message: `${f.message} (${f.clause})`,
      nodeId: f.nodeId,
    });
  }

  // 2d. Proteção contra surtos (DPS).
  for (const f of analyzeSurgeProtection(doc).findings) {
    alerts.push({
      id: `spd_${f.code.toLowerCase()}_${f.nodeId ?? "rede"}`,
      type: f.severity === "error" ? "ERRO" : "AVISO",
      severity: f.severity,
      message: `${f.message} (${f.clause})`,
      ...(f.nodeId ? { nodeId: f.nodeId } : {}),
    });
  }

  // 3. Cabos sem dados: queda de tensão não verificável (pendência, nunca valor presumido)
  const missing = listCablesMissingData(doc);
  if (missing.length > 0) {
    const names = missing.slice(0, 4).map((id) => cableName(doc, doc.edges[id]));
    const more = missing.length - names.length;
    alerts.push({
      id: "vd_missing_data",
      type: "AVISO",
      severity: "warning",
      message: `${missing.length} cabo(s) de campo sem comprimento ou seção (${names.join("; ")}${more > 0 ? ` e mais ${more}` : ""}): queda de tensão não verificável (NBR 5410). Informe o comprimento real de cada cabo.`,
      edgeId: missing[0],
    });
  }
  const noSection = listConductorsWithoutSection(doc);
  if (noSection.length > 0) {
    alerts.push({
      id: "cond_section_missing",
      type: "AVISO",
      severity: "warning",
      message: `${noSection.length} condutor(es) interno(s) do painel sem seção dimensionada: use "Corrigir com IA" para dimensionar pela NBR 5410 (Ib ≤ In ≤ I'z).`,
      edgeId: noSection[0],
    });
  }

  // 4. Verificação de queda de tensão NBR 5410 com classificação determinística de margem
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
    // Coordenação de proteções é verificação à parte: não invalida a continuidade.
    alerts.filter(
      (a) =>
        (a.type === "ERRO" || a.severity === "error") &&
        !a.id.startsWith("coord_") &&
        !a.id.startsWith("net_") &&
        !a.id.startsWith("spd_") &&
        !a.id.startsWith("arc_"),
    ).length === 0
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
