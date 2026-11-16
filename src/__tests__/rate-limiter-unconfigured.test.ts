import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("rate limiter sem Upstash configurado (deploy sem Redis)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  });

  it("IoT: dispositivo é aceito (antes: todo POST recebia 429) e o limite local vale", async () => {
    const { checkRateLimit } = await import("@/lib/security/rate-limiter.server");
    const first = await checkRateLimit("iot", "key:arduino-1");
    expect(first.allowed).toBe(true);
    expect(first.failClosed).toBeFalsy();
    let last = first;
    for (let i = 0; i < 130; i++) last = await checkRateLimit("iot", "key:arduino-1");
    expect(last.allowed).toBe(false); // 120 por minuto por chave
    expect(last.failClosed).toBeFalsy();
    // outra chave tem a própria cota
    expect((await checkRateLimit("iot", "key:arduino-2")).allowed).toBe(true);
  });

  it("IA: liberada com limite local (antes: 503 em toda chamada → 'IA indisponível')", async () => {
    const { checkRateLimit } = await import("@/lib/security/rate-limiter.server");
    const r = await checkRateLimit("ai", "user-1");
    expect(r.allowed).toBe(true);
    expect(r.failClosed).toBeFalsy();
    let last = r;
    for (let i = 0; i < 12; i++) last = await checkRateLimit("ai", "user-1");
    expect(last.allowed).toBe(false); // 10 em 10 s
  });

  it("Upstash CONFIGURADO com falha continua fail-closed para IA/IoT (RISK-007)", () => {
    const src = readFileSync(resolve(__dirname, "../lib/security/rate-limiter.server.ts"), "utf8");
    const breaker = src.slice(src.indexOf("// Circuit breaker aberto"));
    expect(breaker).toMatch(/if \(cfg\.critical\)[\s\S]*failClosed: true/);
  });

  it("middleware da IA: opt-in de fallback local é avaliado (antes era inalcançável)", () => {
    const mw = readFileSync(
      resolve(__dirname, "../integrations/supabase/ai-rate-limit-middleware.ts"),
      "utf8",
    );
    const block = mw.slice(mw.indexOf("if (rl.failClosed) {"));
    expect(block.indexOf("LOCAL_FALLBACK_ENABLED")).toBeGreaterThan(0);
    expect(block.indexOf("LOCAL_FALLBACK_ENABLED")).toBeLessThan(block.indexOf("localBurstAllow"));
  });
});
