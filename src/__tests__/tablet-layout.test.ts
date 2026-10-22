// Testes da Fase 8: layout para tablets (8.1) e acessibilidade (8.2).
import { describe, expect, it } from "vitest";
import {
  SIDEBAR_MIN_WIDTH,
  TABLET_AUTO_COLLAPSE_WIDTH,
  shouldAutoCollapsePanels,
} from "@/lib/editor/tablet-layout";
import { useEditorStore } from "@/lib/editor/store";

describe("Fase 8.1 — layout para tablets industriais", () => {
  it("recolhe painéis em 1024x768 e em iPad/Galaxy Tab paisagem", () => {
    expect(shouldAutoCollapsePanels(1024)).toBe(true);
    expect(shouldAutoCollapsePanels(1180)).toBe(true);
    expect(shouldAutoCollapsePanels(1279)).toBe(true);
  });

  it("mantém painéis abertos em desktop e ignora largura inválida", () => {
    expect(shouldAutoCollapsePanels(TABLET_AUTO_COLLAPSE_WIDTH)).toBe(false);
    expect(shouldAutoCollapsePanels(1920)).toBe(false);
    expect(shouldAutoCollapsePanels(0)).toBe(false);
    expect(SIDEBAR_MIN_WIDTH).toBeLessThan(1024);
  });

  it("setPanelsCollapsed recolhe/expande os dois painéis de forma idempotente", () => {
    const { setPanelsCollapsed } = useEditorStore.getState();
    setPanelsCollapsed(true, true);
    expect(useEditorStore.getState().leftCollapsed).toBe(true);
    expect(useEditorStore.getState().rightCollapsed).toBe(true);
    setPanelsCollapsed(false, false);
    expect(useEditorStore.getState().leftCollapsed).toBe(false);
    expect(useEditorStore.getState().rightCollapsed).toBe(false);
  });
});
