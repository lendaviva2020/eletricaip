// Deterministic Electrical Connection Engine & Netlist Resolver
// Standards: IEC 60947, IEC 60617, IEC 60204-1, NBR 5410

import type { DiagramDoc, DiagramNode, DiagramEdge, EdgeKind } from "../schema";
import type { ElectricalConnection } from "@/lib/model/unified-schema";
import type { CanonicalNet, NetMember, TerminalDefinition } from "./types";
import { getEquipmentTerminalProfile } from "./terminal-library";

export interface ResolvedEdgeConnection {
  edge: DiagramEdge;
  connection: ElectricalConnection;
  fromTerminalCode: string;
  toTerminalCode: string;
}

export interface NetlistExtractionResult {
  nets: CanonicalNet[];
  connections: Record<string, ElectricalConnection>;
  resolvedEdges: ResolvedEdgeConnection[];
  orphanEdges: string[];
}

export interface TerminalResolutionResult {
  code: string;
  valid: boolean;
  status:
    | "exact"
    | "compound_alias"
    | "visual_port_role"
    | "default_by_role"
    | "unknown_terminal"
    | "ambiguous_terminal"
    | "direction_mismatch";
  terminal?: TerminalDefinition;
  candidates?: string[];
  reason?: string;
}

const INPUT_SEMANTIC_ALIASES = new Set(["IN", "INPUT", "LINE", "SUPPLY", "IN_R", "IN_S", "IN_T"]);
const OUTPUT_SEMANTIC_ALIASES = new Set(["OUT", "OUTPUT", "LOAD", "OUT_U", "OUT_V", "OUT_W"]);

/**
 * Resolves and validates a terminal allocation against TERMINAL_LIBRARY semantics.
 * Never silently falls back to an unrelated terminal when an explicit invalid port is given,
 * and never assumes universal B/T conventions across incompatible component kinds.
 */
