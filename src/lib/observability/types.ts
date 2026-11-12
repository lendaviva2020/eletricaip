// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.7: INDUSTRIAL OBSERVABILITY & RELIABILITY
// Core Types, Health Engines, Pipeline Reliability, SLI/SLO & Incident Contracts
// Standards: IEC 62443, NIST SP 800-82 Rev. 3, ISA-18.2, OpenTelemetry Semantic Conventions
// =============================================================================

import { z } from "zod";
import type { FleetRole } from "@/lib/edge/types";
export type { FleetRole };

/**
 * Invariante de Segurança Permanente: Bloqueio estrito de controle físico.
 * A observabilidade apenas monitora, mede, correlaciona e relata.
 */
export const IS_PHYSICAL_CONTROL_ALLOWED = false as const;

// -----------------------------------------------------------------------------
// 1. Estados Canônicos de Saúde (Deterministic Health States)
// -----------------------------------------------------------------------------

export type HealthState =
  "HEALTHY" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN" | "MAINTENANCE" | "NOT_INSTRUMENTED";

export type ComponentType =
  | "CLOUD_SERVICE"
  | "CLOUD_API"
  | "CLOUD_DATABASE"
  | "CLOUD_AI_SERVICE"
  | "EDGE_GATEWAY"
  | "EDGE_FLEET"
  | "INDUSTRIAL_EQUIPMENT"
  | "PROTOCOL_MODBUS_TCP"
  | "PROTOCOL_OPC_UA"
  | "PROTOCOL_MQTT_SPARKPLUG"
  | "DATA_PIPELINE"
  | "SCADA_CORE"
  | "HISTORIAN_STORAGE"
  | "AUTH_SECURITY_SERVICE"
  | "ENGINEERING_SOLVER";

export type HealthSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ComponentHealthSnapshot {
  componentId: string;
  componentType: ComponentType;
  tenantId: string;
  plantId: string;
  observedAt: number;
  lastSuccessfulObservationAt: number | null;
  state: HealthState;
  severity: HealthSeverity;
  reasonCode: string;
  evidenceReference: string;
  source: "HEALTH_PROBE" | "HEARTBEAT" | "TELEMETRY_PIPELINE" | "SECURITY_AUDIT";
  metricValues: Record<string, number | string | boolean | null>;
  evaluationWindowMs: number;
  thresholdVersion: string;
  flappingDetected?: boolean;
}

// -----------------------------------------------------------------------------
// 2. Conectividade Industrial & Diagnósticos de Protocolo (Read-Only)
// -----------------------------------------------------------------------------

export interface ModbusDiagnostics {
  gatewayId: string;
  endpoint: string;
  isConnected: boolean;
  responseTimeMs: number;
  timeoutCount: number;
  exceptionCount: number;
  readFailuresCount: number;
  totalPollingCycles: number;
  successfulCycles: number;
  successRatePercent: number;
  lastErrorCode?: string;
  lastSuccessfulReadTimestamp: number | null;
}

export interface OpcUaDiagnostics {
  gatewayId: string;
  endpoint: string;
  sessionState: "ACTIVE" | "RECONNECTING" | "CLOSED" | "FAILED";
  secureChannelState: "OPEN" | "RENEWING" | "CLOSED";
  certificateStatus: "VALID" | "EXPIRING_SOON" | "REVOKED" | "EXPIRED";
  subscriptionCount: number;
  monitoredItemsCount: number;
  publishIntervalMs: number;
  goodStatusCodesCount: number;
  badStatusCodesCount: number;
  uncertainStatusCodesCount: number;
  reconnectAttempts: number;
  lastSuccessfulPublishTimestamp: number | null;
}

export interface MqttSparkplugDiagnostics {
  gatewayId: string;
  brokerUrl: string;
  connectionState: "CONNECTED" | "DISCONNECTED" | "RECONNECTING";
  sessionPresent: boolean;
  keepaliveIntervalSec: number;
  qosLevelUsed: 0 | 1 | 2;
  messagesReceivedTotal: number;
  duplicateMessagesCount: number;
  deliveryDelayMs: number;
  reconnectionCount: number;
  edgeNodesOnline: number;
  devicesOnline: number;
  lastMessageTimestamp: number | null;
}

