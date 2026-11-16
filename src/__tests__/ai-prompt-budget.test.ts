import { describe, expect, it } from "vitest";
import { buildBoundedPrompt, MAX_AI_PROMPT_CHARS } from "@/lib/ai/prompt-budget";

const wrap = (v: string, r: string) => `[CTX]\n${v}\n\n[REQ]\n${r}`;

describe("buildBoundedPrompt", () => {
  it("nunca excede o limite do servidor com muitas violações", () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `- violação ${i} ${"x".repeat(80)}`);
    const out = buildBoundedPrompt("corrija o diagrama", lines, wrap);
    expect(out.length).toBeLessThanOrEqual(MAX_AI_PROMPT_CHARS);
    expect(out).toContain("corrija o diagrama");
    expect(out).toMatch(/violações adicionais omitidas/);
  });

  it("trunca pedido gigante (lote de reparo) e preserva o limite", () => {
    const out = buildBoundedPrompt("y".repeat(100_000), ["- v1"], wrap);
    expect(out.length).toBeLessThanOrEqual(MAX_AI_PROMPT_CHARS);
    expect(out).toContain("- v1");
  });

  it("sem violações devolve o pedido intacto e deduplica linhas repetidas", () => {
    expect(buildBoundedPrompt("oi", [], wrap)).toBe("oi");
    const out = buildBoundedPrompt("oi", ["- a", "- a", "- b"], wrap);
    expect(out.match(/- a/g)).toHaveLength(1);
  });
});
