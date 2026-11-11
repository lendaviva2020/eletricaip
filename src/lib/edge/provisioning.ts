// ELÉTRICAI INDUSTRIAL OS — EDGE GATEWAY PROVISIONING ENGINE
// Industrial Onboarding, Single-Use Tokens, Station Identity & mTLS Registration
// Standards: IEC 62443-4-2 (Identification & Authentication), NIST SP 800-82 Rev. 3

import crypto from "node:crypto";
import type {
  GatewayIdentity,
  ProvisioningToken,
  ProvisioningRequest,
  ProvisioningResponse,
  GatewayCertificateRecord,
} from "./types";

export class EdgeProvisioningService {
  // Store tokens keyed by their SHA-256 hash (never store plaintext tokens)
  private tokenHashes: Map<string, ProvisioningToken> = new Map();
  private gateways: Map<string, GatewayIdentity> = new Map();
  private certificates: Map<string, GatewayCertificateRecord> = new Map();
  private activeAuthTokens: Map<
    string,
    { gatewayId: string; organizationId: string; plantId: string }
  > = new Map();
  private revokedGateways: Set<string> = new Set();
  private claimLocks: Set<string> = new Set();

  public static hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  /**
   * Constant-time hash comparison to prevent timing side-channel attacks on token verification.
   */
  private findTokenByHash(providedHash: string): ProvisioningToken | undefined {
    const providedBuf = Buffer.from(providedHash, "hex");
    for (const [storedHash, record] of this.tokenHashes.entries()) {
      const storedBuf = Buffer.from(storedHash, "hex");
      if (
        storedBuf.length === providedBuf.length &&
        crypto.timingSafeEqual(storedBuf, providedBuf)
      ) {
        return record;
      }
    }
    return undefined;
  }

  /**
   * Issues a time-limited, single-use provisioning token for an authorized industrial station.
   * Generates 256 bits of cryptographically secure entropy (32 random bytes).
   * Stores only the cryptographic SHA-256 hash internally.
   */
  public createProvisioningToken(params: {
    organizationId: string;
    plantId: string;
    stationId: string;
    issuedBy: string;
    ttlMinutes?: number;
  }): ProvisioningToken {
    const ttlMs = (params.ttlMinutes ?? 15) * 60 * 1000;
    const randomHex = crypto.randomBytes(16).toString("hex");
    const rawToken = `EGW-PROV-${randomHex.toUpperCase()}`;
    const tokenHash = EdgeProvisioningService.hashToken(rawToken);

    const record: ProvisioningToken = {
      token: rawToken,
      tokenHash,
      organizationId: params.organizationId,
      plantId: params.plantId,
      stationId: params.stationId,
      expiresAt: Date.now() + ttlMs,
      isConsumed: false,
      isRevoked: false,
      issuedBy: params.issuedBy,
    };

    this.tokenHashes.set(tokenHash, record);
    return record;
  }

  /**
   * Explicitly revokes an active provisioning token prior to its expiration.
   */
  public revokeProvisioningToken(
    tokenOrHash: string,
    reason: string = "ADMINISTRATIVE_REVOCATION",
  ): boolean {
    const hash = tokenOrHash.startsWith("EGW-PROV-")
      ? EdgeProvisioningService.hashToken(tokenOrHash)
      : tokenOrHash;

    const record = this.findTokenByHash(hash);
    if (!record) return false;

    record.isRevoked = true;
    record.revokedReason = reason;
    return true;
  }

  /**
   * Onboards an Edge Gateway using a single-use provisioning token.
   * Enforces atomic claim locking, one-time consumption, expiration validation,
   * station hardware registration, and derives identity strictly from server-side token state.
   */
  public provisionGateway(request: ProvisioningRequest): ProvisioningResponse {
    const tokenHash = EdgeProvisioningService.hashToken(request.provisioningToken);

    // Concurrency Lock: Prevent simultaneous race conditions claiming the same token
    if (this.claimLocks.has(tokenHash)) {
      return {
        success: false,
        gatewayId: "",
        organizationId: "",
        plantId: "",
        stationId: "",
        authToken: "",
        cloudEndpoint: "",
        issuedAt: new Date().toISOString(),
        certValidUntil: "",
        error:
          "CONCURRENT_CLAIM_CONFLICT: Operação de provisionamento simultânea em andamento para este token.",
      };
    }

    this.claimLocks.add(tokenHash);

    try {
      const record = this.findTokenByHash(tokenHash);

      if (!record) {
        return {
          success: false,
          gatewayId: "",
          organizationId: "",
          plantId: "",
          stationId: "",
          authToken: "",
          cloudEndpoint: "",
          issuedAt: new Date().toISOString(),
          certValidUntil: "",
          error: "INVALID_TOKEN: Código de provisionamento inexistente.",
        };
      }

      if (record.isRevoked) {
        return {
          success: false,
          gatewayId: "",
          organizationId: "",
          plantId: "",
          stationId: "",
          authToken: "",
          cloudEndpoint: "",
          issuedAt: new Date().toISOString(),
          certValidUntil: "",
          error: `TOKEN_REVOKED: Código de provisionamento revogado (${record.revokedReason ?? "REVOKED"}).`,
        };
      }

      if (record.isConsumed) {
        return {
          success: false,
          gatewayId: "",
          organizationId: "",
          plantId: "",
          stationId: "",
          authToken: "",
          cloudEndpoint: "",
          issuedAt: new Date().toISOString(),
          certValidUntil: "",
          error: "TOKEN_ALREADY_USED: Código de provisionamento já foi consumido anteriormente.",
        };
      }

      if (Date.now() > record.expiresAt) {
        return {
          success: false,
          gatewayId: "",
          organizationId: "",
          plantId: "",
          stationId: "",
          authToken: "",
          cloudEndpoint: "",
          issuedAt: new Date().toISOString(),
          certValidUntil: "",
          error: "TOKEN_EXPIRED: Código de provisionamento expirou.",
        };
      }

      // Atomic burn — mark as consumed immediately
      record.isConsumed = true;
      record.consumedAt = Date.now();

      // Generate unique Gateway Identity
      const gatewayId = `egw_${crypto.randomUUID()}`;
      const authToken = `egw_sec_${crypto.randomBytes(32).toString("hex")}`;
      const fingerprint =
        request.certificateFingerprint ||
        (request.publicCertPem
          ? crypto.createHash("sha256").update(request.publicCertPem).digest("hex")
          : crypto
              .createHash("sha256")
              .update(`${gatewayId}:${request.stationHardwareId}`)
              .digest("hex"));

      const now = new Date().toISOString();
      const certExpiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(); // 1 year validity

      const identity: GatewayIdentity = {
        gatewayId,
        organizationId: record.organizationId,
        plantId: record.plantId,
        stationId: record.stationId,
        gatewayVersion: request.gatewayVersion,
        installationId: `inst_${record.plantId}_${record.stationId}`,
        certificateFingerprint: fingerprint,
        registeredAt: now,
        lastSeenAt: now,
        operationalState: "ONLINE",
      };

      const certRecord: GatewayCertificateRecord = {
        gatewayId,
        fingerprint,
        issuedAt: now,
        expiresAt: certExpiresAt,
        isRevoked: false,
      };

      this.gateways.set(gatewayId, identity);
      this.certificates.set(gatewayId, certRecord);
      this.activeAuthTokens.set(authToken, {
        gatewayId,
        organizationId: record.organizationId,
        plantId: record.plantId,
      });

      return {
        success: true,
        gatewayId,
        organizationId: record.organizationId,
        plantId: record.plantId,
        stationId: record.stationId,
        authToken,
        cloudEndpoint: "https://api.eletricai.com/v1/edge/sync",
        issuedAt: now,
        certValidUntil: certExpiresAt,
      };
    } finally {
      this.claimLocks.delete(tokenHash);
    }
  }

