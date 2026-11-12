# Fase 0 — Auditoria Técnica do Repositório ElétricAi (`eletricaip`)

**Data:** 2026-11-12  
**Branch de Auditoria:** `feat/logo-studio-fase-0` (derivada de `main` @ `86d0863`)  
**Escopo:** Mapeamento factual do estado atual do repositório `eletricaip/` antes da especificação e implementação do módulo **eletric Studio** (nome configurável via `PRODUCT_NAME`, atrás da feature flag `logoStudio`).  
**Regra de Evidência:** Todas as afirmações abaixo baseiam-se em leitura direta dos arquivos-fonte e na verificação executada em `2026-11-12` (`bun x tsc --noEmit` com `TSC=0` e evidências do Gate 4.3.2).

---

## 1. Estrutura do Repositório e Tecnologias Confirmadas

| Premissa da Seção 4 | Estado Real Verificado | Evidência no Repositório | Observações / Desvios |
| :--- | :--- | :--- | :--- |
| **TanStack Start / Router** | **Confirmado** (`@tanstack/react-start@1.168.60`, `@tanstack/react-router@1.170.41`) | `package.json`, `src/router.tsx`, `src/routes/**` | SSR + Server Functions (`createServerFn`), preset `nitro: { preset: "vercel" }`. |
| **React & TypeScript** | **Confirmado** (`react@19.2.0`, `typescript@5.8.3`, `strict: true`) | `package.json`, `tsconfig.json` | `tsc --noEmit` passou com `0` erros na linha de base. Contudo, há usos pontuais de `any` / `z.any()` em código legado (ver Seção 4). |
| **Zustand** | **Confirmado** (`zustand@5.0.13`) | `src/lib/model/unified-store.ts`, `src/lib/editor/store.ts`, `src/lib/studio/studio-store.ts`, etc. | **Risco:** há múltiplos stores sobrepostos sincronizados por pontes imperativas. |
| **Supabase Multi-tenant + RLS** | **Confirmado** (`@supabase/supabase-js@^2.105.4`) | `supabase/migrations/*.sql`, `src/integrations/supabase/`, `src/lib/projects.functions.ts` | RLS ativa nas tabelas de projeto, tenants e Gate 4.3.x. Persistência do projeto usa `SnapshotSchema` (versão 3). |
| **Vite + Nitro / Vercel** | **Confirmado** (`vite@7.3.7`, `nitro@3.0.260603-beta`) | `vite.config.ts`, `vercel.json` | **Observação:** em `vite.config.ts`, `mcpPlugin()` está comentado devido a falha de build no Windows. |
| **Canvas (Konva / PixiJS / ReactFlow / Three)** | **Parcialmente confirmado / Misto** | `src/components/canvases/*.tsx` | Unifilar/Multifilar usam **PixiJS 8** (`WebglCanvas`); SCADA/Twin 2D usam **Konva**; Twin 3D usa **Three.js / R3F**; FBD usa **ReactFlow 11**; Ladder usa grade HTML/React (`RungGrid`). |
| **Monaco Editor** | **Confirmado** (`monaco-editor@0.52.2`, `@monaco-editor/react@^4.7.0`) | `src/components/canvases/plc-canvas.tsx`, `src/components/studio/st-editor.tsx` | Carregado via wrapper `LazyMonacoEditor` para code-splitting. |
| **Lockfile único (`bun.lock`)** | **Confirmado em `eletricaip/`, atenção no workspace pai** | `eletricaip/bun.lock`, `package.json` (`bun@1.3.3`) | Dentro de `eletricaip/` existe apenas `bun.lock`. No diretório pai (`c:\Users\98911\Desktop\eletric`), coexistem projetos auxiliares independentes (`ECC/yarn.lock`, `ECC/package-lock.json`, `ECC/ecc2/Cargo.lock`, `eletricai-demo-video/bun.lock`). |
| **`new Function()` no SCADA** | **Confirmado (isolado, legado)** | `src/lib/simulation/scada-worker.ts:121` | Executa dentro de `Worker` dedicado (`ScriptSandbox`), com globals neutralizados, `freezeIntrinsics()`, Proxy em `tags`, pré-scan e timeout de 100 ms. Rastreado como dívida `#SCADA-02`. **Proibido replicar.** |

