// AI Diagnostic Repair Context & Engine
// Standards: IEC 60947, IEC 61131-3, ABNT NBR 5410, NR-10, ISA-18.2
// Structures and strictly validates diagnostic context across all engineering modules.

import { create } from "zustand";
import { z } from "zod";
import type { DiagnosticAlert } from "@/lib/diagram/multifilar";
import type { LadderIssue } from "@/lib/ladder/validator";
import type { NormFinding } from "@/lib/norm-validator";

export const MAX_DIAGNOSTIC_PAYLOAD_BYTES = 16_384;

const SafeIdSchema = z.string().trim().min(1).max(128);
const SafeShortTextSchema = z.string().trim().max(256);
const SafeLongTextSchema = z.string().trim().max(2000);

const UnifilarSourceContextSchema = z
  .object({
    kind: z.literal("unifilar"),
    alertType: z.enum(["ERRO", "AVISO", "INFO"]).optional(),
    nodeId: SafeIdSchema.optional(),
    edgeId: SafeIdSchema.optional(),
    assumptions: z.array(SafeShortTextSchema).max(20).optional(),
    ib_A: z.number().finite().nonnegative().optional(),
    iz_A: z.number().finite().nonnegative().optional(),
  })
  .strict();

const MultifilarSourceContextSchema = z
  .object({
    kind: z.literal("multifilar"),
    alertType: z.enum(["ERRO", "AVISO", "INFO"]).optional(),
    nodeId: SafeIdSchema.optional(),
    edgeId: SafeIdSchema.optional(),
    circuitConfig: z.string().max(32).optional(),
    assumptions: z.array(SafeShortTextSchema).max(20).optional(),
  })
  .strict();

const LadderSourceContextSchema = z
  .object({
    kind: z.literal("ladder"),
    rungId: SafeIdSchema,
    elementId: SafeIdSchema.optional(),
    fixHint: SafeShortTextSchema.optional(),
  })
  .strict();

const FbdSourceContextSchema = z
  .object({
    kind: z.literal("fbd"),
    nodeId: SafeIdSchema.optional(),
    edgeId: SafeIdSchema.optional(),
    blockType: z.string().max(64).optional(),
    portId: z.string().max(64).optional(),
    fixHint: SafeShortTextSchema.optional(),
  })
  .strict();

const PlcSourceContextSchema = z
  .object({
    kind: z.literal("plc"),
    cpuModel: z.string().max(64).optional(),
    rungOrNetworkId: SafeIdSchema.optional(),
    tagName: SafeIdSchema.optional(),
    address: z.string().max(64).optional(),
    slot: z.number().int().min(0).max(64).optional(),
  })
  .strict();

const HardwareSourceContextSchema = z
  .object({
    kind: z.literal("hardware"),
    slotIndex: z.number().int().min(0).max(64).optional(),
    moduleCatalogId: SafeIdSchema.optional(),
    busLimitMa: z.number().finite().nonnegative().optional(),
    busDrawMa: z.number().finite().nonnegative().optional(),
    incompatibleReason: SafeShortTextSchema.optional(),
  })
  .strict();

const IoSourceContextSchema = z
  .object({
    kind: z.literal("io"),
    tagName: SafeIdSchema.optional(),
    address: z.string().max(64).optional(),
    ioType: z.enum(["DI", "DQ", "AI", "AQ", "M", "V"]).optional(),
    channel: z.number().int().min(0).max(1024).optional(),
    duplicatedWith: SafeIdSchema.optional(),
  })
  .strict();

const CommsSourceContextSchema = z
  .object({
    kind: z.literal("comms"),
    protocol: z.enum(["OPC-UA", "Modbus-TCP", "Modbus-RTU", "S7", "EtherNet/IP", "MQTT", "Other"]),
    endpoint: z.string().max(256).optional(),
    nodeIdOrRegister: z.string().max(128).optional(),
    errorCode: z.string().max(64).optional(),
  })
  .strict();

