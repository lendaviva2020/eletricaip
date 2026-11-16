import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isSafeOAuthRedirect, toSafeExternalHref } from "@/lib/security/url-safety";
import {
  PASSWORD_MIN_LENGTH,
  passwordPolicyError,
  validatePassword,
} from "@/lib/security/password-policy";
import { sanitizeSpreadsheetRecord } from "@/lib/security/safe-xlsx";

describe("RISK-012 — links externos (datasheet do catálogo)", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "https://user:senha@evil.example/x.pdf",
    "//evil.example/x.pdf",
    "/relativo.pdf",
    "",
    null,
    42,
  ])("rejeita %s", (raw) => {
    expect(toSafeExternalHref(raw)).toBeNull();
  });

  it("aceita http(s) e normaliza", () => {
    expect(toSafeExternalHref("https://weg.net/datasheet.pdf")).toBe(
      "https://weg.net/datasheet.pdf",
    );
    expect(toSafeExternalHref("  http://fabricante.com.br/a b.pdf ")).toBe(
      "http://fabricante.com.br/a%20b.pdf",
    );
  });

  it("rejeita URL acima de 2048 caracteres", () => {
    expect(toSafeExternalHref(`https://a.com/${"x".repeat(2100)}`)).toBeNull();
  });

  it("catálogo valida na importação e na exibição", () => {
    const imp = readFileSync(resolve(__dirname, "../lib/catalog-import.functions.ts"), "utf8");
    expect(imp).toContain("datasheet_url: toSafeExternalHref(row.datasheetUrl)");
    const page = readFileSync(resolve(__dirname, "../routes/catalog.tsx"), "utf8");
    expect(page).not.toMatch(/href=\{c\.datasheet_url\}/);
    expect(page).toContain("toSafeExternalHref(c.datasheet_url)");
  });
});

describe("RISK-023 — redirect do consentimento OAuth", () => {
  it("aceita callback https e http apenas em loopback", () => {
    expect(isSafeOAuthRedirect("https://cliente.example/callback?code=abc")).toBe(true);
    expect(isSafeOAuthRedirect("http://127.0.0.1:8976/callback")).toBe(true);
    expect(isSafeOAuthRedirect("http://localhost:3000/cb")).toBe(true);
  });

  it.each([
    "javascript:alert(document.cookie)",
    "data:text/html,x",
    "http://evil.example/cb",
    "https://u:p@evil.example/cb",
    "ftp://x.example/cb",
    "not a url",
  ])("bloqueia %s", (raw) => {
    expect(isSafeOAuthRedirect(raw)).toBe(false);
  });

  it("rota de consentimento valida antes de redirecionar (loader e decisão)", () => {
    const src = readFileSync(resolve(__dirname, "../routes/[.]lovable.oauth.consent.tsx"), "utf8");
    expect(src.match(/isSafeOAuthRedirect\(/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("RISK-024 — política única de senha", () => {
  it("rejeita senhas fracas", () => {
    expect(validatePassword("abc123")).toContain("too_short");
    expect(validatePassword("abcdefgh")).toContain("needs_digit");
    expect(validatePassword("12345678")).toContain("needs_letter");
    expect(validatePassword("aaaaaaaa")).toContain("repeated");
    expect(validatePassword("ç".repeat(37) + "1")).toContain("too_long"); // 76 bytes UTF-8
  });

  it("aceita senha que atende à política (inclui letras acentuadas)", () => {
    expect(passwordPolicyError("Motor7500W")).toBeNull();
    expect(passwordPolicyError("tensão380v")).toBeNull();
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it.each(["signup.tsx", "reset-password.tsx", "settings.security.tsx"])(
    "%s usa a política compartilhada",
    (file) => {
      const src = readFileSync(resolve(__dirname, `../routes/${file}`), "utf8");
      expect(src).toContain("passwordPolicyError(");
      expect(src).not.toMatch(/\.length < (6|8)\)/);
    },
  );
});

describe("RISK-021 — importação CSV com as defesas do XLSX", () => {
  it("neutraliza fórmula (=HYPERLINK) com apóstrofo", () => {
    const clean = sanitizeSpreadsheetRecord({
      part_number: '=HYPERLINK("http://evil")',
      n: "-12.5",
    });
    expect(String(clean.part_number).startsWith("'")).toBe(true);
    expect(clean.n).toBe("-12.5");
  });

  it("rejeita o arquivo inteiro com chave de protótipo (fail-closed)", () => {
    const row = JSON.parse('{"__proto__":{"admin":true},"desc":"ok"}') as Record<string, unknown>;
    expect(() => sanitizeSpreadsheetRecord(row)).toThrow(/XLSX_SECURITY_VIOLATION/);
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it("tela de importação limita tamanho antes de ler e saneia o CSV", () => {
    const src = readFileSync(resolve(__dirname, "../routes/settings.catalog-import.tsx"), "utf8");
    const sizeCheck = src.indexOf("file.size > DEFAULT_SAFE_XLSX_LIMITS.maxBytes");
    const firstRead = src.indexOf("await file.text()");
    expect(sizeCheck).toBeGreaterThan(-1);
    expect(sizeCheck).toBeLessThan(firstRead);
    expect(src).toContain("sanitizeSpreadsheetRecord(");
    expect(src).toContain('k.trim() !== ""');
  });
});
