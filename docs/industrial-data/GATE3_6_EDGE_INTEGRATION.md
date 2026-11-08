# ELÉTRICAI INDUSTRIAL OS — GATE 3.6
# INTEGRAÇÃO CANÔNICA EDGE GATEWAY ↔ CLOUD (`GATE3_6_EDGE_INTEGRATION.md`)

## 1. Autenticação e Escopo Derivado no Servidor

Na ingestão de lotes via `CanonicalIndustrialDataService.ingestEdgeBatch(rawBatch, credential, ingestionTimestamp)`:

1. O payload é validado contra `CanonicalEdgeBatchSchema` (`protocolVersion: "1.1.0"`, `gatewayId`, `batchId`, `batchSequenceNumber`, `sentAt`, `samples`, `alarms`).
2. O gateway é autenticado em `CloudGatewayRegistry.authenticateGateway(gatewayId, credential)`. Gateways desconhecidos, revogados ou com credencial inválida são rejeitados imediatamente com HTTP `401`/`403` e `accepted: false`.
3. O escopo `(tenantId, plantId)` **nunca é confiado a partir do payload do Edge**; é derivado exclusivamente do registro canônico do gateway autenticado no servidor (`this.gateways.get(batch.gatewayId)`).

---

## 2. Allowlist Explícita de Aquisição Física (`GatewayTagSource`)

Uma tag cadastrada como `PHYSICAL` **não aceita dados de qualquer gateway**:
- Deve existir um registro `GatewayTagSource` com `active: true` e `writeEnabled: false` vinculando `(gatewayId, tagId, sourceId)` na mesma planta e organização.
- Amostras para tags inexistentes (`UNKNOWN_TAG`), de outra planta/tenant (`CROSS_TENANT_OR_PLANT_TAG`) ou sem mapeamento ativo na allowlist (`SOURCE_NOT_IN_ALLOWLIST`) são rejeitadas individualmente em `rejectedSamples` sem derrubar as amostras válidas do lote.

---

## 3. Preservação de Timestamps e Sequência Monotônica

Cada amostra ingerida preserva integralmente os três marcos temporais e a ordem de origem:
- `sequenceNumber`: inteiro monotônico atribuído na coleta no Edge.
- `sourceTimestamp`: timestamp exato da leitura no dispositivo/protocolo físico (**jamais sobrescrito por `ingestionTimestamp`**).
- `edgeReceivedAt`: timestamp de recepção/empacotamento no daemon Edge.
- `ingestionTimestamp`: timestamp de chegada e processamento na Cloud.

---

## 4. Deduplicação Idempotente e Amostras Fora de Ordem (Store-and-Forward)

- **Chave de Deduplicação:** `${gatewayId}|${tagId}|${sourceId}|${sequenceNumber}|${sourceTimestamp}` (e constraint `UNIQUE (gateway_id, tag_id, source_id, sequence_number, source_timestamp_ms)` no PostgreSQL).
- Reenvios de lotes após reconexão WAN incrementam `deduplicatedSampleCount` sem duplicar linhas no Historian.
- **Amostras Atrasadas (`isLate`):** Se uma amostra de buffer offline chega com `sourceTimestamp` anterior ao `latestSample.sourceTimestamp` já exibido em tempo real:
  - Ela é marcada com `isLate: true`.
  - É inserida na posição cronológica exata no Historian (`sourceTimestamp ASC, sequenceNumber ASC`).
  - **Não regride** o ponteiro `latestSample` de tempo real do SCADA.
