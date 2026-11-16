# 07 — Alarmes frente à ISA-18.2

## O que existe

`lib/scada/alarm-engine.ts` (603 linhas, testado em `scada-gate2-alarm-engine.test.ts`):

- Limites analógicos com histerese (`:379-395`) e atraso de ativação (`:241`).
- Estados de condição: `ACTIVE`, `RETURNED_TO_NORMAL`, `NORMAL`, `SUPPRESSED`; reconhecimento: `UNACKNOWLEDGED`/`ACKNOWLEDGED` (`types.ts:244-247`).
- Retorno ao normal sem reconhecimento mantém o alarme visível até o ack (`:196`, `:471-473`).
- Supressão e reativação (`:570-593`).

Banco: `alarm_configs` (HH/H/L/LL, deadband, atraso, severidade, `suppressible`, `require_acknowledgment`) e `alarm_history` (estado, ack, clear, nota do operador), ambos com RLS.

## Lacunas

| Requisito (resumo público ISA-18.2) | Situação | Evidência |
|---|---|---|
| Filosofia e racionalização (cada alarme com causa, consequência e ação) | Não existe; limites criados automaticamente | `scada-store.ts:257-282` (30/40 A para todo tag "CORRENTE") |
| Persistência de configuração | Não; `saveProjectAlarmConfigs` sem consumidor | doc 02 |
| Histórico de alarmes | Não; `recordAlarmHistoryBatch` sem consumidor | doc 02 |
| Shelving pelo operador com lista própria | Não existe | — |
| Fora de serviço (manutenção) com lista | Não existe | — |
| Supressão por projeto (estado da planta) | Parcial: há `SUPPRESSED`, sem regra de estado | `alarm-engine.ts:570` |
| Alarme de falha de comunicação | Não (status fixo "CONNECTED") | `scada-store.ts:162-190` |
| Monitoramento de desempenho (alarmes/hora, inundação, chattering, alarmes parados) | Não existe | — |
| Gestão de mudança e auditoria de configuração | Não (auditoria em memória) | doc 12 |
| Primeiro alarme (first-out) | Não existe | — |

## Sistemas de alarme paralelos

1. `scadaAlarmEngine` (SCADA, em memória).
2. `useAlarmStore` (`lib/alarm-store.ts`) + `alarm.functions.ts` (modo Alarmes do workspace, usa `alarm_configs`/`alarm_history`).
3. `lib/simulation/scada-engine.ts` (regras na aba Simulação).
4. Eventos de proteção do CCM (`motor-protection-engine.ts`).

O mesmo evento físico pode aparecer em lugares diferentes com nomes diferentes. A recomendação é um único serviço de alarmes por projeto (doc 14), mantendo o CCM como **fonte** de condições.

## Recomendação (Fase 3)

1. Remover a criação automática de limites; alarme só com configuração racionalizada pelo usuário (com causa, consequência e ação).
2. Persistir configuração e histórico nas tabelas existentes, ligando o modo Alarmes e o SCADA ao mesmo serviço.
3. Acrescentar shelving com prazo e fora de serviço, com listas e auditoria.
4. Alarme de comunicação a partir da qualidade real do tag (`STALE`/`NOT_CONNECTED`, já suportados pelo runtime).
5. Indicadores: alarmes por hora por operador, inundação, chattering, alarmes parados há mais de 24 h.
