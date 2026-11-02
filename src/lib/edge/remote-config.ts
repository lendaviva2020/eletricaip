// ELÉTRICAI INDUSTRIAL OS — SECURE REMOTE CONFIGURATION & LKGC ROLLBACK ENGINE
// Standards: IEC 62443-4-2, NIST SP 800-82 Rev. 3, RFC 8259

import { z } from "zod";
import { createHash } from "node:crypto";
import type { RemoteConfigPayload, FleetUserContext } from "./types";
import { fleetAuditManager } from "./fleet-audit";
import { fleetRbacEngine } from "./fleet-rbac";

export const RemoteConfigPayloadSchema = z.object({
  configVersion: z.number().int().positive(),
  gatewayId: z.string().min(1).max(128),
  author: z.string().min(1),
  timestamp: z.number().int().positive(),
  signature: z.string().min(8),
  scanRateMs: z.number().int().min(100).max(60000), // Min 100ms prevents PLC exhaustion
  authorizedEndpoints: z.array(z.string().min(1)),
  enabledTags: z.array(z.string().min(1)),
  readProtocols: z.object({
    opcua: z
      .object({
        endpoint: z.string(),
        enabled: z.boolean(),
      })
      .optional(),
    modbus: z
      .object({
        host: z.string(),
        port: z.number().int().min(1).max(65535),
        enabled: z.boolean(),
      })
      .optional(),
    sparkplug: z
      .object({
        brokerUrl: z.string(),
        enabled: z.boolean(),
      })
      .optional(),
  }),
  bufferLimits: z.object({
    maxSamples: z.number().int().min(1000).max(10000000),
    maxDiskMb: z.number().int().min(100).max(100000),
    saturationPolicy: z.enum(["DROP_OLDEST_NON_CRITICAL", "DROP_NEWEST_WITH_ALARM"]),
  }),
  retentionPolicy: z.object({
    maxAgeHours: z.number().int().min(1).max(8760),
  }),
  observability: z.object({
    metricsIntervalMs: z.number().int().min(1000).max(300000),
    logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]),
  }),
  approval: z
    .object({
      approvedBy: z.string(),
      approvedAt: z.number(),
    })
    .optional(),
});

export interface ConfigApplicationResult {
  success: boolean;
  activeConfigVersion: number;
  error?: string;
  isFallbackToLkgc?: boolean;
}

export class RemoteConfigManager {
  // gatewayId -> version history (ordered by version)
  private configHistory: Map<string, RemoteConfigPayload[]> = new Map();
  // gatewayId -> Last Known Good Configuration (LKGC)
  private lkgcMap: Map<string, RemoteConfigPayload> = new Map();

  constructor() {
    this.seedDefaultConfig();
  }

  private seedDefaultConfig(): void {
    const defaultConfig: RemoteConfigPayload = {
      configVersion: 1,
      gatewayId: "gw_lab_ete_01",
      author: "system_provisioning@eletricai.com",
      timestamp: Date.now(),
      signature: "SIG_DEFAULT_LKGC_V1_HASH_SECURE",
      scanRateMs: 1000,
      authorizedEndpoints: ["opc.tcp://192.168.1.10:4840", "192.168.1.20:502"],
      enabledTags: ["ETE.BOMBA01.CORRENTE", "ETE.BOMBA01.TEMP_ESTATOR"],
      readProtocols: {
        opcua: { endpoint: "opc.tcp://192.168.1.10:4840", enabled: true },
        modbus: { host: "192.168.1.20", port: 502, enabled: true },
      },
      bufferLimits: {
        maxSamples: 100000,
        maxDiskMb: 1024,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL",
      },
      retentionPolicy: { maxAgeHours: 72 },
      observability: { metricsIntervalMs: 5000, logLevel: "INFO" },
    };

    this.configHistory.set("gw_lab_ete_01", [defaultConfig]);
    this.lkgcMap.set("gw_lab_ete_01", defaultConfig);
  }

  public getActiveConfig(gatewayId: string): RemoteConfigPayload | undefined {
    return this.lkgcMap.get(gatewayId);
  }

  public getConfigHistory(gatewayId: string): RemoteConfigPayload[] {
    return this.configHistory.get(gatewayId) || [];
  }

  /**
   * Generates a tamper-proof signature for a configuration payload.
   */
  public generateConfigSignature(
    payload: Omit<RemoteConfigPayload, "signature">,
    signingSecret: string = "ELETRICAI_REMOTE_CONFIG_SIGNING_KEY",
  ): string {
    const raw = JSON.stringify(payload);
    return createHash("sha256").update(`${raw}:${signingSecret}`).digest("hex");
  }

