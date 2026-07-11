// #ONB-01 · tour guiado — abre com flag pending e navega os passos.
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OnboardingTour, markTourPending } from "@/components/onboarding-tour";
import { useEditorStore } from "@/lib/editor/store";

describe("#ONB-01 · OnboardingTour", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("não abre sem flag pending", () => {
    render(<OnboardingTour />);
    expect(screen.queryByTestId("onboarding-tour")).toBeNull();
  });

  it("não abre se já visto (mesmo com pending)", () => {
    localStorage.setItem("eletricai:tour-seen:v1", "1");
    markTourPending();
    render(<OnboardingTour />);
    expect(screen.queryByTestId("onboarding-tour")).toBeNull();
  });

  it("abre com pending, avança pelos modos e ativa cada modo", () => {
    const setMode = vi.spyOn(useEditorStore.getState(), "setActiveMode");
    markTourPending();
    render(<OnboardingTour />);
    expect(screen.getByTestId("onboarding-tour")).toBeTruthy();
    // passo 1: welcome
    expect(screen.getByText(/Bem-vindo/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    // passo 2: unifilar
    expect(setMode).toHaveBeenCalledWith("unifilar");
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(setMode).toHaveBeenCalledWith("ladder");
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(setMode).toHaveBeenCalledWith("fbd");
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    expect(setMode).toHaveBeenCalledWith("scada");
    fireEvent.click(screen.getByRole("button", { name: /Próximo/i }));
    // último passo: Concluir
    fireEvent.click(screen.getByRole("button", { name: /Concluir/i }));
    expect(screen.queryByTestId("onboarding-tour")).toBeNull();
    expect(localStorage.getItem("eletricai:tour-seen:v1")).toBe("1");
    // pending consumido
    expect(localStorage.getItem("eletricai:tour-pending")).toBeNull();
  });

  it("botão Pular fecha e marca como visto", () => {
    markTourPending();
    render(<OnboardingTour />);
    fireEvent.click(screen.getByRole("button", { name: /^Pular$/ }));
    expect(screen.queryByTestId("onboarding-tour")).toBeNull();
    expect(localStorage.getItem("eletricai:tour-seen:v1")).toBe("1");
  });
});
