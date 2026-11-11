// ELÉTRICAI INDUSTRIAL OS — SIGNED UPDATES, STAGED ROLLOUTS & AUTOMATED ROLLBACK ENGINE
// Standards: NIST SP 800-82 Rev. 3, IEC 62443-4-2, The Update Framework (TUF)

import type {
  SignedUpdateManifest,
  FleetGatewaySummary,
  FleetUserContext,
  EdgeUpdateState,
} from "./types";
import { fleetAuditManager } from "./fleet-audit";
import { fleetRbacEngine } from "./fleet-rbac";
import { constantTimeEqual, hmacSha256Hex } from "../security/isomorphic-crypto";

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

export class SignedUpdateManager {
  private campaigns: Map<string, UpdateCampaign> = new Map();
  private signingSecret: string;

  constructor(signingSecret?: string) {
    this.signingSecret =
      signingSecret ??
      (typeof process !== "undefined" && process.env
        ? (process.env["ELETRICAI_RELEASE_SIGNING_SECRET"] ?? "")
        : "");
  }

  private buildCanonicalSigningPayload(
    manifestData: Pick<
      SignedUpdateManifest,
      "packageId" | "targetVersion" | "targetArch" | "sha256"
    >,
  ): string {
    return `${manifestData.packageId}:${manifestData.targetVersion}:${manifestData.targetArch}:${manifestData.sha256.toLowerCase()}`;
  }

  /**
   * Generates a valid cryptographic HMAC-SHA256 signature for a release manifest.
   * Requires an explicit signing secret (never falls back to a hardcoded private key).
   */
  public signReleaseManifest(
    manifestData: Omit<SignedUpdateManifest, "signature">,
    signingSecret?: string,
  ): string {
    const key = signingSecret || this.signingSecret;
    if (!key) {
      throw new Error(
        "SIGNING_SECRET_UNCONFIGURED: Segredo de assinatura de release não configurado no servidor.",
      );
    }
    return hmacSha256Hex(key, this.buildCanonicalSigningPayload(manifestData));
  }

  /**
   * Verifies the authenticity, checksum, and HMAC-SHA256 signature of a release manifest.
   * Fails closed if no verification key is configured or if the signature does not match.
   */
  public verifyManifestSignature(
    manifest: SignedUpdateManifest,
    verificationSecret?: string,
  ): boolean {
    if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) return false;
    if (!manifest.signature || !/^[a-f0-9]{64}$/i.test(manifest.signature)) return false;
    const key = verificationSecret || this.signingSecret;
    if (!key) return false;
    const expected = hmacSha256Hex(key, this.buildCanonicalSigningPayload(manifest));
    return constantTimeEqual(manifest.signature.toLowerCase(), expected.toLowerCase());
  }

  /**
   * Initiates a staged update campaign for a specific plant.
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
      gatewayId: "all_in_plant",
    });

    if (!this.verifyManifestSignature(manifest)) {
      throw new Error(
        "INVALID_MANIFEST_SIGNATURE: Assinatura digital do pacote de atualização inválida ou corrompida.",
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

    fleetAuditManager.recordEvent({
      actor: { id: user.userId, email: user.email, role: user.role },
      source: "ADMIN_CONSOLE",
      gatewayId: "fleet_campaign",
      plantId: targetPlantId,
      organizationId,
      eventType: "UPDATE_CAMPAIGN_STARTED",
      severity: "INFO",
      result: "SUCCESS",
      details: {
        campaignId,
        targetVersion: manifest.targetVersion,
        targetArch: manifest.targetArch,
      },
    });

    return campaign;
  }

  /**
   * Applies an update to a specific gateway with architecture verification and post-update health check.
   * If health check fails, executes automated rollback immediately.
   */
  public executeGatewayUpdate(
    campaignId: string,
    gateway: FleetGatewaySummary,
    healthCheckSimulator: () => boolean,
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

    // 1. Architecture Compatibility Check
    if (campaign.manifest.targetArch !== gateway.hardwareArch) {
      const err = `ARCH_INCOMPATIBLE: Pacote compilado para ${campaign.manifest.targetArch}, mas o gateway opera em ${gateway.hardwareArch}.`;
      campaign.gateways.push({
        gatewayId: gateway.gatewayId,
        state: "UPDATE_FAILED",
        activeVersion: gateway.softwareVersion,
        error: err,
      });

      fleetAuditManager.recordEvent({
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

    // 2. Staged Installation & Post-Update Health Check
    const isHealthy = healthCheckSimulator();

    if (!isHealthy) {
      // Automatic Rollback
      campaign.gateways.push({
        gatewayId: gateway.gatewayId,
        state: "ROLLED_BACK",
        activeVersion: previousVersion,
        error:
          "HEALTH_CHECK_FAILED: Falha na validação pós-instalação. Rollback executado com sucesso.",
      });

      fleetAuditManager.recordEvent({
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

    // 3. Healthy Commit
    const newVersion = campaign.manifest.targetVersion;
    campaign.gateways.push({
      gatewayId: gateway.gatewayId,
      state: "UP_TO_DATE",
      activeVersion: newVersion,
    });

    fleetAuditManager.recordEvent({
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
   * Aborts an active update campaign, preventing any subsequent gateways from receiving updates.
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

    campaign.status = "ABORTED";
    campaign.completedAt = Date.now();

    fleetAuditManager.recordEvent({
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
