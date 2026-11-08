# ELÉTRICAI INDUSTRIAL OS — GATE 3.8
# FLUXO DE INVESTIGAÇÃO E RESOLUÇÃO ASSISTIDA DE INCIDENTES

## 1. Extensão Unificada do Ciclo de Vida de Incidentes

Em conformidade com a Fase 7 do Gate 3.8, o [`IndustrialIncidentManager`](../../src/lib/observability/incident-manager.ts) estende o modelo `IndustrialIncident` do Gate 3.7 sem criar um segundo sistema paralelo de incidentes.

Estágios formais de investigação (`IncidentInvestigationStage`):
1. `INCIDENT_DETECTED`: Incidente aberto e primeiro sinal registrado.
2. `ROOT_CAUSE_SUSPECTED`: Diagnósticos determinísticos anexados (`attachDiagnosticAnalysis`) e causa provável (`probableCause`) calculada.
3. `ROOT_CAUSE_CONFIRMED`: Causa raiz confirmada por evidência (`confirmRootCause`), bloqueando confirmação caso baseada apenas em correlação temporal.
4. `MITIGATION_RECORDED`: Plano de investigação e ação mitigadora registrados (`recordInvestigationAndMitigation`).
5. `RECOVERY_OBSERVED`: Janela consistente de recuperação validada (`validateOperationalRecovery`).
6. `INCIDENT_RESOLVED`: Incidente formalmente resolvido com cadeia de auditoria SHA-256 verificável.

---

## 2. Gestão de Hipóteses Descartadas

Quando uma hipótese diagnóstica é refutada durante a investigação técnica, o método `rejectHypothesis()` move a hipótese para `incident.rejectedHypotheses` (registrando `diagnosticId`, `hypothesis`, `rejectedBy`, `rejectedAt` e `reason`) e adiciona um bloco assinado na trilha `auditTrail` sem apagar o histórico.

---

## 3. Regra de Validação Consistente de Recuperação

- Uma única amostra saudável isolada **jamais** confirma a recuperação nem permite transicionar o incidente para `RESOLVED`.
- `validateOperationalRecovery()` exige simultaneamente:
  - `observedHealthySamples >= requiredSamples` (mínimo $\ge 3$ amostras saudáveis consecutivas)
  - `dataPersistedVerified === true` (persistência histórica confirmada)

---

## 4. Indicadores Reais de Confiabilidade (Fase 9)

O módulo [`IndustrialReliabilityCalculator`](../../src/lib/observability/reliability-metrics.ts) calcula a partir de dados reais:
- **MTTD**: `mean(detectedAt - firstObservedAt)`
- **MTTA**: `mean(acknowledgedAt - (detectedAt ?? firstObservedAt))`
- **MTTR (Recuperação Operacional)**: `mean(recoveredAt - firstObservedAt)` (apenas incidentes fechados)
- **MTTR (Resolução Formal)**: `mean(resolvedAt - firstObservedAt)` (apenas incidentes fechados)
- **MTBF**: `mean(nextIncident.firstObservedAt - prevIncident.recoveredAt)` quando houver $\ge 2$ falhas fechadas na janela; caso contrário retorna explicitamente `"INSUFFICIENT_DATA"`.
