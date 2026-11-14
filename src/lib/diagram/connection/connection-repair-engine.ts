// Deterministic Structural Connection Repair & Non-Mutating Engineering Proposal Engine
// Standards: IEC 60947, IEC 60204-1, NBR 5410
//
// SAFETY RULE (Gate 4.3.3):
//   A missing electrical connection must NEVER be interpreted automatically as proof that
//   a physical connection should exist.
//   Part A (Structural Repair): resolves unambiguous IDs/tags, normalizes catalog terminals,
//     recomputes wire geometry from existing connections, and preserves invalid/ambiguous
//     edges untouched for diagnosis.
//   Part B (Engineering Proposal): suggests missing electrical connections with rationale,
//     assumptions, and missing technical data — requiring explicit engineer approval.

import type { DiagramDoc, DiagramNode, DiagramEdge } from "../schema";
import { validateElectricalTopology } from "./graph-validator";
import { resolveTerminalAllocation } from "./connection-engine";
import { getEquipmentTerminalProfile } from "./terminal-library";
import { resolveVisualPort, rotatePort } from "../render/ports";
import {
  computeNodeBoundingBox,
  routeOrthogonalEdge,
  type BoundingBox,
} from "../render/wire-router";
import {
  buildCanonicalDiagramParams,
  extractPreservedUiMetadata,
  normalizeProjectNodeKind,
} from "./canonical-params";
import type { TopologyValidationResult } from "./types";

export interface EngineeringConnectionProposal {
  id: string;
  edge: DiagramEdge;
  reason: string;
  intendedTopology: string;
  assumptions: string[];
  missingInformation: string[];
  confidence: "high" | "medium" | "low";
}

export interface EngineeringProposalBundle {
  requiresEngineerApproval: true;
  summary: string;
  intendedTopologies: string[];
  suggestedConnections: EngineeringConnectionProposal[];
  requiredAssumptions: string[];
  missingTechnicalInformation: string[];
}

export interface RepairResult {
  repairedDoc: DiagramDoc;
  /** Always [] during automatic repair: new physical connections require explicit engineer approval. */
  addedEdges: DiagramEdge[];
  /** Number of existing edges structurally repaired (IDs, supported terminals, or geometry). */
  repairedCount: number;
  structurallyRepairedEdges: string[];
  preservedInvalidEdges: string[];
  remainingIssues: string[];
  validation: TopologyValidationResult;
  engineeringProposal: EngineeringProposalBundle;
}

const ELECTRICAL_PROJECT_EDGE_KINDS = new Set(["power", "signal", "control", "ground"]);
const NON_ELECTRICAL_EDGE_KINDS = new Set([
  "pipe",
  "fluid",
  "pneumatic",
  "hydraulic",
  "telemetry",
  "annotation",
  "scada_pipe",
]);

function cloneDoc(doc: DiagramDoc): DiagramDoc {
  return {
    ...doc,
    metadata: { ...doc.metadata, norms: [...(doc.metadata?.norms ?? ["NBR 5410"])] },
    sheets: [...(doc.sheets ?? ["unifilar"])],
    nodes: Object.fromEntries(
      Object.entries(doc.nodes ?? {}).map(([id, n]) => [
        id,
        {
          ...n,
          position: { ...n.position },
          params: { ...n.params },
          ...(n.ui ? { ui: { ...n.ui } } : {}),
        },
      ]),
    ),
    edges: Object.fromEntries(
      Object.entries(doc.edges ?? {}).map(([id, e]) => [
        id,
        {
          ...e,
          ...(e.cable ? { cable: { ...e.cable } } : {}),
          ...(e.waypoints ? { waypoints: e.waypoints.map((p) => ({ ...p })) } : {}),
        },
      ]),
    ),
  };
}

