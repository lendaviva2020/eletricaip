// Auditoria Fase 0 — F0.8 (CSP com nonce) e F0.9 (contenção do worker SCADA).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildContentSecurityPolicy, generateCspNonce, isValidCspNonce } from "@/lib/security/csp";
import { neutralizeGlobalsOnPrototypeChain } from "@/lib/simulation/worker-guards";
import { renderErrorPage } from "@/lib/error-page";

const SUPABASE = "https://rvaaxvdimggztjxoktvy.supabase.co";

describe("F0.8 — Content-Security-Policy com nonce", () => {
  it("gera nonces válidos e distintos (128 bits)", () => {
    const a = generateCspNonce();
    const b = generateCspNonce();
    expect(isValidCspNonce(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(atob(a)).toHaveLength(16);
  });

  it("script-src usa o nonce e NÃO contém 'unsafe-inline' nem 'unsafe-eval'", () => {
    const nonce = generateCspNonce();
    const csp = buildContentSecurityPolicy(nonce, { supabaseOrigin: SUPABASE });
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain(`connect-src 'self' ${SUPABASE} wss://rvaaxvdimggztjxoktvy.supabase.co`);
  });

  it("rejeita nonce inválido (não permite injeção de diretivas)", () => {
    expect(() =>
      buildContentSecurityPolicy("abc'; script-src *", { supabaseOrigin: SUPABASE }),
    ).toThrow();
    expect(isValidCspNonce("curto")).toBe(false);
    expect(isValidCspNonce(undefined)).toBe(false);
  });

  it("página de erro não usa handlers inline (seriam bloqueados pela CSP)", () => {
    expect(renderErrorPage()).not.toMatch(/\son[a-z]+=/i);
  });

  it("vercel.json não aplica CSP global com 'unsafe-inline' e dá ao worker SCADA connect-src 'none'", () => {
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const csp = (source: string) =>
      vercel.headers
        .find((h) => h.source === source)
        ?.headers.find((h) => h.key === "Content-Security-Policy")?.value;
    expect(csp("/(.*)")).toBeUndefined();
    const assets = csp("/assets/((?!scada-worker-).*)")!;
    expect(assets).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    const worker = csp("/assets/scada-worker-(.*)")!;
    expect(worker).toContain("connect-src 'none'");
    expect(worker).toContain("default-src 'none'");
    // 'unsafe-eval' só no worker SCADA (decisão F0.9), sempre sem rede.
    expect(worker).toContain("'unsafe-eval'");
    expect(assets).not.toContain("'unsafe-eval'");
  });
});

describe("F0.9 — neutralização de globais na cadeia de protótipos do worker", () => {
  function makeWorkerLikeScope() {
    // Simula WorkerGlobalScope: métodos vivem no protótipo, não no objeto.
    class EventTargetLike {
      addEventListener() {
        return "listener";
      }
    }
    class WorkerGlobalScopeLike extends EventTargetLike {
      fetch() {
        return "network";
      }
      postMessage() {
        return "posted";
      }
    }
    return new WorkerGlobalScopeLike() as unknown as Record<string, unknown>;
  }

  it("a técnica antiga (sombrear self.fetch) é contornável pelo protótipo", () => {
    const scope = makeWorkerLikeScope();
    scope.fetch = undefined;
    const inherited = (Object.getPrototypeOf(scope) as Record<string, unknown>).fetch;
    expect(typeof inherited).toBe("function");
  });

  it("neutraliza no host e em todos os protótipos que possuem o nome", () => {
    const scope = makeWorkerLikeScope();
    neutralizeGlobalsOnPrototypeChain(scope, ["fetch", "postMessage", "addEventListener"]);
    let p: object | null = scope;
    while (p && p !== Object.prototype) {
      for (const n of ["fetch", "postMessage", "addEventListener"]) {
        const d = Object.getOwnPropertyDescriptor(p, n);
        if (d) expect(d.value).toBeUndefined();
      }
      p = Object.getPrototypeOf(p);
    }
    expect(scope.fetch).toBeUndefined();
    // Não pode ser restaurado por atribuição
    expect(() => {
      "use strict";
      (scope as Record<string, unknown>).fetch = () => "again";
    }).toThrow();
  });

  it("referência confiável capturada antes continua funcionando", () => {
    const scope = makeWorkerLikeScope();
    const trusted = (scope.postMessage as () => string).bind(scope);
    neutralizeGlobalsOnPrototypeChain(scope, ["postMessage"]);
    expect(trusted()).toBe("posted");
    expect(scope.postMessage).toBeUndefined();
  });
});
