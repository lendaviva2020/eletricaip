# ELÉTRICAI INDUSTRIAL OS — GATE 3.6
# INTEGRAÇÃO SCADA SUPERVISÓRIO & HISTORIAN (`GATE3_6_SCADA_HISTORIAN_INTEGRATION.md`)

## 1. Estado em Tempo Real Determinístico (`getTagRealtimeState`)

O método `CanonicalIndustrialDataService.getTagRealtimeState(user, tagId, now)` avalia RBAC multi-tenant/planta (`VIEW_TELEMETRY`) e retorna `TagRuntimeValueState` contendo:

- Identidade completa: `tagId`, `tenantId`, `plantId`, `equipmentId`, `gatewayId`, `sourceId`, `canonicalName`, `displayName`, `engineeringUnit`.
- Valores separados:
  - `currentValue`: valor atual de engenharia (ou valor forçado se `isForced === true`).
  - `rawValue`: valor bruto da última amostra.
  - `lastValidValue` e `lastValidTimestamp`: último valor com qualidade `GOOD` confirmado, preservado mesmo quando a tag entra em `STALE_DATA` ou `NOT_CONNECTED`.
- Metadados temporais: `sourceTimestamp`, `ingestionTimestamp`, `sequenceNumber`, `dataAgeMs` (`now - sourceTimestamp`), `isLate`.
- Estado e proveniência: `quality` e `provenance` (`PHYSICAL_DATA`, `SIMULATED_DATA`, `INTERNAL_RUNTIME`, `CALCULATED_DATA`, `FORCED_DATA`, `STALE_DATA`, `BAD_QUALITY`, `NOT_CONNECTED`).

---

## 2. Transições Determinísticas `STALE_DATA` e `NOT_CONNECTED`

1. **`NOT_CONNECTED`:**
   - Quando `setGatewayConnectivity(gatewayId, false)` é acionado (perda de heartbeat/sessão do Edge Gateway).
   - Quando a tag é `sourceKind === "PHYSICAL"`, mas não possui `GatewayTagSource` ativo.
   - Quando nenhuma amostra foi recebida desde a criação da tag.
2. **`STALE_DATA`:**
   - Quando o gateway está conectado, mas `now - latestSample.sourceTimestamp > tag.staleAfterMs`.
   - O supervisório exibe `provenance = "STALE_DATA"`, `quality = "STALE"`, `dataAgeMs` e preserva `lastValidValue`.
3. **Recuperação Automática:**
   - Assim que um novo lote válido do Edge Gateway é ingerido com amostra recente, `gatewayOffline` retorna a `false` e a tag reassume `PHYSICAL_DATA` imediatamente.

---

## 3. Integridade e Imutabilidade do Historian (`queryHistorian`)

- Cada `HistorianSample` grava `tagRevision` e `configurationVersion` vigentes no exato instante da ingestão.
- Se uma tag tiver sua escala (`scale`), `offset` ou unidade alterada na revisão $R+1$, todas as amostras históricas gravadas na revisão $R$ permanecem **100% imutáveis** com o `rawValue`, `engineeringValue` e `transformation` originais da época da coleta.
- Consultas via `queryHistorian(user, { tenantId, plantId, tagId, fromSourceTimestamp, toSourceTimestamp })` validam RBAC e pertencimento da tag ao `(tenantId, plantId)` solicitado.
