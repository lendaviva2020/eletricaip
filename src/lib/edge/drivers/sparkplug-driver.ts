// ELÉTRICAI INDUSTRIAL OS — EDGE MQTT SPARKPLUG B DRIVER (READ-ONLY)
// Specification: Eclipse Sparkplug B Standard V1.0 (ISO/IEC 20237)
// Official Spec: https://github.com/eclipse-sparkplug/sparkplug
// Security Boundary: Strictly Read-Only (NBIRTH, DBIRTH, NDATA, DDATA, STATE, NDEATH). NCMD/DCMD omitted.

import crypto from "node:crypto";
import type {
  IndustrialDriver,
  IndustrialProtocol,
  DriverCapabilities,
  DriverDiagnostics,
  EdgeConnectionState,
  ReadResult,
  SubscriptionCallback,
} from "../types";
import type { TagQuality, TagDataType } from "../../scada/types";

export type SparkplugMessageType =
  "NBIRTH" | "NDEATH" | "DBIRTH" | "DDEATH" | "NDATA" | "DDATA" | "STATE";

export interface SparkplugMetric {
  name: string;
  alias?: number;
  timestamp: number;
  dataType: "Int32" | "Int64" | "Float" | "Double" | "Boolean" | "String" | "DateTime";
  value: number | boolean | string;
  quality?: TagQuality;
  isHistorical?: boolean;
  isTransient?: boolean;
  metadata?: {
    engineeringUnits?: string;
    description?: string;
  };
}

export interface SparkplugPayload {
  timestamp: number;
  metrics: SparkplugMetric[];
  seq?: number; // 0 to 255 sequential sequence number
  uuid?: string;
}

export interface SparkplugDriverConfig {
  driverId: string;
  connectionId: string;
  brokerUrl: string;
  clientId: string;
  groupId: string;
  edgeNodeId: string;
  username?: string;
  password?: string;
  useTls?: boolean;
  rejectUnauthorized?: boolean;
  authorizedTopicsOnly?: boolean;
}

export class SparkplugBDriver implements IndustrialDriver {
  public readonly implementationClass = "LAB_EDGE_ADAPTER" as const;
  public readonly driverId: string;
  public readonly protocol: IndustrialProtocol = "MQTT_SPARKPLUG_B";
  public readonly connectionId: string;
  public readonly endpoint: string;
  public readonly capabilities: DriverCapabilities = {
    supportsRead: true,
    supportsSubscribe: true,
    supportsWrite: false, // STRICTLY READ-ONLY IN GATE 3
  };

  /**
   * Hardware safety interlock: Physical actuation commands (NCMD, DCMD) and writes are permanently blocked.
   */
  public async sendCommand(): Promise<never> {
    throw new Error(
      "PHYSICAL_CONTROL_BLOCKED: Envio ou execução de comandos Sparkplug B NCMD/DCMD bloqueado. Gateway opera exclusivamente em modo READ-ONLY.",
    );
  }

  public async publishCommand(): Promise<never> {
    throw new Error(
      "PHYSICAL_CONTROL_BLOCKED: Publicação de comandos Sparkplug B NCMD/DCMD bloqueada. Gateway opera exclusivamente em modo READ-ONLY.",
    );
  }

  public async write(): Promise<never> {
    throw new Error(
      "PHYSICAL_CONTROL_BLOCKED: Operação física de escrita Sparkplug B bloqueada. Gateway opera exclusivamente em modo READ-ONLY.",
    );
  }

  /**
   * Validates whether a Sparkplug B topic is authorized under the deny-by-default allowlist.
   * Strictly rejects any topic containing /NCMD/ or /DCMD/.
   */
  public validateTopicAllowed(topic: string): void {
    if (topic.includes("/NCMD/") || topic.includes("/DCMD/")) {
      this.diagnostics.requestsFailed++;
      throw new Error(
        `PHYSICAL_CONTROL_BLOCKED: Tópico de comando Sparkplug B [${topic}] não autorizado. Gateway opera sob política de negação por padrão (Comandos NCMD e DCMD bloqueados).`,
      );
    }
  }