// -----------------------------------------------------------------------------
// 3. Confiabilidade do Pipeline de Dados (10 Estágios Formais)
// -----------------------------------------------------------------------------

export type PipelineStage =
  | "1_SOURCE_COLLECTION"
  | "2_NORMALIZATION"
  | "3_SCHEMA_VALIDATION"
  | "4_BATCH_FORMATION"
  | "5_LOCAL_BUFFER_PERSISTENCE"
  | "6_EDGE_TRANSMISSION"
  | "7_CLOUD_RECEPTION"
  | "8_DEDUPLICATION"
  | "9_HISTORIAN_PERSISTENCE"
  | "10_SCADA_DISPATCH";

export interface PipelineStageMetric {
  stage: PipelineStage;
  samplesIn: number;
  samplesOut: number;
  samplesDropped: number;
  processingTimeMs: number;
  dropReason?: string;
}

export interface PipelineReliabilityReport {
  gatewayId: string;
  tenantId: string;
  plantId: string;
  evaluatedAt: number;
  stages: Record<PipelineStage, PipelineStageMetric>;
  totalSamplesReceived: number;
  invalidSamplesCount: number;
  duplicateSamplesCount: number;
  lateSamplesCount: number;
  outOfOrderCount: number;
  rejectedBatchesCount: number;
  schemaErrorsCount: number;
  authenticationFailuresCount: number;
  sequenceLossCount: number;
  averageIngestionDurationMs: number;
  averageSyncDurationMs: number;
  currentBacklogSamples: number;
  oldestBacklogSampleAgeMs: number;
}

// -----------------------------------------------------------------------------
// 4. Gestão de Incidentes Operacionais (IEC 62443 / ITIL Industrial)
// -----------------------------------------------------------------------------

export type IncidentCategory = "INDUSTRIAL_PROCESS" | "INFRASTRUCTURE" | "SECURITY_EVENT";

export type IncidentSeverity = "INFO" | "WARNING" | "CRITICAL" | "FATAL";

export type IncidentStatus =
  "OPEN" | "ACKNOWLEDGED" | "INVESTIGATING" | "MITIGATED" | "RESOLVED" | "CLOSED";

export type IncidentInvestigationStage =
  | "INCIDENT_DETECTED"
  | "ROOT_CAUSE_SUSPECTED"
  | "ROOT_CAUSE_CONFIRMED"
  | "MITIGATION_RECORDED"
  | "RECOVERY_OBSERVED"
  | "INCIDENT_RESOLVED";

export interface IncidentAuditEntry {
  transitionId: string;
  timestamp: number;
  fromStatus: IncidentStatus;
  toStatus: IncidentStatus;
  actorId: string;
  actorEmail: string;
  actorRole: FleetRole;
  note: string;
  resolution?: string;
  investigationStage?: IncidentInvestigationStage;
  tamperProofHash: string;
}

export interface RejectedHypothesisRecord {
  diagnosticId: string;
  hypothesis: string;
  rejectedBy: string;
  rejectedAt: number;
  reason: string;
}

export interface RecoverySampleEvidence {
  sampleId: string;
  timestamp: number;
  sequenceNumber: number;
  quality: "GOOD" | "BAD" | "UNCERTAIN" | "STALE" | "NOT_CONNECTED" | "FORCED";
  persistedInHistorian?: boolean;
}

export interface IncidentRecoveryValidation {
  isConsistent: boolean;
  requiredSamples: number;
  observedHealthySamples: number;
  dataPersistedVerified: boolean;
  minWindowDurationMs?: number;
  observedWindowDurationMs?: number;
  expectedCadenceMs?: number;
  rejectionReasonCode?: string;
  validatedAt?: number;
  validatedBy?: string;
}

