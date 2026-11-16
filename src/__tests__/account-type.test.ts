import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accountTypeFromMetadata,
  accountTypeFromSearch,
  organizationNameFor,
} from "@/lib/account-type";

describe("perfil da conta: empresa × autônomo", () => {
  it("lê o perfil do cadastro e ignora valores inválidos", () => {
    expect(accountTypeFromMetadata({ account_type: "empresa" })).toBe("empresa");
    expect(accountTypeFromMetadata({ account_type: "autonomo" })).toBe("autonomo");
    expect(accountTypeFromMetadata({ account_type: "admin" })).toBeNull();
    expect(accountTypeFromMetadata(null)).toBeNull();
    expect(accountTypeFromSearch("empresa")).toBe("empresa");
    expect(accountTypeFromSearch("<script>")).toBeUndefined();
  });

  it("nome da organização: empresa usa o nome informado; autônomo usa o da pessoa", () => {
    expect(
      organizationNameFor({
        type: "empresa",
        companyName: "Integra Automação Ltda",
        currentName: "Workspace de Ana",
      }),
    ).toBe("Integra Automação Ltda");
    expect(
      organizationNameFor({
        type: "autonomo",
        fullName: "Ana Souza",
        currentName: "Workspace de Ana",
      }),
    ).toBe("Ana Souza — Engenharia");
  });

  it("nunca sobrescreve um nome que o usuário já mudou", () => {
    expect(
      organizationNameFor({ type: "empresa", companyName: "X", currentName: "Minha Empresa" }),
    ).toBe("Minha Empresa");
  });

  it("servidor: só o owner altera, RLS silenciosa não vira sucesso, 1º login não sobrescreve", () => {
    const src = readFileSync(resolve(__dirname, "../lib/account-type.functions.ts"), "utf8");
    expect(src).toContain('tenant.role !== "owner"');
    expect(src).toContain("updated.length === 0");
    expect(src).toContain('data.mode === "initial" && current');
    expect(src).toContain("requireSupabaseAuth");
  });

  it("cadastro oferece os dois perfis e exige nome da empresa", () => {
    const signup = readFileSync(resolve(__dirname, "../routes/signup.tsx"), "utf8");
    expect(signup).toContain('data-testid="account-type-choice"');
    expect(signup).toContain("account_type: accountType");
    expect(signup).toContain("CompanyNameSchema.safeParse(companyName)");
  });
});
