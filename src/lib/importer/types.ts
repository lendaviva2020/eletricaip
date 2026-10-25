// Types and contracts for the ElétricAi Universal Canvas Bundle & Importer
// Supports: Unifilar, Multifilar, Ladder, FBD, SCADA, PLC
// Zero Trust, 0 AI Credits, Deterministic Parsing & Validation

export const CANVAS_BUNDLE_FORMAT = "eletricai.canvas-bundle" as const;
export const CURRENT_BUNDLE_VERSION = "1.0.0" as const;

export type SupportedDiagramType =
  | "unifilar"
  | "multifilar"
  | "ladder"
  | "fbd"
  | "hybrid";

export type AllowedNodeKind =
  // Proteção e Manobra
  | "breaker"
  | "rcd"
  | "contactor"
  | "relay"
  | "fuse"
  | "disconnector"
  // Fonte e Conversão
  | "transformer"
  | "psu"
  | "vfd"
  | "softstarter"
  | "busbar"
  | "ccm"
  // Cargas
  | "motor"
  | "load"
  | "lamp"
  | "socket"
  // Instrumentação e Sensores
  | "pt100"
  | "pressure"
  | "flow"
  | "level"
  | "encoder"
  // Segurança
  | "estop"
  | "lightcurtain"
  // Referência
  | "ground"
  | "neutral"
  | "terminal";

export type AllowedEdgeKind = "power" | "signal" | "pipe" | "ground";

export type AllowedCircuitConfig =
  | "F"
  | "F+N"
  | "F+N+PE"
  | "3F"
  | "3F+PE"
  | "3F+N"
  | "3F+N+PE"
  | "PE"
  | "N";

export interface BundleProjectMeta {
  name: string;
  diagramType: SupportedDiagramType;
  units?: "metric" | "imperial";
  description?: string;
  standards?: string[];
  systemVoltageV?: number;
  frequencyHz?: 50 | 60;
}

export interface BundleNodePosition {
  x: number;
  y: number;
}

export interface BundleNode {
  id: string;
  type: AllowedNodeKind | string;
  label?: string;
  position: BundleNodePosition;
  rotation?: number;
  properties?: Record<string, string | number | boolean | null>;
}

export interface BundleEdge {
  id?: string;
  source: string; // from node id
  target: string; // to node id
  fromTerminal?: string;
  toTerminal?: string;
  kind?: AllowedEdgeKind;
  circuitConfig?: AllowedCircuitConfig;
}

export interface BundleLadderContact {
  kind: "XIC" | "XIO";
  operand: string;
}

export interface BundleLadderRung {
  id: string;
  comment?: string;
  output: {
    kind: "OTE" | "OTL" | "OTU" | "TON" | "TOF" | "TP";
    operand: string;
    params?: Record<string, string | number>;
  };
  branches: BundleLadderContact[][];
}

export interface BundleTag {
  name: string;
  type: "BOOL" | "INT" | "DINT" | "REAL" | "TIME" | "STRING";
  address?: string;
  initialValue?: boolean | number | string;
  description?: string;
}

export interface BundlePlcModule {
  slot: number;
  type: "DI" | "DO" | "AI" | "AO";
  partNumber?: string;
  channelsCount: number;
  label?: string;
}

export interface BundlePlcConfig {
  vendor?: string;
  rackName?: string;
  cpuModel?: string;
  modules?: BundlePlcModule[];
}

export interface EletricAiCanvasBundle {
  format: typeof CANVAS_BUNDLE_FORMAT;
  schemaVersion: typeof CURRENT_BUNDLE_VERSION;
  project: BundleProjectMeta;
  nodes: BundleNode[];
  edges: BundleEdge[];
  ladder?: {
    rungs: BundleLadderRung[];
  };
  plc?: BundlePlcConfig;
  tags?: BundleTag[];
  metadata?: {
    author?: string;
    generator?: string;
    generatedAt?: string;
    notes?: string;
  };
}

export type SupportedImporterFormat =
  | "json-bundle"
  | "yaml-bundle"
  | "csv-table"
  | "plcopen-xml"
  | "st-program"
  | "txt-spec"
  | "netlist"
  | "unknown";

export interface ImporterLimits {
  maxPayloadBytes: number;
  maxLines: number;
  maxNodes: number;
  maxEdges: number;
  maxTotalKeys: number;
  maxObjectDepth: number;
  maxPropertyLength: number;
  maxProcessingTimeMs: number;
}

export const DEFAULT_IMPORTER_LIMITS: ImporterLimits = {
  maxPayloadBytes: 25 * 1024 * 1024, // 25 MB
  maxLines: 50_000,                  // 50.000 linhas
  maxNodes: 10_000,                  // 10.000 nós
  maxEdges: 25_000,                  // 25.000 conexões
  maxTotalKeys: 150_000,             // 150.000 chaves/elementos
  maxObjectDepth: 15,                // 15 níveis de profundidade
  maxPropertyLength: 10_000,         // 10.000 caracteres por propriedade
  maxProcessingTimeMs: 15_000,       // 15 segundos
};

export type ImportSecuritySeverity = "critical" | "warning" | "info";

export interface ImportIssue {
  id: string;
  severity: ImportSecuritySeverity;
  category: "security" | "schema" | "component" | "connection" | "electrical";
  entityId?: string;
  message: string;
  details?: string;
  rejected?: boolean;
}

export interface ImportValidationReport {
  isValid: boolean;
  canImport: boolean;
  detectedFormat: SupportedImporterFormat;
  stats: {
    totalNodes: number;
    recognizedNodes: number;
    rejectedNodes: number;
    totalEdges: number;
    validEdges: number;
    rejectedEdges: number;
    ladderRungsCount: number;
    tagsCount: number;
    lineCount?: number;
    payloadBytes?: number;
    processingTimeMs?: number;
  };
  issues: ImportIssue[];
  bundle?: EletricAiCanvasBundle;
  parsedPayload?: unknown;
}

export type ImportApplicationMode = "merge" | "replace";
