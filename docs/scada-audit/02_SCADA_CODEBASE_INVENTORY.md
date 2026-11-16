# 02 — Inventário do código do SCADA

101 arquivos de `src/` citam "scada" (fora dos testes). Abaixo, os que formam o módulo, com linhas, papel e estado.

## Domínio (`src/lib/scada/`)

| Arquivo | Linhas | Papel | Estado |
|---|---|---|---|
| `scada-store.ts` | 1.106 | Store Zustand: contexto, tags, alarmes, KPIs, tick, comandos | ⚠️ mistura demo, simulação e dado de cliente; fabrica valores (doc 09) |
| `scada.functions.ts` | 961 | 9 server functions com `requireSupabaseAuth` | ✅ backend; 7 sem consumidor |
| `tag-runtime.ts` | 473 | Escala, deadband, qualidade, proveniência, dado velho | ✅ testado; subaproveitado |
| `alarm-engine.ts` | 603 | Alarmes analógicos/digitais, histerese, atraso, ack, supressão | ✅ testado; sem persistência; sem shelving/fora de serviço |
| `audit-verifier.ts` | 169 | Verifica cadeia de hash da auditoria | ✅ testado; sem uso |
| `energy-calculator.ts` | 195 | Cálculo de energia | ✅ testado; sem uso visível |
| `canonical-bridge.ts` | 164 | Projeto unificado → equipamentos/tags do SCADA | ⚠️ presume valores (doc 09) |
| `types.ts` | 382 | Tipos | ✅ |
| `demo-ete-seed.ts` | 914 | Planta de demonstração ETE | ✅ isolada por ID |
| `edge-ingest.functions.ts` | 59 | Ingestão de lote do Edge (token de gateway) | ✅ sem consumidor na UI (é para o Edge); lote sem limite |

## Interface (`src/components/scada/`)

| Arquivo | Linhas | Fonte de dados | Estado |
|---|---|---|---|
| `scada-layout.tsx` | 401 | contexto + store | ⚠️ ignora `canvasData`; demo CCM vira ETE |
| `scada-header.tsx` | 290 | store; dispara `tickSimulation` a cada 1 s | ✅ |
| `scada-sidebar.tsx` | 164 | store | ⚠️ "100% OK" fixo (:121) |
| `scada-os-status-bar.tsx` | 94 | — | ⚠️ "Drivers 100% OK" fixo (:55) |
| `equipment-inspector-drawer.tsx` | 369 | store | ✅ comandos só simulados |
| `bind-tag-dialog.tsx` | 178 | editor/projeto | ⚠️ outra base de tags |
| `synoptic/ete-synoptic-p-and-id.tsx` | 1.496 | demo ETE | ⚠️ exibido para qualquer projeto em Sinóticos |
| `views/scada-overview-view.tsx` | 982 | store | ⚠️ KPIs fixos (:337-370) |
| `views/scada-motors-view.tsx` | 628 | CCM (`motor-control-store`) | ✅ simulação rotulada |
| `views/scada-trends-view.tsx` | 442 | `trendHistory` em memória (2 min) | ⚠️ não consulta o histórico |
| `views/scada-communication-view.tsx` | 330 | `gatewayStatus` constante | ❌ dado fixo |
| `views/scada-alarms-view.tsx` | 296 | store | ✅ ack/limpar; ⚠️ sem persistência |
| `views/scada-tags-view.tsx` | 281 | store | ✅ forçar/desforçar (só memória) |
| `views/scada-reports-view.tsx` | 231 | 3 números do store | ⚠️ não usa o gerador de relatório do servidor |
| `views/scada-settings-view.tsx` | 196 | store (persistido no navegador) | ✅ |
| `views/scada-synoptics-view.tsx` | 182 | P&ID da ETE | ⚠️ |
| `views/scada-events-view.tsx` | 167 | `auditLogs` em memória | ⚠️ sem persistência |
| `views/scada-equipment-view.tsx` | 163 | store | ✅ |
| `views/scada-hmi-editor-view.tsx` | 35 | embrulha `scada-canvas.tsx` (615) | ✅ preservado; ⚠️ outra base |

## Simulação ligada ao SCADA (`src/lib/simulation/`)

`scada-engine.ts` (114, alarmes por regra na aba Simulação), `scada-worker.ts` + `script-sandbox.ts` (scripts do editor HMI em Web Worker), `motor-fleet.ts`, `motor-protection-engine.ts`, `motor-control-store.ts` (CCM), `plant-engine.ts`/`plant-store.ts` (planta 8M+2EX).

## Edge (`src/lib/edge/`)

Drivers somente leitura (`drivers/modbus-driver.ts`, `opcua-driver.ts`, `sparkplug-driver.ts`), outbox SQLite, provisionamento, frota, certificados, atualizações assinadas, guarda de rede. São consumidos pela tela `/settings/edge-fleet`, não pelo SCADA.

## Banco (somente leitura, `rvaaxvdimggztjxoktvy`)

| Tabela | RLS | Policies | Colunas relevantes | Uso pelo SCADA |
|---|---|---|---|---|
| `tag_samples` | sim | 2 | project_id, tag_name, value, quality, sampled_at | só via `ingestTagSamplesBatch` (não chamado) |
| `alarm_configs` | sim | 2 | limites HH/H/L/LL, deadband, delay, severidade, suppressible | não |
| `alarm_history` | sim | 2 | estado, ack, clear, nota do operador | não |
| `audit_logs` | sim | 1 | chain_hash, previous_hash | não |
| `trend_configs` | sim | 2 | tags, período, amostragem | não |
| `simulation_tags` | sim | 2 | — | não |
| `iot_readings`/`iot_devices`/`iot_alerts` | sim | 1/2/2 | (+ metric/unit após o SQL pendente) | não (usadas por `/realtime`) |

## Testes existentes

17 arquivos, 94 testes, **todos passam** (execução em 2026-11-16): `scada-gate1a-security-and-multitenancy`, `scada-gate1b-canonical-equipment`, `scada-gate2-alarm-engine`, `scada-gate2-tag-runtime`, `scada-gate2-historian-and-reports`, `scada-gate2-user-journey`, `scada-gate2-5-*` (auditoria, capacidade, energia, deadband, dado velho/forçamento), `scada-critical-runtime-resilience`, `scada-supervisory-system`, `scada-motors-view`, `scada-sandbox-*`, `motor-protection-engine`. Lacuna: nenhum teste verifica que a **interface** usa o histórico, persiste alarmes ou deixa de fabricar valores.