export interface IndustrialIncident {
  incidentId: string;
  organizationId: string;
  plantId: string;
  sourceComponentId: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  title: string;
  description: string;
  firstObservedAt: number;
  lastObservedAt: number;
  detectedAt?: number;
  recoveredAt?: number;
  impact: string;
  evidence: Record<string, any>;
  correlationId: string;
  assignedTo?: {
    id: string;
    email: string;
    name: string;
  };
  status: IncidentStatus;
  investigationStage?: IncidentInvestigationStage;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  resolvedAt?: number;
  resolvedBy?: string;
  resolution?: string;
  auditTrail: IncidentAuditEntry[];
  relatedAlarms: string[];
  dedupCount: number;
  // Gate 3.8 — Extensões de Diagnóstico e Investigação (sem criar segundo lifecycle)
  associatedDiagnostics?: string[];
  probableCause?: {
    diagnosticId: string;
    ruleId: string;
    description: string;
    confidence: number;
    evidenceRefs: string[];
  };
  confirmedCause?: {
    diagnosticId: string;
    ruleId: string;
    description: string;
    confirmedBy: string;
    confirmedAt: number;
    evidenceRefs: string[];
  };
  affectedComponents?: string[];
  operationalScope?: string;
  rejectedHypotheses?: RejectedHypothesisRecord[];
  recommendedRunbooks?: string[];
  investigationPlan?: string;
  investigationResult?: string;
  recoveryValidation?: IncidentRecoveryValidation;
  timelineEvents?: string[];
}

// -----------------------------------------------------------------------------
// 5. SLI, SLO e Confiabilidade Metrológica
// -----------------------------------------------------------------------------

export type SloTargetService =
  | "CLOUD_SERVICE"
  | "EDGE_GATEWAY"
  | "INDUSTRIAL_SOURCE"
  | "DATA_INGESTION"
  | "SCADA_INTERFACE"
  | "HISTORIAN_STORAGE"
  | "DATA_FRESHNESS";

export interface SloDefinition {
  sloId: string;
  targetService: SloTargetService;
  name: string;
  description: string;
  targetPercent: number; // Ex: 99.9 ou 99.5
  evaluationWindowDays: number;
  calculationMethod: string;
  numeratorDescription: string;
  denominatorDescription: string;
  unit: string;
  version: string;
}

export interface SloMeasurement {
  sloId: string;
  targetService: SloTargetService;
  periodStart: number;
  periodEnd: number;
  totalObservations: number;
  validObservationsNumerator: number;
  totalEligibleDenominator: number;
  achievedPercent: number;
  targetPercent: number;
  isCompliant: boolean;
  errorBudgetTotalPercent: number;
  errorBudgetConsumedPercent: number;
  errorBudgetRemainingPercent: number;
  unknownIntervalsCount: number;
  plannedMaintenanceDurationMs: number;
  unplannedOutageDurationMs: number;
  calculationFormula: string;
  policyVersion: string;
}

// -----------------------------------------------------------------------------
// 6. Schemas Zod de Validação
// -----------------------------------------------------------------------------

export const HealthStateSchema = z.enum([
  "HEALTHY",
  "DEGRADED",
  "UNAVAILABLE",
  "UNKNOWN",
  "MAINTENANCE",
  "NOT_INSTRUMENTED",
]);

export const ComponentTypeSchema = z.enum([
  "CLOUD_SERVICE",
  "CLOUD_API",
  "CLOUD_DATABASE",
  "CLOUD_AI_SERVICE",
  "EDGE_GATEWAY",
  "EDGE_FLEET",
  "INDUSTRIAL_EQUIPMENT",
  "PROTOCOL_MODBUS_TCP",
  "PROTOCOL_OPC_UA",
  "PROTOCOL_MQTT_SPARKPLUG",
  "DATA_PIPELINE",
  "SCADA_CORE",
  "HISTORIAN_STORAGE",
  "AUTH_SECURITY_SERVICE",
  "ENGINEERING_SOLVER",
]);

export const ComponentHealthSnapshotSchema = z.object({
  componentId: z.string().min(1),
  componentType: ComponentTypeSchema,
  tenantId: z.string().min(1),
  plantId: z.string().min(1),
  observedAt: z.number().int().positive(),
  lastSuccessfulObservationAt: z.number().int().positive().nullable(),
  state: HealthStateSchema,
  severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  reasonCode: z.string().min(1),
  evidenceReference: z.string().min(1),
  source: z.enum(["HEALTH_PROBE", "HEARTBEAT", "TELEMETRY_PIPELINE", "SECURITY_AUDIT"]),
  metricValues: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
  evaluationWindowMs: z.number().int().positive(),
  thresholdVersion: z.string().min(1),
  flappingDetected: z.boolean().optional(),
});

// =============================================================================
// GATE 3.8 — INDUSTRIAL DIAGNOSTICS, CAUSAL CORRELATION & ASSISTED RESOLUTION
// =============================================================================

