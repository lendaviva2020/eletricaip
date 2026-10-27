// Núcleo PURO do scan-cycle Ladder — IEC 61131-3 compatível.
// Sem dependência de DOM ou store global. Determinístico e testável em ambiente de simulação.
import type {
  LadderCell,
  LadderRung,
  LadderInstruction,
  LadderBranch,
  LadderBranchItem,
  RungTopology,
} from "./types";
import { isOutputKind, isContactKind, isBlockKind, ensureRungTopology } from "./types";

/** Mapa de tags puras consumido pelo scan core (suporta booleanos e numéricos). */
export type PureTags = Record<string, boolean | number | string>;

export interface TimerState {
  accum: number; // ms acumulados
  done: boolean;
  prevIn: boolean;
  lastTick: number;
}

export interface CounterState {
  count: number;
  done: boolean;
  prevIn: boolean;
}

export interface ScanState {
  timers: Map<string, TimerState>;
  counters: Map<string, CounterState>;
  edges: Map<string, boolean>; // Histórico para detecção de borda (R_TRIG, F_TRIG)
}

export const createScanState = (): ScanState => ({
  timers: new Map(),
  counters: new Map(),
  edges: new Map(),
});

const truthy = (v: boolean | number | string | undefined): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
  return Boolean(v);
};

export const readBool = (operand: string, tags: PureTags): boolean => {
  if (!operand) return false;
  return truthy(tags[operand]);
};

export const readNum = (val: string | number | boolean | undefined, tags: PureTags, defaultVal = 0): number => {
  if (val === undefined || val === null || val === "") return defaultVal;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : defaultVal;
  const fromTag = tags[val];
  if (typeof fromTag === "number") return fromTag;
  if (typeof fromTag === "boolean") return fromTag ? 1 : 0;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : defaultVal;
};

const cellKey = (rungId: string, row: number, col: number) => `${rungId}:${row}:${col}`;

// IEC 61131-3 TON (On-Delay):
export const tickTimer = (
  timers: Map<string, TimerState>,
  key: string,
  input: boolean,
  presetMs: number,
  now: number,
): { done: boolean; accum: number } => {
  let st = timers.get(key);
  if (!st) {
    st = { accum: 0, done: false, prevIn: false, lastTick: now };
    timers.set(key, st);
  }
  if (input && !st.prevIn) {
    st.accum = 0;
    st.done = false;
    st.lastTick = now;
  } else if (input) {
    const dt = Math.max(0, now - st.lastTick);
    st.accum += dt;
    st.lastTick = now;
    if (presetMs > 0 && st.accum >= presetMs) {
      st.accum = presetMs;
      st.done = true;
    }
  } else {
    st.accum = 0;
    st.done = false;
    st.lastTick = now;
  }
  st.prevIn = input;
  return { done: st.done, accum: st.accum };
};

// IEC 61131-3 TOF (Off-Delay):
export const tickTOF = (
  timers: Map<string, TimerState>,
  key: string,
  input: boolean,
  presetMs: number,
  now: number,
): { active: boolean; accum: number } => {
  let st = timers.get(key);
  if (!st) {
    st = { accum: 0, done: false, prevIn: false, lastTick: now };
    timers.set(key, st);
  }
  if (input) {
    st.accum = 0;
    st.done = true;
    st.lastTick = now;
  } else if (st.prevIn && !input) {
    st.accum = 0;
    st.done = true;
    st.lastTick = now;
  } else {
    const dt = Math.max(0, now - st.lastTick);
    st.accum += dt;
    st.lastTick = now;
    if (presetMs > 0 && st.accum >= presetMs) {
      st.accum = presetMs;
      st.done = false;
    }
  }
  st.prevIn = input;
  return { active: st.done, accum: st.accum };
};

// IEC 61131-3 TP (Pulse):
export const tickTP = (
  timers: Map<string, TimerState>,
  key: string,
  input: boolean,
  presetMs: number,
  now: number,
): { active: boolean; accum: number } => {
  let st = timers.get(key);
  if (!st) {
    st = { accum: 0, done: false, prevIn: false, lastTick: now };
    timers.set(key, st);
  }
  if (input && !st.prevIn && !st.done && st.accum === 0) {
    st.accum = 0;
    st.done = true;
    st.lastTick = now;
  } else if (st.done) {
    const dt = Math.max(0, now - st.lastTick);
    st.accum += dt;
    st.lastTick = now;
    if (presetMs > 0 && st.accum >= presetMs) {
      st.accum = presetMs;
      st.done = false;
    }
  } else if (!input) {
    st.accum = 0;
    st.lastTick = now;
  }
  st.prevIn = input;
  return { active: st.done, accum: st.accum };
};

