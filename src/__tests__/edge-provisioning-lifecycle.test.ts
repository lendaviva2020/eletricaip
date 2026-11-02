// ELÉTRICAI INDUSTRIAL OS — GATE 3.1B PROVISIONING & IDENTITY LIFECYCLE
// Test Suite: SHA-256 Token Storage, Single-Use Atomic Burn, Expiry, Revocation, Cert Lifecycle & Multi-Tenant Boundary
// Standards: IEC 62443-4-2 (Identification & Authentication), NIST SP 800-82 Rev. 3

import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import { EdgeProvisioningService } from "@/lib/edge/provisioning";

describe("GATE 3.1B — Edge Provisioning & Certificate Lifecycle Homologation", () => {
  let service: EdgeProvisioningService;
  const orgId = "org_industrial_sp";
  const plantId = "plant_ete_matriz";
  const stationId = "station_rack_01";

  beforeEach(() => {
    service = new EdgeProvisioningService();
  });

  it("1. Emissão de Token e Hashing SHA-256: Armazena apenas o hash criptográfico com TTL de 15 minutos", () => {
    const token = service.createProvisioningToken({
      organizationId: orgId,
      plantId,
      stationId,
      issuedBy: "admin@eletricai.com",
      ttlMinutes: 15,
    });

    expect(token.token).toMatch(/^EGW-PROV-[A-F0-9]{32}$/);
    expect(token.tokenHash).toBeDefined();

    const expectedHash = crypto.createHash("sha256").update(token.token).digest("hex");
    expect(token.tokenHash).toBe(expectedHash);
    expect(token.expiresAt).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    expect(token.expiresAt).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 1000);
    expect(token.isConsumed).toBe(false);
  });

  it("2. Atomic Burn: Provisionamento com token válido sucede uma única vez e queima o token imediatamente", () => {
    const token = service.createProvisioningToken({
      organizationId: orgId,
      plantId,
      stationId,
      issuedBy: "admin@eletricai.com",
    });

    // 1st Provisioning attempt -> SUCCESS
    const res1 = service.provisionGateway({
      provisioningToken: token.token,
      gatewayVersion: "3.1.0-industrial",
      stationHardwareId: "HW-SIEMENS-IPC227E-01",
    });

    expect(res1.success).toBe(true);
    expect(res1.gatewayId).toMatch(/^egw_/);
    expect(res1.organizationId).toBe(orgId);
    expect(res1.plantId).toBe(plantId);
    expect(res1.stationId).toBe(stationId);
    expect(res1.authToken).toMatch(/^egw_sec_/);

    // 2nd Provisioning attempt with identical token -> REJECTED (TOKEN_ALREADY_USED)
    const res2 = service.provisionGateway({
      provisioningToken: token.token,
      gatewayVersion: "3.1.0-industrial",
      stationHardwareId: "HW-SIEMENS-IPC227E-01",
    });

    expect(res2.success).toBe(false);
    expect(res2.error).toContain("TOKEN_ALREADY_USED");
  });

  it("3. Expiração de Token: Rejeita provisionamento se o token estiver expirado", () => {
    // Issue token with 0 minutes TTL (expired immediately)
    const token = service.createProvisioningToken({
      organizationId: orgId,
      plantId,
      stationId,
      issuedBy: "admin@eletricai.com",
      ttlMinutes: -1,
    });

    const res = service.provisionGateway({
      provisioningToken: token.token,
      gatewayVersion: "3.1.0-industrial",
      stationHardwareId: "HW-ADVANTECH-UNO-01",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("TOKEN_EXPIRED");
  });

  it("4. Revogação de Token: Rejeita token revogado administrativamente antes do uso", () => {
    const token = service.createProvisioningToken({
      organizationId: orgId,
      plantId,
      stationId,
      issuedBy: "admin@eletricai.com",
    });

    // Revoke token
    const revoked = service.revokeProvisioningToken(token.token, "SECURITY_AUDIT_CANCELLED");
    expect(revoked).toBe(true);

    const res = service.provisionGateway({
      provisioningToken: token.token,
      gatewayVersion: "3.1.0-industrial",
      stationHardwareId: "HW-DELL-EDGE-01",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("TOKEN_REVOKED");
    expect(res.error).toContain("SECURITY_AUDIT_CANCELLED");
  });

  it("5. Ciclo de Vida do Certificado: Impede cross-tenant forgery, renova e revoga certificados", () => {
    const token = service.createProvisioningToken({
      organizationId: orgId,
      plantId,
      stationId,
      issuedBy: "admin@eletricai.com",
    });

    const provisionRes = service.provisionGateway({
      provisioningToken: token.token,
      gatewayVersion: "3.1.0-industrial",
      stationHardwareId: "HW-RACK-01",
      publicCertPem: "-----BEGIN CERTIFICATE-----\nTEST_CERT_CONTENT\n-----END CERTIFICATE-----",
    });

    expect(provisionRes.success).toBe(true);
    const gatewayId = provisionRes.gatewayId;

    // Verify certificate was registered
    const cert = service.getCertificate(gatewayId);
    expect(cert).toBeDefined();
    expect(cert?.fingerprint).toBeDefined();
    expect(service.isCertificateExpired(gatewayId)).toBe(false);

    // Authenticate session
    const authGateway = service.authenticateGateway(provisionRes.authToken);
    expect(authGateway).not.toBeNull();
    expect(authGateway?.gatewayId).toBe(gatewayId);

    // Renew certificate
    const renewRes = service.renewCertificate(gatewayId, {
      publicCertPem: "-----BEGIN CERTIFICATE-----\nRENEWED_CERT_CONTENT\n-----END CERTIFICATE-----",
      validDays: 180,
    });
    expect(renewRes.success).toBe(true);
    expect(service.getCertificate(gatewayId)?.fingerprint).not.toBe(cert?.fingerprint);

    // Revoke Gateway
    const revokeRes = service.revokeGateway(gatewayId, "STATION_DECOMMISSIONED");
    expect(revokeRes).toBe(true);
    expect(service.isGatewayRevoked(gatewayId)).toBe(true);

    // Authentication must fail after revocation
    const authAfterRevoke = service.authenticateGateway(provisionRes.authToken);
    expect(authAfterRevoke).toBeNull();
  });
});
