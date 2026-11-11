// ELÉTRICAI INDUSTRIAL OS — GATE 3.5 ACCEPTANCE TEST SUITE
// Edge Fleet Management & Industrial Operational Readiness (20 Acceptance Scenarios)
// Standards: IEC 62443-4-2, NIST SP 800-82 Rev. 3, RFC 8446, 21 CFR Part 11

import { describe, it, expect, beforeEach } from "vitest";
import { EdgeFleetManager } from "../lib/edge/fleet-manager";
import { FleetCertificateManager } from "../lib/edge/fleet-certificates";
import { RemoteConfigManager } from "../lib/edge/remote-config";
import { SignedUpdateManager } from "../lib/edge/signed-updates";
import { FleetAuditManager } from "../lib/edge/fleet-audit";
import { FleetRbacEngine, FleetAuthorizationError } from "../lib/edge/fleet-rbac";
import type {
  FleetUserContext,
  FleetGatewaySummary,
  RemoteConfigPayload,
  SignedUpdateManifest,
} from "../lib/edge/types";

describe("GATE 3.5 — Edge Fleet Management & Industrial Operational Readiness (20 Scenarios)", () => {
  let fleetManager: EdgeFleetManager;
  let certManager: FleetCertificateManager;
  let configManager: RemoteConfigManager;
  let updateManager: SignedUpdateManager;
  let auditManager: FleetAuditManager;
  let rbacEngine: FleetRbacEngine;

  const PlatformAdmin: FleetUserContext = {
    userId: "usr_platform_admin",
    email: "platform@eletricai.com",
    role: "PLATFORM_ADMIN",
    organizationId: "org_platform",
    authorizedPlantIds: ["plant_ete_sp", "plant_sub_sp", "plant_usina_rj"],
  };

  const TenantAdminA: FleetUserContext = {
    userId: "usr_tenant_admin_a",
    email: "admin_a@cliente-sp.com",
    role: "TENANT_ADMIN",
    organizationId: "org_sp_industrial",
    authorizedPlantIds: ["plant_ete_sp", "plant_sub_sp"],
  };

  const TenantAdminB: FleetUserContext = {
    userId: "usr_tenant_admin_b",
    email: "admin_b@siderurgia-rj.com",
    role: "TENANT_ADMIN",
    organizationId: "org_rj_siderurgia",
    authorizedPlantIds: ["plant_usina_rj"],
  };

  const PlantAdminEte: FleetUserContext = {
    userId: "usr_plant_admin_ete",
    email: "ete_supervisor@cliente-sp.com",
    role: "PLANT_ADMIN",
    organizationId: "org_sp_industrial",
    authorizedPlantIds: ["plant_ete_sp"],
  };

  const OperatorA: FleetUserContext = {
    userId: "usr_operator_a",
    email: "operator@cliente-sp.com",
    role: "EDGE_OPERATOR",
    organizationId: "org_sp_industrial",
    authorizedPlantIds: ["plant_ete_sp"],
  };

  const AuditorA: FleetUserContext = {
    userId: "usr_auditor_a",
    email: "auditor@conformidade.com",
    role: "AUDITOR",
    organizationId: "org_sp_industrial",
    authorizedPlantIds: ["plant_ete_sp", "plant_sub_sp"],
  };

  const TEST_CONFIG_HMAC_KEY = "test_only_config_hmac_secret_gate43";
  const TEST_RELEASE_HMAC_KEY = "test_only_release_hmac_secret_gate43";

  beforeEach(() => {
    fleetManager = new EdgeFleetManager();
    certManager = new FleetCertificateManager();
    configManager = new RemoteConfigManager(TEST_CONFIG_HMAC_KEY);
    updateManager = new SignedUpdateManager(TEST_RELEASE_HMAC_KEY);
    auditManager = new FleetAuditManager();
    rbacEngine = new FleetRbacEngine();
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Múltiplos tenants (isolamento)
  // --------------------------------------------------------------------------
  it("Cenário 1: Múltiplos tenants — isolamento estrito entre Tenant A e Tenant B", () => {
    const gatewaysA = fleetManager.getFleetGateways(TenantAdminA);
    const gatewaysB = fleetManager.getFleetGateways(TenantAdminB);

    expect(gatewaysA.length).toBeGreaterThan(0);
    expect(gatewaysB.length).toBeGreaterThan(0);

    // No cross-contamination
    gatewaysA.forEach((g) => {
      expect(g.organizationId).toBe("org_sp_industrial");
      expect(g.organizationId).not.toBe("org_rj_siderurgia");
    });

    gatewaysB.forEach((g) => {
      expect(g.organizationId).toBe("org_rj_siderurgia");
      expect(g.organizationId).not.toBe("org_sp_industrial");
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Múltiplas plantas (segregação)
  // --------------------------------------------------------------------------
  it("Cenário 2: Múltiplas plantas — administrador da ETE não visualiza Subestação", () => {
    const gatewaysPlantEte = fleetManager.getFleetGateways(PlantAdminEte);

    gatewaysPlantEte.forEach((g) => {
      expect(g.plantId).toBe("plant_ete_sp");
      expect(g.plantId).not.toBe("plant_sub_sp");
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Múltiplos gateways (concorrência e listagem)
  // --------------------------------------------------------------------------
  it("Cenário 3: Múltiplos gateways — lista e gerencia múltiplos appliances concorrentes", () => {
    const all = fleetManager.getFleetGateways(PlatformAdmin);
    expect(all.length).toBeGreaterThanOrEqual(4);

    const metrics = fleetManager.getFleetMetrics(PlatformAdmin);
    expect(metrics.totalGateways).toBe(all.length);
    expect(metrics.totalPendingSamples).toBeGreaterThan(0);
    expect(metrics.versionDistribution).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Gateway offline (detecção determinística por timeout sem inferir online)
  // --------------------------------------------------------------------------
  it("Cenário 4: Gateway offline — detecção determinística por expiração de heartbeat", () => {
    const now = Date.now();
    const staleGw: FleetGatewaySummary = {
      gatewayId: "gw_stale_heartbeat_test",
      name: "Gateway Teste Sem Heartbeat",
      organizationId: "org_sp_industrial",
      plantId: "plant_ete_sp",
      sector: "Setor Teste",
      softwareVersion: "1.2.0",
      protocolVersion: "1.0.0",
      hardwareArch: "x86_64",
      os: "Linux Debian",
      provisionedAt: new Date(now - 100000).toISOString(),
      lastHeartbeatAt: new Date(now - 45000).toISOString(), // 45s ago (> 30s threshold)
      lastSyncAt: new Date(now - 45000).toISOString(),
      operationalState: "ONLINE", // Will be evaluated to OFFLINE
      connectivityState: "CONNECTED",
      storage: {
        walSizeBytes: 1024,
        pendingSamplesCount: 0,
        maxCapacityBytes: 1000000,
        oldestSampleTimestampMs: null,
        isDegraded: false,
        bufferUtilizationPercent: 0.1,
      },
      health: {
        cpuUsagePercent: 10,
        memoryUsagePercent: 20,
        diskUsagePercent: 15,
        status: "HEALTHY",
      },
      certificate: {
        fingerprint: "SHA256:TEST_FINGERPRINT",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(now + 10000000).toISOString(),
        state: "VALID",
        isRevoked: false,
      },
      updateState: "UP_TO_DATE",
      currentConfigVersion: 1,
      activeAlarmsCount: 0,
    };

    const resolved = fleetManager.resolveGatewayOperationalState(staleGw, now);
    expect(resolved).toBe("OFFLINE");
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Gateway degradado (alta latência / buffer / memória)
  // --------------------------------------------------------------------------
  it("Cenário 5: Gateway degradado — transição de estado diante de sobrecarga de recursos", () => {
    const now = Date.now();
    const degradedGw: FleetGatewaySummary = {
      gatewayId: "gw_overload_test",
      name: "Gateway Sobrecarga",
      organizationId: "org_sp_industrial",
      plantId: "plant_ete_sp",
      sector: "Setor Teste",
      softwareVersion: "1.2.0",
      protocolVersion: "1.0.0",
      hardwareArch: "x86_64",
      os: "Linux Debian",
      provisionedAt: new Date(now - 100000).toISOString(),
      lastHeartbeatAt: new Date(now - 2000).toISOString(), // Recent
      lastSyncAt: new Date(now - 2000).toISOString(),
      operationalState: "ONLINE",
      connectivityState: "CONNECTED",
      storage: {
        walSizeBytes: 950000,
        pendingSamplesCount: 80000,
        maxCapacityBytes: 1000000,
        oldestSampleTimestampMs: now - 3600000,
        isDegraded: true, // Degraded storage
        bufferUtilizationPercent: 95.0,
      },
      health: {
        cpuUsagePercent: 96,
        memoryUsagePercent: 94,
        diskUsagePercent: 92,
        status: "CRITICAL",
      },
      certificate: {
        fingerprint: "SHA256:TEST_FINGERPRINT",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(now + 10000000).toISOString(),
        state: "VALID",
        isRevoked: false,
      },
      updateState: "UP_TO_DATE",
      currentConfigVersion: 1,
      activeAlarmsCount: 2,
    };

    const resolved = fleetManager.resolveGatewayOperationalState(degradedGw, now);
    expect(resolved).toBe("DEGRADED");
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Certificado expirado (bloqueio e aviso)
  // --------------------------------------------------------------------------
  it("Cenário 6: Certificado expirado — identificação e sinalização de expiração", () => {
    const now = Date.now();
    const expiredRecord = certManager.evaluateCertificateState({
      fingerprint: "SHA256:EXPIRED_FINGERPRINT",
      issuedAt: new Date(now - 400 * 24 * 3600 * 1000).toISOString(),
      expiresAt: new Date(now - 1000).toISOString(), // Expired 1 second ago
      state: "VALID",
      isRevoked: false,
    });

    expect(expiredRecord.state).toBe("EXPIRED");
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Certificado revogado (rejeição imediata)
  // --------------------------------------------------------------------------
  it("Cenário 7: Certificado revogado — rejeição imediata de gateway comprometido", () => {
    const ok = certManager.revokeCertificate(
      "gw_lab_ete_01",
      "Comprometimento de credenciais físicas em painel",
      PlatformAdmin,
      "org_sp_industrial",
      "plant_ete_sp",
    );
    expect(ok).toBe(true);

    const cert = certManager.getCertificate("gw_lab_ete_01");
    expect(cert?.state).toBe("REVOKED");
    expect(cert?.isRevoked).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Configuração inválida (rejeitada, mantém LKGC)
  // --------------------------------------------------------------------------
  it("Cenário 8: Configuração inválida — rejeição por schema malformado mantendo LKGC", () => {
    const invalidConfig = {
      configVersion: 2,
      gatewayId: "gw_lab_ete_01",
      scanRateMs: -50, // Invalid: negative
      // Missing required fields
    };

    const result = configManager.proposeAndApplyConfig(
      invalidConfig,
      TenantAdminA,
      "org_sp_industrial",
      "plant_ete_sp",
    );

    expect(result.success).toBe(false);
    expect(result.isFallbackToLkgc).toBe(true);
    expect(result.activeConfigVersion).toBe(1); // Still on LKGC v1
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Configuração duplicada (idempotência / rejeição de versão repetida)
  // --------------------------------------------------------------------------
  it("Cenário 9: Configuração duplicada — rejeição de versão igual à ativa", () => {
    const unsignedDup = {
      configVersion: 1, // Same as active
      gatewayId: "gw_lab_ete_01",
      author: "admin@eletricai.com",
      timestamp: Date.now(),
      scanRateMs: 500,
      authorizedEndpoints: ["192.168.1.10:502"],
      enabledTags: ["TAG01"],
      readProtocols: { modbus: { host: "192.168.1.10", port: 502, enabled: true } },
      bufferLimits: {
        maxSamples: 50000,
        maxDiskMb: 500,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL" as const,
      },
      retentionPolicy: { maxAgeHours: 48 },
      observability: { metricsIntervalMs: 5000, logLevel: "INFO" as const },
    };
    const duplicateConfig: RemoteConfigPayload = {
      ...unsignedDup,
      signature: configManager.generateConfigSignature(unsignedDup),
    };

    const result = configManager.proposeAndApplyConfig(
      duplicateConfig,
      TenantAdminA,
      "org_sp_industrial",
      "plant_ete_sp",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("CONFIG_VERSION_CONFLICT");
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Conflito de versão (rejeição de versão desatualizada de config)
  // --------------------------------------------------------------------------
  it("Cenário 10: Conflito de versão — rejeição de versão inferior à ativa", () => {
    // 1. Advance to version 2
    const unsignedV2 = {
      configVersion: 2,
      gatewayId: "gw_lab_ete_01",
      author: "admin@eletricai.com",
      timestamp: Date.now(),
      scanRateMs: 500,
      authorizedEndpoints: ["192.168.1.10:502"],
      enabledTags: ["TAG01"],
      readProtocols: { modbus: { host: "192.168.1.10", port: 502, enabled: true } },
      bufferLimits: {
        maxSamples: 50000,
        maxDiskMb: 500,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL" as const,
      },
      retentionPolicy: { maxAgeHours: 48 },
      observability: { metricsIntervalMs: 5000, logLevel: "INFO" as const },
    };
    const v2Config: RemoteConfigPayload = {
      ...unsignedV2,
      signature: configManager.generateConfigSignature(unsignedV2),
    };
    const resAdvance = configManager.proposeAndApplyConfig(
      v2Config,
      TenantAdminA,
      "org_sp_industrial",
      "plant_ete_sp",
    );
    expect(resAdvance.success).toBe(true);

    // 2. Submit version 1 (which is lower than active version 2)
    const unsignedOld = {
      configVersion: 1, // Lower than 2
      gatewayId: "gw_lab_ete_01",
      author: "admin@eletricai.com",
      timestamp: Date.now(),
      scanRateMs: 500,
      authorizedEndpoints: ["192.168.1.10:502"],
      enabledTags: ["TAG01"],
      readProtocols: {},
      bufferLimits: {
        maxSamples: 50000,
        maxDiskMb: 500,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL" as const,
      },
      retentionPolicy: { maxAgeHours: 48 },
      observability: { metricsIntervalMs: 5000, logLevel: "INFO" as const },
    };
    const oldConfig: RemoteConfigPayload = {
      ...unsignedOld,
      signature: configManager.generateConfigSignature(unsignedOld),
    };

    const result = configManager.proposeAndApplyConfig(
      oldConfig,
      TenantAdminA,
      "org_sp_industrial",
      "plant_ete_sp",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("CONFIG_VERSION_CONFLICT");
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Atualização interrompida (abort campaign)
  // --------------------------------------------------------------------------
  it("Cenário 11: Atualização interrompida — aborto imediato de campanha pelo administrador", () => {
    const unsignedManifest11 = {
      packageId: "pkg-edge-test-1.3.0",
      targetVersion: "1.3.0",
      targetArch: "x86_64" as const,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      releaseNotes: "Patch de segurança",
      minGatewayVersion: "1.0.0",
    };
    const manifest: SignedUpdateManifest = {
      ...unsignedManifest11,
      signature: updateManager.signReleaseManifest(unsignedManifest11),
    };

    const campaign = updateManager.createStagedCampaign(
      manifest,
      "plant_ete_sp",
      "org_sp_industrial",
      TenantAdminA,
    );

    const aborted = updateManager.abortCampaign(
      campaign.campaignId,
      TenantAdminA,
      "org_sp_industrial",
      "plant_ete_sp",
    );
    expect(aborted).toBe(true);

    const updatedCampaign = updateManager.getCampaign(campaign.campaignId);
    expect(updatedCampaign?.status).toBe("ABORTED");
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Rollback (automático após falha no health check)
  // --------------------------------------------------------------------------
  it("Cenário 12: Rollback automático — restaura versão anterior se o health check falhar", () => {
    const unsignedManifest12 = {
      packageId: "pkg-edge-test-1.3.0",
      targetVersion: "1.3.0",
      targetArch: "x86_64" as const,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      releaseNotes: "Atualização com falha simulada",
      minGatewayVersion: "1.0.0",
    };
    const manifest: SignedUpdateManifest = {
      ...unsignedManifest12,
      signature: updateManager.signReleaseManifest(unsignedManifest12),
    };

    const campaign = updateManager.createStagedCampaign(
      manifest,
      "plant_ete_sp",
      "org_sp_industrial",
      TenantAdminA,
    );

    const mockGw = fleetManager.getGateway("gw_lab_ete_01")!;
    // Simulate failed post-update health check (daemon returned false)
    const execResult = updateManager.executeGatewayUpdate(campaign.campaignId, mockGw, () => false);

    expect(execResult.success).toBe(false);
    expect(execResult.rollbackExecuted).toBe(true);
    expect(execResult.updateState).toBe("ROLLED_BACK");
    expect(execResult.activeVersion).toBe("1.2.0"); // Restored to previous
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Falha de armazenamento (sinalização de degradação)
  // --------------------------------------------------------------------------
  it("Cenário 13: Falha de armazenamento — sinalização de degradação no heartbeat", () => {
    const res = fleetManager.postHeartbeat("gw_lab_ete_01", {
      cpuUsagePercent: 40,
      memoryUsagePercent: 50,
      diskUsagePercent: 95, // High disk
      walSizeBytes: 980 * 1024 * 1024,
      pendingSamplesCount: 95000,
      maxCapacityBytes: 1024 * 1024 * 1024,
      oldestSampleTimestampMs: Date.now() - 3600000,
      isDegraded: true, // Explicit storage degradation
    });

    expect(res.success).toBe(true);
    expect(res.resolvedState).toBe("DEGRADED");
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Perda de conectividade (retenção no buffer local)
  // --------------------------------------------------------------------------
  it("Cenário 14: Perda de conectividade — buffer acumula amostras pendentes", () => {
    const gw = fleetManager.getGateway("gw_offline_demo")!;
    expect(gw.operationalState).toBe("OFFLINE");
    expect(gw.storage.pendingSamplesCount).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Recuperação de conectividade (despacho ordenado e transição ONLINE)
  // --------------------------------------------------------------------------
  it("Cenário 15: Recuperação de conectividade — novo heartbeat transita gateway para ONLINE", () => {
    const now = Date.now();
    const res = fleetManager.postHeartbeat(
      "gw_offline_demo",
      {
        cpuUsagePercent: 20,
        memoryUsagePercent: 35,
        diskUsagePercent: 40,
        walSizeBytes: 5 * 1024 * 1024,
        pendingSamplesCount: 10,
        maxCapacityBytes: 1024 * 1024 * 1024,
        oldestSampleTimestampMs: now - 1000,
        isDegraded: false,
      },
      now,
    );

    expect(res.success).toBe(true);
    expect(res.resolvedState).toBe("ONLINE");
  });

  // --------------------------------------------------------------------------
  // Scenario 16: Tentativa de acesso cross-tenant (negada pelo RBAC)
  // --------------------------------------------------------------------------
  it("Cenário 16: Tentativa de acesso cross-tenant — RBAC bloqueia Tenant A de acessar Tenant B", () => {
    expect(() => {
      rbacEngine.assertCanPerformAction(TenantAdminA, "VIEW_TELEMETRY", {
        organizationId: "org_rj_siderurgia", // Belongs to Tenant B
        plantId: "plant_usina_rj",
        gatewayId: "gw_laminacao_rj_01",
      });
    }).toThrow(FleetAuthorizationError);
  });

  // --------------------------------------------------------------------------
  // Scenario 17: Tentativa de alteração não autorizada (negada pelo RBAC)
  // --------------------------------------------------------------------------
  it("Cenário 17: Tentativa de alteração não autorizada — Operador não pode revogar certificado", () => {
    expect(() => {
      rbacEngine.assertCanPerformAction(OperatorA, "REVOKE_CERTIFICATE", {
        organizationId: "org_sp_industrial",
        plantId: "plant_ete_sp",
        gatewayId: "gw_lab_ete_01",
      });
    }).toThrow(FleetAuthorizationError);
  });

  // --------------------------------------------------------------------------
  // Scenario 18: Preservação da última configuração válida (LKGC)
  // --------------------------------------------------------------------------
  it("Cenário 18: Preservação de LKGC — Rollback manual restaura versão estável", () => {
    // 1. Apply valid v2
    const unsignedValidV2 = {
      configVersion: 2,
      gatewayId: "gw_lab_ete_01",
      author: "admin@eletricai.com",
      timestamp: Date.now(),
      scanRateMs: 2000,
      authorizedEndpoints: ["192.168.1.10:502"],
      enabledTags: ["TAG_A", "TAG_B"],
      readProtocols: { modbus: { host: "192.168.1.10", port: 502, enabled: true } },
      bufferLimits: {
        maxSamples: 100000,
        maxDiskMb: 1000,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL" as const,
      },
      retentionPolicy: { maxAgeHours: 72 },
      observability: { metricsIntervalMs: 5000, logLevel: "INFO" as const },
    };
    const validV2: RemoteConfigPayload = {
      ...unsignedValidV2,
      signature: configManager.generateConfigSignature(unsignedValidV2),
    };

    const resV2 = configManager.proposeAndApplyConfig(
      validV2,
      TenantAdminA,
      "org_sp_industrial",
      "plant_ete_sp",
    );
    expect(resV2.success).toBe(true);
    expect(configManager.getActiveConfig("gw_lab_ete_01")?.configVersion).toBe(2);

    // 2. Rollback to v1
    const rollRes = configManager.rollbackConfig(
      "gw_lab_ete_01",
      TenantAdminA,
      "org_sp_industrial",
      "plant_ete_sp",
    );
    expect(rollRes.success).toBe(true);
    expect(configManager.getActiveConfig("gw_lab_ete_01")?.configVersion).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Scenario 19: Persistência da auditoria (cadeia de integridade SHA-256)
  // --------------------------------------------------------------------------
  it("Cenário 19: Persistência da auditoria — eventos encadeados por hash SHA-256 inviolável", () => {
    auditManager.recordEvent({
      actor: { id: "usr_1", email: "user1@teste.com", role: "TENANT_ADMIN" },
      source: "ADMIN_CONSOLE",
      gatewayId: "gw_lab_ete_01",
      plantId: "plant_ete_sp",
      organizationId: "org_sp_industrial",
      eventType: "GATEWAY_TEST_EVENT_A",
      severity: "INFO",
      result: "SUCCESS",
    });

    auditManager.recordEvent({
      actor: { id: "usr_2", email: "user2@teste.com", role: "PLATFORM_ADMIN" },
      source: "CLOUD_SERVER",
      gatewayId: "gw_lab_ete_01",
      plantId: "plant_ete_sp",
      organizationId: "org_sp_industrial",
      eventType: "GATEWAY_TEST_EVENT_B",
      severity: "WARNING",
      result: "SUCCESS",
    });

    const check = auditManager.verifyAuditChainIntegrity();
    expect(check.isValid).toBe(true);
    expect(check.brokenAtIndex).toBeUndefined();
  });

  // --------------------------------------------------------------------------
  // Scenario 20: Permanência do bloqueio de escrita física (isPhysicalControlAllowed: false)
  // --------------------------------------------------------------------------
  it("Cenário 20: Bloqueio físico absoluto — rejeição imediata de configuração que tente acionar comandos físicos", () => {
    const maliciousConfig = {
      configVersion: 3,
      gatewayId: "gw_lab_ete_01",
      author: "attacker@malicious.com",
      timestamp: Date.now(),
      signature: "SIG_MALICIOUS_ACTUATE_001",
      scanRateMs: 1000,
      authorizedEndpoints: ["192.168.1.10:502"],
      enabledTags: ["BOMBA.LIGAR"],
      allowPhysicalControl: true, // Prohibited!
      writeEnabled: true, // Prohibited!
      readProtocols: {},
      bufferLimits: {
        maxSamples: 10000,
        maxDiskMb: 100,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL",
      },
      retentionPolicy: { maxAgeHours: 24 },
      observability: { metricsIntervalMs: 5000, logLevel: "INFO" },
    };

    const res = configManager.proposeAndApplyConfig(
      maliciousConfig,
      TenantAdminA,
      "org_sp_industrial",
      "plant_ete_sp",
    );

    expect(res.success).toBe(false);
    expect(res.error).toContain("DANGEROUS_CONFIG_REJECTED");
    expect(res.isFallbackToLkgc).toBe(true);
  });
});
