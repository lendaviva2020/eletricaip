// ELÉTRICAI INDUSTRIAL OS — SIGNED UPDATES, ED25519 VERIFICATION & STAGED ROLLOUT ENGINE
// Standards: NIST SP 800-82 Rev. 3, IEC 62443-4-2, The Update Framework (TUF)
// Gate 4.3.1: Asymmetric Ed25519 verification over canonical full-manifest payload,
// artifact byte SHA-256 verification, expiry, semver anti-downgrade, anti-replay, and tenant bounds.

import {
  createHash,
  generateKeyPairSync,
  sign as cryptoSign,
  timingSafeEqual,
  verify as cryptoVerify,
} from "node:crypto";
import type {
  EdgeUpdateState,
  FleetGatewaySummary,
  FleetStorageBackend,
  FleetUserContext,
  SignedUpdateManifest,
} from "./types";
import { canonicalJson, fleetAuditManager, type FleetAuditManager } from "./fleet-audit";
import { fleetRbacEngine } from "./fleet-rbac";

export interface UpdateExecutionResult {
  success: boolean;
  gatewayId: string;
  previousVersion: string;
  activeVersion: string;
  updateState: EdgeUpdateState;
  error?: string;
  rollbackExecuted?: boolean;
}

export interface UpdateCampaign {
  campaignId: string;
  manifest: SignedUpdateManifest;
  targetPlantId: string;
  organizationId: string;
  status: "IN_PROGRESS" | "COMPLETED" | "ABORTED" | "ROLLED_BACK";
  createdAt: number;
  completedAt?: number;
  gateways: Array<{
    gatewayId: string;
    state: EdgeUpdateState;
    activeVersion: string;
    error?: string;
  }>;
}

export interface SignedUpdateManagerOptions {
  publicKeysByKeyId?: Record<string, string>;
  privateSigningKeyPem?: string;
  defaultKeyId?: string;
  store?: FleetStorageBackend;
  auditManager?: FleetAuditManager;
}

const DEFAULT_RELEASE_KEY_ID = "release-ed25519-v1";

function parseSemverTuple(version: string): [number, number, number] | null {
  const clean = version.trim().replace(/^v/i, "").split("-")[0];
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(clean);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemverTuple(a);
  const pb = parseSemverTuple(b);
  if (!pa || !pb) return a.localeCompare(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

function loadPublicKeysFromEnv(): Record<string, string> {
  if (typeof process === "undefined" || !process.env) return {};
  const map: Record<string, string> = {};

  const jsonRaw = process.env["ELETRICAI_RELEASE_PUBLIC_KEYS_JSON"];
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string" && v.includes("BEGIN PUBLIC KEY")) {
          map[k] = v;
        }
      }
    } catch {
      // Fail closed on malformed key map env
    }
  }

  const singlePem = process.env["ELETRICAI_RELEASE_PUBLIC_KEY_PEM"];
  if (singlePem && singlePem.includes("BEGIN PUBLIC KEY")) {
    const keyId = process.env["ELETRICAI_RELEASE_KEY_ID"] || DEFAULT_RELEASE_KEY_ID;
    map[keyId] = singlePem;
  }

  return map;
}

export class SignedUpdateManager {
  private campaigns: Map<string, UpdateCampaign> = new Map();
  private appliedVersionsMemory: Set<string> = new Set();
  private publicKeysByKeyId: Record<string, string>;
  private revokedKeyIds: Set<string> = new Set();
  private privateSigningKeyPem?: string;
  private defaultKeyId: string;
  private store?: FleetStorageBackend;
  private auditManager: FleetAuditManager;

  constructor(options?: SignedUpdateManagerOptions) {
    const envPublicKeys = loadPublicKeysFromEnv();
    this.publicKeysByKeyId = { ...envPublicKeys, ...(options?.publicKeysByKeyId ?? {}) };
    this.privateSigningKeyPem =
      options?.privateSigningKeyPem ??
      (typeof process !== "undefined" && process.env
        ? process.env["ELETRICAI_RELEASE_PRIVATE_KEY_PEM"]
        : undefined);
    this.defaultKeyId =
      options?.defaultKeyId ??
      (typeof process !== "undefined" && process.env
        ? process.env["ELETRICAI_RELEASE_KEY_ID"] || DEFAULT_RELEASE_KEY_ID
        : DEFAULT_RELEASE_KEY_ID);
    this.auditManager = options?.auditManager ?? fleetAuditManager;
    if (options?.store) {
      this.attachStorageBackend(options.store);
    }
  }

