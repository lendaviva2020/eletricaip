// @vitest-environment jsdom
import type React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Route } from "@/routes/calculations";
import { useI18nStore } from "@/lib/i18n";

const Page = Route.options.component as () => React.ReactElement;

describe("Tela de cálculos elétricos", () => {
  afterEach(() => cleanup());

  it("calcula o ramal de motor com os valores padrão (7,5 kW / 380 V)", () => {
    useI18nStore.setState({ locale: "pt-BR" });
    render(<Page />);
    expect(screen.getByText("14,4 A")).toBeTruthy();
    expect(screen.getByText("20 A")).toBeTruthy();
    expect(screen.getByText("2.5 mm²")).toBeTruthy();
  });

  it("entrada inválida mostra erro e não calcula", () => {
    useI18nStore.setState({ locale: "pt-BR" });
    render(<Page />);
    fireEvent.change(screen.getByLabelText(/Potência/), { target: { value: "-3" } });
    expect(screen.getByText("Valor fora da faixa válida")).toBeTruthy();
    expect(screen.getByText(/Corrija os campos destacados/)).toBeTruthy();
  });

  it("curto-circuito IEC 60909 em inglês", () => {
    useI18nStore.setState({ locale: "en" });
    render(<Page />);
    fireEvent.click(screen.getByRole("tab", { name: "Short circuit" }));
    // Dyn11: Z0 ≈ Z1 → I″k1 = I″k3
    expect(screen.getAllByText("16.71 kA", { selector: "dd" })).toHaveLength(2);
    expect(screen.getByText("33.94 kA")).toBeTruthy();
  });

  it("harmônicas: fator K 4,66 → transformador K-9", () => {
    useI18nStore.setState({ locale: "pt-BR" });
    render(<Page />);
    fireEvent.click(screen.getByRole("tab", { name: "Harmônicas" }));
    expect(screen.getByText("4,66")).toBeTruthy();
    expect(screen.getByText("K-9")).toBeTruthy();
  });

  it("harmônicas: espectro malformado mostra erro e não calcula", () => {
    useI18nStore.setState({ locale: "pt-BR" });
    render(<Page />);
    fireEvent.click(screen.getByRole("tab", { name: "Harmônicas" }));
    fireEvent.change(screen.getByLabelText(/Espectro/), { target: { value: "5:20, x:1" } });
    expect(screen.getByText(/Use o formato 5:20/)).toBeTruthy();
    expect(screen.getByText(/Corrija os campos destacados/)).toBeTruthy();
  });

  it('aterramento: haste 5/8" × 2,4 m em 100 Ω·m ≈ 40,4 Ω e TT atende com DR 30 mA', () => {
    useI18nStore.setState({ locale: "pt-BR" });
    render(<Page />);
    fireEvent.click(screen.getByRole("tab", { name: "Aterramento" }));
    expect(screen.getAllByText(/^40,4\d Ω$/).length).toBeGreaterThan(0);
    expect(screen.getByText("Atende")).toBeTruthy();
  });
});
