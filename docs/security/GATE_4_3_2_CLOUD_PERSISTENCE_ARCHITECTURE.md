# GATE 4.3.2 — CLOUD PERSISTENCE & MULTI-INSTANCE ARCHITECTURE

**Data:** 2026-11-12  
**Branch:** `gate-4.3.2-production-readiness`  
**Status Geral:** `VERIFIED` (Adapter PostgreSQL + RPCs atômicas + invalidação cross-instância; execução live de daemon PostgreSQL local registrada como `BLOCKED_BY_ENVIRONMENT`)

---

## 1. Problema Identificado no Gate 4.3.1

No Gate 4.3.1, [`fleet-runtime.server.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-runtime.server.ts) instanciava exclusivamente `SqliteFleetStorageBackend(resolveDefaultFleetDbPath())` (`data/eletricai-fleet.sqlite`), o que:
1. Não compartilha estado entre múltiplas instâncias serverless na Cloud (`nitro: vercel`).
2. Causava *stale warm-cache reads* nos managers (`CloudGatewayRegistry`, `EdgeFleetManager`, `FleetCertificateManager`, `RemoteConfigManager`, `FleetAuditManager`, `EdgeProvisioningService`), pois leituras após o boot retornavam mapas em memória antes de consultar a camada persistente.

---

## 2. Arquitetura Consolidada (Gate 4.3.2)

### 2.1 Contrato Assíncrono + Adapter Autoritativo Cloud PostgreSQL
- [`AsyncFleetStorageBackend`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/types.ts) formaliza as operações Cloud assíncronas e atômicas.
- [`SupabaseFleetStorageBackend`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-supabase-store.server.ts) implementa persistência real sobre tabelas e RPCs PostgreSQL via `supabaseAdmin` (`fleet_registered_gateways`, `fleet_gateways`, `gateway_certificates`, `gateway_certificate_challenges`, `remote_configs`, `provisioning_tokens`, `provisioning_station_bindings`, `ota_campaigns`, `ota_applied_packages`, `ota_signing_keys`, `fleet_latest_telemetry`, `edge_ingested_dedup`, `fleet_audit_chain`, `webhook_processing_ledger`).
- [`withCloudFleetRuntimeAsync`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-runtime.server.ts) e [`runWithFleetManagers`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-handlers.server.ts) hidratam um container isolado por requisição Cloud a partir do estado autoritativo PostgreSQL e comitam mutações/eventos via RPCs atômicas — eliminando vazamento de cache entre requisições e instâncias.

### 2.2 Política Fail-Closed de Backend Cloud vs Edge
[`getFleetStorageBackendMode`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-runtime.server.ts) e [`ensurePersistentFleetRuntime`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-runtime.server.ts):
- Em ambiente serverless de produção (`VERCEL=1` / `VERCEL_ENV=production`) sem `ELETRICAI_FLEET_DB_PATH` explícito:
  - Exigem `SUPABASE_SERVICE_ROLE_KEY` (`supabase_postgresql`);
  - Se ausente, lançam erro explícito `CLOUD_PERSISTENCE_UNCONFIGURED` (nunca degradam silenciosamente para SQLite efêmero ou `Map` em memória);
  - Bloqueiam chamadas síncronas em SQLite efêmero (`CLOUD_SYNC_SQLITE_FORBIDDEN`).
- Handlers assíncronos auxiliares (`modbus-handlers.server.ts`, `opcua-handlers.server.ts`, `edge-ingest.functions.ts`, `observability.functions.ts`) também migraram para [`runWithFleetManagers`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-handlers.server.ts).

### 2.3 Eliminação de Stale Cache nos Managers
- `CloudGatewayRegistry.getGateway` / `authenticateGateway` / `revokeGateway` agora sincronizam de `this.store` sempre que há backend persistente conectado.
- `FleetCertificateManager`, `RemoteConfigManager`, `EdgeFleetManager`, `EdgeProvisioningService` e `SignedUpdateManager` sincronizam antes de leituras/validações autoritativas.
- SQLite WAL (`SqliteFleetStorageBackend`) permanece restrito a daemon Edge local, volume único explícito e fixtures isoladas de teste.
