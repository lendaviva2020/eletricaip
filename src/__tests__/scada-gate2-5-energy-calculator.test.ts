// ELÉTRICAI INDUSTRIAL OS — GATE 2.5 INTEGRITY AUDIT TEST SUITE
// Test Suite: Hardened Electrical Energy Calculator (Trapezoidal Rule, Gaps & Quality)
// Standards: IEC 62053, IEEE 1459

import { describe, it, expect } from "vitest";
import {
  calculateEnergyKwhTrapezoidal,
  type EnergySampleInput,
} from "@/lib/scada/energy-calculator";

describe("GATE 2.5 — FASE 8: Hardened Electrical Energy Calculator", () => {
  const baseTime = 1700000000000; // Epoch ms

  it("1. Potência Constante: 10 kW durante 2 horas resulta exatamente em 20 kWh", () => {
    // 3 samples: t=0h (10kW), t=1h (10kW), t=2h (10kW)
    const samples: EnergySampleInput[] = [
      { timestamp: baseTime, powerValue: 10, quality: "GOOD" },
      { timestamp: baseTime + 3600 * 1000, powerValue: 10, quality: "GOOD" },
      { timestamp: baseTime + 7200 * 1000, powerValue: 10, quality: "GOOD" },
    ];

    const res = calculateEnergyKwhTrapezoidal(samples, { powerUnit: "kW", maxGapSeconds: 7200 });

    expect(res.totalEnergyKwh).toBe(20.0);
    expect(res.peakDemandKw).toBe(10.0);
    expect(res.averagePowerKw).toBe(10.0);
    expect(res.totalSpanHours).toBe(2.0);
    expect(res.validSamplesCount).toBe(3);
    expect(res.discardedSamplesCount).toBe(0);
    expect(res.gapsDetectedCount).toBe(0);
  });

  it("2. Rampa Linear: Rampa de 0 kW a 20 kW em 1 hora integra exatamente para 10 kWh", () => {
    // Trapezoidal rule integrates linear functions exactly: ((0 + 20) / 2) * 1h = 10 kWh
    const samples: EnergySampleInput[] = [
      { timestamp: baseTime, powerValue: 0, quality: "GOOD" },
      { timestamp: baseTime + 3600 * 1000, powerValue: 20, quality: "GOOD" },
    ];

    const res = calculateEnergyKwhTrapezoidal(samples, { powerUnit: "kW", maxGapSeconds: 3600 });

    expect(res.totalEnergyKwh).toBe(10.0);
    expect(res.peakDemandKw).toBe(20.0);
    expect(res.averagePowerKw).toBe(10.0);
  });

  it("3. Intervalos Irregulares: Integra precisamente com passos não-uniformes de telemetria (dt variável)", () => {
    // t=0: 10kW
    // t=0.5h (1800s): 30kW -> E1 = ((10+30)/2) * 0.5 = 10 kWh
    // t=1.5h (5400s): 30kW -> E2 = ((30+30)/2) * 1.0 = 30 kWh
    // t=2.0h (7200s): 10kW -> E3 = ((30+10)/2) * 0.5 = 10 kWh
    // Total = 10 + 30 + 10 = 50 kWh
    const samples: EnergySampleInput[] = [
      { timestamp: baseTime, powerValue: 10, quality: "GOOD" },
      { timestamp: baseTime + 1800 * 1000, powerValue: 30, quality: "GOOD" },
      { timestamp: baseTime + 5400 * 1000, powerValue: 30, quality: "GOOD" },
      { timestamp: baseTime + 7200 * 1000, powerValue: 10, quality: "GOOD" },
    ];

    const res = calculateEnergyKwhTrapezoidal(samples, { powerUnit: "kW", maxGapSeconds: 7200 });

    expect(res.totalEnergyKwh).toBe(50.0);
    expect(res.peakDemandKw).toBe(30.0);
    expect(res.averagePowerKw).toBe(25.0); // 50 kWh / 2h = 25 kW
    expect(res.totalSpanHours).toBe(2.0);
  });

  it("4. Conversão de Unidades: Converte Watts (W) para kWh dividindo corretamente por 1000", () => {
    // 5000 W (= 5 kW) for 1 hour -> 5 kWh
    const samples: EnergySampleInput[] = [
      { timestamp: baseTime, powerValue: 5000, quality: "GOOD" },
      { timestamp: baseTime + 3600 * 1000, powerValue: 5000, quality: "GOOD" },
    ];

    const res = calculateEnergyKwhTrapezoidal(samples, { powerUnit: "W", maxGapSeconds: 3600 });

    expect(res.totalEnergyKwh).toBe(5.0);
    expect(res.peakDemandKw).toBe(5.0);
    expect(res.averagePowerKw).toBe(5.0);
  });

  it("5. Descarte de Amostras BAD, STALE e Não-Finitas (NaN, Infinity): Impede contaminação da energia", () => {
    const samples: EnergySampleInput[] = [
      { timestamp: baseTime, powerValue: 10, quality: "GOOD" },
      { timestamp: baseTime + 600 * 1000, powerValue: Number.NaN, quality: "BAD" }, // Bad sensor
      { timestamp: baseTime + 1200 * 1000, powerValue: 999999, quality: "STALE" }, // Stale signal
      { timestamp: baseTime + 1800 * 1000, powerValue: Number.POSITIVE_INFINITY, quality: "BAD" },
      { timestamp: baseTime + 2400 * 1000, powerValue: -15, quality: "GOOD" }, // Negative power
      { timestamp: baseTime + 3600 * 1000, powerValue: 10, quality: "GOOD" },
    ];

    const res = calculateEnergyKwhTrapezoidal(samples, { powerUnit: "kW", maxGapSeconds: 3600 });

    // Only 2 valid samples remaining: t=0 (10kW) and t=3600s (10kW)
    expect(res.discardedSamplesCount).toBe(4);
    expect(res.validSamplesCount).toBe(2);
    expect(res.totalEnergyKwh).toBe(10.0); // 10 kW * 1h = 10 kWh
  });

  it("6. Detecção de Gaps de Comunicação: Bloqueia extrapolação perigosa durante blackouts", () => {
    // Normal interval between samples: 60s (1 min).
    // Hour 0 to 1: regular samples every 60s at 100 kW.
    // Hour 1 to 9: connection lost (8-hour gap).
    // Hour 9 to 10: regular samples resume every 60s at 100 kW.
    // With maxGapSeconds = 300 (5 min), normal 60s intervals are integrated, but 8h blackout gap is NOT!
    const samples: EnergySampleInput[] = [];

    // Hour 0 to 1 (60 samples, 100 kW each)
    for (let m = 0; m <= 60; m++) {
      samples.push({
        timestamp: baseTime + m * 60 * 1000,
        powerValue: 100,
        quality: "GOOD",
      });
    }

    // 8-hour gap between m=60 (1h) and m=540 (9h)

    // Hour 9 to 10 (60 samples, 100 kW each)
    for (let m = 540; m <= 600; m++) {
      samples.push({
        timestamp: baseTime + m * 60 * 1000,
        powerValue: 100,
        quality: "GOOD",
      });
    }

    const res = calculateEnergyKwhTrapezoidal(samples, { powerUnit: "kW", maxGapSeconds: 300 });

    // Total energy must be 200 kWh (100 kWh in first hour + 100 kWh in last hour), NOT 1000 kWh!
    expect(res.totalEnergyKwh).toBe(200.0);
    expect(res.gapsDetectedCount).toBe(1);
    expect(res.activeIntegrationHours).toBe(2.0);
    expect(res.totalSpanHours).toBe(10.0);
  });

  it("7. Resiliência: Trata duplicatas exatas de timestamp e amostras fora de ordem", () => {
    const samples: EnergySampleInput[] = [
      { timestamp: baseTime + 3600 * 1000, powerValue: 20, quality: "GOOD" }, // Out-of-order sample (1h)
      { timestamp: baseTime, powerValue: 10, quality: "GOOD" }, // Initial (0h)
      { timestamp: baseTime, powerValue: 10, quality: "GOOD" }, // Exact duplicate
    ];

    const res = calculateEnergyKwhTrapezoidal(samples, { powerUnit: "kW", maxGapSeconds: 3600 });

    expect(res.validSamplesCount).toBe(2);
    expect(res.totalEnergyKwh).toBe(15.0); // ((10 + 20) / 2) * 1h = 15 kWh
  });
});
