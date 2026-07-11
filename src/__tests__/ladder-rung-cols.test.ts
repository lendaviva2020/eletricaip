// #LAD-05 · colunas configuráveis por rung.
import { describe, expect, it } from "vitest";
import {
  RUNG_COLS,
  RUNG_COLS_MAX,
  RUNG_COLS_MIN,
  newRung,
  resizeRungCols,
  rungCols,
  emptyCell,
} from "@/lib/ladder/types";
import { scanRungs } from "@/lib/ladder/runtime";

describe("#LAD-05 · rung cols", () => {
  it("newRung usa default e persiste em cols", () => {
    const r = newRung(0);
    expect(r.cols).toBe(RUNG_COLS);
    expect(r.cells[0]).toHaveLength(RUNG_COLS);
    expect(rungCols(r)).toBe(RUNG_COLS);
  });

  it("newRung com cols custom clampa nos limites", () => {
    expect(newRung(0, 100).cols).toBe(RUNG_COLS_MAX);
    expect(newRung(0, 1).cols).toBe(RUNG_COLS_MIN);
    const r = newRung(0, 4);
    expect(r.cols).toBe(4);
    expect(r.cells[0]).toHaveLength(4);
  });

  it("resizeRungCols preserva saída na última coluna ao encolher", () => {
    const r = newRung(0, 8);
    r.cells[0][0] = { kind: "XIC", operand: "A" };
    r.cells[0][7] = { kind: "OTE", operand: "Q" };
    const shrunk = resizeRungCols(r, 4);
    expect(shrunk.cols).toBe(4);
    expect(shrunk.cells[0]).toHaveLength(4);
    expect(shrunk.cells[0][0]).toEqual({ kind: "XIC", operand: "A" });
    expect(shrunk.cells[0][3]).toEqual({ kind: "OTE", operand: "Q" });
  });

  it("resizeRungCols pad com EMPTY ao expandir", () => {
    const r = newRung(0, 4);
    r.cells[0][0] = { kind: "XIC", operand: "A" };
    r.cells[0][3] = { kind: "OTE", operand: "Q" };
    const wide = resizeRungCols(r, 8);
    expect(wide.cols).toBe(8);
    expect(wide.cells[0]).toHaveLength(8);
    expect(wide.cells[0][0]).toEqual({ kind: "XIC", operand: "A" });
    expect(wide.cells[0][7]).toEqual({ kind: "OTE", operand: "Q" });
    for (let i = 1; i < 7; i++) expect(wide.cells[0][i]).toEqual(emptyCell());
  });

  it("runtime respeita cols per-rung (energiza saída corretamente)", () => {
    const r = newRung(0, 4);
    r.cells[0][0] = { kind: "XIC", operand: "TRUE" };
    r.cells[0][3] = { kind: "OTE", operand: "Y_LAD05" };
    const results = scanRungs([r]);
    expect(results[0].poweredOut).toBe(true);
  });
});
