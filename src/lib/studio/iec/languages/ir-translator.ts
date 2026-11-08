/**
 * ElétricAi Industrial OS — Unified IEC IR Translator
 * Roteamento Bidirecional entre Linguagens IEC 61131-3 (ST, LD, FBD, SFC, IL) e Representação Intermediária (IR).
 */

import { IECLanguage, POU } from "../../canonical/types";
import { IRBlock, IRInstruction } from "../compiler/intermediate-representation";
import { LadderEngine } from "./ladder-engine";
import { FBDEngine } from "./fbd-engine";
import { ILEngine } from "./il-engine";

export class UnifiedIRTranslator {
  /**
   * Converte qualquer POU em IRBlock executável de acordo com sua linguagem
   */
  public static translatePouToIR(pou: POU): IRBlock {
    switch (pou.language) {
      case "LD": {
        const rungs = pou.networks.flatMap((n) => n.rungs);
        return LadderEngine.ladderToIR(pou.name, rungs);
      }
      case "FBD": {
        const nodes = pou.networks.flatMap((n) => n.fbdNodes);
        const conns = pou.networks.flatMap((n) => n.fbdConnections);
        return FBDEngine.fbdToIR(pou.name, nodes, conns);
      }
      case "IL": {
        return ILEngine.ilToIR(pou.name, pou.rawSourceST);
      }
      case "SFC": {
        const instructions: IRInstruction[] = [];
        const localVariables: Record<string, any> = {};
        for (const net of pou.networks) {
          for (const step of net.sfcSteps) {
            localVariables[`_step_${step.stepNumber}_active`] = step.isInitial;
          }
        }
        instructions.push({ op: "RETURN" });
        return { pouName: pou.name, instructions, localVariables };
      }
      case "ST":
      default: {
        // Fallback básico para ST estruturado
        const instructions: IRInstruction[] = [{ op: "RETURN" }];
        return { pouName: pou.name, instructions, localVariables: {} };
      }
    }
  }

  /**
   * Descompila instruções IR em representação textual de Structured Text (ST)
   */
  public static decompileIRToST(block: IRBlock): string {
    const lines: string[] = [`PROGRAM ${block.pouName}`];

    if (Object.keys(block.localVariables).length > 0) {
      lines.push("VAR");
      for (const [varName, initialVal] of Object.entries(block.localVariables)) {
        if (!varName.startsWith("_t_") && !varName.startsWith("_cr")) {
          lines.push(`    ${varName} : ANY := ${JSON.stringify(initialVal)};`);
        }
      }
      lines.push("END_VAR");
    }

    lines.push("");
    lines.push("(* Código descompilado da Representação Intermediária *)");

    for (const inst of block.instructions) {
      if (inst.label) {
        lines.push(`${inst.label}:`);
      }
      switch (inst.op) {
        case "STORE_VAR":
          lines.push(`    ${inst.arg1} := ${inst.arg2};`);
          break;
        case "ADD":
          lines.push(`    ${inst.dest} := ${inst.arg1} + ${inst.arg2};`);
          break;
        case "SUB":
          lines.push(`    ${inst.dest} := ${inst.arg1} - ${inst.arg2};`);
          break;
        case "MUL":
          lines.push(`    ${inst.dest} := ${inst.arg1} * ${inst.arg2};`);
          break;
        case "DIV":
          lines.push(`    ${inst.dest} := ${inst.arg1} / ${inst.arg2};`);
          break;
        case "AND":
          lines.push(`    ${inst.dest} := ${inst.arg1} AND ${inst.arg2};`);
          break;
        case "OR":
          lines.push(`    ${inst.dest} := ${inst.arg1} OR ${inst.arg2};`);
          break;
        case "NOT":
          lines.push(`    ${inst.dest} := NOT ${inst.arg1};`);
          break;
        case "JUMP":
          lines.push(`    GOTO ${inst.arg1};`);
          break;
        case "JUMP_IF_FALSE":
          lines.push(`    IF NOT ${inst.arg1} THEN GOTO ${inst.arg2}; END_IF;`);
          break;
        case "CALL_FB":
          lines.push(`    ${inst.dest}(${JSON.stringify(inst.arg2)});`);
          break;
      }
    }

    lines.push("END_PROGRAM");
    return lines.join("\n");
  }
}
