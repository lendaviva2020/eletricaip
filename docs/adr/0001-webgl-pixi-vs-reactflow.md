# ADR-0001 · WebGL (Pixi) substitui ReactFlow no Unifilar

**Data:** 2026-05 · **Status:** Accepted · **Supersedes:** —

## Contexto

ReactFlow v11 entrega o modo Unifilar legado mas degrada com 500+ nós (re-render React por frame de drag). Projetos industriais reais têm 1000–5000 nós (paineis, barramentos, ramais).

## Decisão

Novo canvas Unifilar usa Pixi.js v8 via `DiagramStage` (`src/lib/diagram/render/stage.ts`) com diff incremental por nó/edge. Estado em `useDiagramStore` separado, sem React reconciliation no hot path.

## Consequências

**Positivas:** 60fps com 5k+ nós; export DXF/PDF a partir de modelo puro.
**Negativas:** Duas implementações coexistem temporariamente (VoltaiStore + DiagramStore). Resolver via #WGL-07.

## Alternativas consideradas

- React Konva — mesmo gargalo do ReactFlow em alta densidade
- D3 + SVG — não escala além de ~2k elementos
- tldraw — opinionated demais, não permite símbolos IEC custom
