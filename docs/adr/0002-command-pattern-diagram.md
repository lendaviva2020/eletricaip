# ADR-0002 · Command Pattern no DiagramStore

**Data:** 2026-05 · **Status:** Accepted

## Contexto

Patches da IA precisam ser reversíveis junto com edições manuais no mesmo histórico. Toggle simples de "snapshot do estado" não escala (cópias caras + sem semântica de operação).

## Decisão

Toda mutação no `DiagramStore` é um `Command` tipado (`src/lib/diagram/commands.ts`): `AddNode`, `MoveNode`, `ApplyAiPatch`, `Batch`, etc. `invertCommand(doc, cmd)` gera inverso para undo. `buildAiPatchCommand` empacota patches da IA com inverso pré-computado.

## Consequências

**Positivas:** Undo/redo unificado; coalescing de `MoveNode` no `history`; patches IA aparecem no mesmo stack.
**Negativas:** Toda nova mutação DEVE passar por `dispatch(Command)` — atalhos diretos quebram a invariante. Documentado em #DOC-01.
