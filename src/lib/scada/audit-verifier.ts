// SCADA SUPERVISÓRIO — Cryptographic Audit Trail Verifier
// Classification: Detectable Hash Chain / Controlled Append-Only Log (SHA-256)
// Standards: IEC 62443-4-2 (Integrity), 21 CFR Part 11 (Audit Trails - Tamper Detection)
// Regulatory Boundary Notice: Tamper-evident software chain; does not replace external PKI HSM digital signatures.

import crypto from "node:crypto";

export const AUDIT_TRAIL_GENESIS_HASH = "GENESIS_BLOCK_0000000000000000";

export const AUDIT_TRAIL_CLASSIFICATION = {
  classification: "DETECTABLE_HASH_CHAIN_APPEND_ONLY_LOG" as const,
  hashAlgorithm: "SHA-256" as const,
  tamperEvident: true,
  hardwareAnchored: false, // strictly false without external HSM / blockchain
  disclaimer:
    "Cadeia de custódia criptográfica auditável via SHA-256 em memória/banco. Detecta adulterações, omissões e reordenações de registros no log operacional.",
};

export interface AuditChainRecord {
  id?: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  resource_id?: string;
  resource_type?: string;
  details: unknown;
  previous_hash: string;
  chain_hash: string;
  created_at: string;
}

export interface AuditVerificationResult {
  isValid: boolean;
  totalRecordsChecked: number;
  status: "VALID" | "TAMPERED" | "BROKEN_CHAIN" | "EMPTY";
  failureReason?: string;
  tamperedIndex?: number;
  tamperedRecordId?: string;
  computedHash?: string;
  expectedHash?: string;
}

/**
 * Deterministically serializes any JavaScript object or primitive into a canonical JSON string.
 * Recursively sorts all keys alphabetically to guarantee byte-for-byte reproducible hashes.
 */
export function canonicalJsonStringify(data: unknown): string {
  if (data === null || data === undefined) {
    return "null";
  }

  if (typeof data !== "object") {
    return JSON.stringify(data);
  }

  if (Array.isArray(data)) {
    return `[${data.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }

  // Object: sort keys alphabetically
  const record = data as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries = sortedKeys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJsonStringify(record[k])}`,
  );
  return `{${entries.join(",")}}`;
}

/**
 * Computes the SHA-256 chain hash for an audit log entry using canonical serialization.
 */
export function computeAuditChainHash(params: {
  previousHash: string;
  tenantId: string | null;
  userId: string | null;
  action: string;
  details: unknown;
  createdAt: string;
}): string {
  const canonicalDetails = canonicalJsonStringify(params.details);
  const tenantStr = params.tenantId ?? "";
  const userStr = params.userId ?? "";
  const payload = `${params.previousHash}|${tenantStr}|${userStr}|${params.action}|${canonicalDetails}|${params.createdAt}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Verifies the complete cryptographic integrity of an audit log chain.
 * Re-computes SHA-256 hashes for all records and checks link validity (previous_hash == previous chain_hash).
 */
export function verifyAuditChainIntegrity(
  records: AuditChainRecord[],
  genesisHash: string = AUDIT_TRAIL_GENESIS_HASH,
): AuditVerificationResult {
  if (!records || records.length === 0) {
    return {
      isValid: true,
      totalRecordsChecked: 0,
      status: "EMPTY",
    };
  }

  let expectedPreviousHash = genesisHash;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // 1. Check previous_hash chain linkage
    if (i === 0) {
      // First record must match genesisHash
      if (record.previous_hash !== genesisHash) {
        return {
          isValid: false,
          totalRecordsChecked: i + 1,
          status: "BROKEN_CHAIN",
          tamperedIndex: i,
          tamperedRecordId: record.id,
          failureReason: `Registro inicial com previous_hash [${record.previous_hash}] incompatível com o bloco gênese esperado [${genesisHash}].`,
          expectedHash: genesisHash,
          computedHash: record.previous_hash,
        };
      }
    } else {
      if (record.previous_hash !== expectedPreviousHash) {
        return {
          isValid: false,
          totalRecordsChecked: i + 1,
          status: "BROKEN_CHAIN",
          tamperedIndex: i,
          tamperedRecordId: record.id,
          failureReason: `Elo da cadeia quebrado no índice ${i}. previous_hash [${record.previous_hash}] não confere com o chain_hash anterior [${expectedPreviousHash}].`,
          expectedHash: expectedPreviousHash,
          computedHash: record.previous_hash,
        };
      }
    }

    // 2. Recompute record hash using canonical payload
    const computedChainHash = computeAuditChainHash({
      previousHash: record.previous_hash,
      tenantId: record.tenant_id,
      userId: record.user_id,
      action: record.action,
      details: record.details,
      createdAt: record.created_at,
    });

    if (computedChainHash !== record.chain_hash) {
      return {
        isValid: false,
        totalRecordsChecked: i + 1,
        status: "TAMPERED",
        tamperedIndex: i,
        tamperedRecordId: record.id,
        failureReason: `Adulteração de conteúdo detectada no registro índice ${i} (Ação: "${record.action}"). Hash gravado [${record.chain_hash}] diverge do hash calculado [${computedChainHash}].`,
        expectedHash: record.chain_hash,
        computedHash: computedChainHash,
      };
    }

    expectedPreviousHash = record.chain_hash;
  }

  return {
    isValid: true,
    totalRecordsChecked: records.length,
    status: "VALID",
  };
}
