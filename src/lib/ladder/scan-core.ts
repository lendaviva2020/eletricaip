// Núcleo PURO do scan-cycle Ladder — IEC 61131-3 compatível.
// Sem dependência de DOM ou store global. Determinístico e testável em ambiente de simulação.
import type {
  LadderCell,
  LadderRung,
  LadderInstruction,
  LadderBranch,
  LadderBranchItem,
  RungTopology,
  LadderProfile,
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

export interface CtudState {
  cv: number;
  qu: boolean;
  qd: boolean;
  prevCU: boolean;
  prevCD: boolean;
}

export interface ScanState {
  timers: Map<string, TimerState>;
  counters: Map<string, CounterState>;
  edges: Map<string, boolean>; // Histórico para detecção de borda (R_TRIG, F_TRIG)
  ctud: Map<string, CtudState>;
  bistables: Map<string, boolean>;
}

export const createScanState = (): ScanState => ({
  timers: new Map(),
  counters: new Map(),
  edges: new Map(),
  ctud: new Map(),
  bistables: new Map(),
});

export const INT16_MIN = -32768;
export const INT16_MAX = 32767;
export const DINT32_MIN = -2147483648;
export const DINT32_MAX = 2147483647;

/**
 * Arredondamento normativo IEC 61131-3 / IEEE 754 "Round to nearest, ties to even" (Banker's Rounding).
 * Se a parte fracionária for exatamente 0.5, arredonda para o número par mais próximo.
 * Retorna null para entradas não finitas ou NaN (sem substituição arbitrária por zero).
 * Sem tolerâncias fixas artificiais que distorçam valores próximos de meio inteiro.
 */
export function roundToNearestEven(value: number): number | null {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return null;
  }
  if (value === 0) return 0;

  const lower = Math.floor(value);
  const fraction = value - lower;

  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;

  // Empate exato com 0.5 no valor recebido: arredonda para o par mais próximo
  return Math.abs(lower) % 2 === 0 ? lower : lower + 1;
}

export function clampInt16(val: number): number {
  return Math.max(INT16_MIN, Math.min(INT16_MAX, val));
}

export function clampDint32(val: number): number {
  return Math.max(DINT32_MIN, Math.min(DINT32_MAX, val));
}

export function toReal32(val: number): number {
  return Math.fround(val);
}

export function toLReal64(val: number): number {
  return val;
}

export function getProfileIntLimits(profile: LadderProfile = "generic"): {
  min: number;
  max: number;
} {
  if (profile === "rockwell") {
    return { min: DINT32_MIN, max: DINT32_MAX };
  }
  return { min: INT16_MIN, max: INT16_MAX };
}

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

export const readNum = (
  val: string | number | boolean | undefined,
  tags: PureTags,
  defaultVal = 0,
): number => {
  if (val === undefined || val === null || val === "") return defaultVal;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "number") return val; // Preserva NaN e Infinity para validação fiel pelo bloco consumidor
  const fromTag = tags[val];
  if (typeof fromTag === "number") return fromTag;
  if (typeof fromTag === "boolean") return fromTag ? 1 : 0;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.toLowerCase() === "nan") return Number.NaN;
    if (trimmed === "Infinity" || trimmed === "+Infinity") return Number.POSITIVE_INFINITY;
    if (trimmed === "-Infinity") return Number.NEGATIVE_INFINITY;
  }
  const parsed = Number(val);
  return Number.isNaN(parsed) ? defaultVal : parsed;
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

// IEC 61131-3 CTUD (Contador Crescente/Decrescente Up/Down):
export const tickCTUD = (
  ctudMap: Map<string, CtudState>,
  key: string,
  cu: boolean,
  cd: boolean,
  reset: boolean,
  load: boolean,
  preset: number,
  limits: { min?: number; max?: number } = { min: INT16_MIN, max: INT16_MAX },
): { qu: boolean; qd: boolean; cv: number } => {
  let st = ctudMap.get(key);
  if (!st) {
    st = { cv: 0, qu: false, qd: false, prevCU: false, prevCD: false };
    ctudMap.set(key, st);
  }

  const cuRising = cu && !st.prevCU;
  const cdRising = cd && !st.prevCD;
  const minLimit = limits.min ?? INT16_MIN;
  const maxLimit = limits.max ?? INT16_MAX;

  // Prioridade normativa IEC 61131-3: Reset (R) > Load (LD) > Contagem (CU/CD)
  if (reset) {
    st.cv = 0;
  } else if (load) {
    st.cv = preset;
  } else {
    if (cuRising && !cdRising) {
      if (st.cv < maxLimit) st.cv += 1;
    } else if (cdRising && !cuRising) {
      if (st.cv > minLimit) st.cv -= 1;
    }
    // Entradas simultâneas de contagem em borda no mesmo scan mantêm CV estável
  }

  st.qu = st.cv >= preset;
  st.qd = st.cv <= 0;
  st.prevCU = cu;
  st.prevCD = cd;

  return { qu: st.qu, qd: st.qd, cv: st.cv };
};

