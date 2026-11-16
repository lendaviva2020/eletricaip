import { describe, expect, it } from "vitest";
import { getCompactStudioRegistry } from "@/lib/compact-studio/runtime/compact-blocks";
import { blockCategoryLabel, blockDescriptionLabel } from "@/lib/fbd/engine/block-i18n";

describe("Tradução dos blocos FBD", () => {
  const defs = getCompactStudioRegistry().list();

  it("todo bloco do registro tem descrição em inglês (sem português remanescente)", () => {
    const PT = /ção|ões|ã|õ|\b(de|com|para|uma?|do|da)\b/i;
    const missing = defs.filter((d) => PT.test(blockDescriptionLabel(d.type, d.description, "en")));
    expect(missing.map((d) => d.type)).toEqual([]);
  });

  it("toda categoria tem tradução", () => {
    for (const d of defs) {
      expect(blockCategoryLabel(d.category, "en")).not.toMatch(/ção|ó|á|ç/);
    }
  });

  it("pt-BR mantém o texto canônico; conversões traduzidas por regra", () => {
    expect(blockDescriptionLabel("TON", "Temporizador com atraso na ligação", "pt-BR")).toBe(
      "Temporizador com atraso na ligação",
    );
    expect(blockDescriptionLabel("INT_TO_REAL", "Conversão explícita INT → REAL", "en")).toBe(
      "Explicit conversion INT → REAL",
    );
  });
});
