
# Plano: Canvas Enterprise — Modelo Rico + WebGL + Command Pattern + IA Validada

## Diagnóstico do que existe hoje

- `src/lib/editor/store.ts` (150 linhas): store Zustand simples. Guarda `fbdNodes/Edges` do React Flow direto como estado — **o React Flow é o modelo**, não uma projeção. Sem histórico, sem comandos, sem versionamento.
- `src/lib/project-store.ts`: outro store paralelo (`nodes`, `edges`, `tags`) usado pelo Konva. Dois modelos de dados concorrentes sem unificação.
- Canvases (`unifilar-canvas.tsx`, `konva-canvas.tsx` 1083 linhas, `fbd-canvas.tsx` 592, `twin-canvas.tsx` 876, `plc-canvas.tsx` 631, `scada-canvas.tsx` 418, etc.): cada um reimplementa render/zoom/pan/seleção. Mistura `reactflow` (SVG/DOM, lento) + `react-konva` (Canvas2D). Sem nenhum WebGL. SVG inline será gargalo grave acima de ~150 nós.
- `src/lib/ai-architect.functions.ts`: IA usa **JSON Schema solto** (objeto bruto enviado ao gateway), sem validação Zod no retorno. Qualquer drift do modelo quebra o canvas silenciosamente.
- Botões `Undo2/Redo2` existem na UI (`unifilar-canvas.tsx` linha 20) mas **não há history stack em lugar nenhum**. Confirmação: retrofit é caro quando feito tarde.

## Princípios

1. **Modelo de domínio é a verdade**; canvas é projeção visual.
2. **Toda mutação passa por Command** (apply/invert) → undo/redo nativo, auditável, sincronizável.
3. **WebGL (PixiJS v8)** como renderer único — Canvas2D/SVG só para overlays (labels HTML, tooltips).
4. **Zod no boundary IA→app**: nenhum JSON da IA toca o store sem parse.
5. **Escopo MVP fechado**: 3 diagramas (Unifilar, Multifilar, Ladder), validação NBR 5410 mínima, BOM. Resto fica desabilitado por feature flag.

## Arquitetura alvo

```text
┌─────────────────────────────────────────────┐
│  Domain Model  (src/lib/diagram/model.ts)   │
│  - DiagramDoc { id, version, nodes, edges,  │
│    sheets, metadata, normsApplied }         │
│  - Tipos Zod-first, imutáveis (Immer)       │
└──────────────┬──────────────────────────────┘
               │ comandos
┌──────────────▼──────────────────────────────┐
│  Command Bus  (src/lib/diagram/commands/)   │
│  - Command { do(doc), undo(doc), meta }     │
│  - HistoryStack (limit, coalesce, batch)    │
│  - emite eventos → store / colab / persist  │
└──────────────┬──────────────────────────────┘
               │ doc imutável
┌──────────────▼──────────────────────────────┐
│  Projection Layer (selectors)               │
│  - toRenderScene(doc) → SceneGraph leve     │
│  - toBOM(doc), toNetlist(doc), toRules(doc) │
└──────────────┬──────────────────────────────┘
               │ scene
┌──────────────▼──────────────────────────────┐
│  WebGL Renderer (PixiJS v8)                 │
│  - DiagramStage, viewport (pixi-viewport)   │
│  - símbolos IEC pré-compilados em Graphics  │
│  - HTML overlay para labels/edição inline   │
└─────────────────────────────────────────────┘
                  ▲
                  │
┌─────────────────┴───────────────────────────┐
│  IA Architect (servidor)                    │
│  - schema Zod compartilhado client/server   │
│  - parse no handler antes de retornar       │
│  - cliente aplica via CommandBus            │
└─────────────────────────────────────────────┘
```

## Entregas (ordem)

### 1. Modelo de domínio + schemas Zod
- `src/lib/diagram/schema.ts`: `DiagramNodeSchema`, `DiagramEdgeSchema`, `DiagramDocSchema` (versão, IDs ULID, posições, params por `kind` via discriminated union).
- `src/lib/diagram/model.ts`: tipos derivados, factories puras, helpers Immer.
- Migração dos dois stores atuais (`editor/store.ts` + `project-store.ts`) para projeções deste doc; mantém APIs antigas via adapters durante a transição.

