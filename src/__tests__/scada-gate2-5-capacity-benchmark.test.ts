// ELÉTRICAI INDUSTRIAL OS — GATE 2.5 INTEGRITY AUDIT TEST SUITE
// Test Suite: Real-time Capacity & Scalability Benchmark
// Standards: IEC 62443, ISA-101, ISA-18.2

import { describe, it, expect } from "vitest";
import { IndustrialTagRuntime } from "@/lib/scada/tag-runtime";
import { DeterministicAlarmEngine } from "@/lib/scada/alarm-engine";
import type { ScadaTagDefinition, ExtendedAlarmDefinition } from "@/lib/scada/types";

export interface BenchmarkMetrics {
  tagCount: number;
  cycles: number;
  totalSamples: number;
  totalDurationMs: number;
  samplesPerSecond: number;
  avgTimePerSampleUs: number;
  samplesStored: number;
  deadbandSuppressionPct: number;
  avgAlarmEvalCycleMs: number;
}

describe("GATE 2.5 — FASE 10: Real-time Capacity & Scalability Benchmark", () => {
  it("Benchmark 1: 100 TAGs a 1 Hz durante 30 segundos (3.000 amostras)", () => {
    const TAG_COUNT = 100;
    const CYCLES = 30;
    const TOTAL_SAMPLES = TAG_COUNT * CYCLES;

    let virtualTime = 1700000000000;
    const runtime = new IndustrialTagRuntime({
      defaultDeadband: 0.5,
      timeProvider: () => virtualTime,
      monotonicClock: () => virtualTime,
    });
    const alarmEngine = new DeterministicAlarmEngine({
      timeProvider: () => virtualTime,
    });

    // Register 100 tags with associated alarm definitions
    for (let i = 0; i < TAG_COUNT; i++) {
      const tag: ScadaTagDefinition = {
        id: `tag_bench100_${i}`,
        name: `TI_${i.toString().padStart(3, "0")}_TEMP`,
        description: `Sensor de Temperatura Área ${i % 5}`,
        dataType: "REAL",
        unit: "°C",
        scaleMin: 0,
        scaleMax: 150,
        value: 50.0,
        quality: "GOOD",
        driver: "OPC_UA",
        scanRateMs: 1000,
        lastUpdated: virtualTime,
        forced: false,
        sourceAddress: `ns=2;s=TI${i}`,
      };
      runtime.registerTag(tag);

      // 50% of tags have High Alarm configured at 80°C
      if (i % 2 === 0) {
        const alm: ExtendedAlarmDefinition = {
          id: `alm_bench100_${i}`,
          projectId: "bench-proj",
          tagId: tag.id,
          tagName: tag.name,
          description: `Alarme Alta Temperatura ${tag.name}`,
          alarmClass: "PROCESS",
          severity: "HIGH",
          analogLimits: { high: 80.0, hysteresis: 1.0 },
          requireAck: true,
          autoClear: true,
          enabled: true,
        };
        alarmEngine.registerDefinition(alm);
      }
    }

    let samplesStored = 0;
    let totalAlarmEvalTimeMs = 0;

    const tStart = performance.now();

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      virtualTime += 1000;

      for (let i = 0; i < TAG_COUNT; i++) {
        // 85% minor ripple (+/- 0.1°C), 15% true excursion
        const isExcursion = (i + cycle) % 7 === 0;
        const val = isExcursion ? 82.5 : 50.0 + ((i % 5) - 2) * 0.05;

        const res = runtime.processUpdate({
          tagId: `tag_bench100_${i}`,
          tagName: `TI_${i.toString().padStart(3, "0")}_TEMP`,
          projectId: "bench-proj",
          rawValue: val,
          dataType: "REAL",
          source: "OPC_UA",
          sourceTimestamp: virtualTime,
          receivedAt: virtualTime,
          deadband: 0.5,
        });

        if (res.historicalSample !== null) {
          samplesStored++;
        }
      }

      // Cycle Alarm Evaluation
      const tAlarmStart = performance.now();
      const allTags = runtime.getAllTags();
      for (const t of allTags) {
        alarmEngine.evaluateTag(t, virtualTime);
      }
      totalAlarmEvalTimeMs += performance.now() - tAlarmStart;
    }

    const tEnd = performance.now();
    const durationMs = tEnd - tStart;
    const throughput = (TOTAL_SAMPLES / durationMs) * 1000;
    const avgUs = (durationMs / TOTAL_SAMPLES) * 1000;
    const suppressionPct = ((TOTAL_SAMPLES - samplesStored) / TOTAL_SAMPLES) * 100;
    const avgAlarmCycleMs = totalAlarmEvalTimeMs / CYCLES;

    // Numerical checks
    expect(TOTAL_SAMPLES).toBe(3000);
    expect(throughput).toBeGreaterThan(5000); // Expect > 5,000 samples/sec
    expect(avgUs).toBeLessThan(200); // Less than 200 microseconds per sample
    expect(suppressionPct).toBeGreaterThan(65); // Deadband storage saving > 65%
    expect(avgAlarmCycleMs).toBeLessThan(10); // Alarm evaluation under 10ms per 100-tag cycle
  });

  it("Benchmark 2: 500 TAGs a 1 Hz durante 10 segundos (5.000 amostras)", () => {
    const TAG_COUNT = 500;
    const CYCLES = 10;
    const TOTAL_SAMPLES = TAG_COUNT * CYCLES;

    let virtualTime = 1700000000000;
    const runtime = new IndustrialTagRuntime({
      defaultDeadband: 0.5,
      timeProvider: () => virtualTime,
      monotonicClock: () => virtualTime,
    });
    const alarmEngine = new DeterministicAlarmEngine({
      timeProvider: () => virtualTime,
    });

    for (let i = 0; i < TAG_COUNT; i++) {
      const tag: ScadaTagDefinition = {
        id: `tag_bench500_${i}`,
        name: `FIT_${i.toString().padStart(4, "0")}`,
        description: `Medidor Vazão Bloco ${i % 10}`,
        dataType: "REAL",
        unit: "m³/h",
        scaleMin: 0,
        scaleMax: 200,
        value: 100.0,
        quality: "GOOD",
        driver: "INTERNAL_RUNTIME",
        scanRateMs: 1000,
        lastUpdated: virtualTime,
        forced: false,
        sourceAddress: `PLC_FIT_${i}`,
      };
      runtime.registerTag(tag);

      if (i % 4 === 0) {
        alarmEngine.registerDefinition({
          id: `alm_bench500_${i}`,
          projectId: "bench-proj-500",
          tagId: tag.id,
          tagName: tag.name,
          description: `Alarme Vazão ${tag.name}`,
          alarmClass: "PROCESS",
          severity: "MEDIUM",
          analogLimits: { high: 150.0, hysteresis: 2.0 },
          requireAck: true,
          autoClear: true,
          enabled: true,
        });
      }
    }

    let samplesStored = 0;
    const tStart = performance.now();

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      virtualTime += 1000;

      for (let i = 0; i < TAG_COUNT; i++) {
        const noise = ((i % 5) - 2) * 0.05;
        const res = runtime.processUpdate({
          tagId: `tag_bench500_${i}`,
          tagName: `FIT_${i.toString().padStart(4, "0")}`,
          projectId: "bench-proj-500",
          rawValue: 100.0 + noise,
          dataType: "REAL",
          source: "INTERNAL_RUNTIME",
          sourceTimestamp: virtualTime,
          receivedAt: virtualTime,
          deadband: 0.5,
        });
        if (res.historicalSample !== null) samplesStored++;
      }
    }

    const durationMs = performance.now() - tStart;
    const throughput = (TOTAL_SAMPLES / durationMs) * 1000;
    const suppressionPct = ((TOTAL_SAMPLES - samplesStored) / TOTAL_SAMPLES) * 100;

    expect(TOTAL_SAMPLES).toBe(5000);
    expect(throughput).toBeGreaterThan(5000);
    expect(suppressionPct).toBeGreaterThan(80);
  });

  it("Benchmark 3: 1.000 TAGs a 1 Hz durante 5 segundos (5.000 amostras)", () => {
    const TAG_COUNT = 1000;
    const CYCLES = 5;
    const TOTAL_SAMPLES = TAG_COUNT * CYCLES;

    let virtualTime = 1700000000000;
    const runtime = new IndustrialTagRuntime({
      defaultDeadband: 0.5,
      timeProvider: () => virtualTime,
      monotonicClock: () => virtualTime,
    });

    for (let i = 0; i < TAG_COUNT; i++) {
      runtime.registerTag({
        id: `tag_bench1000_${i}`,
        name: `TAG_${i.toString().padStart(4, "0")}`,
        description: `TAG ${i}`,
        dataType: "REAL",
        unit: "kW",
        scaleMin: 0,
        scaleMax: 500,
        value: 250.0,
        quality: "GOOD",
        driver: "SIMULATION",
        scanRateMs: 1000,
        lastUpdated: virtualTime,
        forced: false,
        sourceAddress: `MODBUS.HR_${i}`,
      });
    }

    const tStart = performance.now();

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      virtualTime += 1000;
      for (let i = 0; i < TAG_COUNT; i++) {
        runtime.processUpdate({
          tagId: `tag_bench1000_${i}`,
          tagName: `TAG_${i.toString().padStart(4, "0")}`,
          projectId: "bench-proj-1000",
          rawValue: 250.0 + (cycle === 3 && i === 42 ? 20 : 0.02),
          dataType: "REAL",
          source: "SIMULATION",
          sourceTimestamp: virtualTime,
          receivedAt: virtualTime,
          deadband: 0.5,
        });
      }
    }

    const durationMs = performance.now() - tStart;
    const throughput = (TOTAL_SAMPLES / durationMs) * 1000;
    const avgUs = (durationMs / TOTAL_SAMPLES) * 1000;

    expect(TOTAL_SAMPLES).toBe(5000);
    expect(throughput).toBeGreaterThan(10000); // Over 10,000 samples/second!
    expect(avgUs).toBeLessThan(100); // Under 100 microseconds per sample!
  });
});
