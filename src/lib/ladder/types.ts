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

export const RUNG_COLS = 6; // 5 series cells + 1 output cell
export const RUNG_ROWS_DEFAULT = 1;

export const emptyCell = (): LadderCell => ({ kind: "EMPTY", operand: "" });

export const newRung = (idx: number): LadderRung => ({
  id: `rung-${Date.now()}-${idx}`,
  label: `Rung ${idx + 1}`,
  cells: Array.from({ length: RUNG_ROWS_DEFAULT }, () =>
    Array.from({ length: RUNG_COLS }, emptyCell),
  ),
});

export const OUTPUT_KINDS: LadderCellKind[] = ["OTE", "OTL", "OTU", "TON", "TOF", "TP", "CTU"];
export const CONTACT_KINDS: LadderCellKind[] = ["XIC", "XIO"];

export const isOutputKind = (k: LadderCellKind) => OUTPUT_KINDS.includes(k);
export const isContactKind = (k: LadderCellKind) => CONTACT_KINDS.includes(k);
