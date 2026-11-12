// ELÉTRICAI INDUSTRIAL OS — EDGE CERTIFICATES & IDENTITY LIFECYCLE ENGINE
// Standards: RFC 5280 (X.509), RFC 8446 (TLS 1.3), IEC 62443-4-2

import {
  createHash,
  createHmac,
  timingSafeEqual,
  verify as verifyCryptoSignature,
} from "node:crypto";
import type { EdgeCertificateRecord, FleetStorageBackend, FleetUserContext } from "./types";
import { fleetAuditManager, type FleetAuditManager } from "./fleet-audit";
import { fleetRbacEngine } from "./fleet-rbac";
import { cloudGatewayRegistry, type CloudGatewayRegistry } from "./cloud-gateway-registry";

export interface RenewalProofOfPossession {
  gatewayId: string;
  challenge: string;
  signature: string; // Signature of challenge produced by gateway's local private key
  newCsrFingerprint: string;
}

export class FleetCertificateManager {
  private certificates: Map<string, EdgeCertificateRecord> = new Map();
  private gatewayPopKeys: Map<string, string> = new Map();
  private consumedChallenges: Set<string> = new Set();
  private store?: FleetStorageBackend;
  private auditManager: FleetAuditManager;
  private registry: CloudGatewayRegistry;

  constructor(options?: {
    store?: FleetStorageBackend;
    auditManager?: FleetAuditManager;
    registry?: CloudGatewayRegistry;
  }) {
    this.auditManager = options?.auditManager ?? fleetAuditManager;
    this.registry = options?.registry ?? cloudGatewayRegistry;
    this.seedDefaultCertificates();
    if (options?.store) {
      this.attachStorageBackend(options.store);
    }
  }

  public attachStorageBackend(store: FleetStorageBackend): void {
    this.store = store;
    const persisted = store.loadCertificates();
    if (persisted.length > 0) {
      for (const item of persisted) {
        this.certificates.set(item.gatewayId, item.cert);
        if (item.popKey) {
          this.gatewayPopKeys.set(item.gatewayId, item.popKey);
        }
      }
      return;
    }

    for (const [gwId, cert] of this.certificates.entries()) {
      store.saveCertificate(gwId, cert, this.gatewayPopKeys.get(gwId));
    }
  }

  private seedDefaultCertificates(): void {
    const now = Date.now();
    const oneYear = 365 * 24 * 3600 * 1000;
    this.registerCertificate(
      {
        fingerprint: "SHA256:FINGERPRINT_DEFAULT_LAB",
        issuedAt: new Date(now - 30 * 24 * 3600 * 1000).toISOString(),
        expiresAt: new Date(now + oneYear).toISOString(),
        state: "VALID",
        isRevoked: false,
      },
      "gw_lab_ete_01",
    );
  }

  public registerCertificate(
    cert: EdgeCertificateRecord,
    gatewayId: string,
    publicKeyOrPopSecret?: string,
  ): void {
    const record = { ...cert };
    this.certificates.set(gatewayId, record);
    let popKey = this.gatewayPopKeys.get(gatewayId);
    if (publicKeyOrPopSecret && publicKeyOrPopSecret.trim().length > 0) {
      popKey = publicKeyOrPopSecret.trim();
      this.gatewayPopKeys.set(gatewayId, popKey);
    }
    this.store?.saveCertificate(gatewayId, record, popKey);
  }

  private refreshCertificateFromStore(gatewayId: string): EdgeCertificateRecord | undefined {
    if (!this.store) return this.certificates.get(gatewayId);
    const persisted = this.store.loadCertificates();
    for (const item of persisted) {
      this.certificates.set(item.gatewayId, item.cert);
      if (item.popKey) {
        this.gatewayPopKeys.set(item.gatewayId, item.popKey);
      }
    }
    return this.certificates.get(gatewayId);
  }

  public getCertificate(gatewayId: string): EdgeCertificateRecord | undefined {
    const cert = this.store
      ? this.refreshCertificateFromStore(gatewayId)
      : this.certificates.get(gatewayId);
    if (!cert) return undefined;

    // Dynamically evaluate status based on current time
    const updated = this.evaluateCertificateState(cert);
    this.certificates.set(gatewayId, updated);
    return updated;
  }

  public evaluateCertificateState(cert: EdgeCertificateRecord): EdgeCertificateRecord {
    if (cert.isRevoked) {
      return { ...cert, state: "REVOKED" };
    }

    const now = Date.now();
    const expiryTime = new Date(cert.expiresAt).getTime();
    const thirtyDaysMs = 30 * 24 * 3600 * 1000;

    if (now >= expiryTime) {
      return { ...cert, state: "EXPIRED" };
    }

    if (expiryTime - now <= thirtyDaysMs) {
      return { ...cert, state: "EXPIRING_SOON" };
    }

    return { ...cert, state: "VALID" };
  }

