/**
 * Pure Clipboard (Zod-validated), Alignment, Orthogonal Routing, Block Instantiation,
 * and Viewport Virtualization helpers for >1,000-block Compact Studio diagrams.
 */
import { z } from "zod";
import {
  CompactConnectionSchema,
  CompactNodeSchema,
  CompactVisualNodeLayoutSchema,
} from "../domain/schemas";
import type {
  CompactBlockCategory,
  CompactConnection,
  CompactNode,
  CompactNotation,
  CompactParamValue,
  CompactPortInstance,
  CompactProgramModel,
  CompactSignalType,
  CompactVisualNodeLayout,
  CompactVisualPoint,
} from "../domain/types";
import { getCompactStudioRegistry } from "../runtime/compact-blocks";

export const CompactClipboardPayloadSchema = z.object({
  kind: z.literal("eletric-compact-clipboard-v1"),
  nodes: z.array(CompactNodeSchema).max(500),
  connections: z.array(CompactConnectionSchema).max(1000),
  layouts: z.record(z.string(), CompactVisualNodeLayoutSchema),
});

export type CompactClipboardPayload = z.infer<typeof CompactClipboardPayloadSchema>;

function toSignalType(portType: string): CompactSignalType {
  switch (portType) {
    case "INT":
    case "ANY_INT":
      return "INT";
    case "REAL":
    case "ANY_REAL":
    case "ANY_NUM":
    case "ANY_MAGNITUDE":
      return "REAL";
    case "TIME":
      return "TIME";
    case "BYTE":
      return "BYTE";
    case "WORD":
      return "WORD";
    case "STRING":
    case "ANY_STRING":
      return "STRING";
    default:
      return "BOOL";
  }
}

function categoryFromBlockType(blockType: string, registryCategory?: string): CompactBlockCategory {
  if (
    blockType.startsWith("INPUT_") ||
    blockType.startsWith("OUTPUT_") ||
    blockType.startsWith("FLAG_")
  ) {
    return "io";
  }
  if (blockType.startsWith("CONST_") || blockType === "HIGH" || blockType === "LOW") {
    return "constant";
  }
  if (blockType === "PAGE_IN" || blockType === "PAGE_OUT") return "connector";
  if (blockType === "WEEKLY_TIMER" || blockType === "YEARLY_TIMER") return "clock";
  if (registryCategory === "Temporizador") return "timer";
  if (registryCategory === "Contador") return "counter";
  if (
    blockType.startsWith("ANALOG_") ||
    blockType === "PI_CONTROLLER" ||
    blockType === "MATH_EXPR_SAFE"
  ) {
    return "analog";
  }
  if (
    registryCategory === "Lógica" ||
    registryCategory === "Memória" ||
    registryCategory === "Borda"
  ) {
    return "logic";
  }
  return "special";
}

/**
 * Creates a strictly typed CompactNode from the single shared BlockRegistry.
 */
export function createCompactBlockNode(opts: {
  readonly id: string;
  readonly pageId: string;
  readonly blockType: string;
  readonly instanceName: string;
  readonly params?: Record<string, CompactParamValue>;
  readonly ioSymbolId?: string;
}): CompactNode {
  const reg = getCompactStudioRegistry();
  const def = reg.get(opts.blockType);

  if (opts.blockType === "INPUT_DI" || opts.blockType === "FLAG_M") {
    return {
      id: opts.id,
      pageId: opts.pageId,
      blockType: opts.blockType,
      instanceName: opts.instanceName,
      category: "io",
      libraryVersion: "1.0.0",
      ioSymbolId: opts.ioSymbolId,
      params: { address: opts.instanceName, ...(opts.params ?? {}) },
      inputs: [],
      outputs: [{ id: "out", name: "OUT", direction: "output", signalType: "BOOL" }],
    };
  }
  if (opts.blockType === "INPUT_AI" || opts.blockType === "FLAG_AM") {
    return {
      id: opts.id,
      pageId: opts.pageId,
      blockType: opts.blockType,
      instanceName: opts.instanceName,
      category: "io",
      libraryVersion: "1.0.0",
      ioSymbolId: opts.ioSymbolId,
      params: { address: opts.instanceName, ...(opts.params ?? {}) },
      inputs: [],
      outputs: [{ id: "out", name: "OUT", direction: "output", signalType: "REAL" }],
    };
  }
  if (opts.blockType === "OUTPUT_QO" || opts.blockType === "OUTPUT_AO") {
    const sig: CompactSignalType = opts.blockType === "OUTPUT_AO" ? "REAL" : "BOOL";
    return {
      id: opts.id,
      pageId: opts.pageId,
      blockType: opts.blockType,
      instanceName: opts.instanceName,
      category: "io",
      libraryVersion: "1.0.0",
      ioSymbolId: opts.ioSymbolId,
      params: { address: opts.instanceName, ...(opts.params ?? {}) },
      inputs: [{ id: "in", name: "IN", direction: "input", signalType: sig, required: true }],
      outputs: [],
    };
  }
  if (opts.blockType === "PAGE_OUT" || opts.blockType === "PAGE_IN") {
    const isOut = opts.blockType === "PAGE_OUT";
    return {
      id: opts.id,
      pageId: opts.pageId,
      blockType: opts.blockType,
      instanceName: opts.instanceName,
      category: "connector",
      libraryVersion: "1.0.0",
      params: { connectorKey: opts.instanceName, ...(opts.params ?? {}) },
      inputs: isOut
        ? [{ id: "in", name: "IN", direction: "input", signalType: "BOOL", required: true }]
        : [],
      outputs: !isOut ? [{ id: "out", name: "OUT", direction: "output", signalType: "BOOL" }] : [],
    };
  }

  const inputs: CompactPortInstance[] = (def?.inputs ?? []).map((p) => ({
    id: p.name.toLowerCase(),
    name: p.name,
    direction: "input",
    signalType: toSignalType(p.type),
    required: p.required,
    defaultValue: p.defaultValue,
  }));

  const outputs: CompactPortInstance[] = (def?.outputs ?? []).map((p) => ({
    id: p.name.toLowerCase(),
    name: p.name,
    direction: "output",
    signalType: toSignalType(p.type),
  }));

  return {
    id: opts.id,
    pageId: opts.pageId,
    blockType: opts.blockType,
    instanceName: opts.instanceName,
    category: categoryFromBlockType(opts.blockType, def?.category),
    libraryVersion: def?.version ?? "1.0.0",
    params: { ...(opts.params ?? {}) },
    inputs,
    outputs,
  };
}

