# EletricAI Industrial OS - Plano Mestre de Implementacao

Versao: 2.0  
Data: Maio 2026  
Modo de execucao: fases completas, uma por vez, com build/lint ao final de cada fase.

## 0. Diagnostico inicial do repositorio

O SDD recebido descreve corretamente a visao do produto, mas parte dele esta desatualizada em relacao ao codebase atual.

Estado real observado:

- As rotas principais ja existem em `src/routes/` no formato flat do TanStack Router:
  - `__root.tsx`, `index.tsx`, `login.tsx`, `signup.tsx`, `onboarding.tsx`, `dashboard.tsx`, `projects.tsx`, `workspace.tsx`, `ai.tsx`, `analytics.tsx`, `clients.tsx`, `settings.tsx`, `settings.billing.tsx`, `settings.team.tsx`, `settings.ai-status.tsx`, `invite.$token.tsx`.
- Os webhooks publicos ja existem com path correto:
  - `src/routes/api/public/stripe.webhook.ts` -> `/api/public/stripe/webhook`
  - `src/routes/api/public/mp.webhook.ts` -> `/api/public/mp/webhook`
- O workspace industrial e os modulos principais ja existem:
  - `IndustrialWorkspace`, sidebars por modo, painels, canvases Ladder/FBD/SCADA/Twin/PLC/Sim/Alarmes.
- O plano antigo em `.lovable/plan.md` estava defasado e com encoding quebrado.
- Lacunas criticas reais ainda existem:
  - `ProjectSnapshot` nao inclui `DiagramDoc` WebGL.
  - `src/lib/diagram` nao existe no repositorio auditado, embora o SDD trate WebGL/Pixi como decisao futura.
  - `ScadaCanvas` executa script com `new Function`.
  - `AlarmsCanvas` ainda parece mockado.
  - Billing existe, mas precisa de hardening de idempotencia, eventos, invoice e testes.
  - Auth/root layout existe, mas precisa corrigir texto com encoding quebrado e garantir bootstrap de tenant.
  - Rotas existentes precisam ser auditadas e robustecidas, nao recriadas em outro formato.

## 1. Regras de execucao

Cada fase deve terminar com:

- `npm run build`
- `npm run lint`
- checklist manual do fluxo afetado
- nenhum arquivo fora do escopo alterado sem necessidade
- commit logico unico, quando o usuario pedir commit

Padrao de implementacao:

- TypeScript estrito, sem `any` novo salvo em fronteiras inevitaveis de Supabase ou payload externo.
- Validar entradas com Zod em server functions e formularios.
- Preservar o formato flat atual de rotas do TanStack Router, a menos que uma migracao seja explicitamente aprovada.
- Nao duplicar rotas ja existentes em `_authenticated/`.
- Nao remover mudancas do usuario.
- Preferir refatoracoes pequenas, testaveis e revertiveis.

## 2. Fase 1 - App Shell, Auth e Rotas Criticas

Objetivo: garantir que o usuario consegue autenticar, cair no dashboard/onboarding e abrir o workspace com chrome correto.

Status atual: parcialmente implementado. A fase e de auditoria, correcao e endurecimento.

Arquivos principais:

- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/routes/login.tsx`
- `src/routes/signup.tsx`
- `src/routes/forgot-password.tsx`
- `src/routes/reset-password.tsx`
- `src/routes/onboarding.tsx`
- `src/routes/dashboard.tsx`
- `src/routes/workspace.tsx`
- `src/hooks/use-auth.tsx`
- `src/lib/tenants.functions.ts`
- `src/components/app-sidebar.tsx`
- `src/components/topbar.tsx`

Tarefas:

- Corrigir textos com encoding quebrado em rotas/componentes visiveis.
- Confirmar redirects:
  - `/` -> `/dashboard` quando autenticado.
  - `/` -> `/login` ou pagina publica adequada quando anonimo.
  - rota privada anonima -> `/login?redirect=...`.
  - login/callback -> destino original ou `/dashboard`.
- Garantir que `AuthProvider` inicializa sessao sem flicker destrutivo.
- Garantir bootstrap do tenant pessoal apos primeiro login:
  - usar `bootstrap_personal_tenant_if_missing()`.
  - evitar chamadas repetidas em loop.
- Revisar `PUBLIC_PATHS` e incluir rotas publicas reais:
  - `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/invite/$token` se aplicavel.
- Verificar se `onboarding` fica sem sidebar/topbar e se workspace fica com chrome completo.
- Padronizar carregamento/erro visual.

Criterios de pronto:

- Fluxo login -> onboarding/dashboard -> workspace funciona sem tela branca.
- Usuario anonimo nao acessa rotas privadas.
- Usuario autenticado nao fica preso em login/onboarding.
- `npm run build` passa.
- `npm run lint` passa ou lista somente problemas herdados documentados.

## 3. Fase 2 - Projetos, Persistencia e Snapshot Canonico

Objetivo: salvar e carregar o projeto completo sem perda entre reloads, incluindo caminho para o futuro WebGL/DiagramDoc.

Arquivos principais:

- `src/lib/projects.functions.ts`
- `src/lib/project-store.ts`
- `src/lib/voltai/store.ts`
- `src/lib/editor/store.ts`
- `src/lib/current-project.ts`
- `src/lib/use-project-persistence.ts`
- `src/routes/projects.tsx`
- `src/routes/onboarding.tsx`
- `src/routes/workspace.tsx`

Tarefas:

- Expandir `ProjectSnapshot` para:
  - `project`: SCADA/Konva nodes/edges.
  - `voltai`: unifilar legado.
  - `editor`: tags, Ladder, FBD e estado compartilhado minimo.
  - `diagram`: opcional, reservado para `DiagramDoc` quando WebGL entrar.
  - `schemaVersion`: numero de versao do snapshot.
- Adicionar parser tolerante para snapshots antigos.
- Garantir que `saveProject` nao rejeita projetos antigos sem `schemaVersion`.
- Garantir que `loadProject` hidrata stores relevantes de forma deterministica.
- Revisar `createProject`, `duplicateProject`, `archiveProject`, `deleteProject`, se existirem ou faltarem.
- Implementar ou completar:
  - duplicar projeto.
  - arquivar projeto.
  - restaurar versao.
  - criar versao manual.
- Proteger contra perda de dados ao trocar `projectId`.

Criterios de pronto:

- Criar projeto, editar workspace, salvar, recarregar e reabrir mantem estado.
- Projeto antigo sem campos novos abre sem crash.
- Restaurar versao realmente troca o snapshot atual.
- Delete/arquivar nao quebram listagem.

## 4. Fase 3 - Dashboard, Projects e Onboarding Robustos

Objetivo: transformar as paginas ja existentes em fluxos completos de operacao.

Arquivos principais:

- `src/routes/dashboard.tsx`
- `src/routes/projects.tsx`
- `src/routes/onboarding.tsx`
- `src/lib/projects.functions.ts`
- `src/lib/ai-architect.functions.ts`
- `src/lib/billing.functions.ts`
- `src/components/ai-credits-badge.tsx`

Tarefas:

- Dashboard:
  - total de projetos.
  - creditos IA.
  - ultimo projeto.
  - status runtime/Realtime.
  - atividade recente baseada em `project_versions` ou eventos disponiveis.
- Projects:
  - busca e filtros por status/cliente.
  - criar, abrir, duplicar, arquivar, excluir.
  - estados loading/empty/error.
- Onboarding:
  - listar projetos existentes.
  - criar primeiro projeto.
  - selecionar projeto atual.
  - navegar para `/workspace?projectId=...`.
- Adicionar confirmacoes para acoes destrutivas.

Criterios de pronto:

- Usuario novo consegue sair do onboarding com um projeto aberto.
- Usuario existente consegue escolher projeto e abrir workspace.
- Acoes de projeto mostram feedback visual e tratam erros de Supabase.

## 5. Fase 4 - Billing Funcional e Auditavel

Objetivo: checkout, webhooks, invoices e assinatura coerentes no banco.

Arquivos principais:

- `src/lib/billing.functions.ts`
- `src/routes/settings.billing.tsx`
- `src/routes/api/public/stripe.webhook.ts`
- `src/routes/api/public/mp.webhook.ts`
- `src/components/upgrade-modal.tsx`
- `src/lib/plans.ts`
- migrations em `supabase/`

Tarefas Stripe:

- Revisar verificacao de assinatura HMAC contra o contrato real do Stripe.
- Persistir eventos em `stripe_webhook_events` com payload/erro/status quando o schema permitir.
- Processar:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- Garantir idempotencia sem engolir erro real.
- Sincronizar `tenants`, `subscriptions`, `invoices`.

Tarefas MercadoPago:

- Revisar autenticacao do webhook:
  - segredo compartilhado atual ou assinatura oficial, se configurada.
- Rebuscar pagamento na API MP.
- Persistir em `mp_webhook_processed`.
- Atualizar `tenants`, `subscriptions` quando aplicavel e `invoices`.

Tarefas UI:

- Mostrar plano atual, uso, creditos IA, historico de invoices.
- Acoes:
  - upgrade.
  - cancelamento ao fim do periodo.
  - troca de gateway.
- Mensagens claras para billing nao configurado.

Criterios de pronto:

- Checkout gera URL valida quando envs existem.
- Webhook duplicado retorna sucesso sem duplicar alteracoes.
- Invoice paga aparece na tela.
- Cancelamento atualiza status corretamente.

## 6. Fase 5 - Creditos IA, Cron Mensal e Hub de IA

Objetivo: IA operacional com cota correta, historico e pagina dedicada.

Arquivos principais:

- `src/routes/ai.tsx`
- `src/routes/chat.tsx`
- `src/lib/ai-chat.functions.ts`
- `src/lib/ai-architect.functions.ts`
- `src/lib/diagram/ai.functions.ts` se for criado na Fase WebGL
- `src/integrations/supabase/ai-rate-limit-middleware.ts`
- migrations/RPCs em `supabase/`

Tarefas:

- Auditar `getAiCredits`, `consume_ai_credits`, `check_ai_quota_for_user`.
- Garantir debito atomico antes de chamadas DeepSeek.
- Exibir estado de chave IA e latencia em `settings.ai-status.tsx`.
- Completar `/ai`:
  - lista de conversas.
  - area de chat.
  - historico de mensagens.
  - streaming ou fallback request/response.
  - apagar conversa.
- Adicionar feedback de qualidade para respostas, se tabelas existirem.
- Implementar reset mensal:
  - preferencialmente Supabase Edge Function/cron.
  - documentar envs e agendamento.
- Melhorar RAG:
  - manter `ilike` como fallback.
  - preparar pgvector quando `knowledge_chunks.embedding` estiver populado.

Criterios de pronto:

- Usuario sem creditos nao dispara chamada paga.
- Usuario com creditos recebe resposta e consumo fica refletido.
- `/ai` persiste historico.
- `settings.ai-status` mostra diagnostico real.

## 7. Fase 6 - SCADA Seguro e Persistente

Objetivo: eliminar risco de XSS por `new Function` e persistir interacoes dos widgets.

Arquivos principais:

- `src/components/canvases/scada-canvas.tsx`
- `src/components/canvases/konva-canvas.tsx`
- `src/lib/project-store.ts`
- `src/lib/editor/store.ts`
- `src/lib/use-project-persistence.ts`

Tarefas:

- Substituir execucao direta com `new Function`.
- Escolha recomendada:
  - Web Worker com API restrita para scripts.
  - entrada: snapshot de tags.
  - saida: comandos permitidos (`setTag`, `setWidgetParam`, `raiseAlarm`).
  - timeout e debounce.
- Bloquear acesso a `window`, `document`, `fetch`, storage e APIs globais.
- Persistir:
  - posicao de widget.
  - tamanho.
  - parametros.
  - binding de tag.
- Atualizar autocomplete de tags quando tags forem criadas.
- Disparar `pushNotification()` quando alarme SCADA nasce no cliente.

Criterios de pronto:

- Nenhum `new Function`/`eval` permanece no SCADA.
- Reload mantem layout dos widgets.
- Script invalido nao derruba canvas.
- Alarme visual gera notificacao quando configurado.

## 8. Fase 7 - Alarmes Reais com Supabase

Objetivo: trocar tabela mock por configuracao e historico reais.

Arquivos principais:

- `src/components/canvases/alarms-canvas.tsx`
- `src/components/canvases/sim-canvas.tsx`
- `src/lib/project-store.ts`
- `src/integrations/supabase/types.ts`
- possiveis novas server functions em `src/lib/alarm.functions.ts`

Tarefas:

- Criar server functions:
  - `listAlarmConfigs(projectId)`
  - `createAlarmConfig`
  - `updateAlarmConfig`
  - `deleteAlarmConfig`
  - `listAlarmHistory(projectId, filters)`
  - `ackAlarm(alarmHistoryId)`
- AlarmsCanvas:
  - filtros por periodo, severidade, estado.
  - paginacao.
  - ACK com `acknowledged_at` e `acknowledged_by`.
  - Realtime para INSERT em `alarm_history`.
- SimCanvas/ScadaEngine:
  - ler regras de `alarm_configs`, nao hardcoded.
  - fallback demo somente quando nao ha projeto/banco.
- Notificacoes:
  - client-side via Realtime ou trigger no Supabase.

Criterios de pronto:

- Criar regra de alarme e ver ela aparecer no motor.
- Novo alarme entra em `alarm_history`.
- ACK persiste no banco.
- Realtime atualiza a UI sem reload.

## 9. Fase 8 - Ladder e FBD IEC 61131-3

Objetivo: fechar lacunas de runtime, validacao e compilacao.

Arquivos principais:

- `src/lib/ladder/types.ts`
- `src/lib/ladder/runtime.ts`
- `src/lib/ladder/compiler.ts`
- `src/components/canvases/ladder/rung-grid.tsx`
- `src/components/canvases/ladder/ladder-cell.tsx`
- `src/components/canvases/fbd-canvas.tsx`
- `src/lib/editor/store.ts`

Tarefas Ladder:

- Implementar TOF e TP no runtime, ja que existem nas definicoes.
- Validar operandos IEC:
  - `%I`, `%Q`, `%M`, `%MW`, tags simbolicas permitidas.
- Autocomplete de tags no input de operando.
- Parametrizar numero de colunas por rung ou documentar limite atual.
- Export IL/ST com metadados de projeto.
- Import basico de IL/ST se viavel nesta fase; caso contrario deixar contrato pronto.

Tarefas FBD:

- Trocar `alert()` de conexao invalida por feedback visual/toast.
- Persistir estado de blocos SR/RS fora do componente desmontavel.
- Sincronizar parametros PT/PV com runtime.
- Export imagem/SVG do diagrama FBD.

Criterios de pronto:

- TON, TOF, TP e CTU rodam com diagnostico.
- Operando invalido e bloqueado ou marcado visualmente.
- FBD nao perde estado ao trocar de aba.
- Export FBD funciona.

## 10. Fase 9 - PLC Integrado ao Editor

Objetivo: conectar o configurador PLC aos programas Ladder/FBD/ST reais.

Arquivos principais:

- `src/components/canvases/plc-canvas.tsx`
- `src/components/editor/sidebars/editor-plc-sidebar.tsx`
- `src/lib/plc/store.ts` se existir/criar
- `src/lib/editor/store.ts`
- `src/lib/ladder/compiler.ts`
- `src/components/canvases/fbd-canvas.tsx`

Tarefas:

- Criar/fortalecer `usePlcStore` com:
  - vendor.
  - rack.
  - modules.
  - variables.
  - programBlocks.
  - cycleTimeMs.
- Integrar blocos LAD/FBD:
  - bloco PLC aponta para rungs/FBD graph no `EditorStore`.
  - botao "Abrir no canvas principal" navega/muda aba e seleciona bloco.
- Validar compatibilidade de slot/rack.
- Enderecamento automatico de variaveis por modulo DI/DO/AI/AO.
- Compilar bloco ST com validacoes basicas.
- Exportar projeto PLC:
  - `.plcproj` JSON.
  - IEC XML quando contrato estiver definido.

Criterios de pronto:

- Criar rack com CPU + IO.
- Gerar enderecos para variaveis.
- Abrir bloco LAD/FBD no canvas correspondente.
- Export `.plcproj` baixa arquivo coerente.

## 11. Fase 10 - Digital Twin 2D/3D

Objetivo: iniciar com demo util, persistir mapeamentos e preparar import GLB/GLTF.

Arquivos principais:

- `src/components/canvases/twin-canvas.tsx`
- `src/lib/digital-twin-store.ts`
- `src/components/editor/sidebars/editor-twin-sidebar.tsx`
- possiveis componentes Three/R3F existentes

Tarefas:

- Chamar `seedDigitalTwinDemo()` quando projeto nao tem twin configurado.
- Persistir:
  - mappings.
  - hotspots.
  - selectedHotspotId.
  - alarm/viewMode.
- Implementar import GLB/GLTF:
  - upload/local object URL inicialmente.
  - depois Supabase Storage.
- Manter selecao ao trocar de tab.
- Adicionar formulario de nameplate para motor usado no what-if:
  - potencia.
  - tensao.
  - corrente nominal.
  - rpm.
  - eficiencia.

Criterios de pronto:

- Twin nao abre vazio em projeto novo.
- Hotspot criado sobrevive a reload.
- Import GLB/GLTF aparece no viewer.
- What-if usa dados de nameplate quando preenchidos.

## 12. Fase 11 - WebGL/DiagramStore e Canvas Unifilar Novo

Objetivo: introduzir o canvas WebGL de forma segura sem quebrar o unifilar legado.

Status atual: `src/lib/diagram` nao foi encontrado. Esta fase deve ser feature-flagged.

Arquivos a criar/editar:

- `src/lib/diagram/schema.ts`
- `src/lib/diagram/store.ts`
- `src/lib/diagram/commands.ts`
- `src/lib/diagram/history.ts`
- `src/lib/diagram/render/stage.ts`
- `src/lib/diagram/render/symbols.ts`
- `src/lib/diagram/ai.functions.ts`
- `src/components/canvases/webgl-canvas.tsx`
- `src/components/industrial-workspace.tsx`
- `src/components/editor/right-property-panel.tsx`
- `src/lib/projects.functions.ts`

Tarefas:

- Definir `DiagramDoc` v1 com Zod.
- Implementar command pattern:
  - `AddNode`
  - `MoveNode`
  - `UpdateNode`
  - `RemoveNode`
  - `AddEdge`
  - `RemoveEdge`
  - `ApplyAiPatch`
  - batch commands.
- Undo/redo com coalescing de move.
- Render Pixi/viewport:
  - grid.
  - simbolos basicos.
  - selecao.
  - drag com snap 24px.
  - portas/handles.
  - criacao de edges por drag.
  - context menu.
  - multi-select por lasso.
- Integrar IA patch com Zod e 3 tentativas.
- Integrar persistencia em `ProjectSnapshot.diagram`.
- Manter fallback para `UnifilarCanvas` legado via flag.

Criterios de pronto:

- Feature flag desligada mantem app atual.
- Feature flag ligada permite criar/mover/conectar/salvar/reabrir diagrama.
- Undo/redo funciona para node e edge.
- AI patch invalido nao corrompe doc.

## 13. Fase 12 - Exportacao PDF/DXF/BOM

Objetivo: conectar builders existentes a botoes reais e contratos de projeto.

Arquivos principais:

- `src/lib/pdf-export.ts`
- `src/lib/dxf-export.ts`
- `src/lib/export.functions.ts`
- `src/lib/bom.functions.ts`
- `src/routes/projects.$projectId.export.tsx`
- `src/routes/projects.$projectId.bom.tsx`
- `src/components/topbar.tsx`
- `src/components/bottom-panel.tsx`

Tarefas:

- Export DXF:
  - unifilar legado.
  - WebGL/DiagramDoc quando disponivel.
- Export PDF:
  - capa.
  - dados do projeto.
  - diagrama.
  - BOM.
  - normas/validacoes.
- BOM:
  - gerar por RPC quando projeto salvo.
  - fallback local para componentes nao persistidos.
- Adicionar botoes no workspace/topbar.
- Garantir download com nome deterministico.

Criterios de pronto:

- Export PDF abre e contem dados reais do projeto.
- Export DXF contem nodes/edges principais.
- BOM atualiza apos alteracao de componentes.

## 14. Fase 13 - Protocolos IoT, OPC-UA e Modbus

Objetivo: tornar runtime industrial previsivel e documentar limitacoes de scaling.

Arquivos principais:

- `src/lib/iot.functions.ts`
- `src/lib/opcua-server.functions.ts` se existir/criar
- `src/lib/modbus-server.functions.ts` se existir/criar
- `src/components/runtime-status.tsx`
- `src/routes/realtime.tsx`
- `src/routes/settings.protocols.tsx` se for criada

Tarefas:

- Verificar SSRF guard para hosts privados/permitidos.
- Normalizar erros para nao virar oracle.
- Persistir configuracoes de protocolo criptografadas ou documentar modo transient-only.
- Deixar claro que sessoes in-memory exigem single instance.
- Preparar interface para Redis/Upstash:
  - `ProtocolSessionStore`.
  - implementacao in-memory atual.
  - futura implementacao Redis.
- UI de settings/protocols:
  - endpoints.
  - credenciais.
  - testar conexao.
  - mapear tags.

Criterios de pronto:

- Test connection funciona com simulacao.
- Erros sensiveis nao vazam.
- Config salva sem expor senha em plaintext no cliente.

## 15. Fase 14 - Team, Invites, Clients e Security

Objetivo: completar operacao multi-tenant.

Arquivos principais:

- `src/routes/settings.team.tsx`
- `src/routes/invite.$token.tsx`
- `src/routes/clients.tsx`
- `src/lib/clients.functions.ts`
- `src/routes/settings.tsx`
- `src/routes/settings.security.tsx` se criada
- `src/lib/security-monitor.functions.ts` se existir/criar

Tarefas:

- Team:
  - listar membros.
  - alterar role com permissao.
  - criar convite.
  - revogar convite.
- Invite:
  - aceitar token.
  - validar email.
  - bootstrap login se anonimo.
- Clients:
  - CRUD completo.
  - detalhe de cliente com projetos vinculados.
  - filtros por status/setor/busca.
- Security:
  - dashboard de achados.
  - status leaked password protection como acao manual.
  - audit log quando disponivel.

Criterios de pronto:

- Convite aceito adiciona membership correta.
- Cliente criado aparece em projetos.
- Security page nao mostra dados de outro tenant.

## 16. Fase 15 - Analytics, Trends e Telemetria Historica

Objetivo: transformar dados runtime em metricas uteis.

Arquivos principais:

- `src/routes/analytics.tsx`
- `src/components/canvases/sim-canvas.tsx`
- `src/lib/project-store.ts`
- `src/integrations/supabase/types.ts`
- server functions novas para trends/tag samples

Tarefas:

- Ler `tag_samples` por projeto/tag/periodo.
- Export CSV de telemetria.
- UI de `trend_configs`.
- Graficos:
  - tempo de maquina ligada.
  - alarmes por severidade.
  - tendencia de temperatura/corrente/nivel.
  - consumo estimado quando tags existem.
- Integrar buffers locais com batch insert quando runtime ativo.

Criterios de pronto:

- Analytics mostra dados reais quando existem amostras.
- CSV baixa com intervalo selecionado.
- Sem dados mostra empty state util.

## 17. Fase 16 - Hardening Final, QA e Deploy

Objetivo: deixar o produto consistente para uso real.

Tarefas:

- Remover fallbacks hardcoded sensiveis de Supabase/env.
- Revisar RLS das tabelas tocadas.
- Revisar todos os paths da sidebar/mobile menu.
- Rodar build production.
- Rodar lint e corrigir erros novos.
- Testar responsivo:
  - desktop 1440px.
  - notebook 1280px.
  - mobile 390px.
- Testar fluxos:
  - auth.
  - onboarding.
  - projeto.
  - workspace.
  - save/load.
  - billing.
  - AI.
  - alarmes.
- Documentar envs obrigatorias em `.env.example`.
- Documentar limitacoes conhecidas:
  - OPC-UA/Modbus in-memory.
  - RAG semantico depende de embeddings.
  - WebGL pode ficar atras de feature flag.

Criterios de pronto:

- `npm run build` passa limpo.
- `npm run lint` passa ou tem debt listado e aprovado.
- Nenhum erro visivel no console nos fluxos principais.
- `.env.example` cobre todas as variaveis usadas.

## 18. Ordem recomendada de execucao

1. Fase 1 - App Shell, Auth e Rotas Criticas
2. Fase 2 - Projetos, Persistencia e Snapshot Canonico
3. Fase 3 - Dashboard, Projects e Onboarding Robustos
4. Fase 4 - Billing Funcional e Auditavel
5. Fase 5 - Creditos IA, Cron Mensal e Hub de IA
6. Fase 6 - SCADA Seguro e Persistente
7. Fase 7 - Alarmes Reais com Supabase
8. Fase 8 - Ladder e FBD IEC 61131-3
9. Fase 9 - PLC Integrado ao Editor
10. Fase 10 - Digital Twin 2D/3D
11. Fase 11 - WebGL/DiagramStore e Canvas Unifilar Novo
12. Fase 12 - Exportacao PDF/DXF/BOM
13. Fase 13 - Protocolos IoT, OPC-UA e Modbus
14. Fase 14 - Team, Invites, Clients e Security
15. Fase 15 - Analytics, Trends e Telemetria Historica
16. Fase 16 - Hardening Final, QA e Deploy

## 19. Primeira tarefa executavel

Comecar pela Fase 1.

Checklist inicial da Fase 1:

- Rodar `npm run build` para obter baseline.
- Rodar `npm run lint` para obter baseline.
- Corrigir textos com encoding quebrado em `__root.tsx` e paginas publicas.
- Revisar `PUBLIC_PATHS`.
- Confirmar redirect auth/anonimo.
- Adicionar bootstrap de tenant se ainda nao estiver conectado ao fluxo de auth.
- Revalidar build/lint.