// IEC 61131-3 Bistáveis SR (Set dominante) e RS (Reset dominante):
export const tickBistable = (
  bistables: Map<string, boolean>,
  key: string,
  kind: "SR" | "RS",
  setIn: boolean,
  resetIn: boolean,
  initialVal = false,
): boolean => {
  const prevQ = bistables.get(key) ?? initialVal;
  let q = prevQ;
  if (kind === "SR") {
    // Set dominante: se S1 e R forem ambos TRUE, Set vence (Q1 = TRUE)
    if (setIn) {
      q = true;
    } else if (resetIn) {
      q = false;
    }
  } else {
    // Reset dominante: se R1 e S forem ambos TRUE, Reset vence (Q1 = FALSE)
    if (resetIn) {
      q = false;
    } else if (setIn) {
      q = true;
    }
  }
  bistables.set(key, q);
  return q;
};

export interface DiagnosticItem {
  kind: string;
  value: number;
  preset: number;
  done: boolean;
  text?: string;
  isErr?: boolean;
  errCode?: string;
  targetTag?: string;
  targetPreserved?: boolean;
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
  profile: LadderProfile = "generic",
): boolean {
  const kind = inst.kind;
  const op = inst.operand || "";
  const params = inst.params ?? {};
  let outPower = false;

  // Contatos, comparadores, blocos matemáticos, conversões e lógica não conduzem sem energia de entrada
  if (
    !incomingPower &&
    (isContactKind(kind) ||
      kind.startsWith("CMP_") ||
      [
        "ADD",
        "SUB",
        "MUL",
        "DIV",
        "MOD",
        "ABS",
        "SQRT",
        "MOVE",
        "INT_TO_REAL",
        "REAL_TO_INT",
        "AND",
        "OR",
        "XOR",
        "NOT",
      ].includes(kind))
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
  } else if (kind === "CTUD") {
    const preset = inst.preset ?? Number(params.PV ?? 10);
    const cd = readBool(String(params.CD ?? ""), tags);
    const reset = readBool(String(params.R ?? ""), tags);
    const load = readBool(String(params.LD ?? ""), tags);
    const limits = getProfileIntLimits(profile);
    const { qu, qd, cv } = tickCTUD(
      state.ctud,
      inst.id,
      incomingPower,
      cd,
      reset,
      load,
      preset,
      limits,
    );
    if (op) writes[op] = qu;
    if (params.QU) writes[String(params.QU)] = qu;
    if (params.QD) writes[String(params.QD)] = qd;
    if (params.CV) writes[String(params.CV)] = cv;
    outPower = qu;
    diagnostics[diagKey] = {
      kind: "CTUD",
      value: cv,
      preset,
      done: qu,
      text: `CV:${cv} PV:${preset} (QU:${qu ? 1 : 0} QD:${qd ? 1 : 0})`,
    };
  }
  // 4. Bistáveis
  else if (kind === "SR") {
    const setIn = incomingPower || readBool(String(params.S1 ?? params.S ?? ""), tags);
    const resetIn = readBool(String(params.R ?? ""), tags);
    const q = tickBistable(state.bistables, inst.id, "SR", setIn, resetIn, readBool(op, tags));
    if (op) writes[op] = q;
    outPower = q;
    diagnostics[diagKey] = {
      kind: "SR",
      value: q ? 1 : 0,
      preset: 0,
      done: q,
      text: `Q=${q ? "TRUE" : "FALSE"} (S:${setIn ? 1 : 0} R:${resetIn ? 1 : 0})`,
    };
  } else if (kind === "RS") {
    const setIn = incomingPower || readBool(String(params.S ?? ""), tags);
    const resetIn = readBool(String(params.R1 ?? params.R ?? ""), tags);
    const q = tickBistable(state.bistables, inst.id, "RS", setIn, resetIn, readBool(op, tags));
    if (op) writes[op] = q;
    outPower = q;
    diagnostics[diagKey] = {
      kind: "RS",
      value: q ? 1 : 0,
      preset: 0,
      done: q,
      text: `Q=${q ? "TRUE" : "FALSE"} (S:${setIn ? 1 : 0} R1:${resetIn ? 1 : 0})`,
    };
  }
  // 5. Comparadores
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
  // 6. Blocos Matemáticos
  else if (["ADD", "SUB", "MUL", "DIV", "MOD", "ABS", "SQRT"].includes(kind)) {
    const in1 = readNum(params.IN1, tags);
    const in2 = readNum(params.IN2, tags);
    const targetOp = String(params.OUT || op || "");
    const targetType = String(params.TYPE || "").toUpperCase();
    const isLReal = targetType === "LREAL";
    const limits = getProfileIntLimits(profile);
    let result = 0;
    let isErr = false;
    let errCode = "";
    let errText = "";

    // Validação de entrada: rejeição explícita de entradas não finitas ou NaN
    if (!Number.isFinite(in1) || Number.isNaN(in1)) {
      isErr = true;
      errCode = "INVALID_INPUT";
      errText = "ERR: INVALID_INPUT (IN1)";
    } else if (kind !== "ABS" && kind !== "SQRT" && (!Number.isFinite(in2) || Number.isNaN(in2))) {
      isErr = true;
      errCode = "INVALID_INPUT";
      errText = "ERR: INVALID_INPUT (IN2)";
    } else if (kind === "ADD") {
      result = in1 + in2;
    } else if (kind === "SUB") {
      result = in1 - in2;
    } else if (kind === "MUL") {
      result = in1 * in2;
    } else if (kind === "DIV") {
      if (in2 === 0) {
        isErr = true;
        errCode = "DIV_BY_ZERO";
        errText = "ERR: DIV_BY_ZERO";
      } else {
        result = in1 / in2;
      }
    } else if (kind === "MOD") {
      if (in2 === 0) {
        isErr = true;
        errCode = "MOD_BY_ZERO";
        errText = "ERR: MOD_BY_ZERO";
      } else {
        result = in1 % in2;
      }
    } else if (kind === "ABS") {
      // ABS do menor inteiro representável em complemento de dois produz overflow no tipo correspondente
      const isIntTarget =
        targetType === "INT" ||
        (!targetType &&
          profile !== "rockwell" &&
          Number.isInteger(in1) &&
          in1 <= INT16_MAX &&
          in1 >= INT16_MIN);
      const isDintTarget =
        targetType === "DINT" || (!targetType && profile === "rockwell" && Number.isInteger(in1));

      if (isIntTarget && in1 === INT16_MIN) {
        isErr = true;
        errCode = "OVERFLOW";
        errText = "ERR: OVERFLOW (ABS of INT16_MIN)";
      } else if (isDintTarget && in1 === DINT32_MIN) {
        isErr = true;
        errCode = "OVERFLOW";
        errText = "ERR: OVERFLOW (ABS of DINT32_MIN)";
      } else {
        result = Math.abs(in1);
      }
    } else if (kind === "SQRT") {
      if (in1 < 0) {
        isErr = true;
        errCode = "SQRT_NEGATIVE";
        errText = "ERR: SQRT_NEGATIVE";
      } else {
        result = Math.sqrt(in1);
      }
    }

    if (!isErr) {
      if (!Number.isFinite(result) || Number.isNaN(result)) {
        isErr = true;
        errCode = "OVERFLOW";
        errText = "ERR: OVERFLOW";
      } else if (targetType === "INT") {
        if (result > limits.max || result < limits.min) {
          isErr = true;
          errCode = "INT_OVERFLOW";
          errText = `ERR: INT_OVERFLOW (${result > limits.max ? "> " + limits.max : "< " + limits.min})`;
        }
      } else if (targetType === "DINT") {
        if (result > DINT32_MAX || result < DINT32_MIN) {
          isErr = true;
          errCode = "INT_OVERFLOW";
          errText = `ERR: INT_OVERFLOW (${result > DINT32_MAX ? "> " + DINT32_MAX : "< " + DINT32_MIN})`;
        }
      } else if (!isLReal) {
        // Se o destino for REAL (padrão binary32): normaliza via toReal32 e valida se float 32-bit extrapolou para Infinity
        const f32 = toReal32(result);
        if (!Number.isFinite(f32)) {
          isErr = true;
          errCode = "OVERFLOW";
          errText = "ERR: OVERFLOW (REAL binary32)";
        } else {
          result = f32;
        }
      }
    }

    // Em caso de falha matemática, NÃO sobrescrever a tag de destino (preserva valor pré-existente)
    if (!isErr && targetOp) {
      writes[targetOp] = result;
    }

    diagnostics[diagKey] = {
      kind,
      value: isErr ? 0 : result,
      preset: in1,
      done: !isErr,
      text: isErr ? errText : `= ${result}`,
      isErr,
      errCode: isErr ? errCode : undefined,
      targetTag: targetOp || undefined,
      targetPreserved: isErr && Boolean(targetOp),
    };
    outPower = incomingPower && !isErr; // Bloco matemático repassa ENO se sem erro
  }
  // 7. Movimentação de Registradores
  else if (kind === "MOVE") {
    const rawSrc = params.IN !== undefined ? params.IN : op;
    const src = readNum(rawSrc, tags);
    const targetOp = String(params.OUT || "");
    const targetType = String(params.TYPE || "").toUpperCase();
    let isErr = false;
    let errCode = "";
    let errText = "";
    let finalVal = src;

    if (!Number.isFinite(src) || Number.isNaN(src)) {
      isErr = true;
      errCode = "INVALID_INPUT";
      errText = "ERR: INVALID_INPUT";
    } else {
      if (targetType === "REAL") {
        finalVal = toReal32(src);
        if (!Number.isFinite(finalVal)) {
          isErr = true;
          errCode = "OVERFLOW";
          errText = "ERR: OVERFLOW (REAL binary32)";
        }
      } else if (targetType === "INT") {
        const rounded = roundToNearestEven(src);
        if (rounded === null || rounded > INT16_MAX || rounded < INT16_MIN) {
          isErr = true;
          errCode = "INT_OVERFLOW";
          errText = "ERR: INT_OVERFLOW";
        } else {
          finalVal = rounded;
        }
      } else if (targetType === "DINT") {
        const rounded = roundToNearestEven(src);
        if (rounded === null || rounded > DINT32_MAX || rounded < DINT32_MIN) {
          isErr = true;
          errCode = "INT_OVERFLOW";
          errText = "ERR: INT_OVERFLOW";
        } else {
          finalVal = rounded;
        }
      }
    }

    if (!isErr && targetOp) {
      writes[targetOp] = finalVal;
    }
    diagnostics[diagKey] = {
      kind: "MOVE",
      value: isErr ? 0 : finalVal,
      preset: src,
      done: !isErr,
      text: isErr ? errText : `-> ${finalVal}`,
      isErr,
      errCode: isErr ? errCode : undefined,
      targetTag: targetOp || undefined,
      targetPreserved: isErr && Boolean(targetOp),
    };
    outPower = incomingPower && !isErr;
  }
  // 8. Conversões Numéricas
  else if (kind === "INT_TO_REAL") {
    const rawIn = params.IN !== undefined ? params.IN : op;
    const inVal = readNum(rawIn, tags);
    const targetOp = String(params.OUT || "");
    const targetType = String(params.TYPE || "REAL").toUpperCase();
    let isErr = false;
    let errCode = "";
    let errText = "";

    if (!Number.isFinite(inVal) || Number.isNaN(inVal)) {
      isErr = true;
      errCode = "INVALID_INPUT";
      errText = "ERR: INVALID_INPUT";
    }

    let result = 0;
    if (!isErr) {
      result = targetType === "LREAL" ? toLReal64(inVal) : toReal32(inVal);
      if (!Number.isFinite(result)) {
        isErr = true;
        errCode = "OVERFLOW";
        errText = "ERR: OVERFLOW";
      }
    }

    // Não sobrescrever tag destino em caso de erro
    if (!isErr && targetOp) {
      writes[targetOp] = result;
    }

    diagnostics[diagKey] = {
      kind: "INT_TO_REAL",
      value: isErr ? 0 : result,
      preset: inVal,
      done: !isErr,
      text: isErr ? errText : `= ${result.toFixed(2)} (${targetType})`,
      isErr,
      errCode: isErr ? errCode : undefined,
      targetTag: targetOp || undefined,
      targetPreserved: isErr && Boolean(targetOp),
    };
    outPower = incomingPower && !isErr;
  } else if (kind === "REAL_TO_INT") {
    const rawIn = params.IN !== undefined ? params.IN : op;
    const inVal = readNum(rawIn, tags);
    const targetOp = String(params.OUT || "");
    const limits = getProfileIntLimits(profile);
    let isErr = false;
    let errCode = "";
    let errText = "";
    let result = 0;

    // Arredondamento IEC 61131-3 / IEEE 754 "round to nearest, ties to even"
    const rounded = roundToNearestEven(inVal);
    if (rounded === null) {
      isErr = true;
      if (inVal === Number.POSITIVE_INFINITY || inVal === Number.NEGATIVE_INFINITY) {
        errCode = "REAL_TO_INT_INFINITY";
        errText = "ERR: REAL_TO_INT_INFINITY";
      } else {
        errCode = "REAL_TO_INT_NAN";
        errText = "ERR: REAL_TO_INT_NAN";
      }
    } else if (rounded > limits.max) {
      // Limites verificados após o arredondamento
      isErr = true;
      errCode = "INT_OVERFLOW";
      errText = `ERR: INT_OVERFLOW (> ${limits.max})`;
    } else if (rounded < limits.min) {
      isErr = true;
      errCode = "INT_OVERFLOW";
      errText = `ERR: INT_OVERFLOW (< ${limits.min})`;
    } else {
      result = rounded;
    }

    // Em caso de overflow ou entrada inválida, NÃO escreve na tag de destino
    if (!isErr && targetOp) {
      writes[targetOp] = result;
    }

    diagnostics[diagKey] = {
      kind: "REAL_TO_INT",
      value: isErr ? 0 : result,
      preset: inVal,
      done: !isErr,
      text: isErr ? errText : `= ${result} (INT)`,
      isErr,
      errCode: isErr ? errCode : undefined,
      targetTag: targetOp || undefined,
      targetPreserved: isErr && Boolean(targetOp),
    };
    outPower = incomingPower && !isErr;
  }
  // 9. Lógica Booleana
  else if (["AND", "OR", "XOR", "NOT"].includes(kind)) {
    const in1Raw = params.IN1 !== undefined ? params.IN1 : params.IN !== undefined ? params.IN : op;
    const in2Raw = params.IN2;
    const targetOp = String(params.OUT || op || "");

    let resBool = false;
    let isErr = false;
    let errText = "";

    if (kind === "NOT") {
      if (in1Raw === undefined || in1Raw === "") {
        isErr = true;
        errText = "ERR: MISSING_OPERAND";
      } else {
        const b1 = readBool(String(in1Raw), tags);
        resBool = !b1;
      }
    } else {
      if (in1Raw === undefined || in1Raw === "" || in2Raw === undefined || in2Raw === "") {
        isErr = true;
        errText = "ERR: MISSING_OPERAND";
      } else {
        const b1 = readBool(String(in1Raw), tags);
        const b2 = readBool(String(in2Raw), tags);
        if (kind === "AND") resBool = b1 && b2;
        else if (kind === "OR") resBool = b1 || b2;
        else if (kind === "XOR") resBool = b1 !== b2;
      }
    }

    if (targetOp && !isErr) {
      writes[targetOp] = resBool;
    }

    diagnostics[diagKey] = {
      kind,
      value: resBool ? 1 : 0,
      preset: 0,
      done: !isErr,
      text: isErr ? errText : `= ${resBool ? "TRUE" : "FALSE"}`,
    };
    outPower = incomingPower && !isErr;
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
  profile: LadderProfile = "generic",
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
          evalBranchRecursive(sub, false, tags, state, now, writes, diagnostics, profile);
        }
      } else if (anyItem.items) {
        evalBranchRecursive(anyItem, false, tags, state, now, writes, diagnostics, profile);
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
          profile,
        );
      } else if (item.branches && item.branches.length > 0) {
        let subAny = false;
        for (const sub of item.branches) {
          const subOn = evalBranchRecursive(
            sub,
            true,
            tags,
            state,
            now,
            writes,
            diagnostics,
            profile,
          );
          subAny = subAny || subOn;
        }
        itemPower = subAny;
      } else if (item.items && item.items.length > 0) {
        itemPower = evalBranchRecursive(item, true, tags, state, now, writes, diagnostics, profile);
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
          profile,
        );
      } else if (item.branches && item.branches.length > 0) {
        if (!power) {
          for (const sub of item.branches) {
            evalBranchRecursive(sub, false, tags, state, now, writes, diagnostics, profile);
          }
        } else {
          let anySubPower = false;
          for (const sub of item.branches) {
            const subOn = evalBranchRecursive(
              sub,
              power,
              tags,
              state,
              now,
              writes,
              diagnostics,
              profile,
            );
            anySubPower = anySubPower || subOn;
          }
          power = anySubPower;
        }
      } else if (item.type === "PARALLEL" || (item.items && item.type === "PARALLEL")) {
        if (!power) {
          evalBranchRecursive(item, false, tags, state, now, writes, diagnostics, profile);
        } else {
          power = evalBranchRecursive(item, power, tags, state, now, writes, diagnostics, profile);
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
  profile: LadderProfile = "generic",
  oteTracker?: Map<string, number>,
) {
  for (const out of outputs) {
    out.energized = power;
    const kind = out.kind;
    const op = out.operand;
    if (!op && !out.params?.OUT) continue;

    if (kind === "OTE") {
      if (op) {
        writes[op] = power;
        if (oteTracker) {
          const prevCount = oteTracker.get(op) ?? 0;
          oteTracker.set(op, prevCount + 1);
          if (prevCount > 0) {
            diagnostics[`out:${out.id}`] = {
              kind: "OTE",
              value: power ? 1 : 0,
              preset: 0,
              done: power,
              text: `OTE ${op} [WARN: DOUBLE_COIL]`,
            };
          }
        }
      }
    } else if (kind === "OTL" && power) {
      if (op) writes[op] = true;
    } else if (kind === "OTU" && power) {
      if (op) writes[op] = false;
    } else if (kind === "NEG_COIL") {
      if (op) writes[op] = !power;
    } else if (
      [
        "TON",
        "TOF",
        "TP",
        "TONR",
        "CTU",
        "CTD",
        "CTUD",
        "SR",
        "RS",
        "INT_TO_REAL",
        "REAL_TO_INT",
        "AND",
        "OR",
        "XOR",
        "NOT",
      ].includes(kind) ||
      kind.startsWith("CMP_") ||
      ["ADD", "SUB", "MUL", "DIV", "MOD", "ABS", "SQRT", "MOVE"].includes(kind)
    ) {
      evalInstructionNode(
        out,
        power,
        tags,
        state,
        now,
        writes,
        diagnostics,
        `out:${out.id}`,
        profile,
      );
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
  forcedTags?: ReadonlySet<string>,
  profile: LadderProfile = "generic",
): { results: ScanResult[]; tags: PureTags } {
  const results: ScanResult[] = [];
  const workingTags: PureTags = { ...tags };
  const oteWritesInScan = new Map<string, number>();

  for (let idx = 0; idx < rungs.length; idx++) {
    const rung = rungs[idx];
    const diagnostics: Record<string, DiagnosticItem> = {};
    const topology = ensureRungTopology(rung);
    const rungWrites: PureTags = {};

    // 1. Avaliação Estrutural da Topologia Real com workingTags atualizadas
    const poweredOut = evalBranchRecursive(
      topology.rootBranch,
      true, // Trilho esquerdo sempre fornece energia
      workingTags,
      state,
      now,
      rungWrites,
      diagnostics,
      profile,
    );

    // 2. Avaliação de Todas as Saídas em Paralelo
    evalRungOutputs(
      topology.outputs,
      poweredOut,
      workingTags,
      state,
      now,
      rungWrites,
      diagnostics,
      profile,
      oteWritesInScan,
    );
    const finalPoweredOut =
      topology.outputs.length > 0 ? topology.outputs.some((o) => o.energized) : poweredOut;
    rung.poweredOut = finalPoweredOut;

    // 3. Propagação determinística entre redes no mesmo scan (IEC 61131-3)
    // A última escrita no scan vence, e a rede imediatamente seguinte já vê o valor atualizado
    for (const [k, v] of Object.entries(rungWrites)) {
      if (forcedTags && forcedTags.has(k)) {
        // Tag forçada tem prioridade estrita sobre a lógica
        continue;
      }
      workingTags[k] = v;
    }

    // 4. Projeção na Matriz perCell para Retrocompatibilidade Visual
    const perCell: boolean[][] = [];
    for (let ri = 0; ri < rung.cells.length; ri++) {
      const row = rung.cells[ri];
      const rowOn = evalLegacyRow(row, workingTags) || finalPoweredOut;
      perCell.push(
        row.map((c, i) =>
          i === row.length - 1
            ? finalPoweredOut
            : c.kind === "EMPTY"
              ? rowOn
              : c.kind === "XIC"
                ? readBool(c.operand, workingTags)
                : c.kind === "XIO"
                  ? !readBool(c.operand, workingTags)
                  : finalPoweredOut,
        ),
      );
    }

    results.push({
      rungId: rung.id,
      poweredOut: finalPoweredOut,
      perCell,
      diagnostics,
    });
  }

  return { results, tags: workingTags };
}