  /**
   * Processes a Proof-of-Possession (PoP) Certificate Renewal Request.
   * Guarantees: Private key NEVER leaves the local Edge Gateway.
   */
  public renewCertificateWithPoP(
    pop: RenewalProofOfPossession,
    user: FleetUserContext,
    targetOrgId: string,
    targetPlantId: string,
  ): { success: boolean; newCertificate?: EdgeCertificateRecord; error?: string } {
    fleetRbacEngine.assertCanPerformAction(user, "REQUEST_CERT_RENEWAL", {
      organizationId: targetOrgId,
      plantId: targetPlantId,
      gatewayId: pop.gatewayId,
    });

    const existingCert = this.store
      ? this.refreshCertificateFromStore(pop.gatewayId)
      : this.certificates.get(pop.gatewayId);
    if (!existingCert) {
      return { success: false, error: "CERT_NOT_FOUND: Certificado do gateway não localizado." };
    }

    if (existingCert.isRevoked) {
      return {
        success: false,
        error: "CERT_REVOKED: Não é permitido renovar certificado de gateway revogado.",
      };
    }

    // Fail-closed cryptographic PoP verification: requires a registered public key (SPKI PEM) or HMAC PoP secret.
    const registeredKey = this.gatewayPopKeys.get(pop.gatewayId);
    if (!pop.challenge || !pop.signature || !registeredKey) {
      return {
        success: false,
        error:
          "INVALID_POP_SIGNATURE: Prova de posse criptográfica ausente ou chave do gateway não provisionada.",
      };
    }

    const canonicalChallenge = `${pop.gatewayId}:${pop.challenge}:${pop.newCsrFingerprint}`;
    let signatureValid = false;
    try {
      if (registeredKey.includes("BEGIN PUBLIC KEY")) {
        const sigBuf = Buffer.from(pop.signature, "base64");
        signatureValid =
          sigBuf.length > 0 &&
          (verifyCryptoSignature(null, Buffer.from(canonicalChallenge), registeredKey, sigBuf) ||
            verifyCryptoSignature(
              "sha256",
              Buffer.from(canonicalChallenge),
              registeredKey,
              sigBuf,
            ));
      } else if (/^[a-f0-9]{64}$/i.test(pop.signature)) {
        const expectedHex = createHmac("sha256", registeredKey)
          .update(canonicalChallenge)
          .digest("hex");
        signatureValid = timingSafeEqual(
          Buffer.from(pop.signature.toLowerCase(), "hex"),
          Buffer.from(expectedHex.toLowerCase(), "hex"),
        );
      }
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      return {
        success: false,
        error: "INVALID_POP_SIGNATURE: Prova de posse criptográfica inválida.",
      };
    }

    // Anti-replay challenge validation AFTER cryptographic verification
    const challengeKey = `${pop.gatewayId}:${pop.challenge}`;
    if (this.store) {
      if (!this.store.consumeChallengeOnce(pop.gatewayId, pop.challenge)) {
        return {
          success: false,
          error: "CHALLENGE_REPLAYED: Desafio Proof-of-Possession já foi consumido anteriormente.",
        };
      }
    } else if (this.consumedChallenges.has(challengeKey)) {
      return {
        success: false,
        error: "CHALLENGE_REPLAYED: Desafio Proof-of-Possession já foi consumido anteriormente.",
      };
    }
    this.consumedChallenges.add(challengeKey);

    const now = Date.now();
    const oneYearMs = 365 * 24 * 3600 * 1000;
    const newFingerprint = pop.newCsrFingerprint.startsWith("SHA256:")
      ? pop.newCsrFingerprint
      : `SHA256:${createHash("sha256").update(pop.newCsrFingerprint).digest("hex").toUpperCase()}`;

    const renewedCert: EdgeCertificateRecord = {
      fingerprint: newFingerprint,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + oneYearMs).toISOString(),
      state: "VALID",
      isRevoked: false,
      renewalRequested: false,
    };

    this.certificates.set(pop.gatewayId, renewedCert);
    this.store?.saveCertificate(pop.gatewayId, renewedCert, registeredKey);

    this.auditManager.recordEvent({
      actor: { id: user.userId, email: user.email, role: user.role },
      source: "CLOUD_SERVER",
      gatewayId: pop.gatewayId,
      plantId: targetPlantId,
      organizationId: targetOrgId,
      eventType: "CERTIFICATE_RENEWED",
      severity: "INFO",
      result: "SUCCESS",
      details: {
        previousFingerprint: existingCert.fingerprint,
        newFingerprint: renewedCert.fingerprint,
        expiresAt: renewedCert.expiresAt,
      },
    });

    return { success: true, newCertificate: renewedCert };
  }

  /**
   * Revokes a gateway certificate administratively, preventing any future ingest.
   */
  public revokeCertificate(
    gatewayId: string,
    reason: string,
    user: FleetUserContext,
    targetOrgId: string,
    targetPlantId: string,
  ): boolean {
    fleetRbacEngine.assertCanPerformAction(user, "REVOKE_CERTIFICATE", {
      organizationId: targetOrgId,
      plantId: targetPlantId,
      gatewayId,
    });

    const cert = this.store
      ? this.refreshCertificateFromStore(gatewayId)
      : this.certificates.get(gatewayId);
    if (!cert) return false;

    cert.isRevoked = true;
    cert.revokedReason = reason;
    cert.state = "REVOKED";
    this.certificates.set(gatewayId, cert);
    this.store?.saveCertificate(gatewayId, cert, this.gatewayPopKeys.get(gatewayId));

    // Notify Cloud Ingestion Engine registry to block immediately with 403 Forbidden
    this.registry.revokeGateway(gatewayId, reason);

    this.auditManager.recordEvent({
      actor: { id: user.userId, email: user.email, role: user.role },
      source: "ADMIN_CONSOLE",
      gatewayId,
      plantId: targetPlantId,
      organizationId: targetOrgId,
      eventType: "CERTIFICATE_REVOKED",
      severity: "CRITICAL",
      result: "SUCCESS",
      details: {
        reason,
        revokedFingerprint: cert.fingerprint,
      },
    });

    return true;
  }
}

export const fleetCertificateManager = new FleetCertificateManager();
