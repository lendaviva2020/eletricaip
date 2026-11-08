/**
 * ElétricAi Industrial OS — Ladder Diagram (LD) Engine & IR Translation
 * Paridade com o editor e executor gráfico de Ladder IEC 61131-3 do CODESYS.
 */

import { LadderRung, LadderElement, POU } from "../../canonical/types";
import { IRBlock, IRInstruction } from "../compiler/intermediate-representation";
import { generateUuid as uuidv4 } from "../../canonical/uuid";

export interface LadderEvaluationContext {
  getVariable: (name: string) => any;
  setVariable: (name: string, value: any) => void;
  prevClockStates?: Map<string, boolean>; // Para R_TRIG / F_TRIG
}

export class LadderEngine {
  /**
   * Avalia um conjunto de rungs de forma contínua em tempo de execução
   */
  public static evaluateRung(rung: LadderRung, ctx: LadderEvaluationContext): boolean {
    let powerFlow = true;

    // Avaliação da linha principal
    for (const elem of rung.elements) {
      if (elem.type === "CONTACT_NO") {
        const val = Boolean(ctx.getVariable(elem.symbolName));
        powerFlow = powerFlow && val;
      } else if (elem.type === "CONTACT_NC") {
        const val = Boolean(ctx.getVariable(elem.symbolName));
        powerFlow = powerFlow && !val;
      } else if (elem.type === "CONTACT_R_TRIG") {
        const current = Boolean(ctx.getVariable(elem.symbolName));
        const prev = ctx.prevClockStates?.get(elem.symbolName) || false;
        const edge = current && !prev;
        powerFlow = powerFlow && edge;
        ctx.prevClockStates?.set(elem.symbolName, current);
      } else if (elem.type === "CONTACT_F_TRIG") {
        const current = Boolean(ctx.getVariable(elem.symbolName));
        const prev = ctx.prevClockStates?.get(elem.symbolName) || false;
        const edge = !current && prev;
        powerFlow = powerFlow && edge;
        ctx.prevClockStates?.set(elem.symbolName, current);
      } else if (elem.type === "COIL_STANDARD") {
        ctx.setVariable(elem.symbolName, powerFlow);
      } else if (elem.type === "COIL_NEGATED") {
        ctx.setVariable(elem.symbolName, !powerFlow);
      } else if (elem.type === "COIL_SET") {
        if (powerFlow) ctx.setVariable(elem.symbolName, true);
      } else if (elem.type === "COIL_RESET") {
        if (powerFlow) ctx.setVariable(elem.symbolName, false);
      }
    }

    // Avaliação de branches paralelas (OR lógico com a linha principal)
    if (rung.branches && rung.branches.length > 0) {
      for (const branch of rung.branches) {
        let branchPower = true;
        for (const elem of branch) {
          if (elem.type === "CONTACT_NO") {
            branchPower = branchPower && Boolean(ctx.getVariable(elem.symbolName));
          } else if (elem.type === "CONTACT_NC") {
            branchPower = branchPower && !Boolean(ctx.getVariable(elem.symbolName));
          } else if (elem.type === "COIL_STANDARD") {
            ctx.setVariable(elem.symbolName, branchPower || powerFlow);
          }
        }
      }
    }

    return powerFlow;
  }

