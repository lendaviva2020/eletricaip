// ELÉTRICAI INDUSTRIAL OS — MASTER EDGE GATEWAY
// Core Types, Contracts, Driver Interfaces and Industrial Security Models
// Standards: IEC 62443, NIST SP 800-82 Rev. 3, OPC UA Part 2/4/5/8, Modbus TCP, Eclipse Sparkplug B

import type { TagQuality, TagDataType, ProtocolDriver, HistoricalSample } from "../scada/types";
export type { TagQuality, TagDataType, ProtocolDriver, HistoricalSample };

export type EdgeConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "DEGRADED"
  | "RECONNECTING"
  | "AUTHENTICATION_FAILED"
  | "CERTIFICATE_INVALID"
  | "TIMEOUT"
  | "ERROR"
  | "STOPPED";

export type IndustrialProtocol = "OPC_UA" | "MODBUS_TCP" | "MQTT_SPARKPLUG_B";

export interface GatewayIdentity {
  gatewayId: string;
  organizationId: string;
  plantId: string;
  stationId: string;
  gatewayVersion: string;
  installationId: string;
  certificateFingerprint: string;
  registeredAt: string;
  lastSeenAt: string;
  operationalState: "ONLINE" | "OFFLINE" | "DEGRADED" | "PROVISIONING";
}

export interface ProvisioningToken {
  token: string;
  tokenHash?: string;
  organizationId: string;
  plantId: string;
  stationId: string;
  expiresAt: number; // Epoch ms
  isConsumed: boolean;
  consumedAt?: number;
  issuedBy: string;
  isRevoked?: boolean;
  revokedReason?: string;
}

export interface GatewayCertificateRecord {
  gatewayId: string;
  fingerprint: string;
  issuedAt: string;
  expiresAt: string;
  isRevoked: boolean;
  revokedReason?: string;
}

export interface ProvisioningRequest {
  provisioningToken: string;
  gatewayVersion: string;
  stationHardwareId: string;
  certificateFingerprint?: string;
  publicCertPem?: string;
}

export interface ProvisioningResponse {
  success: boolean;
  gatewayId: string;
  organizationId: string;
  plantId: string;
  stationId: string;
  authToken: string;
  cloudEndpoint: string;
  issuedAt: string;
  certValidUntil: string;
  error?: string;
}

export interface DriverCapabilities {
  supportsRead: boolean;
  supportsSubscribe: boolean;
  supportsWrite: false; // STRICTLY FALSE IN GATE 3
}

export interface DriverDiagnostics {
  connectionState: EdgeConnectionState;
  lastReadTimestamp: number | null;
  lastError: string | null;
  requestsTotal: number;
  requestsFailed: number;
  rxBytes: number;
  txBytes: number;
  activeSubscriptions: number;
  reconnectCount: number;
}

export interface ReadResult {
  tagName: string;
  value: number | boolean | string;
  rawSampleValue?: number;
  dataType: TagDataType;
  quality: TagQuality;
  sourceTimestamp: number;
  sourceStatusCode?: string | number;
  engineeringUnit?: string;
}

export type SubscriptionCallback = (results: ReadResult[]) => void;

/**
 * Universal interface for industrial telemetry drivers.
 * In Gate 3, write methods are strictly excluded to enforce read-only safety.
 */
export interface IndustrialDriver {
  readonly driverId: string;
  readonly protocol: IndustrialProtocol;
  readonly connectionId: string;
  readonly endpoint: string;
  readonly capabilities: DriverCapabilities;

  getState(): EdgeConnectionState;
  getDiagnostics(): DriverDiagnostics;

  connect(): Promise<boolean>;
  disconnect(): Promise<void>;

  read(nodeOrAddress: string): Promise<ReadResult>;
  readBatch(nodesOrAddresses: string[]): Promise<ReadResult[]>;

  subscribe(
    nodesOrAddresses: string[],
    samplingIntervalMs: number,
    callback: SubscriptionCallback,
  ): Promise<string>; // returns subscriptionId

  unsubscribe(subscriptionId: string): Promise<void>;
  healthCheck(): Promise<boolean>;
}

export interface OutboxSampleEntry {
  id: string; // UUID or monotonic id
  sequenceNumber: number;
  projectId: string;
  organizationId: string;
  plantId: string;
  gatewayId: string;
  connectionId: string;
  tagName: string;
  value: number;
  rawSampleValue?: number;
  quality: TagQuality;
  source: ProtocolDriver;
  sourceTimestamp: number;
  edgeReceivedAt: number;
  cloudReceivedAt?: number;
  deliveryState: "PENDING" | "IN_FLIGHT" | "ACKNOWLEDGED" | "DROPPED_SATURATION";
  attempts: number;
  lastAttemptAt?: number;
  isDelayedReplay?: boolean;
  criticality?: "NORMAL" | "CRITICAL";
}

