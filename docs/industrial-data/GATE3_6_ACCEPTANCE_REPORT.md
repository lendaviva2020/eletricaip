# ELÉTRICAI INDUSTRIAL OS — GATE 3.6
# RELATÓRIO DE AUDITORIA, VALIDAÇÃO E HOMOLOGAÇÃO (`GATE3_6_ACCEPTANCE_REPORT.md`)

**Data:** 2026-11-08  
**Branch:** `main` (HEAD base `d2955d012ee9a31095c9bcdf2d077adae8d9c517`)  
**Veredito Técnico:** `APPROVED_FOR_CANONICAL_INDUSTRIAL_DATA_INTEGRATION`  
**Invariante de Segurança Física:** `isPhysicalControlAllowed: false` (`IS_PHYSICAL_CONTROL_ALLOWED = false`)

---

## 1. Resumo Executivo

O **Gate 3.6 (Canonical Industrial Data Integration)** auditou o estado pós-Gates 3.4 e 3.5 e consolidou um modelo canônico único de dados industriais ponta a ponta (`Organization → Plant → Sector → Equipment → IndustrialTag → CanonicalGateway → GatewayTagSource → HistorianSample / AlarmOccurrence`), integrando `UnifiedProjectDoc` (Unifilar, Multifilar, Ladder, FBD e PLC), Frota de Edge Gateways, SCADA Supervisório, Motor de Alarmes (ISA-18.2) e Historian sem cadastros paralelos.

---

## 2. Matriz de Riscos e Lacunas Identificadas e Corrigidas

| ID | Descrição | Severidade | Componente Afetado | Evidência Reprodutível | Impacto Operacional | Correção Implementada | Teste de Validação | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RISK-3.6-01** | Tabelas legadas (`plant_telemetry`, `iot_readings`, `tag_samples`, `simulation_tags`) sem hierarquia canônica unificada `(tenant_id, plant_id, equipment_id, tag_id, gateway_id, source_id)` e `plant_telemetry` sem `tenant_id`. | CRÍTICO | `supabase/migrations/20261014201000_core_tables_ddl.sql` | Inspeção DDL mostrou `plant_telemetry` sem coluna `tenant_id` e `iot_readings.device_id` como texto livre. | Risco de fragmentação de séries temporais e ausência de isolamento nativo por planta/equipamento. | Criada migração incremental `supabase/migrations/20261108090000_gate3_6_canonical_industrial_model.sql` com 14 tabelas `industrial_*`, FKs compostas `(tenant_id, plant_id)` e RLS estrito. | Cenários 02, 03, 23 e 24 (`src/__tests__/canonical-industrial-data-integration.test.ts`) | **CORRIGIDO / TESTADO** |
| **RISK-3.6-02** | Ausência de distinção explícita para variáveis calculadas (`CALCULATED_DATA`) e validação de allowlist física (`GatewayTagSource`) antes de rotular `PHYSICAL_DATA`. | ALTO | `src/lib/scada/types.ts`, `src/lib/industrial/*` | Tags configuradas com driver físico podiam exibir `PHYSICAL_DATA` mesmo sem fonte ativa vinculada a um gateway autenticado. | Risco de induzir o operador a confundir dado sem fonte ativa ou calculado com leitura física real. | Adicionado `CALCULATED_DATA` em `DataSourceProvenance`, implementado `GatewayTagSource` obrigatório e validação em `getTagRealtimeState()` e `resolveTagProvenance()`. | Cenários 05, 06 e 17 | **CORRIGIDO / TESTADO** |
| **RISK-3.6-03** | Risco de quebra de vínculo histórico quando equipamento ou tag são renomeados nos diagramas de engenharia. | ALTO | `src/lib/industrial/canonical-data-service.ts` | Renomear `tagCode` ou `canonicalName` sem versionamento formal perdia rastreabilidade da revisão da época da coleta. | Perda de correlação de auditoria no Historian após alteração de escala ou nome. | Implementado controle de revisões `EquipmentRevision` e `TagRevision` preservando UUID imutável e gravando `tagRevision` e `configurationVersion` em cada `HistorianSample`. | Cenários 01 e 23 | **CORRIGIDO / TESTADO** |
| **RISK-3.6-04** | Risco de amostras atrasadas (store-and-forward replay) regredirem o valor em tempo real do SCADA ou duplicarem linhas no Historian. | ALTO | `src/lib/industrial/canonical-data-service.ts` | Lotes reenviados após queda WAN podem chegar fora de ordem ou repetidos. | Exibição de valor antigo como atual no supervisório ou inflação de médias no Historian. | Deduplicação idempotente por `(gatewayId, tagId, sourceId, sequenceNumber, sourceTimestamp)` e flag `isLate: true` que ordena no Historian sem regredir `latestSample`. | Cenários 08, 09, 10, 11 e 12 | **CORRIGIDO / TESTADO** |
| **RISK-3.6-05** | Risco de duplicação de ocorrências de alarme entre detecção offline no Edge e reconhecimento na Cloud. | MÉDIO | `src/lib/industrial/canonical-data-service.ts` | Retransmissão de lotes de alarme sem sequência determinística por ocorrência. | Múltiplos alarmes duplicados na tela ISA-18.2 após reconexão do gateway. | Identidade determinística `occurrenceId = occ_${tenantId}_${gatewayId}_${edgeOccurrenceId}` e idempotência por `transitionSequence`. | Cenários 21 e 22 | **CORRIGIDO / TESTADO** |

