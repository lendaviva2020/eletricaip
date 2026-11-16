import { describe, expect, it, vi } from "vitest";
import { createMfaGate, userHasVerifiedFactor } from "@/integrations/supabase/mfa-enforcement";

describe("MFA no servidor (RISK-017)", () => {
  it("sessão aal2 passa sem consultar o Auth", async () => {
    const gate = createMfaGate();
    const lookup = vi.fn(async () => true);
    expect(await gate.check({ userId: "u", aal: "aal2", lookup })).toBe("ok");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("senha roubada: sessão aal1 de usuário COM fator verificado é recusada", async () => {
    const gate = createMfaGate();
    expect(await gate.check({ userId: "u", aal: "aal1", lookup: async () => true })).toBe(
      "mfa_required",
    );
  });

  it("aal ausente (fallback sem JWT verificado) é tratado como aal1", async () => {
    const gate = createMfaGate();
    expect(await gate.check({ userId: "u", aal: undefined, lookup: async () => true })).toBe(
      "mfa_required",
    );
  });

  it("usuário sem MFA segue com aal1 e o resultado fica em cache", async () => {
    const gate = createMfaGate();
    const lookup = vi.fn(async () => false);
    expect(await gate.check({ userId: "u", aal: "aal1", lookup })).toBe("ok");
    expect(await gate.check({ userId: "u", aal: "aal1", lookup })).toBe("ok");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("cache expira: fator cadastrado passa a valer após o TTL", async () => {
    let t = 0;
    const gate = createMfaGate({ ttlMs: 1000, now: () => t });
    let has = false;
    const lookup = async () => has;
    expect(await gate.check({ userId: "u", aal: "aal1", lookup })).toBe("ok");
    has = true;
    t = 1500;
    expect(await gate.check({ userId: "u", aal: "aal1", lookup })).toBe("mfa_required");
  });

  it("invalidate força nova consulta imediata", async () => {
    const gate = createMfaGate();
    let has = false;
    const lookup = async () => has;
    await gate.check({ userId: "u", aal: "aal1", lookup });
    has = true;
    gate.invalidate("u");
    expect(await gate.check({ userId: "u", aal: "aal1", lookup })).toBe("mfa_required");
  });

  it("Auth indisponível: fail-closed e sem cache do erro", async () => {
    const gate = createMfaGate();
    expect(await gate.check({ userId: "u", aal: "aal1", lookup: async () => null })).toBe(
      "mfa_check_unavailable",
    );
    expect(
      await gate.check({
        userId: "u",
        aal: "aal1",
        lookup: async () => {
          throw new Error("rede");
        },
      }),
    ).toBe("mfa_check_unavailable");
    expect(gate.size()).toBe(0);
  });

  it("cache tem limite de memória", async () => {
    const gate = createMfaGate({ maxEntries: 3 });
    for (const id of ["a", "b", "c", "d", "e"]) {
      await gate.check({ userId: id, aal: "aal1", lookup: async () => false });
    }
    expect(gate.size()).toBe(3);
  });

  it("só fatores com status verified contam", () => {
    expect(userHasVerifiedFactor({ factors: [{ status: "unverified" }] })).toBe(false);
    expect(userHasVerifiedFactor({ factors: [{ status: "verified" }] })).toBe(true);
    expect(userHasVerifiedFactor(null)).toBe(false);
  });

  it("middleware aplica o gate e responde 401/503", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../integrations/supabase/auth-middleware.ts"),
      "utf8",
    );
    expect(src).toContain("mfaGate.check(");
    expect(src).toContain('aal = payload["aal"]');
    expect(src).toMatch(/MFA_REQUIRED[\s\S]*status: 401/);
    expect(src).toMatch(/MFA_CHECK_UNAVAILABLE[\s\S]*status: 503/);
  });
});
