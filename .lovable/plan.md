## Objetivo

Refatorar o workspace do EletricAI (`/workspace` → `/editor`) para que cada um dos 7 módulos (Unifilar, Ladder, FBD, SCADA, Digital Twin, PLC, Simulação) tenha **sidebar esquerda própria**, **painel direito de propriedades por tipo**, e **estado isolado mas mesmo `projectId`**, conforme a regra crítica: Unifilar e Ladder são sistemas separados (não há conversão automática entre eles), apenas compartilham tags/I-O do projeto.

---

## Arquitetura compartilhada

```
src/lib/editor/
  store.ts                  // useEditorProject (Zustand) — projectId, tags, I/O compartilhados
  module-context.ts         // useActiveModule(): qual aba está ativa
  property-schemas.ts       // Zod schemas por tipo de componente (QF, KM, M, VFD, KT…)
  tag-registry.ts           // CRUD de tags do projeto (compartilhado entre módulos)
src/components/editor/
  editor-shell.tsx          // novo layout: sidebar-esq dinâmica + canvas + sidebar-dir
  module-tabs.tsx           // abas Unifilar/Ladder/FBD/SCADA/Twin/PLC/Sim
  left-sidebar-host.tsx     // troca sidebar conforme módulo ativo
  right-property-panel.tsx  // painel direito controlado pelo nó selecionado
src/routes/
  editor.tsx                // nova rota (substitui workspace.tsx mantendo redirect)
```

---

## Fase 1 — Separar sidebars Unifilar e Ladder

**Meta**: extrair `EditorBibliotecaSidebar` e `EditorLadderSidebar` do `industrial-workspace.tsx` para componentes próprios e garantir isolamento de estado entre os dois módulos.

Arquivos:

- **criar** `src/components/editor/sidebars/editor-unifilar-sidebar.tsx` (move código atual de `EditorBibliotecaSidebar`)
- **criar** `src/components/editor/sidebars/editor-ladder-sidebar.tsx` (move código atual de `EditorLadderSidebar`)
- **criar** `src/components/editor/sidebars/editor-scada-sidebar.tsx` (move código atual de `EditorScadaSidebar`)
- **criar** `src/components/editor/left-sidebar-host.tsx` (switch por `mode`)
- **criar** `src/lib/editor/store.ts` (Zustand: `unifilarNodes`, `unifilarEdges`, `ladderRungs`, `tags`, separados; persistido por `projectId`)
- **editar** `src/components/industrial-workspace.tsx` → usa `LeftSidebarHost`, remove componentes inline
- **editar** `src/lib/voltai/store.ts` → integra com `editor/store.ts` (Unifilar lê só `unifilarNodes`)

Validação: trocar de aba Unifilar↔Ladder não mistura nós; refresh mantém ambos.

---

## Fase 2 — Painel direito de propriedades por tipo

**Meta**: clique em nó (Unifilar ou bloco Ladder) abre painel direito com campos específicos validados por Zod.

Arquivos:

- **criar** `src/lib/editor/property-schemas.ts`
  - `disjuntorSchema` (corrente A, curva B/C/D, kA)
  - `motorSchema` (cv/kW, V, A, RPM, FS)
  - `releTermicoSchema`, `vfdSchema`, `temporizadorSchema`, etc.
- **criar** `src/components/editor/right-property-panel.tsx` (renderiza form dinâmico via `react-hook-form` + zodResolver)
- **criar** `src/components/editor/property-fields/` (NumberField, SelectField, TextField com unidade)
- **editar** `src/components/right-panel.tsx` → delega para `RightPropertyPanel` quando módulo é Unifilar/Ladder/FBD
- **editar** `src/lib/editor/store.ts` → `selectedNodeId`, `updateComponentProperties()`

Validação: clicar em QF mostra campos corretos; alterar A salva no estado; valor inválido bloqueia.

---

## Fase 3 — Editor Ladder com rungs (matriz, não free-flow)

**Meta**: substituir o canvas Ladder atual por uma grade de rungs IEC 61131-3 com rails verticais.

Arquivos:

- **criar** `src/components/canvases/ladder/rung-grid.tsx` (matriz de células, rails L/R)
- **criar** `src/components/canvases/ladder/rung-row.tsx`
- **criar** `src/components/canvases/ladder/ladder-element.tsx` (XIC, XIO, OTE, OTL, OTU, TON, CTU…)
- **criar** `src/components/canvases/ladder/operand-input.tsx` (edição inline `%I0.0`, `%M0.1`)
- **criar** `src/lib/ladder/compiler.ts` (Ladder → IL/ST básico)
- **criar** `src/lib/ladder/runtime.ts` (ciclo de scan, energização)
- **editar** `src/components/canvases/ladder-canvas.tsx` → usa `RungGrid`
- **editar** `src/lib/editor/store.ts` → `addRung()`, `setElement(rungIdx, col, element)`

UI: botão "+ Novo Rung", "Compilar", "Simular"; rungs energizados ficam verdes.

Validação: rung XIC(`%I0.0`) → OTE(`%Q0.0`); simular força I0.0=true e Q0.0 acende.

---

## Fase 4 — SCADA com editor Monaco e live-reload

**Meta**: canvas SCADA dividido — esquerda widgets (drag), direita editor Monaco que define mapeamento de tags e scripts; alterações refletem em tempo real.

Arquivos:

