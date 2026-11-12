// ELÉTRICAI INDUSTRIAL OS — CLOUD GATEWAY REGISTRY & AUTHENTICATION ENGINE
// Server-Side Gateway Authority, Identity Derivation, Revocation & Multi-Tenant Boundaries
// Standards: IEC 62443-4-2, NIST SP 800-82 Rev. 3, RFC 8446

import type {
  RegisteredGatewayRecord,
  EdgeTelemetryBatch,
  EdgeIngestAck,
  FleetStorageBackend,
  OutboxSampleEntry,
} from "./types";
import { CLOUD_EDGE_PROTOCOL_VERSION } from "./types";
import { constantTimeEqual, sha256Hex } from "../security/isomorphic-crypto";

export interface GatewayAuthResult {
  authorized: boolean;
  gateway?: RegisteredGatewayRecord;
  error?: string;
  statusCode?: number;
}

export interface IngestProcessResult {
  ack: EdgeIngestAck;
  statusCode: number;
}

export class CloudGatewayRegistry {
  private gateways: Map<string, RegisteredGatewayRecord> = new Map();
  private authTokens: Map<string, string> = new Map(); // gatewayId -> secretTokenHash / certFingerprint
  private ingestedKeys: Set<string> = new Set(); // Dedup key: `${gatewayId}:${tagName}:${sourceTimestamp}`
  private lastBatchSequence: Map<string, number> = new Map(); // gatewayId -> lastSequenceNumber
  private latestTelemetry: Map<string, Map<string, OutboxSampleEntry>> = new Map();
  private store?: FleetStorageBackend;
  private backpressureThresholdPerSecond: number = 2000;
  private currentSecondIngestCount: number = 0;
  private currentSecondTimestamp: number = Math.floor(Date.now() / 1000);

  constructor(options?: { store?: FleetStorageBackend }) {
    this.seedDefaultGateways();
    if (options?.store) {
      this.attachStorageBackend(options.store);
    }
  }

  public attachStorageBackend(store: FleetStorageBackend): void {
    this.store = store;
    const persisted = store.loadRegisteredGateways();
    if (persisted.length > 0) {
      for (const item of persisted) {
        this.gateways.set(item.gateway.gatewayId, item.gateway);
        if (item.authTokenDigest) {
          this.authTokens.set(item.gateway.gatewayId, item.authTokenDigest);
        }
        this.lastBatchSequence.set(item.gateway.gatewayId, item.lastBatchSequence);
      }
      return;
    }

    for (const [gwId, gw] of this.gateways.entries()) {
      store.saveRegisteredGateway(
        gw,
        this.authTokens.get(gwId),
        this.lastBatchSequence.get(gwId) ?? 0,
      );
    }
  }

  private static toCredentialDigest(rawOrDigest: string): string {
    if (rawOrDigest.startsWith("sha256:") && rawOrDigest.length === 71) {
      return rawOrDigest.toLowerCase();
    }
    return `sha256:${sha256Hex(rawOrDigest)}`;
  }

  private seedDefaultGateways(): void {
    // Segredo nunca hardcoded em codigo/bundle; token opcional apenas via ambiente server-side.
    const envLabToken =
      typeof process !== "undefined" && process.env
        ? process.env["ELETRICAI_LAB_GATEWAY_TOKEN_HASH"] ||
          process.env["ELETRICAI_LAB_GATEWAY_TOKEN"] ||
          ""
        : "";

    this.registerGateway(
      {
        gatewayId: "gw_lab_ete_01",
        organizationId: "org_sp_industrial",
        plantId: "plant_ete_central",
        stationId: "station_ete_01",
        gatewayVersion: "1.0.0",
        installationId: "inst_sp_ete_01",
        certificateFingerprint: "SHA256:FINGERPRINT_DEFAULT_LAB",
        registeredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        operationalState: "ONLINE",
        isRevoked: false,
      },
      envLabToken || undefined,
    );
  }

  public registerGateway(gateway: RegisteredGatewayRecord, tokenOrDigest?: string): void {
    const record = { ...gateway };
    this.gateways.set(gateway.gatewayId, record);
    let digest: string | undefined;
    if (tokenOrDigest && tokenOrDigest.trim().length > 0) {
      digest = CloudGatewayRegistry.toCredentialDigest(tokenOrDigest.trim());
      this.authTokens.set(gateway.gatewayId, digest);
    }
    this.store?.saveRegisteredGateway(
      record,
      digest ?? this.authTokens.get(gateway.gatewayId),
      this.lastBatchSequence.get(gateway.gatewayId) ?? 0,
    );
  }