// TONR (Retentive On-Delay Timer):
export const tickTONR = (
  timers: Map<string, TimerState>,
  key: string,
  input: boolean,
  reset: boolean,
  presetMs: number,
  now: number,
): { done: boolean; accum: number } => {
  let st = timers.get(key);
  if (!st) {
    st = { accum: 0, done: false, prevIn: false, lastTick: now };
    timers.set(key, st);
  }
  if (reset) {
    st.accum = 0;
    st.done = false;
    st.lastTick = now;
  } else if (input) {
    const dt = Math.max(0, now - st.lastTick);
    st.accum += dt;
    st.lastTick = now;
    if (presetMs > 0 && st.accum >= presetMs) {
      st.accum = presetMs;
      st.done = true;
    }
  } else {
    st.lastTick = now;
  }
  st.prevIn = input;
  return { done: st.done, accum: st.accum };
};

// IEC 61131-3 CTU (Up Counter):
export const tickCounter = (
  counters: Map<string, CounterState>,
  key: string,
  input: boolean,
  reset: boolean,
  preset: number,
): { done: boolean; count: number } => {
  let st = counters.get(key);
  if (!st) {
    st = { count: 0, done: false, prevIn: false };
    counters.set(key, st);
  }
  if (reset) {
    st.count = 0;
    st.done = false;
  } else if (input && !st.prevIn) {
    st.count += 1;
  }
  st.done = preset > 0 && st.count >= preset;
  st.prevIn = input;
  return { done: st.done, count: st.count };
};

// IEC 61131-3 CTD (Down Counter):
export const tickCounterDown = (
  counters: Map<string, CounterState>,
  key: string,
  input: boolean,
  load: boolean,
  preset: number,
): { done: boolean; count: number } => {
  let st = counters.get(key);
  if (!st) {
    st = { count: preset, done: false, prevIn: false };
    counters.set(key, st);
  }
  if (load) {
    st.count = preset;
    st.done = false;
  } else if (input && !st.prevIn) {
    st.count = Math.max(0, st.count - 1);
  }
  st.done = st.count <= 0;
  st.prevIn = input;
  return { done: st.done, count: st.count };
};

export interface DiagnosticItem {
  kind: string;
  value: number;
  preset: number;
  done: boolean;
  text?: string;
}

export interface ScanResult {
  rungId: string;
  poweredOut: boolean;
  perCell: boolean[][];
  /** Per-cell diagnostics for timer/counter/math display */
  diagnostics?: Record<string, DiagnosticItem>;
}

export const LADDER_SCAN_BUDGET_MS = 50;
export const LADDER_MAX_RUNGS = 2000;

export class LadderScanTimeoutError extends Error {
  constructor(
    public readonly processed: number,
    public readonly total: number,
    public readonly elapsedMs: number,
  ) {
    super(
      `Ladder scan excedeu o orçamento de ${LADDER_SCAN_BUDGET_MS}ms ` +
        `(${processed}/${total} rungs em ${elapsedMs.toFixed(1)}ms).`,
    );
    this.name = "LadderScanTimeoutError";
  }
}

/**
 * Avalia uma instrução estrutural individual do Ladder.
 * Retorna se o fluxo de potência (power flow) continua ativo através do elemento.
 */
