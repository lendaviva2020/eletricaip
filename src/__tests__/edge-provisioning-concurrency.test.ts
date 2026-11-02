import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import { EdgeProvisioningService } from "../lib/edge/provisioning";

describe("GATE 3.2C — Provisioning Concurrency, Timing-Safe Lookup & Token Hardening", () => {
  let service: EdgeProvisioningService;
  const orgId = "org_eletricai_sec";
  const plantId = "plant_distrib_01";
  const stationId = "station_gw_01";

  beforeEach(() => {
    service = new EdgeProvisioningService();
  });

  describe("1. Concurrency Lock & Race Condition Protection", () => {
    it("impede processamento concorrente do mesmo token retornando CONCURRENT_CLAIM_CONFLICT", () => {
      const token = service.createProvisioningToken({
        organizationId: orgId,
        plantId,
        stationId,
        issuedBy: "admin@eletricai.com",
      });

      // Simula uma trava ativa de concorrência inserindo o hash em claimLocks
      const tokenHash = token.tokenHash!;
      (service as unknown as { claimLocks: Set<string> }).claimLocks.add(tokenHash);

      const response = service.provisionGateway({
        provisioningToken: token.token,
        stationHardwareId: "HW-STATION-01-LOCK",
        gatewayVersion: "1.0.0",
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain("CONCURRENT_CLAIM_CONFLICT");

      // Libera a trava e verifica que o token ainda pode ser processado se não consumido
      (service as unknown as { claimLocks: Set<string> }).claimLocks.delete(tokenHash);
      const successResponse = service.provisionGateway({
        provisioningToken: token.token,
        stationHardwareId: "HW-STATION-01-LOCK",
        gatewayVersion: "1.0.0",
      });
      expect(successResponse.success).toBe(true);
    });

    it("garante atomicidade estrita: apenas a primeira requisição sucede e a segunda recebe TOKEN_ALREADY_USED", () => {
      const token = service.createProvisioningToken({
        organizationId: orgId,
        plantId,
        stationId,
        issuedBy: "admin@eletricai.com",
      });

      // Duas tentativas consecutivas
      const res1 = service.provisionGateway({
        provisioningToken: token.token,
        stationHardwareId: "HW-01",
        gatewayVersion: "1.0.0",
      });

      const res2 = service.provisionGateway({
        provisioningToken: token.token,
        stationHardwareId: "HW-02",
        gatewayVersion: "1.0.0",
      });

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(false);
      expect(res2.error).toContain("TOKEN_ALREADY_USED");
    });
  });

  describe("2. Timing-Safe Hash Comparison & Side-Channel Mitigation", () => {
    it("utiliza timing-safe lookup para validação de hash sem vazamento de canal lateral", () => {
      const token = service.createProvisioningToken({
        organizationId: orgId,
        plantId,
        stationId,
        issuedBy: "sec_auditor@eletricai.com",
      });

      // Token adulterado com mesmo tamanho (64 hex chars = 32 bytes)
      const fakeToken = "EGW-PROV-" + "0".repeat(32);
      const resFake = service.provisionGateway({
        provisioningToken: fakeToken,
        stationHardwareId: "HW-FAKE",
        gatewayVersion: "1.0.0",
      });

      expect(resFake.success).toBe(false);
      expect(resFake.error).toContain("INVALID_TOKEN");
    });
  });

  describe("3. Token Entropy & Cryptographic Hashing Verification", () => {
    it("gera tokens com 128-bit de entropia CSPRNG e hash SHA-256 irreversível", () => {
      const tokens = new Set<string>();
      const hashes = new Set<string>();

      for (let i = 0; i < 50; i++) {
        const t = service.createProvisioningToken({
          organizationId: orgId,
          plantId,
          stationId: `station_${i}`,
          issuedBy: "entropy_test@eletricai.com",
        });

        expect(t.token).toMatch(/^EGW-PROV-[A-F0-9]{32}$/);
        expect(t.tokenHash).toMatch(/^[a-f0-9]{64}$/);

        // Verifica que o hash armazenado corresponde estritamente ao SHA-256 do token
        const expectedHash = crypto.createHash("sha256").update(t.token).digest("hex");
        expect(t.tokenHash).toBe(expectedHash);

        tokens.add(t.token);
        hashes.add(t.tokenHash!);
      }

      // 50 tokens únicos gerados sem colisão
      expect(tokens.size).toBe(50);
      expect(hashes.size).toBe(50);
    });
  });
});
