// ELÉTRICAI INDUSTRIAL OS — GATE 4.3.1 SECURITY & ARCHITECTURE REGRESSION SUITE
// Part 2: SQLite Persistent Fleet State, Cold-Start Recovery, Append-Only Audit Triggers & Ed25519 OTA

import { describe, expect, it, afterAll } from "vitest";
import { createHash, createHmac } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createIsolatedPersistentFleetContainer } from "@/lib/edge/fleet-runtime.server";
import { FleetAuditManager, canonicalJson } from "@/lib/edge/fleet-audit";
import { SignedUpdateManager } from "@/lib/edge/signed-updates";
import {
  CLOUD_EDGE_PROTOCOL_VERSION,
  type FleetUserContext,
  type RemoteConfigPayload,
} from "@/lib/edge/types";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "eletricai-gate431-"));

const PlatformAdmin: FleetUserContext = {
  userId: "usr_plat_1",
  email: "plat@eletricai.com",
  role: "PLATFORM_ADMIN",
  organizationId: "org_sp_industrial",
  authorizedPlantIds: ["plant_ete_central", "plant_subestacao_138kv"],
};

const TenantAdminA: FleetUserContext = {
  userId: "usr_ten_a",
  email: "admin@spindustrial.com",
  role: "TENANT_ADMIN",
  organizationId: "org_sp_industrial",
  authorizedPlantIds: ["plant_ete_central"],
};

afterAll(() => {
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Ignore locked handle cleanup errors on Windows temp folder teardown
  }
});

