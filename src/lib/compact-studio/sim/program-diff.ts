/**
 * Structural Program Diff Engine between two CompactProgramModel revisions.
 */
import type { CompactConnection, CompactNode, CompactProgramModel } from "../domain/types";

export interface NodeDiffEntry {
  readonly nodeId: string;
  readonly instanceName: string;
  readonly blockType: string;
  readonly kind: "added" | "removed" | "modified";
  readonly details: string;
}

export interface ConnectionDiffEntry {
  readonly connectionId: string;
  readonly kind: "added" | "removed" | "modified";
  readonly summary: string;
}

export interface CompactProgramDiffReport {
  readonly hasChanges: boolean;
  readonly addedNodesCount: number;
  readonly removedNodesCount: number;
  readonly modifiedNodesCount: number;
  readonly addedConnectionsCount: number;
  readonly removedConnectionsCount: number;
  readonly hardwareChanged: boolean;
  readonly ioSymbolsChanged: boolean;
  readonly nodeDiffs: readonly NodeDiffEntry[];
  readonly connectionDiffs: readonly ConnectionDiffEntry[];
}

function stableParamsString(node: CompactNode): string {
  const keys = Object.keys(node.params).sort();
  return JSON.stringify(keys.map((k) => [k, node.params[k]]));
}

function connKey(c: CompactConnection): string {
  return `${c.fromNodeId}.${c.fromPortId}->${c.toNodeId}.${c.toPortId}:${Boolean(c.negatedTarget)}`;
}

export function compareCompactPrograms(
  prevModel: CompactProgramModel,
  nextModel: CompactProgramModel,
): CompactProgramDiffReport {
  const prevNodes = new Map(prevModel.nodes.map((n) => [n.id, n]));
  const nextNodes = new Map(nextModel.nodes.map((n) => [n.id, n]));
  const nodeDiffs: NodeDiffEntry[] = [];

  for (const [id, nextN] of nextNodes.entries()) {
    const prevN = prevNodes.get(id);
    if (!prevN) {
      nodeDiffs.push({
        nodeId: id,
        instanceName: nextN.instanceName,
        blockType: nextN.blockType,
        kind: "added",
        details: `Bloco '${nextN.instanceName}' (${nextN.blockType}) adicionado.`,
      });
      continue;
    }
    if (
      prevN.blockType !== nextN.blockType ||
      prevN.instanceName !== nextN.instanceName ||
      stableParamsString(prevN) !== stableParamsString(nextN) ||
      Boolean(prevN.retentive) !== Boolean(nextN.retentive)
    ) {
      nodeDiffs.push({
        nodeId: id,
        instanceName: nextN.instanceName,
        blockType: nextN.blockType,
        kind: "modified",
        details: `Parâmetros/propriedades de '${nextN.instanceName}' (${nextN.blockType}) alterados.`,
      });
    }
  }

  for (const [id, prevN] of prevNodes.entries()) {
    if (!nextNodes.has(id)) {
      nodeDiffs.push({
        nodeId: id,
        instanceName: prevN.instanceName,
        blockType: prevN.blockType,
        kind: "removed",
        details: `Bloco '${prevN.instanceName}' (${prevN.blockType}) removido.`,
      });
    }
  }

  const prevConns = new Map(prevModel.connections.map((c) => [c.id, c]));
  const nextConns = new Map(nextModel.connections.map((c) => [c.id, c]));
  const connectionDiffs: ConnectionDiffEntry[] = [];

  for (const [id, nextC] of nextConns.entries()) {
    const prevC = prevConns.get(id);
    if (!prevC) {
      connectionDiffs.push({
        connectionId: id,
        kind: "added",
        summary: `Ligação adicionada: ${connKey(nextC)}`,
      });
    } else if (connKey(prevC) !== connKey(nextC)) {
      connectionDiffs.push({
        connectionId: id,
        kind: "modified",
        summary: `Ligação alterada: ${connKey(prevC)} -> ${connKey(nextC)}`,
      });
    }
  }
  for (const [id, prevC] of prevConns.entries()) {
    if (!nextConns.has(id)) {
      connectionDiffs.push({
        connectionId: id,
        kind: "removed",
        summary: `Ligação removida: ${connKey(prevC)}`,
      });
    }
  }

  const hardwareChanged =
    prevModel.hardware.baseCatalogId !== nextModel.hardware.baseCatalogId ||
    JSON.stringify(prevModel.hardware.slots) !== JSON.stringify(nextModel.hardware.slots);
  const ioSymbolsChanged =
    JSON.stringify(prevModel.ioSymbols) !== JSON.stringify(nextModel.ioSymbols);

  const addedNodesCount = nodeDiffs.filter((d) => d.kind === "added").length;
  const removedNodesCount = nodeDiffs.filter((d) => d.kind === "removed").length;
  const modifiedNodesCount = nodeDiffs.filter((d) => d.kind === "modified").length;
  const addedConnectionsCount = connectionDiffs.filter((c) => c.kind === "added").length;
  const removedConnectionsCount = connectionDiffs.filter((c) => c.kind === "removed").length;

  return {
    hasChanges:
      nodeDiffs.length > 0 || connectionDiffs.length > 0 || hardwareChanged || ioSymbolsChanged,
    addedNodesCount,
    removedNodesCount,
    modifiedNodesCount,
    addedConnectionsCount,
    removedConnectionsCount,
    hardwareChanged,
    ioSymbolsChanged,
    nodeDiffs,
    connectionDiffs,
  };
}
