// Ladder rung matrix model — IEC 61131-3 inspired.
// A rung is a grid of cells (rows × cols). Cells in the same ROW are series (AND).
// Multiple ROWS act as parallel branches (OR). The right-most column is reserved
// for the OUTPUT (coil/timer/counter). Empty cells short-circuit (pass-through).

export type LadderCellKind =
  | "EMPTY"
  | "XIC" // contato NA
  | "XIO" // contato NF
  | "OTE" // bobina
  | "OTL" // set
  | "OTU" // reset
  | "TON" // timer on-delay
  | "TOF" // timer off-delay
  | "TP" // timer pulse
  | "CTU"; // counter up

export interface LadderCell {
  kind: LadderCellKind;
  /** Operand tag name, e.g. "%I0.0", "%Q0.1", "K1_CMD". Empty = unbound. */
  operand: string;
  /** Preset for TON (ms) / CTU (count). */
  preset?: number;
  /** Runtime: energized this scan? (purely visual) */
  energized?: boolean;
}

export interface LadderRung {
  id: string;
  label: string;
  /** rows × cols matrix. rows >= 1, cols >= 2 (last col = output). */
  cells: LadderCell[][];
  /** Latest energization of the output cell (visual). */
  poweredOut?: boolean;
}

// #LAD-05 · colunas por-rung. RUNG_COLS mantém o default histórico (6) usado
// pelo importador e por chamadores que ainda não passam cols explícitos.
export const RUNG_COLS = 6; // 5 series cells + 1 output cell (default)
export const RUNG_COLS_MIN = 3; // 2 series + 1 output
export const RUNG_COLS_MAX = 12;
export const RUNG_ROWS_DEFAULT = 1;

/** Colunas efetivas de um rung: prefere `cols`, senão a largura da 1ª linha. */
export const rungCols = (r: Pick<LadderRung, "cols" | "cells">): number =>
  r.cols ?? r.cells[0]?.length ?? RUNG_COLS;

export const emptyCell = (): LadderCell => ({ kind: "EMPTY", operand: "" });

export const newRung = (idx: number, cols: number = RUNG_COLS): LadderRung => {
  const c = Math.min(RUNG_COLS_MAX, Math.max(RUNG_COLS_MIN, cols));
  return {
    id: `rung-${Date.now()}-${idx}`,
    label: `Rung ${idx + 1}`,
    cols: c,
    cells: Array.from({ length: RUNG_ROWS_DEFAULT }, () =>
      Array.from({ length: c }, emptyCell),
    ),
  };
};

/** Reajusta cada linha para `newCols`, preservando a célula de saída no final. */
export const resizeRungCols = (rung: LadderRung, newCols: number): LadderRung => {
  const target = Math.min(RUNG_COLS_MAX, Math.max(RUNG_COLS_MIN, newCols));
  const cells = rung.cells.map((row) => {
    const out = row[row.length - 1] ?? emptyCell();
    const series = row.slice(0, row.length - 1);
    const seriesTarget = target - 1;
    let nextSeries: LadderCell[];
    if (series.length >= seriesTarget) {
      nextSeries = series.slice(0, seriesTarget);
    } else {
      nextSeries = [
        ...series,
        ...Array.from({ length: seriesTarget - series.length }, emptyCell),
      ];
    }
    return [...nextSeries, out];
  });
  return { ...rung, cols: target, cells };
};

export const OUTPUT_KINDS: LadderCellKind[] = ["OTE", "OTL", "OTU", "TON", "TOF", "TP", "CTU"];
export const CONTACT_KINDS: LadderCellKind[] = ["XIC", "XIO"];

export const isOutputKind = (k: LadderCellKind) => OUTPUT_KINDS.includes(k);
export const isContactKind = (k: LadderCellKind) => CONTACT_KINDS.includes(k);