  public static generateReleaseKeyPair(keyId: string = DEFAULT_RELEASE_KEY_ID): {
    keyId: string;
    publicKeyPem: string;
    privateKeyPem: string;
  } {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    return {
      keyId,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    };
  }

  public attachStorageBackend(store: FleetStorageBackend): void {
    this.store = store;
    const loaded = store.loadOtaCampaigns();
    for (const [id, cmp] of Object.entries(loaded)) {
      this.campaigns.set(id, cmp as UpdateCampaign);
    }
    const keys = store.loadOtaSigningKeys?.() ?? [];
    for (const key of keys) {
      if (key.status === "REVOKED") {
        this.revokedKeyIds.add(key.keyId);
        delete this.publicKeysByKeyId[key.keyId];
      } else if (key.publicKeyPem.includes("BEGIN PUBLIC KEY")) {
        this.publicKeysByKeyId[key.keyId] = key.publicKeyPem;
      }
    }
    for (const [keyId, pem] of Object.entries(this.publicKeysByKeyId)) {
      if (!this.revokedKeyIds.has(keyId)) {
        store.saveOtaSigningKey?.({ keyId, publicKeyPem: pem, status: "ACTIVE" });
      }
    }
  }

  public registerTrustedPublicKey(keyId: string, publicKeyPem: string): void {
    if (!keyId || !publicKeyPem.includes("BEGIN PUBLIC KEY")) {
      throw new Error("INVALID_PUBLIC_KEY_PEM: Chave pública Ed25519 SPKI PEM inválida.");
    }
    this.revokedKeyIds.delete(keyId);
    this.publicKeysByKeyId[keyId] = publicKeyPem;
    this.store?.saveOtaSigningKey?.({ keyId, publicKeyPem, status: "ACTIVE" });
  }

  public isSigningKeyRevoked(keyId: string): boolean {
    if (this.store?.loadOtaSigningKeys) {
      for (const k of this.store.loadOtaSigningKeys()) {
        if (k.status === "REVOKED") {
          this.revokedKeyIds.add(k.keyId);
          delete this.publicKeysByKeyId[k.keyId];
        } else {
          this.publicKeysByKeyId[k.keyId] = k.publicKeyPem;
        }
      }
    }
    return this.revokedKeyIds.has(keyId);
  }

  public revokeSigningKey(keyId: string, reason: string, actor?: FleetUserContext): boolean {
    const existingPem = this.publicKeysByKeyId[keyId] ?? "";
    this.revokedKeyIds.add(keyId);
    delete this.publicKeysByKeyId[keyId];
    this.store?.saveOtaSigningKey?.({
      keyId,
      publicKeyPem: existingPem || "REVOKED",
      status: "REVOKED",
      revokedReason: reason,
      revokedAt: new Date().toISOString(),
    });
    if (actor) {
      this.auditManager.recordEvent({
        actor: { id: actor.userId, email: actor.email, role: actor.role },
        source: "ADMIN_CONSOLE",
        gatewayId: "ota_pki_keyring",
        plantId: actor.authorizedPlantIds[0] ?? "global",
        organizationId: actor.organizationId,
        eventType: "OTA_SIGNING_KEY_REVOKED",
        severity: "CRITICAL",
        result: "SUCCESS",
        details: { keyId, reason },
      });
    }
    return true;
  }