const SimulationSourceContextSchema = z
  .object({
    kind: z.literal("simulation"),
    stepCount: z.number().int().nonnegative().optional(),
    overloadedEquipmentIds: z.array(SafeIdSchema).max(30).optional(),
    openCircuitIds: z.array(SafeIdSchema).max(30).optional(),
    busVoltageV: z.number().finite().nonnegative().optional(),
    totalCurrentA: z.number().finite().nonnegative().optional(),
  })
  .strict();

const ValidationSourceContextSchema = z
  .object({
    kind: z.literal("validation"),
    norm: z.string().max(64),
    clause: z.string().max(64).optional(),
    nodeId: SafeIdSchema.optional(),
    fixHint: SafeShortTextSchema.optional(),
  })
  .strict();

const ScadaSourceContextSchema = z
  .object({
    kind: z.literal("scada"),
    alarmId: SafeIdSchema.optional(),
    tag: SafeIdSchema.optional(),
    isaPriority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "DIAGNOSTIC"]).optional(),
    equipmentId: SafeIdSchema.optional(),
    timestamp: z.string().max(64).optional(),
  })
  .strict();

const ImporterSourceContextSchema = z
  .object({
    kind: z.literal("importer"),
    category: z.string().max(64),
    entityId: SafeIdSchema.optional(),
    format: z.string().max(32).optional(),
  })
  .strict();

export const SourceContextSchema = z.discriminatedUnion("kind", [
  UnifilarSourceContextSchema,
  MultifilarSourceContextSchema,
  LadderSourceContextSchema,
  FbdSourceContextSchema,
  PlcSourceContextSchema,
  HardwareSourceContextSchema,
  IoSourceContextSchema,
  CommsSourceContextSchema,
  SimulationSourceContextSchema,
  ValidationSourceContextSchema,
  ScadaSourceContextSchema,
  ImporterSourceContextSchema,
]);

export type DiagnosticSourceContext = z.infer<typeof SourceContextSchema>;

export const DiagnosticModuleSchema = z.enum([
  "unifilar",
  "multifilar",
  "ladder",
  "fbd",
  "plc",
  "hardware",
  "io",
  "comms",
  "simulation",
  "validation",
  "scada",
  "importer",
]);

