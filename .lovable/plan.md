# #WGL-07 — Decomissionar shim Voltai

Migrar `RightPropertyPanel` e o hook de realtime collab para o `DiagramStore` canônico e remover o shim legado `useVoltaiStore` + canvas Unifilar antigo.

## Escopo

### 1. Migrar `RightPropertyPanel` para `DiagramStore`
- `src/components/editor/right-property-panel.tsx`: substituir leituras/writes de `useVoltaiStore` (`selectedNodeId`, `updateNode`, `deleteNode`, `nodes`) pelas ações equivalentes em `useDiagramStore` (`selection`, `patchNode`, `removeNodes`, `doc.nodes`).
- Ajustar `validated-param-field.tsx` e `property-schemas.ts` para consumir o `doc` do DiagramStore.

### 2. Migrar collab realtime
- `src/hooks/use-collab.ts`: broadcast/receive baseado em `DiagramStore.applyPatch` em vez de mutações Voltai. Manter presence channel.
- Atualizar `industrial-workspace.tsx` para não passar mais o store Voltai para o hook.

### 3. Remover shim + arquivos legados
- Deletar: `src/lib/voltai/{store.ts,use-voltai-simulation.ts,component-definitions.ts,symbols.ts}`, `src/components/canvases/{unifilar-canvas.tsx,voltai-node.tsx,circuit-control-panel.tsx}`.
- Limpar imports em: `webgl-canvas.tsx`, `editor-unifilar-sidebar.tsx`, `use-project-persistence.ts`, `projects.functions.ts`, `current-project.ts`, `ai-architect-client.ts`, `editor/store.ts`, `svg-sanitizer.ts`, `ladder/definitions.ts`.
- `use-project-persistence.ts`: remover branch de hidratação Voltai (já duplicado pelo DiagramStore).
- `projects.functions.ts` / `current-project.ts`: snapshot só grava/lê `diagram` (drop `voltai`).

### 4. Testes e docs
- Novo teste `src/__tests__/right-property-panel-diagram.test.tsx` cobrindo edição via DiagramStore.
- Ajustar testes existentes que mockam `useVoltaiStore` (deletar mocks obsoletos).
- `docs/sdd/12-auditoria-status.md`: marcar `useVoltaiStore` e `unifilar-canvas.tsx` como ✅ removidos e #WGL-07 concluído.

## Riscos
- Projetos salvos com snapshot Voltai antigo: adicionar migração de payload em `loadDoc` (converter `voltai.nodes` → `diagram.nodes` uma vez).
- Realtime channels com clientes conectados na versão antiga: nomear novo canal (`diagram:v2:${projectId}`) para evitar mistura.

## Detalhes técnicos
- `DiagramStore.patchNode(id, partial)` já existe; extender se faltar suporte a `params` aninhados.
- Preservar API pública `useSelectedNode()` re-exportada para minimizar churn nos consumidores restantes.
- `webgl-canvas.tsx` já usa DiagramStore; apenas remover fallback Voltai residual.

Confirma que sigo com essa remoção agressiva (deleta ~1300 linhas, quebra compat com snapshots muito antigos que não passaram por `loadDoc` v2)?
