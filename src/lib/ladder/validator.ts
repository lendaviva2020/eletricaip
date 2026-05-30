// Static validation of ladder rungs. Returns warnings & errors per rung so
// the UI can highlight problems before runtime.
import type { LadderRung } from "./types";
import { isOutputKind } from "./types";

export type LadderIssueLevel = "error" | "warn";

export interface LadderIssue {
  rungId: string;
  level: LadderIssueLevel;
  code: string;
  message: string;
}

export const validateRungs = (rungs: LadderRung[]): LadderIssue[] => {
  const issues: LadderIssue[] = [];
  const outputCoils = new Map<string, string[]>(); // operand -> rungIds

  rungs.forEach((rung) => {
    const outRow = rung.cells[0] ?? [];
    const outCol = outRow.length - 1;
    const outCell = outRow[outCol];

    // Output presence
    if (!outCell || outCell.kind === "EMPTY") {
      issues.push({
        rungId: rung.id,
        level: "warn",
        code: "NO_OUTPUT",
        message: "Rung sem bobina de saída — não terá efeito no scan.",
      });
    } else if (!isOutputKind(outCell.kind)) {
      issues.push({
        rungId: rung.id,
        level: "error",
        code: "BAD_OUTPUT",
        message: `Coluna de saída exige bobina/timer, encontrado ${outCell.kind}.`,
      });
    } else if (!outCell.operand) {
      issues.push({
        rungId: rung.id,
        level: "error",
        code: "OUTPUT_NO_OPERAND",
        message: "Bobina de saída sem operando atribuído.",
      });
    } else {
      const arr = outputCoils.get(outCell.operand) ?? [];
      arr.push(rung.id);
      outputCoils.set(outCell.operand, arr);
    }

    // Timer / counter preset sanity
    if (outCell && (outCell.kind === "TON" || outCell.kind === "TOF" || outCell.kind === "TP")) {
      if (!outCell.preset || outCell.preset <= 0) {
        issues.push({
          rungId: rung.id,
          level: "warn",
          code: "TIMER_NO_PRESET",
          message: `${outCell.kind} sem preset (PT) — irá disparar instantaneamente.`,
        });
      }
    }
    if (outCell && outCell.kind === "CTU" && (!outCell.preset || outCell.preset <= 0)) {
      issues.push({
        rungId: rung.id,
        level: "warn",
        code: "COUNTER_NO_PRESET",
        message: "CTU sem preset (PV) — DN nunca ativará.",
      });
    }

    // Contact rows: detect contacts without operands and empty rungs
    let anyContact = false;
    rung.cells.forEach((row) => {
      for (let i = 0; i < row.length - 1; i++) {
        const c = row[i];
        if (c.kind === "EMPTY") continue;
        anyContact = true;
        if (!c.operand) {
          issues.push({
            rungId: rung.id,
            level: "error",
            code: "CONTACT_NO_OPERAND",
            message: `Contato ${c.kind} sem operando.`,
          });
        }
      }
    });
    if (!anyContact && outCell && outCell.kind !== "EMPTY") {
      issues.push({
        rungId: rung.id,
        level: "warn",
        code: "NO_INPUT",
        message: "Rung sem contatos — bobina avaliará FALSE permanentemente.",
      });
    }
  });

  // Duplicate output coil detection (double-coil syndrome)
  outputCoils.forEach((rungIds, operand) => {
    if (rungIds.length > 1) {
      rungIds.forEach((id) =>
        issues.push({
          rungId: id,
          level: "warn",
          code: "DUPLICATE_COIL",
          message: `Operando "${operand}" é escrito em ${rungIds.length} rungs — último vence (double-coil).`,
        }),
      );
    }
  });

  return issues;
};