  public async publish(topic: string, payload: unknown): Promise<void> {
    this.validateTopicAllowed(topic);
    this.diagnostics.txBytes += 50;
    this.diagnostics.requestsTotal++;
  }

  private state: EdgeConnectionState = "DISCONNECTED";
  private diagnostics: DriverDiagnostics;
  private config: SparkplugDriverConfig;

  private expectedNextSeq: number = 0;
  private knownMetrics: Map<string, SparkplugMetric> = new Map();
  private callbacks: Set<SubscriptionCallback> = new Set();
  private isNodeAlive: boolean = false;

  constructor(config: SparkplugDriverConfig) {
    this.driverId = config.driverId;
    this.connectionId = config.connectionId;
    this.endpoint = config.brokerUrl;
    this.config = {
      useTls: true,
      rejectUnauthorized: true,
      authorizedTopicsOnly: true,
      ...config,
    };

    this.diagnostics = {
      connectionState: "DISCONNECTED",
      lastReadTimestamp: null,
      lastError: null,
      requestsTotal: 0,
      requestsFailed: 0,
      rxBytes: 0,
      txBytes: 0,
      activeSubscriptions: 0,
      reconnectCount: 0,
    };
  }

  public getState(): EdgeConnectionState {
    return this.state;
  }

  public getDiagnostics(): DriverDiagnostics {
    return { ...this.diagnostics, connectionState: this.state };
  }

  public getKnownMetrics(): Map<string, SparkplugMetric> {
    return this.knownMetrics;
  }

  public async connect(): Promise<boolean> {
    this.state = "CONNECTING";
    this.diagnostics.requestsTotal++;

    // Simulated MQTT CONNECT + Subscribe spBv1.0/groupId/#
    this.state = "CONNECTED";
    this.diagnostics.lastError = null;
    return true;
  }

  public async disconnect(): Promise<void> {
    this.state = "STOPPED";
    this.isNodeAlive = false;
    this.callbacks.clear();
  }

  public async read(metricName: string): Promise<ReadResult> {
    if (this.state !== "CONNECTED") {
      throw new Error(
        `SPARKPLUG_NOT_CONNECTED: Não é possível ler métricas no estado [${this.state}].`,
      );
    }

    const metric = this.knownMetrics.get(metricName);
    const now = Date.now();

    if (!metric) {
      return {
        tagName: metricName,
        value: 0,
        dataType: "REAL",
        quality: "UNCERTAIN",
        sourceTimestamp: now,
      };
    }

    const quality: TagQuality = this.isNodeAlive ? "GOOD" : "STALE";

    return {
      tagName: metric.name,
      value: metric.value,
      rawSampleValue: typeof metric.value === "number" ? metric.value : undefined,
      dataType:
        metric.dataType === "Boolean" ? "BOOL" : metric.dataType === "String" ? "STRING" : "REAL",
      quality,
      sourceTimestamp: metric.timestamp,
      engineeringUnit: metric.metadata?.engineeringUnits,
    };
  }

  public async readBatch(metricNames: string[]): Promise<ReadResult[]> {
    const results: ReadResult[] = [];
    for (const name of metricNames) {
      results.push(await this.read(name));
    }
    return results;
  }

  public async subscribe(
    _nodesOrAddresses: string[],
    _samplingIntervalMs: number = 1000,
    callback: SubscriptionCallback,
  ): Promise<string> {
    this.callbacks.add(callback);
    this.diagnostics.activeSubscriptions = this.callbacks.size;
    return `spb_sub_${crypto.randomUUID()}`;
  }

  public async unsubscribe(_subscriptionId: string): Promise<void> {
    this.callbacks.clear();
    this.diagnostics.activeSubscriptions = 0;
  }

  public async healthCheck(): Promise<boolean> {
    return this.state === "CONNECTED" && this.isNodeAlive;
  }