export function copySelectionToClipboard(
  model: CompactProgramModel,
  selectedNodeIds: readonly string[],
  notation: CompactNotation,
): CompactClipboardPayload {
  const idSet = new Set(selectedNodeIds);
  const nodes = model.nodes.filter((n) => idSet.has(n.id));
  const connections = model.connections.filter(
    (c) => idSet.has(c.fromNodeId) && idSet.has(c.toNodeId),
  );
  const layoutBucket = notation === "FBD" ? model.layout.fbd : model.layout.lad;
  const layouts: Record<string, CompactVisualNodeLayout> = {};
  for (const n of nodes) {
    layouts[n.id] = layoutBucket[n.id] ?? { x: 80, y: 80 };
  }
  return {
    kind: "eletric-compact-clipboard-v1",
    nodes,
    connections,
    layouts,
  };
}

export function pasteClipboardIntoPage(
  model: CompactProgramModel,
  rawClipboard: unknown,
  targetPageId: string,
  notation: CompactNotation,
  idPrefix: string,
  offset: { readonly x: number; readonly y: number } = { x: 40, y: 40 },
): { readonly model: CompactProgramModel; readonly pastedNodeIds: readonly string[] } {
  const parsed = CompactClipboardPayloadSchema.safeParse(rawClipboard);
  if (!parsed.success) {
    throw new Error("CLIPBOARD_SECURITY_ERROR: Conteúdo da área de transferência inválido.");
  }
  const payload = parsed.data;
  const idMap = new Map<string, string>();
  const nextNodes = [...model.nodes];
  const nextLayoutBucket = {
    ...(notation === "FBD" ? model.layout.fbd : model.layout.lad),
  };
  const pastedNodeIds: string[] = [];

  payload.nodes.forEach((n, idx) => {
    const newId = `${idPrefix}_n_${idx + 1}`;
    idMap.set(n.id, newId);
    pastedNodeIds.push(newId);
    nextNodes.push({
      ...n,
      id: newId,
      pageId: targetPageId,
      instanceName: `${n.instanceName}_copy`,
    });
    const origPos = payload.layouts[n.id] ?? { x: 80, y: 80 };
    nextLayoutBucket[newId] = {
      ...origPos,
      x: origPos.x + offset.x,
      y: origPos.y + offset.y,
    };
  });

  const nextConns: CompactConnection[] = [...model.connections];
  payload.connections.forEach((c, idx) => {
    const fromNodeId = idMap.get(c.fromNodeId);
    const toNodeId = idMap.get(c.toNodeId);
    if (!fromNodeId || !toNodeId) return;
    nextConns.push({
      ...c,
      id: `${idPrefix}_c_${idx + 1}`,
      pageId: targetPageId,
      fromNodeId,
      toNodeId,
    });
  });

  return {
    model: {
      ...model,
      nodes: nextNodes,
      connections: nextConns,
      layout: {
        ...model.layout,
        [notation === "FBD" ? "fbd" : "lad"]: nextLayoutBucket,
      },
    },
    pastedNodeIds,
  };
}

