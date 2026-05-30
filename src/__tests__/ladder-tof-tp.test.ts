import { describe, it, expect } from "vitest";

// TOF pure logic mirror of runtime.tickTOF for unit testing.
function tickTOF(
  state: { accum: number; done: boolean; prevIn: boolean; lastTick: number },
  input: boolean,
  presetMs: number,
  now: number,
) {
  if (input) {
    state.accum = 0;
    state.done = true;
    state.lastTick = now;
  } else if (state.prevIn && !input) {
    state.accum = 0;
    state.done = true;
    state.lastTick = now;
  } else {
    const dt = Math.max(0, now - state.lastTick);
    state.accum += dt;
    state.lastTick = now;
    if (presetMs > 0 && state.accum >= presetMs) {
      state.accum = presetMs;
      state.done = false;
    }
  }
  state.prevIn = input;
  return { active: state.done, accum: state.accum };
}

function tickTP(
  state: { accum: number; done: boolean; prevIn: boolean; lastTick: number },
  input: boolean,
  presetMs: number,
  now: number,
) {
  if (input && !state.prevIn && !state.done && state.accum === 0) {
    state.done = true;
    state.lastTick = now;
    state.accum = 0;
  } else if (state.done) {
    const dt = Math.max(0, now - state.lastTick);
    state.accum += dt;
    state.lastTick = now;
    if (presetMs > 0 && state.accum >= presetMs) {
      state.accum = presetMs;
      state.done = false;
    }
  } else if (!input) {
    state.accum = 0;
    state.lastTick = now;
  }
  state.prevIn = input;
  return { active: state.done, accum: state.accum };
}

describe("TOF off-delay", () => {
  it("is active while input is high", () => {
    const s = { accum: 0, done: false, prevIn: false, lastTick: 0 };
    const r = tickTOF(s, true, 500, 0);
    expect(r.active).toBe(true);
  });

  it("stays active during off-delay and drops after preset", () => {
    const s = { accum: 0, done: true, prevIn: true, lastTick: 0 };
    expect(tickTOF(s, false, 500, 100).active).toBe(true);
    expect(tickTOF(s, false, 500, 300).active).toBe(true);
    expect(tickTOF(s, false, 500, 700).active).toBe(false);
  });
});

describe("TP pulse", () => {
  it("fires fixed-width pulse on rising edge", () => {
    const s = { accum: 0, done: false, prevIn: false, lastTick: 0 };
    expect(tickTP(s, true, 200, 0).active).toBe(true);
    expect(tickTP(s, true, 200, 100).active).toBe(true);
    expect(tickTP(s, true, 200, 250).active).toBe(false);
  });

  it("re-arms after input falls", () => {
    const s = { accum: 200, done: false, prevIn: true, lastTick: 250 };
    tickTP(s, false, 200, 260);
    expect(s.accum).toBe(0);
    const r = tickTP(s, true, 200, 270);
    expect(r.active).toBe(true);
  });
});
