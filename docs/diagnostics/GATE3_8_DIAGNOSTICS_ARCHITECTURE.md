# ELÉTRICAI INDUSTRIAL OS — GATE 3.8
# ARQUITETURA INTEGRADA DE DIAGNÓSTICO INDUSTRIAL

## 1. Visão Geral Arquitetural

O **Gate 3.8 (Industrial Diagnostics, Causal Correlation & Assisted Incident Resolution)** evolui a fundação de observabilidade estabelecida no Gate 3.7 para um motor integrado de diagnóstico industrial determinístico, correlação causal topológica, biblioteca de runbooks técnicos e investigação assistida.

A arquitetura preserva integralmente a separação de três camadas homologada nos Gates 3.4 a 3.7:

1. **ELÉTRICAI CLOUD**: Motor de correlação causal, grafo de dependências, motor de 30 regras determinísticas, assistente consultivo por IA, cálculo de confiabilidade (`MTTD`, `MTTA`, `MTTR`, `MTBF`) e trilha de investigação de incidentes.
2. **ELÉTRICAI EDGE**: Coleta determinística multi-protocolo, carimbo de tempo original (`sourceTimestamp`), numeração de sequência monotônica, buffer SQLite WAL Store-and-Forward e telemetria assinada.
3. **PHYSICAL INDUSTRIAL SYSTEMS**: PLCs, inversores, relés, disjuntores, sensores e atuadores em chão de fábrica, protegidos por intertravamento permanente `isPhysicalControlAllowed: false`.

---

## 2. Módulos Oficiais do Gate 3.8

- **Contratos e Tipos Canônicos**: [`src/lib/observability/types.ts`](../../src/lib/observability/types.ts)
- **Grafo de Dependências Industriais**: [`src/lib/observability/dependency-graph.ts`](../../src/lib/observability/dependency-graph.ts)
- **Motor de Correlação e Causalidade**: [`src/lib/observability/causal-correlation-engine.ts`](../../src/lib/observability/causal-correlation-engine.ts)
- **Motor de Diagnóstico Determinístico (30 Regras)**: [`src/lib/observability/diagnostic-rules-engine.ts`](../../src/lib/observability/diagnostic-rules-engine.ts)
- **Biblioteca de Procedimentos e Runbooks**: [`src/lib/observability/runbook-library.ts`](../../src/lib/observability/runbook-library.ts)
- **Assistente Consultivo por IA & Defesa Anti-Prompt-Injection**: [`src/lib/observability/ai-diagnostic-assistant.ts`](../../src/lib/observability/ai-diagnostic-assistant.ts)
- **Gerenciador de Incidentes e Investigação Assistida**: [`src/lib/observability/incident-manager.ts`](../../src/lib/observability/incident-manager.ts)
- **Calculadora de Confiabilidade (`MTTD`/`MTTA`/`MTTR`/`MTBF`)**: [`src/lib/observability/reliability-metrics.ts`](../../src/lib/observability/reliability-metrics.ts)
- **Server Functions RPC**: [`src/lib/observability/observability.functions.ts`](../../src/lib/observability/observability.functions.ts)
- **Centro de Operações e Diagnóstico (NOC/EOC UI)**: [`src/components/observability/industrial-operations-center.tsx`](../../src/components/observability/industrial-operations-center.tsx)

---

## 3. Dez Perguntas Respondidas por Evidência

| # | Pergunta Operacional | Componente Responsável |
|---|---|---|
| 1 | O que aconteceu? | `DeterministicDiagnosticEngine` + `IndustrialIncidentManager` |
| 2 | Quando começou? | `CausalChainAnalysis.firstSignalEvent.sourceTimestamp` |
| 3 | Qual componente apresentou o primeiro sinal? | `CausalChainAnalysis.firstSignalEvent.componentId` |
| 4 | Quais outros componentes foram afetados? | `IndustrialDependencyGraph.analyzeImpact()` |
| 5 | Qual é a causa mais provável? | `DeterministicDiagnosticRecord.hypothesis` + `CausalChainAnalysis.primaryCauses` |
| 6 | Quais evidências sustentam essa conclusão? | `DeterministicDiagnosticRecord.evidenceReferences` |
| 7 | Qual o impacto operacional? | `DependencyImpactAnalysis.impactScope` (Gateways, Protocolos, Equipamentos, Tags, Historian, SCADA) |
| 8 | O que a equipe técnica deve investigar? | `IndustrialRunbookLibrary` + `AiDiagnosticAssistant.recommendations` |
| 9 | O problema foi resolvido? | `IndustrialIncidentManager.validateOperationalRecovery()` |
| 10 | Quais evidências comprovam a recuperação? | `IncidentRecoveryValidation` ($\ge 3$ amostras saudáveis + persistência confirmada) |
