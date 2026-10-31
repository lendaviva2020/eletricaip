/**
 * Gerador de Structured Text (ST - IEC 61131-3) a partir do motor moderno FBD.
 * Converte AST / IR em código ST determinístico, tipado e com ordenação topológica.
 */
import {
  compileFbd,
  type CompileResult,
  type FbdDiagnostic,
  type IrInstruction,
  type IrOperand,
} from "./compiler";
import { type ElementaryType, type FbdValue } from "./datatypes";
import { createDefaultRegistry } from "./iec-library";
import { type FbdDocument } from "./model";
import { type BlockRegistry } from "./registry";

export interface StGeneratorResult {
  readonly code: string;
  readonly ok: boolean;
  readonly diagnostics: readonly FbdDiagnostic[];
}

function formatLiteral(val: FbdValue, expectedType?: ElementaryType): string {
  if (expectedType === "TIME") {
    if (typeof val === "number") return `T#${val}ms`;
    if (typeof val === "string") {
      const s = val.trim();
      if (/^T#/i.test(s)) return s.toUpperCase();
      if (/^[-+]?\d+$/.test(s)) return `T#${s}ms`;
    }
  }
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") {
    if (expectedType === "REAL" || expectedType === "LREAL") {
      return Number.isInteger(val) ? `${val}.0` : String(val);
    }
    return String(val);
  }
  if (typeof val === "string") {
    const s = val.trim();
    if (/^T#/i.test(s)) return s.toUpperCase();
    if (/^TRUE$/i.test(s)) return "TRUE";
    if (/^FALSE$/i.test(s)) return "FALSE";
    if (/^[-+]?\d+(\.\d+)?$/i.test(s)) {
      if ((expectedType === "REAL" || expectedType === "LREAL") && !s.includes(".")) {
        return `${s}.0`;
      }
      return s;
    }
    return `'${s.replace(/'/g, "''")}'`;
  }
  return "0";
}

function formatOperand(
  op: IrOperand,
  slotToVar: Map<number, string>,
  expectedType?: ElementaryType,
): string {
  if (op.kind === "const") {
    return formatLiteral(op.value, expectedType);
  }
  const varName = slotToVar.get(op.slot) ?? `_slot_${op.slot}`;
  if (op.convertTo) {
    return `${op.convertTo}(${varName})`;
  }
  return varName;
}

export function generateStructuredText(
  doc: FbdDocument,
  registry: BlockRegistry = createDefaultRegistry(),
): StGeneratorResult {
  const result: CompileResult = compileFbd(doc, registry);

  if (!result.ok || !result.ast || !result.ir) {
    const diagLines = result.diagnostics.map(
      (d) =>
        `// [${d.severity.toUpperCase()}] ${d.code}: ${d.message}${d.nodeId ? ` (node: ${d.nodeId})` : ""}`,
    );
    const code = [
      `// IEC 61131-3 Structured Text — Erro de Compilação FBD`,
      `// Diagrama: ${doc.name} (v${doc.version})`,
      `// Falha ao compilar grafo de blocos:`,
      ...diagLines,
      "",
      `PROGRAM ${doc.name.replace(/[^A-Za-z0-9_]/g, "_") || "MainProgram"}`,
      `  // Corrija os erros apontados acima no editor FBD para gerar código executável.`,
      `END_PROGRAM`,
    ].join("\n");

    return { code, ok: false, diagnostics: result.diagnostics };
  }

  const { ast, ir } = result;
  const progName = ast.name.replace(/[^A-Za-z0-9_]/g, "_") || "MainProgram";

  const lines: string[] = [
    `// =====================================================================`,
    `// IEC 61131-3 Structured Text (ST)`,
    `// Gerado automaticamente pelo compilador FBD moderno ElétricAi`,
    `// Programa: ${progName}`,
    `// Ciclo: ${doc.cycleTimeMs}ms · Blocos: ${doc.nodes.length} · Conexões: ${doc.connections.length}`,
    `// =====================================================================`,
    "",
    `PROGRAM ${progName}`,
  ];

  // 1. Variáveis de Entrada
  const inputVars = ast.variables.filter((v) => v.direction === "input");
  if (inputVars.length > 0) {
    lines.push("VAR_INPUT");
    for (const v of inputVars) {
      const init =
        v.initialValue !== undefined ? ` := ${formatLiteral(v.initialValue, v.dataType)}` : "";
      lines.push(`  ${v.name} : ${v.dataType}${init};`);
    }
    lines.push("END_VAR");
    lines.push("");
  }

  // 2. Variáveis de Saída
  const outputVars = ast.variables.filter((v) => v.direction === "output");
  if (outputVars.length > 0) {
    lines.push("VAR_OUTPUT");
    for (const v of outputVars) {
      const init =
        v.initialValue !== undefined ? ` := ${formatLiteral(v.initialValue, v.dataType)}` : "";
      lines.push(`  ${v.name} : ${v.dataType}${init};`);
    }
    lines.push("END_VAR");
    lines.push("");
  }

  // 3. Variáveis Internas (VAR)
  // Mapeamos os slots de cada instrução
  const slotToVar = new Map<number, string>();
  const internalVars: Array<{ name: string; type: string; comment?: string }> = [];
  const fbInstances: Array<{ name: string; type: string }> = [];

  // Variáveis declaradas no modelo do usuário com direction = 'local'
  for (const v of ast.variables.filter((v) => v.direction === "local")) {
    const init =
      v.initialValue !== undefined ? ` := ${formatLiteral(v.initialValue, v.dataType)}` : "";
    internalVars.push({ name: `${v.name}${init}`, type: v.dataType });
  }

  for (const inst of ir.instructions) {
    if (inst.blockType === "VAR_IN") {
      const varName = (inst.params.name as string) || inst.instanceName;
      const outSlot = inst.outputs.OUT?.slot;
      if (outSlot !== undefined) slotToVar.set(outSlot, varName);
      continue;
    }

    if (inst.blockType === "CONST") {
      const constVal = inst.params.value ?? 0;
      const constType = (inst.params.dataType as ElementaryType) ?? "REAL";
      const varName = `_c_${inst.instanceName}`;
      const outSlot = inst.outputs.OUT?.slot;
      if (outSlot !== undefined) slotToVar.set(outSlot, varName);
      internalVars.push({
        name: `${varName} := ${formatLiteral(constVal, constType)}`,
        type: constType,
        comment: `Constante ${inst.instanceName}`,
      });
      continue;
    }

    if (inst.stateful) {
      fbInstances.push({ name: inst.instanceName, type: inst.blockType });
    }

    // Cria variáveis intermediárias para cada saída do bloco
    for (const [portName, outInfo] of Object.entries(inst.outputs)) {
      const varName = `${inst.instanceName}_${portName}`;
      slotToVar.set(outInfo.slot, varName);
      internalVars.push({ name: varName, type: outInfo.type });
    }
  }

  lines.push("VAR");
  if (fbInstances.length > 0) {
    lines.push("  // Instâncias de Blocos Funcionais (IEC 61131-3)");
    for (const fb of fbInstances) {
      lines.push(`  ${fb.name} : ${fb.type};`);
    }
  }
  if (internalVars.length > 0) {
    lines.push("  // Variáveis internas e sinais de interconexão");
    for (const iv of internalVars) {
      const comment = iv.comment ? ` // ${iv.comment}` : "";
      lines.push(`  ${iv.name} : ${iv.type};${comment}`);
    }
  }
  lines.push("END_VAR");
  lines.push("");

  // 5. Corpo Executável em Ordem Topológica Determinística
  lines.push("  // Lógica de Execução (Ordem Topológica)");
  for (const inst of ir.instructions) {
    if (inst.blockType === "VAR_IN" || inst.blockType === "CONST") {
      continue;
    }

    if (inst.blockType === "VAR_OUT") {
      const targetVar = (inst.params.name as string) || inst.instanceName;
      const inOp = inst.inputs.IN;
      const valStr = inOp ? formatOperand(inOp, slotToVar) : "FALSE";
      lines.push(`  ${targetVar} := ${valStr};`);
      continue;
    }

    // Stateful Function Blocks (TON, TOF, TP, CTU, CTD, CTUD, SR, RS, R_TRIG, F_TRIG)
    if (inst.stateful) {
      const callArgs: string[] = [];
      for (const [paramName, inOp] of Object.entries(inst.inputs)) {
        const expectedType: ElementaryType | undefined = paramName === "PT" ? "TIME" : undefined;
        callArgs.push(`${paramName} := ${formatOperand(inOp, slotToVar, expectedType)}`);
      }
      lines.push(`  ${inst.instanceName}(${callArgs.join(", ")});`);
      for (const [portName, outInfo] of Object.entries(inst.outputs)) {
        const outVar = slotToVar.get(outInfo.slot) ?? `${inst.instanceName}_${portName}`;
        lines.push(`  ${outVar} := ${inst.instanceName}.${portName};`);
      }
      continue;
    }

    // Pure Functions
    const outVar = slotToVar.get(inst.outputs.OUT?.slot ?? -1) ?? `${inst.instanceName}_OUT`;
    const in1 = inst.inputs.IN1 ? formatOperand(inst.inputs.IN1, slotToVar) : "";
    const in2 = inst.inputs.IN2 ? formatOperand(inst.inputs.IN2, slotToVar) : "";
    const inSingle = inst.inputs.IN ? formatOperand(inst.inputs.IN, slotToVar) : "";

    switch (inst.blockType) {
      case "AND":
        lines.push(`  ${outVar} := ${in1 || "FALSE"} AND ${in2 || "FALSE"};`);
        break;
      case "OR":
        lines.push(`  ${outVar} := ${in1 || "FALSE"} OR ${in2 || "FALSE"};`);
        break;
      case "XOR":
        lines.push(`  ${outVar} := ${in1 || "FALSE"} XOR ${in2 || "FALSE"};`);
        break;
      case "NOT":
        lines.push(`  ${outVar} := NOT (${inSingle || "FALSE"});`);
        break;
      case "ADD":
        lines.push(`  ${outVar} := ${in1 || "0"} + ${in2 || "0"};`);
        break;
      case "SUB":
        lines.push(`  ${outVar} := ${in1 || "0"} - ${in2 || "0"};`);
        break;
      case "MUL":
        lines.push(`  ${outVar} := ${in1 || "0"} * ${in2 || "0"};`);
        break;
      case "DIV":
        lines.push(`  ${outVar} := ${in1 || "0"} / ${in2 || "1"};`);
        break;
      case "MOD":
        lines.push(`  ${outVar} := ${in1 || "0"} MOD ${in2 || "1"};`);
        break;
      case "GT":
        lines.push(`  ${outVar} := ${in1 || "0"} > ${in2 || "0"};`);
        break;
      case "GE":
        lines.push(`  ${outVar} := ${in1 || "0"} >= ${in2 || "0"};`);
        break;
      case "LT":
        lines.push(`  ${outVar} := ${in1 || "0"} < ${in2 || "0"};`);
        break;
      case "LE":
        lines.push(`  ${outVar} := ${in1 || "0"} <= ${in2 || "0"};`);
        break;
      case "EQ":
        lines.push(`  ${outVar} := ${in1 || "0"} = ${in2 || "0"};`);
        break;
      case "NE":
        lines.push(`  ${outVar} := ${in1 || "0"} <> ${in2 || "0"};`);
        break;
      case "MOVE":
        lines.push(`  ${outVar} := ${inSingle || "0"};`);
        break;
      case "SEL": {
        const g = inst.inputs.G ? formatOperand(inst.inputs.G, slotToVar) : "FALSE";
        const in0 = inst.inputs.IN0 ? formatOperand(inst.inputs.IN0, slotToVar) : "0";
        lines.push(`  ${outVar} := SEL(${g}, ${in0}, ${in1 || "0"});`);
        break;
      }
      case "LIMIT": {
        const mn = inst.inputs.MN ? formatOperand(inst.inputs.MN, slotToVar) : "0";
        const mx = inst.inputs.MX ? formatOperand(inst.inputs.MX, slotToVar) : "100";
        lines.push(`  ${outVar} := LIMIT(${mn}, ${inSingle || "0"}, ${mx});`);
        break;
      }
      case "ABS":
      case "SQRT":
      case "LN":
      case "LOG":
      case "EXP":
      case "SIN":
      case "COS":
      case "TAN":
        lines.push(`  ${outVar} := ${inst.blockType}(${inSingle || "0"});`);
        break;
      default: {
        const args = Object.entries(inst.inputs)
          .map(([p, op]) => `${p} := ${formatOperand(op, slotToVar)}`)
          .join(", ");
        lines.push(`  ${outVar} := ${inst.blockType}(${args});`);
        break;
      }
    }
  }

  lines.push("END_PROGRAM");
  lines.push("");

  return { code: lines.join("\n"), ok: true, diagnostics: result.diagnostics };
}