function buildUnambiguousNodeLookup(nodes: DiagramNode[]): {
  resolveRef: (ref: string) => string | undefined;
} {
  const exactIds = new Set(nodes.map((n) => n.id));
  const lowerIdCounts = new Map<string, string[]>();
  const tagCounts = new Map<string, string[]>();

  for (const n of nodes) {
    const lid = n.id.toLowerCase();
    lowerIdCounts.set(lid, [...(lowerIdCounts.get(lid) ?? []), n.id]);

    const keys = new Set<string>();
    if (n.label?.trim()) keys.add(n.label.trim().toLowerCase());
    if ("tag" in n.params && typeof n.params.tag === "string" && n.params.tag.trim()) {
      keys.add(n.params.tag.trim().toLowerCase());
    }
    for (const key of keys) {
      tagCounts.set(key, [...(tagCounts.get(key) ?? []), n.id]);
    }
  }

  return {
    resolveRef(ref: string): string | undefined {
      const trimmed = ref?.trim();
      if (!trimmed) return undefined;
      if (exactIds.has(trimmed)) return trimmed;

      const lower = trimmed.toLowerCase();
      const idMatches = lowerIdCounts.get(lower);
      if (idMatches && idMatches.length === 1) return idMatches[0];

      const tagMatches = tagCounts.get(lower);
      if (tagMatches && tagMatches.length === 1) return tagMatches[0];

      return undefined;
    },
  };
}

function computeEdgeWaypoints(
  edge: DiagramEdge,
  srcNode: DiagramNode,
  tgtNode: DiagramNode,
  allNodes: DiagramNode[],
  nodeBoxById: Map<string, BoundingBox>,
  useObstacles: boolean,
) {
  const srcPort = resolveVisualPort(srcNode.params.kind, edge.sourcePort, "source", srcNode.params);
  const tgtPort = resolveVisualPort(tgtNode.params.kind, edge.targetPort, "target", tgtNode.params);
  if (!srcPort || !tgtPort) return undefined;

  const srcOff = rotatePort(srcPort, srcNode.rotation ?? 0);
  const tgtOff = rotatePort(tgtPort, tgtNode.rotation ?? 0);
  const obstacles: BoundingBox[] = [];
  if (useObstacles) {
    for (const n of allNodes) {
      if (n.sheet !== edge.sheet || n.id === srcNode.id || n.id === tgtNode.id) continue;
      const box = nodeBoxById.get(n.id);
      if (box) obstacles.push(box);
    }
  }

  return routeOrthogonalEdge({
    from: { x: srcNode.position.x + srcOff.x, y: srcNode.position.y + srcOff.y },
    to: { x: tgtNode.position.x + tgtOff.x, y: tgtNode.position.y + tgtOff.y },
    srcSide: srcPort.side,
    tgtSide: tgtPort.side,
    obstacles,
  });
}

function makeProposedEdge(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  sourcePort: string,
  targetPort: string,
  kind: DiagramEdge["kind"] = "power",
): DiagramEdge {
  return {
    id: `prop_${sourceNode.id}_${targetNode.id}_${sourcePort}_${targetPort}`.replace(
      /[^a-zA-Z0-9_]/g,
      "_",
    ),
    sheet: sourceNode.sheet ?? "unifilar",
    source: sourceNode.id,
    target: targetNode.id,
    sourcePort,
    targetPort,
    kind,
    circuitConfig: "3F+N+PE",
  };
}

/**
 * Part B: Builds non-mutating engineering proposals for unconnected components.
 * Does NOT alter the diagram; explicit engineer approval is required before application.
 */
