// #LAD-04 — Importador de programas IL/ST externos → LadderRung[].
//
// Escopo consciente:
// - Roundtrip garantido contra compileProgram (mesmos padrões que emitimos).
// - Variantes comuns: expressões AND/OR/NOT com parênteses, TRUE/FALSE,
//   TON/TOF/TP (T#<n>ms), CTU (PV := <n>), IF ... THEN X := TRUE/FALSE.
// - Cada linha lógica vira 1 rung. Comentários `// texto` acima da linha
//   viram o `label` do rung.
// - Erros de parse retornam { rungs: [...], warnings: [...] }; o chamador
//   decide se aceita parcial ou aborta.
//
// Fora de escopo (documentado): FBs custom, arrays, structs, JMP/LBL, MCR.
// Estruturas não reconhecidas viram warning + rung vazio para preservar
// contagem.

import type { LadderCell, LadderCellKind, LadderRung } from "./types";
import { RUNG_COLS, emptyCell } from "./types";

export interface ImportResult {
  rungs: LadderRung[];
  warnings: string[];
}

interface Line {
  raw: string;
  index: number; // linha no fonte original (1-based)
  label?: string; // comentário imediatamente anterior
}

function stripComments(src: string): { code: string; labelMap: Map<number, string> } {
  // Mantém comentários `// ...` como labels da PRÓXIMA linha lógica.
  // Remove `(* ... *)` block comments completamente.
  const noBlock = src.replace(/\(\*[\s\S]*?\*\)/g, "");
  const lines = noBlock.split(/\r?\n/);
  const out: string[] = [];
  const labelMap = new Map<number, string>();
  let pendingLabel: string | undefined;
  for (const line of lines) {
    const commentIdx = line.indexOf("//");
    const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const comment = commentIdx >= 0 ? line.slice(commentIdx + 2).trim() : "";
    if (codePart.trim().length === 0) {
      if (comment.length > 0) pendingLabel = comment;
      out.push("");
      continue;
    }
    if (pendingLabel !== undefined) {
      labelMap.set(out.length, pendingLabel);
      pendingLabel = undefined;
    }
    out.push(codePart);
  }
  return { code: out.join("\n"), labelMap };
}

/** Divide em statements por `;` (ST) ou por linha (IL). */
function splitStStatements(code: string, labelMap: Map<number, string>): Line[] {
  // Percorre caractere-a-caractere para saber em qual linha cada `;` está.
  const stmts: Line[] = [];
  let buf = "";
  let startLine = 1;
  let line = 1;
  let depthParen = 0;
  let insideIf = false;
  const flushStmt = (endLine: number) => {
    const raw = buf.trim();
    buf = "";
    if (!raw) return;
    // startLine → 0-based index no output das linhas non-empty; aproximamos
    // pela linha original (labelMap chave é o índice de linha do array `out`).
    const label = labelMap.get(startLine - 1) ?? labelMap.get(startLine - 2);
    stmts.push({ raw, index: endLine, label });
  };
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "\n") {
      line += 1;
      if (buf.trim() === "") startLine = line;
      buf += " ";
      continue;
    }
    if (c === "(") depthParen += 1;
    else if (c === ")") depthParen = Math.max(0, depthParen - 1);
    // Detecta bloco IF ... END_IF; para não fatiar no `;` interno.
    const upper = buf.toUpperCase();
    if (!insideIf && /\bIF\b\s*$/.test(upper + c.toUpperCase())) {
      // heurística: entra em IF quando encontra "IF " (com espaço subsequente)
    }
    if (/\bIF\b/.test((buf + c).toUpperCase()) && !insideIf && /\bIF\s/.test((buf + c).toUpperCase())) {
      insideIf = true;
    }
    if (insideIf && /\bEND_IF\b\s*;?\s*$/i.test(buf + c)) {
      // fecha no próximo ; após END_IF
    }
    buf += c;
    if (c === ";" && depthParen === 0) {
      if (insideIf) {
        // Fecha statement apenas quando END_IF ; aparece
        if (/END_IF\s*;\s*$/i.test(buf)) {
          insideIf = false;
          flushStmt(line);
          startLine = line + 1;
        }
      } else {
        flushStmt(line);
        startLine = line + 1;
      }
    }
  }
  const tail = buf.trim();
  if (tail) stmts.push({ raw: tail, index: line, label: labelMap.get(startLine - 1) });
  return stmts;
}

