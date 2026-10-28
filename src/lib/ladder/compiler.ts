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
  if (inst.kind === "AND") {
    const in1 = String(params.IN1 ?? op ?? "_");
    const in2 = String(params.IN2 ?? "_");
    return `(${in1} AND ${in2})`;
  }
  if (inst.kind === "OR") {
    const in1 = String(params.IN1 ?? op ?? "_");
    const in2 = String(params.IN2 ?? "_");
    return `(${in1} OR ${in2})`;
  }
  if (inst.kind === "XOR") {
    const in1 = String(params.IN1 ?? op ?? "_");
    const in2 = String(params.IN2 ?? "_");
    return `(${in1} XOR ${in2})`;
  }
  if (inst.kind === "NOT") {
    const in1 = String(params.IN ?? params.IN1 ?? op ?? "_");
    return `(NOT ${in1})`;
  }
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

export const IL_LEGACY_WARNING_HEADER = `(* ============================================================================ *)
(* AVISO NORMATIVO IEC 61131-3 (FORMATO HISTÓRICO / LEGADO)                     *)
(* A linguagem Instruction List (IL) foi formalmente descontinuada na norma      *)
(* internacional IEC 61131-3:2025, a qual define exclusivamente                 *)
(* Structured Text (ST), Ladder Diagram (LD) e Function Block Diagram (FBD),     *)
(* além de elementos de Sequential Function Chart (SFC). A linguagem IL NÃO      *)
(* faz parte do conjunto normativo atual.                                        *)
(* Esta exportação é fornecida exclusivamente para interoperabilidade com CLPs   *)
(* legados (IEC 61131-3 2ª Edição) e sua validação é estritamente interna.       *)
(* Não se garante conformidade nem compatibilidade com alvos industriais         *)
(* proprietários sem ferramentas de compilação externas certificadas.           *)
(* Para novos desenvolvimentos, recomenda-se a migração para ST ou LD.          *)
(* ============================================================================ *)`;

/** Converte a árvore estrutural de contatos e ramificações em instruções sequenciais IL. */
export function branchToILInstructions(branch: LadderBranch): string[] {
  const lines: string[] = [];
  const anyBranch = branch as any;
  const isParallel = anyBranch.type === "PARALLEL" || anyBranch.type === "parallel";

  if (isParallel) {
    const branchList = anyBranch.branches ?? anyBranch.items ?? [];
    for (let i = 0; i < branchList.length; i++) {
      const b = branchList[i] as any;
      if (b.instruction || b.kind) {
        const inst: LadderInstruction = b.instruction ?? b;
        const op = inst.operand || "_";
        const isNot = inst.kind === "XIO";
        if (i === 0) lines.push(isNot ? `LDN   ${op}` : `LD    ${op}`);
        else lines.push(isNot ? `ORN   ${op}` : `OR    ${op}`);
      } else if (b.items) {
        const subLines = branchToILInstructions(b);
        if (i === 0) {
          lines.push(...subLines);
        } else {
          if (subLines.length === 1 && subLines[0].startsWith("LD    ")) {
            lines.push(`OR    ${subLines[0].slice(6).trim()}`);
          } else if (subLines.length === 1 && subLines[0].startsWith("LDN   ")) {
            lines.push(`ORN   ${subLines[0].slice(6).trim()}`);
          } else {
            lines.push("OR (");
            for (const sl of subLines) lines.push(`  ${sl}`);
            lines.push(")");
          }
        }
      }
    }
    return lines.length === 0 ? ["LD    TRUE"] : lines;
  }

  // Série (AND)
  const items = branch.items ?? [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as any;
    if (item.instruction || item.kind) {
      const inst: LadderInstruction = item.instruction ?? item;
      const op = inst.operand || "_";
      const isNot = inst.kind === "XIO";
      if (i === 0) {
        lines.push(isNot ? `LDN   ${op}` : `LD    ${op}`);
      } else {
        lines.push(isNot ? `ANDN  ${op}` : `AND   ${op}`);
      }
    } else if (item.branches || item.type === "parallel" || item.type === "PARALLEL") {
      const subBranch = {
        id: item.id || "",
        type: "parallel",
        items: item.branches ?? item.items ?? [],
        branches: item.branches,
      } as any;
      const subLines = branchToILInstructions(subBranch);
      if (i === 0) {
        lines.push(...subLines);
      } else {
        lines.push("AND (");
        for (const sl of subLines) lines.push(`  ${sl}`);
        lines.push(")");
      }
    } else if (item.items) {
      const subLines = branchToILInstructions(item);
      if (i === 0) {
        lines.push(...subLines);
      } else {
        lines.push("AND (");
        for (const sl of subLines) lines.push(`  ${sl}`);
        lines.push(")");
      }
    }
  }

  return lines.length === 0 ? ["LD    TRUE"] : lines;
}

