// Dados exibidos como reais não podem ser inventados (plano 2026-11-16).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDailyUsage } from "@/lib/ai-usage.functions";

const src = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("consumo diário de IA (faturamento)", () => {
  it("agrega chamadas e créditos por dia UTC, com 7 dias e zeros reais", () => {
    const now = new Date("2026-11-16T15:00:00Z");
    const d = buildDailyUsage(
      [
        { created_at: "2026-11-16T01:00:00Z", credits: 5 },
        { created_at: "2026-11-16T23:59:00Z", credits: 2 },
        { created_at: "2026-11-14T10:00:00Z", credits: 1 },
        { created_at: "2026-11-01T10:00:00Z", credits: 99 }, // fora da janela
        { created_at: "2026-11-15T10:00:00Z", credits: null },
      ],
      now,
    );
    expect(d.map((x) => x.day)).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
    ]);
    expect(d[6]).toEqual({ day: "2026-11-16", calls: 2, credits: 7 });
    expect(d[5]).toEqual({ day: "2026-11-15", calls: 1, credits: 0 });
    expect(d[4].calls).toBe(1);
    expect(d.slice(0, 4).every((x) => x.calls === 0 && x.credits === 0)).toBe(true);
  });

  it("a tela de faturamento usa o dado do servidor, não um vetor fixo", () => {
    const page = src("routes/settings.billing.tsx");
    expect(page).toContain("usageSummary?.daily");
    expect(page).not.toMatch(/calls:\s*0,\s*\n\s*tokens:\s*0/);
  });
});

describe("simulação e runtime não inventam leituras", () => {
  it("sim-canvas: sem senoides de preenchimento, sem 1750 rpm/11,6 A presumidos, temperatura não vira corrente", () => {
    const s = src("components/canvases/sim-canvas.tsx");
    expect(s).not.toMatch(/Math\.sin/);
    expect(s).not.toMatch(/speed = 1750/);
    expect(s).not.toMatch(/\?\? 11\.6/);
    expect(s).not.toMatch(/TEMP_M01"\)\s*\n?\s*current =/);
    expect(s).toMatch(/let level = 0;/);
  });

  it("simulador local: ciclo medido e sem alarme fixo de motor inexistente", () => {
    const s = src("lib/runtime-client.ts");
    expect(s).not.toMatch(/Math\.random/);
    expect(s).not.toMatch(/M-02/);
    expect(s).toContain("performance.now()");
  });
});

describe("base normativa da IA", () => {
  it("busca usa a coluna sem acento e a migration traz conteúdo próprio idempotente", () => {
    const code = src("lib/ai-architect.functions.ts");
    expect(code).toContain("search_text.ilike.%");
    expect(code).not.toContain("chunk_text.ilike");
    const sql = readFileSync(
      resolve(__dirname, "../../supabase/migrations/20261116120000_normative_knowledge_base.sql"),
      "utf8",
    );
    expect(sql).toContain("GENERATED ALWAYS AS");
    const [from, to] = [...sql.matchAll(/'([^']+)'/g)].slice(0, 2).map((m) => m[1]);
    expect([...from].length).toBe([...to].length); // translate() coerente
    expect(sql).toMatch(/WHERE NOT EXISTS/g);
    expect(
      (sql.match(/ELETRICAI-[A-Z0-9]+\$nb\$, \$nb\$[a-z_]+\$nb\$, \$nb\$/g) ?? []).length,
    ).toBe(28);
  });
});