// -----------------------------------------------------------------------------
// 7. Motor de Correlação de Eventos Industriais (Fase 1)
// -----------------------------------------------------------------------------

export interface CorrelatedOperationalEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly plantId: string;
  readonly componentId: string;
  readonly componentType: ComponentType;
  readonly equipmentId?: string;
  readonly gatewayId?: string;
  readonly tagId?: string;
  readonly sourceTimestamp: number;
  readonly observedAt: number;
  readonly ingestionTimestamp: number;
  readonly sequenceNumber: number;
  readonly eventType: string;
  readonly severity: HealthSeverity;
  readonly quality: "GOOD" | "BAD" | "UNCERTAIN" | "STALE" | "NOT_CONNECTED" | "FORCED";
  readonly provenance:
    | "PHYSICAL_DATA"
    | "EDGE_DAEMON"
    | "CLOUD_SERVER"
    | "SCADA_RUNTIME"
    | "HISTORIAN_ENGINE"
    | "SECURITY_MONITOR"
    | "SIMULATED";
  readonly correlationId: string;
  readonly traceId?: string;
  readonly evidenceReference: string;
  readonly clockDriftMs?: number;
  readonly isOutOfOrder?: boolean;
  readonly isDuplicate?: boolean;
  readonly chainIndex?: number;
  readonly previousEventHash?: string;
  readonly eventHash?: string;
  readonly metadata?: Record<string, any>;
}

// -----------------------------------------------------------------------------
// 8. Grafo de Dependências Industriais (Fase 2)
// -----------------------------------------------------------------------------

export type DependencyRelationType =
  | "ARCHITECTURAL_DEPENDENCY"
  | "DATA_ACQUISITION_PATH"
  | "PHYSICAL_FEEDER_TOPOLOGY"
  | "STORAGE_PIPELINE"
  | "VISUALIZATION_BINDING";

export type DependencyValidationState = "VALIDATED_CANONICAL" | "CONFIGURED_UNVERIFIED" | "UNKNOWN";

export interface DependencyNode {
  componentId: string;
  componentType: ComponentType;
  tenantId: string;
  plantId: string;
  displayName: string;
  canonicalUuid?: string;
  state: HealthState;
  metadata?: Record<string, any>;
}

export interface DependencyEdge {
  edgeId: string;
  tenantId: string;
  plantId: string;
  fromComponentId: string; // Componente provedor (Upstream, ex: Edge Gateway)
  toComponentId: string; // Componente consumidor/dependente (Downstream, ex: Protocol / Equipment / Tag)
  relationType: DependencyRelationType;
  validationState: DependencyValidationState;
  evidenceSource: string;
}

export interface DependencyImpactAnalysis {
  tenantId: string;
  plantId: string;
  originComponentId: string;
  originComponentType: ComponentType;
  originState: HealthState;
  dependentComponents: string[]; // Downstream
  unavailableDependencies: string[]; // Upstream com falha
  impactScope: {
    affectedGateways: string[];
    affectedProtocols: string[];
    affectedEquipments: string[];
    affectedTags: string[];
    affectedHistorianStreams: string[];
    affectedScadaViews: string[];
  };
  propagationPaths: string[][];
  sharedDependencies: Array<{
    componentId: string;
    sharedByConsumers: string[];
  }>;
  independentComponents: string[];
}

// -----------------------------------------------------------------------------
// 9. Diagnóstico Determinístico Baseado em Regras (Fase 3)
// -----------------------------------------------------------------------------

export type DiagnosticStatus =
  "OBSERVED" | "SUSPECTED" | "CONFIRMED_BY_EVIDENCE" | "INCONCLUSIVE" | "REJECTED" | "RESOLVED";

