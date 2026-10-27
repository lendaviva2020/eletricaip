import type {
  LadderRung,
  LadderCell,
  LadderBranch,
  LadderBranchItem,
  LadderInstruction,
} from "./types";
import { isContactKind, isOutputKind, ensureRungTopology } from "./types";

const cellToTerm = (c: LadderCell): string | null => {
  if (c.kind === "EMPTY") return null;
  if (c.kind === "XIC") return c.operand || "_";
  if (c.kind === "XIO") return `NOT ${c.operand || "_"}`;
  if (c.kind === "R_TRIG") return `R_TRIG(${c.operand || "_"})`;
  if (c.kind === "F_TRIG") return `F_TRIG(${c.operand || "_"})`;
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

function instructionToStTerm(inst: LadderInstruction): string {
  const op = inst.operand || "_";
  const params = inst.params ?? {};
  if (inst.kind === "XIC") return op;
  if (inst.kind === "XIO") return `NOT ${op}`;
  if (inst.kind === "R_TRIG") return `R_TRIG(${op})`;
  if (inst.kind === "F_TRIG") return `F_TRIG(${op})`;
  if (inst.kind.startsWith("CMP_")) {
    const in1 = String(params.IN1 ?? params.A ?? op);
    const in2 = String(params.IN2 ?? params.B ?? "0");
    const opSym =
      inst.kind === "CMP_EQ"
        ? "="
        : inst.kind === "CMP_NE"
          ? "<>"
          : inst.kind === "CMP_GT"
            ? ">"
            : inst.kind === "CMP_LT"
              ? "<"
              : inst.kind === "CMP_GE"
                ? ">="
                : "<=";
    return `(${in1} ${opSym} ${in2})`;
  }
  return op;
}

function branchToStExpression(branch: LadderBranch): string {
  const terms: string[] = [];
  const isParallel = (branch as any).type === "PARALLEL";

  for (const item of branch.items ?? []) {
    const anyItem = item as any;
    if (anyItem.instruction) {
      terms.push(instructionToStTerm(anyItem.instruction));
    } else if (anyItem.kind) {
      terms.push(instructionToStTerm(anyItem));
    } else if (anyItem.branches && anyItem.branches.length > 0) {
      const subExprs = anyItem.branches.map(branchToStExpression).filter(Boolean);
      if (subExprs.length === 1) terms.push(subExprs[0]);
      else if (subExprs.length > 1) terms.push(`(${subExprs.join(" OR ")})`);
    } else if (anyItem.type === "PARALLEL" || (anyItem.items && anyItem.type === "PARALLEL")) {
      const sub = branchToStExpression(anyItem);
      if (sub) terms.push(`(${sub})`);
    }
  }

  const joiner = isParallel ? " OR " : " AND ";
  return terms.length === 0 ? "TRUE" : terms.join(joiner);
}

export const compileRungToIL = (rung: LadderRung): string => {
  const topology = ensureRungTopology(rung);
  const expr = branchToStExpression(topology.rootBranch);

  if (topology.outputs.length === 0 || !topology.outputs[0]?.operand) {
    return "LD  FALSE\nST  _";
  }

  return topology.outputs
    .map((out) => {
      const op = out.operand || "_";
      const preset = out.preset ?? 0;
      switch (out.kind) {
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
    })
    .join("\n\n");
};

export const compileRungToST = (rung: LadderRung): string => {
  const topology = ensureRungTopology(rung);
  const expr = branchToStExpression(topology.rootBranch);

  if (topology.outputs.length === 0 || !topology.outputs[0]?.operand) {
    return "// Sem bobina de saída";
  }

  return topology.outputs
    .map((out) => {
      const op = out.operand || "_";
      const preset = out.preset ?? 0;
      switch (out.kind) {
        case "OTE":
          return `${op} := ${expr};`;
        case "OTL":
          return `IF ${expr} THEN\n  ${op} := TRUE;\nEND_IF;`;
        case "OTU":
          return `IF ${expr} THEN\n  ${op} := FALSE;\nEND_IF;`;
        case "NEG_COIL":
          return `${op} := NOT (${expr});`;
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
    })
    .join("\n");
};

export const compileProgram = (rungs: LadderRung[], format: "IL" | "ST" = "IL"): string => {
  if (format === "ST") {
    return rungs
      .map((r, i) => {
        const header = r.comment
          ? `(* Rede ${String(i + 1).padStart(4, "0")}: ${r.comment} *)\n`
          : `// ${r.label || `Rung ${i + 1}`}\n`;
        return `${header}${compileRungToST(r)}`;
      })
      .join("\n\n");
  }
  return rungs
    .map((r, i) => {
      const header = r.comment
        ? `(* Rede ${String(i + 1).padStart(4, "0")}: ${r.comment} *)\n`
        : `// ${r.label || `Rung ${i + 1}`}\n`;
      return `${header}${compileRungToIL(r)}`;
    })
    .join("\n\n");
};

export { isContactKind, isOutputKind };
