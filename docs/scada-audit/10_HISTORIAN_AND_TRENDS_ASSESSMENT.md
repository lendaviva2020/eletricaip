# 10 — Histórico e tendências

## Situação

| Peça | Existe? | Usada? | Evidência |
|---|---|---|---|
| Tabela `tag_samples` (RLS, 2 policies) | Sim | Não | Colunas: project_id, tag_name, value, quality, sampled_at. **Sem origem, unidade, equipamento nem sequência** |
| Ingestão `ingestTagSamplesBatch` | Sim | Não chamada | `scada.functions.ts:263-334`; descarta `source`, `receivedAt` e `sequenceNumber` recebidos; `samples` sem limite máximo |
| Buffer no navegador | Sim | Cresce sem limite | `scada-store.ts:804`; `flushHistoricalSamples` sem chamador |
| Consulta `queryHistorianRange` | Sim | Não | `scada.functions.ts:336` |
| Tendências na interface | Sim | Só memória | `scada-trends-view.tsx:42,152`: últimos 120 pontos (2 min); sem dados, gera curva senoidal da ETE (`:433-438`, só demo) |
| Configuração de tendências | `trend_configs` | Não | — |
| Demo no servidor | Buffer em memória do processo (`demoHistoricalSamples`, 5.000) | — | Compartilhado por todos os usuários da instância; volátil em serverless |

## Riscos

1. **Dado simulado indistinguível de real** no histórico, se o envio for ligado como está (falta `source`).
2. **Vazamento de memória**: ~1 amostra por tag por segundo acumulada para sempre na aba aberta.
3. **Abuso de ingestão**: lote sem tamanho máximo.

## Comparação com um historian industrial (Ignition, doc 05)

| Recurso | Ignition (documentado) | ElétricAi |
|---|---|---|
| Amostragem por mudança/periódica | Sim | Por mudança (deadband) no runtime |
| Deadband analógico/discreto | Sim | Sim (valor absoluto) |
| Tempo máximo entre amostras | Sim | Não |
| Qualidade e origem por amostra | Sim | Qualidade sim; origem não |
| Agregação na consulta | Sim | `queryHistorianRange` calcula estatística básica; sem agregação por janela |
| Partição e retenção | Sim | Tabela comum; há função de partição mensal no banco (AGENTS.md §6.3), não usada pelo SCADA; sem retenção definida |

## Recomendação (Fase 4)

1. Migration acrescentando `source`, `unit`, `equipment_id`, `sequence` a `tag_samples` (exige aprovação explícita).
2. Ingestão com lote máximo (ex.: 500) e origem obrigatória; simulação só gravada se o usuário pedir, marcada como tal.
3. Envio periódico do buffer (ex.: a cada 10 s) com limite de memória (descartar o mais antigo e registrar perda).
4. Tendências consultando `queryHistorianRange` com agregação por janela; "Trend" a 1 clique em cada variável (imagem 4).
5. Retenção por plano (ex.: 30/90/365 dias), com expurgo agendado.
6. **Não** criar um banco de séries temporais separado agora: o Postgres com índice `(project_id, tag_name, sampled_at)` e partição mensal atende ao volume esperado.
