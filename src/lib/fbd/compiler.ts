import type { FbdBlock, FbdConnection } from "./types";
import { BLOCK_DEFINITIONS } from "./types";

function findBlockDef(kind: string) {
  return BLOCK_DEFINITIONS.find((d) => d.kind === kind);
}

function compileBlock(block: FbdBlock, connections: FbdConnection[], indent: string): string[] {
  const def = findBlockDef(block.kind);
  if (!def) return [`${indent}// ${block.label}: unknown block type ${block.kind}`];

  const lines: string[] = [];
  const outputVar = `${block.label}_OUT`;

  switch (block.kind) {
    case "AND": {
      const in1 = findConnectedPin(block, "IN1", connections) || "FALSE";
      const in2 = findConnectedPin(block, "IN2", connections) || "FALSE";
      lines.push(`${indent}${outputVar} := ${in1} AND ${in2};`);
      break;
    }
    case "OR": {
      const in1 = findConnectedPin(block, "IN1", connections) || "FALSE";
      const in2 = findConnectedPin(block, "IN2", connections) || "FALSE";
      lines.push(`${indent}${outputVar} := ${in1} OR ${in2};`);
      break;
    }
    case "NOT": {
      const in1 = findConnectedPin(block, "IN", connections) || "FALSE";
      lines.push(`${indent}${outputVar} := NOT ${in1};`);
      break;
    }
    case "XOR": {
      const in1 = findConnectedPin(block, "IN1", connections) || "FALSE";
      const in2 = findConnectedPin(block, "IN2", connections) || "FALSE";
      lines.push(`${indent}${outputVar} := ${in1} XOR ${in2};`);
      break;
    }
    case "SR": {
      const s = findConnectedPin(block, "S", connections) || "FALSE";
      const r = findConnectedPin(block, "R", connections) || "FALSE";
      lines.push(`${indent}IF ${s} THEN ${outputVar} := TRUE; END_IF;`);
      lines.push(`${indent}IF ${r} THEN ${outputVar} := FALSE; END_IF;`);
      break;
    }
    case "RS": {
      const s = findConnectedPin(block, "S", connections) || "FALSE";
      const r = findConnectedPin(block, "R", connections) || "FALSE";
      lines.push(`${indent}IF ${r} THEN ${outputVar} := FALSE; END_IF;`);
      lines.push(`${indent}IF ${s} THEN ${outputVar} := TRUE; END_IF;`);
      break;
    }
    case "TON": {
      const ena = findConnectedPin(block, "IN", connections) || "FALSE";
      const pt = block.params.preset_ms ?? 1000;
      lines.push(
        `${indent}${block.label}_TON(IN := ${ena}, PT := T#${pt}MS, Q => ${outputVar}, ET => ${block.label}_ET);`,
      );
      break;
    }
    case "CTU": {
      const cu = findConnectedPin(block, "CU", connections) || "FALSE";
      const r = findConnectedPin(block, "R", connections) || "FALSE";
      const pv = block.params.preset ?? 10;
      lines.push(
        `${indent}${block.label}_CTU(CU := ${cu}, R := ${r}, PV := ${pv}, Q => ${outputVar}, CV => ${block.label}_CV);`,
      );
      break;
    }
    case "ADD":
    case "SUB":
    case "MUL":
    case "DIV": {
      const in1 = findConnectedPin(block, "IN1", connections) || "0";
      const in2 = findConnectedPin(block, "IN2", connections) || "0";
      const op = { ADD: "+", SUB: "-", MUL: "*", DIV: "/" }[block.kind];
      lines.push(`${indent}${outputVar} := ${in1} ${op} ${in2};`);
      break;
    }
    case "TOF": {
      const ena = findConnectedPin(block, "IN", connections) || "FALSE";
      const pt = block.params.preset_ms ?? 1000;
      lines.push(
        `${indent}${block.label}_TOF(IN := ${ena}, PT := T#${pt}MS, Q => ${outputVar}, ET => ${block.label}_ET);`,
      );
      break;
    }
    case "TP": {
      const ena = findConnectedPin(block, "IN", connections) || "FALSE";
      const pt = block.params.preset_ms ?? 1000;
      lines.push(
        `${indent}${block.label}_TP(IN := ${ena}, PT := T#${pt}MS, Q => ${outputVar}, ET => ${block.label}_ET);`,
      );
      break;
    }
    case "CTD": {
      const cd = findConnectedPin(block, "CD", connections) || "FALSE";
      const ld = findConnectedPin(block, "LD", connections) || "FALSE";
      const pv = block.params.preset ?? 10;
      lines.push(
        `${indent}${block.label}_CTD(CD := ${cd}, LD := ${ld}, PV := ${pv}, Q => ${outputVar}, CV => ${block.label}_CV);`,
      );
      break;
    }
    case "GE": {
      const a = findConnectedPin(block, "IN1", connections) || "0";
      const b = findConnectedPin(block, "IN2", connections) || "0";
      lines.push(`${indent}${outputVar} := ${a} >= ${b};`);
      break;
    }
    case "LE": {
      const a = findConnectedPin(block, "IN1", connections) || "0";
      const b = findConnectedPin(block, "IN2", connections) || "0";
      lines.push(`${indent}${outputVar} := ${a} <= ${b};`);
      break;
    }
    case "NE": {
      const a = findConnectedPin(block, "IN1", connections) || "0";
      const b = findConnectedPin(block, "IN2", connections) || "0";
      lines.push(`${indent}${outputVar} := ${a} <> ${b};`);
      break;
    }
    case "MOVE": {
      const en = findConnectedPin(block, "EN", connections) || "FALSE";
      const inv = findConnectedPin(block, "IN", connections) || "0";
      lines.push(`${indent}IF ${en} THEN ${outputVar} := ${inv}; END_IF;`);
      break;
    }
    case "SEL": {
      const g = findConnectedPin(block, "G", connections) || "FALSE";
      const a = findConnectedPin(block, "IN1", connections) || "0";
      const b = findConnectedPin(block, "IN2", connections) || "0";
      lines.push(`${indent}${outputVar} := SEL(${g}, ${a}, ${b});`);
      break;
    }
    case "GT": {
      const a = findConnectedPin(block, "IN1", connections) || "0";
      const b = findConnectedPin(block, "IN2", connections) || "0";
      lines.push(`${indent}${outputVar} := ${a} > ${b};`);
      break;
    }
    case "LT": {
      const a = findConnectedPin(block, "IN1", connections) || "0";
      const b = findConnectedPin(block, "IN2", connections) || "0";
      lines.push(`${indent}${outputVar} := ${a} < ${b};`);
      break;
    }
    case "EQ": {
      const a = findConnectedPin(block, "IN1", connections) || "0";
      const b = findConnectedPin(block, "IN2", connections) || "0";
      lines.push(`${indent}${outputVar} := ${a} = ${b};`);
      break;
    }
    default:
      lines.push(`${indent}// ${block.label}: ${block.kind} (not compiled)`);
  }

  return lines;
}

