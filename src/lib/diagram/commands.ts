// Command Pattern — toda mutação do DiagramDoc é um comando reversível.
// Comandos são objetos planos { type, payload }. Reducers puros aplicam/invertem.
// History stack com coalescing de moves e suporte a batches.
import { applyDraft, makeEdge, makeNode } from "./model";
import type { AiDiagramPatch } from "./schema";
import type {
  DiagramDoc,
  DiagramEdge,
  DiagramNode,
  NodeParams,
  Position,
} from "./schema";

// ===== tipos de comando =====
export type Command =
  | { type: "AddNode"; node: DiagramNode }
  | { type: "RemoveNode"; nodeId: string }
  | { type: "MoveNode"; nodeId: string; from: Position; to: Position }
  | { type: "RotateNode"; nodeId: string; from: number; to: number }
  | { type: "UpdateNodeLabel"; nodeId: string; from: string; to: string }
  | { type: "UpdateNodeParams"; nodeId: string; from: NodeParams; to: NodeParams }
  | { type: "AddEdge"; edge: DiagramEdge }
  | { type: "RemoveEdge"; edgeId: string }
  | { type: "ApplyAiPatch"; patch: AiDiagramPatch; inverse: Command[] }
  | { type: "Batch"; commands: Command[] };

// ===== aplicar (do) =====
export function applyCommand(doc: DiagramDoc, cmd: Command): DiagramDoc {
  switch (cmd.type) {
    case "AddNode":
      return applyDraft(doc, (d) => {
        d.nodes[cmd.node.id] = cmd.node;
      });
    case "RemoveNode":
      return applyDraft(doc, (d) => {
        delete d.nodes[cmd.nodeId];
        for (const eid of Object.keys(d.edges)) {
          const e = d.edges[eid];
          if (e.source === cmd.nodeId || e.target === cmd.nodeId) delete d.edges[eid];
        }
      });
    case "MoveNode":
      return applyDraft(doc, (d) => {
        const n = d.nodes[cmd.nodeId];
        if (n) n.position = cmd.to;
      });
    case "RotateNode":
      return applyDraft(doc, (d) => {
        const n = d.nodes[cmd.nodeId];
        if (n) n.rotation = cmd.to;
      });
    case "UpdateNodeLabel":
      return applyDraft(doc, (d) => {
        const n = d.nodes[cmd.nodeId];
        if (n) n.label = cmd.to;
      });
    case "UpdateNodeParams":
      return applyDraft(doc, (d) => {
        const n = d.nodes[cmd.nodeId];
        if (n) n.params = cmd.to;
      });
    case "AddEdge":
      return applyDraft(doc, (d) => {
        d.edges[cmd.edge.id] = cmd.edge;
      });
    case "RemoveEdge":
      return applyDraft(doc, (d) => {
        delete d.edges[cmd.edgeId];
      });
    case "ApplyAiPatch": {
      const p = cmd.patch;
      return applyDraft(doc, (d) => {
        for (const id of p.removeEdgeIds) delete d.edges[id];
        for (const id of p.removeNodeIds) {
          delete d.nodes[id];
          for (const eid of Object.keys(d.edges)) {
            const e = d.edges[eid];
            if (e.source === id || e.target === id) delete d.edges[eid];
          }
        }
        for (const u of p.updateNodes) {
          const n = d.nodes[u.id];
          if (!n) continue;
          if (u.position) n.position = u.position;
          if (u.label !== undefined) n.label = u.label;
          if (u.params) n.params = u.params;
        }
        for (const n of p.addNodes) d.nodes[n.id] = n;
        for (const e of p.addEdges) d.edges[e.id] = e;
      });
    }
    case "Batch":
      return cmd.commands.reduce(applyCommand, doc);
  }
}