export function buildEngineeringProposalBundle(
  doc: DiagramDoc,
  validation: TopologyValidationResult = validateElectricalTopology(doc),
): EngineeringProposalBundle {
  const nodes = Object.values(doc.nodes).filter(
    (n) => n.sheet === "unifilar" || !n.id.startsWith("mf_"),
  );
  const edges = Object.values(doc.edges).filter(
    (e) => e.sheet === "unifilar" || !e.id.startsWith("mf_"),
  );

  const hasEdgeBetween = (a: string, b: string) =>
    edges.some((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));
  const incomingCount = (id: string) => edges.filter((e) => e.target === id).length;
  const outgoingCount = (id: string) => edges.filter((e) => e.source === id).length;

  const proposals: EngineeringConnectionProposal[] = [];
  const intendedTopologies = new Set<string>();
  const requiredAssumptions = new Set<string>();
  const missingTechnicalInfo = new Set<string>();
  const proposedPairs = new Set<string>();

  const queueProposal = (
    sourceNode: DiagramNode,
    targetNode: DiagramNode,
    opts: {
      sourcePort?: string;
      targetPort?: string;
      reason: string;
      intendedTopology: string;
      assumptions: string[];
      missingInformation: string[];
      confidence: "high" | "medium" | "low";
    },
  ) => {
    const pairKey = `${sourceNode.id}->${targetNode.id}`;
    if (proposedPairs.has(pairKey) || hasEdgeBetween(sourceNode.id, targetNode.id)) return;

    const srcAlloc = resolveTerminalAllocation(sourceNode, opts.sourcePort, "source");
    const tgtAlloc = resolveTerminalAllocation(targetNode, opts.targetPort, "target");
    if (!srcAlloc.valid || !tgtAlloc.valid) {
      missingTechnicalInfo.add(
        `Compatibilidade de terminais não confirmada entre '${sourceNode.label || sourceNode.id}' e '${targetNode.label || targetNode.id}'.`,
      );
      return;
    }

    proposedPairs.add(pairKey);
    intendedTopologies.add(opts.intendedTopology);
    opts.assumptions.forEach((a) => requiredAssumptions.add(a));
    opts.missingInformation.forEach((m) => missingTechnicalInfo.add(m));

    proposals.push({
      id: `proposal_${sourceNode.id}_${targetNode.id}`.replace(/[^a-zA-Z0-9_]/g, "_"),
      edge: makeProposedEdge(sourceNode, targetNode, srcAlloc.code, tgtAlloc.code, "power"),
      reason: opts.reason,
      intendedTopology: opts.intendedTopology,
      assumptions: opts.assumptions,
      missingInformation: opts.missingInformation,
      confidence: opts.confidence,
    });
  };

  const busbars = nodes.filter((n) => n.params.kind === "busbar");
  const transformers = nodes.filter((n) => n.params.kind === "transformer");
  const breakers = nodes.filter((n) => n.params.kind === "breaker");
  const contactors = nodes.filter((n) => n.params.kind === "contactor");
  const thermalRelays = nodes.filter((n) => n.params.kind === "thermal_relay");
  const vfds = nodes.filter((n) => n.params.kind === "vfd");
  const softstarters = nodes.filter((n) => n.params.kind === "softstarter");
  const psus = nodes.filter((n) => n.params.kind === "psu");
  const motors = nodes.filter((n) => n.params.kind === "motor");
  const loads = nodes.filter(
    (n) =>
      n.params.kind === "load" ||
      n.params.kind === "lamp" ||
      n.params.kind === "socket" ||
      n.params.kind === "capacitor_bank",
  );

  // Suggest Main Feeder -> Busbar when missing
  const busbar = busbars.length === 1 ? busbars[0] : undefined;
  let inferredMainBreakerId: string | undefined;

  if (busbar && incomingCount(busbar.id) === 0 && breakers.length > 0) {
    const explicitMain = breakers.find((b) =>
      /geral|main|qgbt|qf0|dj0|entrada/i.test(b.label || b.id),
    );
    const highestRated = [...breakers].sort(
      (a, b) =>
        ((b.params as { in_A?: number }).in_A ?? 0) - ((a.params as { in_A?: number }).in_A ?? 0),
    )[0];
    const mainBreaker = explicitMain ?? (breakers.length === 1 ? breakers[0] : highestRated);

    if (mainBreaker) {
      inferredMainBreakerId = mainBreaker.id;
      queueProposal(mainBreaker, busbar, {
        targetPort: "IN_FEED",
        reason: `Disjuntor '${mainBreaker.label || mainBreaker.id}' é candidato a proteção geral de entrada do barramento '${busbar.label || busbar.id}'.`,
        intendedTopology: "Alimentação Geral -> Barramento Principal",
        assumptions: [
          explicitMain
            ? "Identificação por tag/rótulo de proteção geral."
            : "Seleção por maior corrente nominal dentre os disjuntores disponíveis.",
          "Esquema de distribuição trifásico compatível (3F+N+PE).",
        ],
        missingInformation: [
          "Confirmação da seção do barramento/cabo e método de instalação (NBR 5410).",
        ],
        confidence: explicitMain ? "high" : "medium",
      });

      if (transformers.length === 1 && incomingCount(mainBreaker.id) === 0) {
        queueProposal(transformers[0], mainBreaker, {
          reason: `Transformador '${transformers[0].label || transformers[0].id}' não está ligado ao disjuntor geral '${mainBreaker.label || mainBreaker.id}'.`,
          intendedTopology: "Transformador -> Disjuntor Geral",
          assumptions: ["Secundário do transformador alimenta o disjuntor geral de entrada."],
          missingInformation: [
            "Confirmação da impedância %Z e corrente de curto-circuito no secundário.",
          ],
          confidence: "medium",
        });
      }
    }
  }

  // Suggest Busbar -> Unpowered Branch Breakers respecting busbar tap capacity
  const usedOrProposedTapCodes = new Set<string>();
  const reserveNextBusbarTap = (): string | undefined => {
    if (!busbar) return undefined;
    const profile = getEquipmentTerminalProfile(busbar.params.kind, busbar.params);
    const allTaps = profile.terminals.filter(
      (t) => t.code.startsWith("TAP_") && t.direction === "out",
    );
    for (const e of edges) {
      if (e.source === busbar.id) {
        usedOrProposedTapCodes.add(resolveTerminalAllocation(busbar, e.sourcePort, "source").code);
      }
    }
    for (const tap of allTaps) {
      if (!usedOrProposedTapCodes.has(tap.code)) {
        usedOrProposedTapCodes.add(tap.code);
        return tap.code;
      }
    }
    return undefined;
  };

  if (busbar) {
    const profile = getEquipmentTerminalProfile(busbar.params.kind, busbar.params);
    const allTaps = profile.terminals.filter(
      (t) => t.code.startsWith("TAP_") && t.direction === "out",
    );
    const branchBreakers = breakers.filter(
      (b) => b.id !== inferredMainBreakerId && incomingCount(b.id) === 0,
    );
    branchBreakers.forEach((brk) => {
      const nextTap = reserveNextBusbarTap();
      if (nextTap) {
        queueProposal(busbar, brk, {
          sourcePort: nextTap,
          reason: `Disjuntor de ramal '${brk.label || brk.id}' sem alimentação a montante a partir do barramento '${busbar.label || busbar.id}'.`,
          intendedTopology: "Distribuição Barramento -> Disjuntores de Ramal",
          assumptions: ["Todos os ramais derivam do mesmo barramento principal."],
          missingInformation: [
            "Identificação exata do ponto/tap de derivação e seção dos condutores.",
          ],
          confidence: "medium",
        });
      } else {
        missingTechnicalInfo.add(
          `Capacidade física de derivações do barramento '${busbar.label || busbar.id}' (${allTaps.length} taps) atingida; '${brk.label || brk.id}' requer barramento com mais derivações.`,
        );
      }
    });
  }

  // Track claimed devices in proposal stage so 1-to-1 branches don't double-propose
  const claimedIn = new Set<string>();
  const claimedOut = new Set<string>();
  const sortedFreeBreakers = breakers
    .filter((b) => b.id !== inferredMainBreakerId && outgoingCount(b.id) === 0)
    .sort((a, b) => a.position.x - b.position.x);

  const pickUpstreamBreaker = (target: DiagramNode) => {
    const available = sortedFreeBreakers.filter((b) => !claimedOut.has(b.id));
    if (available.length === 0) return undefined;
    return [...available].sort(
      (a, b) =>
        Math.abs(a.position.x - target.position.x) - Math.abs(b.position.x - target.position.x),
    )[0];
  };

  // Suggest Starter / Drive / PSU -> Motor / Load chains WITHOUT auto-applying
  for (const km of contactors) {
    if (incomingCount(km.id) === 0 && !claimedIn.has(km.id)) {
      const brk = pickUpstreamBreaker(km);
      if (brk) {
        claimedOut.add(brk.id);
        claimedIn.add(km.id);
        queueProposal(brk, km, {
          reason: `Contator '${km.label || km.id}' sem disjuntor de proteção a montante.`,
          intendedTopology: "Partida Direta (Disjuntor -> Contator -> Relé Térmico/Motor)",
          assumptions: ["Coordenação Tipo 1/Tipo 2 conforme IEC 60947-4-1."],
          missingInformation: ["Confirmação do esquema de intertravamento e tensão da bobina."],
          confidence: "medium",
        });
      } else if (busbar) {
        const nextTap = reserveNextBusbarTap();
        if (nextTap) {
          claimedIn.add(km.id);
          queueProposal(busbar, km, {
            sourcePort: nextTap,
            reason: `Contator '${km.label || km.id}' sem alimentação declarada a montante; sugerida derivação provisória do barramento '${busbar.label || busbar.id}'.`,
            intendedTopology: "Barramento -> Contator (sugere validação de proteção de ramal)",
            assumptions: [
              "Coordenação de curto-circuito protegida pelo disjuntor geral ou seccionador a ser confirmado.",
            ],
            missingInformation: [
              "Inserção ou especificação de disjuntor/fusível dedicado do ramal antes da energização.",
            ],
            confidence: "low",
          });
        }
      }
    }

    if (outgoingCount(km.id) === 0 && !claimedOut.has(km.id)) {
      const freeRt = thermalRelays.find(
        (rt) => incomingCount(rt.id) === 0 && !claimedIn.has(rt.id),
      );
      if (freeRt) {
        claimedOut.add(km.id);
        claimedIn.add(freeRt.id);
        queueProposal(km, freeRt, {
          reason: `Contator '${km.label || km.id}' sem ligação para relé de sobrecarga '${freeRt.label || freeRt.id}'.`,
          intendedTopology: "Partida Direta (Contator -> Relé Térmico -> Motor)",
          assumptions: ["Relé térmico acoplado mecanicamente/eletricamente abaixo do contator."],
          missingInformation: ["Faixa de ajuste térmico (Ir) e classe de disparo."],
          confidence: "medium",
        });
        const freeMot = motors.find((m) => incomingCount(m.id) === 0 && !claimedIn.has(m.id));
        if (freeMot) {
          claimedOut.add(freeRt.id);
          claimedIn.add(freeMot.id);
          queueProposal(freeRt, freeMot, {
            reason: `Relé térmico '${freeRt.label || freeRt.id}' sem ligação de saída para motor '${freeMot.label || freeMot.id}'.`,
            intendedTopology: "Partida Direta (Relé Térmico -> Motor)",
            assumptions: ["Ligação trifásica direta nos bornes U1/V1/W1 do motor."],
            missingInformation: [
              "Comprimento do alimentador e queda de tensão admissível (NBR 5410).",
            ],
            confidence: "medium",
          });
        }
      } else {
        const freeMot = motors.find((m) => incomingCount(m.id) === 0 && !claimedIn.has(m.id));
        if (freeMot) {
          claimedOut.add(km.id);
          claimedIn.add(freeMot.id);
          queueProposal(km, freeMot, {
            reason: `Contator '${km.label || km.id}' sem conexão para motor '${freeMot.label || freeMot.id}'.`,
            intendedTopology: "Partida Direta (Contator -> Motor)",
            assumptions: ["Proteção de sobrecarga integrada ao disjuntor-motor ou relé externo."],
            missingInformation: ["Método de partida e corrente nominal FLA do motor."],
            confidence: "low",
          });
        }
      }
    }
  }

  for (const drive of [...vfds, ...softstarters]) {
    if (incomingCount(drive.id) === 0 && !claimedIn.has(drive.id)) {
      const brk = pickUpstreamBreaker(drive);
      if (brk) {
        claimedOut.add(brk.id);
        claimedIn.add(drive.id);
        queueProposal(brk, drive, {
          reason: `Acionamento '${drive.label || drive.id}' sem proteção de entrada a montante.`,
          intendedTopology: "Acionamento Eletrônico (Disjuntor -> Inversor/Soft-Starter -> Motor)",
          assumptions: ["Proteção por disjuntor ou fusível ultrarrápido conforme fabricante."],
          missingInformation: ["Especificação de filtro EMC e indutância de linha."],
          confidence: "medium",
        });
      }
    }
    if (outgoingCount(drive.id) === 0 && !claimedOut.has(drive.id)) {
      const freeMot = motors.find((m) => incomingCount(m.id) === 0 && !claimedIn.has(m.id));
      if (freeMot) {
        claimedOut.add(drive.id);
        claimedIn.add(freeMot.id);
        queueProposal(drive, freeMot, {
          reason: `Acionamento '${drive.label || drive.id}' sem ligação de saída para motor '${freeMot.label || freeMot.id}'.`,
          intendedTopology: "Acionamento Eletrônico -> Motor",
          assumptions: ["Cabo blindado recomendado para VFD conforme EMC."],
          missingInformation: ["Comprimento máximo de cabo suportado sem reator de saída."],
          confidence: "medium",
        });
      }
    }
  }

  for (const psu of psus) {
    if (incomingCount(psu.id) === 0 && !claimedIn.has(psu.id)) {
      const brk = pickUpstreamBreaker(psu);
      if (brk) {
        claimedOut.add(brk.id);
        claimedIn.add(psu.id);
        queueProposal(brk, psu, {
          reason: `Fonte 24Vcc '${psu.label || psu.id}' sem proteção primária conectada.`,
          intendedTopology: "Alimentação de Comando (Disjuntor -> Fonte 24Vcc)",
          assumptions: ["Alimentação monofásica/bifásica ou trifásica conforme ficha da fonte."],
          missingInformation: ["Tensão primária efetiva da fonte (127V/220V/380V)."],
          confidence: "medium",
        });
      }
    }
  }

  for (const targetLoad of [...motors, ...loads]) {
    if (incomingCount(targetLoad.id) === 0 && !claimedIn.has(targetLoad.id)) {
      const brk = pickUpstreamBreaker(targetLoad);
      if (brk) {
        claimedOut.add(brk.id);
        claimedIn.add(targetLoad.id);
        queueProposal(brk, targetLoad, {
          reason: `Carga/Motor '${targetLoad.label || targetLoad.id}' sem alimentação explícita conectada.`,
          intendedTopology: "Alimentação Terminal (Disjuntor -> Carga)",
          assumptions: ["Circuito dedicado sem manobra intermediária."],
          missingInformation: [
            "Definição se há contator/DR intermediário e método de instalação do cabo.",
          ],
          confidence: "low",
        });
      }
    }
  }

  if (validation.disconnectedNodes.length > 0 && proposals.length === 0) {
    missingTechnicalInfo.add(
      "Existem equipamentos desconectados sem definição suficiente de origem/destino para sugerir conexões.",
    );
  }

  const summary =
    proposals.length > 0
      ? `Proposta de engenharia gerada com ${proposals.length} conexão(ões) sugerida(s). Nenhuma ligação foi aplicada automaticamente; revisão e aprovação do engenheiro são obrigatórias.`
      : validation.isElectricallyConsistent
        ? "Topologia eletricamente completa. Nenhuma conexão adicional sugerida."
        : "Topologia incompleta ou com erros; verifique os diagnósticos e complete as informações técnicas antes de aprovar ligações.";

  return {
    requiresEngineerApproval: true,
    summary,
    intendedTopologies: Array.from(intendedTopologies),
    suggestedConnections: proposals,
    requiredAssumptions: Array.from(requiredAssumptions),
    missingTechnicalInformation: Array.from(missingTechnicalInfo),
  };
}

