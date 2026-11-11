// ELÉTRICAI INDUSTRIAL OS — GATE 2.5 INTEGRITY AUDIT TEST SUITE
// Test Suite: Cryptographic Audit Trail Verifier (SHA-256 Hash Chain & Canonical JSON)
// Standards: IEC 62443-4-2, 21 CFR Part 11

import { describe, it, expect } from "vitest";
import {
  canonicalJsonStringify,
  computeAuditChainHash,
  verifyAuditChainIntegrity,
  AUDIT_TRAIL_GENESIS_HASH,
  AUDIT_TRAIL_CLASSIFICATION,
  type AuditChainRecord,
} from "@/lib/scada/audit-verifier";

describe("GATE 2.5 — FASE 9: Cryptographic Audit Trail Verifier", () => {
  const tenantId = "tenant-industrial-1";
  const userId = "usr-operator-chief";

  it("1. Serialização Canônica: Objetos com chaves em ordens diferentes geram hashes idênticos", () => {
    const objA = {
      tag: "M-01_CORRENTE",
      action: "ACK_ALARM",
      details: { limit: 49.2, value: 52.1, comment: "Reconhecido pelo supervisor" },
      timestamp: 1700000000000,
    };

    // Exactly same data, but different key insertion orders
    const objB = {
      timestamp: 1700000000000,
      details: { comment: "Reconhecido pelo supervisor", value: 52.1, limit: 49.2 },
      action: "ACK_ALARM",
      tag: "M-01_CORRENTE",
    };

    const strA = canonicalJsonStringify(objA);
    const strB = canonicalJsonStringify(objB);

    expect(strA).toBe(strB);

    const hashA = computeAuditChainHash({
      previousHash: AUDIT_TRAIL_GENESIS_HASH,
      tenantId,
      userId,
      action: "ALARM_ACK",
      details: objA,
      createdAt: "2026-11-02T12:00:00.000Z",
    });

    const hashB = computeAuditChainHash({
      previousHash: AUDIT_TRAIL_GENESIS_HASH,
      tenantId,
      userId,
      action: "ALARM_ACK",
      details: objB,
      createdAt: "2026-11-02T12:00:00.000Z",
    });

    expect(hashA).toBe(hashB);
  });

  it("2. Verificação de Cadeia Válida: 5 blocos encadeados sequencialmente são verificados com sucesso", () => {
    const records: AuditChainRecord[] = [];
    let prevHash = AUDIT_TRAIL_GENESIS_HASH;

    for (let i = 0; i < 5; i++) {
      const createdAt = new Date(1700000000000 + i * 60000).toISOString();
      const action = `OPERATIONAL_EVENT_${i + 1}`;
      const details = { step: i + 1, equipment: `EQ-${i + 1}`, status: "COMPLETED" };

      const chainHash = computeAuditChainHash({
        previousHash: prevHash,
        tenantId,
        userId,
        action,
        details,
        createdAt,
      });

      records.push({
        id: `log-${i + 1}`,
        tenant_id: tenantId,
        user_id: userId,
        action,
        details,
        previous_hash: prevHash,
        chain_hash: chainHash,
        created_at: createdAt,
      });

      prevHash = chainHash;
    }

    const result = verifyAuditChainIntegrity(records);

    expect(result.isValid).toBe(true);
    expect(result.status).toBe("VALID");
    expect(result.totalRecordsChecked).toBe(5);
  });

  it("3. Detecção de Adulteração (Tampering): Alteração de conteúdo em registro intermediário é detectada", () => {
    // Generate valid 4 records
    const records: AuditChainRecord[] = [];
    let prevHash = AUDIT_TRAIL_GENESIS_HASH;

    for (let i = 0; i < 4; i++) {
      const createdAt = new Date(1700000000000 + i * 60000).toISOString();
      const action = `SCADA_COMMAND_${i + 1}`;
      const details = { target: "VALVE", state: i % 2 === 0 ? "OPEN" : "CLOSED" };

      const chainHash = computeAuditChainHash({
        previousHash: prevHash,
        tenantId,
        userId,
        action,
        details,
        createdAt,
      });

      records.push({
        id: `log-${i + 1}`,
        tenant_id: tenantId,
        user_id: userId,
        action,
        details,
        previous_hash: prevHash,
        chain_hash: chainHash,
        created_at: createdAt,
      });

      prevHash = chainHash;
    }

    // Malicious actor modifies record at index 1: alters state from "CLOSED" to "OPEN"
    (records[1].details as { state: string }).state = "OPEN";

    const result = verifyAuditChainIntegrity(records);

    expect(result.isValid).toBe(false);
    expect(result.status).toBe("TAMPERED");
    expect(result.tamperedIndex).toBe(1);
    expect(result.tamperedRecordId).toBe("log-2");
    expect(result.failureReason).toContain("Adulteração de conteúdo detectada");
  });

  it("4. Detecção de Omissão / Exclusão (Broken Chain): Exclusão de registro quebra a cadeia", () => {
    const records: AuditChainRecord[] = [];
    let prevHash = AUDIT_TRAIL_GENESIS_HASH;

    for (let i = 0; i < 4; i++) {
      const createdAt = new Date(1700000000000 + i * 60000).toISOString();
      const action = `LOG_${i + 1}`;
      const details = { index: i };

      const chainHash = computeAuditChainHash({
        previousHash: prevHash,
        tenantId,
        userId,
        action,
        details,
        createdAt,
      });

      records.push({
        id: `log-${i + 1}`,
        tenant_id: tenantId,
        user_id: userId,
        action,
        details,
        previous_hash: prevHash,
        chain_hash: chainHash,
        created_at: createdAt,
      });

      prevHash = chainHash;
    }

    // Delete record index 2 (log-3) to conceal an operational error
    records.splice(2, 1);

    const result = verifyAuditChainIntegrity(records);

    expect(result.isValid).toBe(false);
    expect(result.status).toBe("BROKEN_CHAIN");
    expect(result.tamperedIndex).toBe(2);
    expect(result.failureReason).toContain("Elo da cadeia quebrado");
  });

  it("5. Adulteração do Último Registro: Mesmo alterando o registro mais recente, o hash diverge", () => {
    const records: AuditChainRecord[] = [];
    let prevHash = AUDIT_TRAIL_GENESIS_HASH;

    for (let i = 0; i < 3; i++) {
      const createdAt = new Date(1700000000000 + i * 60000).toISOString();
      const action = `OPERATION_${i + 1}`;
      const details = { value: 100 * (i + 1) };

      const chainHash = computeAuditChainHash({
        previousHash: prevHash,
        tenantId,
        userId,
        action,
        details,
        createdAt,
      });

      records.push({
        id: `log-${i + 1}`,
        tenant_id: tenantId,
        user_id: userId,
        action,
        details,
        previous_hash: prevHash,
        chain_hash: chainHash,
        created_at: createdAt,
      });

      prevHash = chainHash;
    }

    // Modify the last record (index 2)
    records[2].action = "MALICIOUS_OVERWRITE";

    const result = verifyAuditChainIntegrity(records);

    expect(result.isValid).toBe(false);
    expect(result.status).toBe("TAMPERED");
    expect(result.tamperedIndex).toBe(2);
  });

  it("6. Classificação Formal: Declaração transparente de limitações e limites regulatórios", () => {
    expect(AUDIT_TRAIL_CLASSIFICATION.classification).toBe("DETECTABLE_HASH_CHAIN_APPEND_ONLY_LOG");
    expect(AUDIT_TRAIL_CLASSIFICATION.hashAlgorithm).toBe("SHA-256");
    expect(AUDIT_TRAIL_CLASSIFICATION.tamperEvident).toBe(true);
    // Crucial engineering honesty: It is NOT hardware-anchored immutable
    expect(AUDIT_TRAIL_CLASSIFICATION.hardwareAnchored).toBe(false);
    expect(AUDIT_TRAIL_CLASSIFICATION.disclaimer).toBeDefined();
  });
});