export type AlignMode =
  "left" | "center" | "right" | "top" | "middle" | "bottom" | "distribute_v" | "grid_snap";

/**
 * Aligns selected nodes exclusively in the visual layout bucket without altering logic.
 */
export function alignCompactNodes(
  model: CompactProgramModel,
  notation: CompactNotation,
  nodeIds: readonly string[],
  mode: AlignMode,
  gridSize = 20,
): CompactProgramModel {
  if (nodeIds.length === 0) return model;
  const bucketKey = notation === "FBD" ? "fbd" : "lad";
  const bucket = { ...model.layout[bucketKey] };
  const positions = nodeIds.map((id) => ({
    id,
    pos: bucket[id] ?? { x: 0, y: 0 },
  }));

  if (mode === "grid_snap") {
    for (const item of positions) {
      bucket[item.id] = {
        ...item.pos,
        x: Math.round(item.pos.x / gridSize) * gridSize,
        y: Math.round(item.pos.y / gridSize) * gridSize,
      };
    }
  } else if (mode === "left") {
    const minX = Math.min(...positions.map((p) => p.pos.x));
    for (const item of positions) bucket[item.id] = { ...item.pos, x: minX };
  } else if (mode === "right") {
    const maxX = Math.max(...positions.map((p) => p.pos.x));
    for (const item of positions) bucket[item.id] = { ...item.pos, x: maxX };
  } else if (mode === "center") {
    const avgX = positions.reduce((s, p) => s + p.pos.x, 0) / positions.length;
    for (const item of positions) bucket[item.id] = { ...item.pos, x: Math.round(avgX) };
  } else if (mode === "top") {
    const minY = Math.min(...positions.map((p) => p.pos.y));
    for (const item of positions) bucket[item.id] = { ...item.pos, y: minY };
  } else if (mode === "bottom") {
    const maxY = Math.max(...positions.map((p) => p.pos.y));
    for (const item of positions) bucket[item.id] = { ...item.pos, y: maxY };
  } else if (mode === "middle") {
    const avgY = positions.reduce((s, p) => s + p.pos.y, 0) / positions.length;
    for (const item of positions) bucket[item.id] = { ...item.pos, y: Math.round(avgY) };
  } else if (mode === "distribute_v" && positions.length >= 3) {
    const sorted = [...positions].sort((a, b) => a.pos.y - b.pos.y);
    const minY = sorted[0].pos.y;
    const maxY = sorted[sorted.length - 1].pos.y;
    const step = (maxY - minY) / (sorted.length - 1);
    sorted.forEach((item, idx) => {
      bucket[item.id] = { ...item.pos, y: Math.round(minY + idx * step) };
    });
  }

  return {
    ...model,
    layout: {
      ...model.layout,
      [bucketKey]: bucket,
    },
  };
}

/**
 * Generates clean orthogonal Manhattan waypoints between two ports.
 */
export function computeOrthogonalEdgeWaypoints(
  from: CompactVisualPoint,
  to: CompactVisualPoint,
): CompactVisualPoint[] {
  const midX = Math.round((from.x + to.x) / 2);
  if (to.x >= from.x + 20) {
    return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
  }
  // Feedback loop routing underneath or above
  const detourY = Math.max(from.y, to.y) + 60;
  return [
    from,
    { x: from.x + 24, y: from.y },
    { x: from.x + 24, y: detourY },
    { x: to.x - 24, y: detourY },
    { x: to.x - 24, y: to.y },
    to,
  ];
}

export interface ViewportRect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly zoom: number;
}

/**
 * Filters nodes intersecting the visible viewport (with safety margin) and computes LOD tier.
 * Ensures smooth 60fps rendering on >1,000-block diagrams.
 */
export function getVisibleNodesForViewport(
  model: CompactProgramModel,
  pageId: string,
  notation: CompactNotation,
  viewport: ViewportRect,
  marginPx = 240,
): {
  readonly visibleNodes: readonly CompactNode[];
  readonly lodLevel: "full" | "compact";
} {
  const bucket = notation === "FBD" ? model.layout.fbd : model.layout.lad;
  const visibleNodes: CompactNode[] = [];
  for (const node of model.nodes) {
    if (node.pageId !== pageId) continue;
    const pos = bucket[node.id] ?? { x: 0, y: 0 };
    const w = pos.width ?? 180;
    const h = pos.height ?? 110;
    if (
      pos.x + w >= viewport.minX - marginPx &&
      pos.x <= viewport.maxX + marginPx &&
      pos.y + h >= viewport.minY - marginPx &&
      pos.y <= viewport.maxY + marginPx
    ) {
      visibleNodes.push(node);
    }
  }
  return {
    visibleNodes,
    lodLevel: viewport.zoom < 0.4 ? "compact" : "full",
  };
}
