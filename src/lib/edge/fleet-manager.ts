// ELÉTRICAI INDUSTRIAL OS — MASTER EDGE FLEET MANAGEMENT ENGINE
// Multi-Tenant Hierarchy, Deterministic Heartbeat Evaluation, Health Monitoring & Diagnostics
// Standards: IEC 62443-3-3, IEC 62443-4-2, NIST SP 800-82 Rev. 3

import type {
  FleetGatewaySummary,
  FleetMetricsSummary,
  EdgeOperationalState,
  EdgeFailureClassification,
  FleetUserContext,
  EdgeHardwareArch,
} from "./types";
import { fleetRbacEngine } from "./fleet-rbac";
import { fleetAuditManager } from "./fleet-audit";
import { fleetCertificateManager } from "./fleet-certificates";

export interface GatewayHeartbeatTelemetry {
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  diskUsagePercent: number;
  temperatureCelsius?: number;
  walSizeBytes: number;
  pendingSamplesCount: number;
  maxCapacityBytes: number;
  oldestSampleTimestampMs: number | null;
  isDegraded: boolean;
  protocolErrorsCount?: number;
  reconnectCount?: number;
}

export class EdgeFleetManager {
  private gateways: Map<string, FleetGatewaySummary> = new Map();
  private heartbeatTimeoutMs: number = 30000; // 30 seconds without heartbeat marks gateway OFFLINE

  constructor() {
    this.seedDefaultFleet();
  }

