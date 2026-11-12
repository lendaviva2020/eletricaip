# GATE 4.3.1 — AUTORIZAÇÃO MULTI-TENANT DE GATEWAYS, RBAC & RLS POSTGRESQL

**Autorização Server-Side (`fleet.functions.ts` / `fleet-handlers.server.ts`):** `IMPLEMENTED`, `TESTED`, `VERIFIED`  
**Execução ao vivo em PostgreSQL Local (Docker Desktop parado):** `BLOCKED_BY_ENVIRONMENT`

---

## 1. Eliminação de Fallback de Tenant/Planta nas Mutações de Frota

Na auditoria Gate 4.3, três mutações em [`src/lib/edge/fleet.functions.ts`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet.functions.ts) ainda utilizavam:

```ts
const targetOrgId = gw?.organizationId ?? data.organizationId;
const targetPlantId = gw?.plantId ?? data.plantId;
```

No **Gate 4.3.1**, todo fallback para payload do cliente foi **removido**:

1. [`resolveAuthoritativeGatewayForActor`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-auth-context.server.ts) carrega o estado persistido (`ensurePersistentFleetRuntime()`) e consulta exclusivamente `edgeFleetManager.getGateway(gatewayId)`.
2. Gateway inexistente retorna **HTTP `404`** com evento estruturado `RBAC_DENIED`.
3. Gateway pertencente a outra organização retorna **HTTP `403`** com evento crítico `CROSS_TENANT_DENIED`.
4. Usuários com escopo restrito por planta recebem **HTTP `403`** ao acessar gateways fora de `authorizedPlantIds` (salvo `PLATFORM_ADMIN` e `TENANT_ADMIN` da mesma organização).
5. `proposeRemoteConfigFn`, `rollbackRemoteConfigFn`, `revokeGatewayCertificateFn` e `triggerSignedUpdateFn` operam apenas com `gw.organizationId` e `gw.plantId` autoritativos.
6. Papéis desconhecidos ou não mapeados em `tenant_memberships` continuam mapeados para `"VIEWER"` (princípio do menor privilégio) em [`mapTenantRoleToFleetRole`](file:///c:/Users/98911/Desktop/eletric/eletricaip/src/lib/edge/fleet-auth-context.server.ts).

---

## 2. Hardening SQL / RLS PostgreSQL (`20261111120000` & `20261111180000`)

A nova migration [`supabase/migrations/20261111180000_gate4_3_1_enterprise_persistence.sql`](file:///c:/Users/98911/Desktop/eletric/eletricaip/supabase/migrations/20261111180000_gate4_3_1_enterprise_persistence.sql) consolida a persistência relacional e segurança de banco:

- Tabelas persistentes com RLS habilitado (`ENABLE ROW LEVEL SECURITY`): `fleet_registered_gateways`, `fleet_gateways`, `gateway_certificates`, `remote_configs`, `provisioning_tokens`, `ota_campaigns`, `ota_applied_packages`, `edge_ingested_dedup`, `fleet_audit_chain`.
- Trigger append-only `public.prevent_fleet_audit_chain_mutation()` com `SECURITY DEFINER SET search_path = public` bloqueando `UPDATE` e `DELETE` na tabela `fleet_audit_chain`.
- Bloqueio total de acesso direto por clientes (`anon` e `authenticated`) sobre `gateway_certificate_challenges`, `webhook_processing_ledger`, `stripe_webhook_events`, `mp_webhook_processed` e `REVOKE ALL ON public.observability_slo_definitions FROM anon`.

### Bloqueio de Execução PostgreSQL ao Vivo neste Ambiente

- Serviço `com.docker.service` (`Docker Desktop`) permanece parado no host Windows e `psql` não está instalado localmente.
- Projeto Supabase remoto (`rvaaxvdimggztjxoktvy`) não foi alterado nem recebeu migrations conforme mandato de proteção de dados de produção.
- Portanto, a validação semântica das triggers append-only foi comprovada via SQLite real em runtime (mesma modelagem `BEFORE UPDATE / BEFORE DELETE RAISE`), enquanto a execução contra motor **PostgreSQL** real permanece registrada como **`BLOCKED_BY_ENVIRONMENT`** até que um daemon PostgreSQL/Docker local ou de homologação seja disponibilizado.
