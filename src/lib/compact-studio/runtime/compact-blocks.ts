/**
 * Compact PLC Block Pack registered onto the single shared `BlockRegistry` (`@/lib/fbd/engine`).
 *
 * Implements clean-room IEC 61131-3 + compact-controller functions (basic logic, edge detection,
 * retentive/wiping/pulse/stairway timers, up/down/frequency/hour counters, weekly/yearly clocks,
 * analog comparators/amplifiers/mux/ramps/PI/watchdog/math, shift register, messages, datalog).
 *
 * All time-dependent blocks read strictly `dtMs` and `_SIM_CLOCK_EPOCH_MS` (never system clock).
 */
import {
  createDefaultRegistry,
  type BlockDefinition,
  type BlockRegistry,
  type ExecContext,
  type FbdValue,
  type PortDef,
} from "@/lib/fbd/engine";
import { getSimulatedCalendar, DEFAULT_SIMULATED_EPOCH_MS } from "./simulated-clock";

export const SIM_CLOCK_VAR_NAME = "_SIM_CLOCK_EPOCH_MS" as const;

function asBool(v: FbdValue | undefined): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.trim().toLowerCase() === "true" || v.trim() === "1";
  return false;
}

function asNum(v: FbdValue | undefined, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const parsed = Number(v.trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function asTimeMs(v: FbdValue | undefined, fallback = 1000): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
  if (typeof v === "string") {
    const body = v.trim().replace(/^t#/i, "");
    const re = /(\d+(?:\.\d+)?)\s*(ms|s|m|h)/gi;
    let total = 0;
    let matched = false;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      matched = true;
      const mult =
        m[2].toLowerCase() === "ms"
          ? 1
          : m[2].toLowerCase() === "s"
            ? 1000
            : m[2].toLowerCase() === "m"
              ? 60_000
              : 3_600_000;
      total += parseFloat(m[1]) * mult;
    }
    if (matched) return Math.max(0, total);
    const num = Number(body);
    if (Number.isFinite(num)) return Math.max(0, num);
  }
  return fallback;
}

function readSimEpochMs(ctx: ExecContext): number {
  try {
    const raw = ctx.io.read(SIM_CLOCK_VAR_NAME);
    const n = asNum(raw, DEFAULT_SIMULATED_EPOCH_MS);
    return n > 0 ? n : DEFAULT_SIMULATED_EPOCH_MS;
  } catch {
    return DEFAULT_SIMULATED_EPOCH_MS;
  }
}

function compactFn(
  type: string,
  category: BlockDefinition["category"],
  description: string,
  inputs: readonly PortDef[],
  outputs: readonly PortDef[],
  execute: (ctx: ExecContext) => Record<string, FbdValue>,
): BlockDefinition {
  return {
    type,
    namespace: "IEC",
    standard: "IEC 61131-3 / Compact",
    version: "1.0.0",
    category,
    description,
    inputs,
    outputs,
    stateful: false,
    execute,
  };
}

function compactFb(
  type: string,
  category: BlockDefinition["category"],
  description: string,
  inputs: readonly PortDef[],
  outputs: readonly PortDef[],
  initState: () => Record<string, FbdValue>,
  execute: (ctx: ExecContext) => Record<string, FbdValue>,
): BlockDefinition {
  return {
    type,
    namespace: "IEC",
    standard: "IEC 61131-3 / Compact",
    version: "1.0.0",
    category,
    description,
    inputs,
    outputs,
    stateful: true,
    initState,
    execute,
  };
}

function parseWeekdayMask(raw: FbdValue | undefined): Set<number> {
  // Bitmask or CSV like "1,2,3,4,5" (0=Sun..6=Sat); default all days
  if (typeof raw === "number") {
    const out = new Set<number>();
    for (let d = 0; d < 7; d++) {
      if ((Math.trunc(raw) & (1 << d)) !== 0) out.add(d);
    }
    return out;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const out = new Set<number>();
    for (const token of raw.split(/[,;\s]+/)) {
      const n = Number(token.trim());
      if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n);
    }
    return out;
  }
  return new Set([0, 1, 2, 3, 4, 5, 6]);
}

function sanitizeDisplayText(raw: string): string {
  return raw.replace(/[<>]/g, "").slice(0, 160);
}

/**
 * Returns all compact-controller block definitions (idempotent with existing IEC registry).
 */
