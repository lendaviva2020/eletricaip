// Unified Engineering Model (Schema Version 3) — Single Source of Truth
// Separates canonical engineering entities from per-canvas visual layouts.
import { z } from "zod";
import {
  CircuitConfig,
  EdgeKindSchema,
  NodeKind,
  NodeParamsSchema,
  PositionSchema,
} from "@/lib/diagram/schema";
import type { PlcProject } from "@/lib/plc/types";
import type { MotorNameplate, TwinMapping } from "@/lib/digital-twin-store";

export const UNIFIED_SCHEMA_VERSION = 3 as const;

export const ApplicableStandardSchema = z.enum([
  "NBR_5410",
  "NBR_14039",
  "NR_10",
  "NR_12",
  "IEC_60909",
  "IEC_61131_3",
  "IEC_60617",
  "ISA_18_2",
]);
export type ApplicableStandard = z.infer<typeof ApplicableStandardSchema>;

export const EarthingSchemeSchema = z.enum(["TN-S", "TN-C-S", "TN-C", "TT", "IT"]);
export type EarthingScheme = z.infer<typeof EarthingSchemeSchema>;

export const ProjectMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(160).default("Novo projeto"),
  description: z.string().nullable().default(null),
  client: z.string().nullable().default(null),
  schemaVersion: z.literal(UNIFIED_SCHEMA_VERSION).default(UNIFIED_SCHEMA_VERSION),
  applicableStandards: z.array(ApplicableStandardSchema).default(["NBR_5410"]),
  nominalSystem: z
    .object({
      frequencyHz: z.union([z.literal(50), z.literal(60)]).default(60),
      lowVoltageV: z.number().positive().default(380),
      mediumVoltageKv: z.number().positive().default(13.8),
      earthingScheme: EarthingSchemeSchema.default("TN-S"),
    })
    .default({
      frequencyHz: 60,
      lowVoltageV: 380,
      mediumVoltageKv: 13.8,
      earthingScheme: "TN-S",
    }),
  revision: z.number().int().nonnegative().default(1),
  updatedAt: z.string(),
});
export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

export const EquipmentCategorySchema = z.enum([
  "source",
  "protection",
  "switching",
  "drive",
  "load",
  "instrumentation",
  "safety",
  "plc_module",
  "reference",
  "passive",
]);
export type EquipmentCategory = z.infer<typeof EquipmentCategorySchema>;

export const PhasesConfigSchema = z.enum(["1F", "2F", "3F", "F+N", "F+N+PE", "3F+N", "3F+N+PE", "DC", "N", "PE"]);
export type PhasesConfig = z.infer<typeof PhasesConfigSchema>;

export const TerminalKindSchema = z.enum([
  "L1",
  "L2",
  "L3",
  "N",
  "PE",
  "control_supply",
  "aux_no",
  "aux_nc",
  "analog",
  "digital",
]);
export type TerminalKind = z.infer<typeof TerminalKindSchema>;

export const CanonicalTerminalSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  kind: TerminalKindSchema,
  direction: z.enum(["in", "out", "bidirectional"]).default("bidirectional"),
});
export type CanonicalTerminal = z.infer<typeof CanonicalTerminalSchema>;

