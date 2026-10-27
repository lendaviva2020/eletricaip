import { describe, expect, it } from "vitest";
import { isSafeRedirect, getSafeRedirect, DEFAULT_POST_LOGIN_REDIRECT } from "@/lib/safe-redirect";

describe("isSafeRedirect", () => {
  it("aceita caminhos relativos comuns", () => {
    expect(isSafeRedirect("/dashboard")).toBe(true);
    expect(isSafeRedirect("/invite/abc?x=1")).toBe(true);
    expect(isSafeRedirect("/workspace/projeto-123")).toBe(true);
    expect(isSafeRedirect("/settings")).toBe(true);
    expect(isSafeRedirect("/settings/security")).toBe(true);
    expect(isSafeRedirect("/")).toBe(true);
  });

  it("rejeita caminhos de autenticação que causariam loops", () => {
    expect(isSafeRedirect("/login")).toBe(false);
    expect(isSafeRedirect("/login?redirect=%2Fsettings")).toBe(false);
    expect(isSafeRedirect("/signup")).toBe(false);
    expect(isSafeRedirect("/signup?plan=pro")).toBe(false);
    expect(isSafeRedirect("/forgot-password")).toBe(false);
    expect(isSafeRedirect("/reset-password")).toBe(false);
  });

  it("rejeita URLs protocol-relative", () => {
    expect(isSafeRedirect("//evil.com")).toBe(false);
    expect(isSafeRedirect("//evil.com/dashboard")).toBe(false);
  });

  it("rejeita barras invertidas protocol-relative", () => {
    expect(isSafeRedirect("/\\evil.com")).toBe(false);
    expect(isSafeRedirect("/\\evil.com/dashboard")).toBe(false);
  });

  it("rejeita URLs absolutas e esquemas arbitrários", () => {
    expect(isSafeRedirect("https://evil.com")).toBe(false);
    expect(isSafeRedirect("http://localhost/dashboard")).toBe(false);
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirect("mailto:test@example.com")).toBe(false);
  });

  it("rejeita string vazia e valores não-string", () => {
    expect(isSafeRedirect("")).toBe(false);
    expect(isSafeRedirect(undefined)).toBe(false);
    expect(isSafeRedirect(null)).toBe(false);
    expect(isSafeRedirect(123)).toBe(false);
    expect(isSafeRedirect({})).toBe(false);
    expect(isSafeRedirect(["/dashboard"])).toBe(false);
  });

  it("getSafeRedirect retorna fallback para rotas inseguras e caminho original para rotas válidas", () => {
    expect(getSafeRedirect("/login")).toBe(DEFAULT_POST_LOGIN_REDIRECT);
    expect(getSafeRedirect("//malicious.com")).toBe("/dashboard");
    expect(getSafeRedirect(null, "/settings")).toBe("/settings");
    expect(getSafeRedirect("/workspace")).toBe("/workspace");
  });
});