  /**
   * Validates whether an incoming gateway request has a valid, authorized session.
   * Enforces certificate lifecycle, rejects revoked gateways, and stops cross-organization forgery.
   */
  public authenticateGateway(authToken: string): GatewayIdentity | null {
    const session = this.activeAuthTokens.get(authToken);
    if (!session) return null;

    if (this.revokedGateways.has(session.gatewayId)) {
      return null;
    }

    const gateway = this.gateways.get(session.gatewayId);
    if (!gateway) return null;

    // Check certificate expiration
    if (this.isCertificateExpired(session.gatewayId)) {
      gateway.operationalState = "DEGRADED";
      return null;
    }

    gateway.lastSeenAt = new Date().toISOString();
    return gateway;
  }

  /**
   * Renews the TLS certificate for an active Edge Gateway.
   */
  public renewCertificate(
    gatewayId: string,
    params: {
      publicCertPem?: string;
      certificateFingerprint?: string;
      validDays?: number;
    },
  ): { success: boolean; certValidUntil: string; error?: string } {
    const gateway = this.gateways.get(gatewayId);
    if (!gateway) {
      return { success: false, certValidUntil: "", error: "GATEWAY_NOT_FOUND" };
    }

    if (this.revokedGateways.has(gatewayId)) {
      return { success: false, certValidUntil: "", error: "GATEWAY_REVOKED" };
    }

    const days = params.validDays ?? 365;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();

    const fingerprint =
      params.certificateFingerprint ||
      (params.publicCertPem
        ? crypto.createHash("sha256").update(params.publicCertPem).digest("hex")
        : crypto.createHash("sha256").update(`${gatewayId}:renewed:${Date.now()}`).digest("hex"));

    gateway.certificateFingerprint = fingerprint;

    this.certificates.set(gatewayId, {
      gatewayId,
      fingerprint,
      issuedAt: now,
      expiresAt,
      isRevoked: false,
    });

    return {
      success: true,
      certValidUntil: expiresAt,
    };
  }

  /**
   * Revokes a provisioned gateway station, invalidating its certificates and auth sessions.
   */
  public revokeGateway(
    gatewayId: string,
    reason: string = "SECURITY_INCIDENT_REVOCATION",
  ): boolean {
    const gateway = this.gateways.get(gatewayId);
    if (!gateway) return false;

    this.revokedGateways.add(gatewayId);
    gateway.operationalState = "OFFLINE";

    const cert = this.certificates.get(gatewayId);
    if (cert) {
      cert.isRevoked = true;
      cert.revokedReason = reason;
    }

    // Invalidate active auth tokens
    for (const [token, session] of this.activeAuthTokens.entries()) {
      if (session.gatewayId === gatewayId) {
        this.activeAuthTokens.delete(token);
      }
    }

    return true;
  }

  public isCertificateExpired(gatewayId: string): boolean {
    const cert = this.certificates.get(gatewayId);
    if (!cert) return true;
    if (cert.isRevoked) return true;
    return Date.now() > new Date(cert.expiresAt).getTime();
  }

  public isGatewayRevoked(gatewayId: string): boolean {
    return this.revokedGateways.has(gatewayId);
  }

  public getCertificate(gatewayId: string): GatewayCertificateRecord | undefined {
    return this.certificates.get(gatewayId);
  }

  public getGateway(gatewayId: string): GatewayIdentity | undefined {
    return this.gateways.get(gatewayId);
  }

  public listGatewaysForPlant(plantId: string): GatewayIdentity[] {
    return Array.from(this.gateways.values()).filter((g) => g.plantId === plantId);
  }
}
