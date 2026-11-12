// ELÉTRICAI INDUSTRIAL OS — EDGE OPC UA CLIENT DRIVER (READ-ONLY)
// Standards: OPC UA Part 2 (Security), Part 4 (Services), Part 5 (Information Model), Part 8 (DataAccess)
// Official Spec: https://opcfoundation.org/about/opc-technologies/opc-ua/
// Security Boundary: Strictly Read-Only / Monitored Items. Physical Write methods are omitted.

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

export type OpcUaSecurityPolicy =
  "None" | "Basic256Sha256" | "Aes128_Sha256_RsaOaep" | "Aes256_Sha256_RsaPss";

export type OpcUaMessageSecurityMode = "None" | "Sign" | "SignAndEncrypt";

export interface OpcUaDriverConfig {
  driverId: string;
  connectionId: string;
  endpointUrl: string;
  applicationUri?: string;
  securityPolicy?: OpcUaSecurityPolicy;
  securityMode?: OpcUaMessageSecurityMode;
  clientCertificatePem?: string;
  trustedServerCertificates?: string[]; // Fingerprints or PEMs
  rejectUntrustedCertificates?: boolean;
  requestTimeoutMs?: number;
  sessionTimeoutMs?: number;
  publishingIntervalMs?: number;
}

export interface OpcUaNodeReference {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: "Variable" | "Object" | "Method" | "View";
  dataType?: TagDataType;
  description?: string;
  hasChildren?: boolean;
}

// Strict Deny-by-Default Allowlist for OPC UA Services
export const ALLOWED_OPCUA_SERVICES = new Set([
  "GetEndpoints",
  "OpenSecureChannel",
  "CreateSession",
  "ActivateSession",
  "Browse",
  "Read",
  "CreateSubscription",
  "CreateMonitoredItems",
  "Publish",
  "CloseSession",
]);

export class OpcUaClientDriver implements IndustrialDriver {
  public readonly implementationClass = "LAB_EDGE_ADAPTER" as const;
  public readonly driverId: string;
  public readonly protocol: IndustrialProtocol = "OPC_UA";
  public readonly connectionId: string;
  public readonly endpoint: string;
  public readonly capabilities: DriverCapabilities = {
    supportsRead: true,
    supportsSubscribe: true,
    supportsWrite: false, // MANDATORY READ-ONLY GATE 3 / 3.2
  };

  /**
   * Hardware safety interlock: Physical actuation method calls and state-mutating operations are permanently blocked.
   */
  public async callMethod(): Promise<never> {
    throw new Error(
      "PHYSICAL_CONTROL_BLOCKED: Chamada OPC UA Method Call bloqueada. Gateway opera exclusivamente em modo READ-ONLY.",
    );
  }

  public async historyUpdate(): Promise<never> {
    throw new Error(
      "PHYSICAL_CONTROL_BLOCKED: Chamada OPC UA HistoryUpdate bloqueada. Operações de modificação de histórico não são permitidas.",
    );
  }

  public async addNodes(): Promise<never> {
    throw new Error(
      "PHYSICAL_CONTROL_BLOCKED: Chamada OPC UA AddNodes bloqueada. Alterações dinâmicas no Address Space são proibidas.",
    );
  }

  public async deleteNodes(): Promise<never> {
    throw new Error(
      "PHYSICAL_CONTROL_BLOCKED: Chamada OPC UA DeleteNodes bloqueada. Alterações dinâmicas no Address Space são proibidas.",
    );
  }

  public validateService(serviceName: string): void {
    if (!ALLOWED_OPCUA_SERVICES.has(serviceName)) {
      this.diagnostics.requestsFailed++;
      throw new Error(
        `PHYSICAL_CONTROL_BLOCKED: Serviço OPC UA [${serviceName}] não autorizado. Gateway opera sob política de negação por padrão (Permitidos exclusivamente Browse, Read e Subscriptions).`,
      );
    }
  }

  private state: EdgeConnectionState = "DISCONNECTED";
  private diagnostics: DriverDiagnostics;
  private config: OpcUaDriverConfig;
  private trustedCertFingerprints: Set<string> = new Set();
  private activeSubscriptions: Map<
    string,
    {
      nodes: string[];
      intervalMs: number;
      callback: SubscriptionCallback;
      timer?: ReturnType<typeof setInterval>;
    }
  > = new Map();

  // Internal simulated/pluggable lab node store for testing when standalone
  private labNodeStore: Map<
    string,
    {
      value: number | boolean | string;
      dataType: TagDataType;
      quality: TagQuality;
      statusCode: number; // OPC UA StatusCode (0x00000000 = Good)
      unit?: string;
    }
  > = new Map();

