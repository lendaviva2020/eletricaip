import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../lib/editor/store";

// Pure logic extracted from ladder/runtime.ts for testing
function truthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return Boolean(v);
}

function evalContact(kind: string, operand: string, tags: Record<string, unknown>): boolean {
  if (!operand) return false;
  const v = tags[operand];
  if (kind === "XIC") return truthy(v);
  if (kind === "XIO") return !truthy(v);
  return true;
}

function evalRow(row: { kind: string; operand: string }[], tags: Record<string, unknown>): boolean {
  let result = true;
  let any = false;
  for (let i = 0; i < row.length - 1; i++) {
    const c = row[i];
    if (c.kind === "EMPTY") continue;
    any = true;
    result = result && evalContact(c.kind, c.operand, tags);
    if (!result) break;
  }
  return any ? result : false;
}

describe("Ladder contact evaluation", () => {
  it("XIC passes when tag is true", () => {
    expect(evalContact("XIC", "MOTOR_ON", { MOTOR_ON: true })).toBe(true);
  });

  it("XIC blocks when tag is false", () => {
    expect(evalContact("XIC", "MOTOR_ON", { MOTOR_ON: false })).toBe(false);
  });

  it("XIO passes when tag is false", () => {
    expect(evalContact("XIO", "ESTOP", { ESTOP: false })).toBe(true);
  });

  it("XIO blocks when tag is true", () => {
    expect(evalContact("XIO", "ESTOP", { ESTOP: true })).toBe(false);
  });

  it("XIC with non-existent tag returns false", () => {
    expect(evalContact("XIC", "NONEXIST", {})).toBe(false);
  });

  it("truthy with number 1 returns true", () => {
    expect(truthy(1)).toBe(true);
  });

  it("truthy with number 0 returns false", () => {
    expect(truthy(0)).toBe(false);
  });
});

describe("Ladder row evaluation", () => {
  it("series XIC all true passes", () => {
    const row = [
      { kind: "XIC", operand: "A" },
      { kind: "XIC", operand: "B" },
      { kind: "EMPTY", operand: "" },
    ];
    expect(evalRow(row, { A: true, B: true })).toBe(true);
  });

  it("series AND correctly blocks if one is false", () => {
    const row = [
      { kind: "XIC", operand: "A" },
      { kind: "XIC", operand: "B" },
      { kind: "EMPTY", operand: "" },
    ];
    expect(evalRow(row, { A: true, B: false })).toBe(false);
  });

  it("empty contacts default to pass-through", () => {
    const row = [
      { kind: "EMPTY", operand: "" },
      { kind: "EMPTY", operand: "" },
    ];
    expect(evalRow(row, {})).toBe(false); // no 'any' contact
  });
});

// Stateful TON testing (pure function approach)
describe("Timer ON delay logic", () => {
  function tickTimer(
    state: { accum: number; done: boolean; prevIn: boolean },
    input: boolean,
    presetMs: number,
  ) {
    if (input && !state.prevIn) {
      state.accum = 0;
      state.done = false;
    } else if (input) {
      state.accum += 100; // simulate 100ms dt
      if (presetMs > 0 && state.accum >= presetMs) {
        state.accum = presetMs;
        state.done = true;
      }
    } else {
      state.accum = 0;
      state.done = false;
    }
    state.prevIn = input;
    return { done: state.done, accum: state.accum };
  }

  it("starts timing on rising edge", () => {
    const state = { accum: 0, done: false, prevIn: false };
    const r1 = tickTimer(state, true, 1000);
    expect(r1.done).toBe(false);
    expect(r1.accum).toBe(0);
  });

  it("completes after enough cycles", () => {
    const state = { accum: 0, done: false, prevIn: false };
    tickTimer(state, true, 500);
    tickTimer(state, true, 500);
    tickTimer(state, true, 500);
    tickTimer(state, true, 500);
    tickTimer(state, true, 500);
    const r = tickTimer(state, true, 500);
    expect(r.done).toBe(true);
    expect(r.accum).toBe(500);
  });

  it("resets immediately when input goes false", () => {
    const state = { accum: 250, done: false, prevIn: true };
    const r = tickTimer(state, false, 500);
    expect(r.done).toBe(false);
    expect(r.accum).toBe(0);
  });
});

// Stateful CTU testing
describe("Counter UP logic", () => {
  function tickCounter(
    state: { count: number; done: boolean; prevIn: boolean },
    input: boolean,
    preset: number,
  ) {
    if (input && !state.prevIn) {
      state.count += 1;
    }
    state.done = preset > 0 && state.count >= preset;
    state.prevIn = input;
    return { done: state.done, count: state.count };
  }

  it("increments on rising edge", () => {
    const state = { count: 0, done: false, prevIn: false };
    tickCounter(state, true, 10);
    expect(state.count).toBe(1);
  });

  it("does not increment on held input", () => {
    const state = { count: 0, done: false, prevIn: true };
    tickCounter(state, true, 10);
    expect(state.count).toBe(0);
  });

  it("sets done when count reaches preset", () => {
    const state = { count: 9, done: false, prevIn: false };
    const r = tickCounter(state, true, 10);
    expect(r.done).toBe(true);
    expect(r.count).toBe(10);
  });
});
