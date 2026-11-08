# ELÉTRICAI INDUSTRIAL OS — GATE 3.8
# MOTOR DE CORRELAÇÃO CAUSAL E GRAFO DE DEPENDÊNCIAS

## 1. Princípios de Correlação Industrial

O módulo [`IndustrialCorrelationEngine`](../../src/lib/observability/causal-correlation-engine.ts) correlaciona eventos operacionais em janelas temporais configuráveis combinando:

- Identidade multi-tenant (`tenantId`, `plantId`)
- Identidade canônica (`componentId`, `equipmentId`, `gatewayId`, `tagId`)
- Rastreabilidade (`correlationId`, `traceId`, `sequenceNumber`)
- Metadados temporais imutáveis (`sourceTimestamp`, `observedAt`, `ingestionTimestamp`, `clockDriftMs`, `isOutOfOrder`)

Todos os eventos recebidos são congelados (`Object.freeze`) na ingestão. A correlação **nunca** altera nem sobrescreve o timestamp original da fonte física (`sourceTimestamp`).

---

## 2. Grafo de Dependências Industriais

O módulo [`IndustrialDependencyGraph`](../../src/lib/observability/dependency-graph.ts) modela explicitamente as relações direcionadas `fromComponentId (Upstream) -> toComponentId (Downstream)`:

- `Edge Gateway -> Protocolo (Modbus TCP / OPC UA / MQTT Sparkplug B)`
- `Protocolo -> Equipamento Industrial (UUID Canônico Gate 3.6)`
- `Equipamento -> Tag Industrial (UUID Canônico Gate 3.6)`
- `Tag -> Historian Storage`
- `Tag -> Visualização SCADA`

### Estados de Validação de Aresta

- `VALIDATED_CANONICAL`: Relação confirmada pelo cadastro canônico do Gate 3.6.
- `CONFIGURED_UNVERIFIED`: Relação configurada aguardando confirmação de telemetria.
- `UNKNOWN`: Relação não validada — **não é usada para confirmar causa raiz**.

---

## 3. Regra Anti-Falso-Positivo por Correlação Temporal

1. **Correlação temporal isolada nunca produz `CONFIRMED_BY_EVIDENCE`**: se dois eventos ocorrem próximos no tempo sem caminho de dependência validado no grafo ou sem prova determinística multi-condição, a relação temporal isolada é sinalizada com `temporalOnlyCorrelationRejected: true` e o status permanece no máximo como `SUSPECTED`.
2. **Múltiplas falhas simultâneas independentes**: falhas em ramos sem dependência mútua são classificadas como `INDEPENDENT_ANOMALY`, preservando `hasMultipleIndependentCauses: true`.
3. **Supressão segura de ruído visual**: sintomas secundários de infraestrutura (`SECONDARY_PROPAGATED_SYMPTOM`) recebem `suppressedVisualAlert: true` mantendo `preservedOriginalEvent` intacto. Alarmes industriais de processo (`isProcessSafetyAlarm: true`) **jamais** são suprimidos.
