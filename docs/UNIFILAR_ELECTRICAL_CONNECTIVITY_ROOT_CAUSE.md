# UNIFILAR ELECTRICAL CONNECTIVITY — ROOT CAUSE ANALYSIS & STRUCTURAL FIX

**Módulo:** Canvas Unifilar (`PixiJS`), Roteador Ortogonal, IA & Importador Universal  
**Data:** 2026-11-14  
**Branch:** `feat/ai-continuity-unifilar-connectivity-fix`  

---

## 1. Resumo Executivo

A auditoria estrutural do pipeline completo `AI GENERATION -> IMPORT PARSER -> NORMALIZATION -> COMPONENT/TERMINAL REGISTRY -> ELECTRICAL GRAPH -> VALIDATION -> PERSISTENCE -> HYDRATION -> WIRE ROUTING -> UNIFILAR RENDERING` identificou **5 causas-raiz arquiteturais** responsáveis por fios desalinhados, conexões cortando lateralmente equipamentos verticais, perda de geometria pós-IA e ausência de semântica visual elétrica (nós de junção e pontes de cruzamento).

---

## 2. Causas-Raiz Identificadas no Código

1. **Divergência entre Terminal Canônico IEC e Porta Visual Pixi (`ports.ts` / `stage.ts` / `auto-layout-router.ts`):**
   - A `TERMINAL_LIBRARY` e o `ConnectionEngine` operam com códigos IEC semânticos (`1/L1`, `2/T1`, `IN`, `OUT`, `PRI`, `SEC`, `U1..W1`, `A1/A2`, `TAP1..TAPN`).
   - Entretanto, o estágio visual [`DiagramStage`](src/lib/diagram/render/stage.ts) tentava resolver `sourcePort`/`targetPort` usando fallback genérico `L -> R`, fazendo componentes verticais IEC (`breaker`, `contactor`, `transformer`, `busbar`) ligarem pelos lados esquerdo/direito ou desalinharem em relação ao corpo do símbolo.
2. **Roteamento ingênuo em `stage.ts` sem desvio de obstáculos nem adaptação de waypoints:**
   - Arestas recém-criadas ou movidas traçavam curvas L/Z simples sem considerar bounding boxes dos equipamentos intermediários (`computeNodeBoundingBox`) e descartavam rotas ajustadas manualmente durante movimentações de nós.
3. **Ausência de diferenciação visual entre Junção Elétrica e Cruzamento não conectivo:**
   - Derivações em barramento e múltiplos condutores no mesmo terminal não renderizavam ponto sólido de junção, enquanto cruzamentos ortogonais entre redes distintas se sobrepunham sem arco/ponte de salto.
4. **Quebra de sincronismo no retorno de `generateDiagramPatch` (`ai.functions.ts`):**
   - Embora `generateDiagramPatch` executasse `repairDiagramConnections` e `autoLayoutIndustrialDiagram` no servidor, o retorno preservava parcialmente posições antigas ou não propagava `updateNodes` + `updateEdges` (`waypoints`) no patch aplicado pelo cliente.
5. **Preservação parcial de terminais e ausência de waypoints no Importador Universal (`universal-importer.ts`):**
   - `convertBundleToDiagramDoc` normalizava conexões sem gerar `waypoints` ortogonais determinísticos compatíveis com o mesmo motor visual do canvas.

---

## 3. Remediações Implementadas

| Camada | Arquivo | Correção Estrutural |
| :--- | :--- | :--- |
| Registro Visual de Portas | [`ports.ts`](src/lib/diagram/render/ports.ts) | Implementada [`resolveVisualPort`](src/lib/diagram/render/ports.ts#L179) conectando códigos da `TERMINAL_LIBRARY` (`getEquipmentTerminalProfile`) às portas visuais corretas (`T`, `B`, `L`, `R`, `B1..B4`, `C`). |
| Motor Ortogonal Puro | [`wire-router.ts`](src/lib/diagram/render/wire-router.ts) | Criado roteador Manhattan ortogonal [`routeOrthogonalEdge`](src/lib/diagram/render/wire-router.ts#L275), [`simplifyOrthogonalPoints`](src/lib/diagram/render/wire-router.ts#L195), desvio de obstáculos via [`computeNodeBoundingBox`](src/lib/diagram/render/wire-router.ts#L49), análise de junções/cruzamentos [`computeEdgeAnnotations`](src/lib/diagram/render/wire-router.ts#L418) e adaptação de rotas existentes ao mover componentes. |
| Case-insensitive IEC Matching | [`connection-engine.ts`](src/lib/diagram/connection/connection-engine.ts) | Normalização case-insensitive e por prefixo/sufixo em `resolveTerminalCode`. |
| Estágio WebGL PixiJS | [`stage.ts`](src/lib/diagram/render/stage.ts) | [`renderSheetEdges`](src/lib/diagram/render/stage.ts#L687) + [`drawOrthogonalPathWithBridges`](src/lib/diagram/render/stage.ts#L793) + `SegmentDragState` (arraste direto de segmentos internos com persistência Undo/Redo). |
| Schema & Undo/Redo | [`schema.ts`](src/lib/diagram/schema.ts), [`commands.ts`](src/lib/diagram/commands.ts) | Adicionado comando `UpdateEdgeWaypoints` (`cmd.updateEdgeWaypoints`) e suporte a `updateEdges` em `AiDiagramPatchSchema` / `ApplyAiPatch` com inversão completa em `invertCommand` e `buildAiPatchCommand`. |
| Pipeline IA | [`ai.functions.ts`](src/lib/diagram/ai.functions.ts) | `generateDiagramPatch` aplica `updateNodes` no documento de trabalho, sincroniza `synchronizedUpdateEdges` com `waypoints` ortogonais e emite patch completo. |
| Importador Universal | [`universal-importer.ts`](src/lib/importer/universal-importer.ts) | `convertBundleToDiagramDoc` preserva `fromTerminal`/`toTerminal`, resolve porta IEC, repara topologia e grava `waypoints` via [`routeOrthogonalEdge`](src/lib/importer/universal-importer.ts#L620). |
