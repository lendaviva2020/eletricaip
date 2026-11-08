# ELÉTRICAI INDUSTRIAL OS — GATE 3.8
# DIAGNÓSTICO ASSISTIDO POR IA E PROTEÇÃO ANTI-PROMPT-INJECTION

## 1. Papel Estritamente Consultivo

O módulo [`AiDiagnosticAssistant`](../../src/lib/observability/ai-diagnostic-assistant.ts) opera exclusivamente como camada consultiva e explicativa sobre os resultados já produzidos pelo motor determinístico (`DeterministicDiagnosticEngine`), pelo grafo de dependências (`IndustrialDependencyGraph`), pelos eventos correlacionados (`IndustrialCorrelationEngine`), pelo Historian e pelos Runbooks aprovados.

Invariantes permanentes em todas as respostas (`AiDiagnosticAnalysis`):
- `isConsultativeOnly: true`
- `isPhysicalControlAllowed: false`

---

## 2. Estrutura Obrigatória da Resposta

Toda análise retornada contém:
1. `observedFacts`: Fatos verificados nos snapshots, eventos e contadores.
2. `availableEvidence`: Referências explícitas (`EVENT`, `DIAGNOSTIC_RULE`, `DEPENDENCY_GRAPH`, `HISTORIAN`, `RUNBOOK`).
3. `hypotheses`: Hipóteses formuladas pelas regras determinísticas.
4. `probableCauses`: Causas prováveis sustentadas por evidência.
5. `missingInformation`: Dados necessários para elevar a confiança ou confirmar hipóteses pendentes.
6. `recommendations`: Passos técnicos vinculados a `RunbookActionType` e `runbookId`.
7. `confidenceLevel` (`HIGH`, `MEDIUM`, `LOW`, `INCONCLUSIVE`) e `confidenceScore`.

---

## 3. Tratamento de Inconclusão e Fallback Determinístico

- **Falta de Evidências (`DIAGNOSTIC_INCONCLUSIVE`)**: Quando os dados disponíveis são insuficientes (`RULE_00_INSUFFICIENT_EVIDENCE` ou `RULE_21_SOURCE_STATE_UNKNOWN`), o assistente jamais inventa causas; retorna `status: "DIAGNOSTIC_INCONCLUSIVE"` e lista as verificações necessárias em `missingInformation`.
- **Indisponibilidade do Serviço de IA (`AI_SERVICE_UNAVAILABLE_FALLBACK`)**: Caso o provedor externo de IA esteja indisponível, o sistema mantém 100% da capacidade diagnóstica preenchendo a resposta a partir do motor determinístico e da biblioteca de runbooks.

---

## 4. Defesa contra Prompt Injection Industrial

A função `sanitizeIndustrialContentForAi()` trata qualquer string proveniente do campo (nomes de tags, descrições de equipamentos, mensagens de PLC, textos de alarmes e comentários) como **dado não confiável**:

- Detecta e neutraliza padrões como `ignore previous instructions`, `system prompt`, `isPhysicalControlAllowed: true`, `write modbus`, `publish ncmd/dcmd`, `start motor`, blocos `<script>` e delimitadores de sistema.
- Registra `promptInjectionDetected: true` e `sanitizedUntrustedInputsCount` para auditoria de segurança.
- Aplica rate limiting por `tenantId` e `userId` (`30 req/min`).