  private refreshGatewayFromStore(gatewayId: string): RegisteredGatewayRecord | undefined {
    if (!this.store) return this.gateways.get(gatewayId);
    const match = this.store
      .loadRegisteredGateways()
      .find((r) => r.gateway.gatewayId === gatewayId);
    if (!match) return undefined;
    this.gateways.set(gatewayId, match.gateway);
    if (match.authTokenDigest) {
      this.authTokens.set(gatewayId, match.authTokenDigest);
    }
    this.lastBatchSequence.set(gatewayId, match.lastBatchSequence);
    return match.gateway;
  }

  public getGateway(gatewayId: string): RegisteredGatewayRecord | undefined {
    return this.gateways.get(gatewayId) ?? this.refreshGatewayFromStore(gatewayId);
  }

  public revokeGateway(gatewayId: string, reason: string): boolean {
    const gw = this.gateways.get(gatewayId);
    if (!gw) return false;
    gw.isRevoked = true;
    gw.operationalState = "REVOKED";
    gw.revocationReason = reason;
    this.gateways.set(gatewayId, gw);
    this.store?.saveRegisteredGateway(
      gw,
      this.authTokens.get(gatewayId),
      this.lastBatchSequence.get(gatewayId) ?? 0,
    );
    return true;
  }

  /**
   * Authenticates a gateway connection and derives its authoritative tenant/plant identity.
   * Guarantees server-side tenant derivation: Does NOT trust client-supplied headers.
   */
  public authenticateGateway(gatewayId: string, credential?: string): GatewayAuthResult {
    const gw = this.gateways.get(gatewayId) ?? this.refreshGatewayFromStore(gatewayId);
    if (!gw) {
      return {
        authorized: false,
        error: "GATEWAY_NOT_REGISTERED: Identificador de gateway não reconhecido na Cloud.",
        statusCode: 401,
      };
    }

    if (gw.isRevoked) {
      return {
        authorized: false,
        error: `GATEWAY_REVOKED: Acesso negado. Motivo: ${gw.revocationReason || "Certificado ou permissão revogada"}.`,
        statusCode: 403,
      };
    }

    if (!credential || typeof credential !== "string" || !credential.trim()) {
      return {
        authorized: false,
        error: "MISSING_CREDENTIALS: Credencial de autenticação do gateway ausente.",
        statusCode: 401,
      };
    }

    const expectedDigest = this.authTokens.get(gatewayId);
    if (!expectedDigest) {
      return {
        authorized: false,
        error:
          "GATEWAY_CREDENTIAL_NOT_PROVISIONED: Credencial de gateway não provisionada no servidor.",
        statusCode: 401,
      };
    }

    const presentedDigest = CloudGatewayRegistry.toCredentialDigest(credential.trim());
    if (!constantTimeEqual(presentedDigest, expectedDigest)) {
      return {
        authorized: false,
        error: "INVALID_CREDENTIALS: Credencial de autenticação mTLS/Token inválida.",
        statusCode: 403,
      };
    }

    gw.lastSeenAt = new Date().toISOString();
    this.store?.saveRegisteredGateway(
      gw,
      expectedDigest,
      this.lastBatchSequence.get(gatewayId) ?? 0,
    );
    return {
      authorized: true,
      gateway: gw,
      statusCode: 200,
    };
  }

