# GATE 4.3.2 — REMEDIATION CHANGELOG

**Data:** 2026-11-12  
**Branch:** `gate-4.3.2-production-readiness`  
**Base Commit (Gate 4.3.1):** `29116f7958fc47a5ec4022e5665f7b09e1780912`  

---

## Arquivos Criados e Modificados no Gate 4.3.2

1. [`supabase/migrations/20261112120000_gate4_3_2_cloud_persistence_and_rpcs.sql`](file:///c:/Users/98911/Desktop/eletric/eletricaip/supabase/migrations/20261112120000_gate4_3_2_cloud_persistence_and_rpcs.sql) *(Novo)*:
   - Índices `UNIQUE` em `invoices(stripe_invoice_id)`, `subscriptions(stripe_subscription_id)`, `stripe_webhook_events(event_id)`, `mp_webhook_processed(payment_id)` e `fleet_audit_chain(previous_hash)`.
   - Tabelas `mp_payment_state_machine`, `fleet_latest_telemetry`, `provisioning_station_bindings`, `ota_signing_keys`.
   - `tenant_id` nullable com policies RLS exigindo `tenant_id IS NOT NULL AND EXISTS (...)`.
   - RPCs `SECURITY DEFINER` (`SET search_path = public`, acesso restrito a `service_role`): `append_fleet_audit_event_atomic`, `claim_provisioning_token_atomic`, `record_ingested_batch_atomic`, `append_remote_config_monotonic_atomic`, `begin_webhook_event_atomic`, `complete_webhook_event_atomic`, `apply_mp_payment_transition_atomic`.
2. [`src/lib/edge/types.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/types.ts):
   - Interfaces `AsyncFleetStorageBackend` e `OtaSigningKeyRecord`.
3. [`src/lib/edge/fleet-supabase-store.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-supabase-store.server.ts) *(Novo)*:
   - Adapter autoritativo Cloud PostgreSQL `SupabaseFleetStorageBackend` sobre tabelas e RPCs Supabase.
4. [`src/lib/edge/fleet-runtime.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-runtime.server.ts):
   - Seletor fail-closed `getFleetStorageBackendMode()` e executor isolado `withCloudFleetRuntimeAsync()` com re-sincronização atômica de auditoria e telemetria.
5. [`src/lib/edge/fleet-handlers.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-handlers.server.ts):
   - Helper unificado `runWithFleetManagers()` roteando automaticamente todos os RPCs Edge Fleet entre PostgreSQL Cloud e SQLite WAL local.
6. [`src/lib/edge/fleet-auth-context.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-auth-context.server.ts), [`src/lib/edge/cloud-protocol-guard.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/cloud-protocol-guard.server.ts), [`src/lib/edge/modbus-handlers.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/modbus-handlers.server.ts), [`src/lib/edge/opcua-handlers.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/opcua-handlers.server.ts), [`src/lib/scada/edge-ingest.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/scada/edge-ingest.functions.ts), [`src/lib/observability/observability.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/observability/observability.functions.ts):
   - Eliminadas chamadas síncronas diretas a SQLite em handlers assíncronos Cloud.
7. [`src/lib/edge/cloud-gateway-registry.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/cloud-gateway-registry.ts), [`src/lib/edge/fleet-manager.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-manager.ts), [`src/lib/edge/fleet-certificates.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-certificates.ts), [`src/lib/edge/remote-config.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/remote-config.ts), [`src/lib/edge/provisioning.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/provisioning.ts):
   - Corrigidos *stale warm-cache reads* via sincronização obrigatória de `this.store`; uso de `this.auditManager` em rejeições de `RemoteConfigManager`.
8. [`src/lib/edge/fleet-audit.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-audit.ts):
   - Corrigida ordem de `syncFromStore()` em `getEvents()`, adicionado retry concorrente em `recordEvent()` e helper `recomputeHashForTip()`.
9. [`src/lib/edge/signed-updates.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/signed-updates.ts) & [`src/lib/edge/fleet-persistent-store.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-persistent-store.server.ts):
   - Rotação e revogação persistente de chaves públicas Ed25519 (`ota_signing_keys`, `revokeSigningKey`, `isSigningKeyRevoked`) e rejeição de `createdAt` futuro.
10. [`src/lib/security/webhook-ledger.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/security/webhook-ledger.server.ts), [`src/routes/api/public/mp.webhook.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/api/public/mp.webhook.ts), [`src/routes/api/public/stripe.webhook.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/api/public/stripe.webhook.ts):
    - Ledger transacional compartilhado na Cloud (`asyncStore` PostgreSQL) + máquina de estados Mercado Pago bloqueando regressões (`apply_mp_payment_transition_atomic` / `isValidMpStatusTransition`).
11. [`src/lib/edge/drivers/modbus-driver.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/drivers/modbus-driver.ts) & [`src/lib/edge/drivers/sparkplug-driver.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/drivers/sparkplug-driver.ts):
    - Framing binário MBAP/PDU (`buildMbapReadRequestFrame`, `decodeMbapReadResponseFrame`) e bloqueio de `NCMD`/`DCMD` + `edgeNodeId` ACL em `handleIncomingMessage`.
12. [`src/lib/iot.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/iot.functions.ts) & [`src/routes/realtime.tsx`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/routes/realtime.tsx):
    - Bloqueio explícito `IS_PHYSICAL_CONTROL_ALLOWED = false` em `enqueueIotCommand` e UI `<CommandPanel>` bloqueada em Read-Only.
13. [`src/integrations/supabase/env.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/integrations/supabase/env.ts), [`.prettierignore`](file:///c:/Users/98911/Desktop/eletric/eletricaip/.prettierignore), [`.github/workflows/ci.yml`](file:///c:/Users/98911/Desktop/eletric/eletricaip/.github/workflows/ci.yml), [`src/__tests__/gate-4-3-2-cloud-multi-instance-and-rpcs.test.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/__tests__/gate-4-3-2-cloud-multi-instance-and-rpcs.test.ts), [`tests/e2e/05-security-barrier-and-fleet.spec.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/tests/e2e/05-security-barrier-and-fleet.spec.ts), [`tests/e2e/07-multi-viewport-responsiveness.spec.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/tests/e2e/07-multi-viewport-responsiveness.spec.ts).
