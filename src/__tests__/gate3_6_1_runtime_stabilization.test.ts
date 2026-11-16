// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.6.1 ACCEPTANCE TEST SUITE
// RUNTIME STABILIZATION, SERVER/CLIENT BOUNDARY & FBD PERFORMANCE
// =============================================================================

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256 } from "@/lib/diagnostics/crypto-hash";
import { FleetAuditManager } from "@/lib/edge/fleet-audit";

describe("Gate 3.6.1 — Runtime Stabilization & Architectural Verification", () => {
  // ---------------------------------------------------------------------------
  // 1. FIPS 180-4 SHA-256 Bit-for-Bit Determinism & Node.js Equivalence
  // ---------------------------------------------------------------------------
  describe("1. FIPS 180-4 SHA-256 Cryptographic Conformance", () => {
    it("valida vetor NIST 1: string vazia", () => {
      const input = "";
      const expected = createHash("sha256").update(input).digest("hex");
      const actual = sha256(input);
      expect(actual).toBe(expected);
      expect(actual).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("valida vetor NIST 2: 'abc'", () => {
      const input = "abc";
      const expected = createHash("sha256").update(input).digest("hex");
      const actual = sha256(input);
      expect(actual).toBe(expected);
      expect(actual).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    });

    it("valida vetor NIST 3: string longa multi-bloco", () => {
      const input = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
      const expected = createHash("sha256").update(input).digest("hex");
      const actual = sha256(input);
      expect(actual).toBe(expected);
      expect(actual).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    });

    it("valida caracteres UTF-8 e acentuação brasileira em strings industriais", () => {
      const input =
        "Disjuntor Geral QGBT-01 — Operação Sob Carga — Subestação Primária 13.8kV — Corrente Térmica = 1250 A";
      const expected = createHash("sha256").update(input).digest("hex");
      const actual = sha256(input);
      expect(actual).toBe(expected);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Cadeia de Custódia Criptográfica & Detecção de Adulteração (Tamper-Evident)
  // ---------------------------------------------------------------------------
  describe("2. Fleet Audit Hash-Chain & Tamper-Evident Detection", () => {
    it("atesta integridade de uma cadeia de auditoria sequencial legítima", () => {
      const audit = new FleetAuditManager();
      audit.clear();

      audit.recordEvent({
        actor: { id: "usr_eng_1", email: "eng@eletricai.com", role: "TENANT_ADMIN" },
        source: "CLOUD_SERVER",
        gatewayId: "gw_01",
        plantId: "plant_sp",
        organizationId: "org_alpha",
        eventType: "CONFIG_STAGED",
        severity: "INFO",
        result: "SUCCESS",
      });

      audit.recordEvent({
        actor: { id: "usr_eng_1", email: "eng@eletricai.com", role: "TENANT_ADMIN" },
        source: "CLOUD_SERVER",
        gatewayId: "gw_01",
        plantId: "plant_sp",
        organizationId: "org_alpha",
        eventType: "CONFIG_DEPLOYED",
        severity: "INFO",
        result: "SUCCESS",
      });

      const verification = audit.verifyAuditChainIntegrity();
      expect(verification.isValid).toBe(true);
      expect(verification.brokenAtIndex).toBeUndefined();
    });

    it("detecta violação se o payload de um evento intermediário for adulterado", () => {
      const audit = new FleetAuditManager();
      audit.clear();

      audit.recordEvent({
        actor: { id: "usr_1", email: "op@ind.br", role: "EDGE_OPERATOR" },
        source: "ADMIN_CONSOLE",
        gatewayId: "gw_01",
        plantId: "plant_sp",
        organizationId: "org_alpha",
        eventType: "ALARM_ACK",
        severity: "INFO",
        result: "SUCCESS",
      });

      const ev2 = audit.recordEvent({
        actor: { id: "usr_1", email: "op@ind.br", role: "EDGE_OPERATOR" },
        source: "ADMIN_CONSOLE",
        gatewayId: "gw_01",
        plantId: "plant_sp",
        organizationId: "org_alpha",
        eventType: "PARAM_CHANGE",
        severity: "WARNING",
        result: "SUCCESS",
        details: { targetTag: "MOTOR_SPEED", value: 1750 },
      });

      audit.recordEvent({
        actor: { id: "usr_1", email: "op@ind.br", role: "EDGE_OPERATOR" },
        source: "ADMIN_CONSOLE",
        gatewayId: "gw_01",
        plantId: "plant_sp",
        organizationId: "org_alpha",
        eventType: "SESSION_LOGOUT",
        severity: "INFO",
        result: "SUCCESS",
      });

      // Adulteração maliciosa do payload no evento 2 (índice 1)
      ev2.details = { targetTag: "MOTOR_SPEED", value: 3600 }; // Adulteração

      const verification = audit.verifyAuditChainIntegrity();
      expect(verification.isValid).toBe(false);
      expect(verification.brokenAtIndex).toBe(1);
    });

    it("detecta tentativa de adulteração de timestamp ou ator", () => {
      const audit = new FleetAuditManager();
      audit.clear();

      const ev = audit.recordEvent({
        actor: { id: "usr_admin", email: "admin@ind.br", role: "TENANT_ADMIN" },
        source: "CLOUD_SERVER",
        gatewayId: "gw_01",
        plantId: "plant_sp",
        organizationId: "org_alpha",
        eventType: "CERT_REVOKED",
        severity: "CRITICAL",
        result: "SUCCESS",
      });

      // Simula alteração fraudulenta de timestamp
      (ev as any).timestamp = ev.timestamp - 10000;

      const verification = audit.verifyAuditChainIntegrity();
      expect(verification.isValid).toBe(false);
      expect(verification.brokenAtIndex).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Estabilidade do React Flow no FBD Canvas (Referential Stability)
  // ---------------------------------------------------------------------------
  describe("3. React Flow Identity Stability in the FB Electric Studio canvas", () => {
    // O antigo canvas FBD foi unificado ao FB Electric Studio; a mesma garantia
    // (mapa de nós estático e congelado no escopo do módulo) vale para ele.
    const studioCanvas = readFileSync(
      resolve(__dirname, "../components/compact-studio/compact-fbd-canvas.tsx"),
      "utf-8",
    );

    it("NODE_TYPES é declarado no escopo do módulo e congelado", () => {
      expect(studioCanvas).toMatch(/^const NODE_TYPES: NodeTypes = Object\.freeze\(\{/m);
    });

    it("o ReactFlow recebe a referência estática (sem recriar por render)", () => {
      expect(studioCanvas).toContain("nodeTypes={NODE_TYPES}");
      expect(studioCanvas).not.toMatch(/nodeTypes=\{\{/);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Fronteira Server / Client — Verificação Estática de Imports
  // ---------------------------------------------------------------------------
  describe("4. Server/Client Boundary Isolation", () => {
    it("garante que fleet-dashboard.tsx não faz import direto de node:crypto nem de managers de servidor", () => {
      const fileContent = readFileSync(
        resolve(__dirname, "../components/edge/fleet-dashboard.tsx"),
        "utf-8",
      );

      expect(fileContent).not.toContain('from "node:crypto"');
      expect(fileContent).not.toContain("from 'node:crypto'");
      expect(fileContent).not.toContain('from "@/lib/edge/fleet-manager"');
      expect(fileContent).not.toContain('from "@/lib/edge/fleet-audit"');
      expect(fileContent).not.toContain('from "@/lib/edge/fleet-certificates"');
      expect(fileContent).not.toContain('from "@/lib/edge/remote-config"');
      expect(fileContent).not.toContain('from "@/lib/edge/signed-updates"');
      // Deve usar exclusivamente as server functions RPC
      expect(fileContent).toContain('from "@/lib/edge/fleet.functions"');
    });

    it("garante que canonical-data-service.ts não faz import de FleetAuditManager com node:crypto", () => {
      const fileContent = readFileSync(
        resolve(__dirname, "../lib/industrial/canonical-data-service.ts"),
        "utf-8",
      );

      expect(fileContent).not.toContain('from "@/lib/edge/fleet-audit"');
      expect(fileContent).not.toContain('from "node:crypto"');
    });

    it("garante que o canvas do FB Electric Studio não importa módulos nativos de backend", () => {
      const fileContent = readFileSync(
        resolve(__dirname, "../components/compact-studio/compact-fbd-canvas.tsx"),
        "utf-8",
      );

      expect(fileContent).not.toContain('from "node:crypto"');
      expect(fileContent).not.toContain('from "node:fs"');
      expect(fileContent).not.toContain('from "node:path"');
    });
  });
});