  /**
   * Ingests a telemetry batch from an Edge Gateway.
   * Validates versioning, server-derived tenant boundaries, sequence numbers, and deduplication.
   */
  public processTelemetryBatch(
    batch: EdgeTelemetryBatch,
    credential?: string,
    targetProjectId?: string,
  ): IngestProcessResult {
    const now = Date.now();
    const currentSec = Math.floor(now / 1000);
    if (currentSec !== this.currentSecondTimestamp) {
      this.currentSecondTimestamp = currentSec;
      this.currentSecondIngestCount = 0;
    }

    // 1. Version Check
    if (batch.protocolVersion !== CLOUD_EDGE_PROTOCOL_VERSION) {
      return {
        statusCode: 400,
        ack: {
          success: false,
          protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
          gatewayId: batch.gatewayId,
          batchId: batch.batchId,
          receivedAt: now,
          processedCount: 0,
          acknowledgedSampleIds: [],
          backpressure: false,
          error: `UNSUPPORTED_PROTOCOL_VERSION: Versão ${batch.protocolVersion} incompatível. Versão esperada: ${CLOUD_EDGE_PROTOCOL_VERSION}.`,
        },
      };
    }

    // 2. Authenticate Gateway & Derive Identity
    const auth = this.authenticateGateway(batch.gatewayId, credential);
    if (!auth.authorized || !auth.gateway) {
      return {
        statusCode: auth.statusCode || 401,
        ack: {
          success: false,
          protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
          gatewayId: batch.gatewayId,
          batchId: batch.batchId,
          receivedAt: now,
          processedCount: 0,
          acknowledgedSampleIds: [],
          backpressure: false,
          error: auth.error,
        },
      };
    }

    const authoritativeGw = auth.gateway;

    // 3. Rate Limiting & Backpressure
    this.currentSecondIngestCount += batch.samples.length;
    const isBackpressure = this.currentSecondIngestCount > this.backpressureThresholdPerSecond;

    // 4. Sequence Check (Monotonic Tracking)
    const lastSeq = this.lastBatchSequence.get(batch.gatewayId) ?? 0;
    const nextSequence = Math.max(lastSeq, batch.batchSequenceNumber);
    this.lastBatchSequence.set(batch.gatewayId, nextSequence);

    const acknowledgedSampleIds: string[] = [];
    const rejectedSampleIds: Array<{ id: string; reason: string }> = [];
    const newAcceptedSamples: OutboxSampleEntry[] = [];
    const newDedupKeys: string[] = [];
    let gatewayLatest = this.latestTelemetry.get(batch.gatewayId);
    if (!gatewayLatest) {
      gatewayLatest = new Map();
      this.latestTelemetry.set(batch.gatewayId, gatewayLatest);
    }

    // 5. Ingest Samples with Persistent Deduplication & Authoritative Tenant Identity
    for (const s of batch.samples) {
      const dedupKey = `${batch.gatewayId}:${s.tagName}:${s.sourceTimestamp}`;

      if (this.ingestedKeys.has(dedupKey) || this.store?.hasIngestDedupKey(dedupKey)) {
        // Idempotent duplicate: acknowledge without duplicate persistence
        this.ingestedKeys.add(dedupKey);
        acknowledgedSampleIds.push(s.sampleId);
        continue;
      }

      const entry: OutboxSampleEntry = {
        id: s.sampleId,
        sequenceNumber: batch.batchSequenceNumber,
        projectId: targetProjectId || authoritativeGw.plantId,
        organizationId: authoritativeGw.organizationId,
        plantId: authoritativeGw.plantId,
        gatewayId: batch.gatewayId,
        connectionId: batch.gatewayId,
        tagName: s.tagName,
        value: s.value,
        rawSampleValue: s.rawSampleValue,
        quality: s.quality,
        source: s.source,
        sourceTimestamp: s.sourceTimestamp,
        edgeReceivedAt: now,
        cloudReceivedAt: now,
        deliveryState: "ACKNOWLEDGED",
        attempts: 1,
      };

      this.ingestedKeys.add(dedupKey);
      newAcceptedSamples.push(entry);
      newDedupKeys.push(dedupKey);

      const currentBest = gatewayLatest.get(s.tagName);
      if (!currentBest || s.sourceTimestamp >= currentBest.sourceTimestamp) {
        gatewayLatest.set(s.tagName, entry);
      }
      acknowledgedSampleIds.push(s.sampleId);
    }

    if (this.store && (newAcceptedSamples.length > 0 || nextSequence > lastSeq)) {
      this.store.recordIngestedBatchAtomic({
        gatewayId: batch.gatewayId,
        organizationId: authoritativeGw.organizationId,
        plantId: authoritativeGw.plantId,
        expectedMinSequence: lastSeq,
        newSequence: nextSequence,
        acceptedSamples: newAcceptedSamples,
        dedupKeys: newDedupKeys,
      });
    }

    return {
      statusCode: 200,
      ack: {
        success: true,
        protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
        gatewayId: batch.gatewayId,
        batchId: batch.batchId,
        receivedAt: now,
        processedCount: acknowledgedSampleIds.length,
        acknowledgedSampleIds,
        rejectedSampleIds: rejectedSampleIds.length > 0 ? rejectedSampleIds : undefined,
        backpressure: isBackpressure,
        nextSyncIntervalMs: isBackpressure ? 2000 : 500,
      },
    };
  }

  public getLatestTelemetryForGateway(gatewayId: string): OutboxSampleEntry[] {
    if (this.store) {
      return this.store.loadLatestTelemetryForGateway(gatewayId);
    }
    const map = this.latestTelemetry.get(gatewayId);
    return map ? Array.from(map.values()) : [];
  }

  public setBackpressureThreshold(threshold: number): void {
    this.backpressureThresholdPerSecond = threshold;
  }

  public clearIngestedKeys(): void {
    this.ingestedKeys.clear();
    this.lastBatchSequence.clear();
  }
}

export const cloudGatewayRegistry = new CloudGatewayRegistry();
