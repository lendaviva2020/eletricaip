# WORKSPACE CONSOLIDATION & RESPONSIVE ACCEPTANCE REPORT

**Arquitetura de Layout:** [`IndustrialWorkspace`](src/components/industrial-workspace.tsx), [`AuthGate`](src/routes/__root.tsx#L159), [`ModeTabs`](src/components/mode-tabs.tsx), [`RightPanel`](src/components/right-panel.tsx), [`UnifiedBottomDock`](src/components/editor/unified-bottom-dock.tsx)  
**Data:** 2026-11-14  

---

## 1. Consolidação das 4 Regiões do Workbench

1. **Barra Superior & Navegação de Módulos (`Topbar` + `ModeTabs` + `SaveBadge`):**
   - Menu pesquisável categorizado **AMBIENTES DE ENGENHARIA** (`Elétrica`, `Controle & CLP`, `Supervisão & Operação`), setas automáticas de transbordo, rolagem via mouse wheel/drag/teclado e toggle direto do Modo Foco.
2. **Área Central Dominante (Canvas):**
   - Canvas PixiJS/Konva/Ladder/FBD/SCADA/Studio IEC/`eletric Studio` ocupa toda a área remanescente com controles integrados de zoom/enquadramento (`canvas-zoom-controls`).
3. **Painel Lateral Direito Contextual (`RightPanel`):**
   - Propriedades, Copiloto IA, Conformidade Normativa ao vivo (`NormativeCompliancePanel` integrado em `NormsPanel` com atalho direto para Diagnósticos & `Corrigir com IA`), Revisões e Manutenção.
   - Em viewports `< 1024px`, opera como gaveta sobreposta limitada a `max-w-[85vw]` com backdrop fechável por toque (`setPanelsCollapsed(true, true)`).
4. **Dock Inferior Unificado Redimensionável (`UnifiedBottomDock`):**
   - Mantém altura padrão recolhida (`h-9`) e expandida (`h-56`) com alça de redimensionamento (`data-testid="dock-resize-handle"`, `140px–440px`, duplo clique restaura padrão), sem painéis flutuantes sobrepostos permanentes.

---

## 2. Modo Foco de Engenharia (`Ctrl+Shift+F`)

- **Estado & Restauração ([`useEditorStore`](src/lib/editor/store.ts)):**
  - Ao ativar `setFocusMode(true)` / `toggleFocusMode()`, captura snapshot `_focusRestore` (`leftCollapsed`, `rightCollapsed`, `appSidebarCollapsed`, `consoleOpen`) e recolhe barra lateral esquerda, painel direito, sidebar da aplicação e dock inferior.
  - Em [`AuthGate`](src/routes/__root.tsx#L159), quando `focusMode && path.startsWith("/workspace")`, oculta `<LazyAppSidebar />` e `<LazyTopbar />` maximizando a área útil do canvas.
  - Ao sair do Modo Foco (`Ctrl+Shift+F` ou botão `data-testid="focus-mode-toggle"`), restaura exatamente o estado anterior dos painéis; ao desmontar o workspace, `setFocusMode(false)` restaura o shell da aplicação.

---

## 3. Matriz de Aceitação Responsiva (Playwright Real Chromium)

Suíte [`tests/e2e/03-workspace-reconstruction-p0.spec.ts`](tests/e2e/03-workspace-reconstruction-p0.spec.ts) executada contra servidor local (`http://127.0.0.1:3000`):

| Resolução | Classe de Dispositivo | Overflow Horizontal (`scrollWidth <= innerWidth + 2`) | Menu Ambientes & Sem Digital Twin | Resultado & Tempo |
| :--- | :--- | :--- | :--- | :--- |
| `1920x1080` | Desktop FHD | Negativo (`false`) | Aprovado | **PASS** (`5.7s`) |
| `1600x900` | Desktop HD+ | Negativo (`false`) | Aprovado | **PASS** (`4.8s`) |
| `1440x900` | Desktop WXGA+ | Negativo (`false`) | Aprovado | **PASS** (`4.7s`) |
| `1366x768` | Notebook Padrão | Negativo (`false`) | Aprovado | **PASS** (`4.2s`) |
| `1280x800` | Notebook Compacto | Negativo (`false`) | Aprovado | **PASS** (`4.1s`) |
| `768x1024` | Tablet Industrial | Negativo (`false`) | Aprovado (`shouldAutoCollapsePanels` `< 1280px` + gavetas `max-w-[85vw]`) | **PASS** (`4.3s`) |
| `390x844` | Mobile | Negativo (`false`) | Aprovado (`MobileMenu` + gavetas `max-w-[85vw]`) | **PASS** (`3.6s`) |
