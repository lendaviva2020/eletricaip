import { describe, expect, it } from "vitest";
import {
  LADDER_ELEMENTS,
  LADDER_ELEMENTS_BY_ID,
  SUPPORTED_LADDER_ELEMENTS,
} from "@/lib/ladder/definitions";
import { isOutputKind, type LadderCellKind } from "@/lib/ladder/types";

const ACTIVE_KIND_MAP: Record<string, LadderCellKind> = {
  XIC: "XIC",
  XIO: "XIO",
  OTE: "OTE",
  OTL: "OTL",
  OTU: "OTU",
  TON: "TON",
  TOF: "TOF",
  TP: "TP",
  CTU: "CTU",
};

describe("Fase 4.1: Alinhamento da Paleta Ladder (IEC 61131-3)", () => {
  it("contém exatamente 9 elementos ativos suportados pelo scan-core", () => {
    const activeIds = SUPPORTED_LADDER_ELEMENTS.map((e) => e.id).sort();
    expect(activeIds).toEqual([
      "CTU",
      "OTE",
      "OTL",
      "OTU",
      "TOF",
      "TON",
      "TP",
      "XIC",
      "XIO",
    ]);
  });

  it("garante que todo elemento suportado mapeia para um LadderCellKind válido e executável", () => {
    for (const el of SUPPORTED_LADDER_ELEMENTS) {
      expect(el.supported).toBe(true);
      expect(ACTIVE_KIND_MAP[el.id]).toBeDefined();
      expect(el.statusNote).toBeUndefined();
    }
  });

  it("garante que elementos não suportados estão marcados explicitamente com status de roadmap", () => {
    const unsupported = LADDER_ELEMENTS.filter((e) => e.supported !== true);
    expect(unsupported.length).toBeGreaterThan(20);

    for (const el of unsupported) {
      expect(el.supported).toBe(false);
      expect(el.statusNote).toMatch(/Q1/);
    }
  });

  it("classifica corretamente contatos (entradas) vs bobinas/timers/counters (saídas)", () => {
    // Contatos (colunas de entrada 0 .. N-2)
    expect(isOutputKind(ACTIVE_KIND_MAP.XIC)).toBe(false);
    expect(isOutputKind(ACTIVE_KIND_MAP.XIO)).toBe(false);

    // Saídas (coluna final N-1)
    expect(isOutputKind(ACTIVE_KIND_MAP.OTE)).toBe(true);
    expect(isOutputKind(ACTIVE_KIND_MAP.OTL)).toBe(true);
    expect(isOutputKind(ACTIVE_KIND_MAP.OTU)).toBe(true);
    expect(isOutputKind(ACTIVE_KIND_MAP.TON)).toBe(true);
    expect(isOutputKind(ACTIVE_KIND_MAP.TOF)).toBe(true);
    expect(isOutputKind(ACTIVE_KIND_MAP.TP)).toBe(true);
    expect(isOutputKind(ACTIVE_KIND_MAP.CTU)).toBe(true);
  });

  it("garante índice íntegro em LADDER_ELEMENTS_BY_ID", () => {
    expect(Object.keys(LADDER_ELEMENTS_BY_ID).length).toBe(LADDER_ELEMENTS.length);
    for (const el of LADDER_ELEMENTS) {
      expect(LADDER_ELEMENTS_BY_ID[el.id]).toBe(el);
    }
  });
});
