/**
 * Strict Zod schemas for external boundary validation of CompactProgramModel.
 * Eliminates `any` / `z.any()` at serialization, import, and persistence boundaries.
 */
import { z } from "zod";
import { COMPACT_IO_KINDS, COMPACT_SIGNAL_TYPES, type CompactProgramModel } from "./types";

export const CompactSignalTypeSchema = z.enum(COMPACT_SIGNAL_TYPES);
export const CompactIoKindSchema = z.enum(COMPACT_IO_KINDS);
export const CompactPortDirectionSchema = z.enum(["input", "output"]);
export const CompactParamValueSchema = z.union([z.boolean(), z.number().finite(), z.string()]);

export const CompactBlockCategorySchema = z.enum([
  "io",
  "constant",
  "logic",
  "timer",
  "counter",
  "clock",
  "analog",
  "special",
  "udf",
  "connector",
]);

export const CompactPortInstanceSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
  direction: CompactPortDirectionSchema,
  signalType: CompactSignalTypeSchema,
  negated: z.boolean().optional(),
  required: z.boolean().optional(),
  defaultValue: CompactParamValueSchema.optional(),
});

export const CompactNodeSchema = z.object({
  id: z.string().min(1).max(128),
  pageId: z.string().min(1).max(128),
  blockType: z.string().min(1).max(64),
  instanceName: z.string().min(1).max(64),
  category: CompactBlockCategorySchema,
  libraryVersion: z.string().min(1).max(32),
  udfId: z.string().min(1).max(128).optional(),
  udfVersion: z.string().min(1).max(32).optional(),
  params: z.record(z.string(), CompactParamValueSchema),
  inputs: z.array(CompactPortInstanceSchema),
  outputs: z.array(CompactPortInstanceSchema),
  ioSymbolId: z.string().min(1).max(128).optional(),
  comment: z.string().max(1000).optional(),
  retentive: z.boolean().optional(),
});

export const CompactConnectionSchema = z.object({
  id: z.string().min(1).max(128),
  pageId: z.string().min(1).max(128),
  fromNodeId: z.string().min(1).max(128),
  fromPortId: z.string().min(1).max(128),
  toNodeId: z.string().min(1).max(128),
  toPortId: z.string().min(1).max(128),
  signalType: CompactSignalTypeSchema,
  negatedTarget: z.boolean().optional(),
  comment: z.string().max(500).optional(),
});

export const CompactPageSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(80),
  order: z.number().int().nonnegative(),
  description: z.string().max(500).optional(),
  gridCols: z.number().int().min(4).max(200).default(24),
  gridRows: z.number().int().min(4).max(200).default(16),
});

export const CompactIoSymbolSchema = z.object({
  id: z.string().min(1).max(128),
  ioKind: CompactIoKindSchema,
  address: z.string().min(1).max(32),
  symbolicName: z.string().min(1).max(64),
  signalType: CompactSignalTypeSchema,
  canonicalTagId: z.string().min(1).max(128).optional(),
  comment: z.string().max(500).default(""),
  retentive: z.boolean().default(false),
  initialValue: CompactParamValueSchema,
});

export const CompactUdfPortSpecSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
  direction: CompactPortDirectionSchema,
  signalType: CompactSignalTypeSchema,
  defaultValue: CompactParamValueSchema.optional(),
});

export const CompactUdfParamSpecSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(128),
  signalType: CompactSignalTypeSchema,
  defaultValue: CompactParamValueSchema,
});

export const CompactUdfDefinitionSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Versão SemVer inválida (esperado X.Y.Z)"),
  description: z.string().max(500).default(""),
  ports: z.array(CompactUdfPortSpecSchema),
  params: z.array(CompactUdfParamSpecSchema),
  internalNodes: z.array(CompactNodeSchema),
  internalConnections: z.array(CompactConnectionSchema),
  portBindings: z.record(
    z.string(),
    z.object({
      nodeId: z.string().min(1),
      portId: z.string().min(1),
    }),
  ),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CompactModuleSlotSpecSchema = z.object({
  slotIndex: z.number().int().nonnegative(),
  catalogId: z.string().min(1).max(128),
  partCode: z.string().min(1).max(64),
  family: z.enum([
    "BASE_COMPACT",
    "EXPANSION_DI_DO",
    "EXPANSION_AI",
    "EXPANSION_AO",
    "COMM_MODULE",
    "POWER_SUPPLY",
    "ACCESSORY",
  ]),
  digitalInputs: z.number().int().nonnegative(),
  digitalOutputs: z.number().int().nonnegative(),
  analogInputs: z.number().int().nonnegative(),
  analogOutputs: z.number().int().nonnegative(),
});

export const CompactHardwareArchitectureSchema = z.object({
  baseCatalogId: z.string().min(1).max(128),
  basePartCode: z.string().min(1).max(64),
  supplyCatalogId: z.string().min(1).max(128).optional(),
  hasExternalDisplay: z.boolean().default(false),
  maxBlocks: z.number().int().positive().max(10_000),
  retentiveMemoryBytes: z.number().int().nonnegative().max(1_000_000),
  maxDigitalInputs: z.number().int().nonnegative().max(256),
  maxDigitalOutputs: z.number().int().nonnegative().max(256),
  maxAnalogInputs: z.number().int().nonnegative().max(128),
  maxAnalogOutputs: z.number().int().nonnegative().max(128),
  slots: z.array(CompactModuleSlotSpecSchema),
});

export const CompactVisualNodeLayoutSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  collapsed: z.boolean().optional(),
});

export const CompactVisualEdgeLayoutSchema = z.object({
  waypoints: z.array(z.object({ x: z.number().finite(), y: z.number().finite() })).optional(),
});

export const CompactLayoutStateSchema = z.object({
  fbd: z.record(z.string(), CompactVisualNodeLayoutSchema).default({}),
  lad: z.record(z.string(), CompactVisualNodeLayoutSchema).default({}),
  edgesFbd: z.record(z.string(), CompactVisualEdgeLayoutSchema).default({}),
  edgesLad: z.record(z.string(), CompactVisualEdgeLayoutSchema).default({}),
});

export const CompactProgramRevisionSchema = z.object({
  revision: z.number().int().positive(),
  message: z.string().max(300),
  savedAt: z.string(),
  author: z.string().max(120).optional(),
  programHash: z.string().min(1),
});

export const CompactProgramModelSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(160),
  description: z.string().max(1000).default(""),
  preferredNotation: z.enum(["FBD", "LAD"]).default("FBD"),
  cycleTimeMs: z.number().int().min(5).max(10_000).default(20),
  createdAt: z.string(),
  updatedAt: z.string(),
  pages: z.array(CompactPageSchema).min(1),
  nodes: z.array(CompactNodeSchema),
  connections: z.array(CompactConnectionSchema),
  ioSymbols: z.array(CompactIoSymbolSchema),
  udfs: z.array(CompactUdfDefinitionSchema).default([]),
  hardware: CompactHardwareArchitectureSchema,
  layout: CompactLayoutStateSchema,
  revisions: z.array(CompactProgramRevisionSchema).default([]),
});

export type CompactParseOutcome =
  | { readonly ok: true; readonly model: CompactProgramModel }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Validates untrusted input against {@link CompactProgramModelSchema}.
 */
export function parseCompactProgramModel(raw: unknown): CompactParseOutcome {
  const result = CompactProgramModelSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, model: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`,
    ),
  };
}