/**
 * Part A (Structural Repair Only):
 * Resolves unambiguous IDs/tags, normalizes unambiguously supported terminal aliases,
 * and computes wire geometry from existing connections.
 * Never invents missing electrical edges from node presence or spatial proximity.
 */
export function repairDiagramConnections(doc: DiagramDoc): RepairResult {
  const nextDoc = cloneDoc(doc);
  const allNodes = Object.values(nextDoc.nodes);
  const lookup = buildUnambiguousNodeLookup(allNodes);

  const structurallyRepairedEdges: string[] = [];
  const preservedInvalidEdges: string[] = [];

  const useObstacles = allNodes.length <= 250;
  const nodeBoxById = new Map<string, BoundingBox>();
  if (useObstacles) {
    for (const n of allNodes) {
      nodeBoxById.set(n.id, computeNodeBoundingBox(n));
    }
  }

  for (const [edgeId, origEdge] of Object.entries(nextDoc.edges)) {
    if ((origEdge.kind as string) === "pipe") {
      preservedInvalidEdges.push(edgeId);
      continue;
    }

    let changed = false;
    const workingEdge: DiagramEdge = { ...origEdge };

    // 1. Resolve unambiguous source / target references
    if (!nextDoc.nodes[workingEdge.source]) {
      const resolved = lookup.resolveRef(workingEdge.source);
      if (resolved && resolved !== workingEdge.target) {
        workingEdge.source = resolved;
        changed = true;
      }
    }
    if (!nextDoc.nodes[workingEdge.target]) {
      const resolved = lookup.resolveRef(workingEdge.target);
      if (resolved && resolved !== workingEdge.source) {
        workingEdge.target = resolved;
        changed = true;
      }
    }

    const srcNode = nextDoc.nodes[workingEdge.source];
    const tgtNode = nextDoc.nodes[workingEdge.target];

    if (!srcNode || !tgtNode) {
      preservedInvalidEdges.push(edgeId);
      if (changed) {
        nextDoc.edges[edgeId] = workingEdge;
        structurallyRepairedEdges.push(edgeId);
      }
      continue;
    }

    // 2. Validate / normalize terminal references without masking invalid/ambiguous explicit ports
    const srcAlloc = resolveTerminalAllocation(srcNode, workingEdge.sourcePort, "source");
    const tgtAlloc = resolveTerminalAllocation(tgtNode, workingEdge.targetPort, "target");

    if (!srcAlloc.valid || !tgtAlloc.valid) {
      preservedInvalidEdges.push(edgeId);
    } else {
      if (
        (!workingEdge.sourcePort || srcAlloc.status === "compound_alias") &&
        workingEdge.sourcePort !== srcAlloc.code
      ) {
        workingEdge.sourcePort = srcAlloc.code;
        changed = true;
      }
      if (
        (!workingEdge.targetPort || tgtAlloc.status === "compound_alias") &&
        workingEdge.targetPort !== tgtAlloc.code
      ) {
        workingEdge.targetPort = tgtAlloc.code;
        changed = true;
      }
    }

    // 3. Recalculate wire geometry from existing connections when missing
    if (!workingEdge.waypoints || workingEdge.waypoints.length < 2) {
      const waypoints = computeEdgeWaypoints(
        workingEdge,
        srcNode,
        tgtNode,
        allNodes,
        nodeBoxById,
        useObstacles,
      );
      if (waypoints && waypoints.length >= 2) {
        workingEdge.waypoints = waypoints;
        changed = true;
      }
    }

    if (changed) {
      nextDoc.edges[edgeId] = workingEdge;
      structurallyRepairedEdges.push(edgeId);
    }
  }

  const validation = validateElectricalTopology(nextDoc);
  const remainingIssues = validation.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.message);
  const engineeringProposal = buildEngineeringProposalBundle(nextDoc, validation);

  return {
    repairedDoc: nextDoc,
    addedEdges: [],
    repairedCount: structurallyRepairedEdges.length,
    structurallyRepairedEdges,
    preservedInvalidEdges,
    remainingIssues,
    validation,
    engineeringProposal,
  };
}

