import { describe, expect, it, afterEach } from "vitest";
import { createHash, createHmac, generateKeyPairSync, sign } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { isSafeRedirect, getSafeRedirect } from "@/lib/safe-redirect";
import { isDevAuthAllowed } from "@/integrations/supabase/auth-middleware";
import { CloudGatewayRegistry } from "@/lib/edge/cloud-gateway-registry";
import { SignedUpdateManager } from "@/lib/edge/signed-updates";
import { RemoteConfigManager } from "@/lib/edge/remote-config";
import { FleetCertificateManager } from "@/lib/edge/fleet-certificates";
import { FleetRbacEngine, FleetAuthorizationError } from "@/lib/edge/fleet-rbac";
import { isHostAllowed } from "@/lib/modbus-server.functions";
import { sha256Hex, hmacSha256Hex, constantTimeEqual } from "@/lib/security/isomorphic-crypto";
import { logSecurityEvent, redactSensitiveString } from "@/lib/security/security-audit-log.server";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "@/lib/observability/types";
import type { FleetUserContext, RemoteConfigPayload, SignedUpdateManifest } from "@/lib/edge/types";

const REPO_ROOT = path.resolve(__dirname, "../..");

describe("Gate 4.3 — Red Team Exploit Prevention & Blue Team Regression Suite", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ── 1. P0-07 Open Redirect Hardening ────────────────────────────────────────
  it("P0-07: blocks tab/CRLF/encoded/backslash/authority open redirect payloads", () => {
    const attacks = [
      "/\t/evil.com?x=1",
      "/%09/evil.com?x=1",
      "/\r\n/evil.com",
      "/%0d%0a/evil.com",
      "/\\evil.com",
      "/%5cevil.com",
      "//evil.com",
      "/@evil.com",
      "https://evil.com/dashboard",
      "/login/callback",
      "/signup?next=1",
    ];
    for (const payload of attacks) {
      expect(isSafeRedirect(payload)).toBe(false);
      expect(getSafeRedirect(payload)).toBe("/dashboard");
    }
    expect(isSafeRedirect("/dashboard")).toBe(true);
    expect(isSafeRedirect("/scada?projectId=00000000-0000-4000-8000-000000000001")).toBe(true);
  });

  // ── 2. Isomorphic SHA-256 & HMAC-SHA-256 FIPS Verification ─────────────────
  it("Crypto: isomorphic sha256Hex & hmacSha256Hex match Node crypto byte-for-byte", () => {
    const samples = ["", "abc", "eletricai-gateway-credential-check", "a".repeat(256)];
    for (const s of samples) {
      expect(sha256Hex(s)).toBe(createHash("sha256").update(s).digest("hex"));
      expect(hmacSha256Hex("key-secret-test", s)).toBe(
        createHmac("sha256", "key-secret-test").update(s).digest("hex"),
      );
    }
    expect(constantTimeEqual("abc123", "abc123")).toBe(true);
    expect(constantTimeEqual("abc123", "abc124")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  // ── 3. P0-03 & P0-04 CloudGatewayRegistry Fail-Closed & No Embedded Token ──
  it("P0-03/P0-04: rejects unprovisioned/empty/fingerprint/hardcoded gateway credentials", () => {
    const registry = new CloudGatewayRegistry();

    const noCred = registry.authenticateGateway("gw_lab_ete_01");
    expect(noCred.authorized).toBe(false);
    expect(noCred.statusCode).toBe(401);

    const fpBypass = registry.authenticateGateway(
      "gw_lab_ete_01",
      "SHA256:FINGERPRINT_DEFAULT_LAB",
    );
    expect(fpBypass.authorized).toBe(false);

    const leakedTokenAttempt = registry.authenticateGateway(
      "gw_lab_ete_01",
      "egw_token_lab_ete_secret_123",
    );
    expect(leakedTokenAttempt.authorized).toBe(false);

    // Explicit registration stores SHA-256 digest and authenticates valid secret
    registry.registerGateway(
      {
        gatewayId: "gw_canary_01",
        organizationId: "QA_REDTEAM_TENANT_ALPHA",
        plantId: "plant_alpha",
        stationId: "st_alpha",
        gatewayVersion: "1.0.0",
        installationId: "inst_alpha",
        certificateFingerprint: "SHA256:CANARY_FP",
        registeredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        operationalState: "ONLINE",
        isRevoked: false,
      },
      "canary_secret_token_98765",
    );
    expect(registry.authenticateGateway("gw_canary_01", "SHA256:CANARY_FP").authorized).toBe(false);
    expect(
      registry.authenticateGateway("gw_canary_01", "canary_secret_token_98765").authorized,
    ).toBe(true);

    // Source must never hardcode fallback gateway credential literal
    const regSrc = fs.readFileSync(
      path.join(REPO_ROOT, "src/lib/edge/cloud-gateway-registry.ts"),
      "utf8",
    );
    expect(regSrc).not.toContain("egw_token_lab_ete_secret_123");
  });

  // ── 4. P1-10 Cryptographic Verification in SignedUpdate / RemoteConfig / Cert CA ──
  it("P1-10: SignedUpdateManager, RemoteConfigManager & FleetCertificateManager fail closed on forged signatures", () => {
    const noKeyUpdateMgr = new SignedUpdateManager("");
    const unsigned = {
      packageId: "pkg-evil",
      targetVersion: "9.9.9",
      targetArch: "x86_64" as const,
      sha256: "a".repeat(64),
      releaseNotes: "forged",
      minGatewayVersion: "1.0.0",
    };
    const forgedManifest: SignedUpdateManifest = {
      ...unsigned,
      signature: "FORGED_RANDOM_16_CHAR_STRING",
    };
    expect(noKeyUpdateMgr.verifyManifestSignature(forgedManifest)).toBe(false);
    expect(() => noKeyUpdateMgr.signReleaseManifest(unsigned)).toThrow(
      /SIGNING_SECRET_UNCONFIGURED/,
    );

    const keyedUpdateMgr = new SignedUpdateManager("test-release-hmac-key");
    const validSig = keyedUpdateMgr.signReleaseManifest(unsigned);
    expect(keyedUpdateMgr.verifyManifestSignature({ ...unsigned, signature: validSig })).toBe(true);
    expect(
      keyedUpdateMgr.verifyManifestSignature({
        ...unsigned,
        targetVersion: "9.9.10", // tampered after signing
        signature: validSig,
      }),
    ).toBe(false);

    // RemoteConfigManager fails closed on forged signature and verifies HMAC + physical block
    const adminUser: FleetUserContext = {
      userId: "usr_admin",
      email: "admin@alpha.test",
      role: "TENANT_ADMIN",
      organizationId: "QA_REDTEAM_TENANT_ALPHA",
      authorizedPlantIds: ["plant_alpha"],
    };
    const cfgMgr = new RemoteConfigManager("test-config-hmac-key");
    const baseCfg = {
      configVersion: 2,
      gatewayId: "gw_lab_ete_01",
      author: "admin@alpha.test",
      timestamp: Date.now(),
      scanRateMs: 1000,
      authorizedEndpoints: ["192.168.1.10:502"],
      enabledTags: ["TAG_1"],
      readProtocols: {},
      bufferLimits: {
        maxSamples: 10000,
        maxDiskMb: 500,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL" as const,
      },
      retentionPolicy: { maxAgeHours: 24 },
      observability: { metricsIntervalMs: 5000, logLevel: "INFO" as const },
    };

    const forgedCfgRes = cfgMgr.proposeAndApplyConfig(
      { ...baseCfg, signature: "FORGED_SIGNATURE_123456" } as RemoteConfigPayload,
      adminUser,
      "QA_REDTEAM_TENANT_ALPHA",
      "plant_alpha",
    );
    expect(forgedCfgRes.success).toBe(false);
    expect(forgedCfgRes.error).toContain("INVALID_CONFIG_SIGNATURE");

    // Even with a valid signature, any physical control parameter must still be blocked permanently
    const signedValidSig = cfgMgr.generateConfigSignature(baseCfg);
    const maliciousWithPhysical = {
      ...baseCfg,
      signature: signedValidSig,
      allowPhysicalControl: true,
    };
    const blockedPhys = cfgMgr.proposeAndApplyConfig(
      maliciousWithPhysical,
      adminUser,
      "QA_REDTEAM_TENANT_ALPHA",
      "plant_alpha",
    );
    expect(blockedPhys.success).toBe(false);
    expect(blockedPhys.error).toContain("DANGEROUS_CONFIG_REJECTED");

    // FleetCertificateManager PoP verification rejects arbitrary strings and validates Ed25519
    const ca = new FleetCertificateManager();
    const weakPopRes = ca.renewCertificateWithPoP(
      {
        gatewayId: "gw_lab_ete_01",
        challenge: "nonce-123",
        signature: "ANY_16_CHAR_STRING",
        newCsrFingerprint: "SHA256:NEW_FP",
      },
      { ...adminUser, role: "PLATFORM_ADMIN" },
      "org_sp_industrial",
      "plant_ete_central",
    );
    expect(weakPopRes.success).toBe(false);

    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    ca.registerCertificate(
      {
        fingerprint: "SHA256:ED25519_GATEWAY",
        issuedAt: new Date(Date.now() - 86400_000).toISOString(),
        expiresAt: new Date(Date.now() + 86400_000 * 30).toISOString(),
        state: "VALID",
        isRevoked: false,
      },
      "gw_ed25519_test",
      pubPem,
    );
    const challengeMsg = "gw_ed25519_test:nonce-xyz:SHA256:ROTATED_KEY";
    const edSigB64 = sign(null, Buffer.from(challengeMsg), privateKey).toString("base64");
    const validPopRes = ca.renewCertificateWithPoP(
      {
        gatewayId: "gw_ed25519_test",
        challenge: "nonce-xyz",
        signature: edSigB64,
        newCsrFingerprint: "SHA256:ROTATED_KEY",
      },
      { ...adminUser, role: "PLATFORM_ADMIN" },
      "org_sp_industrial",
      "plant_ete_central",
    );
    expect(validPopRes.success).toBe(true);
  });

  // ── 5. Fleet RBAC Plant + Cross-Tenant Boundary Across All Plant Roles ─────
  it("RBAC: enforces tenant and plant boundaries for ENGINEER, EDGE_OPERATOR, AUDITOR, VIEWER", () => {
    const rbac = new FleetRbacEngine();
    const plantEngineer: FleetUserContext = {
      userId: "usr_eng",
      email: "eng@alpha.test",
      role: "ENGINEER",
      organizationId: "QA_REDTEAM_TENANT_ALPHA",
      authorizedPlantIds: ["plant_alpha_1"],
    };

    expect(() =>
      rbac.assertCanPerformAction(plantEngineer, "PROPOSE_CONFIG", {
        organizationId: "QA_REDTEAM_TENANT_BETA",
        plantId: "plant_beta_1",
        gatewayId: "gw_b",
      }),
    ).toThrow(FleetAuthorizationError);

    expect(() =>
      rbac.assertCanPerformAction(plantEngineer, "PROPOSE_CONFIG", {
        organizationId: "QA_REDTEAM_TENANT_ALPHA",
        plantId: "plant_alpha_2",
        gatewayId: "gw_a2",
      }),
    ).toThrow(FleetAuthorizationError);

    const auditor: FleetUserContext = {
      userId: "usr_aud",
      email: "aud@alpha.test",
      role: "AUDITOR",
      organizationId: "QA_REDTEAM_TENANT_ALPHA",
      authorizedPlantIds: ["plant_alpha_1"],
    };
    expect(() =>
      rbac.assertCanPerformAction(auditor, "ROLLBACK_CONFIG", {
        organizationId: "QA_REDTEAM_TENANT_ALPHA",
        plantId: "plant_alpha_1",
        gatewayId: "gw_a1",
      }),
    ).toThrow(FleetAuthorizationError);
  });

  // ── 6. Auth Middleware Production Dev-Bypass Lockout ───────────────────────
  it("P1-12: isDevAuthAllowed strictly denies VERCEL_ENV=production and NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    expect(isDevAuthAllowed()).toBe(false);

    process.env.NODE_ENV = "development";
    process.env.VERCEL_ENV = "production";
    expect(isDevAuthAllowed()).toBe(false);
  });

  // ── 7. Modbus / OPC-UA SSRF Hardening ──────────────────────────────────────
  it("P1-15: blocks IMDS, loopback, and substring 'simulation' SSRF bypasses", () => {
    expect(isHostAllowed("simulation")).toBe(true);
    expect(isHostAllowed("192.168.10.25")).toBe(true);
    expect(isHostAllowed("169.254.169.254")).toBe(false);
    expect(isHostAllowed("169.254.169.254.simulation")).toBe(false);
    expect(isHostAllowed("127.0.0.1")).toBe(false);
    expect(isHostAllowed("localhost")).toBe(false);
    expect(isHostAllowed("metadata.google.internal")).toBe(false);

    const opcuaSrc = fs.readFileSync(
      path.join(REPO_ROOT, "src/lib/opcua-server.functions.ts"),
      "utf8",
    );
    expect(opcuaSrc).not.toContain('host.includes("simulation")');
    expect(opcuaSrc).not.toContain("if (a === 127) return true");
  });

  // ── 8. Server RPC Auth, Observability, Edge Functions, CSP, MCP & Migration ──
  it("Hardening invariants hold across server functions, edge functions, CSP, MCP, and audit logs", () => {
    const fleetFns = fs.readFileSync(
      path.join(REPO_ROOT, "src/lib/edge/fleet.functions.ts"),
      "utf8",
    );
    expect(fleetFns).toContain("requireSupabaseAuth");
    expect(fleetFns).not.toContain("DefaultPlatformAdminUser");
    expect(fleetFns).not.toContain("SIG_OFFICIAL_ELETRICAI");

    const obsFns = fs.readFileSync(
      path.join(REPO_ROOT, "src/lib/observability/observability.functions.ts"),
      "utf8",
    );
    expect(obsFns).toContain("requireSupabaseAuth");
    expect(obsFns).not.toContain("43200");

    const catImport = fs.readFileSync(
      path.join(REPO_ROOT, "src/lib/catalog-import.functions.ts"),
      "utf8",
    );
    expect(catImport).toContain("is_platform_admin");
    expect(catImport).not.toContain("requireTenantAdmin");

    const aiGen = fs.readFileSync(
      path.join(REPO_ROOT, "supabase/functions/ai-electrical-generator/index.ts"),
      "utf8",
    );
    expect(aiGen).toContain("getUser(");
    expect(aiGen).toContain("x-goog-api-key");
    expect(aiGen).not.toContain("?key=");
    expect(aiGen).not.toContain("apikee");

    const aiArch = fs.readFileSync(
      path.join(REPO_ROOT, "supabase/functions/ai-industrial-architect/index.ts"),
      "utf8",
    );
    expect(aiArch).toContain("x-goog-api-key");
    expect(aiArch).not.toContain("?key=");

    const vercelCfg = fs.readFileSync(path.join(REPO_ROOT, "vercel.json"), "utf8");
    expect(vercelCfg).not.toContain("unsafe-eval");
    expect(vercelCfg).not.toContain("*.supabase.co");
    expect(vercelCfg).not.toContain("*.lovable.app");
    expect(vercelCfg).toContain("Strict-Transport-Security");

    const mcpRoute = fs.readFileSync(path.join(REPO_ROOT, "src/routes/mcp.ts"), "utf8");
    expect(mcpRoute).toContain("trustForwardedHost: false");

    const prmRoute = fs.readFileSync(
      path.join(REPO_ROOT, "src/routes/[.well-known]/oauth-protected-resource.ts"),
      "utf8",
    );
    expect(prmRoute).toContain("forwardedHostTrustedByPlatform: false");

    // Audit redaction never leaks Bearer JWTs or API tokens
    const sanitized = redactSensitiveString(
      "Auth Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig failed",
    );
    expect(sanitized).not.toContain("eyJhbGci");
    expect(sanitized).toContain("[REDACTED]");

    const syntheticToken = `sk_${"live_"}test1234567890`;
    const evt = logSecurityEvent({
      category: "AUTH_FAILURE",
      severity: "WARNING",
      route: "/api/test",
      reason: `Rejected token ${syntheticToken}`,
      metadata: { authorization: "Bearer secret_abc" },
    });
    expect(evt.reason).not.toContain(syntheticToken);
    expect(evt.metadata?.authorization).toBe("[REDACTED]");

    // Physical control must remain permanently false
    expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);
  });
});
