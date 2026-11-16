import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(__dirname, "../../supabase/migrations");
const review = readFileSync(
  resolve(migrations, "20261116130000_normative_knowledge_review.sql"),
  "utf8",
);
const architect = readFileSync(resolve(__dirname, "../lib/ai-architect.functions.ts"), "utf8");

/** Extrai os textos novos (SET chunk_text = $nb$…$nb$). */
const newTexts = [...review.matchAll(/SET chunk_text = \$nb\$([\s\S]*?)\$nb\$/g)].map((m) => m[1]);

describe("revisão da base normativa", () => {
  it("corrige os cinco trechos conferidos", () => {
    expect(newTexts).toHaveLength(5);
  });

  it("κ de pico IEC 60909 parte de 1,02 (não 1,0)", () => {
    const k = newTexts.find((t) => t.startsWith("IEC 60909-0"));
    expect(k).toContain("1,02 + 0,98");
    expect(k).not.toContain("κ entre 1,0 e");
  });

  it("1,25 × In atribuído ao NEC 430.22, não à NBR 5410", () => {
    const m = newTexts.find((t) => t.startsWith("Corrente nominal de motor"));
    expect(m).toContain("NEC 430.22");
  });

  it("nenhum número de tabela não confirmado no trecho do neutro", () => {
    const n = newTexts.find((t) => t.includes("condutor neutro"));
    expect(n).not.toMatch(/Tabela 48/);
  });

  it("DR inclui tomadas internas que alimentam equipamentos externos", () => {
    const dr = newTexts.find((t) => t.includes("DR de alta sensibilidade"));
    expect(dr).toContain("áreas internas que possam alimentar equipamentos na área externa");
  });

  it("todos os resumos recebem aviso de conferência na edição vigente", () => {
    expect(review).toContain("'aviso'");
    expect(review).toContain("edição vigente");
  });

  it("a IA recebe os trechos como resumos indicativos, não texto oficial", () => {
    expect(architect).toContain("resumos técnicos indicativos");
  });
});
