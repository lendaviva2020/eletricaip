/**
 * Compiler Adapter: CompactProgramModel -> Canonical FbdDocument -> Shared IEC Compiler/IR.
 *
 * Enforces D3 ("no second runtime"): both FBD and LAD projections compile through
 * `compileFbd` and run on `FbdRuntime`. Handles multi-page wiring (`PAGE_OUT -> PAGE_IN`),
 * explicit pin inversions (`NOT`), I/O symbolic bindings (`VAR_IN`/`VAR_OUT`), and constants.
 */
import {
  compileFbd,
  type CompileResult,
  type FbdConnectionModel,
  type FbdDocument,
  type FbdNodeModel,
  type FbdValue,
  type FbdVariable,
} from "@/lib/fbd/engine";
import type { CompactNode, CompactProgramModel } from "../domain/types";
import { getCompactStudioRegistry, SIM_CLOCK_VAR_NAME } from "./compact-blocks";
import { DEFAULT_SIMULATED_EPOCH_MS } from "./simulated-clock";

export interface CompiledCompactMapping {
  readonly compileResult: CompileResult;
  readonly fbdDocument: FbdDocument;
  readonly ioVarByNodeId: Readonly<Record<string, string>>;
}

function sanitizeVarId(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `V_${cleaned}`;
}

function toElementaryType(sig: string): FbdVariable["dataType"] {
  switch (sig) {
    case "INT":
    case "REAL":
    case "TIME":
    case "BYTE":
    case "WORD":
    case "STRING":
    case "BOOL":
      return sig;
    default:
      return "BOOL";
  }
}

function expandUdfInstances(model: CompactProgramModel): {
  nodes: CompactNode[];
  connections: CompactProgramModel["connections"];
} {
  const udfMap = new Map(model.udfs.map((u) => [`${u.id}@${u.version}`, u]));
  const flatNodes: CompactNode[] = [];
  const flatConns = [...model.connections];
  const expandedMap = new Map<
    string,
    { portBindings: Record<string, { nodeId: string; portId: string }> }
  >();

  for (const node of model.nodes) {
    if (node.blockType !== "UDF" && node.category !== "udf") {
      flatNodes.push(node);
      continue;
    }
    const key = node.udfId && node.udfVersion ? `${node.udfId}@${node.udfVersion}` : "";
    const def = udfMap.get(key) ?? model.udfs.find((u) => u.id === node.udfId);
    if (!def) {
      flatNodes.push(node);
      continue;
    }

    const prefix = `${node.id}__udf__`;
    const renamedBindings: Record<string, { nodeId: string; portId: string }> = {};
    for (const [extPort, target] of Object.entries(def.portBindings)) {
      renamedBindings[extPort] = {
        nodeId: `${prefix}${target.nodeId}`,
        portId: target.portId,
      };
    }
    expandedMap.set(node.id, { portBindings: renamedBindings });

    for (const inner of def.internalNodes) {
      flatNodes.push({
        ...inner,
        id: `${prefix}${inner.id}`,
        pageId: node.pageId,
        instanceName: `${node.instanceName}_${inner.instanceName}`,
        params: {
          ...inner.params,
          ...node.params,
        },
      });
    }
    for (const ic of def.internalConnections) {
      flatConns.push({
        ...ic,
        id: `${prefix}${ic.id}`,
        pageId: node.pageId,
        fromNodeId: `${prefix}${ic.fromNodeId}`,
        toNodeId: `${prefix}${ic.toNodeId}`,
      });
    }
  }

  // Rewire external connections attached to expanded UDF instances
  const rewiredConns = flatConns.map((c) => {
    const srcUdf = expandedMap.get(c.fromNodeId);
    const dstUdf = expandedMap.get(c.toNodeId);
    let fromNodeId = c.fromNodeId;
    let fromPortId = c.fromPortId;
    let toNodeId = c.toNodeId;
    let toPortId = c.toPortId;
    if (srcUdf && srcUdf.portBindings[fromPortId]) {
      fromNodeId = srcUdf.portBindings[fromPortId].nodeId;
      fromPortId = srcUdf.portBindings[fromPortId].portId;
    }
    if (dstUdf && dstUdf.portBindings[toPortId]) {
      toNodeId = dstUdf.portBindings[toPortId].nodeId;
      toPortId = dstUdf.portBindings[toPortId].portId;
    }
    return { ...c, fromNodeId, fromPortId, toNodeId, toPortId };
  });

  return { nodes: flatNodes, connections: rewiredConns };
}

