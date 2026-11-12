# GATE 4.3.1 — REMEDIATION CHANGELOG

**Branch:** `gate-4.3.1-security-remediation` (baseada em `3dac4b9f28f26d11d80e0cc8fb50a6b159b9b8eb`)

---

## Arquivos Novos Adicionados

### Camada Cloud–Edge–OT & Classificação Honesta
- `src/lib/edge/protocol-classification.ts` — Taxonomia `PARSER` / `SIMULATOR` / `LAB_EDGE_ADAPTER` / `EDGE_TRANSPORT` / `PHYSICAL_COMMUNICATION`, proveniência explícita (`TagProvenance`), validação de endpoints/hosts e `authorizeCloudToEdgeReadTarget`.
- `src/lib/edge/edge-network-allowlist.ts` — Allowlist OT exclusiva de Edge Gateway e `resolveToAllowedIPv4` anti-DNS rebinding.
- `src/lib/edge/cloud-protocol-guard.server.ts` — Guarda server-side compartilhada para RBAC de sessão, escopo multi-tenant/allowlist em `EDGE_READ_ONLY` e bloqueio permanente de escrita física (`PHYSICAL_CONTROL_BLOCKED`).
- `src/lib/edge/modbus-handlers.server.ts` — Handlers Modbus server-only (zero `net.Socket`, zero `node:dns`).
- `src/lib/edge/opcua-handlers.server.ts` — Handlers OPC-UA server-only (sem fallback `localhost` / substring `"simulation"`).

### Camada Persistente, Auditoria Imutável & AuthZ
- `src/lib/edge/fleet-persistent-store.server.ts` — `SqliteFleetStorageBackend` (`node:sqlite` / `bun:sqlite`, WAL, triggers append-only, atomic single-use claims, monotonic versioning, webhook ledger).
- `src/lib/edge/fleet-runtime.server.ts` — Wiring de singletons de frota ao store SQLite e container isolado `createIsolatedPersistentFleetContainer`.
- `src/lib/edge/fleet-handlers.server.ts` — Handlers RPC de frota com lookup autoritativo fail-closed (`404`/`403`) e endpoint `executeAcknowledgeFleetAuditEvent`.
- `src/lib/security/webhook-ledger.server.ts` — Máquina de estados transacional para webhooks e `assertSupabaseWriteOk`.
- `supabase/migrations/20261111180000_gate4_3_1_enterprise_persistence.sql` — DDL PostgreSQL, triggers `BEFORE UPDATE OR DELETE`, e políticas RLS restritivas (não aplicada ao banco remoto de produção).

### Suítes de Regressão Gate 4.3.1 & Documentação de Segurança
- `src/__tests__/gate-4-3-1-cloud-edge-ot.test.ts`
- `src/__tests__/gate-4-3-1-persistence-audit-ota.test.ts`
- `src/__tests__/gate-4-3-1-webhooks-authz.test.ts`
- `docs/security/GATE_4_3_1_*.md` e `docs/security/GATE_4_3_1_SBOM.cdx.json`

---

## Arquivos Existentes Modificados

- `src/lib/modbus-server.functions.ts` & `src/lib/opcua-server.functions.ts` — Fronteira pura `createServerFn` carregando `.server.ts` dinamicamente dentro de `.handler(...)`; remoção total de `net` e `node:dns` na nuvem.
- `src/lib/edge/types.ts` — Contratos `FleetStorageBackend`, `WebhookLedgerEntry`, `PersistedProvisioningState`, `authorizedEndpoints`, metadados estendidos de `SignedUpdateManifest` (`keyId`, `expiresAt`, escopo) e `schemaVersion` em `FleetAuditEvent`.
- `src/lib/edge/cloud-gateway-registry.ts`, `fleet-manager.ts`, `fleet-certificates.ts`, `remote-config.ts`, `provisioning.ts` — Persistência WAL, otimismo de concorrência, telemetria read-through, replay protection em desafio PoP e atomic burn de tokens.
- `src/lib/edge/fleet-audit.ts` — Hashing determinístico `canonicalJson` com `sha256Hex`, `acknowledgeEventAndGetRecord` append-only (`GATEWAY_EVENT_ACKNOWLEDGED`), e bloqueio de `clear()` em produção / bancos persistentes.
- `src/lib/edge/signed-updates.ts` — Verificação assimétrica **Ed25519** sobre manifesto canônico completo, digest de bytes do artefato, expiração, semver anti-downgrade, anti-replay persistido e isolamento cross-tenant/planta/gateway.
- `src/lib/edge/fleet-auth-context.server.ts`, `fleet.functions.ts`, `scada/edge-ingest.functions.ts`, `observability/observability.functions.ts` — Remoção de fallback de `organizationId`/`plantId` do cliente e isolamento server-only.
- `src/lib/edge/drivers/*.ts` & `src/lib/studio/communication/protocol-engine.ts` — Etiquetagem explícita `implementationClass` (`LAB_EDGE_ADAPTER` / `PARSER`).
- `src/hooks/use-opcua-bridge.ts` & `src/routes/settings.protocols.tsx` — UI e hook com modo explícito (`SIMULATOR` vs `EDGE_READ_ONLY`), campo de Gateway ID, proveniência e matriz arquitetural.
- `src/routes/api/public/stripe.webhook.ts`, `src/routes/api/public/mp.webhook.ts`, `supabase/functions/stripe-webhook/index.ts` — Ledger transacional + verificação estrita de erros Supabase (zero falhas silenciosas retornando HTTP 200).
- `package.json`, `bun.lock` & compatibilidade Zod `4.6.7` em `right-property-panel.tsx`, `property-schemas.ts`, `fbd/engine/model.ts`, `observability/types.ts`, `diagnostics/contract.ts`, `projects.functions.ts`, `scada.functions.ts`, `studio/canonical/types.ts`, `scada.tsx`, `workspace.tsx` — Eliminação da vulnerabilidade HIGH `GHSA-mrhx-c7xc-m3w5` (`zod <4.6.6`).
- `.github/workflows/ci.yml` — Trigger em branches `gate-*`, verificação de fronteira Cloud/Edge, `NODE_OPTIONS=--max-old-space-size=4096` e job `e2e-browser`.
- `src/__tests__/modbus-ssrf-guard.test.ts`, `gate-4-3-redteam-security-regression.test.ts`, `edge-fleet-operational-readiness.test.ts`, `tests/e2e/05-security-barrier-and-fleet.spec.ts` — Adequação de imports Edge, keypairs Ed25519 e cobertura E2E da matriz de protocolos.