- **adicionar dep** `@monaco-editor/react`
- **criar** `src/components/canvases/scada/scada-stage.tsx` (canvas com widgets posicionáveis)
- **criar** `src/components/canvases/scada/widgets/` (Gauge, NumericDisplay, Trend, Button, Switch, Tank, Pipe, Motor, Valve)
- **criar** `src/components/canvases/scada/scada-code-editor.tsx` (Monaco, linguagem custom "scada-script")
- **criar** `src/lib/scada/script-parser.ts` (parse seguro: `lerTag`, `escreverTag`, condicionais simples — NÃO usar `eval`; AST mínima)
- **criar** `src/lib/scada/live-runtime.ts` (debounce 200ms; aplica script ao state dos widgets)
- **editar** `src/components/canvases/scada-canvas.tsx` → split-view (stage + editor)
- **editar** `src/components/editor/sidebars/editor-scada-sidebar.tsx` → categorias (Indicadores, Controles, Alarmes, Máquinas, Enfeites)
- **integrar** Supabase Realtime (já existe em `iot.functions.ts`) com `live-runtime.ts` via botão "Live IoT"

Validação: arrastar Gauge → definir tag `LT_01` → no editor escrever `GAUGE_01.value = lerTag('LT_01')` → publicar valor via `/api/public/iot/ingest` → gauge anima.

---

## Fase 5 — Esqueletos funcionais: FBD, Digital Twin, PLC

**Meta**: cada módulo abre, carrega sua sidebar e renderiza canvas mínimo navegável (não um placeholder vazio).

### FBD

- **criar** `src/components/editor/sidebars/editor-fbd-sidebar.tsx` (AND, OR, NOT, XOR, SR, RS, TON, TOF, CTU, CTD, FB customizado)
- **criar** `src/components/canvases/fbd/fbd-block-node.tsx` (pinos in/out tipados)
- **editar** `src/components/canvases/fbd-canvas.tsx` → React Flow real (não reusa Unifilar)
- **criar** `src/lib/fbd/st-codegen.ts` (FBD → ST)

### Digital Twin

- **adicionar dep** `three`, `@react-three/fiber`, `@react-three/drei`
- **criar** `src/components/editor/sidebars/editor-twin-sidebar.tsx` (importar GLB, listar tags vinculadas)
- **criar** `src/components/canvases/twin/twin-scene.tsx` (R3F Canvas, OrbitControls)
- **criar** `src/components/canvases/twin/tag-marker.tsx` (sprite piscando com valor live)
- **editar** `src/components/canvases/twin-canvas.tsx` → renderiza `TwinScene`

### PLC

- **criar** `src/components/editor/sidebars/editor-plc-sidebar.tsx` (árvore: Hardware/Tags/Blocos)
- **criar** `src/components/canvases/plc/plc-block-host.tsx` (escolhe Ladder/FBD/ST/SFC por bloco)
- **criar** `src/lib/plc/virtual-runtime.ts` (executa bloco compilado)
- **editar** `src/components/canvases/plc-canvas.tsx`

Validação: cada aba abre com sidebar correta + canvas operacional mínimo, sem `console.error`.

---

## Fase 6 — Módulo Simulação e integração Unifilar↔Ladder via tags

**Meta**: aba Simulação coordena execução conjunta usando registry de tags compartilhado.

Arquivos:

- **criar** `src/components/editor/sidebars/editor-sim-sidebar.tsx` (modos: Unifilar/Ladder/Conjunta; speed 1x/10x/100x; watch table com force-value)
- **criar** `src/components/canvases/sim/sim-overlay.tsx` (renderiza canvas ativo + animação)
- **criar** `src/components/canvases/sim/oscilloscope-panel.tsx` (gráficos V/I via Recharts)
- **criar** `src/lib/sim/coordinator.ts` (tick global; saídas Ladder → bobinas contator Unifilar; sensores Unifilar → entradas Ladder; via `tag-registry`)
- **editar** `src/lib/editor/store.ts` → `forceTagValue()`, `watchedTags`
- **editar** `src/components/canvases/sim-canvas.tsx` → usa `SimOverlay` + painel inferior

Validação: criar QF+KM+M no Unifilar com tag `K1_CMD`; Ladder com OTE(`K1_CMD`); Simulação Conjunta liga K1_CMD pelo Ladder e o motor anima energizado no Unifilar.

---

## Higiene contínua (toda fase)

- TypeScript estrito, `any` proibido (lint local: `npx tsc --noEmit && npx eslint .`)
- Sidebars colapsáveis (chevron) + viram `Sheet` em `< lg` (já temos `src/components/ui/sheet.tsx`)
- Tema VOLTAI dark via tokens em `src/styles.css` (sem cor literal)
- Cada fase commitada em PR lógico isolado, sem refatorar fases futuras

---

## Estimativa de escopo

| Fase | Arquivos novos | Arquivos editados | Risco                    |
| ---- | -------------: | ----------------: | ------------------------ |
| 1    |              5 |                 2 | baixo                    |
| 2    |              4 |                 2 | médio                    |
| 3    |              6 |                 2 | alto (compilador Ladder) |
| 4    |      6 + 1 dep |                 2 | alto (parser seguro)     |
| 5    |     9 + 3 deps |                 3 | médio                    |
| 6    |              5 |                 2 | alto (sincronização)     |

**Pré-requisito antes de começar**: confirmar se quer que eu renomeie `/workspace` → `/editor` (com redirect) ou mantenha o path atual.