// ---------- Expressão booleana → cells em série/paralelo ----------

interface Branch {
  cells: LadderCell[]; // terms (XIC/XIO), sem contar coluna de saída
}

function parseTerm(text: string): LadderCell {
  const s = text.trim().replace(/^\((.*)\)$/s, "$1").trim();
  if (/^NOT\s+/i.test(s)) {
    const op = s.replace(/^NOT\s+/i, "").trim().replace(/^\((.*)\)$/s, "$1").trim();
    return { kind: "XIO", operand: op };
  }
  return { kind: "XIC", operand: s };
}

/** Divide `expr` no operador top-level (respeita parênteses). Retorna null se não houver. */
function splitTopLevel(expr: string, op: "OR" | "AND"): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  const re = new RegExp(`^\\s*${op}\\s+`, "i");
  const s = expr;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    if (depth === 0) {
      const rest = s.slice(i);
      const m = rest.match(new RegExp(`^\\s+${op}\\s+`, "i"));
      if (m) {
        parts.push(buf);
        buf = "";
        i += m[0].length - 1;
        continue;
      }
    }
    buf += c;
    void re;
  }
  parts.push(buf);
  return parts.length > 1 ? parts.map((p) => p.trim()) : null;
}

/** Faz o parse de uma expressão booleana em branches (OR) de terms (AND). */
function parseBoolExpr(expr: string): Branch[] {
  const trimmed = expr.trim().replace(/^\((.*)\)$/s, "$1").trim();
  if (/^TRUE$/i.test(trimmed)) {
    return [{ cells: [{ kind: "XIC", operand: "TRUE" }] }];
  }
  if (/^FALSE$/i.test(trimmed)) {
    return [{ cells: [] }]; // rung vazio ≡ FALSE
  }
  const orParts = splitTopLevel(trimmed, "OR");
  if (orParts) {
    return orParts.flatMap((p) => parseBoolExpr(p));
  }
  const andParts = splitTopLevel(trimmed, "AND");
  if (andParts) {
    return [{ cells: andParts.map(parseTerm) }];
  }
  return [{ cells: [parseTerm(trimmed)] }];
}

// ---------- Statement ST → LadderRung ----------

function padRow(cells: LadderCell[], output: LadderCell): LadderCell[] {
  const row = Array.from({ length: RUNG_COLS }, emptyCell);
  const seriesSlots = RUNG_COLS - 1;
  for (let i = 0; i < Math.min(cells.length, seriesSlots); i++) row[i] = cells[i];
  row[RUNG_COLS - 1] = output;
  return row;
}

function padExtraBranch(cells: LadderCell[]): LadderCell[] {
  const row = Array.from({ length: RUNG_COLS }, emptyCell);
  const seriesSlots = RUNG_COLS - 1;
  for (let i = 0; i < Math.min(cells.length, seriesSlots); i++) row[i] = cells[i];
  return row;
}

function buildRung(
  id: string,
  label: string,
  branches: Branch[],
  output: LadderCell,
): LadderRung {
  const rows: LadderCell[][] = [];
  const [first, ...rest] = branches;
  rows.push(padRow(first?.cells ?? [], output));
  for (const b of rest) rows.push(padExtraBranch(b.cells));
  return { id, label, cells: rows };
}

const TIMER_KINDS: Record<string, LadderCellKind> = { TON: "TON", TOF: "TOF", TP: "TP" };

