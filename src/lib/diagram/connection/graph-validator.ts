// Independent Electrical Topology & Graph Validator
// Standards: IEC 60947, IEC 60617, IEC 60204-1, NBR 5410, NBR 14039

import type { DiagramDoc, DiagramNode, NodeKind } from "../schema";
import type {
  TopologyValidationResult,
  TopologyDiagnostic,
  CircuitPath,
  ConnectivityStatus,
} from "./types";
import { getEquipmentTerminalProfile } from "./terminal-library";
import { buildNetlistFromDiagram, resolveTerminalAllocation } from "./connection-engine";

export function validateElectricalTopology(doc: DiagramDoc): TopologyValidationResult {
  const nodes = Object.values(doc.nodes).filter(
    (n) => n.sheet === "unifilar" || !n.id.startsWith("mf_"),
  );
  const edges = Object.values(doc.edges).filter(
    (e) => e.sheet === "unifilar" || !e.id.startsWith("mf_"),
  );

  const diagnostics: TopologyDiagnostic[] = [];
  const disconnectedNodes: TopologyValidationResult["disconnectedNodes"] = [];
  const missingConnections: TopologyValidationResult["missingConnections"] = [];
  const invalidConnections: TopologyValidationResult["invalidConnections"] = [];
  const paths: CircuitPath[] = [];

  // Map degrees of nodes (in and out)
  const incomingEdges = new Map<string, typeof edges>();
  const outgoingEdges = new Map<string, typeof edges>();
  const terminalUsageCount = new Map<
    string,
    { node: DiagramNode; code: string; count: number; max?: number }
  >();

  for (const n of nodes) {
    incomingEdges.set(n.id, []);
    outgoingEdges.set(n.id, []);
  }

  // 1. Structural edge validation, orphan & terminal catalog checks
  const seenPairTerminals = new Set<string>();

  for (const e of edges) {
    const srcNode = doc.nodes[e.source];
    const tgtNode = doc.nodes[e.target];

    if (!srcNode || !tgtNode) {
      invalidConnections.push({
        edgeId: e.id,
        source: e.source,
        target: e.target,
        reason: `Aresta faz referência a nó inexistente (origem '${e.source}' ou destino '${e.target}').`,
        severity: "error",
      });
      diagnostics.push({
        id: `diag_orphan_${e.id}`,
        code: "ORPHAN_EDGE_REFERENCE",
        message: `Conexão '${e.id}' referencia equipamento inexistente no diagrama.`,
        severity: "error",
        entityIds: [e.id],
      });
      continue;
    }

    if ((e.kind as string) === "pipe") {
      invalidConnections.push({
        edgeId: e.id,
        source: e.source,
        target: e.target,
        reason: `Aresta '${e.id}' possui semântica não elétrica (tubulação/pipe) e não representa ligação elétrica válida.`,
        severity: "error",
      });
      diagnostics.push({
        id: `diag_non_electrical_${e.id}`,
        code: "NON_ELECTRICAL_EDGE",
        message: `Conexão '${e.id}' tem tipo não elétrico ('${e.kind}') no diagrama elétrico.`,
        severity: "error",
        entityIds: [e.id, srcNode.id, tgtNode.id],
      });
      continue;
    }

    if (e.source === e.target) {
      invalidConnections.push({
        edgeId: e.id,
        source: e.source,
        target: e.target,
        reason: "Conexão circular em curto direto consigo mesmo.",
        severity: "error",
      });
      diagnostics.push({
        id: `diag_self_loop_${e.id}`,
        code: "INVALID_SELF_LOOP",
        message: `Equipamento '${srcNode.label || srcNode.id}' conectado a si mesmo.`,
        severity: "error",
        entityIds: [srcNode.id, e.id],
      });
    }

    const srcAlloc = resolveTerminalAllocation(srcNode, e.sourcePort, "source");
    const tgtAlloc = resolveTerminalAllocation(tgtNode, e.targetPort, "target");

    if (!srcAlloc.valid) {
      const code =
        srcAlloc.status === "ambiguous_terminal"
          ? "AMBIGUOUS_TERMINAL_ALLOCATION"
          : "INVALID_TERMINAL_REFERENCE";
      const reason =
        srcAlloc.reason ||
        `Terminal de origem '${e.sourcePort ?? ""}' inválido ou incompatível em '${srcNode.label || srcNode.id}'.`;
      invalidConnections.push({
        edgeId: e.id,
        source: e.source,
        target: e.target,
        reason,
        severity: "error",
      });
      diagnostics.push({
        id: `diag_src_term_${e.id}`,
        code,
        message: reason,
        severity: "error",
        entityIds: [srcNode.id, e.id],
      });
    }

    if (!tgtAlloc.valid) {
      const code =
        tgtAlloc.status === "ambiguous_terminal"
          ? "AMBIGUOUS_TERMINAL_ALLOCATION"
          : "INVALID_TERMINAL_REFERENCE";
      const reason =
        tgtAlloc.reason ||
        `Terminal de destino '${e.targetPort ?? ""}' inválido ou incompatível em '${tgtNode.label || tgtNode.id}'.`;
      invalidConnections.push({
        edgeId: e.id,
        source: e.source,
        target: e.target,
        reason,
        severity: "error",
      });
      diagnostics.push({
        id: `diag_tgt_term_${e.id}`,
        code,
        message: reason,
        severity: "error",
        entityIds: [tgtNode.id, e.id],
      });
    }

    const fromCode = srcAlloc.code;
    const toCode = tgtAlloc.code;

    const srcUsageKey = `${srcNode.id}:${fromCode}`;
    const prevSrcUsage = terminalUsageCount.get(srcUsageKey);
    terminalUsageCount.set(srcUsageKey, {
      node: srcNode,
      code: fromCode,
      count: (prevSrcUsage?.count ?? 0) + 1,
      max: srcAlloc.terminal?.maxConnections,
    });

    const tgtUsageKey = `${tgtNode.id}:${toCode}`;
    const prevTgtUsage = terminalUsageCount.get(tgtUsageKey);
    terminalUsageCount.set(tgtUsageKey, {
      node: tgtNode,
      code: toCode,
      count: (prevTgtUsage?.count ?? 0) + 1,
      max: tgtAlloc.terminal?.maxConnections,
    });

    const pairKey = `${e.source}:${fromCode}->${e.target}:${toCode}`;
    if (seenPairTerminals.has(pairKey)) {
      diagnostics.push({
        id: `diag_dup_${e.id}`,
        code: "DUPLICATE_CONNECTION",
        message: `Conexão duplicada detectada entre ${srcNode.label || srcNode.id} e ${tgtNode.label || tgtNode.id}.`,
        severity: "warning",
        entityIds: [e.id],
      });
    }
    seenPairTerminals.add(pairKey);

    incomingEdges.get(e.target)?.push(e);
    outgoingEdges.get(e.source)?.push(e);

    // Verify electrical nature compatibility (e.g. power vs control short)
    const srcTerm = srcAlloc.terminal;
    const tgtTerm = tgtAlloc.terminal;

    if (srcTerm && tgtTerm) {
      if (
        srcTerm.nature === "power" &&
        tgtTerm.nature === "control" &&
        tgtNode.params.kind !== "psu"
      ) {
        // Direct power wired to control input without PSU/step-down
        diagnostics.push({
          id: `diag_nature_mismatch_${e.id}`,
          code: "POWER_TO_CONTROL_SHORT",
          message: `Incompatibilidade de natureza elétrica: terminal de potência '${srcTerm.code}' de ${srcNode.label || srcNode.id} conectado diretamente a terminal de comando '${tgtTerm.code}' de ${tgtNode.label || tgtNode.id}.`,
          severity: "error",
          entityIds: [srcNode.id, tgtNode.id, e.id],
        });
      }
    }
  }

  // 1b. Terminal allocation capacity check (busbar tap limit & configured hardware capacity)
  for (const n of nodes) {
    if (n.params.kind === "busbar" && "taps" in n.params && typeof n.params.taps === "number") {
      const configuredTaps = n.params.taps;
      const outConns = outgoingEdges.get(n.id) ?? [];
      if (outConns.length > configuredTaps) {
        const msg = `Barramento '${n.label || n.id}' possui ${outConns.length} derivações conectadas para apenas ${configuredTaps} pontos configurados (taps).`;
        invalidConnections.push({
          edgeId: outConns[configuredTaps].id,
          source: n.id,
          target: outConns[configuredTaps].target,
          reason: msg,
          severity: "error",
        });
        diagnostics.push({
          id: `diag_bus_cap_${n.id}`,
          code: "BUSBAR_TAP_CAPACITY_EXCEEDED",
          message: msg,
          severity: "error",
          entityIds: [n.id, ...outConns.map((o) => o.id)],
        });
      }
    }
  }

  for (const [, usage] of terminalUsageCount.entries()) {
    if (usage.max !== undefined && usage.count > usage.max) {
      const hasExplicitBusbarConfig =
        usage.node.params.kind === "busbar" &&
        "taps" in usage.node.params &&
        typeof usage.node.params.taps === "number";
      if (hasExplicitBusbarConfig) {
        const msg = `Terminal '${usage.code}' de '${usage.node.label || usage.node.id}' excedeu capacidade (${usage.count}/${usage.max}).`;
        diagnostics.push({
          id: `diag_term_cap_${usage.node.id}_${usage.code}`,
          code: "TERMINAL_CAPACITY_EXCEEDED",
          message: msg,
          severity: "error",
          entityIds: [usage.node.id],
        });
        const offendingEdge = outgoingEdges
          .get(usage.node.id)
          ?.find(
            (edge) =>
              resolveTerminalAllocation(usage.node, edge.sourcePort, "source").code === usage.code,
          );
        if (offendingEdge) {
          invalidConnections.push({
            edgeId: offendingEdge.id,
            source: offendingEdge.source,
            target: offendingEdge.target,
            reason: msg,
            severity: "error",
          });
        }
      } else if (usage.node.params.kind === "busbar" && usage.code.startsWith("TAP_")) {
        diagnostics.push({
          id: `diag_term_shared_${usage.node.id}_${usage.code}`,
          code: "MULTIPLE_CONDUCTORS_ON_TERMINAL",
          message: `Terminal '${usage.code}' do barramento '${usage.node.label || usage.node.id}' compartilha ${usage.count} condutores sem configuração explícita de taps.`,
          severity: "warning",
          entityIds: [usage.node.id],
        });
      }
    }
  }

  // 2. Disconnected node check
  for (const n of nodes) {
    const inCount = incomingEdges.get(n.id)?.length ?? 0;
    const outCount = outgoingEdges.get(n.id)?.length ?? 0;
    const totalEdges = inCount + outCount;

    // Ground and neutral can be terminal references with at least 1 edge
    if (totalEdges === 0) {
      disconnectedNodes.push({
        nodeId: n.id,
        label: n.label || n.params.kind,
        kind: n.params.kind,
      });
      diagnostics.push({
        id: `diag_disconn_${n.id}`,
        code: "DISCONNECTED_EQUIPMENT",
        message: `Equipamento '${n.label || n.id}' (${n.params.kind}) está totalmente desconectado no diagrama.`,
        severity: "error",
        entityIds: [n.id],
      });
    }
  }

  // 3. Mandatory terminal and topological role checks
  for (const n of nodes) {
    const profile = getEquipmentTerminalProfile(n.params.kind, n.params);
    const inEdges = incomingEdges.get(n.id) ?? [];
    const outEdges = outgoingEdges.get(n.id) ?? [];

    const hasUpstreamSource = nodes.some(
      (other) =>
        other.id !== n.id &&
        (other.params.kind === "transformer" ||
          other.params.kind === "generator" ||
          other.params.kind === "busbar"),
    );

    const isMainServiceBreaker =
      n.params.kind === "breaker" &&
      outEdges.length > 0 &&
      (!hasUpstreamSource || outEdges.some((e) => doc.nodes[e.target]?.params.kind === "busbar"));

    const isSource =
      n.params.kind === "transformer" ||
      n.params.kind === "generator" ||
      n.params.kind === "busbar" ||
      n.params.kind === "ccm" ||
      isMainServiceBreaker;

    const isLoad =
      n.params.kind === "motor" ||
      n.params.kind === "load" ||
      n.params.kind === "lamp" ||
      n.params.kind === "socket" ||
      n.params.kind === "capacitor_bank" ||
      n.params.kind === "psu";

    const isProtectionOrSwitching =
      n.params.kind === "breaker" ||
      n.params.kind === "contactor" ||
      n.params.kind === "rcd" ||
      n.params.kind === "fuse" ||
      n.params.kind === "disconnector" ||
      n.params.kind === "thermal_relay" ||
      n.params.kind === "vfd" ||
      n.params.kind === "softstarter";

    // Loads MUST have incoming power connection
    if (isLoad && inEdges.length === 0) {
      missingConnections.push({
        equipmentId: n.id,
        terminalCode: profile.defaultInPort,
        reason: `Carga '${n.label || n.id}' não possui alimentação elétrica a montante.`,
        severity: "error",
      });
      diagnostics.push({
        id: `diag_no_feed_${n.id}`,
        code: "LOAD_WITHOUT_FEEDER",
        message: `Carga '${n.label || n.id}' (${n.params.kind}) sem cabo de alimentação conectado.`,
        severity: "error",
        entityIds: [n.id],
      });
    }

    // Protection/Switching devices in branches should have downstream output or upstream input
    if (isProtectionOrSwitching) {
      if (inEdges.length === 0 && !isSource) {
        missingConnections.push({
          equipmentId: n.id,
          terminalCode: profile.defaultInPort,
          reason: `Dispositivo '${n.label || n.id}' sem alimentação a montante.`,
          severity: "error",
        });
      }
      if (outEdges.length === 0) {
        missingConnections.push({
          equipmentId: n.id,
          terminalCode: profile.defaultOutPort,
          reason: `Dispositivo de manobra/proteção '${n.label || n.id}' com saída aberta (sem carga a jusante).`,
          severity: "warning",
        });
      }
    }
  }

  // 4. Trace complete paths from Sources to Loads
  const sourceNodes = nodes.filter(
    (n) =>
      n.params.kind === "transformer" ||
      n.params.kind === "generator" ||
      n.params.kind === "busbar" ||
      n.params.kind === "ccm" ||
      (n.params.kind === "breaker" && (incomingEdges.get(n.id)?.length ?? 0) === 0),
  );

  const loadNodes = nodes.filter(
    (n) =>
      n.params.kind === "motor" ||
      n.params.kind === "load" ||
      n.params.kind === "lamp" ||
      n.params.kind === "socket" ||
      n.params.kind === "capacitor_bank" ||
      n.params.kind === "psu",
  );

  for (const load of loadNodes) {
    const visited = new Set<string>();
    let currentId = load.id;
    const pathEquipments: string[] = [load.id];
    const pathEdges: string[] = [];
    let isConnectedToSource = false;
    let interruptionReason: string | undefined;

    // Backward trace from load up to source
    while (currentId) {
      visited.add(currentId);
      const inConns = incomingEdges.get(currentId) ?? [];
      if (inConns.length === 0) {
        if (!sourceNodes.some((s) => s.id === currentId)) {
          interruptionReason = `Circuito interrompido em '${doc.nodes[currentId]?.label || currentId}' (sem alimentação a montante).`;
        } else {
          isConnectedToSource = true;
        }
        break;
      }
      const primaryInConn = inConns[0];
      pathEdges.unshift(primaryInConn.id);
      const upstreamId = primaryInConn.source;
      pathEquipments.unshift(upstreamId);

      const hasFurtherInflow = (incomingEdges.get(upstreamId)?.length ?? 0) > 0;

      if (sourceNodes.some((s) => s.id === upstreamId) && !hasFurtherInflow) {
        isConnectedToSource = true;
        break;
      }
      if (visited.has(upstreamId)) {
        interruptionReason = `Circuito em laço fechado detectado em '${upstreamId}'.`;
        break;
      }
      currentId = upstreamId;
    }

    paths.push({
      id: `path_${load.id}`,
      name: `Alimentador -> ${load.label || load.id}`,
      sourceEquipmentId: pathEquipments[0],
      loadEquipmentId: load.id,
      equipmentIds: pathEquipments,
      connectionIds: pathEdges,
      isComplete: isConnectedToSource,
      interruptionPoint: interruptionReason
        ? {
            equipmentId: currentId,
            terminalCode: "in",
            reason: interruptionReason,
          }
        : undefined,
    });
  }

  // 5. Build canonical netlist to check isolated nets
  const { nets } = buildNetlistFromDiagram(doc);
  const isolatedNets = nets
    .filter((net) => net.members.length < 2)
    .map((net) => ({ netId: net.id, name: net.name }));

  // 6. Determine overall Connectivity Status
  let status: ConnectivityStatus = "COMPLETE";
  const hasErrors =
    diagnostics.some((d) => d.severity === "error") ||
    disconnectedNodes.length > 0 ||
    missingConnections.some((m) => m.severity === "error") ||
    invalidConnections.length > 0;

  const hasWarnings =
    diagnostics.some((d) => d.severity === "warning") ||
    missingConnections.some((m) => m.severity === "warning") ||
    paths.some((p) => !p.isComplete);

  if (hasErrors) {
    status = invalidConnections.length > 0 ? "INVALID" : "INCOMPLETE";
  } else if (hasWarnings) {
    status = "COMPLETE_WITH_WARNINGS";
  } else {
    status = "COMPLETE";
  }

  return {
    status,
    isElectricallyConsistent:
      !hasErrors && (paths.length === 0 || paths.every((p) => p.isComplete)),
    totalEquipments: nodes.length,
    totalConnections: edges.length,
    totalNets: nets.length,
    disconnectedNodes,
    missingConnections,
    invalidConnections,
    isolatedNets,
    paths,
    diagnostics,
  };
}