/**
 * Applies ONLY explicitly engineer-approved proposed connections, returning an immutable DiagramDoc.
 */
export function applyApprovedEngineeringProposals(
  doc: DiagramDoc,
  proposals: EngineeringConnectionProposal[],
  approvedIds?: string[],
): DiagramDoc {
  const nextDoc = cloneDoc(doc);
  const approveSet = approvedIds ? new Set(approvedIds) : null;
  const allNodes = Object.values(nextDoc.nodes);
  const useObstacles = allNodes.length <= 250;
  const nodeBoxById = new Map<string, BoundingBox>();
  if (useObstacles) {
    for (const n of allNodes) {
      nodeBoxById.set(n.id, computeNodeBoundingBox(n));
    }
  }

  for (const proposal of proposals) {
    if (approveSet && !approveSet.has(proposal.id) && !approveSet.has(proposal.edge.id)) continue;
    const srcNode = nextDoc.nodes[proposal.edge.source];
    const tgtNode = nextDoc.nodes[proposal.edge.target];
    if (!srcNode || !tgtNode) continue;

    const alreadyConnected = Object.values(nextDoc.edges).some(
      (e) =>
        e.source === proposal.edge.source &&
        e.target === proposal.edge.target &&
        e.sourcePort === proposal.edge.sourcePort &&
        e.targetPort === proposal.edge.targetPort,
    );
    if (alreadyConnected) continue;

    const waypoints = computeEdgeWaypoints(
      proposal.edge,
      srcNode,
      tgtNode,
      allNodes,
      nodeBoxById,
      useObstacles,
    );
    nextDoc.edges[proposal.edge.id] = {
      ...proposal.edge,
      ...(waypoints ? { waypoints } : {}),
    };
  }

  return nextDoc;
}

