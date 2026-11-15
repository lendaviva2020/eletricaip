# 04 — Auditoria Módulo a Módulo

Estado por módulo no ciclo 1. "Implementação real" só é afirmada quando o código foi lido ou quando um executor concreto foi localizado.

| Módulo | Arquivos principais | Ciclo 1 | Evidência / estado |
|---|---|---|---|
| Autenticação e sessão | `integrations/supabase/*`, `routes/login`, `signup`, `forgot/reset-password`, `auth.callback` | Middleware lido; rotas de UI não | Ver doc 07. UI: NOT_VERIFIED |
| Tenants, equipe e convites | `tenants.functions.ts`, `settings.team.tsx`, `invite.$token.tsx` | Server functions lidas | P1-SEC-009 |
| Projetos e persistência | `projects.functions.ts` (813 l.), `project-store.ts`, `use-project-persistence.ts` | Save, load, versão e import lidos (ciclo 2) | P1-DATA-043, P1-DATA-044, P1-DATA-046, P2-DATA-045, P2-DATA-047 (doc 10) |
| Diagnóstico de queda de tensão no canvas | `diagram/multifilar.ts:454-680` | Lido (ciclo 2) | P1-CALC-050/051, P2-CALC-052 (doc 05 §7) |
| Unifilar | `lib/diagram/*`, `diagram/connection/*` (engine, repair, graph-validator, router) | NOT_REVIEWED | Conexões são modeladas como arestas com `sourcePort`/`targetPort` (visto em `engineering-tools`); a semântica elétrica de terminais está pendente |
| Multifilar | `lib/diagram/multifilar.ts` (686 l.) | NOT_REVIEWED | Correspondência de ids: pendente |
| Ladder | `lib/ladder/scan-core.ts` (`scanRungsPure`, l.1211), `runtime.ts`, `compiler.ts`, `validator.ts` | Executor e TON lidos (ciclo 2) | Executa lógica real: topologia de ramos, saídas, propagação entre redes no mesmo scan; TON IEC correto (`scan-core.ts:142-173`). P3: a função "pura" muta `rung.poweredOut` (l.~1250). TOF, TP, contadores e tipagem: pendentes |
| FBD | `lib/fbd/runtime.ts` (`scanFbd`, l.87), `compiler.ts`, `engine/` | Executor localizado | Pendente |
| PLC / Compact Studio / Studio IEC | `lib/plc/*`, `lib/compact-studio/*` (38), `lib/studio/*` (43) | NOT_REVIEWED | — |
| SCADA | `lib/scada/*`, `simulation/scada-engine.ts`, `scada-worker.ts` | Worker lido parcialmente | P2-SEC-034; `scada/demo-ete-seed.ts` indica dados de demonstração (avaliar se aparecem como reais) |
| Simulação | `simulation/plant-engine.ts` (`stepPlant`, determinístico), `safety-core.ts` | Executor localizado | Pendente |
| Alarmes e diagnósticos | `alarm.functions.ts`, `scada/alarm-engine.ts`, `diagnostics/*`, `observability/*` | NOT_REVIEWED | — |
| IA e chat | `ai-chat.functions.ts`, `lib/ai/**` | Parcial | Doc 09 |
| IoT e Edge | `iot.functions.ts`, `api/public/iot.ingest.ts`, `lib/edge/*` (26), `edge-daemon/*` | IoT lido; daemon, drivers e sync lidos no ciclo 2 | **P1-INC-048: comunicação industrial real NOT_IMPLEMENTED, apresentada como operacional.** `modbus-driver.ts:143-151` ("Simulated TCP Handshake", leituras de Maps de laboratório); `sparkplug-driver.ts:154-162` ("Simulated MQTT CONNECT"); `daemon.ts:164-183` registra "Driver conectado com sucesso" e "operação normal"; `gateway-manager.ts:62-69` não recebe `transportFn`, então `cloud-sync-client.ts:171` usa "simulated transport" e nenhuma telemetria sai do edge; o endpoint default `api.eletricai.com/v1/edge/sync` (`edge-daemon/config.ts:104`) não é rota desta aplicação |
| Cobrança | `billing.functions.ts`, webhooks | Webhooks lidos | P2-BILL-011/012 |
| Importador / exportação | `lib/importer/*` (12), `dxf-export`, `pdf-export`, `dossier/*` | NOT_REVIEWED | — |
| Landing, dashboard, settings | `routes/index`, `dashboard`, `settings.*` (17 rotas) | NOT_REVIEWED | Navegação no browser não executada |
| Digital Twin (removido) | migration `20261114150000_drop_digital_twin_module.sql` | Grep | 5 referências restantes só em `src/integrations/supabase/types.ts` (tipos gerados não regenerados); nenhuma em código-fonte de produção (P3-CLEAN-039) |

## Problemas conhecidos (§16 do pedido): estado no ciclo 1