export type EngineeringComplianceStatus =
  "VALID" | "INVALID" | "WARNING" | "INCOMPLETE" | "REQUIRES_ENGINEERING_REVIEW" | "NOT_VERIFIABLE";

export type EngineeringStandardCode =
  "NBR 5410" | "IEC 60617" | "IEC 60909" | "IEC 61439" | "IEC 60204-1";

export interface NormativeComplianceFinding {
  id: string;
  standard: EngineeringStandardCode;
  clause: string;
  status: EngineeringComplianceStatus;
  title: string;
  detail: string;
  entityIds: string[];
}

export interface NormativeComplianceReport {
  overallStatus: EngineeringComplianceStatus;
  topologyStatus: ConnectivityStatus;
  findings: NormativeComplianceFinding[];
  summary: {
    valid: number;
    invalid: number;
    warning: number;
    incomplete: number;
    requiresReview: number;
    notVerifiable: number;
  };
}

/**
 * Evaluates deterministic engineering & normative compliance across NBR 5410, IEC 60617,
 * IEC 60909, IEC 61439, and IEC 60204-1 without inventing absent electrical parameters.
 */
export function evaluateNormativeEngineeringCompliance(doc: DiagramDoc): NormativeComplianceReport {
  const topology = validateElectricalTopology(doc);
  const findings: NormativeComplianceFinding[] = [];
  const nodes = Object.values(doc.nodes).filter(
    (n) => n.sheet === "unifilar" || !n.id.startsWith("mf_"),
  );
  const edges = Object.values(doc.edges).filter(
    (e) => e.sheet === "unifilar" || !e.id.startsWith("mf_"),
  );

  // 1. IEC 60617 — Simbologia, identificação e continuidade de topologia
  if (nodes.length === 0) {
    findings.push({
      id: "iec60617_empty",
      standard: "IEC 60617",
      clause: "Topologia Geral",
      status: "INCOMPLETE",
      title: "Diagrama sem componentes cadastrados",
      detail: "Adicione ou importe equipamentos para habilitar verificação topológica completa.",
      entityIds: [],
    });
  } else if (topology.invalidConnections.length > 0) {
    findings.push({
      id: "iec60617_invalid_edges",
      standard: "IEC 60617",
      clause: "Conectividade Canônica",
      status: "INVALID",
      title: `${topology.invalidConnections.length} conexão(ões) inválida(s) no grafo elétrico`,
      detail: topology.invalidConnections.map((c) => c.reason).join(" "),
      entityIds: topology.invalidConnections.map((c) => c.edgeId),
    });
  } else if (topology.disconnectedNodes.length > 0 || topology.paths.some((p) => !p.isComplete)) {
    findings.push({
      id: "iec60617_incomplete_paths",
      standard: "IEC 60617",
      clause: "Continuidade de Circuitos",
      status: "INCOMPLETE",
      title: "Circuitos ou equipamentos sem continuidade elétrica completa",
      detail: `${topology.disconnectedNodes.length} nó(s) desconectado(s); ${topology.paths.filter((p) => !p.isComplete).length} ramal(is) interrompido(s).`,
      entityIds: topology.disconnectedNodes.map((d) => d.nodeId),
    });
  } else {
    findings.push({
      id: "iec60617_topology_ok",
      standard: "IEC 60617",
      clause: "Conectividade Canônica",
      status: "VALID",
      title: "Topologia unifilar contínua e graficamente consistente",
      detail: `${topology.totalEquipments} equipamento(s) e ${topology.totalConnections} conexão(ões) válidas.`,
      entityIds: [],
    });
  }

  // 2. NBR 5410 — Aterramento de proteção (PE) e especificações verificáveis de condutores
  const hasGround = nodes.some((n) => n.params.kind === "ground");
  if (nodes.length > 0 && !hasGround) {
    findings.push({
      id: "nbr5410_pe_missing",
      standard: "NBR 5410",
      clause: "§5.1 / §6.4 Aterramento",
      status: "WARNING",
      title: "Barra ou referência de aterramento (PE) não explícita no diagrama",
      detail: "Inclua elemento de aterramento/equipotencialização (PE) conforme ABNT NBR 5410.",
      entityIds: [],
    });
  }

  const edgesMissingCableParams = edges.filter(
    (e) => e.kind === "power" && (!e.cable?.section_mm2 || !e.cable?.length_m),
  );
  if (edgesMissingCableParams.length > 0) {
    findings.push({
      id: "nbr5410_cable_params_missing",
      standard: "NBR 5410",
      clause: "§6.2.6 / §6.2.7 Condutores e Queda de Tensão",
      status: "NOT_VERIFIABLE",
      title: `Seção/comprimento ausente em ${edgesMissingCableParams.length} condutor(es) de potência`,
      detail:
        "Parâmetros de cabo (mm² e comprimento m) não foram declarados pelo projeto e não foram presumidos automaticamente.",
      entityIds: edgesMissingCableParams.map((e) => e.id),
    });
  }

  // 3. IEC 60909 — Poder de interrupção / curto-circuito nos disjuntores
  const breakers = nodes.filter((n) => n.params.kind === "breaker");
  const breakersWithoutIcc = breakers.filter(
    (b) => b.params.kind === "breaker" && b.params.icc_kA === undefined,
  );
  if (breakers.length > 0 && breakersWithoutIcc.length > 0) {
    findings.push({
      id: "iec60909_icc_missing",
      standard: "IEC 60909",
      clause: "Capacidade de Interrupção (Icu/Icn)",
      status: "NOT_VERIFIABLE",
      title: `${breakersWithoutIcc.length} disjuntor(es) sem Icc (kA) declarada`,
      detail:
        "Informe a capacidade de interrupção nominal (kA) dos disjuntores para validar coordenação de curto-circuito sem presunção.",
      entityIds: breakersWithoutIcc.map((b) => b.id),
    });
  }

  // 4. IEC 61439 — Quadros, barramentos (In do barramento vs disjuntores)
  const busbars = nodes.filter((n) => n.params.kind === "busbar");
  for (const bus of busbars) {
    if (bus.params.kind !== "busbar") continue;
    const busRatedA = bus.params.current_A;
    const feederBreakerIds = edges
      .filter((e) => e.source === bus.id)
      .map((e) => e.target)
      .filter((id) => doc.nodes[id]?.params.kind === "breaker");
    const feederSumA = feederBreakerIds.reduce((sum, id) => {
      const p = doc.nodes[id]?.params;
      return sum + (p && "in_A" in p ? Number(p.in_A) : 0);
    }, 0);
    if (feederSumA > busRatedA * 1.25 && feederBreakerIds.length > 0) {
      findings.push({
        id: `iec61439_bus_capacity_${bus.id}`,
        standard: "IEC 61439",
        clause: "§8.6 / Corrente Nominal de Barramento",
        status: "REQUIRES_ENGINEERING_REVIEW",
        title: `Soma das correntes nominais dos alimentadores (${feederSumA}A) supera barramento ${bus.label || bus.id} (${busRatedA}A)`,
        detail:
          "Aplicar fator de demanda/simultaneidade documentado ou redimensionar barramento conforme IEC 61439.",
        entityIds: [bus.id, ...feederBreakerIds],
      });
    }
  }

  // 5. IEC 60204-1 — Segurança de máquinas (parada de emergência em conjuntos com motores)
  const hasMotor = nodes.some((n) => n.params.kind === "motor");
  const hasEstop = nodes.some((n) => n.params.kind === "estop");
  if (hasMotor && !hasEstop) {
    findings.push({
      id: "iec60204_estop_review",
      standard: "IEC 60204-1",
      clause: "§9.2.2 / §10.7 Parada de Emergência",
      status: "REQUIRES_ENGINEERING_REVIEW",
      title:
        "Conjunto com acionamento de motor sem botoeira/relé de parada de emergência explícito",
      detail:
        "Verifique necessidade de dispositivo E-STOP / categoria de parada de segurança no circuito de comando.",
      entityIds: nodes.filter((n) => n.params.kind === "motor").map((n) => n.id),
    });
  }

  const summary = {
    valid: findings.filter((f) => f.status === "VALID").length,
    invalid: findings.filter((f) => f.status === "INVALID").length,
    warning: findings.filter((f) => f.status === "WARNING").length,
    incomplete: findings.filter((f) => f.status === "INCOMPLETE").length,
    requiresReview: findings.filter((f) => f.status === "REQUIRES_ENGINEERING_REVIEW").length,
    notVerifiable: findings.filter((f) => f.status === "NOT_VERIFIABLE").length,
  };

  let overallStatus: EngineeringComplianceStatus = "VALID";
  if (summary.invalid > 0) {
    overallStatus = "INVALID";
  } else if (summary.incomplete > 0) {
    overallStatus = "INCOMPLETE";
  } else if (summary.requiresReview > 0) {
    overallStatus = "REQUIRES_ENGINEERING_REVIEW";
  } else if (summary.warning > 0) {
    overallStatus = "WARNING";
  } else if (summary.notVerifiable > 0) {
    overallStatus = "NOT_VERIFIABLE";
  }

  return {
    overallStatus,
    topologyStatus: topology.status,
    findings,
    summary,
  };
}