function evalInstructionNode(
  inst: LadderInstruction,
  incomingPower: boolean,
  tags: PureTags,
  state: ScanState,
  now: number,
  writes: PureTags,
  diagnostics: Record<string, DiagnosticItem>,
  diagKey: string,
): boolean {
  const kind = inst.kind;
  const op = inst.operand || "";
  const params = inst.params ?? {};
  let outPower = false;

  // Contatos, comparadores e blocos matemáticos não conduzem sem energia de entrada
  if (
    !incomingPower &&
    (isContactKind(kind) ||
      kind.startsWith("CMP_") ||
      ["ADD", "SUB", "MUL", "DIV", "MOD", "ABS", "SQRT", "MOVE"].includes(kind))
  ) {
    inst.energized = false;
    return false;
  }

  // 1. Contatos e Bordas
  if (kind === "XIC") {
    outPower = incomingPower && readBool(op, tags);
  } else if (kind === "XIO") {
    outPower = incomingPower && !readBool(op, tags);
  } else if (kind === "R_TRIG") {
    const cur = incomingPower && readBool(op, tags);
    const prev = state.edges.get(inst.id) ?? false;
    state.edges.set(inst.id, cur);
    outPower = cur && !prev;
  } else if (kind === "F_TRIG") {
    const cur = incomingPower && readBool(op, tags);
    const prev = state.edges.get(inst.id) ?? false;
    state.edges.set(inst.id, cur);
    outPower = !cur && prev;
  }
  // 2. Temporizadores
  else if (kind === "TON") {
    const preset = inst.preset ?? Number(params.PT ?? 1000);
    const { done, accum } = tickTimer(state.timers, inst.id, incomingPower, preset, now);
    if (op) writes[op] = done;
    outPower = done;
    diagnostics[diagKey] = {
      kind: "TON",
      value: accum,
      preset,
      done,
      text: `${(accum / 1000).toFixed(1)}s / ${(preset / 1000).toFixed(0)}s`,
    };
  } else if (kind === "TOF") {
    const preset = inst.preset ?? Number(params.PT ?? 1000);
    const { active, accum } = tickTOF(state.timers, inst.id, incomingPower, preset, now);
    if (op) writes[op] = active;
    outPower = active;
    diagnostics[diagKey] = {
      kind: "TOF",
      value: accum,
      preset,
      done: active,
      text: `${(accum / 1000).toFixed(1)}s / ${(preset / 1000).toFixed(0)}s`,
    };
  } else if (kind === "TP") {
    const preset = inst.preset ?? Number(params.PT ?? 500);
    const { active, accum } = tickTP(state.timers, inst.id, incomingPower, preset, now);
    if (op) writes[op] = active;
    outPower = active;
    diagnostics[diagKey] = {
      kind: "TP",
      value: accum,
      preset,
      done: active,
      text: `${(accum / 1000).toFixed(1)}s / ${(preset / 1000).toFixed(0)}s`,
    };
  } else if (kind === "TONR") {
    const preset = inst.preset ?? Number(params.PT ?? 1000);
    const reset = readBool(String(params.R ?? ""), tags);
    const { done, accum } = tickTONR(state.timers, inst.id, incomingPower, reset, preset, now);
    if (op) writes[op] = done;
    outPower = done;
    diagnostics[diagKey] = {
      kind: "TONR",
      value: accum,
      preset,
      done,
      text: `${(accum / 1000).toFixed(1)}s / ${(preset / 1000).toFixed(0)}s`,
    };
  }
  // 3. Contadores
  else if (kind === "CTU") {
    const preset = inst.preset ?? Number(params.PV ?? 10);
    const reset = readBool(String(params.R ?? ""), tags);
    const { done, count } = tickCounter(state.counters, inst.id, incomingPower, reset, preset);
    if (op) writes[op] = done;
    outPower = done;
    diagnostics[diagKey] = {
      kind: "CTU",
      value: count,
      preset,
      done,
      text: `${count} / ${preset}`,
    };
  } else if (kind === "CTD") {
    const preset = inst.preset ?? Number(params.PV ?? 10);
    const load = readBool(String(params.LD ?? ""), tags);
    const { done, count } = tickCounterDown(state.counters, inst.id, incomingPower, load, preset);
    if (op) writes[op] = done;
    outPower = done;
    diagnostics[diagKey] = {
      kind: "CTD",
      value: count,
      preset,
      done,
      text: `${count} / ${preset}`,
    };
  }
  // 4. Comparadores
  else if (kind.startsWith("CMP_")) {
    const in1 = readNum(params.IN1 ?? params.A ?? op, tags);
    const in2 = readNum(params.IN2 ?? params.B, tags);
    let match = false;
    if (kind === "CMP_EQ") match = in1 === in2;
    else if (kind === "CMP_NE") match = in1 !== in2;
    else if (kind === "CMP_GT") match = in1 > in2;
    else if (kind === "CMP_LT") match = in1 < in2;
    else if (kind === "CMP_GE") match = in1 >= in2;
    else if (kind === "CMP_LE") match = in1 <= in2;
    outPower = match;
    diagnostics[diagKey] = {
      kind,
      value: in1,
      preset: in2,
      done: match,
      text: `${in1} vs ${in2}`,
    };
  }
  // 5. Blocos Matemáticos
  else if (["ADD", "SUB", "MUL", "DIV", "MOD", "ABS", "SQRT"].includes(kind)) {
    const in1 = readNum(params.IN1, tags);
    const in2 = readNum(params.IN2, tags);
    let result = 0;
    if (kind === "ADD") result = in1 + in2;
    else if (kind === "SUB") result = in1 - in2;
    else if (kind === "MUL") result = in1 * in2;
    else if (kind === "DIV") result = in2 !== 0 ? in1 / in2 : 0;
    else if (kind === "MOD") result = in2 !== 0 ? in1 % in2 : 0;
    else if (kind === "ABS") result = Math.abs(in1);
    else if (kind === "SQRT") result = in1 >= 0 ? Math.sqrt(in1) : 0;

    const targetOp = String(params.OUT || op);
    if (targetOp) {
      writes[targetOp] = result;
    }
    diagnostics[diagKey] = {
      kind,
      value: result,
      preset: in1,
      done: true,
      text: `= ${result}`,
    };
    outPower = incomingPower; // Bloco matemático repassa ENO
  }
  // 6. Movimentação de Registradores
  else if (kind === "MOVE") {
    const src = readNum(params.IN ?? op, tags);
    const targetOp = String(params.OUT || "");
    if (targetOp) {
      writes[targetOp] = src;
    }
    diagnostics[diagKey] = {
      kind: "MOVE",
      value: src,
      preset: src,
      done: true,
      text: `-> ${src}`,
    };
    outPower = incomingPower;
  }

  inst.energized = outPower;
  return outPower;
}