function parseTimeMs(txt: string): number {
  // T#500ms / T#1s / T#2m1s
  const m = txt.match(/T#([0-9]+)(ms|s|m)?/i);
  if (!m) return Number.parseInt(txt, 10) || 0;
  const n = Number.parseInt(m[1], 10);
  const unit = (m[2] ?? "ms").toLowerCase();
  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60_000;
  return n;
}

function parseStStatement(stmt: string): {
  branches: Branch[];
  output: LadderCell;
} | null {
  const s = stmt.trim().replace(/;\s*$/, "");

  // TIMERS: X(IN := expr, PT := T#Nms)
  const timerMatch = s.match(
    /^([A-Za-z_%][\w.]*)(?:_(TOF|TP))?\s*\(\s*IN\s*:=\s*([\s\S]+?)\s*,\s*PT\s*:=\s*(T#[0-9]+(?:ms|s|m)?)\s*\)\s*(?:;\s*([A-Za-z_%][\w.]*)\s*:=\s*[A-Za-z_%][\w.]*\.(?:Q|OUT))?$/i,
  );
  if (timerMatch) {
    const [, name, altKind, expr, timeText] = timerMatch;
    const kind: LadderCellKind = altKind ? TIMER_KINDS[altKind.toUpperCase()] ?? "TON" : "TON";
    const preset = parseTimeMs(timeText);
    const branches = parseBoolExpr(expr);
    return { branches, output: { kind, operand: name, preset } };
  }

  // COUNTER: X(CU := expr, PV := N)
  const ctuMatch = s.match(
    /^([A-Za-z_%][\w.]*)\s*\(\s*CU\s*:=\s*([\s\S]+?)\s*,\s*PV\s*:=\s*([0-9]+)\s*\)$/i,
  );
  if (ctuMatch) {
    const [, name, expr, pv] = ctuMatch;
    return {
      branches: parseBoolExpr(expr),
      output: { kind: "CTU", operand: name, preset: Number.parseInt(pv, 10) },
    };
  }

  // IF expr THEN X := TRUE|FALSE; END_IF
  const ifMatch = s.match(
    /^IF\s+([\s\S]+?)\s+THEN\s+([A-Za-z_%][\w.]*)\s*:=\s*(TRUE|FALSE)\s*;\s*END_IF$/i,
  );
  if (ifMatch) {
    const [, expr, name, val] = ifMatch;
    const kind: LadderCellKind = /^TRUE$/i.test(val) ? "OTL" : "OTU";
    return { branches: parseBoolExpr(expr), output: { kind, operand: name } };
  }

  // Simple assign: X := expr;
  const assignMatch = s.match(/^([A-Za-z_%][\w.]*)\s*:=\s*([\s\S]+)$/);
  if (assignMatch) {
    const [, name, expr] = assignMatch;
    return { branches: parseBoolExpr(expr), output: { kind: "OTE", operand: name } };
  }

  return null;
}

export function parseStProgram(src: string): ImportResult {
  const { code, labelMap } = stripComments(src);
  const stmts = splitStStatements(code, labelMap);
  const rungs: LadderRung[] = [];
  const warnings: string[] = [];
  stmts.forEach((s, i) => {
    const parsed = parseStStatement(s.raw);
    const id = `rung-import-${Date.now()}-${i}`;
    const label = s.label ?? `Rung ${i + 1}`;
    if (!parsed) {
      warnings.push(`Linha ${s.index}: não reconhecida — "${s.raw.slice(0, 60)}"`);
      rungs.push({
        id,
        label,
        cells: [Array.from({ length: RUNG_COLS }, emptyCell)],
      });
      return;
    }
    rungs.push(buildRung(id, label, parsed.branches, parsed.output));
  });
  return { rungs, warnings };
}

// ---------- IL ----------
//
// Reconhece o dialeto que emitimos:
//   LD  <expr>
//   ST  <op>           → OTE
//   S   <op>           → OTL
//   R   <op>           → OTU
//   CAL <op>(IN := %MX, PT := T#500ms) [(* TOF *) | (* TP *)]
//   CAL <op>(CU := %MX, PV := 10)
//
// Como o IL emitido usa `%MX` no CAL, precisamos capturar o expr do LD
// imediatamente anterior para popular as branches.

function parseIlBlock(lines: string[]): { branches: Branch[]; output: LadderCell } | null {
  let ld: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith("LD ")) {
      ld = line.slice(3).trim();
      continue;
    }
    const branches = parseBoolExpr(ld ?? "FALSE");
    if (upper.startsWith("ST ")) {
      return { branches, output: { kind: "OTE", operand: line.slice(3).trim() } };
    }
    if (upper.startsWith("S ") || upper.startsWith("S\t")) {
      return { branches, output: { kind: "OTL", operand: line.slice(2).trim() } };
    }
    if (upper.startsWith("R ") || upper.startsWith("R\t")) {
      return { branches, output: { kind: "OTU", operand: line.slice(2).trim() } };
    }
    if (upper.startsWith("CAL ")) {
      const body = line.slice(4).trim();
      const tof = /\(\*\s*TOF\s*\*\)/i.test(raw);
      const tp = /\(\*\s*TP\s*\*\)/i.test(raw);
      const timer = body.match(
        /^([A-Za-z_%][\w.]*)\s*\(\s*IN\s*:=\s*[^,]+,\s*PT\s*:=\s*(T#[0-9]+(?:ms|s|m)?)\s*\)/i,
      );
      if (timer) {
        const kind: LadderCellKind = tof ? "TOF" : tp ? "TP" : "TON";
        return {
          branches,
          output: { kind, operand: timer[1], preset: parseTimeMs(timer[2]) },
        };
      }
      const ctu = body.match(
        /^([A-Za-z_%][\w.]*)\s*\(\s*CU\s*:=\s*[^,]+,\s*PV\s*:=\s*([0-9]+)\s*\)/i,
      );
      if (ctu) {
        return {
          branches,
          output: {
            kind: "CTU",
            operand: ctu[1],
            preset: Number.parseInt(ctu[2], 10),
          },
        };
      }
    }
  }
  return null;
}

export function parseIlProgram(src: string): ImportResult {
  // Blocos separados por linha em branco OU por linha de comentário `//`
  const rawLines = src.split(/\r?\n/);
  const blocks: { lines: string[]; label?: string; index: number }[] = [];
  let pendingLabel: string | undefined;
  let current: string[] = [];
  let blockStart = 1;
  rawLines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//")) {
      if (current.length > 0) {
        blocks.push({ lines: current, label: pendingLabel, index: blockStart });
        current = [];
      }
      pendingLabel = trimmed.replace(/^\/\/\s*/, "");
      blockStart = idx + 2;
      return;
    }
    if (trimmed === "") {
      if (current.length > 0) {
        blocks.push({ lines: current, label: pendingLabel, index: blockStart });
        current = [];
        pendingLabel = undefined;
      }
      blockStart = idx + 2;
      return;
    }
    if (current.length === 0) blockStart = idx + 1;
    current.push(line);
  });
  if (current.length > 0) {
    blocks.push({ lines: current, label: pendingLabel, index: blockStart });
  }

  const rungs: LadderRung[] = [];
  const warnings: string[] = [];
  blocks.forEach((b, i) => {
    const id = `rung-import-${Date.now()}-${i}`;
    const label = b.label ?? `Rung ${i + 1}`;
    const parsed = parseIlBlock(b.lines);
    if (!parsed) {
      warnings.push(`Bloco na linha ${b.index}: IL não reconhecido`);
      rungs.push({ id, label, cells: [Array.from({ length: RUNG_COLS }, emptyCell)] });
      return;
    }
    rungs.push(buildRung(id, label, parsed.branches, parsed.output));
  });
  return { rungs, warnings };
}

/** Detecta o dialeto: IL se detectarmos linhas `LD `/`ST ` em maioria, senão ST. */
export function detectFormat(src: string): "ST" | "IL" {
  const lines = src
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("(*"));
  if (lines.length === 0) return "ST";
  const ilLike = lines.filter((l) => /^(LD|ST|S|R|CAL|AND|OR|JMP)\s/i.test(l)).length;
  return ilLike > lines.length / 2 ? "IL" : "ST";
}

export function importLadderProgram(src: string, format?: "ST" | "IL"): ImportResult {
  const fmt = format ?? detectFormat(src);
  return fmt === "IL" ? parseIlProgram(src) : parseStProgram(src);
}