| # | Problema | Estado |
|---|---|---|
| 1 | Conexões incompletas no Unifilar | **Mitigado no código**: o reparo não inventa conexões e as propostas exigem aprovação; verificação visual BLOCKED (precisa de projeto e Supabase) |
| 2 | Unifilar × Multifilar | NOT_VERIFIED |
| 3 | Diagnósticos em todos os Canvas | NOT_VERIFIED |
| 4 | IDs visuais × lógicos | NOT_VERIFIED |
| 5 | Dimensionamento de cabos | **PERSISTE**: P1-CALC-023, P1-CALC-027 |
| 6 | Queda de tensão | **PERSISTE**: P1-CALC-022, P1-CALC-026, P1-CALC-050 (dois motores divergentes) |
| 7 | Limites normativos indiscriminados | **PERSISTE**: P1-CALC-025 (5% único no dimensionamento) e 4% para todas as arestas no canvas (doc 05 §7) |
| 8 | Premissas como dados confirmados | **PERSISTE**: defaults silenciosos (cosφ 0,86, η 0,92, 380 V, método C, 30 °C, div 0,85), P3-CALC-033 |
| 9 | Diagnósticos duplicados | NOT_VERIFIED |
| 10 | Zoom / fit-to-view | BLOCKED_BY_EXTERNAL_DEPENDENCY (canvas exige projeto) |
| 11 | Responsividade | **Sem overflow horizontal em 375 px** nas 7 rotas testadas; canvas BLOCKED |
| 12 | Salvamento incompleto | **PERSISTE (causa provável)**: P1-DATA-046 (Studio só local), P1-DATA-043 (lost update) |
| 13 | Perda de conexões ao reabrir | **Mecanismo de risco identificado**: P1-DATA-044 (snapshot inválido → vazio → sobrescrita); o load do `DiagramDoc` preserva conexões quando o parse passa |
| 14 | IA sem provedor configurado | **PARCIAL**: há chave Gemini local; DeepSeek e Lovable não verificados; três convenções (P2-AI-016) |
| 15 | Memória incompleta do chat | **CORRIGIDO no código lido**: o histórico é recarregado e enviado; persistência entre sessões NOT_VERIFIED |
| 16 | Correção por IA sem validação | NOT_VERIFIED |
| 17 | PLC só visual | **PARCIAL**: a lógica Ladder executa de fato; a **comunicação com CLP real não existe** (drivers simulados, P1-INC-048) |
| 18 | Simulação sem lógica | **CORRIGIDO para Ladder** (`scanRungsPure` executa a lógica); FBD e planta pendentes |
| 19 | Integração SCADA/Ladder/FBD | NOT_VERIFIED |
| 20 | Resíduos do Digital Twin | **PARCIAL**: só nos tipos gerados |

## Ciclo 3

| Módulo | Evidência |
|---|---|
| Importador universal | `security-validator.ts`: limites de 25 MB, profundidade 15, 150 mil chaves, linhas e tamanho de propriedade; bloqueia `__proto__`, `constructor` e `prototype`; denylist de padrões de script; não usa eval; validação XML dedicada no adaptador PLCopen. **P2-IMP-055:** `universal-importer.ts:363` descarta arestas com origem ou destino inexistente **sem registrar issue** (o adaptador JSON registra em `json-adapter.ts:172-199`, mas os demais adaptadores dependem dessa etapa). **P2-IMP-056:** tipo de componente desconhecido vira carga genérica `"load"` (com aviso), que passa a entrar nos cálculos; id duplicado é renomeado (`json-adapter.ts:116-126`), e arestas que citavam o id original apontam para o primeiro nó |
| Motor de conexões (Unifilar) | `connection-repair-engine.ts:567-680`: **não inventa conexões** (`addedEdges: []`); só resolve referências inequívocas, normaliza portas e recalcula a geometria; propostas de engenharia exigem aprovação explícita (`applyApprovedEngineeringProposals`). P3-DIA-057: porta ausente é preenchida automaticamente pela alocação de terminal, sem confirmação |
| SCADA demo | A planta ETE demo é rotulada como "demonstração / simulação isolada" (`scada.functions.ts:149-151`). P3-SCADA-058: o buffer `demoHistoricalSamples` fica em memória de módulo no servidor, compartilhado entre todos os usuários da instância |
| Alarmes | `scada/alarm-engine.ts`: estados ativo, reconhecido e retorno ao normal, com histórico; definições duplicadas (mesma tag e classe) são substituídas (l.47-55). Persistência em servidor: NOT_VERIFIED |

## Navegação no browser (Fase E, dev local offline)

Servidor `vite dev` em 127.0.0.1:3000 com saída de rede do Node bloqueada; nenhum pedido do browser a `*.supabase.co` foi observado.
- 24 rotas testadas: as públicas (`/`, `/signup`, `/forgot-password`, `/termos`, `/privacidade`, `/design-system`) respondem 200; rotas inexistentes e `/settings.team` respondem 404. As protegidas respondem 200 com shell SSR de cerca de 3,2 KB e **redirecionam no cliente** para `/login?redirect=…` (verificado em `/dashboard`). As server functions sem token respondem **401** (`listProjects`, `getDashboardTelemetry`, `getAiCredits`).
- `safe-redirect.ts` bloqueia URL absoluta, `//`, `/@`, barra invertida, caracteres de controle e percent-encoding (leitura do código).
- Bundle de produção: as ramificações do bypass dev no cliente compilam para `!1` (inertes) em `index-*.js`; o e-mail do proprietário **não** aparece no bundle cliente.
- Responsividade em 375×812: sem rolagem horizontal em `/`, `/login`, `/signup`, `/dashboard`, `/workspace`, `/scada` e `/settings`.
- **BLOCKED_BY_EXTERNAL_DEPENDENCY:** canvas, Unifilar, Multifilar, Ladder, FBD, SCADA de projeto, zoom e fit, salvar e reabrir. Criar ou abrir projeto exige Supabase, e o workspace mostra "Nenhum projeto aberto".
- P3-UI-059: sem projeto aberto, o header mostra o breadcrumb fixo "main / Planta - Linha 03" e "Simulação Parada" (texto estático aparentando projeto).
