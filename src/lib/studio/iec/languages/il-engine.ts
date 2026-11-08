/**
 * ElétricAi Industrial OS — Instruction List (IL) Engine & IR Translation
 * Suporte à linguagem clássica orientada a acumulador (Current Result - CR) da IEC 61131-3.
 */

import { IRBlock, IRInstruction } from "../compiler/intermediate-representation";

export interface ILInstructionParsed {
  label?: string;
  operator: string;
  modifier?: string; // N (negated), C (conditional), CN
  operand?: string;
  sourceLine: number;
}

export class ILEngine {
  /**
   * Parser textual de linhas de Instruction List (IL)
   */
  public static parseIL(source: string): ILInstructionParsed[] {
    const lines = source.split("\n");
    const parsed: ILInstructionParsed[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line || line.startsWith("(*") || line.startsWith("//")) continue;

      let label: string | undefined;
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0 && !line.startsWith(":=")) {
        label = line.substring(0, colonIdx).trim();
        line = line.substring(colonIdx + 1).trim();
      }

      if (!line) {
        if (label) parsed.push({ label, operator: "NOP", sourceLine: i + 1 });
        continue;
      }

      const parts = line.split(/\s+/);
      const rawOp = parts[0].toUpperCase();
      const operand = parts.slice(1).join(" ");

      let operator = rawOp;
      let modifier: string | undefined;

      if (rawOp.endsWith("CN")) {
        operator = rawOp.slice(0, -2);
        modifier = "CN";
      } else if (rawOp.endsWith("N") && rawOp !== "NOT") {
        operator = rawOp.slice(0, -1);
        modifier = "N";
      } else if (rawOp.endsWith("C")) {
        operator = rawOp.slice(0, -1);
        modifier = "C";
      }

      parsed.push({
        label,
        operator,
        modifier,
        operand: operand.trim(),
        sourceLine: i + 1,
      });
    }

    return parsed;
  }

  /**
   * Converte código IL em Bloco IR Executável
   */
  public static ilToIR(pouName: string, source: string): IRBlock {
    const parsed = this.parseIL(source);
    const instructions: IRInstruction[] = [];
    const localVariables: Record<string, any> = {};

    const crReg = "_cr"; // Current Result register
    localVariables["_cr"] = 0;

    for (const inst of parsed) {
      if (inst.label) {
        instructions.push({ op: "NOP", label: inst.label, sourceLine: inst.sourceLine });
      }

      const op = inst.operator;
      const mod = inst.modifier;
      const operand = inst.operand || "";

      switch (op) {
        case "LD": {
          const isNum = !isNaN(Number(operand));
          const isBool = operand.toUpperCase() === "TRUE" || operand.toUpperCase() === "FALSE";
          const opVal = isBool ? operand.toUpperCase() === "TRUE" : isNum ? Number(operand) : operand;

          if (typeof opVal === "string") {
            instructions.push({ op: "LOAD_VAR", arg1: opVal, dest: crReg, sourceLine: inst.sourceLine });
          } else {
            instructions.push({ op: "LOAD_CONST", arg1: opVal, dest: crReg, sourceLine: inst.sourceLine });
          }

          if (mod === "N") {
            instructions.push({ op: "NOT", arg1: crReg, dest: crReg, sourceLine: inst.sourceLine });
          }
          break;
        }

        case "ST": {
          if (mod === "N") {
            const tempReg = `_t_st_${inst.sourceLine}`;
            instructions.push({ op: "NOT", arg1: crReg, dest: tempReg, sourceLine: inst.sourceLine });
            instructions.push({ op: "STORE_VAR", arg1: operand, arg2: tempReg, sourceLine: inst.sourceLine });
          } else {
            instructions.push({ op: "STORE_VAR", arg1: operand, arg2: crReg, sourceLine: inst.sourceLine });
          }
          break;
        }

        case "AND":
        case "OR":
        case "XOR":
        case "ADD":
        case "SUB":
        case "MUL":
        case "DIV":
        case "EQ":
        case "NE":
        case "GT":
        case "GE":
        case "LT":
        case "LE": {
          const opReg = `_t_op_${inst.sourceLine}`;
          const isNum = !isNaN(Number(operand));
          if (isNum) {
            instructions.push({ op: "LOAD_CONST", arg1: Number(operand), dest: opReg, sourceLine: inst.sourceLine });
          } else {
            instructions.push({ op: "LOAD_VAR", arg1: operand, dest: opReg, sourceLine: inst.sourceLine });
          }

          if (mod === "N") {
            instructions.push({ op: "NOT", arg1: opReg, dest: opReg, sourceLine: inst.sourceLine });
          }

          const irOp = op === "NE" ? "NEQ" : (op as any);
          instructions.push({ op: irOp, arg1: crReg, arg2: opReg, dest: crReg, sourceLine: inst.sourceLine });
          break;
        }

        case "JMP": {
          if (mod === "C") {
            instructions.push({ op: "JUMP_IF_TRUE", arg1: crReg, arg2: operand, sourceLine: inst.sourceLine });
          } else if (mod === "CN") {
            instructions.push({ op: "JUMP_IF_FALSE", arg1: crReg, arg2: operand, sourceLine: inst.sourceLine });
          } else {
            instructions.push({ op: "JUMP", arg1: operand, sourceLine: inst.sourceLine });
          }
          break;
        }

        case "RET": {
          instructions.push({ op: "RETURN", sourceLine: inst.sourceLine });
          break;
        }
      }
    }

    instructions.push({ op: "RETURN" });
    return { pouName, instructions, localVariables };
  }
}
