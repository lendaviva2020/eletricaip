// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — IEC COMPILER PIPELINE
// Orchestrates Lexing, Parsing, Semantic Checking and IR Bytecode Generation
// ============================================================================

import { StParser } from "../parser/st-parser";
import { StSemanticAnalyzer } from "../parser/st-semantic";
import type { IndustrialProject, POU, CompilationResult, CompilerDiagnostic } from "../../canonical/types";
import type { CompiledProjectIR, IRBlock, IRInstruction } from "./intermediate-representation";
import type { Statement, Expression, BinaryExpression } from "../parser/st-ast";
import { generateUuid as uuidv4 } from "../../canonical/uuid";

export class IECCompilerPipeline {
  /**
   * Compila o projeto industrial completo em Representação Intermediária (IR) executável.
   */
  public static compile(project: IndustrialProject): {
    success: boolean;
    compiledIR?: CompiledProjectIR;
    compilationResult: CompilationResult;
  } {
    const diagnostics: CompilerDiagnostic[] = [];
    const irBlocks: Record<string, IRBlock> = {};
    const globalVariables: Record<string, any> = {};

    // 1. Carrega variáveis globais e tags na tabela de símbolos externa
    const externalSymbols = new Map<string, string>();
    for (const tag of project.tags) {
      externalSymbols.set(tag.name.toLowerCase(), tag.dataType);
      externalSymbols.set(tag.code.toLowerCase(), tag.dataType);
      globalVariables[tag.name] = tag.initialValue !== undefined ? tag.initialValue : 0;
    }

    for (const gvl of project.globalVariableLists) {
      for (const v of gvl.variables) {
        externalSymbols.set(v.name.toLowerCase(), v.dataType);
        globalVariables[v.name] = v.initialValue !== undefined ? v.initialValue : 0;
      }
    }

    // 2. Compila cada POU
    for (const pou of project.pous) {
      if (pou.language === "ST") {
        const source = pou.rawSourceST.trim() || `PROGRAM ${pou.name}\nEND_PROGRAM`;
        const parser = new StParser(source);
        const parseRes = parser.parse();

        if (parseRes.diagnostics.length > 0) {
          for (const d of parseRes.diagnostics) {
            diagnostics.push({
              id: uuidv4(),
              pouId: pou.id,
              line: d.line,
              column: d.column,
              severity: d.severity,
              code: "IEC_SYNTAX_ERROR",
              message: `[${pou.name}] ${d.message}`,
            });
          }
        }

        if (parseRes.ast) {
          const semantic = new StSemanticAnalyzer(parseRes.ast, externalSymbols);
          const semDiagnostics = semantic.analyze();
          for (const sd of semDiagnostics) {
            sd.pouId = pou.id;
            sd.message = `[${pou.name}] ${sd.message}`;
            diagnostics.push(sd);
          }

          // Se não houver erros fatais, gera as instruções IR
          const hasFatal = diagnostics.some((d) => d.pouId === pou.id && d.severity === "ERROR");
          if (!hasFatal) {
            const block = this.generateIRFromST(pou.name, parseRes.ast.body, semantic.getSymbolTable());
            irBlocks[pou.name] = block;
          }
        }
      } else if (pou.language === "LD") {
        // Compila rungs do Ladder
        const block = this.generateIRFromLadder(pou);
        irBlocks[pou.name] = block;
      } else if (pou.language === "FBD") {
        // Compila blocos do FBD
        const block = this.generateIRFromFBD(pou);
        irBlocks[pou.name] = block;
      } else if (pou.language === "SFC") {
        // Compila grafo SFC
        const block = this.generateIRFromSFC(pou);
        irBlocks[pou.name] = block;
      }
    }

    // 3. Mapeia a ordem das tarefas
    const tasksOrder: { taskName: string; pouNames: string[]; intervalMs: number }[] = [];
    for (const task of project.taskConfigurations) {
      if (task.enabled) {
        const pouNames = task.pouIds
          .map((id) => project.pous.find((p) => p.id === id)?.name)
          .filter((name): name is string => Boolean(name));
        tasksOrder.push({
          taskName: task.name,
          pouNames,
          intervalMs: task.intervalMs,
        });
      }
    }

    const hasErrors = diagnostics.some((d) => d.severity === "ERROR");
    const result: CompilationResult = {
      id: uuidv4(),
      projectId: project.id,
      success: !hasErrors,
      compiledAt: new Date().toISOString(),
      compilerVersion: "1.0.0-IEC61131-3",
      diagnostics,
      irBytecodeSize: Object.keys(irBlocks).reduce((acc, k) => acc + irBlocks[k].instructions.length, 0),
    };

    if (hasErrors) {
      return {
        success: false,
        compilationResult: result,
      };
    }

    const compiledIR: CompiledProjectIR = {
      blocks: irBlocks,
      globalVariables,
      tasksOrder,
    };

    return {
      success: true,
      compiledIR,
      compilationResult: result,
    };
  }

