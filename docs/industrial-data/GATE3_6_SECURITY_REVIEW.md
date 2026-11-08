# ELÉTRICAI INDUSTRIAL OS — GATE 3.6
# REVISÃO DE SEGURANÇA MULTI-TENANT E FRONTEIRAS FÍSICAS (`GATE3_6_SECURITY_REVIEW.md`)

## 1. Isolamento Multi-Tenant e Multi-Planta

| Camada | Mecanismo Implementado | Código / Evidência |
| :--- | :--- | :--- |
| **Serviço de Domínio (`CanonicalIndustrialDataService`)** | Validação obrigatória de pertencimento `(tenantId, plantId)` em `registerPlant`, `registerSector`, `registerOrUpdateEquipment`, `registerOrUpdateTag`, `bindEquipmentToTag`, `registerGateway`, `registerGatewayTagSource`, `queryHistorian` e `getAlarmOccurrencesForPlant`. | `src/lib/industrial/canonical-data-service.ts` |
| **Proibição de Transferência de UUID** | Qualquer tentativa de reutilizar um `Equipment.id`, `IndustrialTag.tagId`, `Plant.id` ou `CanonicalGateway.id` em outro `tenantId` ou `plantId` lança `CanonicalIntegrityError("IDENTITY_TRANSFER_FORBIDDEN")`. | Cenário 02 (`src/__tests__/canonical-industrial-data-integration.test.ts`) |
| **RBAC de Frota e Planta (`FleetRbacEngine`)** | Operadores e administradores de planta (`PLANT_ADMIN`) restritos a `authorizedPlantIds`; usuários de outro tenant recebem `CROSS_TENANT_DENIED` / `FORBIDDEN`. | Cenários 02, 03 e 24 |
| **Banco de Dados (`PostgreSQL / Supabase RLS`)** | Todas as 14 tabelas `industrial_*` possuem `ENABLE ROW LEVEL SECURITY`, políticas `tenant_isolation_*` baseadas em `tenant_memberships` e chaves estrangeiras compostas `(tenant_id, plant_id)`. | `supabase/migrations/20261108090000_gate3_6_canonical_industrial_model.sql` |

---

## 2. Autenticação de Gateway e Allowlist de Aquisição Física

- **Escopo Derivado no Servidor:** `ingestEdgeBatch()` autentica `(gatewayId, credential)` no `CloudGatewayRegistry` e extrai `tenantId` e `plantId` do cadastro do servidor, impedindo falsificação de organização/planta pelo payload.
- **Allowlist `GatewayTagSource`:** Um gateway autenticado na Planta SP só pode publicar amostras para tags que possuam `GatewayTagSource` ativo vinculando `(gatewayId, tagId, sourceId)`. Tentativas de publicar em tags de outras plantas, outros tenants ou fontes não mapeadas são rejeitadas (`CROSS_TENANT_OR_PLANT_TAG` / `SOURCE_NOT_IN_ALLOWLIST`).

---

## 3. Invariante Inegociável: Bloqueio Permanente de Escrita Física

- `IS_PHYSICAL_CONTROL_ALLOWED = false` (`src/lib/industrial/types.ts`).
- `GatewayTagSourceSchema` exige `writeEnabled: z.literal(false)` e `registerGatewayTagSource()` invoca `assertPhysicalWriteForbidden()` caso `writeEnabled === true`.
- Na migração SQL (`industrial_gateway_tag_sources`), a coluna `write_enabled` possui `CHECK (write_enabled = false)`.
- Nenhum método de escrita em PLC, inversor, relé ou atuador físico existe na camada Cloud ou Edge.