describe("Gate 4.3.1 — Persistent SQLite Fleet State & Cold-Start Survival", () => {
  it("Persists provisioning, single-use token burn, revocation, telemetry dedup/sequence, PoP challenge anti-replay, and monotonic config across DB restart", () => {
    const dbPath = path.join(TMP_DIR, "fleet-cold-start.sqlite");
    const releaseKeys = SignedUpdateManager.generateReleaseKeyPair("rel-2026-v1");
    const configSecret = "config-hmac-secret-cold-start-test";

    // Boot 1: Perform mutations
    const boot1 = createIsolatedPersistentFleetContainer(dbPath, {
      configSigningSecret: configSecret,
      releasePublicKeysByKeyId: { [releaseKeys.keyId]: releaseKeys.publicKeyPem },
      releasePrivateKeyPem: releaseKeys.privateKeyPem,
    });
    let provToken!: ReturnType<typeof boot1.provisioningService.createProvisioningToken>;
    let onboarded!: ReturnType<typeof boot1.provisioningService.provisionGateway>;
    const challenge = "nonce-unique-001";
    const newFp = "SHA256:NEW_RENEWED_FP_001";
    let popSig = "";
    let cfgV2!: RemoteConfigPayload;
    let auditCountBeforeRestart = 0;

    try {
      // 1. Atomic single-use token provisioning
      provToken = boot1.provisioningService.createProvisioningToken({
        organizationId: "org_sp_industrial",
        plantId: "plant_ete_central",
        stationId: "station_persist_01",
        issuedBy: PlatformAdmin.email,
        ttlMinutes: 15,
      });
      onboarded = boot1.provisioningService.provisionGateway({
        provisioningToken: provToken.token,
        gatewayVersion: "1.2.0",
        stationHardwareId: "hw-persist-001",
      });
      expect(onboarded.success).toBe(true);
      expect(boot1.provisioningService.authenticateGateway(onboarded.authToken)).not.toBeNull();

      // 2. Telemetry ingest & dedup/sequence persistence
      const ingest1 = boot1.registry.processTelemetryBatch(
        {
          protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
          gatewayId: onboarded.gatewayId,
          batchId: "batch_001",
          batchSequenceNumber: 7,
          sentAt: Date.now(),
          samples: [
            {
              sampleId: "smp_1",
              sequenceNumber: 1,
              projectId: "proj_1",
              tagName: "ETE.BOMBA01.CORRENTE",
              value: 42.5,
              quality: "GOOD",
              source: "MODBUS_TCP",
              sourceTimestamp: 1731300001000,
              edgeReceivedAt: 1731300001010,
              isDelayedReplay: false,
              criticality: "NORMAL",
            },
          ],
        },
        onboarded.authToken,
      );
      expect(ingest1.statusCode).toBe(200);
      expect(ingest1.ack.processedCount).toBe(1);

      // 3. Certificate PoP renewal + anti-replay challenge consumption
      const popSecret = "pop-secret-key-persist";
      boot1.certManager.registerCertificate(
        {
          fingerprint: "SHA256:ORIG_CERT_FP",
          issuedAt: new Date(Date.now() - 86400_000).toISOString(),
          expiresAt: new Date(Date.now() + 86400_000 * 30).toISOString(),
          state: "VALID",
          isRevoked: false,
        },
        "gw_lab_ete_01",
        popSecret,
      );
      popSig = createHmac("sha256", popSecret)
        .update(`gw_lab_ete_01:${challenge}:${newFp}`)
        .digest("hex");
      const renewed = boot1.certManager.renewCertificateWithPoP(
        {
          gatewayId: "gw_lab_ete_01",
          challenge,
          signature: popSig,
          newCsrFingerprint: newFp,
        },
        TenantAdminA,
        "org_sp_industrial",
        "plant_ete_central",
      );
      expect(renewed.success).toBe(true);

      // 4. Remote Config monotonic v2 persisted
      const unsignedCfgV2 = {
        configVersion: 2,
        gatewayId: "gw_lab_ete_01",
        author: TenantAdminA.email,
        timestamp: Date.now(),
        scanRateMs: 500,
        authorizedEndpoints: ["192.168.1.20:502"],
        enabledTags: ["ETE.BOMBA01.CORRENTE"],
        readProtocols: { modbus: { host: "192.168.1.20", port: 502, enabled: true } },
        bufferLimits: {
          maxSamples: 150000,
          maxDiskMb: 2048,
          saturationPolicy: "DROP_OLDEST_NON_CRITICAL" as const,
        },
        retentionPolicy: { maxAgeHours: 96 },
        observability: { metricsIntervalMs: 5000, logLevel: "INFO" as const },
      };
      cfgV2 = {
        ...unsignedCfgV2,
        signature: boot1.configManager.generateConfigSignature(unsignedCfgV2),
      };
      expect(
        boot1.configManager.proposeAndApplyConfig(
          cfgV2,
          TenantAdminA,
          "org_sp_industrial",
          "plant_ete_central",
        ).success,
      ).toBe(true);

      // 5. Revoke gw_subestacao_01 before restart
      expect(
        boot1.certManager.revokeCertificate(
          "gw_subestacao_01",
          "INCIDENT_REVOCATION_PERSIST_CHECK",
          TenantAdminA,
          "org_sp_industrial",
          "plant_subestacao_138kv",
        ),
      ).toBe(true);

      auditCountBeforeRestart = boot1.auditManager.getEvents().length;
    } finally {
      boot1.close();
    }

    let boot2: ReturnType<typeof createIsolatedPersistentFleetContainer> | undefined;
    try {
      boot2 = createIsolatedPersistentFleetContainer(dbPath, {
        configSigningSecret: configSecret,
        releasePublicKeysByKeyId: { [releaseKeys.keyId]: releaseKeys.publicKeyPem },
        releasePrivateKeyPem: releaseKeys.privateKeyPem,
      });

      // Provisioned token cannot be replayed after restart
      const replayProvision = boot2.provisioningService.provisionGateway({
        provisioningToken: provToken.token,
        gatewayVersion: "1.2.0",
        stationHardwareId: "hw-persist-001",
      });
      expect(replayProvision.success).toBe(false);
      expect(replayProvision.error).toMatch(/TOKEN_ALREADY_USED/);

      // Provisioned gateway still authenticates & telemetry survived restart
      expect(boot2.provisioningService.authenticateGateway(onboarded.authToken)).not.toBeNull();
      const persistedTelemetry = boot2.registry.getLatestTelemetryForGateway(onboarded.gatewayId);
      expect(persistedTelemetry).toHaveLength(1);
      expect(persistedTelemetry[0].value).toBe(42.5);

      // PoP challenge replay is rejected across restart
      const popReplay = boot2.certManager.renewCertificateWithPoP(
        {
          gatewayId: "gw_lab_ete_01",
          challenge,
          signature: popSig,
          newCsrFingerprint: newFp,
        },
        TenantAdminA,
        "org_sp_industrial",
        "plant_ete_central",
      );
      expect(popReplay.success).toBe(false);
      expect(popReplay.error).toMatch(/CHALLENGE_REPLAYED/);

      // Revocation survived restart
      expect(boot2.certManager.getCertificate("gw_subestacao_01")?.isRevoked).toBe(true);

      // Monotonic config v2 survived restart & v2 replay fails cleanly
      expect(boot2.configManager.getActiveConfig("gw_lab_ete_01")?.configVersion).toBe(2);
      const conflictRes = boot2.configManager.proposeAndApplyConfig(
        cfgV2,
        TenantAdminA,
        "org_sp_industrial",
        "plant_ete_central",
      );
      expect(conflictRes.success).toBe(false);
      expect(conflictRes.error).toMatch(/CONFIG_VERSION_CONFLICT/);

      // Audit chain survived restart intact
      expect(boot2.auditManager.getEvents().length).toBeGreaterThanOrEqual(auditCountBeforeRestart);
      expect(boot2.auditManager.verifyAuditChainIntegrity().isValid).toBe(true);
    } finally {
      boot2?.close();
    }
  });

  it("Enforces append-only FleetAuditManager acknowledgements (never mutates historical events) & SQLite UPDATE/DELETE triggers", () => {
    const dbPath = path.join(TMP_DIR, "audit-append-only.sqlite");
    const container = createIsolatedPersistentFleetContainer(dbPath);

    const original = container.auditManager.recordEvent({
      actor: { id: "usr_a", email: "eng@sp.com", role: "ENGINEER" },
      source: "CLOUD_SERVER",
      gatewayId: "gw_lab_ete_01",
      plantId: "plant_ete_central",
      organizationId: "org_sp_industrial",
      eventType: "GATEWAY_ALARM_RAISED",
      severity: "WARNING",
      result: "SUCCESS",
      details: { z: 2, a: 1 },
    });

    const originalHashBeforeAck = original.tamperProofHash;
    const originalDetailsBeforeAck = structuredClone(original.details);

    const ackEvent = container.auditManager.acknowledgeEventAndGetRecord(
      original.id,
      "auditor@sp.com",
      { id: "usr_aud", email: "auditor@sp.com", role: "AUDITOR" },
    );
    expect(ackEvent).not.toBeNull();
    expect(ackEvent?.eventType).toBe("GATEWAY_EVENT_ACKNOWLEDGED");
    expect(ackEvent?.details["acknowledgedEventId"]).toBe(original.id);
    expect(ackEvent?.details["acknowledgedEventHash"]).toBe(originalHashBeforeAck);

    // Historical event object & stored JSON were NOT mutated
    expect(original.tamperProofHash).toBe(originalHashBeforeAck);
    expect(original.details).toEqual(originalDetailsBeforeAck);
    expect(container.auditManager.verifyAuditChainIntegrity().isValid).toBe(true);

    // Canonical JSON sorts keys deterministically
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');

    // SQLite DB-level triggers block UPDATE & DELETE on fleet_audit_chain
    expect(() =>
      container.store.executeRawSqlForTest(
        `UPDATE fleet_audit_chain SET event_type = 'TAMPERED' WHERE id = '${original.id}';`,
      ),
    ).toThrow(/AUDIT_CHAIN_IMMUTABLE/);
    expect(() =>
      container.store.executeRawSqlForTest(
        `DELETE FROM fleet_audit_chain WHERE id = '${original.id}';`,
      ),
    ).toThrow(/AUDIT_CHAIN_IMMUTABLE/);

    // clear() blocked when attached to persistent store
    expect(() => container.auditManager.clear()).toThrow(/AUDIT_CHAIN_IMMUTABLE/);

    // clear() blocked in NODE_ENV=production even for unattached FleetAuditManager
    const prevEnv = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "production";
    try {
      const prodAudit = new FleetAuditManager();
      expect(() => prodAudit.clear()).toThrow(/AUDIT_CHAIN_IMMUTABLE/);
    } finally {
      process.env["NODE_ENV"] = prevEnv;
    }

    container.close();
  });

  it("SignedUpdateManager enforces Ed25519 asymmetric verification, full-manifest canonical hash, artifact bytes SHA-256, expiry, anti-downgrade, anti-replay, and cross-tenant boundaries", () => {
    const dbPath = path.join(TMP_DIR, "ota-ed25519.sqlite");
    const releaseKeys = SignedUpdateManager.generateReleaseKeyPair("rel-ed25519-prod");
    const container = createIsolatedPersistentFleetContainer(dbPath, {
      releasePublicKeysByKeyId: { [releaseKeys.keyId]: releaseKeys.publicKeyPem },
      releasePrivateKeyPem: releaseKeys.privateKeyPem,
    });

    const artifactBytes = Buffer.from("ELTRICAI_EDGE_DAEMON_BINARY_V1_4_0", "utf8");
    const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
    const futureExpiry = new Date(Date.now() + 3600_000).toISOString();

    const unsignedManifest = {
      packageId: "edge-daemon-core",
      targetVersion: "1.4.0",
      targetArch: "x86_64" as const,
      sha256: artifactSha256,
      keyId: releaseKeys.keyId,
      manifestVersion: "4.3.1",
      createdAt: new Date().toISOString(),
      expiresAt: futureExpiry,
      targetOrganizationId: "org_sp_industrial",
      targetPlantId: "plant_ete_central",
      targetGateway: "gw_lab_ete_01",
      releaseNotes: "Security hardening release 1.4.0",
      minGatewayVersion: "1.0.0",
    };

    const validSignature = container.updateManager.signReleaseManifest(unsignedManifest);
    const signedManifest = { ...unsignedManifest, signature: validSignature };

    // 1. Tampering releaseNotes OR expiresAt OR minGatewayVersion invalidates Ed25519 signature
    expect(
      container.updateManager.verifyManifestSignature({
        ...signedManifest,
        releaseNotes: "Injected release note",
      }),
    ).toBe(false);
    expect(
      container.updateManager.verifyManifestSignature({
        ...signedManifest,
        minGatewayVersion: "0.0.1",
      }),
    ).toBe(false);
    expect(
      container.updateManager.verifyManifestSignature(
        signedManifest,
        undefined,
        Date.now() + 7200_000,
      ),
    ).toBe(false); // Expired manifest rejected

    // 2. Start campaign on Tenant A / Plant ETE
    const campaign = container.updateManager.createStagedCampaign(
      signedManifest,
      "plant_ete_central",
      "org_sp_industrial",
      TenantAdminA,
    );

    // 3. Cross-tenant / wrong-plant / wrong-gateway rejected
    const gwTenantB = container.fleetManager.getGateway("gw_laminacao_rj_01")!;
    const crossTenantRes = container.updateManager.executeGatewayUpdate(
      campaign.campaignId,
      gwTenantB,
      () => true,
      { artifactBytes },
    );
    expect(crossTenantRes.success).toBe(false);
    expect(crossTenantRes.error).toMatch(/CROSS_TENANT_UPDATE_DENIED/);

    // 4. Artifact byte SHA-256 mismatch rejected cleanly
    const gwTenantA = container.fleetManager.getGateway("gw_lab_ete_01")!;
    const badBytesRes = container.updateManager.executeGatewayUpdate(
      campaign.campaignId,
      gwTenantA,
      () => true,
      { artifactBytes: Buffer.from("TAMPERED_BINARY") },
    );
    expect(badBytesRes.success).toBe(false);
    expect(badBytesRes.error).toMatch(/ARTIFACT_SHA256_MISMATCH/);

    // 5. Downgrade rejected cleanly
    const downgradeAttempt = {
      ...unsignedManifest,
      targetVersion: "1.1.0",
      signature: container.updateManager.signReleaseManifest({
        ...unsignedManifest,
        targetVersion: "1.1.0",
      }),
    };
    const downgradeCampaign = container.updateManager.createStagedCampaign(
      downgradeAttempt,
      "plant_ete_central",
      "org_sp_industrial",
      TenantAdminA,
    );
    const downgradeRes = container.updateManager.executeGatewayUpdate(
      downgradeCampaign.campaignId,
      gwTenantA,
      () => true,
      { artifactBytes },
    );
    expect(downgradeRes.success).toBe(false);
    expect(downgradeRes.error).toMatch(/DOWNGRADE_OR_REPLAY_BLOCKED/);

    // 6. Valid execution succeeds and marks package applied in persistent DB (blocks replay)
    const okRes = container.updateManager.executeGatewayUpdate(
      campaign.campaignId,
      gwTenantA,
      () => true,
      { artifactBytes },
    );
    expect(okRes.success).toBe(true);
    expect(okRes.activeVersion).toBe("1.4.0");

    const replayRes = container.updateManager.executeGatewayUpdate(
      campaign.campaignId,
      gwTenantA,
      () => true,
      { artifactBytes },
    );
    expect(replayRes.success).toBe(false);
    expect(replayRes.error).toMatch(/OTA_VERSION_REPLAY_BLOCKED/);

    container.close();
  });
});
