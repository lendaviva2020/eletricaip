import { describe, it, expect } from "vitest";
import {
  motorNominalCurrent,
  motorStartingCurrent,
  pickCable_mm2,
  pickBreaker_A,
  calcMotor,
  calcDemand,
  voltageDrop_pct,
} from "../lib/electrical-calc";

describe("motorNominalCurrent", () => {
  it("calculates In for 7.5kW 380V motor", () => {
    const In = motorNominalCurrent({ id: "M-01", power_kW: 7.5 });
    expect(In).toBeGreaterThan(0);
    expect(In).toBeCloseTo(14.5, 0);
  });

  it("calculates In for 75kW 380V motor", () => {
    const In = motorNominalCurrent({ id: "M-01", power_kW: 75 });
    expect(In).toBeGreaterThan(130);
    expect(In).toBeLessThan(145);
  });

  it("handles custom voltage", () => {
    const In220 = motorNominalCurrent({ id: "M-01", power_kW: 7.5, voltage_V: 220 });
    const In380 = motorNominalCurrent({ id: "M-01", power_kW: 7.5, voltage_V: 380 });
    expect(In220).toBeGreaterThan(In380);
  });
});

describe("motorStartingCurrent", () => {
  it("DOL = 7x In", () => {
    expect(motorStartingCurrent({ id: "M", power_kW: 10, startMethod: "DOL" }, 14.5)).toBeCloseTo(
      101.5,
      0,
    );
  });

  it("SOFT = 3.5x In", () => {
    expect(motorStartingCurrent({ id: "M", power_kW: 10, startMethod: "SOFT" }, 14.5)).toBeCloseTo(
      50.75,
      0,
    );
  });

  it("VFD = 1.1x In", () => {
    expect(motorStartingCurrent({ id: "M", power_kW: 10, startMethod: "VFD" }, 14.5)).toBeCloseTo(
      15.95,
      0,
    );
  });
});

describe("pickCable_mm2", () => {
  it("14.5A -> 2.5mm²", () => {
    expect(pickCable_mm2(14.5)).toBe(2.5);
  });

  it("100A -> 35mm²", () => {
    expect(pickCable_mm2(100)).toBe(35);
  });

  it("300A -> 240mm² (com fator 1.25)", () => {
    expect(pickCable_mm2(300)).toBe(240);
  });
});

describe("pickBreaker_A", () => {
  it("14.5A -> 20A", () => {
    expect(pickBreaker_A(14.5)).toBe(20);
  });

  it("100A -> 125A", () => {
    expect(pickBreaker_A(100)).toBe(125);
  });

  it("300A -> 400A", () => {
    expect(pickBreaker_A(300)).toBe(400);
  });
});

describe("calcMotor", () => {
  it("returns full motor spec with calcs", () => {
    const result = calcMotor({ id: "M-01", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" });
    expect(result.In_A).toBeGreaterThan(0);
    expect(result.Istart_A).toBeGreaterThan(result.In_A);
    expect(result.cable_mm2).toBeGreaterThanOrEqual(2.5);
    expect(result.breaker_A).toBeGreaterThanOrEqual(result.In_A);
  });
});

describe("calcDemand", () => {
  it("calculates transformer size for multiple motors", () => {
    const motors = [
      { id: "M1", power_kW: 75 },
      { id: "M2", power_kW: 110 },
      { id: "M3", power_kW: 22 },
    ];
    const demand = calcDemand(motors);
    expect(demand.totalLoad_kW).toBe(207);
    expect(demand.transformer_kVA).toBeGreaterThan(0);
    expect(demand.current_A).toBeGreaterThan(0);
  });

  it("handles empty motor list", () => {
    const demand = calcDemand([]);
    expect(demand.totalLoad_kW).toBe(0);
    expect(demand.transformer_kVA).toBe(75);
  });
});

describe("voltageDrop_pct", () => {
  it("calculates drop for 100m 10mm² 50A", () => {
    const drop = voltageDrop_pct(50, 100, 10);
    expect(drop).toBeGreaterThan(0);
    expect(drop).toBeLessThan(5);
  });

  it("long run has bigger drop", () => {
    const short = voltageDrop_pct(50, 50, 10);
    const long = voltageDrop_pct(50, 200, 10);
    expect(long).toBeGreaterThan(short);
  });
});