export function resolveTerminalAllocation(
  node: DiagramNode,
  portId?: string,
  role: "source" | "target" = "source",
): TerminalResolutionResult {
  const profile = getEquipmentTerminalProfile(node.params.kind, node.params);
  const terms = profile.terminals;
  const trimmed = portId?.trim();

  if (trimmed) {
    const shortId = trimmed.includes(":")
      ? trimmed.slice(trimmed.lastIndexOf(":") + 1).trim()
      : trimmed;
    const shortUpper = shortId.toUpperCase();
    const normalizedTap = /^TAP_?(\d+)$/.test(shortUpper)
      ? `TAP_${shortUpper.replace(/^TAP_?/, "")}`
      : shortUpper;

    // 1. Exact code match or normalized busbar tap code (TAP_1 / TAP1)
    const exactTerm =
      terms.find((t) => t.code === trimmed || `${node.id}:${t.code}` === trimmed) ??
      terms.find(
        (t) => t.code.toUpperCase() === shortUpper || t.code.toUpperCase() === normalizedTap,
      );
    if (exactTerm) {
      return {
        code: exactTerm.code,
        valid: true,
        status: "exact",
        terminal: exactTerm,
      };
    }

    // 2. Transformer-specific PRI/SEC conventions
    if (node.params.kind === "transformer") {
      if (shortUpper === "PRI" || shortUpper === "PRIMARY") {
        const pri = terms.find((t) => t.code === "H1");
        if (pri) return { code: pri.code, valid: true, status: "compound_alias", terminal: pri };
      }
      if (shortUpper === "SEC" || shortUpper === "SECONDARY") {
        const sec = terms.find((t) => t.code === "X1");
        if (sec) return { code: sec.code, valid: true, status: "compound_alias", terminal: sec };
      }
    }

    // 3. Compound IEC terminal pole alias (e.g. "L1" -> "1/L1", "T1" -> "2/T1")
    const compoundMatches = terms.filter((t) => {
      const tc = t.code.toUpperCase();
      return tc.startsWith(`${shortUpper}/`) || tc.endsWith(`/${shortUpper}`);
    });
    if (compoundMatches.length === 1) {
      return {
        code: compoundMatches[0].code,
        valid: true,
        status: "compound_alias",
        terminal: compoundMatches[0],
      };
    }
    if (compoundMatches.length > 1) {
      return {
        code: shortId,
        valid: false,
        status: "ambiguous_terminal",
        candidates: compoundMatches.map((m) => m.code),
        reason: `Terminal abreviado '${shortId}' é ambíguo em '${node.label || node.id}' (${compoundMatches.map((m) => m.code).join(", ")}).`,
      };
    }

    // 4. Canvas visual port match (only ports physically present on this component profile)
    const pUpper = shortUpper;
    const portMatches = terms.filter(
      (t) => t.portId === shortId || t.portId.toUpperCase() === pUpper,
    );
    if (portMatches.length > 0) {
      const dirMatches = portMatches.filter((t) =>
        role === "source"
          ? t.direction === "out" || t.direction === "bidirectional"
          : t.direction === "in" || t.direction === "bidirectional",
      );
      const picked = dirMatches[0] ?? portMatches[0];
      return {
        code: picked.code,
        valid: true,
        status: "visual_port_role",
        terminal: picked,
      };
    }

    // 5. Semantic flow aliases (only if component actually declares a role-compatible terminal)
    if (INPUT_SEMANTIC_ALIASES.has(shortUpper)) {
      const inTerm = terms.find((t) => t.direction === "in" || t.direction === "bidirectional");
      if (inTerm) {
        return { code: inTerm.code, valid: true, status: "compound_alias", terminal: inTerm };
      }
    }
    if (OUTPUT_SEMANTIC_ALIASES.has(shortUpper)) {
      const outTerm = terms.find((t) => t.direction === "out" || t.direction === "bidirectional");
      if (outTerm) {
        return { code: outTerm.code, valid: true, status: "compound_alias", terminal: outTerm };
      }
    }

    // 6. Explicitly provided terminal/port does NOT exist in this component's catalog
    return {
      code: shortId,
      valid: false,
      status: "unknown_terminal",
      reason: `Terminal '${shortId}' não pertence ao catálogo de '${node.label || node.id}' (${node.params.kind}). Terminais válidos: ${terms.map((t) => t.code).join(", ")}.`,
    };
  }

  // No portId supplied: select strictly by role & component's declared terminals (never coerce load IN as power OUT)
  if (role === "source") {
    const candidates = terms.filter(
      (t) => t.direction === "out" || t.direction === "bidirectional",
    );
    const preferred = candidates.find((t) => t.portId === profile.defaultOutPort) ?? candidates[0];
    if (preferred) {
      return {
        code: preferred.code,
        valid: true,
        status: "default_by_role",
        terminal: preferred,
      };
    }
    return {
      code: terms[0]?.code ?? "UNRESOLVED_SOURCE",
      valid: false,
      status: "direction_mismatch",
      reason: `Equipamento '${node.label || node.id}' (${node.params.kind}) não possui terminal de saída declarado para atuar como origem sem especificação explícita.`,
    };
  }

  const inCandidates = terms.filter((t) => t.direction === "in" || t.direction === "bidirectional");
  const inPreferred =
    inCandidates.find((t) => t.portId === profile.defaultInPort) ?? inCandidates[0];
  if (inPreferred) {
    return {
      code: inPreferred.code,
      valid: true,
      status: "default_by_role",
      terminal: inPreferred,
    };
  }
  return {
    code: terms[0]?.code ?? "UNRESOLVED_TARGET",
    valid: false,
    status: "direction_mismatch",
    reason: `Equipamento '${node.label || node.id}' (${node.params.kind}) não possui terminal de entrada declarado para receber alimentação.`,
  };
}

/**
 * Resolves the terminal code on a node given an explicit port or role.
 */
export function resolveTerminalCode(
  node: DiagramNode,
  portId?: string,
  role: "source" | "target" = "source",
): string {
  return resolveTerminalAllocation(node, portId, role).code;
}

/**
 * Maps an Edge to its canonical terminal IDs and verifies connection compatibility.
 */