  private seedDefaultFleet(): void {
    const now = Date.now();
    const oneYearMs = 365 * 24 * 3600 * 1000;
    const tenDaysMs = 10 * 24 * 3600 * 1000;

    // 1. Gateway Lab ETE (Tenant A, Plant ETE SP)
    this.gateways.set("gw_lab_ete_01", {
      gatewayId: "gw_lab_ete_01",
      name: "Gateway ETE Central — Estação de Bombeamento",
      organizationId: "org_sp_industrial",
      plantId: "plant_ete_central",
      sector: "Tratamento Preliminar",
      softwareVersion: "1.2.0",
      protocolVersion: "1.0.0",
      hardwareArch: "x86_64",
      os: "Linux Debian 12 (bookworm)",
      provisionedAt: new Date(now - 60 * 24 * 3600 * 1000).toISOString(),
      lastHeartbeatAt: new Date(now - 5000).toISOString(),
      lastSyncAt: new Date(now - 5000).toISOString(),
      operationalState: "ONLINE",
      connectivityState: "CONNECTED",
      storage: {
        walSizeBytes: 15 * 1024 * 1024,
        pendingSamplesCount: 24,
        maxCapacityBytes: 1024 * 1024 * 1024,
        oldestSampleTimestampMs: now - 3000,
        isDegraded: false,
        bufferUtilizationPercent: 1.5,
      },
      health: {
        cpuUsagePercent: 18.4,
        memoryUsagePercent: 42.1,
        diskUsagePercent: 28.5,
        temperatureCelsius: 44.2,
        status: "HEALTHY",
      },
      certificate: {
        fingerprint: "SHA256:FINGERPRINT_DEFAULT_LAB",
        issuedAt: new Date(now - 60 * 24 * 3600 * 1000).toISOString(),
        expiresAt: new Date(now + oneYearMs).toISOString(),
        state: "VALID",
        isRevoked: false,
      },
      updateState: "UP_TO_DATE",
      currentConfigVersion: 1,
      activeAlarmsCount: 0,
    });

    // 2. Gateway Subestação (Tenant A, Plant Subestação SP)
    this.gateways.set("gw_subestacao_01", {
      gatewayId: "gw_subestacao_01",
      name: "Gateway Subestação Principal 138kV",
      organizationId: "org_sp_industrial",
      plantId: "plant_subestacao_138kv",
      sector: "Cubículo de Proteção SE01",
      softwareVersion: "1.2.0",
      protocolVersion: "1.0.0",
      hardwareArch: "x86_64",
      os: "Linux Alpine 3.19",
      provisionedAt: new Date(now - 45 * 24 * 3600 * 1000).toISOString(),
      lastHeartbeatAt: new Date(now - 2000).toISOString(),
      lastSyncAt: new Date(now - 2000).toISOString(),
      operationalState: "ONLINE",
      connectivityState: "CONNECTED",
      storage: {
        walSizeBytes: 32 * 1024 * 1024,
        pendingSamplesCount: 150,
        maxCapacityBytes: 2 * 1024 * 1024 * 1024,
        oldestSampleTimestampMs: now - 4000,
        isDegraded: false,
        bufferUtilizationPercent: 3.2,
      },
      health: {
        cpuUsagePercent: 22.8,
        memoryUsagePercent: 38.6,
        diskUsagePercent: 31.0,
        temperatureCelsius: 41.5,
        status: "HEALTHY",
      },
      certificate: {
        fingerprint: "SHA256:7B8F9A01C4E2D38B5F6A7E8D9C0B1A2F3E4D5C6B7A8F9E0D1C2B3A4F5E6D7C8B",
        issuedAt: new Date(now - 45 * 24 * 3600 * 1000).toISOString(),
        expiresAt: new Date(now + oneYearMs).toISOString(),
        state: "VALID",
        isRevoked: false,
      },
      updateState: "UP_TO_DATE",
      currentConfigVersion: 2,
      activeAlarmsCount: 1,
    });

    // 3. Gateway Laminação RJ (Tenant B, Plant Siderúrgica RJ)
    this.gateways.set("gw_laminacao_rj_01", {
      gatewayId: "gw_laminacao_rj_01",
      name: "Gateway Usina Laminação a Quente",
      organizationId: "org_rj_siderurgia",
      plantId: "plant_usina_rj",
      sector: "Laminação Linha 02",
      softwareVersion: "1.1.8",
      protocolVersion: "1.0.0",
      hardwareArch: "arm64",
      os: "Linux Yocto 4.0 (kirkstone)",
      provisionedAt: new Date(now - 90 * 24 * 3600 * 1000).toISOString(),
      lastHeartbeatAt: new Date(now - 12000).toISOString(),
      lastSyncAt: new Date(now - 12000).toISOString(),
      operationalState: "ONLINE",
      connectivityState: "CONNECTED",
      storage: {
        walSizeBytes: 85 * 1024 * 1024,
        pendingSamplesCount: 1420,
        maxCapacityBytes: 1024 * 1024 * 1024,
        oldestSampleTimestampMs: now - 15000,
        isDegraded: false,
        bufferUtilizationPercent: 8.5,
      },
      health: {
        cpuUsagePercent: 35.4,
        memoryUsagePercent: 58.2,
        diskUsagePercent: 44.0,
        temperatureCelsius: 52.8,
        status: "HEALTHY",
      },
      certificate: {
        fingerprint: "SHA256:1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0B1C2D3E4F5A6B7C8D9E0F1A2B",
        issuedAt: new Date(now - 90 * 24 * 3600 * 1000).toISOString(),
        expiresAt: new Date(now + tenDaysMs).toISOString(), // Expiring soon!
        state: "EXPIRING_SOON",
        isRevoked: false,
      },
      updateState: "UPDATE_AVAILABLE",
      currentConfigVersion: 1,
      activeAlarmsCount: 0,
    });

    // 4. Gateway com Degradação Ativa (Tenant A)
    this.gateways.set("gw_degraded_demo", {
      gatewayId: "gw_degraded_demo",
      name: "Gateway Tratamento Terciário (Alerta de Buffer)",
      organizationId: "org_sp_industrial",
      plantId: "plant_ete_central",
      sector: "Filtros de Areia",
      softwareVersion: "1.2.0",
      protocolVersion: "1.0.0",
      hardwareArch: "x86_64",
      os: "Linux Debian 12 (bookworm)",
      provisionedAt: new Date(now - 10 * 24 * 3600 * 1000).toISOString(),
      lastHeartbeatAt: new Date(now - 4000).toISOString(),
      lastSyncAt: new Date(now - 25000).toISOString(),
      operationalState: "DEGRADED",
      connectivityState: "DEGRADED",
      storage: {
        walSizeBytes: 950 * 1024 * 1024,
        pendingSamplesCount: 88500,
        maxCapacityBytes: 1024 * 1024 * 1024,
        oldestSampleTimestampMs: now - 3600000,
        isDegraded: true,
        bufferUtilizationPercent: 92.8,
      },
      health: {
        cpuUsagePercent: 88.2,
        memoryUsagePercent: 94.1,
        diskUsagePercent: 91.0,
        temperatureCelsius: 68.5,
        status: "CRITICAL",
      },
      certificate: {
        fingerprint: "SHA256:DEADBEEF0102030405060708090A0B0C0D0E0F10111213141516171819202122",
        issuedAt: new Date(now - 10 * 24 * 3600 * 1000).toISOString(),
        expiresAt: new Date(now + oneYearMs).toISOString(),
        state: "VALID",
        isRevoked: false,
      },
      updateState: "UP_TO_DATE",
      currentConfigVersion: 1,
      activeAlarmsCount: 3,
    });

    // 5. Gateway Offline (Tenant A)
    this.gateways.set("gw_offline_demo", {
      gatewayId: "gw_offline_demo",
      name: "Gateway Painel Remoto ETE - Poço Seco",
      organizationId: "org_sp_industrial",
      plantId: "plant_ete_central",
      sector: "Poço de Sucção",
      softwareVersion: "1.1.5",
      protocolVersion: "1.0.0",
      hardwareArch: "arm64",
      os: "Linux Ubuntu Core 22",
      provisionedAt: new Date(now - 120 * 24 * 3600 * 1000).toISOString(),
      lastHeartbeatAt: new Date(now - 12 * 3600 * 1000).toISOString(), // 12h ago
      lastSyncAt: new Date(now - 12 * 3600 * 1000).toISOString(),
      operationalState: "OFFLINE",
      connectivityState: "DISCONNECTED",
      storage: {
        walSizeBytes: 200 * 1024 * 1024,
        pendingSamplesCount: 12000,
        maxCapacityBytes: 512 * 1024 * 1024,
        oldestSampleTimestampMs: now - 12 * 3600 * 1000,
        isDegraded: false,
        bufferUtilizationPercent: 39.0,
      },
      health: {
        cpuUsagePercent: 0,
        memoryUsagePercent: 0,
        diskUsagePercent: 45.0,
        status: "CRITICAL",
      },
      certificate: {
        fingerprint: "SHA256:00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF",
        issuedAt: new Date(now - 120 * 24 * 3600 * 1000).toISOString(),
        expiresAt: new Date(now + oneYearMs).toISOString(),
        state: "VALID",
        isRevoked: false,
      },
      updateState: "UPDATE_AVAILABLE",
      currentConfigVersion: 1,
      activeAlarmsCount: 2,
    });
  }