export interface BufferStatistics {
  totalSamplesStored: number;
  pendingUploadCount: number;
  inFlightCount: number;
  acknowledgedCount: number;
  droppedSaturationCount: number;
  diskBytesUsed: number;
  diskLimitBytes: number;
  isNearLimit: boolean;
  saturationPolicy: "DROP_OLDEST_NON_CRITICAL" | "DROP_NEWEST_WITH_ALARM";
  oldestSampleTimestamp?: number;
  oldestSampleAgeSeconds?: number;
  isNearCapacity80Percent?: boolean;
  isDegraded?: boolean;
  lastDegradationReason?: string;
}

export interface GatewayHealthTelemetry {
  gatewayId: string;
  organizationId: string;
  plantId: string;
  stationId: string;
  version: string;
  uptimeSeconds: number;
  cpuUsagePercent: number;
  memoryUsageMb: number;
  diskUsagePercent: number;
  bufferStatus: BufferStatistics;
  lastCloudSyncTimestamp: number | null;
  activeTagsCount: number;
  activeDevicesCount: number;
  connectionsStatus: Record<
    string,
    {
      protocol: IndustrialProtocol;
      state: EdgeConnectionState;
      endpoint: string;
      lastError?: string;
    }
  >;
  samplesProcessedTotal: number;
  samplesSentTotal: number;
  samplesRejectedTotal: number;
  networkLatencyMs: number;
  backpressureActive: boolean;
  isDegraded?: boolean;
  degradationReason?: string;
}

// ── GATE 3.4: Versioned Cloud-Edge Data Contract & Ingestion Protocol ──

export const CLOUD_EDGE_PROTOCOL_VERSION = "1.0.0" as const;

export interface EdgeSamplePayload {
  sampleId: string;
  sequenceNumber: number;
  projectId: string;
  tagName: string;
  equipmentId?: string;
  value: number;
  rawSampleValue?: number;
  quality: TagQuality;
  source: ProtocolDriver;
  sourceTimestamp: number;
  edgeReceivedAt: number;
  isDelayedReplay: boolean;
  criticality: "NORMAL" | "CRITICAL";
}

export interface EdgeTelemetryBatch {
  protocolVersion: typeof CLOUD_EDGE_PROTOCOL_VERSION;
  gatewayId: string;
  batchId: string;
  batchSequenceNumber: number;
  sentAt: number;
  samples: EdgeSamplePayload[];
}

export interface EdgeIngestAck {
  success: boolean;
  protocolVersion: typeof CLOUD_EDGE_PROTOCOL_VERSION;
  gatewayId: string;
  batchId: string;
  receivedAt: number;
  processedCount: number;
  acknowledgedSampleIds: string[];
  rejectedSampleIds?: Array<{ id: string; reason: string }>;
  backpressure: boolean;
  nextSyncIntervalMs?: number;
  error?: string;
}

export interface RegisteredGatewayRecord {
  gatewayId: string;
  organizationId: string;
  plantId: string;
  stationId: string;
  gatewayVersion: string;
  installationId: string;
  certificateFingerprint: string;
  registeredAt: string;
  lastSeenAt: string;
  operationalState: EdgeOperationalState;
  isRevoked: boolean;
  revocationReason?: string;
  name?: string;
  sector?: string;
  hardwareArch?: EdgeHardwareArch;
  os?: string;
  protocolVersion?: string;
  lastHeartbeatAt?: string | null;
  lastSyncAt?: string | null;
  storage?: EdgeStorageHealth;
  health?: EdgeResourceHealth;
  certificate?: EdgeCertificateRecord;
  updateState?: EdgeUpdateState;
  currentConfigVersion?: number;
  authorizedEndpoints?: string[];
  recordVersion?: number;
}

// ============================================================================
// GATE 3.5 — EDGE FLEET MANAGEMENT & INDUSTRIAL OPERATIONAL READINESS TYPES
// ============================================================================

export type EdgeHardwareArch = "x86_64" | "arm64" | "armv7l" | "unknown";

export type EdgeConnectivityState = "CONNECTED" | "DISCONNECTED" | "DEGRADED" | "UNKNOWN";

export type EdgeOperationalState =
  "PROVISIONING" | "ONLINE" | "OFFLINE" | "DEGRADED" | "MAINTENANCE" | "REVOKED" | "UNKNOWN";

export interface EdgeStorageHealth {
  walSizeBytes: number;
  pendingSamplesCount: number;
  maxCapacityBytes: number;
  oldestSampleTimestampMs: number | null;
  isDegraded: boolean;
  bufferUtilizationPercent: number;
}