  /**
   * Converte Rungs de Ladder em Bloco IR Executável
   */
  public static ladderToIR(pouName: string, rungs: LadderRung[]): IRBlock {
    const instructions: IRInstruction[] = [];
    const localVariables: Record<string, any> = {};

    for (const rung of rungs) {
      const pwrReg = `_rung_${rung.number}_pwr`;
      instructions.push({ op: "LOAD_CONST", arg1: true, dest: pwrReg, sourceLine: rung.number });

      for (const elem of rung.elements) {
        if (elem.type === "CONTACT_NO" || elem.type === "CONTACT_NC") {
          const varReg = `_t_${elem.symbolName.replace(/[^a-zA-Z0-9_]/g, "_")}`;
          instructions.push({ op: "LOAD_VAR", arg1: elem.symbolName, dest: varReg, sourceLine: rung.number });
          if (elem.type === "CONTACT_NC" || elem.negated) {
            instructions.push({ op: "NOT", arg1: varReg, dest: varReg, sourceLine: rung.number });
          }
          instructions.push({ op: "AND", arg1: pwrReg, arg2: varReg, dest: pwrReg, sourceLine: rung.number });
        } else if (elem.type === "COIL_STANDARD") {
          instructions.push({ op: "STORE_VAR", arg1: elem.symbolName, arg2: pwrReg, sourceLine: rung.number });
        } else if (elem.type === "COIL_NEGATED") {
          const negReg = `_neg_${elem.symbolName}`;
          instructions.push({ op: "NOT", arg1: pwrReg, dest: negReg, sourceLine: rung.number });
          instructions.push({ op: "STORE_VAR", arg1: elem.symbolName, arg2: negReg, sourceLine: rung.number });
        } else if (elem.type === "COIL_SET") {
          const skipLabel = `_skip_set_${uuidv4().slice(0, 6)}`;
          instructions.push({ op: "JUMP_IF_FALSE", arg1: pwrReg, arg2: skipLabel, sourceLine: rung.number });
          const tConst = `_t_true_${uuidv4().slice(0, 6)}`;
          instructions.push({ op: "LOAD_CONST", arg1: true, dest: tConst, sourceLine: rung.number });
          instructions.push({ op: "STORE_VAR", arg1: elem.symbolName, arg2: tConst, sourceLine: rung.number });
          instructions.push({ op: "NOP", label: skipLabel });
        } else if (elem.type === "COIL_RESET") {
          const skipLabel = `_skip_rst_${uuidv4().slice(0, 6)}`;
          instructions.push({ op: "JUMP_IF_FALSE", arg1: pwrReg, arg2: skipLabel, sourceLine: rung.number });
          const tConst = `_t_false_${uuidv4().slice(0, 6)}`;
          instructions.push({ op: "LOAD_CONST", arg1: false, dest: tConst, sourceLine: rung.number });
          instructions.push({ op: "STORE_VAR", arg1: elem.symbolName, arg2: tConst, sourceLine: rung.number });
          instructions.push({ op: "NOP", label: skipLabel });
        }
      }
    }

    instructions.push({ op: "RETURN" });
    return { pouName, instructions, localVariables };
  }

  /**
   * Converte Rungs de Ladder em código equivalente em Structured Text (ST)
   */
  public static ladderToST(rungs: LadderRung[]): string {
    const lines: string[] = [];

    for (const rung of rungs) {
      if (rung.comment) {
        lines.push(`(* Rung ${rung.number}: ${rung.comment} *)`);
      }

      const contacts = rung.elements.filter((e) => e.type.startsWith("CONTACT"));
      const coils = rung.elements.filter((e) => e.type.startsWith("COIL"));

      let conditionExpr = "TRUE";
      if (contacts.length > 0) {
        conditionExpr = contacts
          .map((c) => (c.type === "CONTACT_NC" || c.negated ? `NOT ${c.symbolName}` : c.symbolName))
          .join(" AND ");
      }

      for (const coil of coils) {
        if (coil.type === "COIL_STANDARD") {
          lines.push(`${coil.symbolName} := ${conditionExpr};`);
        } else if (coil.type === "COIL_NEGATED") {
          lines.push(`${coil.symbolName} := NOT (${conditionExpr});`);
        } else if (coil.type === "COIL_SET") {
          lines.push(`IF ${conditionExpr} THEN\n    ${coil.symbolName} := TRUE;\nEND_IF;`);
        } else if (coil.type === "COIL_RESET") {
          lines.push(`IF ${conditionExpr} THEN\n    ${coil.symbolName} := FALSE;\nEND_IF;`);
        }
      }
    }

    return lines.join("\n");
  }
}