  public registerGateway(gateway: FleetGatewaySummary): void {
    this.gateways.set(gateway.gatewayId, { ...gateway });
    fleetCertificateManager.registerCertificate(gateway.certificate, gateway.gatewayId);
  }

  public getGateway(gatewayId: string): FleetGatewaySummary | undefined {
    const gw = this.gateways.get(gatewayId);
    if (!gw) return undefined;
    return this.resolveGatewayWithLiveState(gw);
  }

  /**
   * Deterministically resolves a gateway's operational state without blind assumptions.
   */
  public resolveGatewayOperationalState(
    gateway: FleetGatewaySummary,
    now: number = Date.now(),
  ): EdgeOperationalState {
    // 1. Certificate Revocation Check
    if (gateway.certificate.isRevoked || gateway.operationalState === "REVOKED") {
      return "REVOKED";
    }

    // 2. Explicit Maintenance Mode Check
    if (gateway.operationalState === "MAINTENANCE") {
      return "MAINTENANCE";
    }

    // 3. Heartbeat Freshness Check
    if (!gateway.lastHeartbeatAt) {
      return "OFFLINE";
    }

    const heartbeatAge = now - new Date(gateway.lastHeartbeatAt).getTime();
    if (heartbeatAge > this.heartbeatTimeoutMs) {
      return "OFFLINE";
    }

    // 4. Degradation Check (Resource exhaustion or explicit storage degradation flag)
    if (
      gateway.storage.isDegraded ||
      gateway.health.status === "CRITICAL" ||
      gateway.storage.bufferUtilizationPercent > 90 ||
      gateway.health.memoryUsagePercent > 92 ||
      gateway.health.cpuUsagePercent > 95
    ) {
      return "DEGRADED";
    }

    // 5. Healthy Online State
    return "ONLINE";
  }

  private resolveGatewayWithLiveState(
    gw: FleetGatewaySummary,
    now: number = Date.now(),
  ): FleetGatewaySummary {
    const operationalState = this.resolveGatewayOperationalState(gw, now);
    const connectivityState =
      operationalState === "ONLINE"
        ? "CONNECTED"
        : operationalState === "DEGRADED"
        ? "DEGRADED"
        : "DISCONNECTED";

    const cert = fleetCertificateManager.getCertificate(gw.gatewayId) || gw.certificate;

    const resolved: FleetGatewaySummary = {
      ...gw,
      operationalState,
      connectivityState,
      certificate: cert,
    };

    this.gateways.set(gw.gatewayId, resolved);
    return resolved;
  }