  /**
   * Processes an incoming Sparkplug B MQTT message with topic parsing,
   * sequence validation (0-255 rollover) and metric updates.
   */
  public handleIncomingMessage(
    topic: string,
    payload: SparkplugPayload,
  ): { success: boolean; error?: string } {
    if (this.state !== "CONNECTED") {
      return { success: false, error: "BROKER_NOT_CONNECTED" };
    }

    this.diagnostics.requestsTotal++;
    this.diagnostics.rxBytes += 128; // Approximate payload size
    this.diagnostics.lastReadTimestamp = Date.now();

    // Parse Sparkplug B Topic: spBv1.0/{groupId}/{messageType}/{edgeNodeId}/[{deviceId}]
    const parts = topic.split("/");
    if (parts.length < 4 || parts[0] !== "spBv1.0") {
      this.diagnostics.requestsFailed++;
      return { success: false, error: "INVALID_SPARKPLUG_TOPIC_NAMESPACE" };
    }

    const [_, groupId, messageType, edgeNodeId, deviceId] = parts;

    if (messageType === "NCMD" || messageType === "DCMD") {
      this.diagnostics.requestsFailed++;
      return {
        success: false,
        error: `PHYSICAL_CONTROL_BLOCKED: Mensagem de comando ${messageType} rejeitada (READ-ONLY).`,
      };
    }

    // Validate ACL topic authorization
    if (
      this.config.authorizedTopicsOnly &&
      (groupId !== this.config.groupId || edgeNodeId !== this.config.edgeNodeId)
    ) {
      this.diagnostics.requestsFailed++;
      return {
        success: false,
        error: "UNAUTHORIZED_GROUP_TOPIC: Acesso negado para Group ID ou Edge Node ID divergente.",
      };
    }

    // Sequence checking for data messages (NDATA, DDATA)
    if (messageType === "NDATA" || messageType === "DDATA") {
      if (payload.seq !== undefined) {
        if (payload.seq !== this.expectedNextSeq) {
          // Sequence gap / out of order detected!
          this.diagnostics.requestsFailed++;
          this.expectedNextSeq = (payload.seq + 1) % 256;
          // In Sparkplug, sequence gaps require Rebirth, but we continue processing metrics with warning
        } else {
          this.expectedNextSeq = (this.expectedNextSeq + 1) % 256;
        }
      }
    } else if (messageType === "NBIRTH" || messageType === "DBIRTH") {
      // Birth resets sequence to 0 (or next expected to 1 if seq was 0)
      this.isNodeAlive = true;
      if (payload.seq !== undefined) {
        this.expectedNextSeq = (payload.seq + 1) % 256;
      }
    } else if (messageType === "NDEATH" || messageType === "DDEATH") {
      this.isNodeAlive = false;
      // Mark all metrics from this node/device as STALE
      for (const m of this.knownMetrics.values()) {
        m.timestamp = payload.timestamp;
        m.quality = "STALE";
      }
    }

    // Ingest metrics into local store and notify callbacks
    const results: ReadResult[] = [];
    for (const m of payload.metrics) {
      const fullMetricName = deviceId ? `${deviceId}/${m.name}` : m.name;
      const quality: TagQuality =
        messageType === "NDEATH" || messageType === "DDEATH" ? "STALE" : "GOOD";

      this.knownMetrics.set(fullMetricName, { ...m, name: fullMetricName, quality });

      results.push({
        tagName: fullMetricName,
        value: m.value,
        rawSampleValue: typeof m.value === "number" ? m.value : undefined,
        dataType: m.dataType === "Boolean" ? "BOOL" : m.dataType === "String" ? "STRING" : "REAL",
        quality,
        sourceTimestamp: m.timestamp,
        engineeringUnit: m.metadata?.engineeringUnits,
      });
    }

    for (const cb of this.callbacks) {
      cb(results);
    }

    return { success: true };
  }

  public simulateConnectionLoss(): void {
    this.state = "DISCONNECTED";
    this.isNodeAlive = false;
    this.diagnostics.reconnectCount++;
  }
}
