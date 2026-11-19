# CANVAS ZOOM, CONTENT BOUNDS & FIT-TO-VIEW FIX REPORT

**Arquivos:** [`wire-router.ts`](src/lib/diagram/render/wire-router.ts), [`stage.ts`](src/lib/diagram/render/stage.ts), [`webgl-canvas.tsx`](src/components/canvases/webgl-canvas.tsx)  
**Data:** 2026-11-14  

---

## 1. Problema Original

1. O cálculo de ajuste de tela ignorava labels largos, caixas reais por tipo de componente (`busbar`, `transformer`, `ccm`, etc.) e `waypoints` de condutores, além de poder sofrer distorção caso coordenadas inválidas ou sentinels extremos estivessem presentes.
2. Faltavam controles completos na barra do canvas para **Fit All**, **Fit Selection**, **Fit Network**, **Center**, **1:1 (100%)**, **Previous Zoom**, indicador vivo de **Zoom %**, e controle **Auto-Zoom**.
3. Carregamento assíncrono de projetos, geração por IA e importação universal precisavam disparar enquadramento proporcional automático sem roubar o zoom manual do engenheiro durante edições ou arrastes.

---

## 2. Solução Implementada

### 2.1 Cálculo Real e Protegido de Bounds ([`computeDiagramBounds`](src/lib/diagram/render/wire-router.ts#L99-L146))
- Agrega a bounding box real de cada símbolo + rótulo textual ([`computeNodeBoundingBox`](src/lib/diagram/render/wire-router.ts#L49-L93)) e todos os `waypoints` válidos das conexões conectadas.
- Descarta qualquer coordenada não-finita (`NaN`, `Infinity`) ou sentinel extremo fora de `±500_000` via [`isValidCoord`](src/lib/diagram/render/wire-router.ts#L42-L44).

### 2.2 Viewport Pixi Ampliado & Operações de Câmera ([`DiagramStage`](src/lib/diagram/render/stage.ts))
- Mundo expandido para `20000 x 20000` com clamp contínuo de zoom entre `0.1` (`10%`) e `4.0` (`400%`).
- `fitView` ([`stage.ts#L342`](src/lib/diagram/render/stage.ts#L342)): calcula escala proporcional com padding dinâmico e clamp ergonômico `[0.12, 1.5]` para redes pequenas (não estourar zoom em 2 nós) e redes industriais amplas.
- `fitSelection` ([`stage.ts#L389`](src/lib/diagram/render/stage.ts#L389)): enquadra exclusivamente os componentes selecionados.
- `fitNetwork` ([`stage.ts#L397`](src/lib/diagram/render/stage.ts#L397)): executa busca em grafo conectado a partir do nó semente e enquadra o subcircuito completo.
- `centerView` ([`stage.ts#L425`](src/lib/diagram/render/stage.ts#L425)): centraliza o conteúdo mantendo a escala atual.
- `zoomTo` ([`stage.ts#L452`](src/lib/diagram/render/stage.ts#L452)), `previousZoom` ([`stage.ts#L467`](src/lib/diagram/render/stage.ts#L467)) e pilha `zoomHistory` com callback reativo `onZoomChange`.

### 2.3 Controles no Canvas & Auto-Fit Inteligente ([`webgl-canvas.tsx`](src/components/canvases/webgl-canvas.tsx))
- Barra dedicada (`data-testid="canvas-zoom-controls"`):
  - `canvas-zoom-out` (`-`)
  - `canvas-zoom-percent` (leitura ao vivo em `%`, clique alterna `100%`)
  - `canvas-zoom-in` (`+`)
  - `canvas-zoom-100` (`1:1`, `Ctrl+1`)
  - `canvas-zoom-prev` (zoom anterior)
  - `canvas-fit-all` (`Ctrl+0` / `Shift+1`)
  - `canvas-fit-selection` (`Shift+2`)
  - `canvas-fit-network`
  - `canvas-center-view`
  - `canvas-auto-zoom` (toggle de Auto-Zoom)
- Eventos de auto-enquadramento controlado: inicialização, troca de folha (`unifilar`/`multifilar`), troca de `doc.id`, transição vazio->hidratado e evento customizado `"eletricai-fit-view"` disparado após aplicação de patch IA (`ai-architect-client.ts`, `canvas-ai-chat.tsx`) ou importação (`universal-import-modal.tsx`). Drag manual e edição direta nunca disparam reset de zoom.