export const DiagnosticContextSchema = z
  .object({
    project_id: SafeIdSchema,
    organization_id: SafeIdSchema.optional(),
    module: DiagnosticModuleSchema,
    diagnostic_id: SafeIdSchema,
    error_code: z.string().trim().min(1).max(64),
    severity: z.enum(["critical", "warning", "info"]),
    error_message: SafeLongTextSchema.min(1),
    technical_details: z.string().max(4000).optional(),
    affected_components: z.array(SafeIdSchema).max(50).default([]),
    affected_connections: z.array(SafeIdSchema).max(50).default([]),
    affected_variables: z.array(SafeIdSchema).max(50).default([]),
    source_context: SourceContextSchema.optional(),
    project_revision: z.number().int().nonnegative().optional(),
    runtime_state: z.string().max(64).optional(),
    related_diagnostics: z
      .array(
        z
          .object({
            diagnostic_id: SafeIdSchema,
            error_code: z.string().max(64),
            message: SafeLongTextSchema,
          })
          .strict(),
      )
      .max(20)
      .default([])
      .optional(),
  })
  .strict()
  .superRefine((ctx, issueCtx) => {
    if (ctx.source_context && ctx.source_context.kind !== ctx.module) {
      issueCtx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source_context", "kind"],
        message: `source_context.kind ('${ctx.source_context.kind}') deve corresponder ao módulo '${ctx.module}'.`,
      });
    }
    const encodedBytes = new TextEncoder().encode(JSON.stringify(ctx)).byteLength;
    if (encodedBytes > MAX_DIAGNOSTIC_PAYLOAD_BYTES) {
      issueCtx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Payload diagnóstico (${encodedBytes} bytes) excede o limite de ${MAX_DIAGNOSTIC_PAYLOAD_BYTES} bytes.`,
      });
    }
  });

export type DiagnosticContext = z.infer<typeof DiagnosticContextSchema>;

/**
 * Generates a deterministic stable identifier using FNV-1a hashing (never Date.now()).
 */
export function deterministicDiagnosticId(
  prefix: string,
  parts: ReadonlyArray<string | number | undefined | null>,
): string {
  const canonical = parts
    .map((p) => (p === undefined || p === null ? "" : String(p).trim()))
    .join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "diag";
  return `${cleanPrefix}_${hex}`;
}

const SENSITIVE_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bAIza[0-9A-Za-z\-_]{20,}\b/g, replacement: "[REDACTED_API_KEY]" },
  { pattern: /\bsk-[0-9A-Za-z\-_]{16,}\b/g, replacement: "[REDACTED_SECRET_KEY]" },
  {
    pattern: /\bsb_(?:secret|publishable)_[0-9A-Za-z\-_]+\b/g,
    replacement: "[REDACTED_SUPABASE_KEY]",
  },
  {
    pattern: /\beyJ[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\b/g,
    replacement: "[REDACTED_JWT]",
  },
  { pattern: /\bBearer\s+[0-9A-Za-z\-_.~+/]+=*/gi, replacement: "Bearer [REDACTED_TOKEN]" },
  {
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/gi,
    replacement: "[REDACTED_DSN]",
  },
  {
    pattern:
      /((?:password|passwd|pwd|secret|api_key|apikey|token|credential)\s*[:=]\s*)([^\s,;'"}\]]+)/gi,
    replacement: "$1[REDACTED]",
  },
];

export function redactSensitiveText(input: string): string {
  let out = input;
  for (const rule of SENSITIVE_PATTERNS) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactSensitiveText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = sanitizeValue(v);
      }
    }
    return out;
  }
  return value;
}

/**
 * Redacts sensitive secrets/tokens, validates strictly against DiagnosticContextSchema,
 * and enforces payload limits before any UI dispatch or AI transmission.
 */
export function validateAndSanitizeDiagnosticContext(raw: unknown): DiagnosticContext {
  const sanitized = sanitizeValue(raw);
  return DiagnosticContextSchema.parse(sanitized);
}

/**
 * Safely serializes validated DiagnosticContext within byte bounds for AI repair calls.
 */
export function serializeDiagnosticContextForAi(context: DiagnosticContext): string {
  const validated = validateAndSanitizeDiagnosticContext(context);
  return JSON.stringify(validated);
}

export interface AiDiagnosticRepairStoreState {
  pendingContext: DiagnosticContext | null;
  batchContexts: DiagnosticContext[];
  isOpen: boolean;
  openRepairWithContext: (context: DiagnosticContext) => void;
  openRepairWithBatch: (contexts: DiagnosticContext[]) => void;
  clearRepair: () => void;
  setOpen: (open: boolean) => void;
}

export const useAiDiagnosticRepairStore = create<AiDiagnosticRepairStoreState>((set) => ({
  pendingContext: null,
  batchContexts: [],
  isOpen: false,
  openRepairWithContext: (context) => {
    const validated = validateAndSanitizeDiagnosticContext(context);
    set({ pendingContext: validated, batchContexts: [validated], isOpen: true });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("eletricai-ai-repair", {
          detail: { context: validated, batch: [validated] },
        }),
      );
    }
  },
  openRepairWithBatch: (contexts) => {
    const validatedBatch = contexts
      .slice(0, 25)
      .map((c) => validateAndSanitizeDiagnosticContext(c));
    const primary = validatedBatch[0] ?? null;
    set({ pendingContext: primary, batchContexts: validatedBatch, isOpen: true });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("eletricai-ai-repair", {
          detail: { context: primary, batch: validatedBatch },
        }),
      );
    }
  },
  clearRepair: () => set({ pendingContext: null, batchContexts: [] }),
  setOpen: (isOpen) => set({ isOpen }),
}));

// ================= Typed Builders per Engineering Module =================

export function buildDiagnosticContextFromMultifilar(
  alert: DiagnosticAlert,
  projectId: string,
  revision = 1,
  module: "unifilar" | "multifilar" = "unifilar",
): DiagnosticContext {
  const affected: string[] = [];
  if (alert.nodeId) affected.push(alert.nodeId);

  const severity: "critical" | "warning" | "info" =
    alert.type === "ERRO" ? "critical" : alert.type === "AVISO" ? "warning" : "info";

  const diagnosticId =
    alert.id?.trim() ||
    deterministicDiagnosticId("diag_uf", [
      module,
      projectId,
      alert.type,
      alert.nodeId,
      alert.edgeId,
      alert.message,
    ]);

  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module,
    diagnostic_id: diagnosticId,
    error_code: alert.type === "ERRO" ? "ERR_UNIFILAR_TOPOLOGY" : "WARN_UNIFILAR_TOPOLOGY",
    severity,
    error_message: alert.message,
    technical_details: alert.assumptions?.length
      ? `Premissas técnicas: ${alert.assumptions.join("; ")}`
      : undefined,
    affected_components: affected,
    affected_connections: alert.edgeId ? [alert.edgeId] : [],
    affected_variables: [],
    source_context:
      module === "multifilar"
        ? {
            kind: "multifilar",
            alertType: alert.type,
            nodeId: alert.nodeId,
            edgeId: alert.edgeId,
            assumptions: alert.assumptions ? [...alert.assumptions] : [],
          }
        : {
            kind: "unifilar",
            alertType: alert.type,
            nodeId: alert.nodeId,
            edgeId: alert.edgeId,
            assumptions: alert.assumptions ? [...alert.assumptions] : [],
          },
    project_revision: revision,
    runtime_state: "design",
    related_diagnostics: [],
  });
}

export function buildDiagnosticContextFromLadder(
  issue: LadderIssue,
  projectId: string,
  revision = 1,
): DiagnosticContext {
  const severity: "critical" | "warning" | "info" =
    issue.level === "error" ? "critical" : issue.level === "warn" ? "warning" : "info";

  const affectedVars: string[] = [];
  if (issue.elementId) affectedVars.push(issue.elementId);

  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module: "ladder",
    diagnostic_id:
      issue.rungId && issue.code
        ? `${issue.rungId}_${issue.code}`
        : deterministicDiagnosticId("diag_lad", [
            projectId,
            issue.rungId,
            issue.elementId,
            issue.message,
          ]),
    error_code: issue.code || "ERR_LADDER_SYNTAX",
    severity,
    error_message: issue.message,
    technical_details: issue.fixHint ? `Sugestão de correção: ${issue.fixHint}` : undefined,
    affected_components: [issue.rungId],
    affected_connections: [],
    affected_variables: affectedVars,
    source_context: {
      kind: "ladder",
      rungId: issue.rungId,
      elementId: issue.elementId,
      fixHint: issue.fixHint,
    },
    project_revision: revision,
    runtime_state: "design",
    related_diagnostics: [],
  });
}

export function buildDiagnosticContextFromFbd(
  issue: {
    id?: string;
    code?: string;
    severity?: "critical" | "warning" | "info";
    message: string;
    nodeId?: string;
    edgeId?: string;
    blockType?: string;
    portId?: string;
    fixHint?: string;
  },
  projectId: string,
  revision = 1,
): DiagnosticContext {
  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module: "fbd",
    diagnostic_id:
      issue.id?.trim() ||
      deterministicDiagnosticId("diag_fbd", [
        projectId,
        issue.nodeId,
        issue.edgeId,
        issue.code,
        issue.message,
      ]),
    error_code: issue.code || "ERR_FBD_TOPOLOGY",
    severity: issue.severity ?? "warning",
    error_message: issue.message,
    technical_details: issue.fixHint ? `Sugestão FBD: ${issue.fixHint}` : undefined,
    affected_components: issue.nodeId ? [issue.nodeId] : [],
    affected_connections: issue.edgeId ? [issue.edgeId] : [],
    affected_variables: issue.portId ? [issue.portId] : [],
    source_context: {
      kind: "fbd",
      nodeId: issue.nodeId,
      edgeId: issue.edgeId,
      blockType: issue.blockType,
      portId: issue.portId,
      fixHint: issue.fixHint,
    },
    project_revision: revision,
    runtime_state: "design",
    related_diagnostics: [],
  });
}

export function buildDiagnosticContextFromPlc(
  issue: {
    id?: string;
    code?: string;
    severity?: "critical" | "warning" | "info";
    message: string;
    cpuModel?: string;
    rungOrNetworkId?: string;
    tagName?: string;
    address?: string;
    slot?: number;
  },
  projectId: string,
  revision = 1,
): DiagnosticContext {
  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module: "plc",
    diagnostic_id:
      issue.id?.trim() ||
      deterministicDiagnosticId("diag_plc", [
        projectId,
        issue.cpuModel,
        issue.rungOrNetworkId,
        issue.tagName,
        issue.message,
      ]),
    error_code: issue.code || "ERR_PLC_PROGRAM",
    severity: issue.severity ?? "warning",
    error_message: issue.message,
    affected_components: issue.rungOrNetworkId ? [issue.rungOrNetworkId] : [],
    affected_connections: [],
    affected_variables: [issue.tagName, issue.address].filter((v): v is string => Boolean(v)),
    source_context: {
      kind: "plc",
      cpuModel: issue.cpuModel,
      rungOrNetworkId: issue.rungOrNetworkId,
      tagName: issue.tagName,
      address: issue.address,
      slot: issue.slot,
    },
    project_revision: revision,
    runtime_state: "design",
    related_diagnostics: [],
  });
}

export function buildDiagnosticContextFromHardware(
  issue: {
    id?: string;
    code?: string;
    severity?: "critical" | "warning" | "info";
    message: string;
    slotIndex?: number;
    moduleCatalogId?: string;
    busLimitMa?: number;
    busDrawMa?: number;
    incompatibleReason?: string;
  },
  projectId: string,
  revision = 1,
): DiagnosticContext {
  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module: "hardware",
    diagnostic_id:
      issue.id?.trim() ||
      deterministicDiagnosticId("diag_hw", [
        projectId,
        issue.slotIndex,
        issue.moduleCatalogId,
        issue.message,
      ]),
    error_code: issue.code || "ERR_HARDWARE_COMPATIBILITY",
    severity: issue.severity ?? "warning",
    error_message: issue.message,
    technical_details: issue.incompatibleReason,
    affected_components: issue.moduleCatalogId ? [issue.moduleCatalogId] : [],
    affected_connections: [],
    affected_variables: [],
    source_context: {
      kind: "hardware",
      slotIndex: issue.slotIndex,
      moduleCatalogId: issue.moduleCatalogId,
      busLimitMa: issue.busLimitMa,
      busDrawMa: issue.busDrawMa,
      incompatibleReason: issue.incompatibleReason,
    },
    project_revision: revision,
    runtime_state: "design",
    related_diagnostics: [],
  });
}

export function buildDiagnosticContextFromIo(
  issue: {
    id?: string;
    code?: string;
    severity?: "critical" | "warning" | "info";
    message: string;
    tagName?: string;
    address?: string;
    ioType?: "DI" | "DQ" | "AI" | "AQ" | "M" | "V";
    channel?: number;
    duplicatedWith?: string;
  },
  projectId: string,
  revision = 1,
): DiagnosticContext {
  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module: "io",
    diagnostic_id:
      issue.id?.trim() ||
      deterministicDiagnosticId("diag_io", [
        projectId,
        issue.tagName,
        issue.address,
        issue.channel,
        issue.message,
      ]),
    error_code: issue.code || "ERR_IO_MAPPING",
    severity: issue.severity ?? "warning",
    error_message: issue.message,
    affected_components: issue.duplicatedWith ? [issue.duplicatedWith] : [],
    affected_connections: [],
    affected_variables: [issue.tagName, issue.address].filter((v): v is string => Boolean(v)),
    source_context: {
      kind: "io",
      tagName: issue.tagName,
      address: issue.address,
      ioType: issue.ioType,
      channel: issue.channel,
      duplicatedWith: issue.duplicatedWith,
    },
    project_revision: revision,
    runtime_state: "design",
    related_diagnostics: [],
  });
}

export function buildDiagnosticContextFromComms(
  issue: {
    id?: string;
    code?: string;
    severity?: "critical" | "warning" | "info";
    message: string;
    protocol: "OPC-UA" | "Modbus-TCP" | "Modbus-RTU" | "S7" | "EtherNet/IP" | "MQTT" | "Other";
    endpoint?: string;
    nodeIdOrRegister?: string;
    errorCode?: string;
  },
  projectId: string,
  revision = 1,
): DiagnosticContext {
  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module: "comms",
    diagnostic_id:
      issue.id?.trim() ||
      deterministicDiagnosticId("diag_comms", [
        projectId,
        issue.protocol,
        issue.endpoint,
        issue.nodeIdOrRegister,
        issue.message,
      ]),
    error_code: issue.code || "ERR_INDUSTRIAL_COMMS",
    severity: issue.severity ?? "warning",
    error_message: issue.message,
    affected_components: issue.endpoint ? [issue.endpoint] : [],
    affected_connections: [],
    affected_variables: issue.nodeIdOrRegister ? [issue.nodeIdOrRegister] : [],
    source_context: {
      kind: "comms",
      protocol: issue.protocol,
      endpoint: issue.endpoint,
      nodeIdOrRegister: issue.nodeIdOrRegister,
      errorCode: issue.errorCode,
    },
    project_revision: revision,
    runtime_state: "comms",
    related_diagnostics: [],
  });
}

export function buildDiagnosticContextFromSimulation(
  issue: {
    id?: string;
    code?: string;
    severity?: "critical" | "warning" | "info";
    message: string;
    stepCount?: number;
    overloadedEquipmentIds?: string[];
    openCircuitIds?: string[];
    busVoltageV?: number;
    totalCurrentA?: number;
  },
  projectId: string,
  revision = 1,
): DiagnosticContext {
  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module: "simulation",
    diagnostic_id:
      issue.id?.trim() ||
      deterministicDiagnosticId("diag_sim", [
        projectId,
        issue.code,
        issue.overloadedEquipmentIds?.join(","),
        issue.message,
      ]),
    error_code: issue.code || "ERR_SIMULATION_STATE",
    severity: issue.severity ?? "warning",
    error_message: issue.message,
    affected_components: [
      ...(issue.overloadedEquipmentIds ?? []),
      ...(issue.openCircuitIds ?? []),
    ].slice(0, 50),
    affected_connections: [],
    affected_variables: [],
    source_context: {
      kind: "simulation",
      stepCount: issue.stepCount,
      overloadedEquipmentIds: issue.overloadedEquipmentIds?.slice(0, 30),
      openCircuitIds: issue.openCircuitIds?.slice(0, 30),
      busVoltageV: issue.busVoltageV,
      totalCurrentA: issue.totalCurrentA,
    },
    project_revision: revision,
    runtime_state: "simulation",
    related_diagnostics: [],
  });
}

export function buildDiagnosticContextFromScada(
  issue: {
    id?: string;
    code?: string;
    severity?: "critical" | "warning" | "info";
    message: string;
    alarmId?: string;
    tag?: string;
    isaPriority?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "DIAGNOSTIC";
    equipmentId?: string;
    timestamp?: string;
  },
  projectId: string,
  revision = 1,
): DiagnosticContext {
  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module: "scada",
    diagnostic_id:
      issue.id?.trim() ||
      issue.alarmId?.trim() ||
      deterministicDiagnosticId("diag_scada", [
        projectId,
        issue.tag,
        issue.equipmentId,
        issue.message,
      ]),
    error_code: issue.code || "ERR_SCADA_ALARM",
    severity: issue.severity ?? (issue.isaPriority === "CRITICAL" ? "critical" : "warning"),
    error_message: issue.message,
    affected_components: issue.equipmentId ? [issue.equipmentId] : [],
    affected_connections: [],
    affected_variables: issue.tag ? [issue.tag] : [],
    source_context: {
      kind: "scada",
      alarmId: issue.alarmId,
      tag: issue.tag,
      isaPriority: issue.isaPriority,
      equipmentId: issue.equipmentId,
      timestamp: issue.timestamp,
    },
    project_revision: revision,
    runtime_state: "scada",
    related_diagnostics: [],
  });
}

export function buildDiagnosticContextFromNormFinding(
  finding: NormFinding,
  projectId: string,
  revision = 1,
): DiagnosticContext {
  const severity: "critical" | "warning" | "info" =
    finding.severity === "error" ? "critical" : finding.severity === "warn" ? "warning" : "info";

  const diagnosticId =
    finding.id?.trim() ||
    deterministicDiagnosticId("norm", [projectId, finding.norm, finding.nodeId, finding.title]);

  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module: "validation",
    diagnostic_id: diagnosticId,
    error_code: `NORM_${finding.norm.replace(/\s+/g, "_")}`,
    severity,
    error_message: `${finding.title}: ${finding.detail}`,
    technical_details: finding.fixHint ? `Dica técnica: ${finding.fixHint}` : undefined,
    affected_components: finding.nodeId ? [finding.nodeId] : [],
    affected_connections: [],
    affected_variables: [],
    source_context: {
      kind: "validation",
      norm: finding.norm,
      nodeId: finding.nodeId,
      fixHint: finding.fixHint,
    },
    project_revision: revision,
    runtime_state: "design",
    related_diagnostics: [],
  });
}

export function buildDiagnosticContextFromImportIssue(
  issue: {
    id: string;
    severity: string;
    category: string;
    message: string;
    entityId?: string;
    format?: string;
  },
  projectId: string,
): DiagnosticContext {
  const severity: "critical" | "warning" | "info" =
    issue.severity === "critical" ? "critical" : issue.severity === "warning" ? "warning" : "info";

  return validateAndSanitizeDiagnosticContext({
    project_id: projectId,
    module: "importer",
    diagnostic_id:
      issue.id?.trim() ||
      deterministicDiagnosticId("imp", [projectId, issue.category, issue.entityId, issue.message]),
    error_code: `IMPORT_${issue.category.toUpperCase()}`,
    severity,
    error_message: issue.message,
    technical_details: `Categoria: ${issue.category}`,
    affected_components: issue.entityId ? [issue.entityId] : [],
    affected_connections: [],
    affected_variables: [],
    source_context: {
      kind: "importer",
      category: issue.category,
      entityId: issue.entityId,
      format: issue.format,
    },
    runtime_state: "import",
    related_diagnostics: [],
  });
}

/**
 * Formata um conjunto de diagnósticos no protocolo padronizado de 7 passos de remediação.
 */
export function formatDiagnosticFor7StepRemediation(
  target: DiagnosticContext | DiagnosticContext[],
  locale: "pt-BR" | "en" = "pt-BR",
): string {
  const rawList = Array.isArray(target) ? target : [target];
  const list = rawList.map((d) => validateAndSanitizeDiagnosticContext(d));
  const primary = list[0];
  if (!primary) return "";

  const isEn = locale === "en";

  const errorHeader = list
    .map(
      (d, idx) =>
        `[${idx + 1}] Módulo: ${d.module.toUpperCase()} | Código: ${d.error_code} | Severidade: ${d.severity.toUpperCase()}\n` +
        `    Mensagem: ${d.error_message}\n` +
        (d.technical_details ? `    Detalhes: ${d.technical_details}\n` : "") +
        (d.affected_components.length
          ? `    Componentes Afetados: ${d.affected_components.join(", ")}\n`
          : "") +
        (d.affected_variables.length
          ? `    Variáveis Afetadas: ${d.affected_variables.join(", ")}\n`
          : ""),
    )
    .join("\n");

  if (isEn) {
    return (
      `### [AI AUTOMATED REMEDIATION MANDATE - 7 STEPS]\n` +
      `Project ID: ${primary.project_id} (Rev: ${primary.project_revision ?? 1})\n` +
      `Detected Engineering Violations:\n\n${errorHeader}\n\n` +
      `Please execute the comprehensive 7-step remediation workflow:\n` +
      `1. ERROR INTERPRETATION: Explain the operational hazard and violation of relevant standards (IEC 60947, IEC 60364, IEC 61131-3, NFPA 70E).\n` +
      `2. ROOT CAUSE INVESTIGATION: Analyze the electrical topology, missing links, unrouted conductors, or invalid variable states.\n` +
      `3. TECHNICAL DIAGNOSIS: Provide unambiguous engineering diagnosis with exact calculation formulas or logic rules.\n` +
      `4. REPAIR PROPOSAL: Propose precise topological/parameter changes (addEdges, addNodes, updateParams, rungs) to completely eliminate all listed issues.\n` +
      `5. ASSISTED APPLICATION: Present a valid, executable JSON patch or action plan.\n` +
      `6. POST-REPAIR REVALIDATION: Verify that no secondary faults or short circuits are introduced.\n` +
      `7. RESULT REPORT: Summarize final healthy state, sizing metrics, and compliance certificate.`
    );
  }

  return (
    `### [MANDATO DE CORREÇÃO AUTOMÁTICA COM IA - 7 PASSOS]\n` +
    `Projeto ID: ${primary.project_id} (Revisão: ${primary.project_revision ?? 1})\n` +
    `Não Conformidades / Falhas Detectadas:\n\n${errorHeader}\n\n` +
    `Por favor, execute o protocolo determinístico de remediação em 7 etapas:\n` +
    `1. INTERPRETAÇÃO DO ERRO: Explique o impacto operacional, segurança física e norma violada (ABNT NBR 5410, NR-10, IEC 60947, IEC 61131-3, ISA-18.2).\n` +
    `2. INVESTIGAÇÃO DA CAUSA RAIZ: Identifique a desconexão topológica, falta de proteção de retaguarda, condutor órfão ou falha de parametrização.\n` +
    `3. DIAGNÓSTICO TÉCNICO: Detalhe as grandezas elétricas e restrições normativas exigidas para a conformidade.\n` +
    `4. PROPOSTA DE CORREÇÃO: Especifique as alterações exatas necessárias no diagrama unifilar, rungs Ladder ou parâmetros de equipamentos.\n` +
    `5. APLICAÇÃO ASSISTIDA: Apresente o patch de correção estruturado pronto para aplicação direta no projeto.\n` +
    `6. REVALIDAÇÃO PÓS-CORREÇÃO: Verifique a eliminação integral do erro e confirme que nenhum efeito colateral indesejado foi introduzido.\n` +
    `7. RELATÓRIO DO RESULTADO: Emita o sumário técnico final atestando a conformidade e integridade da engenharia.`
  );
}