---

## 2. Inventário Detalhado do Que Já Existe

### 2.1 Modelo Canônico e Persistência de Projetos
1. **Modelo Canônico v3 (`src/lib/model/`)**:
   - `unified-schema.ts` define `UnifiedProjectDoc` (`schemaVersion: 3`), separando entidades de engenharia (`equipments`, `connections`, `circuits`, `tags`, `controlBindings`, `plcChannels`) das visões gráficas (`views.unifilar`, `views.multifilar`, `views.scada`, `views.twin`) e bloco PLC (`plc.project`, `activeLadderBlockId`, `activeFbdBlockId`).
   - `unified-store.ts` centraliza mutações canônicas e projeta para stores legados (`useDiagramStore`, `useProjectStore`, `useEditorStore`, `usePlcStore`, `useDigitalTwinStore`, `useRuntimeStore`).
   - `runtime-store.ts` mantém valores efêmeros de execução em memória (`tagValuesById`, `tagValuesByName`, `forcedTagIds`, `energizedEquipments`, `ladderScan`, `fbdSim`, `telemetryByTagId` com ring buffer de 120 pontos) **sem** marcar `dirty` no documento.
2. **Modelo Canônico do Studio IEC (`src/lib/studio/canonical/`)**:
   - Criado nos Gates 4.0/4.1 (`IndustrialProject`, `Controller`, `Device`, `POU`, `Tag`, `PLCVariable`, `GlobalVariableList`, `DataTypeDefinition`, `LibraryReference`, `TaskConfiguration`, `HMIPage`, `AlarmDefinition`, `RecipeDefinition`, `SafetyAnalysisReport`, `MotionAxis`).
   - `CanonicalProjectService.fromUnifiedDoc()` converte parcialmente o `UnifiedProjectDoc` em `IndustrialProject`.
   - **Achado crítico:** `useStudioStore` persiste `eletricai:studio:project:<id>` em `localStorage` (`studio-store.ts:291`) e sincroniza de volta para o `UnifiedProjectStore` **apenas as `tags`**, deixando POUs, tarefas, hardware do Studio e histórico fora do `SnapshotSchema` salvo no Supabase!
3. **Persistência Remota (`src/lib/projects.functions.ts`, `src/lib/use-project-persistence.ts`)**:
   - Usa `SnapshotSchema` (`CURRENT_SNAPSHOT_VERSION = 3`) com autosave debounced (2000 ms) e controle otimista de conflito de versão.
   - `SnapshotSchema` ainda usa `z.any()` para `project.nodes`, `project.edges`, `editor.rungs`, `editor.fbdNodes`, `editor.fbdEdges`, `diagram` e `plc.rack`.

