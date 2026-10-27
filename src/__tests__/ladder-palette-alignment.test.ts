import { describe, expect, it } from "vitest";
import {
  LADDER_ELEMENTS,
  LADDER_ELEMENTS_BY_ID,
  SUPPORTED_LADDER_ELEMENTS,
} from "@/lib/ladder/definitions";
import { isOutputKind, type LadderCellKind } from "@/lib/ladder/types";

describe("Alinhamento da Biblioteca Ladder Profissional (IEC 61131-3 e Industrial)", () => {
  it("contém conjunto completo de elementos industriais suportados pelo scan-core", () => {
    const activeIds = SUPPORTED_LADDER_ELEMENTS.map((e) => e.id);
    expect(activeIds.length).toBeGreaterThanOrEqual(30);
    // Elements from all categories must be present
    expect(activeIds).toContain("XIC");
    expect(activeIds).toContain("XIO");
    expect(activeIds).toContain("R_TRIG");
    expect(activeIds).toContain("F_TRIG");
    expect(activeIds).toContain("OTE");
    expect(activeIds).toContain("OTL");
    expect(activeIds).toContain("OTU");
    expect(activeIds).toContain("TON");
    expect(activeIds).toContain("TOF");
    expect(activeIds).toContain("TP");
    expect(activeIds).toContain("TONR");
    expect(activeIds).toContain("CTU");
    expect(activeIds).toContain("CTD");
    expect(activeIds).toContain("CMP_GE");
    expect(activeIds).toContain("ADD");
    expect(activeIds).toContain("MOVE");
  });

  it("garante que todo elemento suportado possui metadados válidos e executáveis", () => {
    for (const el of SUPPORTED_LADDER_ELEMENTS) {
      expect(el.supported).toBe(true);
      expect(el.id).toBeTruthy();
      expect(el.label).toBeTruthy();
      expect(el.category).toBeTruthy();
    }
  });

  it("classifica corretamente contatos (entradas) vs bobinas/timers/counters (saídas)", () => {
    // Contatos (colunas de entrada 0 .. N-2)
    expect(isOutputKind("XIC" as LadderCellKind)).toBe(false);
    expect(isOutputKind("XIO" as LadderCellKind)).toBe(false);
    expect(isOutputKind("R_TRIG" as LadderCellKind)).toBe(false);
    expect(isOutputKind("CMP_GE" as LadderCellKind)).toBe(false);

    // Saídas (coluna final N-1)
    expect(isOutputKind("OTE" as LadderCellKind)).toBe(true);
    expect(isOutputKind("OTL" as LadderCellKind)).toBe(true);
    expect(isOutputKind("OTU" as LadderCellKind)).toBe(true);
    expect(isOutputKind("TON" as LadderCellKind)).toBe(true);
    expect(isOutputKind("TOF" as LadderCellKind)).toBe(true);
    expect(isOutputKind("TP" as LadderCellKind)).toBe(true);
    expect(isOutputKind("TONR" as LadderCellKind)).toBe(true);
    expect(isOutputKind("CTU" as LadderCellKind)).toBe(true);
    expect(isOutputKind("CTD" as LadderCellKind)).toBe(true);
  });

  it("garante índice íntegro em LADDER_ELEMENTS_BY_ID", () => {
    expect(Object.keys(LADDER_ELEMENTS_BY_ID).length).toBe(LADDER_ELEMENTS.length);
    for (const el of LADDER_ELEMENTS) {
      expect(LADDER_ELEMENTS_BY_ID[el.id]).toBe(el);
    }
  });
});