  // --------------------------------------------------------------------------
  // Geradores de IR
  // --------------------------------------------------------------------------
  private static generateIRFromST(pouName: string, statements: Statement[], symbols: Map<string, any>): IRBlock {
    const instructions: IRInstruction[] = [];
    const localVariables: Record<string, any> = {};

    for (const [key, sym] of symbols.entries()) {
      localVariables[sym.name] = sym.dataType === "BOOL" ? false : 0;
    }

    let tempCounter = 0;
    const nextTemp = () => `_t${tempCounter++}`;
    let labelCounter = 0;
    const nextLabel = (prefix: string) => `${prefix}_${labelCounter++}`;

    const compileExpression = (expr: Expression): string => {
      if (expr.type === "LITERAL_EXPR") {
        const t = nextTemp();
        instructions.push({ op: "LOAD_CONST", arg1: expr.value, dest: t, sourceLine: expr.loc.line });
        return t;
      }
      if (expr.type === "IDENTIFIER_EXPR") {
        const t = nextTemp();
        instructions.push({ op: "LOAD_VAR", arg1: expr.name, dest: t, sourceLine: expr.loc.line });
        return t;
      }
      if (expr.type === "BINARY_EXPR") {
        const leftReg = compileExpression(expr.left);
        const rightReg = compileExpression(expr.right);
        const dest = nextTemp();
        const opMap: Record<string, any> = {
          "+": "ADD",
          "-": "SUB",
          "*": "MUL",
          "/": "DIV",
          MOD: "MOD",
          AND: "AND",
          OR: "OR",
          XOR: "XOR",
          "=": "EQ",
          "<>": "NEQ",
          "<": "LT",
          "<=": "LE",
          ">": "GT",
          ">=": "GE",
        };
        instructions.push({
          op: opMap[expr.operator] || "ADD",
          arg1: leftReg,
          arg2: rightReg,
          dest,
          sourceLine: expr.loc.line,
        });
        return dest;
      }
      if (expr.type === "UNARY_EXPR") {
        const opReg = compileExpression(expr.operand);
        const dest = nextTemp();
        instructions.push({ op: expr.operator === "NOT" ? "NOT" : "SUB", arg1: opReg, dest, sourceLine: expr.loc.line });
        return dest;
      }
      return nextTemp();
    };

    const compileStatement = (stmt: Statement) => {
      if (stmt.type === "ASSIGNMENT_STMT") {
        const valReg = compileExpression(stmt.value);
        if (stmt.target.type === "IDENTIFIER_EXPR") {
          instructions.push({ op: "STORE_VAR", arg1: stmt.target.name, arg2: valReg, sourceLine: stmt.loc.line });
        }
      } else if (stmt.type === "IF_STMT") {
        const condReg = compileExpression(stmt.condition);
        const elseLabel = nextLabel("L_ELSE");
        const endLabel = nextLabel("L_ENDIF");

        instructions.push({ op: "JUMP_IF_FALSE", arg1: condReg, arg2: elseLabel, sourceLine: stmt.loc.line });
        for (const s of stmt.thenStatements) compileStatement(s);
        instructions.push({ op: "JUMP", arg1: endLabel });

        instructions.push({ op: "NOP", label: elseLabel });
        for (const s of stmt.elseStatements) compileStatement(s);
        instructions.push({ op: "NOP", label: endLabel });
      }
    };

    for (const stmt of statements) {
      compileStatement(stmt);
    }

    instructions.push({ op: "RETURN" });

    return {
      pouName,
      instructions,
      localVariables,
    };
  }

  private static generateIRFromLadder(pou: POU): IRBlock {
    const instructions: IRInstruction[] = [];
    const localVariables: Record<string, any> = {};

    for (const net of pou.networks) {
      for (const rung of net.rungs) {
        // Avaliação sequencial de rungs: AND de contatos, atribuição em bobinas
        let lastResultReg = "_rung_pwr";
        instructions.push({ op: "LOAD_CONST", arg1: true, dest: lastResultReg, sourceLine: rung.number });

        for (const elem of rung.elements) {
          if (elem.type === "CONTACT_NO" || elem.type === "CONTACT_NC") {
            const sym = elem.symbolName || "BOOL_IN";
            const valReg = `_contact_${elem.id.slice(0, 4)}`;
            instructions.push({ op: "LOAD_VAR", arg1: sym, dest: valReg });
            if (elem.negated || elem.type === "CONTACT_NC") {
              instructions.push({ op: "NOT", arg1: valReg, dest: valReg });
            }
            instructions.push({ op: "AND", arg1: lastResultReg, arg2: valReg, dest: lastResultReg });
          } else if (elem.type.startsWith("COIL")) {
            const sym = elem.symbolName || "BOOL_OUT";
            instructions.push({ op: "STORE_VAR", arg1: sym, arg2: lastResultReg });
          }
        }
      }
    }

    instructions.push({ op: "RETURN" });
    return { pouName: pou.name, instructions, localVariables };
  }

  private static generateIRFromFBD(pou: POU): IRBlock {
    const instructions: IRInstruction[] = [];
    const localVariables: Record<string, any> = {};

    for (const net of pou.networks) {
      for (const node of net.fbdNodes) {
        // Exemplo: TON, AND, OR
        if (node.blockType === "TON") {
          instructions.push({
            op: "CALL_FB",
            arg1: "TON",
            arg2: { IN: node.inputs[0]?.currentValue ?? false, PT: node.inputs[1]?.defaultValue ?? "T#5s" },
            dest: node.name,
          });
        }
      }
    }

    instructions.push({ op: "RETURN" });
    return { pouName: pou.name, instructions, localVariables };
  }

  private static generateIRFromSFC(pou: POU): IRBlock {
    const instructions: IRInstruction[] = [];
    const localVariables: Record<string, any> = {};

    for (const net of pou.networks) {
      for (const step of net.sfcSteps) {
        localVariables[`_step_${step.stepNumber}_active`] = step.isInitial;
        localVariables[`_step_${step.stepNumber}_timeMs`] = 0;
      }
    }

    instructions.push({ op: "RETURN" });
    return { pouName: pou.name, instructions, localVariables };
  }
}
