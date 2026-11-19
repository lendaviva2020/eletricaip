# DIGITAL TWIN COMPLETE REMOVAL REPORT

**Prioridade:** P0.7  
**Data:** 2026-11-14  
**Branch:** `feat/ai-continuity-unifilar-connectivity-fix`  

---

## 1. Escopo Executado

O módulo **Digital Twin** e toda a pilha exclusiva de renderização 3D (`three`, `@types/three`, `@react-three/fiber`, `@react-three/drei`) foram completamente eliminados da aplicação web, roteamento, interface do usuário, estado global, funções de servidor, testes e empacotamento Vite, mantendo intactos todos os demais sistemas industriais (`Unifilar`, `Multifilar`, `Ladder`, `FBD`, `SCADA`, `PLC`, `Simulação`, `Alarmes`, `Studio IEC`, `eletric Studio` e botão **Corrigir com IA**).

---

## 2. Arquivos Removidos (`git rm`)

1. `src/routes/digital-twin.tsx`
2. `src/components/canvases/twin-3d-viewer.tsx`
3. `src/components/canvases/twin-canvas.tsx`
4. `src/components/digital-twin/telemetry-health-panel.tsx`
5. `src/components/digital-twin/what-if-panel.tsx`
6. `src/components/editor/sidebars/editor-twin-sidebar.tsx`
7. `src/hooks/use-twin-telemetry-persistence.ts`
8. `src/lib/digital-twin-store.ts`
9. `src/lib/digital-twin.functions.ts`
10. `src/lib/seed-digital-twin.ts`
11. `src/__tests__/dashboard-telemetry-isolation.test.ts`
12. `src/__tests__/twin-telemetry-flush.test.ts`
13. `src/__tests__/twin-what-if.test.ts`

---

## 3. Dependências Desinstaladas (`package.json` / `bun.lock`)

Removidas via `bun remove`:
- `three`
- `@types/three`
- `@react-three/fiber`
- `@react-three/drei`

O chunk `vendor-3d` foi removido de [`vite.config.ts`](vite.config.ts). A árvore de rotas [`src/routeTree.gen.ts`](src/routeTree.gen.ts) foi regenerada com `@tanstack/router-cli` e possui zero referências a `/digital-twin`.

---

## 4. Refatorações de Fronteira Realizadas

- **Navegação & Workspace:** removidos o modo `twin` de [`MODES`](src/lib/workspace-data.ts), [`IndustrialWorkspace`](src/components/industrial-workspace.tsx), [`LeftSidebarHost`](src/components/editor/left-sidebar-host.tsx), [`CommandPalette`](src/components/command-palette.tsx), [`MobileMenu`](src/components/mobile-menu.tsx), [`OnboardingTour`](src/components/onboarding-tour.tsx), [`KonvaCanvas`](src/components/canvases/konva-canvas.tsx) (`Variant = "scada" | "sim"`) e [`LazyTwin3DViewer`](src/components/canvases/lazy.tsx).
- **Shadow Drift do Studio IEC (preservado com nomenclatura correta):** conceitos de espelho lógico de runtime de CLPs em [`src/lib/studio/canonical/types.ts`](src/lib/studio/canonical/types.ts) e [`src/lib/studio/fleet/fleet-manager.ts`](src/lib/studio/fleet/fleet-manager.ts) foram renomeados para `ControllerShadowSyncStatusSchema`, `ControllerShadowStateSchema`, `controllerShadowStates` e `updateControllerShadow` / `isShadowInSync` para eliminar ambiguidade terminológica sem afetar o gerenciamento de frota PLC.

---

## 5. Artefato SQL Reversível (Sem Execução Remota)

Criada a migração reversível [`supabase/migrations/20261114150000_drop_digital_twin_module.sql`](supabase/migrations/20261114150000_drop_digital_twin_module.sql), contendo bloco de `ROLLBACK SQL` comentado no cabeçalho e instruções `DROP POLICY` / `DROP TABLE IF EXISTS public.twin_hotspots CASCADE` / `DROP COLUMN IF EXISTS twin_model_path`. Não foi executada contra banco remoto nesta etapa.