export interface EdgeResourceHealth {
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  diskUsagePercent: number;
  temperatureCelsius?: number;
  status: "HEALTHY" | "WARNING" | "CRITICAL";
}

export interface EdgeCertificateRecord {
  fingerprint: string;
  issuedAt: string;
  expiresAt: string;
  state: "VALID" | "EXPIRING_SOON" | "EXPIRED" | "REVOKED";
  isRevoked: boolean;
  revokedReason?: string;
  renewalRequested?: boolean;
}

export type EdgeUpdateState =
  "UP_TO_DATE" | "UPDATE_AVAILABLE" | "UPDATING" | "UPDATE_FAILED" | "ROLLED_BACK";

export interface FleetGatewaySummary {
  gatewayId: string;
  name: string;
  organizationId: string;
  plantId: string;
  sector: string;
  softwareVersion: string;
  protocolVersion: string;
  hardwareArch: EdgeHardwareArch;
  os: string;
  provisionedAt: string;
  lastHeartbeatAt: string | null;
  lastSyncAt: string | null;
  operationalState: EdgeOperationalState;
  connectivityState: EdgeConnectivityState;
  storage: EdgeStorageHealth;
  health: EdgeResourceHealth;
  certificate: EdgeCertificateRecord;
  updateState: EdgeUpdateState;
  currentConfigVersion: number;
  activeAlarmsCount: number;
  authorizedEndpoints?: string[];
  recordVersion?: number;
}

export interface FleetMetricsSummary {
  totalGateways: number;
  onlineGateways: number;
  offlineGateways: number;
  degradedGateways: number;
  maintenanceGateways: number;
  revokedGateways: number;
  certificatesExpiringSoon: number;
  totalPendingSamples: number;
  averageCpuPercent: number;
  averageMemoryPercent: number;
  activeAlarmsCount: number;
  versionDistribution: Record<string, number>;
  protocolDistribution: Record<string, number>;
}

export type EdgeFailureClassification =
  | "GATEWAY_FAILURE"
  | "CLOUD_FAILURE"
  | "PROTOCOL_FAILURE"
  | "INDUSTRIAL_SERVER_FAILURE"
  | "DEADBAND_UNCHANGED"
  | "STALE_SAMPLE";

export type FleetRole =
  | "PLATFORM_ADMIN"
  | "TENANT_ADMIN"
  | "PLANT_ADMIN"
  | "EDGE_OPERATOR"
  | "ENGINEER"
  | "AUDITOR"
  | "VIEWER";

export interface FleetUserContext {
  userId: string;
  email: string;
  role: FleetRole;
  organizationId: string;
  authorizedPlantIds: string[];
}

export interface RemoteConfigPayload {
  configVersion: number;
  gatewayId: string;
  author: string;
  timestamp: number;
  signature: string;
  scanRateMs: number;
  authorizedEndpoints: string[];
  enabledTags: string[];
  readProtocols: {
    opcua?: { endpoint: string; enabled: boolean };
    modbus?: { host: string; port: number; enabled: boolean };
    sparkplug?: { brokerUrl: string; enabled: boolean };
  };
  bufferLimits: {
    maxSamples: number;
    maxDiskMb: number;
    saturationPolicy: "DROP_OLDEST_NON_CRITICAL" | "DROP_NEWEST_WITH_ALARM";
  };
  retentionPolicy: {
    maxAgeHours: number;
  };
  observability: {
    metricsIntervalMs: number;
    logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
  };
  approval?: {
    approvedBy: string;
    approvedAt: number;
  };
}

export interface SignedUpdateManifest {
  packageId: string;
  targetVersion: string;
  targetArch: EdgeHardwareArch;
  sha256: string;
  signature: string;
  keyId?: string;
  manifestVersion?: string;
  createdAt?: string;
  expiresAt?: string;
  targetGateway?: string;
  targetOrganizationId?: string;
  targetPlantId?: string;
  releaseNotes: string;
  minGatewayVersion: string;
  dependencies?: Record<string, string>;
}

export interface FleetAuditEvent {
  id: string;
  timestamp: number;
  schemaVersion?: string;
  previousHash?: string;
  actor: {
    id: string;
    email: string;
    role: FleetRole;
  };
  source: "EDGE_DAEMON" | "CLOUD_SERVER" | "ADMIN_CONSOLE";
  gatewayId: string;
  plantId: string;
  organizationId: string;
  eventType: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  result: "SUCCESS" | "FAILED" | "DENIED";
  correlationId: string;
  lifecycleState: "RECEIVED" | "PROCESSED" | "ACKNOWLEDGED";
  details: Record<string, any>;
  tamperProofHash: string;
}

