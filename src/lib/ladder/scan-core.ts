// Núcleo PURO do scan-cycle Ladder — sem store, sem clock global, sem DOM.
// Testável isoladamente e reutilizável no servidor (verificação por simulação).
import type { LadderCell, LadderRung } from "./types";
import { isOutputKind } from "./types";

/** Pure tag map consumed by the scan core. */
export type PureTags = Record<string, boolean | number>;

export interface TimerState {
  accum: number; // ms accumulated
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
}

export const createScanState = (): ScanState => ({ timers: new Map(), counters: new Map() });

const truthy = (v: boolean | number | undefined): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return Boolean(v);
};

const readBool = (operand: string, tags: PureTags): boolean => {
  if (!operand) return false;
  return truthy(tags[operand]);
};

const evalContact = (cell: LadderCell, tags: PureTags): boolean => {
  const v = readBool(cell.operand, tags);
  if (cell.kind === "XIC") return v;
  if (cell.kind === "XIO") return !v;
  return true;
};

const evalRow = (row: LadderCell[], tags: PureTags): boolean => {
  let result = true;
  let any = false;
  for (let i = 0; i < row.length - 1; i++) {
    const c = row[i];
    if (c.kind === "EMPTY") continue;
    any = true;
    result = result && evalContact(c, tags);
    if (!result) break;
  }
  return any ? result : false;
};

const cellKey = (rungId: string, row: number, col: number) => `${rungId}:${row}:${col}`;

// IEC 61131-3 TON:
//   IN ↑ (rising edge): ET starts from 0, DN=false, begins accumulating elapsed time.
//   IN held true:       ET += dt; when ET >= PT → ET clamped to PT, DN=true.
//   IN ↓ (falling/EN false): ET=0, DN=false (immediate reset).
const tickTimer = (
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

// IEC 61131-3 TOF: OUT is TRUE while IN is TRUE; on IN falling edge starts
// timing, OUT remains TRUE until ET>=PT, then OUT=FALSE.
const tickTOF = (
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

// IEC 61131-3 TP: rising edge fires a pulse of PT duration; OUT is held
// regardless of IN until ET>=PT. Re-armable only after IN goes false.
const tickTP = (
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

// IEC 61131-3 CTU.
const tickCounter = (
  counters: Map<string, CounterState>,
  key: string,
  input: boolean,
  preset: number,
): { done: boolean; count: number } => {
  let st = counters.get(key);
  if (!st) {
    st = { count: 0, done: false, prevIn: false };
    counters.set(key, st);
  }
  if (input && !st.prevIn) {
    st.count += 1;
  }
  st.done = preset > 0 && st.count >= preset;
  st.prevIn = input;
  return { done: st.done, count: st.count };
};

export interface ScanResult {
  rungId: string;
  poweredOut: boolean;
  perCell: boolean[][];
  /** Per-cell diagnostics for timer/counter display */
  diagnostics?: Record<
    string,
    { kind: "TON" | "TOF" | "TP" | "CTU"; value: number; preset: number; done: boolean }
  >;
}

/** Orçamento (ms) por scan-cycle: aborta com aviso se exceder, evitando
 *  travar o thread principal com programas Ladder maliciosos ou muito grandes. */
export const LADDER_SCAN_BUDGET_MS = 50;
/** Limite duro de rungs por scan — defesa em profundidade contra inputs absurdos. */
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
 * Núcleo puro do scan-cycle. Sem store, sem clock global.
 * Contatos são avaliados sempre contra o snapshot `tags` recebido (writes de saída
 * NÃO são visíveis para rungs do mesmo scan — comportamento idêntico ao editor).
 * Retorna os resultados e o novo mapa de tags (snapshot + saídas escritas).
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
    const perCell: boolean[][] = [];
    const diagnostics: Record<
      string,
      { kind: "TON" | "TOF" | "TP" | "CTU"; value: number; preset: number; done: boolean }
    > = {};
    let powered = false;

    for (let ri = 0; ri < rung.cells.length; ri++) {
      const row = rung.cells[ri];
      const rowOn = evalRow(row, tags);
      powered = powered || rowOn;
      perCell.push(
        row.map((c, i) =>
          i === row.length - 1 ? powered : c.kind === "EMPTY" ? rowOn : evalContact(c, tags),
        ),
      );
    }

    // Output cell lives in row 0, last column. Its input = rung power.
    const outRow = rung.cells[0] ?? [];
    const outCol = outRow.length - 1;
    const outCell = outRow[outCol];
    if (outCell && isOutputKind(outCell.kind) && outCell.operand) {
      const key = cellKey(rung.id, 0, outCol);
      const preset = outCell.preset ?? 0;

      if (outCell.kind === "OTE") {
        writes[outCell.operand] = powered;
      } else if (outCell.kind === "OTL" && powered) {
        writes[outCell.operand] = true;
      } else if (outCell.kind === "OTU" && powered) {
        writes[outCell.operand] = false;
      } else if (outCell.kind === "TON") {
        const { done, accum } = tickTimer(state.timers, key, powered, preset, now);
        writes[outCell.operand] = done;
        diagnostics[`0:${outCol}`] = { kind: "TON", value: accum, preset, done };
        perCell[0][outCol] = done;
      } else if (outCell.kind === "TOF") {
        const { active, accum } = tickTOF(state.timers, key, powered, preset, now);
        writes[outCell.operand] = active;
        diagnostics[`0:${outCol}`] = { kind: "TOF", value: accum, preset, done: active };
        perCell[0][outCol] = active;
      } else if (outCell.kind === "TP") {
        const { active, accum } = tickTP(state.timers, key, powered, preset, now);
        writes[outCell.operand] = active;
        diagnostics[`0:${outCol}`] = { kind: "TP", value: accum, preset, done: active };
        perCell[0][outCol] = active;
      } else if (outCell.kind === "CTU") {
        const { done, count } = tickCounter(state.counters, key, powered, preset);
        writes[outCell.operand] = done;
        diagnostics[`0:${outCol}`] = { kind: "CTU", value: count, preset, done };
        perCell[0][outCol] = done;
      }
    }

    results.push({ rungId: rung.id, poweredOut: powered, perCell, diagnostics });
  }

  return { results, tags: { ...tags, ...writes } };
}

