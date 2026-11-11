// ELÉTRICAI INDUSTRIAL OS — GATE 3.6 CANONICAL INDUSTRIAL DATA MODEL
// Organization → Plant → Sector → Equipment → Tag → Gateway → Physical Source
//
// Regras fundamentais:
//  - Toda entidade carrega tenantId (Organization UUID) e, quando aplicável, plantId.
//  - IDs são imutáveis. Renomear / mover visualmente gera revisão, nunca novo ID.
//  - Equipment.id É o mesmo `CanonicalEquipment.id` do UnifiedProjectDoc (Unifilar,
//    Multifilar, Ladder, FBD, PLC). Não existe cadastro paralelo.
//  - Tag.id É o mesmo `CanonicalTag.id` do UnifiedProjectDoc.
//  - Gateway.id É o mesmo `gatewayId` do Edge Fleet / CloudGatewayRegistry.
//  - isPhysicalControlAllowed é literal `false` — não existe caminho de escrita.

import { z } from "zod";

export const IS_PHYSICAL_CONTROL_ALLOWED = false as const;

const Id = z.string().min(1).max(128);

// ─────────────────────────────────────────────────────────────────────────────
// Proveniência (Gate 3.6 acrescenta CALCULATED_DATA)
// ─────────────────────────────────────────────────────────────────────────────
export const DataProvenanceSchema = z.enum([
  "PHYSICAL_DATA",
  "SIMULATED_DATA",
  "INTERNAL_RUNTIME",
  "CALCULATED_DATA",
  "FORCED_DATA",
  "STALE_DATA",
  "BAD_QUALITY",
  "NOT_CONNECTED",
]);
export type DataProvenance = z.infer<typeof DataProvenanceSchema>;