export const compileRungToIL = (rung: LadderRung): string => {
  const topology = ensureRungTopology(rung);
  const ilSeq = branchToILInstructions(topology.rootBranch);
  const ilPrefix = ilSeq.join("\n");

  if (topology.outputs.length === 0 || !topology.outputs[0]?.operand) {
    return `${ilPrefix}\nST    _`;
  }

  return topology.outputs
    .map((out) => {
      const op = out.operand || "_";
      const preset = out.preset ?? 0;
      switch (out.kind) {
        case "OTE":
          return `${ilPrefix}\nST    ${op}`;
        case "OTL":
          return `${ilPrefix}\nS     ${op}`;
        case "OTU":
          return `${ilPrefix}\nR     ${op}`;
        case "NEG_COIL":
          return `${ilPrefix}\nSTN   ${op}`;
        case "TON":
          return `${ilPrefix}\nCAL ${op}(IN := %MX, PT := T#${preset}ms)`;
        case "TOF":
          return `${ilPrefix}\nCAL ${op}(IN := %MX, PT := T#${preset}ms) (* TOF *)`;
        case "TP":
          return `${ilPrefix}\nCAL ${op}(IN := %MX, PT := T#${preset}ms) (* TP *)`;
        case "TONR":
          return `${ilPrefix}\nCAL ${op}(IN := %MX, PT := T#${preset}ms) (* TONR *)`;
        case "CTU":
          return `${ilPrefix}\nCAL ${op}(CU := %MX, PV := ${preset})`;
        case "CTD": {
          const ld = out.params?.LD || "FALSE";
          return `${ilPrefix}\nCAL ${op}(CD := %MX, LD := ${ld}, PV := ${preset})`;
        }
        case "CTUD": {
          const cd = out.params?.CD || "%MX";
          const r = out.params?.R || "FALSE";
          const ld = out.params?.LD || "FALSE";
          return `${ilPrefix}\nCAL ${op}(CU := %MX, CD := ${cd}, R := ${r}, LD := ${ld}, PV := ${preset})`;
        }
        case "SR": {
          const r = out.params?.R || "FALSE";
          return `${ilPrefix}\nCAL ${op}_SR(S1 := %MX, R := ${r})\nLD    ${op}_SR.Q1\nST    ${op}`;
        }
        case "RS": {
          const r1 = out.params?.R1 || out.params?.R || "FALSE";
          return `${ilPrefix}\nCAL ${op}_RS(S := %MX, R1 := ${r1})\nLD    ${op}_RS.Q1\nST    ${op}`;
        }
        case "INT_TO_REAL": {
          const src = out.params?.IN || op;
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${src}\nCAL   INT_TO_REAL\nST    ${dst}`;
        }
        case "REAL_TO_INT": {
          const src = out.params?.IN || op;
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${src}\nCAL   REAL_TO_INT\nST    ${dst}`;
        }
        case "ADD": {
          const in1 = out.params?.IN1 || op;
          const in2 = out.params?.IN2 || "0";
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nADD   ${in2}\nST    ${dst}`;
        }
        case "SUB": {
          const in1 = out.params?.IN1 || op;
          const in2 = out.params?.IN2 || "0";
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nSUB   ${in2}\nST    ${dst}`;
        }
        case "MUL": {
          const in1 = out.params?.IN1 || op;
          const in2 = out.params?.IN2 || "1";
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nMUL   ${in2}\nST    ${dst}`;
        }
        case "DIV": {
          const in1 = out.params?.IN1 || op;
          const in2 = out.params?.IN2 || "1";
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nDIV   ${in2}\nST    ${dst}`;
        }
        case "MOD": {
          const in1 = out.params?.IN1 || op;
          const in2 = out.params?.IN2 || "1";
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nMOD   ${in2}\nST    ${dst}`;
        }
        case "ABS": {
          const in1 = out.params?.IN1 || op;
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nCAL   ABS\nST    ${dst}`;
        }
        case "SQRT": {
          const in1 = out.params?.IN1 || op;
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nCAL   SQRT\nST    ${dst}`;
        }
        case "MOVE": {
          const src = out.params?.IN || op;
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${src}\nST    ${dst}`;
        }
        case "AND": {
          const in1 = out.params?.IN1 || op;
          const in2 = out.params?.IN2 || "_";
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nAND   ${in2}\nST    ${dst}`;
        }
        case "OR": {
          const in1 = out.params?.IN1 || op;
          const in2 = out.params?.IN2 || "_";
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nOR    ${in2}\nST    ${dst}`;
        }
        case "XOR": {
          const in1 = out.params?.IN1 || op;
          const in2 = out.params?.IN2 || "_";
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nXOR   ${in2}\nST    ${dst}`;
        }
        case "NOT": {
          const in1 = out.params?.IN || out.params?.IN1 || op;
          const dst = out.params?.OUT || op;
          return `${ilPrefix}\nLD    ${in1}\nNOT\nST    ${dst}`;
        }
        default:
          return `${ilPrefix}\nST    ${op}`;
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
        case "TONR":
          return `${op}_TONR(IN := ${expr}, PT := T#${preset}ms); ${op} := ${op}_TONR.Q;`;
        case "CTU":
          return `${op}(CU := ${expr}, PV := ${preset});`;
        case "CTD": {
          const ld = out.params?.LD || "FALSE";
          return `${op}(CD := ${expr}, LD := ${ld}, PV := ${preset});`;
        }
        case "CTUD": {
          const cd = out.params?.CD || "FALSE";
          const r = out.params?.R || "FALSE";
          const ld = out.params?.LD || "FALSE";
          return `IF ${expr} THEN\n  ${op}(CU := TRUE, CD := ${cd}, R := ${r}, LD := ${ld}, PV := ${preset});\nELSE\n  ${op}(CU := FALSE, CD := ${cd}, R := ${r}, LD := ${ld}, PV := ${preset});\nEND_IF;`;
        }
        case "SR": {
          const r = out.params?.R || "FALSE";
          return `${op}_SR(S1 := ${expr}, R := ${r}); ${op} := ${op}_SR.Q1;`;
        }
        case "RS": {
          const r1 = out.params?.R1 || out.params?.R || "FALSE";
          return `${op}_RS(S := ${expr}, R1 := ${r1}); ${op} := ${op}_RS.Q1;`;
        }
        case "INT_TO_REAL": {
          const src = out.params?.IN || op;
          const dst = out.params?.OUT || op;
          return `IF ${expr} THEN ${dst} := INT_TO_REAL(${src}); END_IF;`;
        }
        case "REAL_TO_INT": {
          const src = out.params?.IN || op;
          const dst = out.params?.OUT || op;
          return `IF ${expr} THEN ${dst} := REAL_TO_INT(${src}); END_IF;`;
        }
        case "AND": {
          const dst = out.params?.OUT || op;
          const in1 = out.params?.IN1 || "_";
          const in2 = out.params?.IN2 || "_";
          return `IF ${expr} THEN ${dst} := ${in1} AND ${in2}; END_IF;`;
        }
        case "OR": {
          const dst = out.params?.OUT || op;
          const in1 = out.params?.IN1 || "_";
          const in2 = out.params?.IN2 || "_";
          return `IF ${expr} THEN ${dst} := ${in1} OR ${in2}; END_IF;`;
        }
        case "XOR": {
          const dst = out.params?.OUT || op;
          const in1 = out.params?.IN1 || "_";
          const in2 = out.params?.IN2 || "_";
          return `IF ${expr} THEN ${dst} := ${in1} XOR ${in2}; END_IF;`;
        }
        case "NOT": {
          const dst = out.params?.OUT || op;
          const in1 = out.params?.IN || out.params?.IN1 || op || "_";
          return `IF ${expr} THEN ${dst} := NOT ${in1}; END_IF;`;
        }
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

  const ilBody = rungs
    .map((r, i) => {
      const header = r.comment
        ? `(* Rede ${String(i + 1).padStart(4, "0")}: ${r.comment} *)\n`
        : `// ${r.label || `Rung ${i + 1}`}\n`;
      return `${header}${compileRungToIL(r)}`;
    })
    .join("\n\n");

  return `${IL_LEGACY_WARNING_HEADER}\n\n${ilBody}`;
};

export { isContactKind, isOutputKind };