export const EquipmentSpecsSchema = z.object({
  powerKw: z.number().positive().optional(),
  powerW: z.number().positive().optional(),
  apparentPowerKva: z.number().positive().optional(),
  voltageV: z.number().positive().optional(),
  primaryV: z.number().positive().optional(),
  secondaryV: z.number().positive().optional(),
  nominalCurrentA: z.number().positive().optional(),
  breakingCapacityKa: z.number().positive().optional(),
  tripCurve: z.enum(["B", "C", "D", "MA"]).optional(),
  poles: z.number().int().min(1).max(4).optional(),
  rcdSensitivityMa: z.number().positive().optional(),
  coilVoltageV: z.number().positive().optional(),
  startingMethod: z.enum(["DOL", "STAR_DELTA", "SOFT", "VFD"]).optional(),
  powerFactor: z.number().min(0).max(1).optional(),
  efficiency: z.number().min(0).max(1).optional(),
  impedancePct: z.number().positive().optional(),
  custom: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type EquipmentSpecs = z.infer<typeof EquipmentSpecsSchema>;

export const CanonicalEquipmentSchema = z.object({
  id: z.string().min(1),
  tagCode: z.string().min(1),
  displayName: z.string().default(""),
  catalogType: z.string().min(1),
  category: EquipmentCategorySchema,
  phases: PhasesConfigSchema.default("3F"),
  terminals: z.array(CanonicalTerminalSchema).default([]),
  specs: EquipmentSpecsSchema.default({}),
  /** Preserves exact DiagramNode params for 100% lossless round-trip with WebGL canvas */
  diagramParams: NodeParamsSchema.optional(),
  circuitId: z.string().optional(),
});
export type CanonicalEquipment = z.infer<typeof CanonicalEquipmentSchema>;

export const ConductorSpecSchema = z.object({
  crossSectionMm2: z.number().positive(),
  material: z.enum(["Cu", "Al"]).default("Cu"),
  insulation: z.enum(["PVC", "EPR", "XLPE"]).default("PVC"),
  lengthM: z.number().positive().default(10),
  installationMethod: z.string().default("B1"),
});
export type ConductorSpec = z.infer<typeof ConductorSpecSchema>;

export const ElectricalConnectionSchema = z.object({
  id: z.string().min(1),
  fromEquipmentId: z.string().min(1),
  fromTerminalId: z.string().min(1),
  toEquipmentId: z.string().min(1),
  toTerminalId: z.string().min(1),
  kind: EdgeKindSchema.default("power"),
  circuitConfig: z
    .enum(["F", "F+N", "F+N+PE", "3F", "3F+N", "3F+N+PE", "N", "PE"])
    .optional(),
  conductor: ConductorSpecSchema.optional(),
});
export type ElectricalConnection = z.infer<typeof ElectricalConnectionSchema>;

export const CanonicalCircuitSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().default(""),
  sourceEquipmentId: z.string().min(1),
  protectionEquipmentId: z.string().optional(),
  loadEquipmentIds: z.array(z.string()).default([]),
  conductorSpec: ConductorSpecSchema.optional(),
  designCurrentIbA: z.number().nonnegative().optional(),
  voltageDropPct: z.number().nonnegative().optional(),
});
export type CanonicalCircuit = z.infer<typeof CanonicalCircuitSchema>;

export const TagDataTypeSchema = z.enum([
  "BOOL",
  "BYTE",
  "WORD",
  "DWORD",
  "INT",
  "DINT",
  "REAL",
  "TIME",
  "STRING",
]);
export type TagDataType = z.infer<typeof TagDataTypeSchema>;

export const TagAreaSchema = z.enum(["I", "Q", "M", "DB"]);
export type TagArea = z.infer<typeof TagAreaSchema>;

export const CanonicalTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dataType: TagDataTypeSchema.default("BOOL"),
  area: TagAreaSchema.default("M"),
  address: z.string().optional(),
  unit: z.string().optional(),
  scaleMin: z.number().optional(),
  scaleMax: z.number().optional(),
  initialValue: z.union([z.boolean(), z.number(), z.string()]).default(false),
  forced: z.boolean().default(false),
  retentive: z.boolean().default(false),
  description: z.string().default(""),
  linkedEquipmentId: z.string().optional(),
  linkedTerminalId: z.string().optional(),
  plcChannelId: z.string().optional(),
});
export type CanonicalTag = z.infer<typeof CanonicalTagSchema>;

export const ControlRoleSchema = z.enum([
  "main_contactor_coil",
  "aux_seal_contact",
  "overload_trip_nc",
  "breaker_aux_status",
  "estop_safety_nc",
  "start_command_no",
  "stop_command_nc",
  "vfd_speed_ref",
  "vfd_run_feedback",
  "sensor_process_value",
]);
export type ControlRole = z.infer<typeof ControlRoleSchema>;