// ===== inverter (undo) =====
// Para comandos primitivos, o inverso é derivável.
// Para ApplyAiPatch, geramos `inverse` no momento do dispatch e armazenamos.
export function invertCommand(doc: DiagramDoc, cmd: Command): Command | null {
  switch (cmd.type) {
    case "AddNode":
      return { type: "RemoveNode", nodeId: cmd.node.id };
    case "RemoveNode": {
      const node = doc.nodes[cmd.nodeId];
      if (!node) return null;
      const orphanedEdges = Object.values(doc.edges).filter(
        (e) => e.source === cmd.nodeId || e.target === cmd.nodeId,
      );
      return {
        type: "Batch",
        commands: [
          { type: "AddNode", node },
          ...orphanedEdges.map<Command>((e) => ({ type: "AddEdge", edge: e })),
        ],
      };
    }
    case "MoveNode":
      return { type: "MoveNode", nodeId: cmd.nodeId, from: cmd.to, to: cmd.from };
    case "RotateNode":
      return { type: "RotateNode", nodeId: cmd.nodeId, from: cmd.to, to: cmd.from };
    case "UpdateNodeLabel":
      return { type: "UpdateNodeLabel", nodeId: cmd.nodeId, from: cmd.to, to: cmd.from };
    case "UpdateNodeParams":
      return { type: "UpdateNodeParams", nodeId: cmd.nodeId, from: cmd.to, to: cmd.from };
    case "AddEdge":
      return { type: "RemoveEdge", edgeId: cmd.edge.id };
    case "RemoveEdge": {
      const edge = doc.edges[cmd.edgeId];
      return edge ? { type: "AddEdge", edge } : null;
    }
    case "ApplyAiPatch":
      return { type: "Batch", commands: cmd.inverse };
    case "Batch": {
      const inverses: Command[] = [];
      // Aplicar em ordem original capturando estado intermediário para inverter
      let cursor = doc;
      for (const c of cmd.commands) {
        const inv = invertCommand(cursor, c);
        if (inv) inverses.unshift(inv);
        cursor = applyCommand(cursor, c);
      }
      return { type: "Batch", commands: inverses };
    }
  }
}

// ===== builder do patch IA + inverso =====
export function buildAiPatchCommand(doc: DiagramDoc, patch: AiDiagramPatch): Command {
  const inverse: Command[] = [];
  // remover adds
  for (const n of patch.addNodes) inverse.push({ type: "RemoveNode", nodeId: n.id });
  for (const e of patch.addEdges) inverse.push({ type: "RemoveEdge", edgeId: e.id });
  // restaurar removidos
  for (const id of patch.removeNodeIds) {
    const n = doc.nodes[id];
    if (n) inverse.push({ type: "AddNode", node: n });
  }
  for (const id of patch.removeEdgeIds) {
    const e = doc.edges[id];
    if (e) inverse.push({ type: "AddEdge", edge: e });
  }
  // reverter updates
  for (const u of patch.updateNodes) {
    const cur = doc.nodes[u.id];
    if (!cur) continue;
    if (u.position) inverse.push({ type: "MoveNode", nodeId: u.id, from: u.position, to: cur.position });
    if (u.label !== undefined) inverse.push({ type: "UpdateNodeLabel", nodeId: u.id, from: u.label, to: cur.label });
    if (u.params) inverse.push({ type: "UpdateNodeParams", nodeId: u.id, from: u.params, to: cur.params });
  }
  return { type: "ApplyAiPatch", patch, inverse };
}

// helpers de criação de comandos
export const cmd = {
  addNode: (input: Parameters<typeof makeNode>[0]): Command => ({
    type: "AddNode",
    node: makeNode(input),
  }),
  addEdge: (input: Parameters<typeof makeEdge>[0]): Command => ({
    type: "AddEdge",
    edge: makeEdge(input),
  }),
  removeNode: (nodeId: string): Command => ({ type: "RemoveNode", nodeId }),
  removeEdge: (edgeId: string): Command => ({ type: "RemoveEdge", edgeId }),
  move: (nodeId: string, from: Position, to: Position): Command => ({
    type: "MoveNode",
    nodeId,
    from,
    to,
  }),
  rotate: (nodeId: string, from: number, to: number): Command => ({
    type: "RotateNode",
    nodeId,
    from,
    to,
  }),
  batch: (commands: Command[]): Command => ({ type: "Batch", commands }),
};
