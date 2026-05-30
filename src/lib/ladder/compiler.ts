import type { LadderRung, LadderCell } from "./types";
import { isContactKind, isOutputKind } from "./types";

const cellToTerm = (c: LadderCell): string | null => {
  if (c.kind === "EMPTY") return null;
  if (c.kind === "XIC") return c.operand || "_";
  if (c.kind === "XIO") return `NOT ${c.operand || "_"}`;
  return null;
};

const compileRow = (row: LadderCell[]): string | null => {
  const terms = row
    .slice(0, row.length - 1)
    .map(cellToTerm)
    .filter(Boolean) as string[];
  if (terms.length === 0) return null;
  return terms.join(" AND ");
};

export const compileRungToIL = (rung: LadderRung): string => {
  const rows = rung.cells.map(compileRow).filter(Boolean) as string[];
  const expr =
    rows.length === 0
      ? "FALSE"
      : rows.length === 1
        ? rows[0]
        : rows.map((r) => `(${r})`).join(" OR ");

  const outRow = rung.cells[0] ?? [];
  const outputCell = outRow[outRow.length - 1] ?? null;

  if (!outputCell || outputCell.kind === "EMPTY") {
    return "LD  FALSE\nST  _";
  }

  const op = outputCell.operand || "_";
  const preset = outputCell.preset ?? 0;

  switch (outputCell.kind) {
    case "OTE":
      return `LD  ${expr}\nST  ${op}`;
    case "OTL":
      return `LD  ${expr}\nS   ${op}`;
    case "OTU":
      return `LD  ${expr}\nR   ${op}`;
    case "TON":
      return `LD  ${expr}\nCAL ${op}(IN := %MX, PT := T#${preset}ms)`;
    case "TOF":
      return `LD  ${expr}\nCAL ${op}(IN := %MX, PT := T#${preset}ms) (* TOF *)`;
    case "TP":
      return `LD  ${expr}\nCAL ${op}(IN := %MX, PT := T#${preset}ms) (* TP *)`;
    case "CTU":
      return `LD  ${expr}\nCAL ${op}(CU := %MX, PV := ${preset})`;
    default:
      return `LD  ${expr}\nST  ${op}`;
  }
};

export const compileRungToST = (rung: LadderRung): string => {
  const rows = rung.cells.map(compileRow).filter(Boolean) as string[];
  const expr =
    rows.length === 0
      ? "FALSE"
      : rows.length === 1
        ? rows[0]
        : rows.map((r) => `(${r})`).join(" OR ");

  const outRow = rung.cells[0] ?? [];
  const outputCell = outRow[outRow.length - 1] ?? null;

  if (!outputCell || outputCell.kind === "EMPTY") {
    return "// Sem bobina de saída";
  }

  const op = outputCell.operand || "_";
  const preset = outputCell.preset ?? 0;

  switch (outputCell.kind) {
    case "OTE":
      return `${op} := ${expr};`;
    case "OTL":
      return `IF ${expr} THEN\n  ${op} := TRUE;\nEND_IF;`;
    case "OTU":
      return `IF ${expr} THEN\n  ${op} := FALSE;\nEND_IF;`;
    case "TON":
      return `${op}(IN := ${expr}, PT := T#${preset}ms);`;
    case "TOF":
      return `${op}_TOF(IN := ${expr}, PT := T#${preset}ms); ${op} := ${op}_TOF.Q;`;
    case "TP":
      return `${op}_TP(IN := ${expr}, PT := T#${preset}ms); ${op} := ${op}_TP.Q;`;
    case "CTU":
      return `${op}(CU := ${expr}, PV := ${preset});`;
    default:
      return `${op} := ${expr};`;
  }
};

export const compileProgram = (rungs: LadderRung[], format: "IL" | "ST" = "IL"): string => {
  if (format === "ST") {
    return rungs
      .map((r, i) => `// ${r.label || `Rung ${i + 1}`}\n${compileRungToST(r)}`)
      .join("\n\n");
  }
  return rungs
    .map((r, i) => `// ${r.label || `Rung ${i + 1}`}\n${compileRungToIL(r)}`)
    .join("\n\n");
};

export { isContactKind, isOutputKind };
