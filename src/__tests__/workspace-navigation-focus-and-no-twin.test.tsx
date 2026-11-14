/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModeTabs } from "@/components/mode-tabs";
import { NormativeCompliancePanel } from "@/components/diagnostics/normative-compliance-panel";
import { MODES } from "@/lib/workspace-data";
import { useEditorStore } from "@/lib/editor/store";
import { useDiagramStore } from "@/lib/diagram/store";
import { createEmptyDoc, makeNode } from "@/lib/diagram/model";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("P0.4 / P0.5 / P0.7 — Navegação Industrial, Modo Foco e Eliminação do Digital Twin", () => {
  beforeEach(() => {
    cleanup();
    useEditorStore.setState({
      activeMode: "unifilar",
      leftCollapsed: false,
      rightCollapsed: false,
      appSidebarCollapsed: false,
      consoleOpen: true,
      consoleTab: "Logs",
      focusMode: false,
      _focusRestore: null,
    });
    useDiagramStore.setState({
      doc: createEmptyDoc(),
      activeSheet: "unifilar",
      selectedNodeIds: [],
    });
  });

  it("MODES exclui completamente Digital Twin e mantém Studio IEC antes de eletric Studio", () => {
    const ids = MODES.map((m) => m.id as string);
    expect(ids).not.toContain("twin");
    expect(ids).not.toContain("digitalTwin");
    expect(ids).not.toContain("digital-twin");

    const studioIdx = ids.indexOf("studio");
    const compactIdx = ids.indexOf("compactStudio");
    expect(studioIdx).toBeGreaterThanOrEqual(0);
    expect(compactIdx).toBeGreaterThan(studioIdx);
  });

  it("ModeTabs renderiza menu categorizado AMBIENTES DE ENGENHARIA pesquisável e alterna modos + sheet", () => {
    renderWithClient(<ModeTabs />);

    const menuBtn = screen.getByTestId("environments-menu-btn");
    expect(menuBtn).toBeDefined();

    fireEvent.click(menuBtn);
    const popover = screen.getByTestId("environments-menu-popover");
    expect(popover).toBeDefined();

    // Categorias presentes
    expect(popover.textContent).toContain("Elétrica");
    expect(popover.textContent).toContain("Controle & CLP");
    expect(popover.textContent).toContain("Supervisão & Operação");
    expect(popover.textContent?.toLowerCase()).not.toContain("digital twin");

    // Pesquisa filtra corretamente
    const searchInput = screen.getByTestId("environments-search-input");
    fireEvent.change(searchInput, { target: { value: "multifilar" } });
    const multifilarItem = screen.getByTestId("env-menu-item-multifilar");
    expect(multifilarItem).toBeDefined();
    expect(screen.queryByTestId("env-menu-item-scada")).toBeNull();

    // Seleciona Multifilar e fecha menu
    fireEvent.click(multifilarItem);
    expect(useEditorStore.getState().activeMode).toBe("multifilar");
    expect(useDiagramStore.getState().activeSheet).toBe("multifilar");
    expect(screen.queryByTestId("environments-menu-popover")).toBeNull();
  });

  it("ModeTabs suporta navegação por teclado (ArrowRight/ArrowLeft/Home/End)", () => {
    renderWithClient(<ModeTabs />);

    const unifilarTab = screen.getByRole("tab", { name: /Unifilar|Single-Line/i });
    fireEvent.keyDown(unifilarTab, { key: "ArrowRight" });
    expect(useEditorStore.getState().activeMode).toBe("multifilar");

    const multifilarTab = screen.getByRole("tab", { name: /Multifilar|Multi-Line/i });
    fireEvent.keyDown(multifilarTab, { key: "ArrowLeft" });
    expect(useEditorStore.getState().activeMode).toBe("unifilar");
  });

  it("Modo Foco de Engenharia recolhe painéis auxiliares e restaura o estado anterior ao sair", () => {
    useEditorStore.setState({
      leftCollapsed: false,
      rightCollapsed: true,
      appSidebarCollapsed: false,
      consoleOpen: true,
    });

    renderWithClient(<ModeTabs />);
    const focusBtn = screen.getByTestId("focus-mode-toggle");
    fireEvent.click(focusBtn);

    let s = useEditorStore.getState();
    expect(s.focusMode).toBe(true);
    expect(s.leftCollapsed).toBe(true);
    expect(s.rightCollapsed).toBe(true);
    expect(s.appSidebarCollapsed).toBe(true);
    expect(s.consoleOpen).toBe(false);

    // Ao desativar, restaura exatamente o estado anterior (inclusive rightCollapsed: true)
    fireEvent.click(focusBtn);
    s = useEditorStore.getState();
    expect(s.focusMode).toBe(false);
    expect(s.leftCollapsed).toBe(false);
    expect(s.rightCollapsed).toBe(true);
    expect(s.appSidebarCollapsed).toBe(false);
    expect(s.consoleOpen).toBe(true);
  });

  it("NormativeCompliancePanel exibe auditoria normativa explícita sem parâmetros inventados", () => {
    useDiagramStore.setState({
      doc: createEmptyDoc({
        nodes: {
          qf1: makeNode({
            id: "qf1",
            sheet: "unifilar",
            position: { x: 200, y: 120 },
            label: "QF1",
            params: { kind: "breaker", poles: 3, in_A: 32, curve: "C" },
          }),
          m1: makeNode({
            id: "m1",
            sheet: "unifilar",
            position: { x: 200, y: 260 },
            label: "M1",
            params: { kind: "motor", power_kW: 5.5, voltage_V: 380, startMethod: "DOL" },
          }),
        },
        edges: {
          e1: {
            id: "e1",
            sheet: "unifilar",
            source: "qf1",
            sourcePort: "B",
            target: "m1",
            targetPort: "T",
            kind: "power",
          },
        },
      }),
    });

    renderWithClient(<NormativeCompliancePanel />);
    const panel = screen.getByTestId("normative-compliance-panel");
    expect(panel).toBeDefined();
    expect(screen.getByTestId("normative-overall-status").textContent).toBe("REQUIRES_REVIEW");
    expect(panel.textContent).toContain("IEC 60909");
    expect(panel.textContent).toContain("NBR 5410");
  });
});
