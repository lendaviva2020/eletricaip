// @vitest-environment jsdom
// Feedback do cadastro: o slot entre checkbox e botão só exibe mensagens
// legítimas (string não-vazia); nunca fragmentos isolados.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => opts,
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
  useRouter: () => ({ navigate: vi.fn() }),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, signOut: vi.fn() }),
}));

const signUpMock = vi.fn(async (..._args: unknown[]) => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => signUpMock(...args),
      signInWithOAuth: vi.fn(async () => ({ error: null })),
    },
  },
}));

import { Route as SignupRoute } from "@/routes/signup";

const SignupPage = (SignupRoute as unknown as { component: React.ComponentType }).component;

function fillFields() {
  fireEvent.change(screen.getByLabelText("Nome completo"), {
    target: { value: "Ada Lovelace" },
  });
  fireEvent.change(screen.getByLabelText("Email corporativo"), {
    target: { value: "ada@exemplo.com" },
  });
  fireEvent.change(screen.getByLabelText("Senha (mín. 6 caracteres)"), {
    target: { value: "secreta1" },
  });
}

describe("signup · feedback entre checkbox e botão", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("estado inicial: nenhum parágrafo de erro/sucesso no slot", () => {
    const { container } = render(<SignupPage />);
    const form = container.querySelector("form");
    expect(form).toBeTruthy();
    expect(form!.querySelectorAll("p.text-destructive").length).toBe(0);
    expect(form!.querySelectorAll("p.text-success").length).toBe(0);
  });

  it("submit sem checkbox: mensagem de validação completa com role=alert", async () => {
    const { container } = render(<SignupPage />);
    fillFields();
    fireEvent.submit(container.querySelector("form")!);
    const p = await screen.findByRole("alert");
    expect(p.className).toContain("text-destructive");
    expect(p.textContent).toBe(
      "É necessário confirmar que você tem 18 anos ou mais para criar uma conta.",
    );
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("submit com checkbox: chama signUp e mostra sucesso com role=status", async () => {
    const { container } = render(<SignupPage />);
    fillFields();
    fireEvent.click(screen.getByLabelText(/Confirmo que tenho 18 anos/i));
    fireEvent.submit(container.querySelector("form")!);
    expect(signUpMock).toHaveBeenCalledTimes(1);
    const p = await screen.findByRole("status");
    expect(p.className).toContain("text-success");
    expect(p.textContent).toBe("Confirme seu email para ativar a conta.");
    expect(container.querySelector("p.text-destructive")).toBeNull();
  });
});