---

## 3. Resultados da Suíte de Aceitação (30 Cenários Obrigatórios)

Arquivo: `src/__tests__/canonical-industrial-data-integration.test.ts`  
Execução: `30 pass / 0 fail` (`131 expect() calls`).

1. **Cenário 01 — Identidade persistente após renomeação:** PASS
2. **Cenário 02 — Isolamento entre tenants:** PASS
3. **Cenário 03 — Isolamento entre plantas:** PASS
4. **Cenário 04 — Associação válida `Equipment → Tag`:** PASS
5. **Cenário 05 — Associação válida `Gateway → Tag`:** PASS
6. **Cenário 06 — Rejeição de tag desconhecida / fonte fora da allowlist:** PASS
7. **Cenário 07 — Rejeição de gateway não autorizado (HTTP 401/403):** PASS
8. **Cenário 08 — Deduplicação idempotente de amostras:** PASS
9. **Cenário 09 — Preservação de `sequenceNumber`:** PASS
10. **Cenário 10 — Preservação de `sourceTimestamp`:** PASS
11. **Cenário 11 — Preservação de `ingestionTimestamp`:** PASS
12. **Cenário 12 — Tratamento de dados fora de ordem (`isLate`):** PASS
13. **Cenário 13 — Conversão de unidade de engenharia (`kW→W`, `bar→kPa`, `K→°C`):** PASS
14. **Cenário 14 — Aplicação de `scale` e `offset` preservando `rawValue`:** PASS
15. **Cenário 15 — Rejeição de `NaN` e `±Infinity` (`NON_FINITE`):** PASS
16. **Cenário 16 — Preservação de qualidade da amostra (`GOOD`, `UNCERTAIN`, `BAD`):** PASS
17. **Cenário 17 — Distinção entre `PHYSICAL_DATA`, `SIMULATED_DATA`, `INTERNAL_RUNTIME`, `CALCULATED_DATA` e `FORCED_DATA`:** PASS
18. **Cenário 18 — Transição determinística para `STALE_DATA`:** PASS
19. **Cenário 19 — Transição determinística para `NOT_CONNECTED`:** PASS
20. **Cenário 20 — Recuperação automática após reconexão:** PASS
21. **Cenário 21 — Persistência e replay de alarme offline:** PASS
22. **Cenário 22 — Idempotência na sincronização de alarmes e ACK na Cloud:** PASS
23. **Cenário 23 — Integridade e imutabilidade do Historian por revisão:** PASS
24. **Cenário 24 — Bloqueio de acesso cruzado entre tenants:** PASS
25. **Cenário 25 — Bloqueio permanente de escrita física (`isPhysicalControlAllowed === false`):** PASS
26. **Cenário 26 — Zero regressões no Unifilar:** PASS
27. **Cenário 27 — Zero regressões no Multifilar:** PASS
28. **Cenário 28 — Zero regressões no Ladder:** PASS
29. **Cenário 29 — Zero regressões no FBD:** PASS
30. **Cenário 30 — Zero regressões no SCADA:** PASS

---

## 4. Classificação de Maturidade e Escopo de Validação

| Categoria | Escopo no Gate 3.6 |
| :--- | :--- |
| **IMPLEMENTADO** | Modelo canônico (`src/lib/industrial/*`), conversor dimensional (`units.ts`), contrato de transformação (`tag-contract.ts`), serviço de integração (`canonical-data-service.ts`), ponte SCADA (`canonical-bridge.ts`), badge `CALCULATED_DATA` (`scada-tags-view.tsx`) e migração SQL local (`20261108090000_gate3_6_canonical_industrial_model.sql`). |
| **TESTADO** | 30 cenários automatizados de aceitação (`src/__tests__/canonical-industrial-data-integration.test.ts`) + suítes de regressão dos Gates 3.4 e 3.5 + `tsc --noEmit`. |
| **VALIDADO EM INTEGRAÇÃO** | Integração em memória/serviço entre `UnifiedProjectDoc` (Unifilar, Multifilar, Ladder, FBD, PLC), `CloudGatewayRegistry`, `FleetRbacEngine`, `ScadaStore` e `CanonicalIndustrialDataService`. |
| **VALIDADO EM BANCADA** | Protocolos read-only do Edge Daemon validados em bancada isolada nos Gates 3.1–3.3 (preservados integralmente). |
| **VALIDADO EM CAMPO** | **NÃO APLICÁVEL / NÃO EXECUTADO** — Nenhuma conexão com planta industrial em produção foi realizada. |
| **NÃO VALIDADO** | Aplicação remota da migração SQL no cluster Supabase de produção (mantida exclusivamente local conforme regra de governança do Gate 3.6). |

---

## 5. Veredito Final

**`APPROVED_FOR_CANONICAL_INDUSTRIAL_DATA_INTEGRATION`**