  /**
   * Ingests operational telemetry heartbeat from an active Edge Gateway daemon.
   */
  public postHeartbeat(
    gatewayId: string,
    telemetry: GatewayHeartbeatTelemetry,
    now: number = Date.now(),
  ): { success: boolean; resolvedState: EdgeOperationalState; error?: string } {
    const gw = this.gateways.get(gatewayId);
    if (!gw) {
      return { success: false, resolvedState: "UNKNOWN", error: "GATEWAY_NOT_FOUND" };
    }

    const previousState = gw.operationalState;
    const bufferUtilization = Math.min(
      100,
      parseFloat(((telemetry.walSizeBytes / telemetry.maxCapacityBytes) * 100).toFixed(1)),
    );

    let healthStatus: "HEALTHY" | "WARNING" | "CRITICAL" = "HEALTHY";
    if (
      telemetry.cpuUsagePercent > 85 ||
      telemetry.memoryUsagePercent > 90 ||
      telemetry.diskUsagePercent > 85 ||
      telemetry.isDegraded
    ) {
      healthStatus = "CRITICAL";
    } else if (
      telemetry.cpuUsagePercent > 70 ||
      telemetry.memoryUsagePercent > 75 ||
      telemetry.diskUsagePercent > 75
    ) {
      healthStatus = "WARNING";
    }

    gw.lastHeartbeatAt = new Date(now).toISOString();
    gw.lastSyncAt = new Date(now).toISOString();
    gw.storage = {
      walSizeBytes: telemetry.walSizeBytes,
      pendingSamplesCount: telemetry.pendingSamplesCount,
      maxCapacityBytes: telemetry.maxCapacityBytes,
      oldestSampleTimestampMs: telemetry.oldestSampleTimestampMs,
      isDegraded: telemetry.isDegraded,
      bufferUtilizationPercent: bufferUtilization,
    };
    gw.health = {
      cpuUsagePercent: telemetry.cpuUsagePercent,
      memoryUsagePercent: telemetry.memoryUsagePercent,
      diskUsagePercent: telemetry.diskUsagePercent,
      temperatureCelsius: telemetry.temperatureCelsius,
      status: healthStatus,
    };

    const newState = this.resolveGatewayOperationalState(gw, now);
    gw.operationalState = newState;
    gw.connectivityState =
      newState === "ONLINE" ? "CONNECTED" : newState === "DEGRADED" ? "DEGRADED" : "DISCONNECTED";

    this.gateways.set(gatewayId, gw);

    // Audit state changes (e.g. from OFFLINE to ONLINE or ONLINE to DEGRADED)
    if (previousState !== newState) {
      fleetAuditManager.recordEvent({
        actor: { id: "daemon_heartbeat", email: "edge@daemon.local", role: "EDGE_OPERATOR" },
        source: "EDGE_DAEMON",
        gatewayId,
        plantId: gw.plantId,
        organizationId: gw.organizationId,
        eventType: newState === "ONLINE" ? "GATEWAY_ONLINE_RECOVERED" : `GATEWAY_STATE_${newState}`,
        severity: newState === "ONLINE" ? "INFO" : newState === "DEGRADED" ? "WARNING" : "CRITICAL",
        result: "SUCCESS",
        details: { previousState, newState, healthStatus, bufferUtilization },
      });
    }

    return { success: true, resolvedState: newState };
  }

  /**
   * Returns a filtered list of gateways with RBAC security enforcement.
   */
  public getFleetGateways(
    user: FleetUserContext,
    filter?: {
      organizationId?: string;
      plantId?: string;
      sector?: string;
      operationalState?: EdgeOperationalState;
      hardwareArch?: EdgeHardwareArch;
      searchQuery?: string;
    },
  ): FleetGatewaySummary[] {
    fleetRbacEngine.assertCanPerformAction(user, "VIEW_FLEET");

    const now = Date.now();
    let all = Array.from(this.gateways.values()).map((gw) => this.resolveGatewayWithLiveState(gw, now));

    // Multi-tenant and plant boundary enforcement
    all = fleetRbacEngine.filterGatewaysForUser(all, user);

    if (filter?.organizationId) {
      all = all.filter((g) => g.organizationId === filter.organizationId);
    }
    if (filter?.plantId) {
      all = all.filter((g) => g.plantId === filter.plantId);
    }
    if (filter?.sector) {
      all = all.filter((g) => g.sector.toLowerCase().includes(filter.sector!.toLowerCase()));
    }
    if (filter?.operationalState) {
      all = all.filter((g) => g.operationalState === filter.operationalState);
    }
    if (filter?.hardwareArch) {
      all = all.filter((g) => g.hardwareArch === filter.hardwareArch);
    }
    if (filter?.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      all = all.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.gatewayId.toLowerCase().includes(q) ||
          g.plantId.toLowerCase().includes(q) ||
          g.sector.toLowerCase().includes(q),
      );
    }