  public buildCanonicalSigningPayload(
    manifestData: Omit<SignedUpdateManifest, "signature">,
  ): string {
    return canonicalJson({
      manifestVersion: manifestData.manifestVersion ?? "4.3.1",
      keyId: manifestData.keyId ?? this.defaultKeyId,
      packageId: manifestData.packageId,
      targetVersion: manifestData.targetVersion,
      targetArch: manifestData.targetArch,
      sha256: manifestData.sha256.toLowerCase(),
      minGatewayVersion: manifestData.minGatewayVersion,
      releaseNotes: manifestData.releaseNotes,
      dependencies: manifestData.dependencies ?? {},
      createdAt: manifestData.createdAt ?? null,
      expiresAt: manifestData.expiresAt ?? null,
      targetGateway: manifestData.targetGateway ?? null,
      targetOrganizationId: manifestData.targetOrganizationId ?? null,
      targetPlantId: manifestData.targetPlantId ?? null,
    });
  }

  /**
   * Computes SHA-256 of raw firmware/container artifact bytes and verifies constant-time equality.
   */
  public verifyArtifactBytes(artifactBytes: Uint8Array | Buffer, expectedSha256: string): boolean {
    if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) return false;
    const digestHex = createHash("sha256").update(artifactBytes).digest("hex").toLowerCase();
    return timingSafeEqual(
      Buffer.from(digestHex, "hex"),
      Buffer.from(expectedSha256.toLowerCase(), "hex"),
    );
  }

  /**
   * Signs all canonical manifest fields with asymmetric Ed25519 private key.
   * Requires explicit private key PEM; never uses shared symmetric secret fallback.
   */
  public signReleaseManifest(
    manifestData: Omit<SignedUpdateManifest, "signature">,
    privateKeyPem?: string,
  ): string {
    const keyPem = privateKeyPem || this.privateSigningKeyPem;
    if (!keyPem || !keyPem.includes("BEGIN PRIVATE KEY")) {
      throw new Error(
        "SIGNING_KEY_UNCONFIGURED: Chave privada Ed25519 de release não configurada.",
      );
    }
    const payload = this.buildCanonicalSigningPayload(manifestData);
    return cryptoSign(null, Buffer.from(payload, "utf8"), keyPem).toString("base64");
  }

  /**
   * Verifies asymmetric Ed25519 signature over canonical full-manifest fields,
   * validates SHA-256 checksum syntax, trusted keyId, and optional expiration timestamp.
   */
  public verifyManifestSignature(
    manifest: SignedUpdateManifest,
    overridePublicKeyPem?: string,
    nowMs: number = Date.now(),
  ): boolean {
    if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) return false;
    if (!manifest.signature || manifest.signature.trim().length < 64) return false;

    if (manifest.createdAt) {
      const createdMs = Date.parse(manifest.createdAt);
      if (Number.isNaN(createdMs) || createdMs > nowMs + 300_000) {
        return false;
      }
    }

    if (manifest.expiresAt) {
      const expiresMs = Date.parse(manifest.expiresAt);
      if (Number.isNaN(expiresMs) || nowMs > expiresMs) {
        return false;
      }
    }

    const keyId = manifest.keyId ?? this.defaultKeyId;
    if (this.isSigningKeyRevoked(keyId)) {
      return false;
    }
    const publicKeyPem = overridePublicKeyPem || this.publicKeysByKeyId[keyId];
    if (!publicKeyPem || !publicKeyPem.includes("BEGIN PUBLIC KEY")) {
      return false;
    }

    const { signature, ...unsigned } = manifest;
    const payload = this.buildCanonicalSigningPayload(unsigned);

    try {
      const sigBuf = /^[a-f0-9]{128}$/i.test(signature)
        ? Buffer.from(signature, "hex")
        : Buffer.from(signature, "base64");
      if (sigBuf.length !== 64) return false;
      return cryptoVerify(null, Buffer.from(payload, "utf8"), publicKeyPem, sigBuf);
    } catch {
      return false;
    }
  }

  /**
   * Initiates a staged update campaign scoped to organizationId & targetPlantId.
   */
  public createStagedCampaign(
    manifest: SignedUpdateManifest,
    targetPlantId: string,
    organizationId: string,
    user: FleetUserContext,
  ): UpdateCampaign {
    fleetRbacEngine.assertCanPerformAction(user, "TRIGGER_UPDATE", {
      organizationId,
      plantId: targetPlantId,
      gatewayId: manifest.targetGateway ?? "all_in_plant",
    });

    if (manifest.targetOrganizationId && manifest.targetOrganizationId !== organizationId) {
      throw new Error("MANIFEST_SCOPE_MISMATCH: Manifesto restrito a outra organização.");
    }
    if (manifest.targetPlantId && manifest.targetPlantId !== targetPlantId) {
      throw new Error("MANIFEST_SCOPE_MISMATCH: Manifesto restrito a outra planta.");
    }

    if (!this.verifyManifestSignature(manifest)) {
      throw new Error(
        "INVALID_MANIFEST_SIGNATURE: Assinatura Ed25519 do manifesto OTA inválida, expirada ou chave não confiável.",
      );
    }

    const campaignId = `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const campaign: UpdateCampaign = {
      campaignId,
      manifest,
      targetPlantId,
      organizationId,
      status: "IN_PROGRESS",
      createdAt: Date.now(),
      gateways: [],
    };

    this.campaigns.set(campaignId, campaign);
    this.store?.saveOtaCampaign(campaignId, organizationId, targetPlantId, campaign);

    this.auditManager.recordEvent({
      actor: { id: user.userId, email: user.email, role: user.role },
      source: "ADMIN_CONSOLE",
      gatewayId: manifest.targetGateway ?? "fleet_campaign",
      plantId: targetPlantId,
      organizationId,
      eventType: "UPDATE_CAMPAIGN_STARTED",
      severity: "INFO",
      result: "SUCCESS",
      details: {
        campaignId,
        keyId: manifest.keyId ?? this.defaultKeyId,
        targetVersion: manifest.targetVersion,
        targetArch: manifest.targetArch,
      },
    });

    return campaign;
  }

  /**
   * Applies an update to a target gateway with full Ed25519 re-verification,
   * cross-tenant/plant/gateway boundary enforcement, artifact byte digest verification,
   * anti-downgrade, anti-replay, architecture check, and automatic rollback.
   */
  public executeGatewayUpdate(
    campaignId: string,
    gateway: FleetGatewaySummary,
    healthCheckSimulator: () => boolean,
    options?: { artifactBytes?: Uint8Array | Buffer; nowMs?: number },
  ): UpdateExecutionResult {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error: "CAMPAIGN_NOT_FOUND: Campanha de atualização não encontrada.",
      };
    }

    if (campaign.status === "ABORTED") {
      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error: "CAMPAIGN_ABORTED: A campanha de atualização foi interrompida pelo administrador.",
      };
    }

    // 1. Cross-Tenant / Cross-Plant / Target-Gateway Boundary Enforcement
    if (
      campaign.organizationId !== gateway.organizationId ||
      (campaign.manifest.targetOrganizationId &&
        campaign.manifest.targetOrganizationId !== gateway.organizationId)
    ) {
      this.auditManager.recordEvent({
        actor: { id: "system_deployer", email: "deployer@eletricai.com", role: "PLATFORM_ADMIN" },
        source: "CLOUD_SERVER",
        gatewayId: gateway.gatewayId,
        plantId: gateway.plantId,
        organizationId: gateway.organizationId,
        eventType: "CROSS_TENANT_UPDATE_DENIED",
        severity: "CRITICAL",
        result: "DENIED",
        details: {
          campaignId,
          campaignOrg: campaign.organizationId,
          gatewayOrg: gateway.organizationId,
        },
      });
      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error: "CROSS_TENANT_UPDATE_DENIED: Campanha OTA não pertence à organização do gateway.",
      };
    }

    if (
      campaign.targetPlantId !== gateway.plantId ||
      (campaign.manifest.targetPlantId && campaign.manifest.targetPlantId !== gateway.plantId)
    ) {
      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error: "CROSS_PLANT_UPDATE_DENIED: Campanha OTA não autorizada para a planta do gateway.",
      };
    }

    if (campaign.manifest.targetGateway && campaign.manifest.targetGateway !== gateway.gatewayId) {
      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error: `TARGET_GATEWAY_MISMATCH: Pacote restrito ao gateway ${campaign.manifest.targetGateway}.`,
      };
    }

    // 2. Cryptographic Signature & Expiry Re-Verification
    if (!this.verifyManifestSignature(campaign.manifest, undefined, options?.nowMs)) {
      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error: "INVALID_OR_EXPIRED_MANIFEST: Assinatura Ed25519 inválida ou manifesto expirado.",
      };
    }

    // 3. Version Compatibility & Anti-Downgrade / Anti-Replay Check
    if (compareSemver(gateway.softwareVersion, campaign.manifest.minGatewayVersion) < 0) {
      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error: `MIN_GATEWAY_VERSION_NOT_MET: Versão atual (${gateway.softwareVersion}) inferior ao mínimo (${campaign.manifest.minGatewayVersion}).`,
      };
    }

    if (compareSemver(campaign.manifest.targetVersion, gateway.softwareVersion) <= 0) {
      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error: `DOWNGRADE_OR_REPLAY_BLOCKED: Versão alvo (${campaign.manifest.targetVersion}) não supera a versão ativa (${gateway.softwareVersion}).`,
      };
    }

    const replayKey = `${gateway.gatewayId}:${campaign.manifest.packageId}:${campaign.manifest.targetVersion}`;
    if (
      this.appliedVersionsMemory.has(replayKey) ||
      this.store?.hasAppliedOtaVersion(
        gateway.gatewayId,
        campaign.manifest.packageId,
        campaign.manifest.targetVersion,
      )
    ) {
      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error: "OTA_VERSION_REPLAY_BLOCKED: Versão OTA já instalada/consumida neste gateway.",
      };
    }

    // 4. Artifact Byte Digest Check (if artifact stream supplied)
    if (
      options?.artifactBytes &&
      !this.verifyArtifactBytes(options.artifactBytes, campaign.manifest.sha256)
    ) {
      this.auditManager.recordEvent({
        actor: { id: "system_deployer", email: "deployer@eletricai.com", role: "PLATFORM_ADMIN" },
        source: "EDGE_DAEMON",
        gatewayId: gateway.gatewayId,
        plantId: gateway.plantId,
        organizationId: gateway.organizationId,
        eventType: "ARTIFACT_SHA256_MISMATCH",
        severity: "CRITICAL",
        result: "DENIED",
        details: { campaignId, expectedSha256: campaign.manifest.sha256 },
      });
      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error:
          "ARTIFACT_SHA256_MISMATCH: Digest SHA-256 dos bytes do pacote diverge do manifesto assinado.",
      };
    }

    // 5. Architecture Compatibility Check
    if (campaign.manifest.targetArch !== gateway.hardwareArch) {
      const err = `ARCH_INCOMPATIBLE: Pacote compilado para ${campaign.manifest.targetArch}, mas o gateway opera em ${gateway.hardwareArch}.`;
      campaign.gateways.push({
        gatewayId: gateway.gatewayId,
        state: "UPDATE_FAILED",
        activeVersion: gateway.softwareVersion,
        error: err,
      });
      this.store?.saveOtaCampaign(
        campaignId,
        campaign.organizationId,
        campaign.targetPlantId,
        campaign,
      );

      this.auditManager.recordEvent({
        actor: { id: "system_deployer", email: "deployer@eletricai.com", role: "PLATFORM_ADMIN" },
        source: "EDGE_DAEMON",
        gatewayId: gateway.gatewayId,
        plantId: gateway.plantId,
        organizationId: gateway.organizationId,
        eventType: "UPDATE_ARCH_MISMATCH",
        severity: "WARNING",
        result: "FAILED",
        details: { expected: gateway.hardwareArch, received: campaign.manifest.targetArch },
      });

      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion: gateway.softwareVersion,
        activeVersion: gateway.softwareVersion,
        updateState: "UPDATE_FAILED",
        error: err,
      };
    }

    const previousVersion = gateway.softwareVersion;

    // 6. Staged Installation & Post-Update Health Check
    const isHealthy = healthCheckSimulator();

    if (!isHealthy) {
      campaign.gateways.push({
        gatewayId: gateway.gatewayId,
        state: "ROLLED_BACK",
        activeVersion: previousVersion,
        error:
          "HEALTH_CHECK_FAILED: Falha na validação pós-instalação. Rollback executado com sucesso.",
      });
      this.store?.saveOtaCampaign(
        campaignId,
        campaign.organizationId,
        campaign.targetPlantId,
        campaign,
      );

      this.auditManager.recordEvent({
        actor: { id: "system_deployer", email: "deployer@eletricai.com", role: "PLATFORM_ADMIN" },
        source: "EDGE_DAEMON",
        gatewayId: gateway.gatewayId,
        plantId: gateway.plantId,
        organizationId: gateway.organizationId,
        eventType: "UPDATE_ROLLED_BACK",
        severity: "CRITICAL",
        result: "SUCCESS",
        details: {
          attemptedVersion: campaign.manifest.targetVersion,
          restoredVersion: previousVersion,
          reason: "Health check do daemon falhou após reinicialização.",
        },
      });

      return {
        success: false,
        gatewayId: gateway.gatewayId,
        previousVersion,
        activeVersion: previousVersion,
        updateState: "ROLLED_BACK",
        rollbackExecuted: true,
        error:
          "HEALTH_CHECK_FAILED: Falha na validação pós-instalação. Rollback executado com sucesso.",
      };
    }

    // 7. Healthy Commit + Persistent Anti-Replay Marker
    const newVersion = campaign.manifest.targetVersion;
    this.appliedVersionsMemory.add(replayKey);
    this.store?.recordAppliedOtaVersion(
      gateway.gatewayId,
      campaign.manifest.packageId,
      newVersion,
      campaign.manifest.sha256,
    );
    campaign.gateways.push({
      gatewayId: gateway.gatewayId,
      state: "UP_TO_DATE",
      activeVersion: newVersion,
    });
    this.store?.saveOtaCampaign(
      campaignId,
      campaign.organizationId,
      campaign.targetPlantId,
      campaign,
    );

    this.auditManager.recordEvent({
      actor: { id: "system_deployer", email: "deployer@eletricai.com", role: "PLATFORM_ADMIN" },
      source: "EDGE_DAEMON",
      gatewayId: gateway.gatewayId,
      plantId: gateway.plantId,
      organizationId: gateway.organizationId,
      eventType: "UPDATE_COMMITTED",
      severity: "INFO",
      result: "SUCCESS",
      details: {
        previousVersion,
        newVersion,
      },
    });

    return {
      success: true,
      gatewayId: gateway.gatewayId,
      previousVersion,
      activeVersion: newVersion,
      updateState: "UP_TO_DATE",
    };
  }

  /**
   * Aborts an active update campaign with cross-tenant verification.
   */
  public abortCampaign(
    campaignId: string,
    user: FleetUserContext,
    targetOrgId: string,
    targetPlantId: string,
  ): boolean {
    fleetRbacEngine.assertCanPerformAction(user, "ABORT_UPDATE", {
      organizationId: targetOrgId,
      plantId: targetPlantId,
      gatewayId: "campaign_abort",
    });

    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return false;

    if (
      user.role !== "PLATFORM_ADMIN" &&
      (campaign.organizationId !== user.organizationId || campaign.targetPlantId !== targetPlantId)
    ) {
      throw new Error("CROSS_TENANT_ABORT_DENIED: Campanha pertence a outro escopo.");
    }

    campaign.status = "ABORTED";
    campaign.completedAt = Date.now();
    this.store?.saveOtaCampaign(
      campaignId,
      campaign.organizationId,
      campaign.targetPlantId,
      campaign,
    );

    this.auditManager.recordEvent({
      actor: { id: user.userId, email: user.email, role: user.role },
      source: "ADMIN_CONSOLE",
      gatewayId: "campaign_abort",
      plantId: targetPlantId,
      organizationId: targetOrgId,
      eventType: "UPDATE_CAMPAIGN_ABORTED",
      severity: "WARNING",
      result: "SUCCESS",
      details: { campaignId },
    });

    return true;
  }

  public getCampaign(campaignId: string): UpdateCampaign | undefined {
    return this.campaigns.get(campaignId);
  }
}

export const signedUpdateManager = new SignedUpdateManager();
