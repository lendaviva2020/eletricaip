// Motor de simulação elétrica e conectividade do diagrama Unifilar e Multifilar.
// Avalia fluxo de potência a partir das origens de alimentação (gerador, trafo, barramento de entrada),
// respeitando o estado dos dispositivos de manobra/interrupção (disjuntores, seccionadoras, contatores).
//
// Regras visuais estritas:
// - Simulação parada: condutores em grafite neutro (0x475569 / #475569)
// - Condutor energizado: verde elétrico (0x10b981 / #10B981)
// - Condutor em condição de falha: vermelho (0xef4444 / #EF4444)
// - Elemento selecionado: laranja industrial (0xf97316 / #F97316)

import type { DiagramDoc, DiagramEdge, DiagramNode } from "./schema";
import { detectMultifilarPhaseMismatches, calculateVoltageDropNbr5410 } from "./multifilar";
import { useSafetyStore } from "@/lib/simulation/safety-core";

export type SimulationStatus = "stopped" | "running" | "paused";

export interface CircuitEnergizationState {
  status: SimulationStatus;
  energizedEdgeIds: Set<string>;
  faultEdgeIds: Set<string>;
  energizedNodeIds: Set<string>;
  openDeviceIds: Set<string>;
  sourceNodeIds: Set<string>;
  metrics: {
    totalNodes: number;
    totalEdges: number;
    energizedCircuits: number;
    unenergizedCircuits: number;
    faultsCount: number;
  };
}

/**
 * Dispositivos que interrompem ou conduzem corrente conforme seu estado (aberto/fechado).
 */
export function isSwitchingDevice(kind: string): boolean {
  return (
    kind === "breaker" ||
    kind === "disconnector" ||
    kind === "contactor" ||
    kind === "relay" ||
    kind === "fuse" ||
    kind === "estop"
  );
}

/**
 * Identifica se um nó atua como fonte de alimentação primária.
 */
export function isPowerSourceNode(node: DiagramNode): boolean {
  const kind = node.params?.kind;
  if (kind === "generator" || kind === "transformer") return true;

  // Barramentos com tag de alimentação principal ou nós de entrada
  const label = (node.label || "").toUpperCase();
  const tag = String((node.params as any)?.tag || "").toUpperCase();
  if (
    label.includes("GRID") ||
    label.includes("REDE") ||
    label.includes("ALIM") ||
    label.includes("FONTE") ||
    label.includes("TRAFO") ||
    tag.startsWith("Q0") ||
    tag.startsWith("TR")
  ) {
    return true;
  }

  return false;
}

/**
 * Calcula determinísticamente o estado elétrico dos nós e condutores do circuito.
 *
 * @param doc Documento ativo
 * @param status Estado do motor ("stopped" | "running" | "paused")
 * @param deviceStates Estado de abertura de dispositivos de manobra (nodeId -> closed boolean)
 */