export function mapEdgeToElectricalConnection(
  edge: DiagramEdge,
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
): ResolvedEdgeConnection {
  const fromCode = resolveTerminalCode(sourceNode, edge.sourcePort, "source");
  const toCode = resolveTerminalCode(targetNode, edge.targetPort, "target");

  const fromTerminalId = `${sourceNode.id}:${fromCode}`;
  const toTerminalId = `${targetNode.id}:${toCode}`;

  const connection: ElectricalConnection = {
    id: edge.id,
    fromEquipmentId: sourceNode.id,
    fromTerminalId,
    toEquipmentId: targetNode.id,
    toTerminalId,
    kind: edge.kind,
    circuitConfig: edge.circuitConfig,
    conductor: edge.cable
      ? {
          crossSectionMm2: edge.cable.section_mm2 ?? 2.5,
          material: "Cu",
          insulation: edge.cable.insulation ?? "PVC",
          lengthM: edge.cable.length_m ?? 10,
          installationMethod: edge.cable.installation ?? "B1",
        }
      : undefined,
  };

  const updatedEdge: DiagramEdge = {
    ...edge,
    sourcePort: edge.sourcePort || fromCode,
    targetPort: edge.targetPort || toCode,
  };

  return {
    edge: updatedEdge,
    connection,
    fromTerminalCode: fromCode,
    toTerminalCode: toCode,
  };
}

/**
 * Builds the canonical Netlist from a DiagramDoc by merging connected terminals
 * into equipotential electrical nets (CanonicalNet).
 */
