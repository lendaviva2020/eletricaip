// #LAD-04 · round-trip do importador ST/IL contra o compilador existente.
import { describe, expect, it } from "vitest";
import { compileProgram } from "@/lib/ladder/compiler";
import { importLadderProgram, parseStProgram, parseIlProgram, detectFormat } from "@/lib/ladder/importer";
import { RUNG_COLS, emptyCell } from "@/lib/ladder/types";
import type { LadderRung, LadderCell } from "@/lib/ladder/types";

function row(cells: LadderCell[]): LadderCell[] {
  const r = Array.from({ length: RUNG_COLS }, emptyCell);
  cells.forEach((c, i) => (r[i] = c));
  return r;
}

const rungs: LadderRung[] = [
  {
    id: "r1",
    label: "AND simples",
    cells: [
      row([
        { kind: "XIC", operand: "I0" },
        { kind: "XIC", operand: "I1" },
        emptyCell(),
        emptyCell(),
        emptyCell(),
        { kind: "OTE", operand: "Q0" },
      ]),
    ],
  },
  {
    id: "r2",
    label: "OR em duas branches",
    cells: [
      row([
        { kind: "XIC", operand: "A" },
        emptyCell(),
        emptyCell(),
        emptyCell(),
        emptyCell(),
        { kind: "OTE", operand: "Y" },
      ]),
      row([
        { kind: "XIO", operand: "B" },
        emptyCell(),
        emptyCell(),
        emptyCell(),
        emptyCell(),
        emptyCell(),
      ]),
    ],
  },
  {
    id: "r3",
    label: "TON",
    cells: [
      row([
        { kind: "XIC", operand: "Start" },
        emptyCell(),
        emptyCell(),
        emptyCell(),
        emptyCell(),
        { kind: "TON", operand: "T1", preset: 500 },
      ]),
    ],
  },
  {
    id: "r4",
    label: "Latch",
    cells: [
      row([
        { kind: "XIC", operand: "Btn" },
        emptyCell(),
        emptyCell(),
        emptyCell(),
        emptyCell(),
        { kind: "OTL", operand: "Lock" },
      ]),
    ],
  },
];

describe("#LAD-04 · importador Ladder", () => {
  it("detecta dialeto ST vs IL", () => {
    expect(detectFormat("Q := A AND B;")).toBe("ST");
    expect(detectFormat("LD A\nST Q")).toBe("IL");
  });

  it("round-trip ST: compile → import produz mesmas cells lógicas", () => {
    const st = compileProgram(rungs, "ST");
    const { rungs: parsed, warnings } = parseStProgram(st);
    expect(warnings).toEqual([]);
    expect(parsed).toHaveLength(rungs.length);
    parsed.forEach((r, i) => {
      const orig = rungs[i];
      // Compara a saída (última coluna da primeira row)
      const outParsed = r.cells[0][RUNG_COLS - 1];
      const outOrig = orig.cells[0][RUNG_COLS - 1];
      expect(outParsed.kind).toBe(outOrig.kind);
      expect(outParsed.operand).toBe(outOrig.operand);
      if (outOrig.preset != null) expect(outParsed.preset).toBe(outOrig.preset);
      // Mesma quantidade de branches
      expect(r.cells).toHaveLength(orig.cells.length);
    });
  });

  it("round-trip IL: compile → import preserva outputs", () => {
    const il = compileProgram(rungs, "IL");
    const { rungs: parsed, warnings } = parseIlProgram(il);
    expect(warnings).toEqual([]);
    expect(parsed).toHaveLength(rungs.length);
    parsed.forEach((r, i) => {
      const outParsed = r.cells[0][RUNG_COLS - 1];
      const outOrig = rungs[i].cells[0][RUNG_COLS - 1];
      expect(outParsed.kind).toBe(outOrig.kind);
      expect(outParsed.operand).toBe(outOrig.operand);
    });
  });

  it("importa AND/OR/NOT com parênteses", () => {
    const src = `// Complexa\nQ := (A AND NOT B) OR (C AND D);`;
    const { rungs: parsed, warnings } = importLadderProgram(src);
    expect(warnings).toEqual([]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].label).toBe("Complexa");
    expect(parsed[0].cells).toHaveLength(2);
    expect(parsed[0].cells[0][0]).toEqual({ kind: "XIC", operand: "A" });
    expect(parsed[0].cells[0][1]).toEqual({ kind: "XIO", operand: "B" });
    expect(parsed[0].cells[1][0]).toEqual({ kind: "XIC", operand: "C" });
    expect(parsed[0].cells[1][1]).toEqual({ kind: "XIC", operand: "D" });
    expect(parsed[0].cells[0][RUNG_COLS - 1]).toEqual({ kind: "OTE", operand: "Q" });
  });

  it("registra warning em statement não reconhecido mas mantém rung vazio", () => {
    const { rungs: parsed, warnings } = parseStProgram("FOO_BAR_ZZ();");
    expect(parsed).toHaveLength(1);
    expect(warnings.length).toBe(1);
  });
});