### 2.2 Editores FBD e Ladder Existentes (Dualidade Detectada!)
Foram identificadas **múltiplas pilhas paralelas** no código:
1. **Pilha 1 — Motor FBD Moderno (`src/lib/fbd/engine/`) + `FbdCanvas` (`src/components/canvases/fbd-canvas.tsx`)**:
   - Núcleo puro e tipado em `src/lib/fbd/engine/`:
     - `datatypes.ts`: 21 tipos elementares IEC (`BOOL`, `SINT`..`ULINT`, `REAL`, `LREAL`, `BYTE`..`LWORD`, `STRING`, `WSTRING`, `TIME`, `DATE`, `TOD`, `DT`), 9 tipos genéricos (`ANY_*`), tabela de alargamento implícito IEC 61131-3 e coerção sem `any`.
     - `model.ts`: `FbdDocument` validado por Zod (`networks`, `nodes`, `connections`, `variables`).
     - `registry.ts`: `BlockRegistry` extensível com suporte implícito a `EN`/`ENO` (IEC 61131-3 §6.6.1.2.3).
     - `iec-library.ts`: ~32 definições registradas (`AND`, `OR`, `XOR`, `NOT`, `SR`, `RS`, `R_TRIG`, `F_TRIG`, `TON`, `TOF`, `TP`, `CTU`, `CTD`, `CTUD`, `EQ`, `NE`, `GT`, `GE`, `LT`, `LE`, `SEL`, `MUX`, `MAX`, `MIN`, `LIMIT`, `ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, plus conversões de tipo e `VAR_IN`/`VAR_OUT`/`CONST`).
     - `compiler.ts`: Validação completa + ordenação topológica (Kahn) + detecção de ciclos (`CYCLIC_DEPENDENCY`), múltiplos drivers (`MULTIPLE_DRIVERS`), incompatibilidade de tipos (`TYPE_MISMATCH`) + AST + IR linear baseado em slots.
     - `runtime.ts` e `simulation.ts`: `FbdRuntime` determinístico com passo `dtMs` injetável, suporte a `force`/`unforce`, `exportSnapshot`/`restoreSnapshot`, e `FbdSimulation` com agendador injetável.
     - `st-generator.ts`: Gera Structured Text (ST) determinístico a partir do IR compilado.
   - **Limitações atuais da Pilha 1:**
     - Roda na **main thread** via `setInterval` (`FbdSimulation` em `use-fbd-engine.ts`), não em Web Worker.
     - `FbdCanvas` usa ReactFlow (`reactflow@11.11.4`) sem virtualização configurada (`onlyRenderVisibleElements`) e chama `JSON.stringify(bridge.doc)` a cada mudança de nó (incluindo arraste de posição), o que degrada com 1.000+ blocos.
     - Falta: desfazer/refazer no FBD, copiar/colar, múltiplas páginas dedicadas com referências entre páginas, UDFs/macros hierárquicos, blocos específicos de CLP compacto V8/V8.4 (relógio semanal/anual, horímetro, interruptor de escada, gerador de pulsos assíncrono, registrador de deslocamento, controlador PI compacto, amplificador/limiar analógico, textos/mensagens HMI, data log).
2. **Pilha 2 — Motor FBD Legado (`src/lib/fbd/runtime.ts`, `src/lib/fbd/types.ts`)**:
   - Código antigo com `any`, sem uso pelo `FbdCanvas`, porém ainda presente em `src/lib/fbd/`. Risco de confusão e duplicidade.
3. **Pilha 3 — Ladder Canvas (`src/lib/ladder/` + `src/components/canvases/ladder/rung-grid.tsx`)**:
   - Modelo híbrido em `src/lib/ladder/types.ts`: matriz `cells[][]` (linhas × colunas, `3..12` cols) + `RungTopology` (`rootBranch`, `LadderBranch`, `outputs`).
   - `scan-core.ts` puro e determinístico com `TON`, `TOF`, `TP`, `TONR`, `CTU`, `CTD`, `CTUD`, `R_TRIG`, `F_TRIG`, `SR`, `RS`, comparadores, matemática (`ADD`, `SUB`, `MUL`, `DIV`, `MOD`, `ABS`, `SQRT`), `MOVE`, `INT_TO_REAL`, `REAL_TO_INT`.
   - **Limitação crítica para D4:** O Ladder armazena lógica em `useEditorStore.rungs` de forma **independente** do `useEditorStore.fbdNodes`/`fbdEdges`. Além disso, `scan-core.ts` chama `performance.now()` em `ladder/runtime.ts:80` e roda na main thread, enquanto `ladder-canvas.tsx` não possui conversão bidirecional preservando lógica com FBD.
4. **Pilha 4 — Studio IEC (`src/lib/studio/` + `src/components/studio/`)**:
   - Possui seu próprio `FBDEngine` (`iec/languages/fbd-engine.ts`), `LadderEngine` (`iec/languages/ladder-engine.ts`), `ILEngine`, `SFCEngine`, parser/semântico completo de ST (`iec/parser/`), `IECCompilerPipeline`, `IECTaskScheduler`, `LibraryManager` (SemVer completo), `ProjectComparisonEngine`, `TraceOscilloscopeEngine` e `DebuggerService`.
   - **Achado importante:** No `EngineeringStudio`, clicar em `POU_EDITOR` para FBD/LD usa editores embutidos próprios/simplificados ao invés de reaproveitar a mesma visualização canônica semântica; e os motores `FBDEngine`/`LadderEngine` do Studio não estão unificados com `src/lib/fbd/engine/` e `src/lib/ladder/scan-core.ts`!

### 2.3 Canvas Unifilar/Multifilar, Histórico e Exportação
- `src/components/canvases/webgl-canvas.tsx` + `src/lib/diagram/`: Motor gráfico vetorial em PixiJS 8 com `Command` pattern (`src/lib/diagram/commands.ts`) e pilha de `History` (`HISTORY_LIMIT = 200`, `coalescing` em `MoveNode`) em `src/lib/diagram/history.ts`.
- Exportação consolidada em:
  - SVG (`src/lib/diagram/export-svg.ts`) e DXF (`src/lib/diagram/export-dxf.ts`).
  - PDF (`src/lib/pdf-export.ts` e `src/lib/dossier/pdf-builder.ts` via `jspdf`).
  - Excel / CSV (`src/lib/security/safe-xlsx.ts` com `@e965/xlsx@0.20.3`, `src/lib/dossier/export-spreadsheets.ts`, `papaparse`).
  - PLCopen XML (`src/lib/plc/plcopen-export.ts` + `src/lib/dossier/plcopen.ts` + importador seguro `src/lib/importer/adapters/plcopen-adapter.ts`).

### 2.4 Hardware PLC, Catálogo, Simulador e SCADA
- **PLC / Hardware (`src/lib/plc/`, `src/components/canvases/plc-canvas.tsx`)**:
  - `HARDWARE_CATALOG` hardcoded em `src/lib/plc/types.ts` (apenas CPUs S7-1200/S7-1500 e módulos DI/DO/AI/AO genéricos). Não possui catálogo de CLPs compactos (família 8 entradas/4 saídas base + expansões DM/AM/CM + módulos TDE/fontes/acessórios), não é orientado a dados versionados com fonte/data de verificação, e não calcula orçamento de blocos/memória nem endereçamento compacto automático.
  - Por outro lado, existe `catalog/electrical-components.yaml` e tabela/catálogo via `catalog.functions.ts` + `settings.catalog-import.tsx` que mostram o padrão YAML/Supabase já adotado no repositório.
- **Simulador & SCADA (`src/components/canvases/sim-canvas.tsx`, `src/lib/fbd/scada-bridge.ts`, `src/lib/scada/`, `src/lib/simulation/safety-core.ts`)**:
  - `useSafetyStore` (`safety-core.ts`) implementa E-STOP virtual (`SIMULATION_HALT`) com registro de callback seguro (`registerSafeStateCallback`).
  - `scada-bridge.ts` espelha variáveis FBD (`fb_<id>_<port>`) e variáveis Ladder para `useProjectStore.applyTick` / `useEditorStore` / `useRuntimeStore`.
  - `src/lib/industrial/canonical-data-service.ts` aplica segregação estrita `SIMULATED` / `FORCED` / `RUNTIME` vs `PHYSICAL_DATA`, isolamento multi-tenant e **invariante imutável `IS_PHYSICAL_CONTROL_ALLOWED = false`**.
- **Feature Flags e i18n (`src/lib/settings-store.ts`, `src/hooks/use-tenant-setting.ts`, `src/lib/i18n/`)**:
  - `useTenantSetting(key, defaults)` já persiste configurações por tenant em `tenant_settings` com espelho em `localStorage`. Ideal para abrigar a flag `logoStudio` (e eventual flag separada para protocolos de campo).
  - Sistema i18n centralizado (`pt-BR` padrão, `en` secundário) com `missing-key-detector.ts` e `format.ts`. Porém, diversos componentes de canvas ainda contêm strings fixas em pt-BR sem chave de tradução (`ModeTabs` já usa chaves `workspace.modes.*`).

---

## 3. Avaliação de Qualidade e Matriz de Riscos (Pré-Fase 1)

| Área Auditada | Maturidade Atual | Principais Pontos Fortes | Riscos & Lacunas Críticas |
| :--- | :---: | :--- | :--- |
| **Motor FBD (`src/lib/fbd/engine/`)** | Alta (Núcleo) / Média (UI) | Tipagem IEC forte, AST/IR puro, EN/ENO, sem `any`, determinístico. | Roda na main thread (`setInterval`); sem UDFs; sem Undo/Redo; ReactFlow sem virtualização para 1.000+ blocos; coexistência com motor legado e Studio IEC. |
| **Motor Ladder (`src/lib/ladder/`)** | Alta (Scan) / Baixa (Integração FBD) | Topologia com branches paralelas, bordas, timers/contadores. | Modelo próprio desconectado do FBD; `new Date`/timers acoplados a `performance.now()` no wrapper; sem conversão bidirecional semântica FBD ↔ LAD. |
| **Studio IEC (`src/lib/studio/`)** | Média-Alta (Domínio) / Isolado (UI/DB) | IR, ST Parser, LibraryManager SemVer, CompareEngine, TraceEngine. | Persistência em `localStorage` fora do snapshot Supabase; terceiro conjunto de motores FBD/LD; troca de abas dissociada do workspace principal. |
| **Hardware & Catálogo (`src/lib/plc/`)** | Baixa | Validação básica de rack (`canAddModule`, `validateRack`). | Catálogo hardcoded no TS (`HARDWARE_CATALOG`); sem fontes verificadas; sem modelos compactos (8DI/4DO + expansões); sem limites de memória/blocos. |
| **Persistência & RLS (`Supabase`)** | Alta (Segurança) / Média (Schema) | RLS multi-tenant testada; autosave com detecção de conflito. | `SnapshotSchema` usa `z.any()`; `Studio` fora do snapshot do banco. |
| **Runtime Worker (`workers/worker-manager.ts`)** | Alta (Infra) / Baixa (Adoção) | `WorkerManager` genérico com timeout, single-flight e reciclagem. | Apenas `ScriptSandbox` (SCADA) usa Web Worker hoje; nenhum runtime Ladder/FBD roda em Worker. |
| **Segurança Industrial (`IS_PHYSICAL_CONTROL_ALLOWED`)** | Crítica / Rígida | Bloqueio comprovado de escrita física em Modbus/OPC UA/Sparkplug B (Gates 3.2–4.3.2). | **Conflito de requisito:** Seção 3 do pedido cita confirmação para escrita física; o codebase atual proíbe escrita física por invariante constante (`false`). Ver `04-perguntas-em-aberto.md`. |

---

## 4. Dívidas Descobertas na Auditoria (Registradas em `docs/logo-studio/DIVIDA.md`)

1. Três motores FBD e dois motores Ladder coexistentes no repositório.
2. `SnapshotSchema` com `z.any()` em `src/lib/projects.functions.ts`.
3. `FbdSimulation` e `scanRungs` executando em `setInterval` na thread principal da UI em vez de Web Worker.
4. `useStudioStore` persistindo o projeto industrial inteiro no `localStorage` em vez do snapshot versionado do Supabase.
5. Uso residual de `new Function()` em `src/lib/simulation/scada-worker.ts` (não agravar; não replicar).
6. Ausência de virtualização e desacoplamento posição-vs-lógica no `FbdCanvas` para escalar acima de 1.000 blocos.
