// Ladder → IL (Instruction List) textual compiler.
// Each rung becomes:
//   LD  op1
//   AND op2 ... (series within row)
//   OR( LD op3 AND op4 )  (additional rows)
//   ST  outOperand
import type { LadderRung, LadderCell } from "./types";
import { isContactKind, isOutputKind } from "./types";

const cellToTerm = (c: LadderCell): string | null => {
  if (c.kind === "EMPTY") return null;
  if (c.kind === "XIC") return c.operand || "_";
  if (c.kind === "XIO") return `NOT ${c.operand || "_"}`;
  return null;
};

const compileRow = (row: LadderCell[]): string | null => {
  const terms = row.slice(0, row.length - 1).map(cellToTerm).filter(Boolean) as string[];
  if (terms.length === 0) return null;
  return terms.join(" AND ");
};

export interface CompiledRung {
  rungId: string;
  source: string; // pretty IL
  outputCell: LadderCell | null;
}

export const compileRung = (rung: LadderRung): CompiledRung => {
  const rows = rung.cells.map(compileRow).filter(Boolean) as string[];
  const expr = rows.length === 0 ? "FALSE" : rows.length === 1 ? rows[0] : rows.map((r) => `(${r})`).join(" OR ");
  const outRow = rung.cells[0] ?? [];
  const outputCell = outRow[outRow.length - 1] ?? null;
  const outOp = outputCell && isOutputKind(outputCell.kind)
    ? `${outputCell.kind} ${outputCell.operand || "_"}`
    : "(no output)";
  return {
    rungId: rung.id,
    source: `LD ${expr}\nST  ${outOp}`,
    outputCell,
  };
};

export const compileProgram = (rungs: LadderRung[]): string =>
  rungs
    .map((r, i) => `// ${r.label || `Rung ${i + 1}`}\n${compileRung(r).source}`)
    .join("\n\n");

export { isContactKind, isOutputKind };
