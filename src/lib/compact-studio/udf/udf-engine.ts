/**
 * UDF (User-Defined Function Block), Hierarchical Macro, Cycle Detection & SemVer Migration Engine.
 * Reuses SemVer from `@/lib/studio/libraries/library-manager`.
 */
import { z } from "zod";
import { SemVer } from "@/lib/studio/libraries/library-manager";
import { CompactUdfDefinitionSchema } from "../domain/schemas";
import type {
  CompactDiagnostic,
  CompactNode,
  CompactParamValue,
  CompactProgramModel,
  CompactUdfDefinition,
  CompactUdfPortSpec,
} from "../domain/types";

export const CompactUdfLibraryPackageSchema = z.object({
  kind: z.literal("eletric-compact-udf-library-v1"),
  libraryName: z.string().min(1).max(120),
  version: z.string().refine((v) => SemVer.parse(v) !== null, {
    message: "Versão SemVer inválida (esperado X.Y.Z)",
  }),
  definitions: z.array(CompactUdfDefinitionSchema).min(1),
  exportedAt: z.string().min(1),
});

export type CompactUdfLibraryPackage = z.infer<typeof CompactUdfLibraryPackageSchema>;

/**
 * Extracts selected subgraph nodes & internal connections into a versioned UDF definition,
 * automatically exposing external boundary pins.
 */