export function computeCircuitEnergization(
  doc: DiagramDoc,
  status: SimulationStatus,
  deviceStates: Record<string, boolean> = {},
): CircuitEnergizationState {
  const nodes = Object.values(doc.nodes);
  const edges = Object.values(doc.edges);

  const emptyResult: CircuitEnergizationState = {
    status,
    energizedEdgeIds: new Set(),
    faultEdgeIds: new Set(),
    energizedNodeIds: new Set(),
    openDeviceIds: new Set(),
    sourceNodeIds: new Set(),
    metrics: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      energizedCircuits: 0,
      unenergizedCircuits: edges.length,
      faultsCount: 0,
    },
  };

  const isEmergencyActive = useSafetyStore.getState().emergencyLatched;

  if (status === "stopped" || isEmergencyActive || nodes.length === 0) {
    // Se a emergência estiver atuada, registra todos os dispositivos como abertos no estado seguro
    if (isEmergencyActive) {
      for (const n of nodes) {
        if (isSwitchingDevice(n.params.kind)) {
          emptyResult.openDeviceIds.add(n.id);
        }
      }
    }
    return emptyResult;
  }

  // 1. Identificar falhas normativas e operacionais no diagrama
  const faultEdgeIds = new Set<string>();
  try {
    const phaseMismatches = detectMultifilarPhaseMismatches(doc);
    for (const m of phaseMismatches) {
      if (m.edgeId) faultEdgeIds.add(m.edgeId);
    }

    const voltageDrops = calculateVoltageDropNbr5410(doc);
    for (const vd of voltageDrops) {
      if (!vd.compliant && vd.edgeId) {
        faultEdgeIds.add(vd.edgeId);
      }
    }
  } catch (err) {
    console.warn("[Simulação] Erro ao avaliar diagnósticos normativos:", err);
  }

  // 2. Mapear origens de alimentação (fontes)
  const sourceNodeIds = new Set<string>();
  for (const n of nodes) {
    if (isPowerSourceNode(n)) {
      sourceNodeIds.add(n.id);
    }
  }

  // Fallback de engenharia: se nenhuma fonte explícita foi definida,
  // nós com grau de entrada zero conectados a dispositivos são fontes potenciais.
  if (sourceNodeIds.size === 0 && edges.length > 0) {
    const targetSet = new Set(edges.map((e) => e.target));
    for (const n of nodes) {
      if (!targetSet.has(n.id) && n.params?.kind !== "ground" && n.params?.kind !== "terminal") {
        sourceNodeIds.add(n.id);
      }
    }
    // Se ainda assim estiver vazio, use o primeiro nó do diagrama
    if (sourceNodeIds.size === 0 && nodes[0]) {
      sourceNodeIds.add(nodes[0].id);
    }
  }

  // 3. Mapear estado dos dispositivos de manobra (padrão: fechados)
  const openDeviceIds = new Set<string>();
  for (const n of nodes) {
    if (isSwitchingDevice(n.params.kind)) {
      const isClosed = deviceStates[n.id] ?? true;
      if (!isClosed) {
        openDeviceIds.add(n.id);
      }
    }
  }

  // 4. Mapear adjacência de bordas (grafo bi-direcional para fluxo elétrico)
  const nodeOutgoingEdges = new Map<string, DiagramEdge[]>();
  for (const e of edges) {
    const listSrc = nodeOutgoingEdges.get(e.source) ?? [];
    listSrc.push(e);
    nodeOutgoingEdges.set(e.source, listSrc);

    const listTgt = nodeOutgoingEdges.get(e.target) ?? [];
    listTgt.push(e);
    nodeOutgoingEdges.set(e.target, listTgt);
  }

  // 5. Propagação do fluxo elétrico via BFS (Busca em Largura)
  const energizedEdgeIds = new Set<string>();
  const energizedNodeIds = new Set<string>();
  const visitedNodes = new Set<string>();
  const queue: string[] = [];

  for (const srcId of sourceNodeIds) {
    queue.push(srcId);
    energizedNodeIds.add(srcId);
    visitedNodes.add(srcId);
  }

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentNode = doc.nodes[currentId];
    if (!currentNode) continue;

    // Se o dispositivo atual estiver aberto (desligado), a corrente não atravessa
    // para os demais ramos a jusante.
    if (openDeviceIds.has(currentId)) {
      continue;
    }

    const connectedEdges = nodeOutgoingEdges.get(currentId) ?? [];
    for (const edge of connectedEdges) {
      energizedEdgeIds.add(edge.id);

      const nextNodeId = edge.source === currentId ? edge.target : edge.source;
      if (!visitedNodes.has(nextNodeId)) {
        visitedNodes.add(nextNodeId);
        energizedNodeIds.add(nextNodeId);
        queue.push(nextNodeId);
      }
    }
  }

  return {
    status,
    energizedEdgeIds,
    faultEdgeIds,
    energizedNodeIds,
    openDeviceIds,
    sourceNodeIds,
    metrics: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      energizedCircuits: energizedEdgeIds.size,
      unenergizedCircuits: Math.max(0, edges.length - energizedEdgeIds.size),
      faultsCount: faultEdgeIds.size,
    },
  };
}