  /**
   * Proposes and validates a new administrative configuration.
   * Enforces schema, strict read-only parameters, version monotonicity, and LKGC safety.
   */
  public proposeAndApplyConfig(
    candidate: unknown,
    user: FleetUserContext,
    targetOrgId: string,
    targetPlantId: string,
  ): ConfigApplicationResult {
    // 1. Check RBAC
    fleetRbacEngine.assertCanPerformAction(user, "PROPOSE_CONFIG", {
      organizationId: targetOrgId,
      plantId: targetPlantId,
      gatewayId: typeof candidate === "object" && candidate !== null && "gatewayId" in candidate
        ? String((candidate as any).gatewayId)
        : "unknown",
    });

    // 2. Strict Safety Interlock Check: Reject ANY attempted physical write or control parameter
    const rawStr = JSON.stringify(candidate).toLowerCase();
    if (
      rawStr.includes("writeenabled") ||
      rawStr.includes("allowphysicalcontrol") ||
      rawStr.includes("enableoutputs") ||
      rawStr.includes("write_service") ||
      rawStr.includes("writecoil") ||
      rawStr.includes("writeregister")
    ) {
      fleetAuditManager.recordEvent({
        actor: { id: user.userId, email: user.email, role: user.role },
        source: "ADMIN_CONSOLE",
        gatewayId: (candidate as any)?.gatewayId || "unknown",
        plantId: targetPlantId,
        organizationId: targetOrgId,
        eventType: "DANGEROUS_CONFIG_REJECTED",
        severity: "CRITICAL",
        result: "DENIED",
        details: { reason: "Tentativa de habilitar escrita física ou controle de atuadores via configuração remota." },
      });

      return {
        success: false,
        activeConfigVersion: this.lkgcMap.get((candidate as any)?.gatewayId)?.configVersion ?? 0,
        error: "DANGEROUS_CONFIG_REJECTED: A plataforma proíbe permanentemente configurações com escrita física (isPhysicalControlAllowed: false).",
        isFallbackToLkgc: true,
      };
    }

    // 3. Schema Validation
    const parsed = RemoteConfigPayloadSchema.safeParse(candidate);
    if (!parsed.success) {
      const errDetails = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      const gwId = (candidate as any)?.gatewayId || "unknown";
      const currentLkgc = this.lkgcMap.get(gwId);

      fleetAuditManager.recordEvent({
        actor: { id: user.userId, email: user.email, role: user.role },
        source: "ADMIN_CONSOLE",
        gatewayId: gwId,
        plantId: targetPlantId,
        organizationId: targetOrgId,
        eventType: "CONFIG_REJECTED",
        severity: "WARNING",
        result: "FAILED",
        details: { reason: "Falha de validação de schema Zod", errors: errDetails },
      });

      return {
        success: false,
        activeConfigVersion: currentLkgc?.configVersion ?? 0,
        error: `INVALID_CONFIG_SCHEMA: ${errDetails}`,
        isFallbackToLkgc: true,
      };
    }

    const validConfig = parsed.data;
    const history = this.configHistory.get(validConfig.gatewayId) || [];
    const currentActive = this.lkgcMap.get(validConfig.gatewayId);

    // 4. Concurrency & Monotonic Version Check
    if (currentActive && validConfig.configVersion <= currentActive.configVersion) {
      return {
        success: false,
        activeConfigVersion: currentActive.configVersion,
        error: `CONFIG_VERSION_CONFLICT: Versão proposta (${validConfig.configVersion}) não é superior à versão ativa atual (${currentActive.configVersion}).`,
        isFallbackToLkgc: true,
      };
    }

    // 5. Successful Application -> Update LKGC
    history.push(validConfig);
    this.configHistory.set(validConfig.gatewayId, history);
    this.lkgcMap.set(validConfig.gatewayId, validConfig);

    fleetAuditManager.recordEvent({
      actor: { id: user.userId, email: user.email, role: user.role },
      source: "ADMIN_CONSOLE",
      gatewayId: validConfig.gatewayId,
      plantId: targetPlantId,
      organizationId: targetOrgId,
      eventType: "CONFIG_APPLIED",
      severity: "INFO",
      result: "SUCCESS",
      details: {
        configVersion: validConfig.configVersion,
        scanRateMs: validConfig.scanRateMs,
        enabledTagsCount: validConfig.enabledTags.length,
      },
    });

    return {
      success: true,
      activeConfigVersion: validConfig.configVersion,
    };
  }

  /**
   * Rolls back the gateway configuration to the Last Known Good Configuration (LKGC) or version - 1.
   */
  public rollbackConfig(
    gatewayId: string,
    user: FleetUserContext,
    targetOrgId: string,
    targetPlantId: string,
  ): ConfigApplicationResult {
    fleetRbacEngine.assertCanPerformAction(user, "ROLLBACK_CONFIG", {
      organizationId: targetOrgId,
      plantId: targetPlantId,
      gatewayId,
    });

    const history = this.configHistory.get(gatewayId) || [];
    if (history.length <= 1) {
      return {
        success: false,
        activeConfigVersion: this.lkgcMap.get(gatewayId)?.configVersion ?? 1,
        error: "NO_PREVIOUS_CONFIG: Não há versão anterior disponível para rollback.",
      };
    }

    // Remove the bad current config and restore the previous LKGC
    history.pop();
    const previousConfig = history[history.length - 1];
    this.lkgcMap.set(gatewayId, previousConfig);

    fleetAuditManager.recordEvent({
      actor: { id: user.userId, email: user.email, role: user.role },
      source: "ADMIN_CONSOLE",
      gatewayId,
      plantId: targetPlantId,
      organizationId: targetOrgId,
      eventType: "CONFIG_ROLLED_BACK",
      severity: "WARNING",
      result: "SUCCESS",
      details: {
        restoredConfigVersion: previousConfig.configVersion,
      },
    });

    return {
      success: true,
      activeConfigVersion: previousConfig.configVersion,
    };
  }
}

export const remoteConfigManager = new RemoteConfigManager();