// ============================================================================
// GATE 4.3.1 — PERSISTENT STORAGE BACKEND CONTRACT (SQLite / PostgreSQL Parity)
// ============================================================================

export type WebhookProcessingState =
  "RECEIVED" | "PROCESSING" | "PROCESSED" | "FAILED" | "RETRYABLE";

export interface WebhookLedgerEntry {
  provider: "stripe" | "mercadopago";
  eventId: string;
  state: WebhookProcessingState;
  payloadHash: string;
  attempts: number;
  lockedUntil?: number | null;
  lastError?: string | null;
  updatedAt: string;
}

export interface PersistedProvisioningState {
  tokens: ProvisioningToken[];
  activeAuthTokens: Record<string, { gatewayId: string; authTokenDigest: string }>;
  provisionedStations: Record<string, string>; // `${orgId}:${plantId}:${stationId}` -> gatewayId
}

export interface FleetStorageBackend {
  // Audit chain (append-only)
  loadAuditEvents(): FleetAuditEvent[];
  appendAuditEvent(event: FleetAuditEvent, expectedPreviousHash: string): void;
  clearAuditInTestOnly?(): void;

  // Cloud Gateway Registry
  loadRegisteredGateways(): Array<{
    gateway: RegisteredGatewayRecord;
    authTokenDigest?: string;
    lastBatchSequence: number;
  }>;
  saveRegisteredGateway(
    gateway: RegisteredGatewayRecord,
    authTokenDigest?: string,
    lastBatchSequence?: number,
  ): void;
  hasIngestDedupKey(dedupKey: string): boolean;
  recordIngestedBatchAtomic(params: {
    gatewayId: string;
    organizationId: string;
    plantId: string;
    expectedMinSequence: number;
    newSequence: number;
    acceptedSamples: OutboxSampleEntry[];
    dedupKeys: string[];
  }): { committed: boolean; reason?: string };
  loadLatestTelemetryForGateway(gatewayId: string): OutboxSampleEntry[];

  // Edge Fleet Manager
  loadFleetGateways(): FleetGatewaySummary[];
  saveFleetGateway(gateway: FleetGatewaySummary, expectedVersion?: number): boolean;

  // Fleet Certificates & Challenge Anti-Replay
  loadCertificates(): Array<{
    gatewayId: string;
    cert: EdgeCertificateRecord;
    popKey?: string;
  }>;
  saveCertificate(gatewayId: string, cert: EdgeCertificateRecord, popKey?: string): void;
  consumeChallengeOnce(gatewayId: string, challenge: string, ttlMs?: number): boolean;

  // Remote Config & Monotonic History
  loadRemoteConfigs(): Record<
    string,
    { history: RemoteConfigPayload[]; lkgc?: RemoteConfigPayload }
  >;
  appendRemoteConfigMonotonic(gatewayId: string, config: RemoteConfigPayload): boolean;
  setLkgcConfig(gatewayId: string, config: RemoteConfigPayload): void;

  // Signed Updates & Campaigns
  loadOtaCampaigns(): Record<string, unknown>;
  saveOtaCampaign(
    campaignId: string,
    organizationId: string,
    plantId: string,
    campaign: unknown,
  ): void;
  hasAppliedOtaVersion(gatewayId: string, packageId: string, targetVersion: string): boolean;
  recordAppliedOtaVersion(
    gatewayId: string,
    packageId: string,
    targetVersion: string,
    manifestHash: string,
  ): void;

  // Provisioning Tokens (atomic single-use)
  loadProvisioningState(): PersistedProvisioningState;
  saveProvisioningToken(token: ProvisioningToken): void;
  claimProvisioningTokenAtomic(params: {
    tokenHash: string;
    consumedAt: number;
    stationKey: string;
    gatewayId: string;
    authTokenDigest: string;
  }): { claimed: boolean; reason?: string };

  // Idempotent Webhook Ledger
  beginWebhookEvent(params: {
    provider: "stripe" | "mercadopago";
    eventId: string;
    payloadHash: string;
    leaseMs?: number;
  }): { status: "ACQUIRED" | "ALREADY_PROCESSED" | "IN_FLIGHT"; entry: WebhookLedgerEntry };
  completeWebhookEvent(params: {
    provider: "stripe" | "mercadopago";
    eventId: string;
    state: "PROCESSED" | "FAILED" | "RETRYABLE";
    lastError?: string;
  }): void;
  getWebhookEvent(
    provider: "stripe" | "mercadopago",
    eventId: string,
  ): WebhookLedgerEntry | undefined;

  close?(): void;
}
