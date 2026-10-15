import { describe, expect, it } from "vitest";
import {
  EXPECTED_SUPABASE_PROJECT_REF,
  SupabaseConfigError,
  assertSupabaseProject,
  projectRefFromKey,
  projectRefFromUrl,
  resolveSupabasePublicEnv,
} from "@/integrations/supabase/env";

function fakeJwt(ref: string): string {
  const enc = (o: object) =>
    Buffer.from(JSON.stringify(o))
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ iss: "supabase", ref, role: "anon" })}.sig`;
}

const OLD_REF = "hcjkwqyxqxnbqikwltvc";
const GOOD_URL = `https://${EXPECTED_SUPABASE_PROJECT_REF}.supabase.co`;
const OLD_URL = `https://${OLD_REF}.supabase.co`;

describe("Supabase env — validação do projeto ativo", () => {
  it("extrai ref da URL e da chave JWT", () => {
    expect(projectRefFromUrl(GOOD_URL)).toBe(EXPECTED_SUPABASE_PROJECT_REF);
    expect(projectRefFromUrl("https://example.com")).toBeNull();
    expect(projectRefFromKey(fakeJwt(OLD_REF))).toBe(OLD_REF);
    expect(projectRefFromKey("sb_publishable_abc")).toBeNull();
  });

  it("sem env usa o par de fallback do projeto esperado", () => {
    const env = resolveSupabasePublicEnv({ url: "", anonKey: "" });
    expect(projectRefFromUrl(env.url)).toBe(EXPECTED_SUPABASE_PROJECT_REF);
    expect(projectRefFromKey(env.anonKey)).toBe(EXPECTED_SUPABASE_PROJECT_REF);
  });

  it("rejeita URL de outro projeto (ex.: variável antiga na Vercel)", () => {
    expect(() => resolveSupabasePublicEnv({ url: OLD_URL, anonKey: "sb_publishable_x" })).toThrow(
      SupabaseConfigError,
    );
  });

  it("nunca combina URL do ambiente com a chave de fallback de outro projeto", () => {
    // URL antiga sem chave: não pode receber a chave de fallback silenciosamente.
    const env = resolveSupabasePublicEnv({ url: OLD_URL, anonKey: "" });
    expect(env.anonKey).toBe("");
  });

  it("rejeita chave JWT de outro projeto mesmo com URL correta", () => {
    expect(() => assertSupabaseProject({ url: GOOD_URL, anonKey: fakeJwt(OLD_REF) })).toThrow(
      /chave pública pertence ao projeto/,
    );
  });

  it("aceita URL correta com chave publishable ou JWT do mesmo projeto", () => {
    expect(() =>
      assertSupabaseProject({ url: GOOD_URL, anonKey: "sb_publishable_x" }),
    ).not.toThrow();
    expect(() =>
      assertSupabaseProject({ url: GOOD_URL, anonKey: fakeJwt(EXPECTED_SUPABASE_PROJECT_REF) }),
    ).not.toThrow();
  });

  it("diagnóstico não expõe a chave", () => {
    const key = fakeJwt(OLD_REF);
    try {
      assertSupabaseProject({ url: GOOD_URL, anonKey: key });
    } catch (e) {
      expect((e as Error).message).not.toContain(key);
    }
  });
});
