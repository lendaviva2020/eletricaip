import { describe, expect, it } from "vitest";
import {
  FLOW_SPACING,
  faultBlinkAlpha,
  flowParticles,
  pointAtDistance,
  polylineLength,
  tripPulse,
  TRIP_PULSE_MS,
} from "@/lib/diagram/render/flow-animation";

const L = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
];

describe("animação da corrente no unifilar", () => {
  it("mede e percorre a polilinha", () => {
    expect(polylineLength(L)).toBe(150);
    expect(pointAtDistance(L, 120)).toEqual({ x: 100, y: 20 });
    expect(pointAtDistance(L, 999)).toEqual({ x: 100, y: 50 });
  });

  it("partículas andam da origem para a carga e ficam sobre o fio", () => {
    const a = flowParticles(L, 0);
    const b = flowParticles(L, 100);
    expect(a.length).toBeGreaterThan(0);
    expect(a[0]).not.toEqual(b[0]);
    for (const p of [...a, ...b]) {
      const onFirst = p.y === 0 && p.x >= 0 && p.x <= 100;
      const onSecond = p.x === 100 && p.y >= 0 && p.y <= 50;
      expect(onFirst || onSecond).toBe(true);
    }
    expect(a.length).toBeLessThanOrEqual(Math.ceil(150 / FLOW_SPACING) + 1);
  });

  it("limita partículas em cabos longos (celular)", () => {
    const longo = [
      { x: 0, y: 0 },
      { x: 100000, y: 0 },
    ];
    expect(flowParticles(longo, 0).length).toBeLessThanOrEqual(81);
    expect(flowParticles([{ x: 0, y: 0 }], 0)).toEqual([]);
  });

  it("falta pisca e o pulso de manobra some no tempo certo", () => {
    for (let t = 0; t < 2000; t += 37) {
      const a = faultBlinkAlpha(t);
      expect(a).toBeGreaterThanOrEqual(0.35 - 1e-9);
      expect(a).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(tripPulse(0)?.alpha).toBe(1);
    expect(tripPulse(TRIP_PULSE_MS + 1)).toBeNull();
  });
});
