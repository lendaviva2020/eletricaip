## Objetivo
Fechar todos os gaps abertos no painel de auditoria (docs/sdd/12) com nível **Produção polida** e deixar o EletricAi pronto para clientes pagantes. Execução por ondas, validando cada onda antes da próxima.

## Ordem de execução (priorizada conforme escolha)

### Onda 0 — Higiene de contexto (rápido)
- Reescrever `custom_instructions` / workspace knowledge YAML para refletir o **EletricAi** (plataforma industrial: unifilar, PLC/Ladder/FBD, SCADA, Digital Twin, IA, multi-tenant Supabase) substituindo o YAML "Oma Food Delivery".
- Atualizar `docs/sdd/12-auditoria-status.md` a cada onda concluída.

### Onda 1 — Editores PLC / Ladder / FBD (#PLC-01..05, #LAD-01..03, #FBD-01..03)
1. **PLC↔Editor (#PLC-01)**: ao clicar num bloco do `PlcStore`, abrir Ladder/FBD com `rungs`/`fbdNodes` carregados; persistir ao trocar de aba (sync bidirecional via `useProjectStore`).
2. **Compilar (#PLC-02)**: botão "Compilar" no `editor-plc-sidebar` chamando `compileProgram(rungs, 'ST')`; toast com erros e output ST.
3. **Export PLCopen (#PLC-03)**: `lib/plc/plcopen-export.ts` já existe — adicionar botão "Exportar .plcproj" + download.
4. **I/O map (#PLC-04)** + **validação de slots (#PLC-05)**: tabela editável de I/O por slot + validação de compatibilidade no rack (alert inline, não `alert()`).
5. **Ladder TOF/TP (#LAD-01)**: implementar timers TOF e TP em `lib/ladder/runtime.ts` + testes em `__tests__/ladder-tof-tp.test.ts`.
6. **Validador inline (#LAD-02)**: `lib/ladder/validator.ts` retornando erros por célula, exibidos no `ladder-cell.tsx`.
7. **Autocomplete tags (#LAD-03)**: combobox lendo `simulation_tags` + `usePlcStore`.
8. **FBD params sync (#FBD-01)**: PT/PV editados na sidebar refletem em `fbdNodes` e runtime.
9. **FBD export SVG/PNG (#FBD-02)** e **validação visual de pin (#FBD-03)**: substituir `alert()` por toast/inline.

Validação: vitest verde + smoke Playwright (criar bloco PLC → abrir ladder → compilar → exportar).

### Onda 2 — Bloqueios de venda (SEC + Billing + Convites)
1. **#SEC-02** Auditar `timingSafeEqual` em `api/public/stripe.webhook.ts` e `mp.webhook.ts` (verificar `Buffer.length` igual antes do compare; rejeitar com 401 se diferente).
2. **#SEC-03** Rate-limit burst por endpoint sensível em `lib/security/rate-limiter.server.ts` (IA, IoT ingest, webhooks): configurações distintas, defaults conservadores, testes.
3. **#SEC-04** Habilitar Leaked Password Protection — não dá para automatizar; deixar instrução no painel `/settings/security-monitor` com link direto ao dashboard Supabase + flag pendente.
4. **#BIL-01** Fluxo upgrade Stripe/MP completo: botões em `/settings/billing` → `create_checkout_session` server fn → webhook atualiza `tenants.plan` imediato; UI reflete via `useTenantPlan`. Testar test mode.
5. **#INV-01** Wire `/invite/:token` ao RPC `accept_invite` (já existe no DB); UI de aceitar/recusar; toast + redirect ao workspace.
6. **#ONB-01** Tour guiado pós-criação de tenant (componente leve baseado em popovers, 4-5 passos: criar projeto → adicionar componente → simular → convidar time → publicar).
7. **#R-01** `workspace.tsx` aceita `?projectId=:id` e hidrata stores (project, voltai/diagram, plc, scada, twin).
8. **#R-02** Criar `/settings/protocols` (configs OPC-UA, Modbus, MQTT por tenant — persiste em `tenant_settings`).

Validação: testes integração (`settings-nav.test.ts` expandido), Playwright fluxo signup → onboarding → upgrade test mode → convite.

### Onda 3 — WebGL Unifilar (#WGL-01..07)
1. **#WGL-01** Portas/handles em `lib/diagram/render/symbols.ts` com hit-test (`pointer-events` por shape).
2. **#WGL-02** Drag de edges com preview ortogonal; commit via `cmd.addEdge` (já no Command pattern).
3. **#WGL-03** Rubber-band ligado a `selectedNodeIds` (multi-select).
4. **#WGL-04** Snap-to-grid em `MoveNode` (grid de 8px configurável).
5. **#WGL-05** Context menu HTML overlay (delete, duplicate, properties).
6. **#WGL-06** Export DXF (já existe `export-dxf.ts`) + PDF a partir de `DiagramDoc` (usar `pdf-export.ts`).
7. **#WGL-07** Migrar `RightPropertyPanel` + collaboration Realtime do VoltaiStore para DiagramStore; depois marcar `voltai/store.ts` como deprecated (manter shim 1 release).

Validação: testes unit do hit-test, Playwright montar painel 50-nós, exportar DXF, abrir no QCAD viewer (verificação visual).

### Onda 4 — SCADA & Digital Twin (#SCADA-01..04, #TWIN-01..04)
1. **#SCADA-01** Snapshot SCADA (posições, sizes, params) unificado em `useProjectStore` (remover frag do VoltaiStore).
2. **#SCADA-02** Substituir `new Function(script)` por Web Worker sandbox (`lib/simulation/scada-worker.ts` já esqueleto — completar transferência de mensagens + timeout).
3. **#SCADA-03** Modal "Bind to tag" com autocomplete em `bind-tag-dialog.tsx`.
4. **#SCADA-04** Alarm banner → `pushNotification` (notification-store).
5. **#TWIN-01** Auto-seed `seedDigitalTwinDemo` na primeira visita a `/digital-twin` (flag em `tenant_settings`).
6. **#TWIN-02** Persistir `telemetryBuffers` em hypertable `tag_samples` (migration + `batch_insert_tag_samples` já existe).
7. **#TWIN-03** Upload GLB/GLTF para bucket `client-logos` (renomear para `assets-3d`? — ou criar bucket privado) com signed URL.
8. **#TWIN-04** Modelo "E se?" usando nameplate real de `catalog_components`.

### Onda 5 — IA & Polish final
1. **#AI-01** Schema Zod compartilhado client/server (`lib/diagram/schema.ts` já tem base — extrair em `lib/ai/tool-schemas.ts`).
2. **#AI-02** Preview diff antes do commit do patch IA (componente `ai-patch-preview.tsx` já existe — wire ao fluxo de aprovar/rejeitar).
3. **#AI-03** Dashboard `/analytics` por operação (`ai_credit_costs` agregado por tenant/mês).
4. Atualizar SDD `12-auditoria-status.md` → tudo verde.
5. Rodar `bunx vitest run` + Playwright suite final + `security--run_security_scan` antes de propor publish.

## Detalhes técnicos chave

- **Servidor**: tudo via `createServerFn` (`requireSupabaseAuth`). Webhooks ficam em `routes/api/public/*` com `timingSafeEqual`.
- **Stores**: respeitar ADR-0002 (Command pattern no DiagramStore) e ADR-0003 (tenant_id + RLS em toda tabela nova).
- **Testes**: cada onda adiciona arquivos em `src/__tests__/` (vitest) + script Playwright em `/tmp/browser/` para smoke.
- **Migrations** novas (rate-limit configs por endpoint, tenant_settings flags de twin/onboarding, bucket 3D assets) sempre com `GRANT` explícito + RLS.
- **Sem mudanças destrutivas** no `voltai/store.ts` até #WGL-07 estar verde — manter shim.

## Fora de escopo
- Web Worker para simulação Voltai (anotado no plan original, mantém para depois).
- Mobile nativo / app Capacitor.

## Critério de pronto
- Todos os itens do backlog (#WGL, #PLC, #LAD, #FBD, #SCADA, #TWIN, #SEC, #BIL, #INV, #ONB, #R, #AI) marcados ✅ no painel.
- `bunx vitest run` 100% verde.
- Security scan sem findings críticos.
- Smoke Playwright signup → onboarding → criar projeto → unifilar/ladder/scada → convite → upgrade → publish funciona.