export function createUdfDefinitionFromSubgraph(
  model: CompactProgramModel,
  opts: {
    readonly id: string;
    readonly name: string;
    readonly version?: string;
    readonly description?: string;
    readonly nodeIds: readonly string[];
    readonly nowIso?: string;
  },
): CompactUdfDefinition {
  const version = opts.version ?? "1.0.0";
  if (!SemVer.parse(version)) {
    throw new Error(`UDF_INVALID_SEMVER: '${version}' não segue Semantic Versioning X.Y.Z.`);
  }
  const nowIso = opts.nowIso ?? "2026-01-01T00:00:00.000Z";
  const selectedSet = new Set(opts.nodeIds);

  const internalNodes = model.nodes
    .filter((n) => selectedSet.has(n.id))
    .map((n) => ({ ...n, params: { ...n.params } }));

  const internalConnections = model.connections.filter(
    (c) => selectedSet.has(c.fromNodeId) && selectedSet.has(c.toNodeId),
  );

  const ports: CompactUdfPortSpec[] = [];
  const portBindings: Record<string, { nodeId: string; portId: string }> = {};

  // Expose unconnected input pins of internal nodes as UDF input ports
  const wiredTargets = new Set(internalConnections.map((c) => `${c.toNodeId}:${c.toPortId}`));
  const wiredSources = new Set(internalConnections.map((c) => `${c.fromNodeId}:${c.fromPortId}`));

  let inSeq = 1;
  let outSeq = 1;
  for (const node of internalNodes) {
    for (const p of node.inputs) {
      if (!wiredTargets.has(`${node.id}:${p.id}`)) {
        const extId = `in_${inSeq}`;
        ports.push({
          id: extId,
          name: `IN${inSeq++}`,
          direction: "input",
          signalType: p.signalType,
          defaultValue: p.defaultValue,
        });
        portBindings[extId] = { nodeId: node.id, portId: p.id };
      }
    }
    for (const p of node.outputs) {
      if (!wiredSources.has(`${node.id}:${p.id}`)) {
        const extId = `out_${outSeq}`;
        ports.push({
          id: extId,
          name: `Q${outSeq++}`,
          direction: "output",
          signalType: p.signalType,
        });
        portBindings[extId] = { nodeId: node.id, portId: p.id };
      }
    }
  }

  return {
    id: opts.id,
    name: opts.name,
    version,
    description: opts.description ?? "",
    ports,
    params: [],
    internalNodes,
    internalConnections,
    portBindings,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Instantiates a UDF call block on a canvas page.
 * Each instance compiles with a unique namespace prefix so internal timers/latches stay isolated.
 */
export function instantiateUdfNode(
  def: CompactUdfDefinition,
  opts: {
    readonly nodeId: string;
    readonly pageId: string;
    readonly instanceName: string;
    readonly paramOverrides?: Record<string, CompactParamValue>;
  },
): CompactNode {
  const params: Record<string, CompactParamValue> = {};
  for (const p of def.params) {
    params[p.key] = p.defaultValue;
  }
  Object.assign(params, opts.paramOverrides ?? {});

  return {
    id: opts.nodeId,
    pageId: opts.pageId,
    blockType: "UDF",
    instanceName: opts.instanceName,
    category: "udf",
    libraryVersion: def.version,
    udfId: def.id,
    udfVersion: def.version,
    params,
    inputs: def.ports
      .filter((p) => p.direction === "input")
      .map((p) => ({
        id: p.id,
        name: p.name,
        direction: "input" as const,
        signalType: p.signalType,
        defaultValue: p.defaultValue,
      })),
    outputs: def.ports
      .filter((p) => p.direction === "output")
      .map((p) => ({
        id: p.id,
        name: p.name,
        direction: "output" as const,
        signalType: p.signalType,
      })),
  };
}

/**
 * Detects direct or indirect recursion cycles across hierarchical UDF definitions.
 */
export function detectUdfCycles(
  definitions: readonly CompactUdfDefinition[],
): readonly CompactDiagnostic[] {
  const byId = new Map<string, CompactUdfDefinition>();
  for (const d of definitions) {
    byId.set(`${d.id}@${d.version}`, d);
    if (!byId.has(d.id)) byId.set(d.id, d);
  }

  const diagnostics: CompactDiagnostic[] = [];
  const reported = new Set<string>();

  const dfs = (def: CompactUdfDefinition, stack: string[]) => {
    for (const inner of def.internalNodes) {
      if (inner.blockType !== "UDF" && inner.category !== "udf") continue;
      if (!inner.udfId) continue;
      const targetKey = inner.udfVersion ? `${inner.udfId}@${inner.udfVersion}` : inner.udfId;
      const childDef = byId.get(targetKey) ?? byId.get(inner.udfId);
      if (!childDef) continue;

      if (stack.includes(childDef.id)) {
        const sig = [...stack, childDef.id].join(" -> ");
        if (!reported.has(sig)) {
          reported.add(sig);
          diagnostics.push({
            id: `udf_cycle_${childDef.id}_${stack.length}`,
            severity: "error",
            code: "UDF_RECURSION_CYCLE",
            messageKey: "compactStudio.diag.udfRecursionCycle",
            message: `Ciclo recursivo detectado em UDFs: ${sig}.`,
            nodeId: inner.id,
          });
        }
        continue;
      }
      dfs(childDef, [...stack, childDef.id]);
    }
  };

  for (const d of definitions) {
    dfs(d, [d.id]);
  }
  return diagnostics;
}

export interface UdfMigrationResult {
  readonly model: CompactProgramModel;
  readonly migratedCount: number;
  readonly diagnostics: readonly CompactDiagnostic[];
}

/**
 * Safely registers/updates a UDF definition and migrates existing instances in the model,
 * preserving parameter overrides and reporting removed/incompatible pins without corruption.
 */
export function migrateUdfDefinitionVersion(
  model: CompactProgramModel,
  nextDef: CompactUdfDefinition,
): UdfMigrationResult {
  if (!SemVer.parse(nextDef.version)) {
    throw new Error(`UDF_INVALID_SEMVER: '${nextDef.version}' inválido.`);
  }

  const cycleCheck = detectUdfCycles([...model.udfs.filter((u) => u.id !== nextDef.id), nextDef]);
  if (cycleCheck.length > 0) {
    return { model, migratedCount: 0, diagnostics: cycleCheck };
  }

  const existingSameOrOther = model.udfs.filter((u) => u.id !== nextDef.id);
  const previousVersions = model.udfs.filter((u) => u.id === nextDef.id);
  const newestPrev = previousVersions.slice().sort((a, b) => {
    const pa = SemVer.parse(a.version);
    const pb = SemVer.parse(b.version);
    if (!pa || !pb) return 0;
    return SemVer.compare(pb, pa);
  })[0];

  const diagnostics: CompactDiagnostic[] = [];
  const nextParsed = SemVer.parse(nextDef.version);
  const prevParsed = newestPrev ? SemVer.parse(newestPrev.version) : null;
  if (newestPrev && nextParsed && prevParsed && SemVer.compare(nextParsed, prevParsed) < 0) {
    diagnostics.push({
      id: `udf_downgrade_${nextDef.id}`,
      severity: "warning",
      code: "UDF_VERSION_DOWNGRADE",
      messageKey: "compactStudio.diag.udfVersionDowngrade",
      message: `Versão ${nextDef.version} de '${nextDef.name}' é inferior à versão atual ${newestPrev.version}.`,
    });
  }

  const nextInputSpecs = nextDef.ports.filter((p) => p.direction === "input");
  const nextOutputSpecs = nextDef.ports.filter((p) => p.direction === "output");
  const nextPortSet = new Set(nextDef.ports.map((p) => p.id));

  let migratedCount = 0;
  const updatedNodes: CompactNode[] = model.nodes.map((node) => {
    if (node.udfId !== nextDef.id) return node;
    migratedCount += 1;

    // Flag any connections referencing removed pins
    for (const c of model.connections) {
      if (c.toNodeId === node.id && !nextPortSet.has(c.toPortId)) {
        diagnostics.push({
          id: `udf_lost_in_${c.id}`,
          severity: "warning",
          code: "UDF_PORT_REMOVED_ON_MIGRATION",
          messageKey: "compactStudio.diag.udfPortRemoved",
          message: `Instância '${node.instanceName}' perdeu pino de entrada '${c.toPortId}' ao migrar para v${nextDef.version}.`,
          nodeId: node.id,
        });
      }
      if (c.fromNodeId === node.id && !nextPortSet.has(c.fromPortId)) {
        diagnostics.push({
          id: `udf_lost_out_${c.id}`,
          severity: "warning",
          code: "UDF_PORT_REMOVED_ON_MIGRATION",
          messageKey: "compactStudio.diag.udfPortRemoved",
          message: `Instância '${node.instanceName}' perdeu pino de saída '${c.fromPortId}' ao migrar para v${nextDef.version}.`,
          nodeId: node.id,
        });
      }
    }

    const mergedParams: Record<string, CompactParamValue> = {};
    for (const p of nextDef.params) {
      mergedParams[p.key] = node.params[p.key] !== undefined ? node.params[p.key] : p.defaultValue;
    }

    return {
      ...node,
      libraryVersion: nextDef.version,
      udfVersion: nextDef.version,
      params: { ...mergedParams, ...node.params },
      inputs: nextInputSpecs.map((p) => ({
        id: p.id,
        name: p.name,
        direction: "input" as const,
        signalType: p.signalType,
        defaultValue: p.defaultValue,
      })),
      outputs: nextOutputSpecs.map((p) => ({
        id: p.id,
        name: p.name,
        direction: "output" as const,
        signalType: p.signalType,
      })),
    };
  });

  // Remove orphaned connections pointing to removed pins so the model stays valid
  const cleanedConnections = model.connections.filter((c) => {
    const srcNode = updatedNodes.find((n) => n.id === c.fromNodeId);
    const dstNode = updatedNodes.find((n) => n.id === c.toNodeId);
    if (srcNode?.udfId === nextDef.id && !nextPortSet.has(c.fromPortId)) return false;
    if (dstNode?.udfId === nextDef.id && !nextPortSet.has(c.toPortId)) return false;
    return true;
  });

  return {
    model: {
      ...model,
      udfs: [...existingSameOrOther, nextDef],
      nodes: updatedNodes,
      connections: cleanedConnections,
    },
    migratedCount,
    diagnostics,
  };
}

export function exportUdfLibraryPackage(
  libraryName: string,
  version: string,
  definitions: readonly CompactUdfDefinition[],
  exportedAtIso: string,
): CompactUdfLibraryPackage {
  return CompactUdfLibraryPackageSchema.parse({
    kind: "eletric-compact-udf-library-v1",
    libraryName,
    version,
    definitions: [...definitions],
    exportedAt: exportedAtIso,
  });
}

export function parseUdfLibraryPackage(raw: unknown): CompactUdfLibraryPackage {
  return CompactUdfLibraryPackageSchema.parse(raw);
}
