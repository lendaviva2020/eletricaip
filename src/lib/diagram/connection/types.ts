// Domain types for Unifilar Connection Engine, Topology Graph, Nets and Terminals
// Standards: IEC 60947, IEC 60617, IEC 60204-1, NBR 5410, NBR 14039

import type { NodeKind, DiagramNode, DiagramEdge, Position } from "../schema";
import type { CanonicalTerminal, ElectricalConnection } from "@/lib/model/unified-schema";

export type ElectricalNature = "power" | "control" | "protection" | "signal";

export type ElectricalPhase =
  "L1" | "L2" | "L3" | "N" | "PE" | "DC+" | "DC-" | "3F" | "3F+N" | "3F+N+PE" | "any" | "signal";

export type TerminalDirection = "in" | "out" | "bidirectional";

export interface TerminalDefinition {
  code: string;
  name: string;
  description: string;
  nature: ElectricalNature;
  phase?: ElectricalPhase;
  direction: TerminalDirection;
  isRequired: boolean;
  portId: string; // Corresponding canvas render port (e.g. "T", "B", "L", "R", "B1")
  maxConnections?: number;
}

export interface EquipmentTerminalProfile {
  kind: NodeKind;
  description: string;
  terminals: TerminalDefinition[];
  defaultInPort: string;
  defaultOutPort: string;
}

export interface NetMember {
  equipmentId: string;
  terminalId: string;
  terminalCode: string;
  direction?: TerminalDirection;
  nature: ElectricalNature;
  phase?: ElectricalPhase;
}

export interface CanonicalNet {
  id: string;
  name: string;
  nature: ElectricalNature;
  phase?: ElectricalPhase;
  voltageV?: number;
  members: NetMember[];
  connectionIds: string[];
}

export interface CircuitPath {
  id: string;
  name: string;
  sourceEquipmentId: string;
  loadEquipmentId: string;
  equipmentIds: string[];
  connectionIds: string[];
  isComplete: boolean;
  interruptionPoint?: {
    equipmentId: string;
    terminalCode: string;
    reason: string;
  };
}

export type ConnectivityStatus =
  "COMPLETE" | "COMPLETE_WITH_WARNINGS" | "INCOMPLETE" | "INVALID" | "REQUIRES_ENGINEERING_INPUT";

export interface TopologyDiagnostic {
  id: string;
  code: string;
  message: string;
  severity: "error" | "warning" | "info";
  entityIds: string[];
  suggestedFix?: string;
}

export interface TopologyValidationResult {
  status: ConnectivityStatus;
  isElectricallyConsistent: boolean;
  totalEquipments: number;
  totalConnections: number;
  totalNets: number;
  disconnectedNodes: Array<{ nodeId: string; label: string; kind: NodeKind }>;
  missingConnections: Array<{
    equipmentId: string;
    terminalCode: string;
    reason: string;
    severity: "error" | "warning";
  }>;
  invalidConnections: Array<{
    edgeId: string;
    source: string;
    target: string;
    reason: string;
    severity: "error";
  }>;
  isolatedNets: Array<{ netId: string; name: string }>;
  paths: CircuitPath[];
  diagnostics: TopologyDiagnostic[];
}

export interface ConnectivityReport {
  status: ConnectivityStatus;
  summary: string;
  equipmentsCount: number;
  connectionsCount: number;
  netsCount: number;
  pathsCount: number;
  completePathsCount: number;
  incompletePathsCount: number;
  warnings: string[];
  errors: string[];
  pendingEngineeringInput?: string[];
}

export interface AutoRouteLayoutResult {
  nodes: Record<string, Position>;
  waypoints: Record<string, Position[]>;
}
