// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { User } from "@supabase/supabase-js";

const mfa = vi.hoisted(() => ({
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  challengeAndVerify: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { mfa, refreshSession: vi.fn(async () => ({})) } },
}));

import { MfaChallenge, MfaSettingsCard, useMfaRequirement } from "@/components/auth/mfa";
import { useI18nStore } from "@/lib/i18n";

const user = { id: "u1", app_metadata: {} } as unknown as User;

describe("MFA — interface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useI18nStore.setState({ locale: "pt-BR" });
  });
  afterEach(() => cleanup());

  it("exige o segundo fator quando a sessão é aal1 e o usuário tem fator", async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    const { result } = renderHook(() => useMfaRequirement(user));
    await waitFor(() => expect(result.current.state).toBe("required"));
  });

  it("libera quando não há fator (aal1 → aal1) ou a sessão já é aal2", async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    const a = renderHook(() => useMfaRequirement(user));
    await waitFor(() => expect(a.result.current.state).toBe("ok"));
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });
    const b = renderHook(() => useMfaRequirement(user));
    await waitFor(() => expect(b.result.current.state).toBe("ok"));
  });

  it("erro ao consultar o nível bloqueia (fail-closed)", async () => {
    mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: new Error("x") });
    const { result } = renderHook(() => useMfaRequirement(user));
    await waitFor(() => expect(result.current.state).toBe("error"));
  });

  it("código errado não libera; código certo chama onVerified", async () => {
    mfa.listFactors.mockResolvedValue({
      data: { totp: [{ id: "f1", status: "verified" }] },
      error: null,
    });
    const onVerified = vi.fn();
    render(<MfaChallenge onVerified={onVerified} onSignOut={() => undefined} />);
    const input = screen.getByLabelText("Código de 6 dígitos");

    mfa.challengeAndVerify.mockResolvedValueOnce({ error: new Error("invalid") });
    fireEvent.change(input, { target: { value: "123456" } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onVerified).not.toHaveBeenCalled();

    mfa.challengeAndVerify.mockResolvedValueOnce({ error: null });
    fireEvent.change(input, { target: { value: "654321" } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: "f1", code: "654321" });
  });

  it("campo aceita só dígitos (no máximo 6)", () => {
    render(<MfaChallenge onVerified={() => undefined} onSignOut={() => undefined} />);
    const input = screen.getByLabelText("Código de 6 dígitos") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "12a34b5678" } });
    expect(input.value).toBe("123456");
  });

  it("QR só é exibido se for SVG em data URL (bloqueia javascript:)", async () => {
    mfa.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    mfa.enroll.mockResolvedValue({
      data: { id: "f2", totp: { qr_code: "javascript:alert(1)", secret: "ABC", uri: "" } },
      error: null,
    });
    render(<MfaSettingsCard />);
    await act(async () => {
      fireEvent.click(await screen.findByText("Ativar verificação em duas etapas"));
    });
    expect(screen.queryByAltText("QR code para o aplicativo autenticador")).toBeNull();
    expect(screen.getByText("ABC")).toBeTruthy();
  });
});