export function compactBlockDefinitions(): readonly BlockDefinition[] {
  return [
    // ── Constants & System Flags ─────────────────────────────────────────────
    compactFn(
      "HIGH",
      "Lógica",
      "Constante digital 1 (HIGH)",
      [],
      [{ name: "OUT", type: "BOOL" }],
      () => ({
        OUT: true,
      }),
    ),
    compactFn(
      "LOW",
      "Lógica",
      "Constante digital 0 (LOW)",
      [],
      [{ name: "OUT", type: "BOOL" }],
      () => ({
        OUT: false,
      }),
    ),
    compactFb(
      "STARTUP_FLAG_M8",
      "Lógica",
      "Flag de inicialização M8: TRUE apenas no primeiro scan",
      [],
      [{ name: "OUT", type: "BOOL" }],
      () => ({ emitted: false }),
      (c) => {
        if (!asBool(c.state.emitted)) {
          c.state.emitted = true;
          return { OUT: true };
        }
        return { OUT: false };
      },
    ),
    compactFn(
      "OPEN_CONNECTOR",
      "Lógica",
      "Conector aberto (terminação explícita sem efeito)",
      [{ name: "IN", type: "ANY" }],
      [],
      () => ({}),
    ),

    // ── Basic Logic Extensions & Edge Logic ──────────────────────────────────
    compactFn(
      "NAND",
      "Lógica",
      "Não-E lógico",
      [
        { name: "IN1", type: "BOOL" },
        { name: "IN2", type: "BOOL" },
        { name: "IN3", type: "BOOL", defaultValue: true },
        { name: "IN4", type: "BOOL", defaultValue: true },
      ],
      [{ name: "OUT", type: "BOOL" }],
      (c) => ({
        OUT: !(
          asBool(c.inputs.IN1) &&
          asBool(c.inputs.IN2) &&
          asBool(c.inputs.IN3) &&
          asBool(c.inputs.IN4)
        ),
      }),
    ),
    compactFn(
      "NOR",
      "Lógica",
      "Não-OU lógico",
      [
        { name: "IN1", type: "BOOL" },
        { name: "IN2", type: "BOOL" },
        { name: "IN3", type: "BOOL", defaultValue: false },
        { name: "IN4", type: "BOOL", defaultValue: false },
      ],
      [{ name: "OUT", type: "BOOL" }],
      (c) => ({
        OUT: !(
          asBool(c.inputs.IN1) ||
          asBool(c.inputs.IN2) ||
          asBool(c.inputs.IN3) ||
          asBool(c.inputs.IN4)
        ),
      }),
    ),
    compactFb(
      "AND_EDGE",
      "Borda",
      "AND com avaliação por borda de subida",
      [
        { name: "IN1", type: "BOOL" },
        { name: "IN2", type: "BOOL" },
      ],
      [{ name: "OUT", type: "BOOL" }],
      () => ({ prev: false }),
      (c) => {
        const cur = asBool(c.inputs.IN1) && asBool(c.inputs.IN2);
        const out = cur && !asBool(c.state.prev);
        c.state.prev = cur;
        return { OUT: out };
      },
    ),
    compactFb(
      "NAND_EDGE",
      "Borda",
      "NAND com avaliação por borda de descida",
      [
        { name: "IN1", type: "BOOL" },
        { name: "IN2", type: "BOOL" },
      ],
      [{ name: "OUT", type: "BOOL" }],
      () => ({ prev: true }),
      (c) => {
        const allTrue = asBool(c.inputs.IN1) && asBool(c.inputs.IN2);
        const out = !allTrue && asBool(c.state.prev);
        c.state.prev = allTrue;
        return { OUT: out };
      },
    ),
    compactFb(
      "PULSE_RELAY",
      "Memória",
      "Relé de pulso (Latching / Telerruptor): alterna em borda de TRG com S/R",
      [
        { name: "TRG", type: "BOOL" },
        { name: "S", type: "BOOL" },
        { name: "R", type: "BOOL" },
      ],
      [{ name: "Q", type: "BOOL" }],
      () => ({ q: false, prevTrg: false }),
      (c) => {
        const trg = asBool(c.inputs.TRG);
        const s = asBool(c.inputs.S);
        const r = asBool(c.inputs.R);
        let q = asBool(c.state.q);
        if (r) {
          q = false;
        } else if (s) {
          q = true;
        } else if (trg && !asBool(c.state.prevTrg)) {
          q = !q;
        }
        c.state.q = q;
        c.state.prevTrg = trg;
        return { Q: q };
      },
    ),

    // ── Complete V8 / V8.4 Timers ────────────────────────────────────────────
    compactFb(
      "TONR",
      "Temporizador",
      "Temporizador retentivo com acumulação e reset prioritário",
      [
        { name: "TRG", type: "BOOL" },
        { name: "R", type: "BOOL" },
        { name: "PT", type: "TIME", defaultValue: 5000 },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "ET", type: "TIME" },
      ],
      () => ({ et: 0, q: false }),
      (c) => {
        const pt = asTimeMs(c.inputs.PT ?? c.params.PT, 5000);
        if (asBool(c.inputs.R)) {
          c.state.et = 0;
          c.state.q = false;
          return { Q: false, ET: 0 };
        }
        let et = asNum(c.state.et, 0);
        if (asBool(c.inputs.TRG) && !asBool(c.state.q)) {
          et = Math.min(pt, et + c.dtMs);
          if (et >= pt) {
            c.state.q = true;
          }
        }
        c.state.et = et;
        return { Q: asBool(c.state.q), ET: et };
      },
    ),
    compactFb(
      "TON_TOF",
      "Temporizador",
      "Temporizador combinado Atraso na Ligação (TH) e no Desligamento (TL)",
      [
        { name: "TRG", type: "BOOL" },
        { name: "TH", type: "TIME", defaultValue: 1000 },
        { name: "TL", type: "TIME", defaultValue: 1000 },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "ET", type: "TIME" },
      ],
      () => ({ q: false, onAccum: 0, offAccum: 0 }),
      (c) => {
        const trg = asBool(c.inputs.TRG);
        const th = asTimeMs(c.inputs.TH ?? c.params.TH, 1000);
        const tl = asTimeMs(c.inputs.TL ?? c.params.TL, 1000);
        let q = asBool(c.state.q);
        let onAccum = asNum(c.state.onAccum, 0);
        let offAccum = asNum(c.state.offAccum, 0);

        if (trg) {
          offAccum = 0;
          if (!q) {
            onAccum = Math.min(th, onAccum + c.dtMs);
            if (onAccum >= th) q = true;
          }
        } else {
          onAccum = 0;
          if (q) {
            offAccum = Math.min(tl, offAccum + c.dtMs);
            if (offAccum >= tl) q = false;
          }
        }

        c.state.q = q;
        c.state.onAccum = onAccum;
        c.state.offAccum = offAccum;
        return { Q: q, ET: trg ? onAccum : offAccum };
      },
    ),
    compactFb(
      "WIPING_RELAY",
      "Temporizador",
      "Relé de pulso / varredura (saída por TH ou até queda de TRG)",
      [
        { name: "TRG", type: "BOOL" },
        { name: "TH", type: "TIME", defaultValue: 2000 },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "ET", type: "TIME" },
      ],
      () => ({ active: false, et: 0, prevTrg: false }),
      (c) => {
        const trg = asBool(c.inputs.TRG);
        const th = asTimeMs(c.inputs.TH ?? c.params.TH, 2000);
        let active = asBool(c.state.active);
        let et = asNum(c.state.et, 0);

        if (!trg) {
          active = false;
          et = 0;
        } else if (!asBool(c.state.prevTrg)) {
          active = th > 0;
          et = 0;
        } else if (active) {
          et += c.dtMs;
          if (et >= th) {
            et = th;
            active = false;
          }
        }

        c.state.active = active;
        c.state.et = et;
        c.state.prevTrg = trg;
        return { Q: active, ET: et };
      },
    ),
    compactFb(
      "EDGE_TRIGGERED_WIPING",
      "Temporizador",
      "Relé de pulso por borda com N ciclos alternados (TH / TL)",
      [
        { name: "TRG", type: "BOOL" },
        { name: "R", type: "BOOL" },
        { name: "TH", type: "TIME", defaultValue: 1000 },
        { name: "TL", type: "TIME", defaultValue: 1000 },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "ET", type: "TIME" },
      ],
      () => ({ running: false, phaseHigh: true, et: 0, remainingCycles: 0, prevTrg: false }),
      (c) => {
        const trg = asBool(c.inputs.TRG);
        const reset = asBool(c.inputs.R);
        const th = asTimeMs(c.inputs.TH ?? c.params.TH, 1000);
        const tl = asTimeMs(c.inputs.TL ?? c.params.TL, 1000);
        const totalCycles = Math.max(1, Math.trunc(asNum(c.params.cycles, 1)));

        if (reset) {
          c.state.running = false;
          c.state.phaseHigh = true;
          c.state.et = 0;
          c.state.remainingCycles = 0;
          c.state.prevTrg = trg;
          return { Q: false, ET: 0 };
        }

        let running = asBool(c.state.running);
        let phaseHigh = asBool(c.state.phaseHigh);
        let et = asNum(c.state.et, 0);
        let remainingCycles = asNum(c.state.remainingCycles, 0);

        if (trg && !asBool(c.state.prevTrg)) {
          running = true;
          phaseHigh = true;
          et = 0;
          remainingCycles = totalCycles;
        } else if (running) {
          et += c.dtMs;
          if (phaseHigh && et >= th) {
            et = 0;
            if (remainingCycles <= 1 && tl === 0) {
              running = false;
            } else {
              phaseHigh = false;
            }
          } else if (!phaseHigh && et >= tl) {
            et = 0;
            remainingCycles -= 1;
            if (remainingCycles <= 0) {
              running = false;
            } else {
              phaseHigh = true;
            }
          }
        }

        c.state.running = running;
        c.state.phaseHigh = phaseHigh;
        c.state.et = et;
        c.state.remainingCycles = remainingCycles;
        c.state.prevTrg = trg;
        return { Q: running && phaseHigh, ET: et };
      },
    ),
    compactFb(
      "ASYNC_PULSE_GEN",
      "Temporizador",
      "Gerador de pulsos assíncrono (TH / TL) com inversão opcional",
      [
        { name: "TRG", type: "BOOL" },
        { name: "TH", type: "TIME", defaultValue: 500 },
        { name: "TL", type: "TIME", defaultValue: 500 },
      ],
      [{ name: "Q", type: "BOOL" }],
      () => ({ phaseHigh: true, accum: 0, prevTrg: false }),
      (c) => {
        const trg = asBool(c.inputs.TRG);
        const inv = asBool(c.params.inv);
        const th = Math.max(1, asTimeMs(c.inputs.TH ?? c.params.TH, 500));
        const tl = Math.max(1, asTimeMs(c.inputs.TL ?? c.params.TL, 500));

        if (!trg) {
          c.state.phaseHigh = true;
          c.state.accum = 0;
          c.state.prevTrg = false;
          return { Q: false };
        }

        let phaseHigh = asBool(c.state.phaseHigh);
        let accum = asNum(c.state.accum, 0);
        if (!asBool(c.state.prevTrg)) {
          phaseHigh = !inv;
          accum = 0;
        } else {
          accum += c.dtMs;
          if (phaseHigh && accum >= th) {
            accum -= th;
            phaseHigh = false;
          } else if (!phaseHigh && accum >= tl) {
            accum -= tl;
            phaseHigh = true;
          }
        }
        c.state.phaseHigh = phaseHigh;
        c.state.accum = accum;
        c.state.prevTrg = true;
        return { Q: phaseHigh };
      },
    ),
    compactFb(
      "RANDOM_GEN",
      "Temporizador",
      "Gerador pseudoaleatório determinístico com semente fixa (LCG)",
      [{ name: "TRG", type: "BOOL" }],
      [{ name: "Q", type: "BOOL" }],
      () => ({ q: false, accum: 0, delayMs: 500, rng: 123456789, prevTrg: false }),
      (c) => {
        const trg = asBool(c.inputs.TRG);
        const minMs = Math.max(50, asNum(c.params.minMs, 200));
        const maxMs = Math.max(minMs, asNum(c.params.maxMs, 2000));

        const nextRand = (seed: number): { seed: number; unit: number } => {
          const next = (seed * 1664525 + 1013904223) >>> 0;
          return { seed: next, unit: next / 0x100000000 };
        };

        if (trg !== asBool(c.state.prevTrg)) {
          const r = nextRand(asNum(c.state.rng, 123456789));
          c.state.rng = r.seed;
          c.state.delayMs = Math.round(minMs + r.unit * (maxMs - minMs));
          c.state.accum = 0;
          c.state.prevTrg = trg;
          if (trg) c.state.q = true;
          return { Q: asBool(c.state.q) };
        }

        let accum = asNum(c.state.accum, 0) + c.dtMs;
        const target = asNum(c.state.delayMs, minMs);
        if (accum >= target) {
          accum = 0;
          c.state.q = trg;
        }
        c.state.accum = accum;
        return { Q: asBool(c.state.q) };
      },
    ),
    compactFb(
      "STAIRWAY_SWITCH",
      "Temporizador",
      "Interruptor de escada com desligamento e pré-aviso temporizado",
      [
        { name: "TRG", type: "BOOL" },
        { name: "T", type: "TIME", defaultValue: 10000 },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "ET", type: "TIME" },
      ],
      () => ({ active: false, et: 0, prevTrg: false }),
      (c) => {
        const trg = asBool(c.inputs.TRG);
        const total = Math.max(100, asTimeMs(c.inputs.T ?? c.params.T, 10_000));
        const warnAt = asTimeMs(c.params.warnAtMs, 0);
        const warnBlinkMs = Math.max(50, asTimeMs(c.params.warnDurationMs, 500));

        let active = asBool(c.state.active);
        let et = asNum(c.state.et, 0);

        if (trg && !asBool(c.state.prevTrg)) {
          active = true;
          et = 0;
        } else if (active) {
          et += c.dtMs;
          if (et >= total) {
            active = false;
            et = total;
          }
        }

        let q = active;
        if (active && warnAt > 0 && et >= total - warnAt && et < total - warnAt + warnBlinkMs) {
          q = false;
        }

        c.state.active = active;
        c.state.et = et;
        c.state.prevTrg = trg;
        return { Q: q, ET: et };
      },
    ),

    // ── Counters & Hour Counter ──────────────────────────────────────────────
    compactFb(
      "CTUD_COMPACT",
      "Contador",
      "Contador Up/Down compacto com direção e limiares ON/OFF parametrizáveis",
      [
        { name: "R", type: "BOOL" },
        { name: "CNT", type: "BOOL" },
        { name: "DIR", type: "BOOL" },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "CV", type: "INT" },
      ],
      () => ({ cv: 0, prevCnt: false, q: false }),
      (c) => {
        const reset = asBool(c.inputs.R);
        const cnt = asBool(c.inputs.CNT);
        const dirDown = asBool(c.inputs.DIR);
        const onTh = asNum(c.params.onThreshold, 5);
        const offTh = asNum(c.params.offThreshold, 5);

        let cv = asNum(c.state.cv, 0);
        if (reset) {
          cv = 0;
        } else if (cnt && !asBool(c.state.prevCnt)) {
          cv = dirDown ? Math.max(0, cv - 1) : Math.min(999_999, cv + 1);
        }

        let q = asBool(c.state.q);
        if (onTh >= offTh) {
          if (cv >= onTh) q = true;
          else if (cv < offTh) q = false;
        } else {
          q = cv >= onTh && cv < offTh;
        }

        c.state.cv = cv;
        c.state.q = q;
        c.state.prevCnt = cnt;
        return { Q: q, CV: cv };
      },
    ),
    compactFb(
      "HOUR_COUNTER",
      "Contador",
      "Horímetro acumulativo retentivo com alarme de manutenção (MI)",
      [
        { name: "EN_COUNT", type: "BOOL", defaultValue: true },
        { name: "R", type: "BOOL" },
        { name: "RAL", type: "BOOL" },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "OT_MIN", type: "INT" },
        { name: "MN_MIN", type: "INT" },
      ],
      () => ({ otMs: 0, mnMs: 0 }),
      (c) => {
        const miMin = Math.max(1, asNum(c.params.maintenanceMinutes, 60));
        const miMs = miMin * 60_000;
        let otMs = asNum(c.state.otMs, 0);
        let mnMs = asNum(c.state.mnMs, 0);

        if (asBool(c.inputs.RAL)) {
          otMs = 0;
          mnMs = miMs;
        } else if (asBool(c.inputs.R)) {
          mnMs = miMs;
        } else if (asBool(c.inputs.EN_COUNT)) {
          otMs += c.dtMs;
          mnMs = Math.max(0, mnMs - c.dtMs);
        }

        if (mnMs === 0 && otMs === 0 && !asBool(c.inputs.RAL)) {
          mnMs = miMs;
        }

        c.state.otMs = otMs;
        c.state.mnMs = mnMs;
        const otMin = Math.floor(otMs / 60_000);
        const mnRemMin = Math.ceil(mnMs / 60_000);
        return { Q: otMs >= miMs || mnMs === 0, OT_MIN: otMin, MN_MIN: mnRemMin };
      },
    ),
    compactFb(
      "THRESHOLD_TRIGGER",
      "Contador",
      "Gatilho de limiar de frequência (pulsos por janela G_T)",
      [{ name: "FRE", type: "BOOL" }],
      [
        { name: "Q", type: "BOOL" },
        { name: "FREQ", type: "INT" },
      ],
      () => ({ windowAccumMs: 0, pulses: 0, lastFreq: 0, prevFre: false, q: false }),
      (c) => {
        const fre = asBool(c.inputs.FRE);
        const gateMs = Math.max(100, asTimeMs(c.params.gateMs, 1000));
        const onFreq = asNum(c.params.onFreq, 5);
        const offFreq = asNum(c.params.offFreq, 2);

        let pulses = asNum(c.state.pulses, 0);
        if (fre && !asBool(c.state.prevFre)) pulses += 1;
        c.state.prevFre = fre;

        let win = asNum(c.state.windowAccumMs, 0) + c.dtMs;
        let lastFreq = asNum(c.state.lastFreq, 0);
        let q = asBool(c.state.q);

        if (win >= gateMs) {
          lastFreq = Math.round((pulses * 1000) / win);
          pulses = 0;
          win = 0;
          if (lastFreq >= onFreq) q = true;
          else if (lastFreq <= offFreq) q = false;
        }

        c.state.windowAccumMs = win;
        c.state.pulses = pulses;
        c.state.lastFreq = lastFreq;
        c.state.q = q;
        return { Q: q, FREQ: lastFreq };
      },
    ),

    // ── Weekly & Yearly Clocks (purely via SimulatedClock) ───────────────────
    compactFb(
      "WEEKLY_TIMER",
      "Temporizador",
      "Programador horário semanal (3 cames) controlado por relógio simulado",
      [],
      [{ name: "Q", type: "BOOL" }],
      () => ({}),
      (c) => {
        const epochMs = readSimEpochMs(c);
        const cal = getSimulatedCalendar(epochMs);
        let active = false;
        for (const idx of [1, 2, 3]) {
          const enabled = c.params[`cam${idx}Enabled`];
          if (enabled === false) continue;
          const days = parseWeekdayMask(c.params[`cam${idx}Days`]);
          const onMin = asNum(c.params[`cam${idx}OnMin`], idx === 1 ? 480 : -1);
          const offMin = asNum(c.params[`cam${idx}OffMin`], idx === 1 ? 1080 : -1);
          if (onMin < 0 || offMin < 0) continue;

          if (onMin <= offMin) {
            if (days.has(cal.dayOfWeek) && cal.minuteOfDay >= onMin && cal.minuteOfDay < offMin) {
              active = true;
              break;
            }
          } else {
            // Cross-midnight schedule
            const prevDay = (cal.dayOfWeek + 6) % 7;
            if (
              (days.has(cal.dayOfWeek) && cal.minuteOfDay >= onMin) ||
              (days.has(prevDay) && cal.minuteOfDay < offMin)
            ) {
              active = true;
              break;
            }
          }
        }
        return { Q: active };
      },
    ),
    compactFb(
      "YEARLY_TIMER",
      "Temporizador",
      "Programador horário anual controlado por relógio simulado",
      [],
      [{ name: "Q", type: "BOOL" }],
      () => ({}),
      (c) => {
        const epochMs = readSimEpochMs(c);
        const cal = getSimulatedCalendar(epochMs);
        const onMonth = Math.trunc(asNum(c.params.onMonth, 1));
        const onDay = Math.trunc(asNum(c.params.onDay, 1));
        const offMonth = Math.trunc(asNum(c.params.offMonth, 12));
        const offDay = Math.trunc(asNum(c.params.offDay, 31));

        const curMd = cal.month * 100 + cal.day;
        const startMd = onMonth * 100 + onDay;
        const endMd = offMonth * 100 + offDay;
        const active =
          startMd <= endMd
            ? curMd >= startMd && curMd <= endMd
            : curMd >= startMd || curMd <= endMd;
        return { Q: active };
      },
    ),

    // ── Analog & Special Functions ───────────────────────────────────────────
    compactFb(
      "ANALOG_COMP",
      "Comparação",
      "Comparador analógico diferencial com ganho, offset e histerese",
      [
        { name: "AX", type: "REAL" },
        { name: "AY", type: "REAL" },
      ],
      [
        { name: "Q", type: "BOOL" },
        { name: "DELTA", type: "REAL" },
      ],
      () => ({ q: false }),
      (c) => {
        const gain = asNum(c.params.gain, 1);
        const offset = asNum(c.params.offset, 0);
        const onTh = asNum(c.params.onThreshold, 10);
        const offTh = asNum(c.params.offThreshold, 5);
        const delta = (asNum(c.inputs.AX) - asNum(c.inputs.AY)) * gain + offset;
        let q = asBool(c.state.q);
        if (delta >= onTh) q = true;
        else if (delta <= offTh) q = false;
        c.state.q = q;
        return { Q: q, DELTA: delta };
      },
    ),
    compactFb(
      "ANALOG_THRESHOLD",
      "Comparação",
      "Gatilho de limiar analógico com histerese configurável",
      [{ name: "AX", type: "REAL" }],
      [
        { name: "Q", type: "BOOL" },
        { name: "SCALED", type: "REAL" },
      ],
      () => ({ q: false }),
      (c) => {
        const scaled = asNum(c.inputs.AX) * asNum(c.params.gain, 1) + asNum(c.params.offset, 0);
        const onTh = asNum(c.params.onThreshold, 500);
        const offTh = asNum(c.params.offThreshold, 200);
        let q = asBool(c.state.q);
        if (onTh >= offTh) {
          if (scaled >= onTh) q = true;
          else if (scaled <= offTh) q = false;
        } else {
          q = scaled >= onTh && scaled <= offTh;
        }
        c.state.q = q;
        return { Q: q, SCALED: scaled };
      },
    ),
    compactFn(
      "ANALOG_AMP",
      "Matemática",
      "Amplificador e escalonador analógico (Ax * gain + offset com clamp)",
      [{ name: "AX", type: "REAL" }],
      [{ name: "AQ", type: "REAL" }],
      (c) => {
        const raw = asNum(c.inputs.AX) * asNum(c.params.gain, 1) + asNum(c.params.offset, 0);
        const minOut = asNum(c.params.minOut, -32768);
        const maxOut = asNum(c.params.maxOut, 32767);
        return { AQ: Math.max(minOut, Math.min(maxOut, raw)) };
      },
    ),
    compactFn(
      "ANALOG_MUX",
      "Seleção",
      "Multiplexador analógico de 4 canais (S1, S2)",
      [
        { name: "S1", type: "BOOL" },
        { name: "S2", type: "BOOL" },
        { name: "V1", type: "REAL", defaultValue: 0 },
        { name: "V2", type: "REAL", defaultValue: 0 },
        { name: "V3", type: "REAL", defaultValue: 0 },
        { name: "V4", type: "REAL", defaultValue: 0 },
      ],
      [{ name: "AQ", type: "REAL" }],
      (c) => {
        const sel = (asBool(c.inputs.S1) ? 1 : 0) + (asBool(c.inputs.S2) ? 2 : 0);
        const vals = [c.inputs.V1, c.inputs.V2, c.inputs.V3, c.inputs.V4];
        return { AQ: asNum(vals[sel], 0) };
      },
    ),
    compactFb(
      "ANALOG_RAMP",
      "Matemática",
      "Rampa analógica com controle de taxa (unidades/segundo) para níveis L1/L2",
      [
        { name: "SEL", type: "BOOL" },
        { name: "ST", type: "BOOL" },
      ],
      [{ name: "AQ", type: "REAL" }],
      () => ({ aq: 0 }),
      (c) => {
        const sel = asBool(c.inputs.SEL);
        const st = asBool(c.inputs.ST);
        const l1 = asNum(c.params.level1, 500);
        const l2 = asNum(c.params.level2, 1000);
        const ratePerSec = Math.max(1, asNum(c.params.ratePerSec, 100));
        const target = st ? 0 : sel ? l2 : l1;
        const maxStep = (ratePerSec * c.dtMs) / 1000;
        let aq = asNum(c.state.aq, 0);
        const diff = target - aq;
        if (Math.abs(diff) <= maxStep) {
          aq = target;
        } else {
          aq += Math.sign(diff) * maxStep;
        }
        c.state.aq = aq;
        return { AQ: Math.round(aq * 1000) / 1000 };
      },
    ),
    compactFb(
      "PI_CONTROLLER",
      "Matemática",
      "Controlador PI compacto com Auto/Manual e anti-windup",
      [
        { name: "A_M", type: "BOOL" },
        { name: "R", type: "BOOL" },
        { name: "PV", type: "REAL" },
        { name: "SP", type: "REAL", defaultValue: 500 },
        { name: "MQ", type: "REAL", defaultValue: 0 },
      ],
      [{ name: "AQ", type: "REAL" }],
      () => ({ integral: 0, aq: 0 }),
      (c) => {
        const minOut = asNum(c.params.minOut, 0);
        const maxOut = asNum(c.params.maxOut, 1000);
        if (asBool(c.inputs.R)) {
          c.state.integral = 0;
          c.state.aq = 0;
          return { AQ: 0 };
        }
        if (!asBool(c.inputs.A_M)) {
          const manual = Math.max(minOut, Math.min(maxOut, asNum(c.inputs.MQ, 0)));
          c.state.integral = manual;
          c.state.aq = manual;
          return { AQ: manual };
        }
        const dirSign = asBool(c.params.reverseActing) ? -1 : 1;
        const error = (asNum(c.inputs.SP) - asNum(c.inputs.PV)) * dirSign;
        const kc = asNum(c.params.kc, 1);
        const tiMs = Math.max(100, asTimeMs(c.params.tiMs, 10_000));
        const pTerm = kc * error;
        let integral = asNum(c.state.integral, 0) + (kc * error * c.dtMs) / tiMs;
        const unclamped = pTerm + integral;
        const clamped = Math.max(minOut, Math.min(maxOut, unclamped));
        // Anti-windup clamping
        if (unclamped !== clamped) {
          integral = clamped - pTerm;
        }
        c.state.integral = integral;
        c.state.aq = clamped;
        return { AQ: Math.round(clamped * 100) / 100 };
      },
    ),
    compactFb(
      "ANALOG_WATCHDOG",
      "Comparação",
      "Watchdog analógico: detecta desvio maior que delta desde o último pulso EN",
      [{ name: "AX", type: "REAL" }],
      [
        { name: "Q", type: "BOOL" },
        { name: "SAVED", type: "REAL" },
      ],
      () => ({ ref: 0, initialized: false }),
      (c) => {
        const ax = asNum(c.inputs.AX);
        const delta = Math.abs(asNum(c.params.delta, 50));
        if (!asBool(c.state.initialized)) {
          c.state.initialized = true;
          c.state.ref = ax;
        }
        const ref = asNum(c.state.ref, ax);
        return { Q: Math.abs(ax - ref) >= delta, SAVED: ref };
      },
    ),
    compactFn(
      "MATH_EXPR_SAFE",
      "Matemática",
      "Operação aritmética segura (V1 op1 V2 op2 V3 op3 V4) sem eval",
      [
        { name: "V1", type: "REAL", defaultValue: 0 },
        { name: "V2", type: "REAL", defaultValue: 0 },
        { name: "V3", type: "REAL", defaultValue: 0 },
        { name: "V4", type: "REAL", defaultValue: 0 },
      ],
      [{ name: "AQ", type: "REAL" }],
      (c) => {
        const ops = [
          String(c.params.op1 ?? "+"),
          String(c.params.op2 ?? "+"),
          String(c.params.op3 ?? "+"),
        ];
        const vals = [
          asNum(c.inputs.V1),
          asNum(c.inputs.V2),
          asNum(c.inputs.V3),
          asNum(c.inputs.V4),
        ];
        const highPriority = asBool(c.params.operatorPrecedence);
        const applyOp = (a: number, op: string, b: number): number => {
          switch (op) {
            case "-":
              return a - b;
            case "*":
              return a * b;
            case "/":
              if (b === 0) {
                c.fault("DIV_BY_ZERO", "Divisão por zero em MATH_EXPR_SAFE");
                return 0;
              }
              return a / b;
            default:
              return a + b;
          }
        };
        if (highPriority) {
          // Reduce * / first, then + -
          const terms: number[] = [vals[0]];
          const addOps: string[] = [];
          for (let i = 0; i < 3; i++) {
            const op = ops[i];
            if (op === "*" || op === "/") {
              terms[terms.length - 1] = applyOp(terms[terms.length - 1], op, vals[i + 1]);
            } else {
              addOps.push(op);
              terms.push(vals[i + 1]);
            }
          }
          let acc = terms[0];
          for (let i = 0; i < addOps.length; i++) {
            acc = applyOp(acc, addOps[i], terms[i + 1]);
          }
          return { AQ: acc };
        }
        let acc = vals[0];
        for (let i = 0; i < 3; i++) {
          acc = applyOp(acc, ops[i], vals[i + 1]);
        }
        return { AQ: acc };
      },
    ),
    compactFb(
      "ANALOG_FILTER",
      "Matemática",
      "Filtro média móvel analógica configurável (1..16 amostras)",
      [{ name: "AX", type: "REAL" }],
      [{ name: "AQ", type: "REAL" }],
      () => ({ buf: "[]", avg: 0 }),
      (c) => {
        const maxSamples = Math.max(1, Math.min(16, Math.trunc(asNum(c.params.samples, 4))));
        let parsed: number[] = [];
        try {
          const arr = JSON.parse(String(c.state.buf ?? "[]")) as unknown;
          if (Array.isArray(arr)) {
            parsed = arr.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
          }
        } catch {
          parsed = [];
        }
        parsed.push(asNum(c.inputs.AX));
        if (parsed.length > maxSamples) {
          parsed = parsed.slice(parsed.length - maxSamples);
        }
        const sum = parsed.reduce((acc, v) => acc + v, 0);
        const avg = sum / parsed.length;
        c.state.buf = JSON.stringify(parsed);
        c.state.avg = avg;
        return { AQ: Math.round(avg * 1000) / 1000 };
      },
    ),
    compactFb(
      "SHIFT_REGISTER",
      "Memória",
      "Registrador de deslocamento de 8 bits (S1..S8) com direção",
      [
        { name: "IN", type: "BOOL" },
        { name: "TRG", type: "BOOL" },
        { name: "DIR", type: "BOOL" },
      ],
      [
        { name: "Q1", type: "BOOL" },
        { name: "Q2", type: "BOOL" },
        { name: "Q3", type: "BOOL" },
        { name: "Q4", type: "BOOL" },
        { name: "Q5", type: "BOOL" },
        { name: "Q6", type: "BOOL" },
        { name: "Q7", type: "BOOL" },
        { name: "Q8", type: "BOOL" },
      ],
      () => ({ bits: 0, prevTrg: false }),
      (c) => {
        const trg = asBool(c.inputs.TRG);
        const inp = asBool(c.inputs.IN);
        const dirDown = asBool(c.inputs.DIR);
        let bits = asNum(c.state.bits, 0) & 0xff;
        if (trg && !asBool(c.state.prevTrg)) {
          if (!dirDown) {
            bits = ((bits << 1) | (inp ? 1 : 0)) & 0xff;
          } else {
            bits = ((bits >> 1) | (inp ? 0x80 : 0)) & 0xff;
          }
        }
        c.state.bits = bits;
        c.state.prevTrg = trg;
        return {
          Q1: (bits & 0x01) !== 0,
          Q2: (bits & 0x02) !== 0,
          Q3: (bits & 0x04) !== 0,
          Q4: (bits & 0x08) !== 0,
          Q5: (bits & 0x10) !== 0,
          Q6: (bits & 0x20) !== 0,
          Q7: (bits & 0x40) !== 0,
          Q8: (bits & 0x80) !== 0,
        };
      },
    ),
    compactFn(
      "MESSAGE_TEXT",
      "Variáveis",
      "Gera payload de mensagem textual sanitizada (display virtual)",
      [
        { name: "VAL1", type: "REAL", defaultValue: 0 },
        { name: "VAL2", type: "REAL", defaultValue: 0 },
      ],
      [
        { name: "ACTIVE", type: "BOOL" },
        { name: "TEXT", type: "STRING" },
      ],
      (c) => {
        const template = sanitizeDisplayText(String(c.params.template ?? "MSG: {1}"));
        const text = template
          .replace(/\{1\}/g, String(asNum(c.inputs.VAL1)))
          .replace(/\{2\}/g, String(asNum(c.inputs.VAL2)));
        return { ACTIVE: true, TEXT: text };
      },
    ),
    compactFb(
      "DATA_LOG",
      "Variáveis",
      "Registro determinístico de dados em borda de disparo",
      [
        { name: "VAL1", type: "REAL", defaultValue: 0 },
        { name: "VAL2", type: "REAL", defaultValue: 0 },
      ],
      [
        { name: "COUNT", type: "INT" },
        { name: "LAST_RECORD", type: "STRING" },
      ],
      () => ({ count: 0, lastRecord: "" }),
      (c) => {
        const count = asNum(c.state.count, 0) + 1;
        const epochMs = readSimEpochMs(c);
        const label = sanitizeDisplayText(String(c.params.label ?? "LOG"));
        const rec = JSON.stringify({
          seq: count,
          epochMs,
          label,
          v1: asNum(c.inputs.VAL1),
          v2: asNum(c.inputs.VAL2),
        });
        c.state.count = count;
        c.state.lastRecord = rec;
        return { COUNT: count, LAST_RECORD: rec };
      },
    ),
  ];
}

let sharedCompactRegistry: BlockRegistry | null = null;

/**
 * Returns the shared application BlockRegistry enriched with the compact controller pack.
 * Guarantees a single runtime registry across FBD, LAD, and eletric Studio.
 */
export function getCompactStudioRegistry(): BlockRegistry {
  if (sharedCompactRegistry) return sharedCompactRegistry;
  const reg = createDefaultRegistry();
  for (const def of compactBlockDefinitions()) {
    if (!reg.has(def.type)) {
      reg.register(def);
    }
  }
  sharedCompactRegistry = reg;
  return reg;
}
