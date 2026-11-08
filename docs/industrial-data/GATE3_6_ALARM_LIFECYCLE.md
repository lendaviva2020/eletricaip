# ELÉTRICAI INDUSTRIAL OS — GATE 3.6
# CICLO DE VIDA DETERMINÍSTICO DE ALARMES (`GATE3_6_ALARM_LIFECYCLE.md`)

## 1. Modelo Canônico de Alarmes (ISA-18.2)

O ciclo de vida de alarmes no Gate 3.6 unifica a detecção local no Edge Gateway com a supervisão e reconhecimento na Cloud sem criar instâncias duplicadas:

- **`AlarmDefinition`:** Define a regra de alarme vinculada a `(tenantId, plantId, tagId, equipmentId)` com condição (`HH`, `H`, `L`, `LL`, `DIGITAL_TRUE`, `DIGITAL_FALSE`, `BOOL_TRUE`, `BOOL_FALSE`), `threshold`, `deadband`, `severity` e `priority`.
- **`AlarmOccurrence`:** Representa uma ocorrência única de alarme identificada deterministicamente por:
  $$\text{occurrenceId} = \texttt{occ\_\{tenantId\}\_\{gatewayId\}\_\{edgeOccurrenceId\}}$$
- **`AlarmTransitionRecord`:** Registro imutável de transição ordenado por `transitionSequence` (`1, 2, 3, ...`) com `occurredAt`, `receivedAt`, `operatorId`, `value`, `quality` e `origin` (`"EDGE"` ou `"CLOUD_OPERATOR"`).

---

## 2. Sincronização Offline e Idempotência Edge → Cloud

1. **Detecção Offline no Edge:** Quando um limite é violado durante desconexão WAN, o Edge gera `edgeOccurrenceId` e grava as transições (`ACTIVATED` em $t_1$, `RETURNED_TO_NORMAL` em $t_2$) no buffer SQLite WAL.
2. **Replay Idempotente na Reconexão:** Ao receber o lote via `ingestEdgeBatch()`, `applyEdgeAlarmTransition()` verifica se `(occurrenceId, transitionSequence)` já existe.
   - Se **não existe**, adiciona a transição, reordena por `transitionSequence ASC`, recalcula o estado (`isActive`, `isAcknowledged`, `isShelved`, `activatedAt`) e incrementa `ingestedAlarmTransitions`.
   - Se **já existe** (retransmissão de rede), retorna `"DUPLICATE"` e incrementa `deduplicatedAlarmTransitions` sem duplicar eventos.
3. **Reconhecimento pelo Operador na Cloud (`acknowledgeAlarmOccurrence`):**
   - Valida RBAC do operador na planta (`VIEW_TELEMETRY`).
   - Anexa transição `ACKNOWLEDGED` com `origin: "CLOUD_OPERATOR"`, `operatorId: user.email` e `transitionSequence = max + 1`.
