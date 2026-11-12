/**
 * Pure deterministic simulated clock for industrial PLC scan cycles.
 * Zero dependency on `Date.now()` or `performance.now()`.
 */

export interface SimulatedCalendarDate {
  readonly epochMs: number;
  readonly year: number;
  readonly month: number; // 1..12
  readonly day: number; // 1..31
  readonly dayOfWeek: number; // 0 (Sunday) .. 6 (Saturday)
  readonly hour: number; // 0..23
  readonly minute: number; // 0..59
  readonly second: number; // 0..59
  readonly minuteOfDay: number; // 0..1439
}

export interface SimulatedClock {
  readonly baseEpochMs: number;
  readonly elapsedMs: number;
}

/** Default deterministic simulated epoch: 2026-01-05 08:00:00.000 UTC (Monday). */
export const DEFAULT_SIMULATED_EPOCH_MS = Date.UTC(2026, 0, 5, 8, 0, 0, 0);

export function createSimulatedClock(baseEpochMs = DEFAULT_SIMULATED_EPOCH_MS): SimulatedClock {
  return {
    baseEpochMs,
    elapsedMs: 0,
  };
}

export function advanceSimulatedClock(clock: SimulatedClock, dtMs: number): SimulatedClock {
  if (!Number.isFinite(dtMs) || dtMs < 0) {
    throw new Error(`SIMULATED_CLOCK_ERROR: dtMs inválido (${String(dtMs)})`);
  }
  return {
    baseEpochMs: clock.baseEpochMs,
    elapsedMs: clock.elapsedMs + dtMs,
  };
}

export function jumpSimulatedClockTo(clock: SimulatedClock, targetEpochMs: number): SimulatedClock {
  if (!Number.isFinite(targetEpochMs)) {
    throw new Error(`SIMULATED_CLOCK_ERROR: epoch inválido (${String(targetEpochMs)})`);
  }
  return {
    baseEpochMs: targetEpochMs,
    elapsedMs: 0,
  };
}

export function getSimulatedEpochMs(clock: SimulatedClock): number {
  return clock.baseEpochMs + clock.elapsedMs;
}

export function getSimulatedCalendar(epochMs: number): SimulatedCalendarDate {
  const d = new Date(epochMs);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  return {
    epochMs,
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    dayOfWeek: d.getUTCDay(),
    hour,
    minute,
    second: d.getUTCSeconds(),
    minuteOfDay: hour * 60 + minute,
  };
}
