---
status: living-document
owner: equipe
last_review: 2026-05-25
---

# 13 · Backlog Priorizado

Cada item tem ID estável (referenciado por commits e PRs). Não remova IDs — marque como `done` ou `wontfix`.

## Fase 2 — Workspace (crítico)

### WebGL Unifilar
- **#WGL-01** Portas/handles em `symbols.ts` com hit-test
- **#WGL-02** Drag de edges com preview ortogonal + commit via `cmd.addEdge`
- **#WGL-03** Seleção múltipla (rubber-band) ligada a `selectedNodeIds`
- **#WGL-04** Snap-to-grid em `MoveNode`
- **#WGL-05** Context menu HTML overlay
- **#WGL-06** Export DXF/PDF a partir de `DiagramDoc`
- **#WGL-07** Plano de descomissionamento do `VoltaiStore` (migrar RightPropertyPanel + colaboração Realtime para DiagramStore)

### PLC ↔ Editor
- **#PLC-01** Bloco do PlcStore abre Ladder/FBD com `rungs`/`fbdNodes` carregados; persistir na troca de aba
- **#PLC-02** Botão "Compilar" → `compileProgram(rungs, 'ST')`
- **#PLC-03** Export `.plcproj` (PLCopen XML, skeleton)
- **#PLC-04** Mapa de endereços I/O por slot
- **#PLC-05** Validação de compatibilidade de slots no rack

### SCADA
- **#SCADA-01** Snapshot do canvas (posições, sizes, params) → `useProjectStore` único
- **#SCADA-02** Substituir `new Function(script)` por Web Worker sandboxed
- **#SCADA-03** Modal "Bind to tag" com autocomplete
- **#SCADA-04** Alarm banner aciona `pushNotification`

### Ladder
- **#LAD-01** TOF e TP no `scanRungs`
- **#LAD-02** Validador de operando com feedback inline
- **#LAD-03** Autocomplete de tags
- **#LAD-04** Importação IL/ST externo
- **#LAD-05** Colunas configuráveis (atualmente fixo em 6)

### FBD
- **#FBD-01** Parâmetros de bloco (PT, PV) sincronizados com runtime
- **#FBD-02** Export SVG/PNG do diagrama
- **#FBD-03** Validação visual de tipo de pin (substituir `alert()`)

## Fase 3 — Servidor e segurança

- **#SEC-01** Fechar issues remanescentes do scanner
- **#SEC-02** Auditar `timingSafeEqual` em webhooks Stripe/MP
- **#SEC-03** Rate limit burst por endpoint sensível (IA, IoT, webhooks)
- **#SEC-04** 🔒 Leaked Password Protection (dashboard Supabase)

## Fase 4 — IA

- **#AI-01** Schema Zod compartilhado client/server para tool-calling
- **#AI-02** Preview diff antes do commit do patch IA
- **#AI-03** Dashboard de telemetria por operação (`ai_credit_costs`)

## Fase 5 — Digital Twin

- **#TWIN-01** Auto-seed via `seedDigitalTwinDemo` na primeira visita
- **#TWIN-02** Persistir `telemetryBuffers` em hypertable (`tag_samples`)
- **#TWIN-03** Upload GLB/GLTF para bucket privado com signed URL
- **#TWIN-04** Modelo "E se?" usando nameplate real de `catalog_components`

## Fase 6 — Billing, Convites, Onboarding

- **#BIL-01** Fluxo upgrade Stripe/MP com atualização imediata via webhook
- **#INV-01** Wire `/invite/:token` ao RPC `accept_invite`
- **#ONB-01** Tour guiado pós-criação de tenant

## Transversais

- **#R-01** `workspace.tsx` aceita `?projectId=:id` e hidrata stores
- **#R-02** Criar `/settings/protocols` (OPC-UA, Modbus configs)
- **#DOC-01** Toda mutação no Pixi DEVE passar por `dispatch(Command)`
- **#DOC-02** Toda server function nova: `requireSupabaseAuth` + Zod
