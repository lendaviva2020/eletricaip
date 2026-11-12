/**
 * Pure Domain Model types for the Compact Logic Controller Studio.
 *
 * Strictly pure: zero React, zero Zustand, zero database clients, and zero global clock access.
 * FBD and LAD are projections of this single canonical representation.
 */

export const COMPACT_SIGNAL_TYPES = [
  "BOOL",
  "INT",
  "REAL",
  "TIME",
  "BYTE",
  "WORD",
  "STRING",
] as const;

export type CompactSignalType = (typeof COMPACT_SIGNAL_TYPES)[number];

export const COMPACT_IO_KINDS = [
  "DI",
  "DO",
  "AI",
  "AO",
  "M",
  "AM",
  "NI",
  "NQ",
  "NAI",
  "NAQ",
] as const;

export type CompactIoKind = (typeof COMPACT_IO_KINDS)[number];

export type CompactPortDirection = "input" | "output";

export type CompactParamValue = boolean | number | string;

export type CompactBlockCategory =
  | "io"
  | "constant"
  | "logic"
  | "timer"
  | "counter"
  | "clock"
  | "analog"
  | "special"
  | "udf"
  | "connector";

export interface CompactPortInstance {
  id: string;
  name: string;
  direction: CompactPortDirection;
  signalType: CompactSignalType;
  negated?: boolean;
  required?: boolean;
  defaultValue?: CompactParamValue;
}

export interface CompactNode {
  id: string;
  pageId: string;
  blockType: string;
  instanceName: string;
  category: CompactBlockCategory;
  libraryVersion: string;
  udfId?: string;
  udfVersion?: string;
  params: Record<string, CompactParamValue>;
  inputs: CompactPortInstance[];
  outputs: CompactPortInstance[];
  /** Reference to a symbolic I/O or memory entry (`CompactIoSymbol.id` or canonical tag ID). */
  ioSymbolId?: string;
  comment?: string;
  retentive?: boolean;
}

export interface CompactConnection {
  id: string;
  pageId: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
  signalType: CompactSignalType;
  negatedTarget?: boolean;
  comment?: string;
}

export interface CompactPage {
  id: string;
  name: string;
  order: number;
  description?: string;
  gridCols: number;
  gridRows: number;
}

export interface CompactIoSymbol {
  id: string;
  ioKind: CompactIoKind;
  address: string;
  symbolicName: string;
  signalType: CompactSignalType;
  canonicalTagId?: string;
  comment: string;
  retentive: boolean;
  initialValue: CompactParamValue;
}

export interface CompactUdfPortSpec {
  id: string;
  name: string;
  direction: CompactPortDirection;
  signalType: CompactSignalType;
  defaultValue?: CompactParamValue;
}

export interface CompactUdfParamSpec {
  key: string;
  label: string;
  signalType: CompactSignalType;
  defaultValue: CompactParamValue;
}

export interface CompactUdfDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  ports: CompactUdfPortSpec[];
  params: CompactUdfParamSpec[];
  internalNodes: CompactNode[];
  internalConnections: CompactConnection[];
  /** Maps external UDF port IDs to internal node+port targets. */
  portBindings: Record<string, { nodeId: string; portId: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface CompactModuleSlotSpec {
  slotIndex: number;
  catalogId: string;
  partCode: string;
  family:
    | "BASE_COMPACT"
    | "EXPANSION_DI_DO"
    | "EXPANSION_AI"
    | "EXPANSION_AO"
    | "COMM_MODULE"
    | "POWER_SUPPLY"
    | "ACCESSORY";
  digitalInputs: number;
  digitalOutputs: number;
  analogInputs: number;
  analogOutputs: number;
}

export interface CompactHardwareArchitecture {
  baseCatalogId: string;
  basePartCode: string;
  supplyCatalogId?: string;
  hasExternalDisplay: boolean;
  maxBlocks: number;
  retentiveMemoryBytes: number;
  maxDigitalInputs: number;
  maxDigitalOutputs: number;
  maxAnalogInputs: number;
  maxAnalogOutputs: number;
  slots: CompactModuleSlotSpec[];
}

export interface CompactVisualPoint {
  x: number;
  y: number;
}

export interface CompactVisualNodeLayout {
  x: number;
  y: number;
  width?: number;
  height?: number;
  collapsed?: boolean;
}

export interface CompactVisualEdgeLayout {
  waypoints?: CompactVisualPoint[];
}

export interface CompactLayoutState {
  fbd: Record<string, CompactVisualNodeLayout>;
  lad: Record<string, CompactVisualNodeLayout>;
  edgesFbd: Record<string, CompactVisualEdgeLayout>;
  edgesLad: Record<string, CompactVisualEdgeLayout>;
}

export type CompactNotation = "FBD" | "LAD";

export interface CompactProgramRevision {
  revision: number;
  message: string;
  savedAt: string;
  author?: string;
  programHash: string;
}

export interface CompactProgramModel {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  preferredNotation: CompactNotation;
  cycleTimeMs: number;
  createdAt: string;
  updatedAt: string;
  pages: CompactPage[];
  nodes: CompactNode[];
  connections: CompactConnection[];
  ioSymbols: CompactIoSymbol[];
  udfs: CompactUdfDefinition[];
  hardware: CompactHardwareArchitecture;
  layout: CompactLayoutState;
  revisions: CompactProgramRevision[];
}

export type CompactDiagnosticSeverity = "error" | "warning" | "info";

export type CompactDiagnosticCode =
  | "TYPE_MISMATCH"
  | "UNCONNECTED_REQUIRED_INPUT"
  | "MULTIPLE_DRIVERS"
  | "OUTPUT_SHORT_CIRCUIT"
  | "FEEDBACK_WITHOUT_MEMORY"
  | "DUPLICATE_SYMBOL_NAME"
  | "DUPLICATE_IO_ADDRESS"
  | "DUPLICATE_INSTANCE_NAME"
  | "DUPLICATE_PAGE_NAME"
  | "DUPLICATE_NODE_ID"
  | "DANGLING_CONNECTION"
  | "UNKNOWN_PAGE"
  | "ORPHAN_PAGE_CONNECTOR"
  | "HARDWARE_BLOCK_LIMIT_EXCEEDED"
  | "HARDWARE_MEMORY_EXCEEDED"
  | "IO_CAPACITY_EXCEEDED"
  | "HW_UNKNOWN_CATALOG_ITEM"
  | "HW_VOLTAGE_MISMATCH"
  | "HW_ANALOG_REQUIRES_24V_PSU"
  | "HW_MAX_EXPANSION_SLOTS"
  | "HW_IO_ADDRESS_UNAVAILABLE"
  | "UDF_RECURSION_CYCLE"
  | "UDF_VERSION_DOWNGRADE"
  | "UDF_PORT_REMOVED_ON_MIGRATION";

export interface CompactDiagnostic {
  readonly id: string;
  readonly severity: CompactDiagnosticSeverity;
  readonly code: CompactDiagnosticCode;
  readonly messageKey: string;
  readonly message: string;
  readonly pageId?: string;
  readonly nodeId?: string;
  readonly portId?: string;
  readonly connectionId?: string;
}

export interface CompactValidationReport {
  readonly valid: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly blockCount: number;
  readonly estimatedRetentiveBytes: number;
  readonly diagnostics: readonly CompactDiagnostic[];
}