    return all;
  }

  /**
   * Computes high-level aggregated fleet metrics for the dashboard.
   */
  public getFleetMetrics(user: FleetUserContext, targetOrgId?: string): FleetMetricsSummary {
    const gateways = this.getFleetGateways(user, targetOrgId ? { organizationId: targetOrgId } : undefined);

    let online = 0;
    let offline = 0;
    let degraded = 0;
    let maintenance = 0;
    let revoked = 0;
    let expiringSoon = 0;
    let totalPendingSamples = 0;
    let cpuSum = 0;
    let memSum = 0;
    let totalAlarms = 0;

    const versionDistribution: Record<string, number> = {};
    const protocolDistribution: Record<string, number> = {
      OPC_UA: 0,
      MODBUS_TCP: 0,
      MQTT_SPARKPLUG_B: 0,
    };

    for (const g of gateways) {
      switch (g.operationalState) {
        case "ONLINE":
          online++;
          break;
        case "OFFLINE":
          offline++;
          break;
        case "DEGRADED":
          degraded++;
          break;
        case "MAINTENANCE":
          maintenance++;
          break;
        case "REVOKED":
          revoked++;
          break;
      }

      if (g.certificate.state === "EXPIRING_SOON" || g.certificate.state === "EXPIRED") {
        expiringSoon++;
      }

      totalPendingSamples += g.storage.pendingSamplesCount;
      cpuSum += g.health.cpuUsagePercent;
      memSum += g.health.memoryUsagePercent;
      totalAlarms += g.activeAlarmsCount;

      versionDistribution[g.softwareVersion] = (versionDistribution[g.softwareVersion] || 0) + 1;
      protocolDistribution["OPC_UA"]++;
      protocolDistribution["MODBUS_TCP"]++;
    }

    const count = gateways.length || 1;

    return {
      totalGateways: gateways.length,
      onlineGateways: online,
      offlineGateways: offline,
      degradedGateways: degraded,
      maintenanceGateways: maintenance,
      revokedGateways: revoked,
      certificatesExpiringSoon: expiringSoon,
      totalPendingSamples,
      averageCpuPercent: parseFloat((cpuSum / count).toFixed(1)),
      averageMemoryPercent: parseFloat((memSum / count).toFixed(1)),
      activeAlarmsCount: totalAlarms,
      versionDistribution,
      protocolDistribution,
    };
  }

  /**
   * Diagnostics: Classifies root cause of an operational anomaly.
   */
  public classifyDiagnosticAnomaly(params: {
    gatewayId: string;
    isHeartbeatRecent: boolean;
    isCloudReachable: boolean;
    isProtocolResponding: boolean;
    isPlcResponsive: boolean;
    hasDeadbandChanged: boolean;
    sampleAgeMs: number;
    stalenessThresholdMs?: number;
  }): EdgeFailureClassification {
    const stalenessLimit = params.stalenessThresholdMs || 10000;

    if (!params.isHeartbeatRecent) {
      return "GATEWAY_FAILURE";
    }

    if (!params.isCloudReachable) {
      return "CLOUD_FAILURE";
    }

    if (!params.isPlcResponsive) {
      return "INDUSTRIAL_SERVER_FAILURE";
    }

    if (!params.isProtocolResponding) {
      return "PROTOCOL_FAILURE";
    }

    if (!params.hasDeadbandChanged && params.sampleAgeMs < stalenessLimit) {
      return "DEADBAND_UNCHANGED";
    }

    if (params.sampleAgeMs >= stalenessLimit) {
      return "STALE_SAMPLE";
    }

    return "GATEWAY_FAILURE";
  }

  public setHeartbeatTimeout(timeoutMs: number): void {
    this.heartbeatTimeoutMs = timeoutMs;
  }
}

export const edgeFleetManager = new EdgeFleetManager();