/**
 * Translates a canonical {@link CompactProgramModel} into the shared `FbdDocument`
 * and compiles it via {@link compileFbd} on the single shared `BlockRegistry`.
 */
export function compileCompactProgram(model: CompactProgramModel): CompiledCompactMapping {
  const registry = getCompactStudioRegistry();
  const { nodes: expandedNodes, connections: expandedConns } = expandUdfInstances(model);

  const variables: FbdVariable[] = [
    {
      name: SIM_CLOCK_VAR_NAME,
      dataType: "REAL",
      direction: "local",
      initialValue: DEFAULT_SIMULATED_EPOCH_MS,
      comment: "Relógio simulado injetado (ms)",
    },
  ];
  const declaredVarNames = new Set<string>([SIM_CLOCK_VAR_NAME]);

  const symbolById = new Map(model.ioSymbols.map((s) => [s.id, s]));
  const ioVarByNodeId: Record<string, string> = {};

  const ensureVariable = (
    name: string,
    dataType: FbdVariable["dataType"],
    direction: FbdVariable["direction"],
    initialValue: FbdValue,
  ): string => {
    const validName = sanitizeVarId(name);
    if (!declaredVarNames.has(validName)) {
      declaredVarNames.add(validName);
      variables.push({
        name: validName,
        dataType,
        direction,
        initialValue,
      });
    }
    return validName;
  };

  for (const sym of model.ioSymbols) {
    const dir: FbdVariable["direction"] =
      sym.ioKind === "DI" || sym.ioKind === "AI" || sym.ioKind === "NI" || sym.ioKind === "NAI"
        ? "input"
        : sym.ioKind === "DO" || sym.ioKind === "AO" || sym.ioKind === "NQ" || sym.ioKind === "NAQ"
          ? "output"
          : "local";
    ensureVariable(
      sym.symbolicName || sym.address,
      toElementaryType(sym.signalType),
      dir,
      sym.initialValue,
    );
  }

  const fbdNodes: FbdNodeModel[] = [];
  const fbdConns: FbdConnectionModel[] = [];
  let synthSeq = 1;
  const nodeById = new Map(expandedNodes.map((n) => [n.id, n]));

  // Map PAGE_OUT key -> incoming source port
  const pageOutSources = new Map<string, { nodeId: string; port: string }>();
  const pageInIds = new Map<string, string>(); // nodeId -> connectorKey

  for (const node of expandedNodes) {
    const layoutPos = model.layout.fbd[node.id] ?? { x: 0, y: 0 };

    if (node.blockType === "PAGE_OUT") {
      const key = String(node.params.connectorKey ?? node.instanceName).trim();
      const incoming = expandedConns.find((c) => c.toNodeId === node.id);
      if (incoming) {
        const srcNode = nodeById.get(incoming.fromNodeId);
        const srcPort =
          srcNode?.outputs.find((p) => p.id === incoming.fromPortId)?.name ?? incoming.fromPortId;
        pageOutSources.set(key, { nodeId: incoming.fromNodeId, port: srcPort.toUpperCase() });
      }
      continue;
    }

    if (node.blockType === "PAGE_IN") {
      const key = String(node.params.connectorKey ?? node.instanceName).trim();
      pageInIds.set(node.id, key);
      continue;
    }

    if (
      node.blockType === "INPUT_DI" ||
      node.blockType === "INPUT_AI" ||
      node.blockType === "FLAG_M" ||
      node.blockType === "FLAG_AM"
    ) {
      const sym = node.ioSymbolId ? symbolById.get(node.ioSymbolId) : undefined;
      const varName = ensureVariable(
        sym?.symbolicName ?? String(node.params.address ?? node.instanceName),
        node.blockType === "INPUT_AI" || node.blockType === "FLAG_AM" ? "REAL" : "BOOL",
        node.blockType.startsWith("FLAG_") ? "local" : "input",
        node.blockType === "INPUT_AI" || node.blockType === "FLAG_AM" ? 0 : false,
      );
      ioVarByNodeId[node.id] = varName;
      fbdNodes.push({
        id: node.id,
        instanceName: sanitizeVarId(node.instanceName),
        blockType: "VAR_IN",
        networkId: node.pageId,
        params: { name: varName },
        position: { x: layoutPos.x, y: layoutPos.y },
      });
      continue;
    }

    if (node.blockType === "OUTPUT_QO" || node.blockType === "OUTPUT_AO") {
      const sym = node.ioSymbolId ? symbolById.get(node.ioSymbolId) : undefined;
      const varName = ensureVariable(
        sym?.symbolicName ?? String(node.params.address ?? node.instanceName),
        node.blockType === "OUTPUT_AO" ? "REAL" : "BOOL",
        "output",
        node.blockType === "OUTPUT_AO" ? 0 : false,
      );
      ioVarByNodeId[node.id] = varName;
      fbdNodes.push({
        id: node.id,
        instanceName: sanitizeVarId(node.instanceName),
        blockType: "VAR_OUT",
        networkId: node.pageId,
        params: { name: varName },
        position: { x: layoutPos.x, y: layoutPos.y },
      });
      continue;
    }

    if (node.blockType.startsWith("CONST_")) {
      const dt = toElementaryType(node.blockType.replace("CONST_", ""));
      fbdNodes.push({
        id: node.id,
        instanceName: sanitizeVarId(node.instanceName),
        blockType: "CONST",
        networkId: node.pageId,
        params: {
          dataType: dt,
          value: node.params.value ?? (dt === "BOOL" ? false : 0),
        },
        position: { x: layoutPos.x, y: layoutPos.y },
      });
      continue;
    }

    const mergedParams: Record<string, FbdValue> = { ...node.params };
    for (const inp of node.inputs) {
      const upperName = inp.name.toUpperCase();
      if (mergedParams[upperName] === undefined && inp.defaultValue !== undefined) {
        mergedParams[upperName] = inp.defaultValue;
      }
    }

    fbdNodes.push({
      id: node.id,
      instanceName: sanitizeVarId(node.instanceName),
      blockType: node.blockType,
      networkId: node.pageId,
      params: mergedParams,
      position: { x: layoutPos.x, y: layoutPos.y },
    });
  }

  for (const conn of expandedConns) {
    const toNode = nodeById.get(conn.toNodeId);
    if (!toNode || toNode.blockType === "PAGE_OUT" || toNode.blockType === "PAGE_IN") continue;

    let sourceNodeId = conn.fromNodeId;
    let sourcePortName: string;

    if (pageInIds.has(conn.fromNodeId)) {
      const key = pageInIds.get(conn.fromNodeId)!;
      const upstream = pageOutSources.get(key);
      if (!upstream) continue;
      sourceNodeId = upstream.nodeId;
      sourcePortName = upstream.port;
    } else {
      const fromNode = nodeById.get(conn.fromNodeId);
      if (!fromNode) continue;
      sourcePortName = (
        fromNode.outputs.find((p) => p.id === conn.fromPortId)?.name ?? conn.fromPortId
      ).toUpperCase();
    }

    const targetPortObj = toNode.inputs.find((p) => p.id === conn.toPortId);
    const targetPortName = (targetPortObj?.name ?? conn.toPortId).toUpperCase();
    const isNegated = Boolean(conn.negatedTarget || targetPortObj?.negated);

    if (isNegated && conn.signalType === "BOOL") {
      // Insert deterministic NOT gate in compiled IR without mutating user model
      const notNodeId = `${conn.id}__not_${synthSeq++}`;
      fbdNodes.push({
        id: notNodeId,
        instanceName: sanitizeVarId(`NOT_${notNodeId}`),
        blockType: "NOT",
        networkId: conn.pageId,
        params: {},
        position: { x: 0, y: 0 },
      });
      fbdConns.push({
        id: `${conn.id}_in`,
        source: { nodeId: sourceNodeId, port: sourcePortName },
        target: { nodeId: notNodeId, port: "IN" },
      });
      fbdConns.push({
        id: `${conn.id}_out`,
        source: { nodeId: notNodeId, port: "OUT" },
        target: { nodeId: conn.toNodeId, port: targetPortName },
      });
    } else {
      fbdConns.push({
        id: conn.id,
        source: { nodeId: sourceNodeId, port: sourcePortName },
        target: { nodeId: conn.toNodeId, port: targetPortName },
      });
    }
  }

  const networks = [...model.pages]
    .sort((a, b) => a.order - b.order)
    .map((p, idx) => ({
      id: p.id,
      name: p.name,
      executionOrder: idx,
      enabled: true,
    }));

  const fbdDocument: FbdDocument = {
    id: model.id,
    name: model.name,
    version: 1,
    cycleTimeMs: model.cycleTimeMs,
    networks:
      networks.length > 0
        ? networks
        : [{ id: "page-1", name: "Página 1", executionOrder: 0, enabled: true }],
    nodes: fbdNodes,
    connections: fbdConns,
    variables,
  };

  const compileResult = compileFbd(fbdDocument, registry);
  return { compileResult, fbdDocument, ioVarByNodeId };
}
