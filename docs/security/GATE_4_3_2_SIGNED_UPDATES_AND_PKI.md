# GATE 4.3.2 — SIGNED UPDATES, ED25519 PKI & KEY ROTATION/REVOCATION

**Data:** 2026-11-12  
**Branch:** `gate-4.3.2-production-readiness`  
**Status:** `VERIFIED`

---

## 1. Controles Criptográficos Consolidados (`signed-updates.ts`)

1. **Verificação Assimétrica Ed25519 Canônica:**
   - [`SignedUpdateManager.verifyManifestSignature`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/signed-updates.ts) valida assinatura Ed25519 sobre todos os campos canônicos (`manifestVersion`, `keyId`, `packageId`, `targetVersion`, `targetArch`, `sha256`, `minGatewayVersion`, `releaseNotes`, `dependencies`, `createdAt`, `expiresAt`, `targetGateway`, `targetOrganizationId`, `targetPlantId`).
2. **Rotação & Revogação Persistente de Chaves (`ota_signing_keys`):**
   - Implementados [`registerTrustedPublicKey`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/signed-updates.ts), [`revokeSigningKey`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/signed-updates.ts) e [`isSigningKeyRevoked`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/signed-updates.ts), persistidos na tabela `ota_signing_keys` (PostgreSQL e SQLite WAL).
   - Manifestos assinados por chave revogada (`status = 'REVOKED'`) são rejeitados imediatamente em todas as instâncias, enquanto novas chaves rotacionadas (`v2`) permanecem válidas.
3. **Proteções Temporais, Integridade de Bytes & Anti-Downgrade:**
   - Rejeição de `createdAt` futuro além do skew de 300s e rejeição após `expiresAt`.
   - [`verifyArtifactBytes`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/signed-updates.ts) compara digest SHA-256 em tempo constante contra o payload binário do pacote antes do commit OTA.
   - Proteção anti-downgrade SemVer e anti-replay persistente em `ota_applied_packages`.