/**
 * Avalia recursivamente um ramo estrutural (LadderBranch).
 * Séries exigem que todos os nós conduzam (AND).
 * Ramos paralelos conduzem se qualquer um dos caminhos fechar (OR).
 */
function evalBranchRecursive(
  branch: LadderBranch,
  incomingPower: boolean,
  tags: PureTags,
  state: ScanState,
  now: number,
  writes: PureTags,
  diagnostics: Record<string, DiagnosticItem>,
): boolean {
  if (!incomingPower) {
    for (const item of branch.items ?? []) {
      const anyItem = item as any;
      if (anyItem.instruction) {
        anyItem.instruction.energized = false;
      } else if (anyItem.kind) {
        anyItem.energized = false;
      }
      if (anyItem.branches) {
        for (const sub of anyItem.branches) {
          evalBranchRecursive(sub, false, tags, state, now, writes, diagnostics);
        }
      } else if (anyItem.items) {
        evalBranchRecursive(anyItem, false, tags, state, now, writes, diagnostics);
      }
    }
    return false;
  }

  const isParallel = (branch as any).type === "PARALLEL";

  if (isParallel) {
    let anyBranchPower = false;
    for (let i = 0; i < branch.items.length; i++) {
      const item = branch.items[i] as any;
      let itemPower = false;

      if (item.instruction || item.kind) {
        const inst: LadderInstruction = item.instruction ?? item;
        itemPower = evalInstructionNode(
          inst,
          true,
          tags,
          state,
          now,
          writes,
          diagnostics,
          `inst:${inst.id}`,
        );
      } else if (item.branches && item.branches.length > 0) {
        let subAny = false;
        for (const sub of item.branches) {
          const subOn = evalBranchRecursive(sub, true, tags, state, now, writes, diagnostics);
          subAny = subAny || subOn;
        }
        itemPower = subAny;
      } else if (item.items && item.items.length > 0) {
        itemPower = evalBranchRecursive(item, true, tags, state, now, writes, diagnostics);
      }
      anyBranchPower = anyBranchPower || itemPower;
    }
    return anyBranchPower;
  } else {
    let power = true;
    for (let i = 0; i < branch.items.length; i++) {
      const item = branch.items[i] as any;

      if (item.instruction || item.kind) {
        const inst: LadderInstruction = item.instruction ?? item;
        power = evalInstructionNode(
          inst,
          power,
          tags,
          state,
          now,
          writes,
          diagnostics,
          `inst:${inst.id}`,
        );
      } else if (item.branches && item.branches.length > 0) {
        if (!power) {
          for (const sub of item.branches) {
            evalBranchRecursive(sub, false, tags, state, now, writes, diagnostics);
          }
        } else {
          let anySubPower = false;
          for (const sub of item.branches) {
            const subOn = evalBranchRecursive(sub, power, tags, state, now, writes, diagnostics);
            anySubPower = anySubPower || subOn;
          }
          power = anySubPower;
        }
      } else if (item.type === "PARALLEL" || (item.items && item.type === "PARALLEL")) {
        if (!power) {
          evalBranchRecursive(item, false, tags, state, now, writes, diagnostics);
        } else {
          power = evalBranchRecursive(item, power, tags, state, now, writes, diagnostics);
        }
      }
    }
    return power;
  }
}