function findConnectedPin(
  block: FbdBlock,
  pinLabel: string,
  connections: FbdConnection[],
): string | null {
  const pin = block.pins.find((p) => p.label === pinLabel);
  if (!pin) return null;
  const conn = connections.find((c) => c.targetPin === pin.id);
  if (!conn) return null;
  const [srcBlockId, ...rest] = conn.sourcePin.split(".");
  const srcPinLabel = rest.join(".");
  if (srcPinLabel === "OUT" || srcPinLabel === "Q" || srcPinLabel === "CV") {
    const blockLabel = srcBlockId;
    return `${blockLabel}.${srcPinLabel}`;
  }
  return `${srcBlockId}.${srcPinLabel}`;
}

export function compileFbdToSt(blocks: FbdBlock[], connections: FbdConnection[]): string {
  const header = `// FBD compiled to IEC 61131-3 Structured Text
// Generated by EletricAI FBD Compiler
// Blocks: ${blocks.length}  Connections: ${connections.length}

`;
  const body = blocks
    .map((b) => compileBlock(b, connections, "  "))
    .flat()
    .join("\n");

  return header + body;
}

export function compileFbdToIL(blocks: FbdBlock[], connections: FbdConnection[]): string {
  const lines: string[] = [
    `// FBD → IL (IEC 61131-3 Instruction List)
`,
  ];
  for (const block of blocks) {
    const def = findBlockDef(block.kind);
    lines.push(`  // ${block.label} (${block.kind})`);
    const inPins = block.pins.filter((p) => p.direction === "input");
    for (const pin of inPins) {
      const conn = connections.find((c) => c.targetPin === pin.id);
      if (conn) {
        const [srcBlock] = conn.sourcePin.split(".");
        lines.push(`  LD  ${srcBlock}.OUT`);
      } else {
        lines.push(`  LD  FALSE`);
      }
    }
    if (block.kind === "AND") lines.push("  AND");
    else if (block.kind === "OR") lines.push("  OR");
    else if (block.kind === "NOT") lines.push("  NOT");
    else if (block.kind === "XOR") lines.push("  XOR");
    else lines.push(`  // ${block.kind} operation`);
    lines.push(`  ST  ${block.label}_OUT`);
    lines.push("");
  }
  return lines.join("\n");
}
