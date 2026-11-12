# GATE 4.3.1 — ASSINATURAS ASSIMÉTRICAS ED25519 EM OTA & PKI

**Status:** `IMPLEMENTED`, `TESTED`, `VERIFIED`

---

## 1. Substituição de HMAC Simétrico por Criptografia Assimétrica Ed25519

Anteriormente, [`SignedUpdateManager`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/signed-updates.ts) assinava apenas 4 campos concatenados (`packageId:targetVersion:targetArch:sha256`) com uma chave simétrica HMAC-SHA256 compartilhada.

No Gate 4.3.1:

- **Criptografia Assimétrica (Ed25519):** Verificação utiliza apenas chaves públicas SPKI PEM por identificador (`keyId -> publicKeysByKeyId` via `ELETRICAI_RELEASE_PUBLIC_KEYS_JSON` / `ELETRICAI_RELEASE_PUBLIC_KEY_PEM`). Chave privada (`privateSigningKeyPem`) nunca é necessária nos servidores de verificação ou gateways Edge.
- **Canonicalização Completa do Manifesto (`buildCanonicalSigningPayload`):** Assinatura Ed25519 cobre `canonicalJson` de **todos** os campos de segurança do manifesto:
  - `manifestVersion`, `keyId`, `packageId`, `targetVersion`, `targetArch`, `sha256`
  - `minGatewayVersion`, `releaseNotes`, `dependencies`
  - `createdAt`, `expiresAt`
  - `targetGateway`, `targetOrganizationId`, `targetPlantId`
- **Verificação Criptográfica Real de Artefato (`verifyArtifactBytes`):** Recalcula SHA-256 sobre os bytes reais do pacote recebido e rejeita qualquer divergência com `ARTIFACT_SHA256_MISMATCH`.
- **Controles Anti-Expiração, Anti-Downgrade & Anti-Replay:**
  - Rejeita manifestos expirados (`expiresAt < now`).
  - Rejeita pacotes cujo `gateway.softwareVersion` é inferior a `minGatewayVersion`.
  - Rejeita downgrade ou re-aplicação da mesma versão (`compareSemver(targetVersion, gateway.softwareVersion) <= 0`).
  - Persiste pacotes aplicados na tabela `ota_applied_packages` (`UNIQUE (gateway_id, package_id, target_version)`), bloqueando replay após reinicialização (`OTA_VERSION_REPLAY_BLOCKED`).
- **Isolamento Cross-Tenant / Planta / Gateway em `executeGatewayUpdate` e `abortCampaign`:** Impede aplicação de campanha da Organização A ou Planta X em gateway de outra organização, planta ou `targetGateway` distinto, gerando evento crítico `CROSS_TENANT_UPDATE_DENIED`.

---

## 2. Ciclo de Vida de Certificados PoP (`FleetCertificateManager`)

- Desafios Proof-of-Possession (`challenge`) são consumidos uma única vez via `consumeChallengeOnce` persistido na tabela `certificate_challenges`, bloqueando replay do par `{ gatewayId, challenge }` com `CHALLENGE_REPLAYED`.
- Certificados dos gateways semeados e provisionados são persistidos na tabela `gateway_certificates`, preservando estado `REVOKED` após reinício frio.