/**
 * Avalia as bobinas de saída de uma rede (suportando múltiplas saídas em paralelo).
 */
function evalRungOutputs(
  outputs: LadderInstruction[],
  power: boolean,
  tags: PureTags,
  state: ScanState,
  now: number,
  writes: PureTags,
  diagnostics: Record<string, DiagnosticItem>,
) {
  for (const out of outputs) {
    out.energized = power;
    const kind = out.kind;
    const op = out.operand;
    if (!op) continue;

    if (kind === "OTE") {
      writes[op] = power;
    } else if (kind === "OTL" && power) {
      writes[op] = true;
    } else if (kind === "OTU" && power) {
      writes[op] = false;
    } else if (kind === "NEG_COIL") {
      writes[op] = !power;
    } else if (kind === "SR") {
      if (power) writes[op] = true;
    } else if (kind === "TON" || kind === "TOF" || kind === "TP" || kind === "CTU" || kind === "CTD") {
      evalInstructionNode(out, power, tags, state, now, writes, diagnostics, `out:${out.id}`);
    }
  }
}

/**
 * Avalia uma linha de matriz legada (para rungs sem topologia explícita).
 */
const evalLegacyRow = (row: LadderCell[], tags: PureTags): boolean => {
  let result = true;
  let any = false;
  for (let i = 0; i < row.length - 1; i++) {
    const c = row[i];
    if (c.kind === "EMPTY") continue;
    any = true;
    const v = readBool(c.operand, tags);
    const pass = c.kind === "XIC" ? v : c.kind === "XIO" ? !v : true;
    result = result && pass;
    if (!result) break;
  }
  return any ? result : false;
};

/**
 * Núcleo puro do scan-cycle. Sem store, sem clock global.
 * Retorna os resultados de energização e o novo mapa de tags com saídas atualizadas.
 */
export function scanRungsPure(
  rungs: LadderRung[],
  tags: PureTags,
  state: ScanState,
  now: number,
): { results: ScanResult[]; tags: PureTags } {
  const results: ScanResult[] = [];
  const writes: PureTags = {};

  for (let idx = 0; idx < rungs.length; idx++) {
    const rung = rungs[idx];
    const diagnostics: Record<string, DiagnosticItem> = {};
    const topology = ensureRungTopology(rung);

    // 1. Avaliação Estrutural da Topologia Real
    const poweredOut = evalBranchRecursive(
      topology.rootBranch,
      true, // Trilho esquerdo sempre fornece energia
      tags,
      state,
      now,
      writes,
      diagnostics,
    );

    // 2. Avaliação de Todas as Saídas em Paralelo
    evalRungOutputs(topology.outputs, poweredOut, tags, state, now, writes, diagnostics);
    rung.poweredOut = poweredOut;

    // 3. Projeção na Matriz perCell para Retrocompatibilidade Visual
    const perCell: boolean[][] = [];
    for (let ri = 0; ri < rung.cells.length; ri++) {
      const row = rung.cells[ri];
      const rowOn = evalLegacyRow(row, tags) || poweredOut;
      perCell.push(
        row.map((c, i) =>
          i === row.length - 1
            ? poweredOut
            : c.kind === "EMPTY"
              ? rowOn
              : c.kind === "XIC"
                ? readBool(c.operand, tags)
                : c.kind === "XIO"
                  ? !readBool(c.operand, tags)
                  : poweredOut,
        ),
      );
    }

    results.push({
      rungId: rung.id,
      poweredOut,
      perCell,
      diagnostics,
    });
  }

  return { results, tags: { ...tags, ...writes } };
}