export interface LegacySynthesisResult {
  doc: DiagramDoc;
  repair: RepairResult;
  rejectedLegacyEdges: Array<{ source: string; target: string; kind?: string; reason: string }>;
}

/**
 * Reconstructs a DiagramDoc from legacy project nodes and edges WITHOUT inventing connections
 * and WITHOUT coercing non-electrical SCADA edges (pipes/process links) into electrical cables.
 */
export function synthesizeDiagramDocWithDiagnostics(
  nodes: Array<{
    id: string;
    kind?: string;
    category?: string;
    label?: string;
    position?: { x: number; y: number };
    params?: Record<string, unknown>;
  }>,
  edges: Array<{
    id?: string;
    source: string;
    target: string;
    kind?: string;
    sourcePort?: string;
    targetPort?: string;
  }>,
): LegacySynthesisResult {
  const newDoc: DiagramDoc = {
    version: 1,
    id: `doc_synth_${Date.now().toString(36)}`,
    metadata: { title: "Projeto Recuperado", norms: ["NBR 5410", "IEC 60947"] },
    sheets: ["unifilar"],
    nodes: {},
    edges: {},
  };

  for (const n of nodes) {
    const kind = normalizeProjectNodeKind(n.kind);
    const rawParams = {
      ...(n.params ?? {}),
      ...(n.label && !n.params?.tag ? { tag: n.label } : {}),
    };
    const canonicalParams = buildCanonicalDiagramParams(kind, rawParams);
    const preservedUi = extractPreservedUiMetadata({
      ...(n.params ?? {}),
      ...(n.category ? { originalCategory: n.category } : {}),
      ...(n.kind ? { originalKind: n.kind } : {}),
    });

    newDoc.nodes[n.id] = {
      id: n.id,
      sheet: "unifilar",
      position: n.position ? { ...n.position } : { x: 100, y: 100 },
      label: n.label || n.id,
      rotation: 0,
      params: canonicalParams,
      ...(preservedUi ? { ui: preservedUi } : {}),
    };
  }

  const busbarTapCount = new Map<string, number>();
  const rejectedLegacyEdges: LegacySynthesisResult["rejectedLegacyEdges"] = [];

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const srcNode = newDoc.nodes[e.source];
    const tgtNode = newDoc.nodes[e.target];
    if (!srcNode || !tgtNode) {
      rejectedLegacyEdges.push({
        source: e.source,
        target: e.target,
        kind: e.kind,
        reason: "Referência de origem ou destino inexistente nos nós importados.",
      });
      continue;
    }

    const rawKind = (e.kind ?? "").trim().toLowerCase();
    if (rawKind && NON_ELECTRICAL_EDGE_KINDS.has(rawKind)) {
      rejectedLegacyEdges.push({
        source: e.source,
        target: e.target,
        kind: e.kind,
        reason: `Aresta legada não elétrica ('${e.kind}') ignorada na conversão para o Unifilar.`,
      });
      continue;
    }
    if (rawKind && !ELECTRICAL_PROJECT_EDGE_KINDS.has(rawKind)) {
      rejectedLegacyEdges.push({
        source: e.source,
        target: e.target,
        kind: e.kind,
        reason: `Semântica de aresta desconhecida ('${e.kind}') não convertida automaticamente em cabo elétrico.`,
      });
      continue;
    }

    const edgeId = e.id || `edge_synth_${i + 1}`;
    let sourcePort: string | undefined;
    if (e.sourcePort) {
      sourcePort = resolveTerminalAllocation(srcNode, e.sourcePort, "source").code;
    } else if (srcNode.params.kind === "busbar") {
      const profile = getEquipmentTerminalProfile(srcNode.params.kind, srcNode.params);
      const taps = profile.terminals.filter(
        (t) => t.code.startsWith("TAP_") && t.direction === "out",
      );
      const c = (busbarTapCount.get(e.source) || 0) + 1;
      busbarTapCount.set(e.source, c);
      sourcePort = c <= taps.length ? taps[c - 1].code : `TAP_${c}`;
    } else {
      const alloc = resolveTerminalAllocation(srcNode, undefined, "source");
      sourcePort = alloc.valid ? alloc.code : undefined;
    }

    const tgtAlloc = resolveTerminalAllocation(tgtNode, e.targetPort, "target");
    const targetPort = e.targetPort ? tgtAlloc.code : tgtAlloc.valid ? tgtAlloc.code : undefined;

    newDoc.edges[edgeId] = {
      id: edgeId,
      source: e.source,
      target: e.target,
      ...(sourcePort ? { sourcePort } : {}),
      ...(targetPort ? { targetPort } : {}),
      kind: rawKind === "signal" ? "signal" : rawKind === "ground" ? "ground" : "power",
      sheet: "unifilar",
      circuitConfig: "3F+N+PE",
    };
  }

  const repair = repairDiagramConnections(newDoc);
  return {
    doc: repair.repairedDoc,
    repair,
    rejectedLegacyEdges,
  };
}

export function synthesizeDiagramDocFromProject(
  nodes: Array<{
    id: string;
    kind?: string;
    category?: string;
    label?: string;
    position?: { x: number; y: number };
    params?: Record<string, unknown>;
  }>,
  edges: Array<{
    id?: string;
    source: string;
    target: string;
    kind?: string;
    sourcePort?: string;
    targetPort?: string;
  }>,
): DiagramDoc {
  return synthesizeDiagramDocWithDiagnostics(nodes, edges).doc;
}