export type DiagnosticRuleId =
  | "RULE_01_GATEWAY_OFFLINE_INGESTION_HALT"
  | "RULE_02_GATEWAY_ONLINE_SOURCE_UNAVAILABLE"
  | "RULE_03_MODBUS_RECURRENT_TIMEOUTS"
  | "RULE_04_OPCUA_SESSION_LOST"
  | "RULE_05_MQTT_BROKER_DISCONNECTED"
  | "RULE_06_CERTIFICATE_EXPIRED"
  | "RULE_07_CERTIFICATE_REVOKED"
  | "RULE_08_OUTBOX_ACCUMULATING"
  | "RULE_09_EDGE_DISK_NEAR_SATURATION"
  | "RULE_10_SQLITE_STORAGE_FAILURE"
  | "RULE_11_CLOUD_UNAVAILABLE_EDGE_AUTONOMOUS"
  | "RULE_12_CLOUD_HEALTHY_DB_UNAVAILABLE"
  | "RULE_13_DB_HEALTHY_APP_FAILURE"
  | "RULE_14_HISTORIAN_FAILURE_SCADA_LIVE"
  | "RULE_15_LATE_DATA_SYNC_INTERRUPTED"
  | "RULE_16_PIPELINE_SEQUENCE_GAP"
  | "RULE_17_DUPLICATE_MESSAGES_STORM"
  | "RULE_18_OUT_OF_ORDER_TELEMETRY"
  | "RULE_19_CLOCK_DRIFT_DETECTED"
  | "RULE_20_PERSISTENT_BAD_QUALITY"
  | "RULE_21_SOURCE_STATE_UNKNOWN"
  | "RULE_22_TAG_STALE_NO_SAMPLES"
  | "RULE_23_DEADBAND_NO_CHANGE_HEALTHY"
  | "RULE_24_CERT_FAILURE_ON_RECONNECT"
  | "RULE_25_SYNC_FAILURE_POST_EDGE_UPDATE"
  | "RULE_26_GATEWAY_RESOURCE_SATURATION"
  | "RULE_27_GATEWAY_CLOUD_AUTH_FAILURE"
  | "RULE_28_CROSS_TENANT_ACCESS_BLOCKED"
  | "RULE_29_HISTORICAL_QUERY_FAILURE"
  | "RULE_30_OBSERVABILITY_SERVICE_INTERRUPTION"
  | "RULE_00_INSUFFICIENT_EVIDENCE";

export type ConfidenceMethod =
  | "DIRECT_MULTI_CONDITION_PROOF"
  | "TOPOLOGICAL_DEPENDENCY_VERIFICATION"
  | "SINGLE_SOURCE_OBSERVATION"
  | "TEMPORAL_PROXIMITY_ONLY_INSUFFICIENT"
  | "INSUFFICIENT_TELEMETRY";

export interface DeterministicDiagnosticRecord {
  diagnosticId: string;
  ruleId: DiagnosticRuleId;
  ruleVersion: string;
  incidentId?: string;
  tenantId: string;
  plantId: string;
  primaryComponent: string;
  affectedComponents: string[];
  evidenceReferences: string[];
  observedConditions: string[];
  expectedConditions: string[];
  missingInformation: string[];
  hypothesis: string;
  confidence: number; // 0.0 a 1.0
  confidenceMethod: ConfidenceMethod;
  createdAt: number;
  diagnosticStatus: DiagnosticStatus;
  recommendedRunbookIds: string[];
}

// -----------------------------------------------------------------------------
// 10. Causalidade e Propagação de Falhas (Fase 4)
// -----------------------------------------------------------------------------

export interface ClassifiedEventNode {
  eventId: string;
  componentId: string;
  eventType: string;
  role: "PRIMARY_ROOT_CAUSE_CANDIDATE" | "SECONDARY_PROPAGATED_SYMPTOM" | "INDEPENDENT_ANOMALY";
  suppressedVisualAlert: boolean; // Suprime ruído visual de infraestrutura sem apagar evento nem silenciar alarme industrial
  preservedOriginalEvent: CorrelatedOperationalEvent;
  upstreamCauseComponentId?: string;
  dependencyPathFromCause?: string[];
}

export interface CausalChainAnalysis {
  analysisId: string;
  tenantId: string;
  plantId: string;
  correlationId: string;
  confirmationCriteriaVersion?: string;
  firstSignalEvent: CorrelatedOperationalEvent;
  primaryCauses: Array<{
    componentId: string;
    eventId: string;
    eventType: string;
    status: "CONFIRMED_BY_EVIDENCE" | "SUSPECTED" | "INCONCLUSIVE";
    evidenceRefs: string[];
    explanation: string;
  }>;
  groupedSymptoms: ClassifiedEventNode[];
  propagationChain: string[];
  hasMultipleIndependentCauses: boolean;
  temporalOnlyCorrelationRejected: boolean;
  hasContradictoryEvidence?: boolean;
  topologicalOnlyWithoutOriginFailureRejected?: boolean;
}

