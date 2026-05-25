# Plano de Execução — EletricAI SDD v1.0

## Fase 0 — Ancoragem do documento (imediato)

Criar estrutura de documentação versionada do SDD para servir como fonte única de verdade durante a execução:

```
docs/
  sdd/
    README.md                    ← índice + status global
    01-visao-geral.md
    02-stack.md
    03-arquitetura.md
    04-rotas.md
    05-stores.md
    06-workspace-modos.md
    07-server-functions.md
    08-database.md
    09-ia.md
    10-seguranca.md
    11-billing.md
    12-auditoria-status.md       ← checklist vivo (✅/⚠️/❌)
    13-backlog.md                ← itens priorizados linkados às fases
    14-contratos-api.md
    15-decisoes-riscos.md        ← ADRs curtos
  adr/
    0001-webgl-pixi-vs-reactflow.md
    0002-command-pattern-diagram.md
    0003-tenant-isolation-rls.md
```

Cada arquivo carrega front-matter com `status`, `owner`, `last_review`, e seção "Gaps" linkando para issues no backlog. O `12-auditoria-status.md` é o painel mestre que vamos atualizar a cada PR.

## Fase 1 — Auditoria de realidade (antes de qualquer código novo)

O SDD lista muitas rotas como "⚠️ A implementar", mas o codebase real já contém `src/routes/dashboard.tsx`, `projects.tsx`, `workspace.tsx`, `clients.tsx`, `settings.*.tsx`, `digital-twin.tsx`, `ai.tsx`, `analytics.tsx`, `login.tsx`, `signup.tsx`, `onboarding.tsx`, `invite.$token.tsx`, etc. Antes de "implementar" qualquer rota, faço um diff real codebase ↔ SDD e atualizo `12-auditoria-status.md` com o estado verdadeiro. Sem isso, executaríamos retrabalho.

Saída: tabela definitiva de status por módulo, com 3 categorias: `done`, `partial (gaps listados)`, `missing`.

## Fase 2 — Gaps críticos do Workspace (núcleo do produto)

Priorizo pelo impacto no fluxo principal "desenhar → simular → exportar":

### 2.1 WebGL Unifilar (Pixi) — completar para paridade com ReactFlow legado
- Portas/handles de conexão desenhadas em `symbols.ts` com hit-test
- Drag de edges com preview ortogonal + commit via `cmd.addEdge`
- Seleção múltipla (rubber-band) integrada a `selectedNodeIds`
- Snap-to-grid no `MoveNode` (coalescing já existe no history)
- Context menu nativo HTML overlay (não Pixi) sobre coordenadas do stage
- Export: ligar `buildDxf()` + `pdf-export.ts` ao `DiagramDoc` ativo
- Plano de descomissionamento do VoltaiStore: migrar `RightPropertyPanel` e colaboração Realtime para `DiagramStore` antes de remover

### 2.2 Integração PLC ↔ Editor (bloqueador hoje)
- Blocos de programa do `PlcStore` precisam abrir Ladder/FBD no canvas principal carregando `rungs`/`fbdNodes` daquele bloco
- Persistir edição de volta no bloco ao trocar de aba
- Compilador ST→bloco: ligar botão "Compilar" ao `compileProgram`
- Export `.plcproj` (PLCopen XML) — começar por skeleton mínimo

### 2.3 SCADA — persistência e segurança
- Mover snapshot do canvas SCADA do VoltaiStore para `useProjectStore` (single source of truth) — posições, sizes, params
- Substituir `new Function(script)` por execução em Web Worker sandboxed (sem acesso a `window`, `document`, `fetch`)
- UI de tag binding (modal "Bind to tag" com autocomplete) substituindo configuração via script
- Acionar `pushNotification` em alarm_banner ativo

### 2.4 Ladder runtime — robustez
- Implementar TOF e TP no `scanRungs`
- Validador de operando (regex + lookup em `editorTags`) com feedback inline na célula
- Autocomplete de tags no input de operando

## Fase 3 — Camada de servidor e segurança residual

- Concluir issues remanescentes do scanner (rodar `security--run_security_scan` e fechar)
- Habilitar Leaked Password Protection (ação manual no dashboard — documentar em `10-seguranca.md`)
- `getSecurityDashboard` já existe → adicionar série temporal real de `audit_logs` agregada por dia
- Rate limit burst middleware revisado por endpoint sensível (IA, IoT ingest, webhooks)
- Webhooks Stripe/MP: validar assinatura com `timingSafeEqual` (auditar `api/public/stripe.webhook.ts` e `mp.webhook.ts`)

## Fase 4 — IA e cota

- Badge de créditos lendo exclusivamente `getAiCredits` (remover qualquer leitura residual de localStorage)
- Tool-calling do DeepSeek com schema Zod compartilhado client/server em `ai-architect.functions.ts`
- Aplicação de patches IA via `buildAiPatchCommand` já existe — adicionar preview diff antes do commit
- Telemetria de uso por operação em `ai_credit_costs`

## Fase 5 — Digital Twin produção

- Persistir `telemetryBuffers` em hypertable (pg_partman ou particionamento mensal já existente em `tag_samples`)
- Implementar upload GLB/GLTF para bucket `digital-twin-models` (privado, signed URLs)
- Modelo "E se?" usando nameplate real do motor armazenado em `catalog_components`

## Fase 6 — Billing, Convites, Onboarding

- Fluxo de upgrade Stripe/MP com retorno e atualização imediata de plano via webhook
- `accept_invite` já existe no DB → wire na rota `/invite/$token`
- Onboarding guiado: criar tenant + primeiro projeto + tour do workspace

## Detalhes técnicos transversais

- Toda nova mutação no canvas Pixi DEVE passar por `dispatch(Command)` para preservar undo/redo
- Toda server function nova: `requireSupabaseAuth` + Zod `inputValidator` + nunca `process.env` em escopo de módulo
- Nenhuma escrita ao DB fora de migração (sem ALTER ad-hoc)
- Nenhum `client.server.ts` importado de código cliente
- Manter `12-auditoria-status.md` atualizado a cada PR (parte do "definition of done")

## Confirmação antes de codar

Quero alinhar dois pontos antes de iniciar a Fase 0:

1. **Escopo do documento salvo**: salvo o SDD completo em `docs/sdd/` quebrado nos 15 arquivos acima, ou prefere um único `docs/SDD.md` monolítico? (Recomendo quebrado — facilita PRs focados.)
2. **Ponto de partida da Fase 2**: começamos por **2.1 WebGL Unifilar** (maior impacto visual e desbloqueia export) ou **2.2 Integração PLC↔Editor** (desbloqueia fluxo completo de programação)?

Após sua confirmação, executo Fase 0 + auditoria real (Fase 1) e volto com o painel de status preenchido antes de qualquer alteração em código de runtime.