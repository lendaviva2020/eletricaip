// Deterministic Electrical Connection Engine & Netlist Resolver
// Standards: IEC 60947, IEC 60617, IEC 60204-1, NBR 5410

import type { DiagramDoc, DiagramNode, DiagramEdge, EdgeKind } from "../schema";
import type { ElectricalConnection } from "@/lib/model/unified-schema";
import type { CanonicalNet, NetMember } from "./types";
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

/**
 * Resolves the terminal code on a node given an explicit port or fallback direction.
 */
export function resolveTerminalCode(
  node: DiagramNode,
  portId?: string,
  role: "source" | "target" = "source",
): string {
  const profile = getEquipmentTerminalProfile(node.params.kind, node.params);
  const terms = profile.terminals;

  // 1. If portId matches a terminal code directly
  const exactTerm = terms.find((t) => t.code === portId || `${node.id}:${t.code}` === portId);
  if (exactTerm) return exactTerm.code;

  // 2. If portId matches a canvas render portId (e.g. "T", "B", "B1")
  if (portId) {
    const portMatch = terms.find((t) => t.portId === portId);
    if (portMatch) return portMatch.code;
  }

  // 3. Fallback based on direction: source -> output, target -> input
  if (role === "source") {
    const outTerm = terms.find((t) => t.direction === "out") ?? terms[1] ?? terms[0];
    return outTerm ? outTerm.code : "out";
  } else {
    const inTerm = terms.find((t) => t.direction === "in") ?? terms[0];
    return inTerm ? inTerm.code : "in";
  }
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
 * Connects multiple branch nodes to a central busbar distributing across
 * available tap ports (B1, B2, B, B3, B4, etc.).
 */
export function connectBusbarToBranches(
  busbarNode: DiagramNode,
  branchNodes: DiagramNode[],
): DiagramEdge[] {
  const tapPorts = ["B1", "B2", "B", "B3", "B4", "L", "R"];
  const edges: DiagramEdge[] = [];

  branchNodes.forEach((bNode, idx) => {
    const tapPort = tapPorts[idx % tapPorts.length] || `B${idx + 1}`;
    const targetInPort = resolveTerminalCode(bNode, undefined, "target");

    edges.push({
      id: `e_${busbarNode.id}_${bNode.id}_tap${idx + 1}`.replace(/[^a-zA-Z0-9_]/g, "_"),
      sheet: "unifilar",
      source: busbarNode.id,
      target: bNode.id,
      sourcePort: tapPort,
      targetPort: targetInPort,
      kind: "power",
      circuitConfig: "3F+N+PE",
    });
  });

  return edges;
}
