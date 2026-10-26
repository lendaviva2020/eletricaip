// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BRAND_PALETTE, THEME_TOKENS, TYPOGRAPHY, RADIUS, SPACING } from "@/lib/design-system/tokens";
import { getRelativeLuminance, getContrastRatio, checkWcagCompliance } from "@/lib/design-system/contrast";
import { applyThemeToDom, useTheme } from "@/lib/design-system/theme";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";

describe("Design System - Brand Palette & Tokens", () => {
  it("defines the exact official brand colors required by specification", () => {
    expect(BRAND_PALETTE.graphite).toBe("#0B0F14");
    expect(BRAND_PALETTE.steel).toBe("#151C24");
    expect(BRAND_PALETTE.orange).toBe("#FF8A00");
    expect(BRAND_PALETTE.white).toBe("#F1F5F9");
    expect(BRAND_PALETTE.gray).toBe("#A7B0BB");
  });

  it("configures the 3 official font families", () => {
    expect(TYPOGRAPHY.fonts.display).toContain("Space Grotesk");
    expect(TYPOGRAPHY.fonts.sans).toContain("IBM Plex Sans");
    expect(TYPOGRAPHY.fonts.mono).toContain("IBM Plex Mono");
  });

  it("defines consistent geometric spacing and border radii", () => {
    expect(RADIUS.lg).toBe("0.5rem"); // 8px industrial standard
    expect(SPACING[4]).toBe("1rem");   // 16px
  });
});

describe("Design System - WCAG 2.2 AA / AAA Contrast Verification", () => {
  it("calculates relative luminance correctly according to W3C", () => {
    const whiteLum = getRelativeLuminance("#FFFFFF");
    const blackLum = getRelativeLuminance("#000000");
    expect(whiteLum).toBeCloseTo(1.0, 2);
    expect(blackLum).toBeCloseTo(0.0, 2);
  });

  it("verifies Technical White on Deep Graphite exceeds WCAG AAA (>= 7:1)", () => {
    const check = checkWcagCompliance(BRAND_PALETTE.white, BRAND_PALETTE.graphite);
    expect(check.ratio).toBeGreaterThan(15.0); // ~17.6:1
    expect(check.passesAa).toBe(true);
    expect(check.passesAaa).toBe(true);
  });

  it("verifies Reading Gray on Deep Graphite exceeds WCAG AAA (>= 7:1)", () => {
    const check = checkWcagCompliance(BRAND_PALETTE.gray, BRAND_PALETTE.graphite);
    expect(check.ratio).toBeGreaterThan(8.0); // ~8.8:1
    expect(check.passesAa).toBe(true);
    expect(check.passesAaa).toBe(true);
  });

  it("verifies Deep Graphite text on Industrial Orange button exceeds WCAG AAA (>= 7:1)", () => {
    const check = checkWcagCompliance(BRAND_PALETTE.graphite, BRAND_PALETTE.orange);
    expect(check.ratio).toBeGreaterThan(8.0); // 8.13:1 (AAA requires >= 7.0:1)
    expect(check.passesAa).toBe(true);
    expect(check.passesAaa).toBe(true);
  });

  it("verifies Deep Graphite on Light Background exceeds WCAG AAA (>= 7:1)", () => {
    const check = checkWcagCompliance(BRAND_PALETTE.graphite, THEME_TOKENS.light.background);
    expect(check.ratio).toBeGreaterThan(17.0); // ~18.2:1
    expect(check.passesAa).toBe(true);
    expect(check.passesAaa).toBe(true);
  });

  it("verifies adjusted primary text on white background passes WCAG AA (>= 4.5:1)", () => {
    const check = checkWcagCompliance(THEME_TOKENS.light.primaryText, "#FFFFFF");
    expect(check.ratio).toBeGreaterThanOrEqual(4.5); // ~5.1:1
    expect(check.passesAa).toBe(true);
  });
});

describe("Design System - Theme Management & Persistence", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("applies dark theme by adding .dark class and setting color-scheme", () => {
    const resolved = applyThemeToDom("dark");
    expect(resolved).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("applies light theme by adding .light class and setting color-scheme", () => {
    const resolved = applyThemeToDom("light");
    expect(resolved).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("updates state via useTheme store", () => {
    useTheme.getState().setTheme("light");
    expect(useTheme.getState().theme).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);

    useTheme.getState().setTheme("dark");
    expect(useTheme.getState().theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("Design System - Component Primitives & States", () => {
  afterEach(cleanup);

  it("renders Button with loading state, accessible spinner, and aria-busy", () => {
    render(<Button loading>Salvar Alterações</Button>);
    const btn = screen.getByRole("button", { name: /salvar alterações/i });
    expect(btn).toBeDefined();
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.hasAttribute("disabled")).toBe(true);
  });

  it("renders IconButton with accessible aria-label", () => {
    render(<IconButton aria-label="Adicionar Alimentador" icon={<span>+</span>} />);
    const btn = screen.getByRole("button", { name: "Adicionar Alimentador" });
    expect(btn).toBeDefined();
  });

  it("renders SearchInput with clear action and shortcut badge", () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <SearchInput placeholder="Buscar nó..." value="" shortcut="Ctrl K" />
    );
    expect(screen.getByText("Ctrl K")).toBeDefined();

    rerender(
      <SearchInput placeholder="Buscar nó..." value="Disjuntor" onClear={onClear} shortcut="Ctrl K" />
    );
    const clearBtn = screen.getByLabelText("Limpar pesquisa");
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalled();
  });

  it("renders FormField connecting label, input, description, and error with role='alert'", () => {
    render(
      <FormField id="tag" label="Tag NBR" description="Identificador único" error="Tag obrigatória">
        <input />
      </FormField>
    );

    const label = screen.getByText("Tag NBR");
    expect(label).toBeDefined();

    const desc = screen.getByText("Identificador único");
    expect(desc).toBeDefined();

    const error = screen.getByRole("alert");
    expect(error.textContent).toContain("Tag obrigatória");
  });

  it("renders Badge with semantic variants (brand, success, warning, info)", () => {
    const { container } = render(
      <div>
        <Badge variant="brand">Laranja</Badge>
        <Badge variant="success">Energizado</Badge>
        <Badge variant="warning">Alerta</Badge>
        <Badge variant="info">Telemetria</Badge>
      </div>
    );

    expect(screen.getByText("Laranja")).toBeDefined();
    expect(screen.getByText("Energizado")).toBeDefined();
    expect(screen.getByText("Alerta")).toBeDefined();
    expect(screen.getByText("Telemetria")).toBeDefined();
  });

  it("renders EmptyState with title, description, and action button", () => {
    render(
      <EmptyState
        title="Nenhum Motor Cadastrado"
        description="Adicione alimentadores na barra de ferramentas."
        action={<Button size="sm">Novo Motor</Button>}
      />
    );

    expect(screen.getByText("Nenhum Motor Cadastrado")).toBeDefined();
    expect(screen.getByText("Novo Motor")).toBeDefined();
  });

  it("renders ErrorState with alert role and retry callback", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Falha de comunicação" onRetry={onRetry} />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeDefined();

    const retryBtn = screen.getByRole("button", { name: /tentar novamente/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalled();
  });

  it("renders LoadingState with polite live region", () => {
    render(<LoadingState message="Simulando malha..." />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText("Simulando malha...")).toBeDefined();
  });
});