  constructor(config: OpcUaDriverConfig) {
    this.driverId = config.driverId;
    this.connectionId = config.connectionId;
    this.endpoint = config.endpointUrl;
    this.config = {
      securityPolicy: "Basic256Sha256",
      securityMode: "SignAndEncrypt",
      requestTimeoutMs: 5000,
      sessionTimeoutMs: 30000,
      publishingIntervalMs: 1000,
      rejectUntrustedCertificates: true,
      ...config,
    };

    if (config.trustedServerCertificates) {
      for (const cert of config.trustedServerCertificates) {
        this.trustedCertFingerprints.add(cert.toUpperCase());
      }
    }

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

  /**
   * Establishes secure connection to the OPC UA server endpoint.
   * Performs certificate validation and prevents silent downgrade to None.
   */
  public async connect(serverCertificatePem?: string): Promise<boolean> {
    this.state = "CONNECTING";
    this.diagnostics.requestsTotal++;

    // Security check: Reject insecure "None" in production configurations
    if (this.config.securityPolicy === "None" && process.env.NODE_ENV === "production") {
      this.state = "ERROR";
      this.diagnostics.lastError =
        "SECURITY_VIOLATION: SecurityPolicy 'None' é rejeitada em conexões industriais de produção.";
      this.diagnostics.requestsFailed++;
      return false;
    }

    // Validate Server Certificate if required
    if (this.config.rejectUntrustedCertificates && serverCertificatePem) {
      const fingerprint = crypto
        .createHash("sha256")
        .update(serverCertificatePem)
        .digest("hex")
        .toUpperCase();

      if (!this.trustedCertFingerprints.has(fingerprint)) {
        this.state = "CERTIFICATE_INVALID";
        this.diagnostics.lastError = `UNTRUSTED_SERVER_CERTIFICATE: Certificado [${fingerprint}] não consta na Trust List.`;
        this.diagnostics.requestsFailed++;
        return false;
      }
    }

    // Simulate session negotiation
    this.state = "CONNECTED";
    this.diagnostics.lastError = null;
    return true;
  }

  public async disconnect(): Promise<void> {
    for (const sub of this.activeSubscriptions.values()) {
      if (sub.timer) clearInterval(sub.timer);
    }
    this.activeSubscriptions.clear();
    this.state = "STOPPED";
  }

  /**
   * Browses nodes in the OPC UA address space starting from a given nodeId.
   */
  public async browse(nodeId: string): Promise<OpcUaNodeReference[]> {
    if (this.state !== "CONNECTED") {
      throw new Error(`OPCUA_NOT_CONNECTED: Não é possível navegar nós no estado [${this.state}].`);
    }

    this.diagnostics.requestsTotal++;
    this.diagnostics.txBytes += 64;

    // Standard root browse or child nodes
    if (nodeId === "RootFolder" || nodeId === "ns=0;i=84") {
      this.diagnostics.rxBytes += 256;
      return [
        {
          nodeId: "ns=2;s=Plant",
          browseName: "Plant",
          displayName: "Instalação Industrial",
          nodeClass: "Object",
          hasChildren: true,
        },
        {
          nodeId: "ns=2;s=Motors",
          browseName: "Motors",
          displayName: "Acionamentos e Motores",
          nodeClass: "Object",
          hasChildren: true,
        },
        {
          nodeId: "ns=2;s=Tanks",
          browseName: "Tanks",
          displayName: "Tanques e Reservatórios",
          nodeClass: "Object",
          hasChildren: true,
        },
      ];
    }

    if (nodeId === "ns=2;s=Motors") {
      this.diagnostics.rxBytes += 256;
      return [
        {
          nodeId: "ns=2;s=M01.Current",
          browseName: "Current",
          displayName: "Corrente de Operação M-01",
          nodeClass: "Variable",
          dataType: "REAL",
          description: "Corrente eficaz em Ampères (0-50A)",
        },
        {
          nodeId: "ns=2;s=M01.Temperature",
          browseName: "Temperature",
          displayName: "Temperatura Mancal M-01",
          nodeClass: "Variable",
          dataType: "REAL",
          description: "Temperatura mancais em °C",
        },
        {
          nodeId: "ns=2;s=M01.Running",
          browseName: "Running",
          displayName: "Status de Funcionamento M-01",
          nodeClass: "Variable",
          dataType: "BOOL",
        },
      ];
    }

    if (nodeId === "ns=2;s=Tanks") {
      this.diagnostics.rxBytes += 256;
      return [
        {
          nodeId: "ns=2;s=TK01.Level",
          browseName: "Level",
          displayName: "Nível Percentual TK-01",
          nodeClass: "Variable",
          dataType: "REAL",
          description: "Nível percentual de água bruta (0-100%)",
        },
      ];
    }

    return [];
  }

  /**
   * Reads an individual variable from an OPC UA node.
   * Converts OPC UA StatusCode into appropriate TagQuality.
   */
  public async read(nodeId: string): Promise<ReadResult> {
    if (this.state !== "CONNECTED") {
      throw new Error(`OPCUA_NOT_CONNECTED: Tentativa de leitura no estado [${this.state}].`);
    }

    this.diagnostics.requestsTotal++;
    this.diagnostics.txBytes += 32;

    const sample = this.labNodeStore.get(nodeId);
    const now = Date.now();

    if (!sample) {
      // Default node simulation
      this.diagnostics.rxBytes += 48;
      this.diagnostics.lastReadTimestamp = now;
      return {
        tagName: nodeId,
        value: 25.4,
        rawSampleValue: 25.4,
        dataType: "REAL",
        quality: "GOOD",
        sourceTimestamp: now,
        sourceStatusCode: 0x00000000, // Good
        engineeringUnit: "A",
      };
    }

    this.diagnostics.rxBytes += 48;
    this.diagnostics.lastReadTimestamp = now;

    const quality = this.mapStatusCodeToQuality(sample.statusCode);

    return {
      tagName: nodeId,
      value: sample.value,
      rawSampleValue: typeof sample.value === "number" ? sample.value : undefined,
      dataType: sample.dataType,
      quality,
      sourceTimestamp: now,
      sourceStatusCode: sample.statusCode,
      engineeringUnit: sample.unit,
    };
  }

  public async readBatch(nodeIds: string[]): Promise<ReadResult[]> {
    const results: ReadResult[] = [];
    for (const id of nodeIds) {
      results.push(await this.read(id));
    }
    return results;
  }

  /**
   * Subscribes to monitored items with continuous publishing callback.
   */
  public async subscribe(
    nodeIds: string[],
    samplingIntervalMs: number = 1000,
    callback: SubscriptionCallback,
  ): Promise<string> {
    if (this.state !== "CONNECTED") {
      throw new Error(
        `OPCUA_NOT_CONNECTED: Não é possível criar subscription no estado [${this.state}].`,
      );
    }

    const subId = `sub_${crypto.randomUUID()}`;

    const timer = setInterval(async () => {
      if (this.state === "CONNECTED") {
        try {
          const reads = await this.readBatch(nodeIds);
          callback(reads);
        } catch {
          // handled by reconnect/error states
        }
      }
    }, samplingIntervalMs);

    this.activeSubscriptions.set(subId, {
      nodes: nodeIds,
      intervalMs: samplingIntervalMs,
      callback,
      timer,
    });

    this.diagnostics.activeSubscriptions = this.activeSubscriptions.size;
    return subId;
  }

  public async unsubscribe(subscriptionId: string): Promise<void> {
    const sub = this.activeSubscriptions.get(subscriptionId);
    if (sub?.timer) {
      clearInterval(sub.timer);
    }
    this.activeSubscriptions.delete(subscriptionId);
    this.diagnostics.activeSubscriptions = this.activeSubscriptions.size;
  }

  public async healthCheck(): Promise<boolean> {
    return this.state === "CONNECTED";
  }

  /**
   * Maps 32-bit OPC UA StatusCode to ElétricAi TagQuality.
   * Mask 0xC0000000:
   * 0x00000000: Good
   * 0x40000000: Uncertain
   * 0x80000000: Bad
   */
  public mapStatusCodeToQuality(statusCode: number): TagQuality {
    const severityMask = statusCode & 0xc0000000;
    if (severityMask === 0x00000000) return "GOOD";
    if (severityMask === 0x40000000) return "UNCERTAIN";
    return "BAD";
  }

  /**
   * Helper to set node state for laboratory tests.
   */
  public setLabNodeValue(
    nodeId: string,
    value: number | boolean | string,
    options?: { dataType?: TagDataType; quality?: TagQuality; statusCode?: number; unit?: string },
  ): void {
    this.labNodeStore.set(nodeId, {
      value,
      dataType: options?.dataType ?? "REAL",
      quality: options?.quality ?? "GOOD",
      statusCode: options?.statusCode ?? 0x00000000,
      unit: options?.unit,
    });
  }

  public simulateConnectionLoss(): void {
    this.state = "DISCONNECTED";
    this.diagnostics.reconnectCount++;
  }
}
