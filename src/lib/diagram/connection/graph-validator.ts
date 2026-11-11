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
import { buildNetlistFromDiagram, resolveTerminalCode } from "./connection-engine";

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

  for (const n of nodes) {
    incomingEdges.set(n.id, []);
    outgoingEdges.set(n.id, []);
  }

  // 1. Structural edge validation & orphan checks
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

    const fromCode = resolveTerminalCode(srcNode, e.sourcePort, "source");
    const toCode = resolveTerminalCode(tgtNode, e.targetPort, "target");

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
    const srcProfile = getEquipmentTerminalProfile(srcNode.params.kind, srcNode.params);
    const tgtProfile = getEquipmentTerminalProfile(tgtNode.params.kind, tgtNode.params);

    const srcTerm = srcProfile.terminals.find((t) => t.code === fromCode);
    const tgtTerm = tgtProfile.terminals.find((t) => t.code === toCode);

    if (srcTerm && tgtTerm) {
      if (
        srcTerm.nature === "power" &&
        tgtTerm.nature === "control" &&
        tgtNode.params.kind !== "psu"
      ) {
        // Warning: Direct power wired to control input without PSU/step-down
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