export const ControlBindingSchema = z.object({
  id: z.string().min(1),
  equipmentId: z.string().min(1),
  role: ControlRoleSchema,
  tagId: z.string().min(1),
  terminalIds: z.array(z.string()).default([]),
});
export type ControlBinding = z.infer<typeof ControlBindingSchema>;

export const PlcChannelBindingSchema = z.object({
  channelId: z.string().min(1),
  slotNumber: z.number().int().nonnegative(),
  channelIndex: z.number().int().nonnegative(),
  direction: z.enum(["DI", "DO", "AI", "AO"]),
  address: z.string().min(1),
  tagId: z.string().nullable().default(null),
  equipmentId: z.string().nullable().default(null),
});
export type PlcChannelBinding = z.infer<typeof PlcChannelBindingSchema>;

export const StudyStatusSchema = z.enum(["valid", "stale", "invalid"]);
export type StudyStatus = z.infer<typeof StudyStatusSchema>;

export const EngineeringStudyRecordSchema = z.object({
  id: z.string().min(1),
  studyType: z.enum([
    "short_circuit",
    "load_flow",
    "voltage_drop",
    "cable_sizing",
    "harmonics",
    "motor_starting",
    "arc_flash",
    "coordination",
    "normative",
  ]),
  title: z.string().min(1),
  inputEquipmentIds: z.array(z.string()).default([]),
  inputSnapshotHash: z.string().min(1),
  status: StudyStatusSchema.default("valid"),
  parameters: z.record(z.string(), z.unknown()).default({}),
  results: z.record(z.string(), z.unknown()).default({}),
  updatedAt: z.string(),
});
export type EngineeringStudyRecord = z.infer<typeof EngineeringStudyRecordSchema>;

export const RepresentationKindSchema = z.enum([
  "unifilar",
  "multifilar",
  "ladder",
  "fbd",
  "plc",
  "scada",
  "twin",
  "studies",
  "persistence",
]);
export type RepresentationKind = z.infer<typeof RepresentationKindSchema>;

export const ModelDiagnosticSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["error", "warning", "info"]),
  code: z.string().min(1),
  message: z.string().default(""),
  messageParams: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  sourceRepresentation: RepresentationKindSchema,
  targetRepresentation: RepresentationKindSchema.optional(),
  entityIds: z.array(z.string()).default([]),
  requiresUserIntervention: z.boolean().default(false),
  createdAt: z.string(),
});
export type ModelDiagnostic = z.infer<typeof ModelDiagnosticSchema>;

// ── Per-Canvas Visual Layouts (Separated from Canonical Entities) ───────────

