# INDUSTRIAL WORKSPACE NAVIGATION REDESIGN REPORT

**Componente Principal:** [`ModeTabs`](src/components/mode-tabs.tsx)  
**Dados & Ordem Canônica:** [`MODES`](src/lib/workspace-data.ts#L31-L42)  
**Data:** 2026-11-14  

---

## 1. Diagnóstico do Problema Anterior

As abas superiores utilizavam apenas `overflow-x-auto scrollbar-none`, o que causava recorte visual de módulos em telas `1280px–1440px` sem setas indicadoras de transbordo, sem pesquisa direta por módulo e sem agrupamento por disciplina de engenharia.

---

## 2. Nova Arquitetura de Navegação

1. **Menu Pesquisável Categorizado `AMBIENTES DE ENGENHARIA` (`data-testid="environments-menu-btn"`):**
   - Agrupa os módulos em 3 categorias:
     - **Elétrica:** `Unifilar`, `Multifilar`
     - **Controle & CLP:** `Ladder`, `FBD`, `PLC`, `Studio IEC` (`studio`), `eletric Studio` (`compactStudio`, condicional a `isStudioEnabled`)
     - **Supervisão & Operação:** `SCADA Supervisório`, `Simulação`, `Alarmes`
   - Popover (`data-testid="environments-menu-popover"`) com campo de busca em tempo real (`data-testid="environments-search-input"`), fechamento por `Escape` ou clique externo, e sincronização automática da folha do diagrama ao escolher `unifilar`/`multifilar`.
2. **Faixa Horizontal Inteligente (`data-testid="mode-tabs-scroll"`):**
   - Detecção automática de overflow via `ResizeObserver`, `resize` e `scroll`.
   - Setas esquerda/direita (`data-testid="mode-tabs-left"` / `data-testid="mode-tabs-right"`) exibidas automaticamente quando há overflow horizontal.
   - Tradução de scroll vertical do mouse (`onWheel`) para deslocamento horizontal.
   - Arraste horizontal por ponteiro (`PointerEvents`) com limiar `> 6px` para distinguir scroll de clique na aba.
   - Navegação completa por teclado (`ArrowLeft`, `ArrowRight`, `Home`, `End`) conforme padrão `tablist`/`tab`.
   - Auto-centralização suave da aba ativa via `scrollIntoView({ inline: "nearest", block: "nearest" })`.
3. **Preservação & Limpeza de Módulos:**
   - **Zero Digital Twin:** módulo e rota completamente removidos.
   - **`Studio IEC` antes de `eletric Studio`:** ordem preservada em [`MODES`](src/lib/workspace-data.ts#L40-L41) e na categoria `Controle & CLP`.
4. **Acesso Direto ao Modo Foco de Engenharia:**
   - Botão `data-testid="focus-mode-toggle"` ao lado de `Sync · 60Hz`, sincronizado com `Ctrl+Shift+F`.
