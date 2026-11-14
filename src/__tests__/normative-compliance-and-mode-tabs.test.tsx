// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NormativeCompliancePanel } from "@/components/diagnostics/normative-compliance-panel";
import { ModeTabs } from "@/components/mode-tabs";
import { useDiagramStore } from "@/lib/diagram/store";
import { useEditorStore } from "@/lib/editor/store";
import { createEmptyDoc } from "@/lib/diagram/model";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("NormativeCompliancePanel & ModeTabs Integration", () => {
  beforeEach(() => {
    useDiagramStore.setState({ doc: createEmptyDoc() });
    useEditorStore.setState({
      activeMode: "unifilar",
      focusMode: false,
      consoleOpen: false,
      consoleTab: "diagnosticos",
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe("NormativeCompliancePanel", () => {
    it("renders real normative evaluation with overall badge and summary stats", () => {
      render(<NormativeCompliancePanel />);

      const panel = screen.getByTestId("normative-compliance-panel");
      expect(panel).toBeTruthy();

      const overallBadge = screen.getByTestId("normative-overall-status");
      expect(overallBadge).toBeTruthy();
      expect(overallBadge.textContent).toMatch(/VALID|WARNING|INCOMPLETE|NOT_VERIFIABLE|INVALID/);

      // Verify button to jump to diagnostics & AI repair exists
      const aiFixButtons = screen.getAllByText(/Diagnósticos & Corrigir com IA/i);
      expect(aiFixButtons.length).toBeGreaterThan(0);
    });

    it("opens console and switches tab to diagnosticos when clicking AI repair shortcut", () => {
      render(<NormativeCompliancePanel />);

      const aiFixButton = screen.getAllByText(/Diagnósticos & Corrigir com IA/i)[0];
      fireEvent.click(aiFixButton);

      expect(useEditorStore.getState().consoleOpen).toBe(true);
      expect(useEditorStore.getState().consoleTab).toBe("diagnosticos");
    });
  });

  describe("ModeTabs", () => {
    it("renders engineering mode tabs and allows switching modes", () => {
      renderWithQueryClient(<ModeTabs />);

      const unifilarTab = screen.getByRole("tab", { name: /unifilar/i });
      expect(unifilarTab).toBeTruthy();

      const ladderTab = screen.getByRole("tab", { name: /ladder/i });
      expect(ladderTab).toBeTruthy();

      fireEvent.click(ladderTab);
      expect(useEditorStore.getState().activeMode).toBe("ladder");
    });

    it("toggles focus mode via focus button", () => {
      renderWithQueryClient(<ModeTabs />);

      const focusToggle = screen.getByTestId("focus-mode-toggle");
      expect(focusToggle).toBeTruthy();
      expect(useEditorStore.getState().focusMode).toBe(false);

      fireEvent.click(focusToggle);
      expect(useEditorStore.getState().focusMode).toBe(true);

      fireEvent.click(focusToggle);
      expect(useEditorStore.getState().focusMode).toBe(false);
    });
  });
});