// -----------------------------------------------------------------------------
// 11. Diagnóstico Assistido por IA (Fase 5)
// -----------------------------------------------------------------------------

export interface AiDiagnosticAnalysis {
  analysisId: string;
  incidentId?: string;
  tenantId: string;
  plantId: string;
  questionAsked: string;
  status: "COMPLETED" | "DIAGNOSTIC_INCONCLUSIVE" | "AI_SERVICE_UNAVAILABLE_FALLBACK";
  observedFacts: string[];
  availableEvidence: Array<{
    referenceId: string;
    sourceType:
      "EVENT" | "METRIC" | "DIAGNOSTIC_RULE" | "DEPENDENCY_GRAPH" | "HISTORIAN" | "RUNBOOK";
    summary: string;
  }>;
  hypotheses: string[];
  probableCauses: string[];
  missingInformation: string[];
  recommendations: Array<{
    step: string;
    actionCategory: RunbookActionType;
    runbookId?: string;
  }>;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW" | "INCONCLUSIVE";
  confidenceScore: number;
  promptInjectionDetected: boolean;
  sanitizedUntrustedInputsCount: number;
  generatedAt: number;
  isConsultativeOnly: true;
  isPhysicalControlAllowed: false;
}

// -----------------------------------------------------------------------------
// 12. Procedimentos Técnicos e Runbooks (Fase 6)
// -----------------------------------------------------------------------------

export type RunbookCategory =
  | "CLOUD"
  | "EDGE"
  | "MODBUS"
  | "OPC_UA"
  | "MQTT"
  | "HISTORIAN"
  | "SCADA"
  | "DATABASE"
  | "CERTIFICATES"
  | "SECURITY"
  | "SYNCHRONIZATION"
  | "DATA_QUALITY";

export type RunbookActionType =
  | "INFORMATIVE"
  | "READ_ONLY_VERIFICATION"
  | "SOFTWARE_ADMIN_PROCEDURE"
  | "AUTHORIZED_ENGINEER_REQUIRED"
  | "QUALIFIED_HUMAN_FIELD_INTERVENTION";

export interface RunbookStep {
  stepNumber: number;
  instruction: string;
  actionType: RunbookActionType;
  minimumRole: FleetRole;
  expectedOutcome: string;
}

export interface IndustrialRunbook {
  runbookId: string;
  title: string;
  category: RunbookCategory;
  affectedComponentTypes: ComponentType[];
  symptoms: string[];
  diagnosticChecks: RunbookStep[];
  requiredPermissions: FleetRole[];
  safetyWarnings: string[];
  expectedEvidence: string[];
  recoveryProcedure: RunbookStep[];
  validationProcedure: RunbookStep[];
  version: string;
  author: string;
  approvalStatus: "APPROVED" | "DRAFT" | "DEPRECATED";
  revisionHistory: Array<{
    version: string;
    date: string;
    author: string;
    summary: string;
  }>;
}

// -----------------------------------------------------------------------------
// 13. Indicadores Reais de Confiabilidade e Diagnóstico (Fase 9)
// -----------------------------------------------------------------------------

export interface IndustrialReliabilityMetrics {
  tenantId: string;
  plantId: string;
  windowStart: number;
  windowEnd: number;
  totalIncidentsInWindow: number;
  openIncidentsExcludedFromClosedMetrics: number;
  mttdMs: number | null; // Mean Time To Detect
  mttaMs: number | null; // Mean Time To Acknowledge
  mttrRecoveryMs: number | null; // Mean Time To Operational Recovery (recoveredAt - firstObservedAt)
  mttrResolutionMs: number | null; // Mean Time To Formal Resolution (resolvedAt - firstObservedAt)
  mtbfMs: number | "INSUFFICIENT_DATA"; // Mean Time Between Failures (apenas quando >= 2 falhas fechadas)
  recurrenceRatePercent: number;
  incidentFrequencyPerDay: number;
  confirmedCausePercent: number;
  confirmedCauseNumerator: number;
  confirmedCauseDenominator: number;
  dataRecoveryTimeAverageMs: number | null;
  incidentsByRootCause: Record<string, number>;
  mostAffectedComponents: Array<{
    componentId: string;
    incidentCount: number;
  }>;
  formulas: Record<string, string>;
}