export function buildNetlistFromDiagram(doc: DiagramDoc): NetlistExtractionResult {
  const connections: Record<string, ElectricalConnection> = {};
  const resolvedEdges: ResolvedEdgeConnection[] = [];
  const orphanEdges: string[] = [];

  // Union-Find structure to group terminals into nets
  const parent = new Map<string, string>();
  const terminalMembers = new Map<string, NetMember>();

  function find(id: string): string {
    const p = parent.get(id);
    if (!p || p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  }

  function union(idA: string, idB: string): void {
    const rootA = find(idA);
    const rootB = find(idB);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  }

  for (const edge of Object.values(doc.edges)) {
    const srcNode = doc.nodes[edge.source];
    const tgtNode = doc.nodes[edge.target];

    if (!srcNode || !tgtNode) {
      orphanEdges.push(edge.id);
      continue;
    }

    const resolved = mapEdgeToElectricalConnection(edge, srcNode, tgtNode);
    resolvedEdges.push(resolved);
    connections[edge.id] = resolved.connection;

    const fromTermId = resolved.connection.fromTerminalId;
    const toTermId = resolved.connection.toTerminalId;

    const srcProfile = getEquipmentTerminalProfile(srcNode.params.kind, srcNode.params);
    const tgtProfile = getEquipmentTerminalProfile(tgtNode.params.kind, tgtNode.params);

    const srcDef = srcProfile.terminals.find((t) => t.code === resolved.fromTerminalCode);
    const tgtDef = tgtProfile.terminals.find((t) => t.code === resolved.toTerminalCode);

    if (!terminalMembers.has(fromTermId)) {
      terminalMembers.set(fromTermId, {
        equipmentId: srcNode.id,
        terminalId: fromTermId,
        terminalCode: resolved.fromTerminalCode,
        direction: srcDef?.direction,
        nature: srcDef?.nature ?? "power",
        phase: srcDef?.phase,
      });
      parent.set(fromTermId, fromTermId);
    }

    if (!terminalMembers.has(toTermId)) {
      terminalMembers.set(toTermId, {
        equipmentId: tgtNode.id,
        terminalId: toTermId,
        terminalCode: resolved.toTerminalCode,
        direction: tgtDef?.direction,
        nature: tgtDef?.nature ?? "power",
        phase: tgtDef?.phase,
      });
      parent.set(toTermId, toTermId);
    }

    union(fromTermId, toTermId);
  }

  // Group members into nets
  const netGroups = new Map<string, { members: NetMember[]; connIds: Set<string> }>();

  for (const [termId, member] of terminalMembers.entries()) {
    const root = find(termId);
    if (!netGroups.has(root)) {
      netGroups.set(root, { members: [], connIds: new Set() });
    }
    netGroups.get(root)!.members.push(member);
  }

  for (const res of resolvedEdges) {
    const root = find(res.connection.fromTerminalId);
    netGroups.get(root)?.connIds.add(res.edge.id);
  }

  const nets: CanonicalNet[] = [];
  let netCounter = 1;

  for (const [rootId, group] of netGroups.entries()) {
    const firstMember = group.members[0];
    const isPE = group.members.some((m) => m.phase === "PE" || m.nature === "protection");
    const isN = group.members.some((m) => m.phase === "N");
    const nature = isPE ? "protection" : firstMember ? firstMember.nature : "power";
    const phase = isPE ? "PE" : isN ? "N" : (firstMember?.phase ?? "any");

    nets.push({
      id: `NET_${rootId.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      name: `Rede ${netCounter++} (${phase.toUpperCase()})`,
      nature,
      phase,
      members: group.members,
      connectionIds: Array.from(group.connIds),
    });
  }

  return {
    nets,
    connections,
    resolvedEdges,
    orphanEdges,
  };
}

/**
 * Connects two equipment nodes deterministically, choosing the appropriate
 * terminals and geometric ports, returning a valid DiagramEdge.
 */
export function createDeterministicConnection(
  sourceNode: DiagramNode,
  targetNode: DiagramNode,
  opts?: {
    sourcePort?: string;
    targetPort?: string;
    kind?: EdgeKind;
    circuitConfig?: DiagramEdge["circuitConfig"];
    sheet?: DiagramEdge["sheet"];
  },
): DiagramEdge {
  const fromCode = opts?.sourcePort ?? resolveTerminalCode(sourceNode, undefined, "source");
  const toCode = opts?.targetPort ?? resolveTerminalCode(targetNode, undefined, "target");

  const edgeId = `e_${sourceNode.id}_${targetNode.id}_${fromCode}_${toCode}`.replace(
    /[^a-zA-Z0-9_]/g,
    "_",
  );

  return {
    id: edgeId,
    sheet: opts?.sheet ?? sourceNode.sheet ?? "unifilar",
    source: sourceNode.id,
    target: targetNode.id,
    sourcePort: fromCode,
    targetPort: toCode,
    kind: opts?.kind ?? "power",
    circuitConfig: opts?.circuitConfig ?? "3F+N+PE",
  };
}

/**
 * Connects multiple branch nodes to a central busbar using the exact tap terminals
 * configured in the busbar's hardware profile (TAP_1..TAP_N).
 * Never silently wraps around modulo tap count.
 */
export function connectBusbarToBranches(
  busbarNode: DiagramNode,
  branchNodes: DiagramNode[],
): DiagramEdge[] {
  const profile = getEquipmentTerminalProfile(busbarNode.params.kind, busbarNode.params);
  const tapTerminals = profile.terminals.filter(
    (t) => t.code.startsWith("TAP_") && t.direction === "out",
  );

  if (branchNodes.length > tapTerminals.length) {
    throw new Error(
      `Barramento '${busbarNode.label || busbarNode.id}' suporta ${tapTerminals.length} derivações na configuração de hardware (taps), insuficiente para ${branchNodes.length} ramais.`,
    );
  }

  const edges: DiagramEdge[] = [];

  branchNodes.forEach((bNode, idx) => {
    const tapTerm = tapTerminals[idx];
    const targetAlloc = resolveTerminalAllocation(bNode, undefined, "target");
    if (!targetAlloc.valid) {
      throw new Error(
        targetAlloc.reason ||
          `Componente destino '${bNode.label || bNode.id}' não possui terminal de entrada compatível.`,
      );
    }

    edges.push({
      id: `e_${busbarNode.id}_${bNode.id}_tap${idx + 1}`.replace(/[^a-zA-Z0-9_]/g, "_"),
      sheet: "unifilar",
      source: busbarNode.id,
      target: bNode.id,
      sourcePort: tapTerm.code,
      targetPort: targetAlloc.code,
      kind: "power",
      circuitConfig: "3F+N+PE",
    });
  });

  return edges;
}