### 2. Command Bus + History
- `src/lib/diagram/commands/`: `AddNode`, `RemoveNode`, `MoveNode`, `ConnectEdge`, `UpdateParams`, `ApplyAiPatch` (composto), `Batch`.
- `src/lib/diagram/history.ts`: stack com `undo/redo`, coalescing de `MoveNode` por nó/200ms, limite de 200 entradas, snapshots a cada 50 comandos.
- Store novo `src/lib/diagram/store.ts` (Zustand) só expõe `doc`, `dispatch(command)`, `undo()`, `redo()`. Atalhos ⌘Z/⌘⇧Z globais.

### 3. Renderer WebGL (PixiJS v8 + pixi-viewport)
- `bun add pixi.js pixi-viewport @pixi/react` (avaliação: usar Pixi puro para perf máxima, `@pixi/react` só onde fizer sentido).
- `src/lib/diagram/render/`: `DiagramStage.ts` (Application, ticker), `Viewport.ts` (pan/zoom/fitView), `symbols/` (biblioteca IEC 60617 desenhada com `Graphics` cacheada em `RenderTexture`), `EdgeRouter.ts` (orthogonal routing simples no MVP).
- `src/components/canvases/webgl-canvas.tsx`: monta o stage, observa `useDiagramStore` via selector, diff incremental no scene graph (sem rerender React por nó).
- Overlays React posicionados via `viewport.toScreen()` para labels/edição.
- Substitui `unifilar-canvas`, `konva-canvas`, `fbd-canvas` por este componente único parametrizado por `sheetKind`.

### 4. Validação IA com Zod
- `src/lib/diagram/ai-schema.ts`: mesmo schema Zod, exportado para client e server.
- `src/lib/ai-architect.functions.ts`: substituir o JSON Schema literal por `zodToJsonSchema(AiDiagramPatchSchema)` (lib `zod-to-json-schema`), e fazer `AiDiagramPatchSchema.safeParse(response)` antes de retornar. Em falha, retry 1× com mensagem "fix the JSON to match schema"; se falhar de novo, erro estruturado.
- Cliente aplica o patch via `dispatch(new ApplyAiPatch(parsed))` — atômico, undoável.

### 5. Validação NBR 5410 (MVP)
- `src/lib/diagram/rules/nbr5410/`: regras puras `(doc) => Violation[]`. MVP: presença de DR em circuitos de tomada, ampacidade mínima por seção de cabo (Tabela 36/37), proteção a montante, aterramento PE conectado.
- Painel "Conformidade" lê o resultado e oferece "Corrigir com IA" → gera `ApplyAiPatch`.

### 6. Escopo fechado do MVP
- Feature flags em `src/lib/feature-flags.ts`: ligar Unifilar, Multifilar, Ladder, BOM, NBR 5410. Desligar SCADA, Twin 3D, FBD, PLC sim, Alarms até o canvas novo estabilizar (componentes ficam no repo, fora da navegação).

## Detalhes técnicos relevantes

- **Por que PixiJS, não Konva/regl/three**: Pixi v8 tem renderer WebGL+WebGPU, batching automático de Graphics, ecossistema maduro de viewport e culling. Konva é Canvas2D (teto ~500 nós interativos). Three é overkill para 2D. regl exigiria escrever toda camada de cena.
- **Imutabilidade**: doc com Immer + structural sharing → selectors memoizados baratos, equality por referência, base sólida para colab CRDT futuro (Yjs encaixa neste modelo).
- **IDs**: ULID (lexicograficamente ordenável) em vez de `nanoid` para ordenação determinística e merge previsível.
- **Persistência**: doc serializa para JSON estável → Supabase (`projects.doc jsonb`, versão incrementada por commit). Migrations versionadas em `src/lib/diagram/migrations/`.
- **Testes**: comandos são funções puras `(doc, payload) => doc'` — testáveis com Vitest sem montar canvas. Schema Zod testado com fixtures de IA reais.
- **Performance alvo**: 1000 nós + 1500 edges a 60fps em laptop médio; pan/zoom sem rerender React; undo/redo < 16ms.

## Fora deste plano (próximas ondas)

- Colaboração realtime via Yjs sobre o mesmo doc.
- WebGPU quando estabilizar no Pixi.
- Auto-routing avançado (libavoid/elk) para multifilar.
- Mais normas (NBR 14039, IEC 61439, NR-10/12) — arquitetura de regras já suporta.

Aprove para eu começar pela camada 1 (modelo + schemas Zod) e 2 (command bus + history), que são pré-requisitos de tudo o resto.