/** Origem declarada no momento da aquisição (antes de avaliar idade/qualidade). */
export const SourceKindSchema = z.enum(["PHYSICAL", "SIMULATED", "INTERNAL_RUNTIME", "CALCULATED"]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SampleQualitySchema = z.enum(["GOOD", "UNCERTAIN", "BAD"]);
export type SampleQuality = z.infer<typeof SampleQualitySchema>;

export const PhysicalProtocolSchema = z.enum(["OPC_UA", "MODBUS_TCP", "MQTT_SPARKPLUG_B"]);
export type PhysicalProtocol = z.infer<typeof PhysicalProtocolSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Hierarquia
// ─────────────────────────────────────────────────────────────────────────────
export const OrganizationSchema = z.object({
  id: Id,
  name: z.string().min(1),
  slug: z.string().optional(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const PlantSchema = z.object({
  id: Id,
  tenantId: Id,
  name: z.string().min(1),
  code: z.string().optional(),
  timezone: z.string().default("America/Sao_Paulo"),
});
export type Plant = z.infer<typeof PlantSchema>;

export const SectorSchema = z.object({
  id: Id,
  tenantId: Id,
  plantId: Id,
  name: z.string().min(1),
  code: z.string().optional(),
});
export type Sector = z.infer<typeof SectorSchema>;

export const EquipmentTypeSchema = z.object({
  id: Id,
  /** Mesma categoria do UnifiedProjectDoc (drive, source, protection...). */
  category: z.string().min(1),
  catalogType: z.string().min(1),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
});
export type EquipmentType = z.infer<typeof EquipmentTypeSchema>;

export const EquipmentSchema = z.object({
  /** === CanonicalEquipment.id (UnifiedProjectDoc) */
  id: Id,
  tenantId: Id,
  plantId: Id,
  sectorId: Id.optional(),
  projectId: Id.optional(),
  equipmentTypeId: Id,
  tagCode: z.string().min(1),
  displayName: z.string().default(""),
  description: z.string().default(""),
  revision: z.number().int().positive(),
});
export type Equipment = z.infer<typeof EquipmentSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Unidades de engenharia
// ─────────────────────────────────────────────────────────────────────────────
export const EngineeringUnitSchema = z.object({
  symbol: z.string().min(1).max(16),
  quantity: z.string().min(1),
});
export type EngineeringUnit = z.infer<typeof EngineeringUnitSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Contrato de Tag industrial
// ─────────────────────────────────────────────────────────────────────────────
export const IndustrialDataTypeSchema = z.enum(["BOOL", "INT", "DINT", "REAL", "STRING"]);
export type IndustrialDataType = z.infer<typeof IndustrialDataTypeSchema>;

export const AnalogAlarmConfigSchema = z.object({
  highHigh: z.number().finite().optional(),
  high: z.number().finite().optional(),
  low: z.number().finite().optional(),
  lowLow: z.number().finite().optional(),
  deadband: z.number().finite().nonnegative().default(0),
});
export type AnalogAlarmConfig = z.infer<typeof AnalogAlarmConfigSchema>;

export const IndustrialTagSchema = z
  .object({
    /** === CanonicalTag.id (UnifiedProjectDoc) */
    tagId: Id,
    tenantId: Id,
    plantId: Id,
    equipmentId: Id.optional(),
    canonicalName: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9_.:\-/]+$/, "canonicalName deve conter apenas [A-Za-z0-9_.:-/]"),
    displayName: z.string().default(""),
    dataType: IndustrialDataTypeSchema,
    /** Unidade em que o valor é apresentado (engenharia). */
    engineeringUnit: z.string().max(16).default(""),
    /** Unidade bruta opcional padrão da tag (pode ser sobrescrita em GatewayTagSource). */
    rawUnit: z.string().max(16).optional(),
    /** engineering = (raw * scale + offset) convertido de rawUnit → engineeringUnit */
    scale: z.number().finite().default(1),
    offset: z.number().finite().default(0),
    precision: z.number().int().min(0).max(9).default(3),
    minimumValue: z.number().finite().optional(),
    maximumValue: z.number().finite().optional(),
    deadband: z.number().finite().nonnegative().default(0),
    sampleIntervalMs: z.number().int().positive().default(1000),
    retentionClass: z
      .enum(["HIGH_FREQ_7D", "STANDARD_90D", "COMPLIANCE_5Y"])
      .default("STANDARD_90D"),
    alarmConfiguration: AnalogAlarmConfigSchema.optional(),
    staleAfterMs: z.number().int().positive().default(10_000),
    sourceKind: SourceKindSchema,
    revision: z.number().int().positive(),
    configurationVersion: z.number().int().positive(),
  })
  .refine(
    (t) =>
      t.minimumValue === undefined ||
      t.maximumValue === undefined ||
      t.minimumValue < t.maximumValue,
    { message: "minimumValue deve ser menor que maximumValue", path: ["minimumValue"] },
  );
export type IndustrialTag = z.infer<typeof IndustrialTagSchema>;

/** Vínculo Equipment → Tag (com papel). */
export const TagBindingSchema = z.object({
  id: Id,
  tenantId: Id,
  plantId: Id,
  equipmentId: Id,
  tagId: Id,
  role: z.string().min(1),
  terminalId: z.string().optional(),
  plcChannelId: z.string().optional(),
});
export type TagBinding = z.infer<typeof TagBindingSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Gateway e fonte física (allowlist)
// ─────────────────────────────────────────────────────────────────────────────
export const CanonicalGatewaySchema = z.object({
  /** === gatewayId do Edge Fleet / CloudGatewayRegistry */
  id: Id,
  tenantId: Id,
  plantId: Id,
  sectorId: Id.optional(),
  name: z.string().default(""),
  isRevoked: z.boolean().default(false),
});
export type CanonicalGateway = z.infer<typeof CanonicalGatewaySchema>;

/**
 * GatewayTagSource — comprova a origem física de uma tag.
 * Uma tag só é PHYSICAL_DATA se existir um GatewayTagSource ATIVO que associe
 * (gateway, sourceId, protocol, address) a ela. A existência da tag no banco não basta.
 */
export const GatewayTagSourceSchema = z
  .object({
    id: Id,
    tenantId: Id,
    plantId: Id,
    gatewayId: Id,
    tagId: Id,
    /** Identidade da fonte física no Edge (ex.: "modbus:192.168.1.20:502:u1:hr40001"). */
    sourceId: z.string().min(1).max(256),
    protocol: PhysicalProtocolSchema,
    address: z.string().min(1).max(256).optional(),
    physicalAddress: z.string().min(1).max(256).optional(),
    /** Unidade nativa do instrumento/registrador. */
    rawUnit: z.string().max(16).default(""),
    scale: z.number().finite().optional(),
    offset: z.number().finite().optional(),
    active: z.boolean(),
    /** Nunca true — fontes são estritamente de leitura. */
    writeEnabled: z.literal(false),
  })
  .transform((val) => ({
    ...val,
    address: val.address ?? val.physicalAddress ?? val.sourceId,
    physicalAddress: val.physicalAddress ?? val.address ?? val.sourceId,
  }));
export type GatewayTagSource = z.input<typeof GatewayTagSourceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Amostra canônica enviada pelo Edge
// ─────────────────────────────────────────────────────────────────────────────
export const CanonicalEdgeSampleSchema = z.object({
  tagId: Id,
  sourceId: z.string().min(1).max(256),
  /** Sequência monotônica por (gateway, sourceId) atribuída no Edge. */
  sequenceNumber: z.number().int().nonnegative(),
  /** Valor bruto exatamente como lido. Number.isFinite é verificado no pipeline. */
  rawValue: z.union([z.number(), z.boolean(), z.string().max(1024)]),
  quality: SampleQualitySchema,
  sourceTimestamp: z.number().int().positive(),
  edgeReceivedAt: z.number().int().positive(),
});
export type CanonicalEdgeSample = z.infer<typeof CanonicalEdgeSampleSchema>;

export const CanonicalEdgeBatchSchema = z.object({
  protocolVersion: z.literal("1.1.0").default("1.1.0"),
  gatewayId: Id,
  batchId: z.string().min(4).max(128),
  batchSequenceNumber: z.number().int().nonnegative().default(1),
  sentAt: z.number().int().positive(),
  samples: z.array(CanonicalEdgeSampleSchema).max(5000),
  alarms: z
    .array(z.lazy(() => EdgeAlarmTransitionSchema))
    .max(1000)
    .default([]),
});
export type CanonicalEdgeBatch = z.infer<typeof CanonicalEdgeBatchSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Historian
// ─────────────────────────────────────────────────────────────────────────────
export interface HistorianSample {
  tenantId: string;
  plantId: string;
  tagId: string;
  equipmentId?: string;
  gatewayId: string;
  sourceId: string;
  sequenceNumber: number;
  /** Valor bruto recebido, preservado sem alteração. */
  rawValue: number | boolean | string;
  /** Valor de engenharia após transformação (null se rejeitado). */
  engineeringValue: number | boolean | string | null;
  transformation: TagTransformation;
  quality: SampleQuality;
  provenance: DataProvenance;
  sourceTimestamp: number;
  edgeReceivedAt: number;
  ingestionTimestamp: number;
  /** Chegou com sourceTimestamp anterior ao último já ingerido para a tag. */
  isLate: boolean;
  tagRevision: number;
  configurationVersion: number;
  batchId: string;
}

export interface TagTransformation {
  scale: number;
  offset: number;
  rawUnit: string;
  engineeringUnit: string;
  unitFactor: number;
  unitOffset: number;
  precision: number;
  clampedOrRejected: "NONE" | "OUT_OF_RANGE" | "NON_FINITE" | "TYPE_MISMATCH" | "UNIT_INCOMPATIBLE";
}

// ─────────────────────────────────────────────────────────────────────────────
// Alarmes (ISA-18.2)
// ─────────────────────────────────────────────────────────────────────────────
export const AlarmPrioritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export type AlarmPriority = z.infer<typeof AlarmPrioritySchema>;

export const AlarmDefinitionSchema = z
  .object({
    id: Id,
    tenantId: Id,
    plantId: Id,
    tagId: Id,
    equipmentId: Id.optional(),
    name: z.string().optional(),
    condition: z
      .enum(["HH", "H", "L", "LL", "DIGITAL_TRUE", "DIGITAL_FALSE", "BOOL_TRUE", "BOOL_FALSE"])
      .optional(),
    conditionType: z
      .enum(["HH", "H", "L", "LL", "DIGITAL_TRUE", "DIGITAL_FALSE", "BOOL_TRUE", "BOOL_FALSE"])
      .optional(),
    threshold: z.number().finite().optional(),
    deadband: z.number().finite().nonnegative().default(0),
    severity: z.union([z.number().int().min(1).max(1000), AlarmPrioritySchema]),
    priority: z.union([AlarmPrioritySchema, z.number().int().min(1).max(4)]),
    message: z.string().default("Alarme Industrial"),
  })
  .transform((val) => ({
    ...val,
    condition: val.condition ?? val.conditionType ?? "H",
    conditionType: val.conditionType ?? val.condition ?? "H",
    message: val.message || val.name || "Alarme Industrial",
  }));
export type AlarmDefinition = z.input<typeof AlarmDefinitionSchema>;

export const AlarmTransitionKindSchema = z.enum([
  "ACTIVATED",
  "RETURNED_TO_NORMAL",
  "ACKNOWLEDGED",
  "SHELVED",
  "UNSHELVED",
]);
export type AlarmTransitionKind = z.infer<typeof AlarmTransitionKindSchema>;

export const EdgeAlarmTransitionSchema = z.object({
  /** Identidade da ocorrência gerada no Edge — estável durante todo o ciclo de vida. */
  edgeOccurrenceId: z.string().min(1).max(128),
  alarmDefinitionId: Id,
  tagId: Id.optional(),
  equipmentId: Id.optional(),
  transition: AlarmTransitionKindSchema,
  /** Sequência da transição dentro da ocorrência (1 = ACTIVATED). */
  transitionSequence: z.number().int().positive(),
  occurredAt: z.number().int().positive(),
  value: z.union([z.number(), z.boolean()]).optional(),
  quality: SampleQualitySchema,
  operatorId: z.string().max(128).optional(),
});
export type EdgeAlarmTransition = z.infer<typeof EdgeAlarmTransitionSchema>;

export interface AlarmTransitionRecord {
  kind: AlarmTransitionKind;
  transitionSequence: number;
  occurredAt: number;
  receivedAt: number;
  operatorId?: string;
  value?: number | boolean;
  quality: SampleQuality;
  origin: "EDGE" | "CLOUD_OPERATOR";
}

export interface AlarmOccurrence {
  /** ID canônico da ocorrência no Cloud (determinístico a partir do Edge). */
  occurrenceId: string;
  edgeOccurrenceId: string;
  tenantId: string;
  plantId: string;
  gatewayId: string;
  alarmDefinitionId: string;
  tagId: string;
  equipmentId?: string;
  severity: number | AlarmPriority;
  priority: AlarmPriority | number;
  isActive: boolean;
  isAcknowledged: boolean;
  isShelved: boolean;
  activatedAt: number;
  transitions: AlarmTransitionRecord[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Revisões
// ─────────────────────────────────────────────────────────────────────────────
export interface EntityRevision<T> {
  entityId: string;
  revision: number;
  changedAt: number;
  changedBy: string;
  changedFields: string[];
  snapshot: T;
}
export type EquipmentRevision = EntityRevision<Equipment>;
export type TagRevision = EntityRevision<IndustrialTag>;

// ─────────────────────────────────────────────────────────────────────────────
// Erros de domínio
// ─────────────────────────────────────────────────────────────────────────────
export type CanonicalErrorCode =
  | "TENANT_MISMATCH"
  | "PLANT_MISMATCH"
  | "IDENTITY_TRANSFER_FORBIDDEN"
  | "UNKNOWN_ENTITY"
  | "DUPLICATE_ENTITY"
  | "INVALID_SCHEMA"
  | "PHYSICAL_WRITE_FORBIDDEN"
  | "FORBIDDEN";

export class CanonicalIntegrityError extends Error {
  constructor(
    public readonly code: CanonicalErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "CanonicalIntegrityError";
  }
}