export const UnifilarNodeLayoutSchema = z.object({
  nodeId: z.string().min(1),
  equipmentId: z.string().min(1),
  position: PositionSchema,
  rotation: z.number().default(0),
  label: z.string().default(""),
  ui: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type UnifilarNodeLayout = z.infer<typeof UnifilarNodeLayoutSchema>;

export const UnifilarEdgeLayoutSchema = z.object({
  edgeId: z.string().min(1),
  connectionId: z.string().min(1),
  waypoints: z.array(PositionSchema).optional(),
});
export type UnifilarEdgeLayout = z.infer<typeof UnifilarEdgeLayoutSchema>;

export const MultifilarNodeLayoutSchema = z.object({
  nodeId: z.string().min(1),
  equipmentId: z.string().min(1),
  position: PositionSchema,
  rotation: z.number().default(0),
  label: z.string().default(""),
  ui: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type MultifilarNodeLayout = z.infer<typeof MultifilarNodeLayoutSchema>;

export const MultifilarEdgeLayoutSchema = z.object({
  edgeId: z.string().min(1),
  connectionId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  circuitConfig: z
    .enum(["F", "F+N", "F+N+PE", "3F", "3F+N", "3F+N+PE", "N", "PE"])
    .optional(),
  waypoints: z.array(PositionSchema).optional(),
});
export type MultifilarEdgeLayout = z.infer<typeof MultifilarEdgeLayoutSchema>;

export const ScadaWidgetLayoutSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  category: z.enum(["power", "mech", "inst", "logic"]),
  label: z.string().default(""),
  position: PositionSchema,
  boundTagId: z.string().nullable().default(null),
  boundEquipmentId: z.string().nullable().default(null),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type ScadaWidgetLayout = z.infer<typeof ScadaWidgetLayoutSchema>;

export const ScadaEdgeLayoutSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: z.enum(["power", "signal", "pipe"]).default("signal"),
});
export type ScadaEdgeLayout = z.infer<typeof ScadaEdgeLayoutSchema>;

export interface TwinViewState {
  mappings: TwinMapping[];
  nameplates: Record<string, MotorNameplate>;
  modelUrl: string | null;
}

export interface ViewsState {
  diagramDocId: string;
  sheets: Array<"unifilar" | "multifilar" | "ladder">;
  unifilar: {
    nodes: Record<string, UnifilarNodeLayout>;
    edges: Record<string, UnifilarEdgeLayout>;
  };
  multifilar: {
    nodes: Record<string, MultifilarNodeLayout>;
    edges: Record<string, MultifilarEdgeLayout>;
  };
  scada: {
    widgets: Record<string, ScadaWidgetLayout>;
    edges: ScadaEdgeLayout[];
  };
  twin: TwinViewState;
}

export interface UnifiedProjectDoc {
  schemaVersion: typeof UNIFIED_SCHEMA_VERSION;
  metadata: ProjectMetadata;
  engineering: {
    equipments: Record<string, CanonicalEquipment>;
    connections: Record<string, ElectricalConnection>;
    circuits: Record<string, CanonicalCircuit>;
    tags: Record<string, CanonicalTag>;
    controlBindings: Record<string, ControlBinding>;
    plcChannels: Record<string, PlcChannelBinding>;
  };
  plc: {
    project: PlcProject;
    activeLadderBlockId: string;
    activeFbdBlockId: string;
  };
  views: ViewsState;
  studies: Record<string, EngineeringStudyRecord>;
  diagnostics: ModelDiagnostic[];
}

// ── Helpers for Terminal Synthesis & Study Dependency Hashing ───────────────

export function defaultCategoryForKind(kind: NodeKind | string): EquipmentCategory {
  switch (kind) {
    case "transformer":
    case "psu":
    case "busbar":
    case "ccm":
      return "source";
    case "breaker":
    case "rcd":
    case "fuse":
    case "disconnector":
    case "relay":
      return "protection";
    case "contactor":
      return "switching";
    case "vfd":
    case "softstarter":
      return "drive";
    case "motor":
    case "load":
    case "lamp":
    case "socket":
    case "conveyor":
    case "screw":
    case "valve":
    case "pump":
    case "tank":
    case "reactor":
    case "cylinder":
      return "load";
    case "pt100":
    case "pressure":
    case "flow":
    case "level":
    case "encoder":
      return "instrumentation";
    case "estop":
    case "lightcurtain":
      return "safety";
    case "ground":
    case "neutral":
    case "terminal":
      return "reference";
    default:
      return "passive";
  }
}

export function defaultPhasesForKind(kind: NodeKind | string, poles?: number): PhasesConfig {
  if (kind === "ground") return "PE";
  if (kind === "neutral") return "N";
  if (kind === "psu") return "DC";
  if (poles === 1) return "1F";
  if (poles === 2) return "F+N";
  if (poles === 3) return "3F";
  if (poles === 4) return "3F+N";
  if (
    kind === "motor" ||
    kind === "transformer" ||
    kind === "vfd" ||
    kind === "softstarter" ||
    kind === "busbar" ||
    kind === "ccm" ||
    kind === "contactor"
  ) {
    return "3F";
  }
  return "F+N";
}

export function defaultTerminalsForEquipment(
  equipmentId: string,
  kind: NodeKind | string,
): CanonicalTerminal[] {
  const mk = (
    code: string,
    terminalKind: CanonicalTerminal["kind"],
    direction: CanonicalTerminal["direction"] = "bidirectional",
  ): CanonicalTerminal => ({
    id: `${equipmentId}:${code}`,
    code,
    kind: terminalKind,
    direction,
  });

  switch (kind) {
    case "contactor":
      return [
        mk("1/L1", "L1", "in"),
        mk("2/T1", "L1", "out"),
        mk("3/L2", "L2", "in"),
        mk("4/T2", "L2", "out"),
        mk("5/L3", "L3", "in"),
        mk("6/T3", "L3", "out"),
        mk("13", "aux_no", "in"),
        mk("14", "aux_no", "out"),
        mk("A1", "control_supply", "in"),
        mk("A2", "control_supply", "out"),
      ];
    case "breaker":
    case "fuse":
    case "disconnector":
      return [
        mk("1/L1", "L1", "in"),
        mk("2/T1", "L1", "out"),
        mk("3/L2", "L2", "in"),
        mk("4/T2", "L2", "out"),
        mk("5/L3", "L3", "in"),
        mk("6/T3", "L3", "out"),
      ];
    case "rcd":
      return [
        mk("1/L1", "L1", "in"),
        mk("2/T1", "L1", "out"),
        mk("3/L2", "L2", "in"),
        mk("4/T2", "L2", "out"),
        mk("5/L3", "L3", "in"),
        mk("6/T3", "L3", "out"),
        mk("N_IN", "N", "in"),
        mk("N_OUT", "N", "out"),
      ];
    case "relay":
      return [
        mk("1/L1", "L1", "in"),
        mk("2/T1", "L1", "out"),
        mk("3/L2", "L2", "in"),
        mk("4/T2", "L2", "out"),
        mk("5/L3", "L3", "in"),
        mk("6/T3", "L3", "out"),
        mk("95", "aux_nc", "in"),
        mk("96", "aux_nc", "out"),
        mk("97", "aux_no", "in"),
        mk("98", "aux_no", "out"),
      ];
    case "motor":
      return [
        mk("U1", "L1", "in"),
        mk("V1", "L2", "in"),
        mk("W1", "L3", "in"),
        mk("PE", "PE", "in"),
      ];
    default:
      return [mk("in", "L1", "in"), mk("out", "L1", "out")];
  }
}

export function computeEquipmentStudyHash(
  doc: Pick<UnifiedProjectDoc, "metadata" | "engineering">,
  equipmentIds: string[],
): string {
  const sortedIds = [...equipmentIds].sort();
  const payload = {
    nominalSystem: doc.metadata.nominalSystem,
    applicableStandards: doc.metadata.applicableStandards,
    equipments: sortedIds.map((id) => {
      const eq = doc.engineering.equipments[id];
      return eq
        ? {
            id: eq.id,
            catalogType: eq.catalogType,
            phases: eq.phases,
            specs: eq.specs,
          }
        : { id, missing: true };
    }),
    connections: Object.values(doc.engineering.connections)
      .filter(
        (c) =>
          sortedIds.includes(c.fromEquipmentId) || sortedIds.includes(c.toEquipmentId),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((c) => ({
        id: c.id,
        from: c.fromEquipmentId,
        to: c.toEquipmentId,
        circuitConfig: c.circuitConfig,
        conductor: c.conductor,
      })),
  };
  return JSON.stringify(payload);
}

export function inferAreaFromAddress(address?: string, name?: string): TagArea {
  const token = (address || name || "").trim().toUpperCase();
  if (token.startsWith("%I") || token.startsWith("I")) return "I";
  if (token.startsWith("%Q") || token.startsWith("Q")) return "Q";
  if (token.startsWith("%DB") || token.startsWith("DB")) return "DB";
  return "M";
}

export function mapConfigToPhases(cfg?: CircuitConfig): PhasesConfig {
  if (!cfg) return "3F";
  if (cfg === "F") return "1F";
  return cfg;
}
