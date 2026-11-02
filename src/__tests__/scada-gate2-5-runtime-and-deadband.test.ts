// ELÉTRICAI INDUSTRIAL OS — GATE 2.5 INTEGRITY AUDIT TEST SUITE
// Test Suite: Tag Runtime Hardening & Deadband Decoupling
// Standards: ISA-101, ISA-18.2, IEC 62443, OPC UA Part 8

import { describe, it, expect, beforeEach } from "vitest";
import { IndustrialTagRuntime } from "@/lib/scada/tag-runtime";
import { DeterministicAlarmEngine } from "@/lib/scada/alarm-engine";
import type { ScadaTagDefinition, ExtendedAlarmDefinition } from "@/lib/scada/types";

describe("GATE 2.5 — FASE 2 & FASE 3: Tag Runtime Hardening & Deadband Decoupling", () => {
  let runtime: IndustrialTagRuntime;
  let alarmEngine: DeterministicAlarmEngine;
  let virtualTime: number;

  beforeEach(() => {
    virtualTime = 1700000000000;
    runtime = new IndustrialTagRuntime({
      staleTimeoutMs: 5000,
      defaultDeadband: 0.5,
      timeProvider: () => virtualTime,
      monotonicClock: () => virtualTime,
    });
    alarmEngine = new DeterministicAlarmEngine({
      timeProvider: () => virtualTime,
    });
  });

  describe("FASE 2 — Tag Runtime Hardening (Values, Invalid Numbers & Clock Skew)", () => {
    it("1. Desativa clamping padrão: Preserva sobrecorrente física (55A em escala 0-50A) e marca isOutOfRange", () => {
      const tagDef: ScadaTagDefinition = {
        id: "tag_motor_current",
        name: "M-01_CORRENTE",
        description: "Corrente de Linha M-01",
        dataType: "REAL",
        unit: "A",
        scaleMin: 0,
        scaleMax: 50,
        value: 20.0,
        quality: "GOOD",
        driver: "MODBUS_TCP",
        scanRateMs: 500,
        lastUpdated: virtualTime,
        forced: false,
        sourceAddress: "40001",
      };
      runtime.registerTag(tagDef);

      // Excursion to 55A (above 50A scaleMax) with clampToLimits = false (default)
      virtualTime += 500;
      const res = runtime.processUpdate({
        tagId: "tag_motor_current",
        tagName: "M-01_CORRENTE",
        projectId: "proj-hardened",
        rawValue: 55.0,
        dataType: "REAL",
        source: "MODBUS_TCP",
        sourceTimestamp: virtualTime,
        receivedAt: virtualTime,
      });

      expect(res.tag.value).toBe(55.0); // NOT clamped to 50!
      expect(res.tag.isOutOfRange).toBe(true);
      expect(res.rawSampleValue).toBe(55.0);
      expect(res.unclampedValue).toBe(55.0);
    });

    it("2. Clamping explícito: Quando clampToLimits é verdadeiro, limita o valor ao teto da escala", () => {
      const tagDef: ScadaTagDefinition = {
        id: "tag_tank_level",
        name: "TK-01_NIVEL",
        description: "Nível Percentual TK-01",
        dataType: "REAL",
        unit: "%",
        scaleMin: 0,
        scaleMax: 100,
        value: 50.0,
        quality: "GOOD",
        driver: "SIMULATION",
        scanRateMs: 1000,
        lastUpdated: virtualTime,
        forced: false,
        sourceAddress: "SIM.TK01.LVL",
      };
      runtime.registerTag(tagDef);

      virtualTime += 1000;
      const res = runtime.processUpdate({
        tagId: "tag_tank_level",
        tagName: "TK-01_NIVEL",
        projectId: "proj-hardened",
        rawValue: 105.0,
        dataType: "REAL",
        source: "SIMULATION",
        sourceTimestamp: virtualTime,
        receivedAt: virtualTime,
        clampToLimits: true,
      });

      expect(res.tag.value).toBe(100.0); // Clamped to scaleMax 100
      expect(res.tag.isOutOfRange).toBe(false);
    });

    it("3. Valores Numéricos Inválidos (NaN, Infinity, -Infinity): Define quality = BAD e não gera amostra válida", () => {
      const tagDef: ScadaTagDefinition = {
        id: "tag_pressure",
        name: "P-01_PRESSAO",
        description: "Pressão de Descarga",
        dataType: "REAL",
        unit: "bar",
        scaleMin: 0,
        scaleMax: 10,
        value: 4.5,
        quality: "GOOD",
        driver: "OPC_UA",
        scanRateMs: 1000,
        lastUpdated: virtualTime,
        forced: false,
        sourceAddress: "ns=2;s=P01.Press",
      };
      runtime.registerTag(tagDef);

      // Case A: NaN (sensor breakdown or ADC transmission fault)
      virtualTime += 1000;
      const resNaN = runtime.processUpdate({
        tagId: "tag_pressure",
        tagName: "P-01_PRESSAO",
        projectId: "proj-hardened",
        rawValue: Number.NaN,
        dataType: "REAL",
        source: "OPC_UA",
        sourceTimestamp: virtualTime,
        receivedAt: virtualTime,
      });

      expect(resNaN.tag.quality).toBe("BAD");
      expect(resNaN.historicalSample).toBeNull();

      // Case B: Positive Infinity (division by zero in PLC calculation)
      virtualTime += 1000;
      const resInf = runtime.processUpdate({
        tagId: "tag_pressure",
        tagName: "P-01_PRESSAO",
        projectId: "proj-hardened",
        rawValue: Number.POSITIVE_INFINITY,
        dataType: "REAL",
        source: "OPC_UA",
        sourceTimestamp: virtualTime,
        receivedAt: virtualTime,
      });

      expect(resInf.tag.quality).toBe("BAD");
      expect(resInf.historicalSample).toBeNull();

      // Case C: Negative Infinity
      virtualTime += 1000;
      const resNegInf = runtime.processUpdate({
        tagId: "tag_pressure",
        tagName: "P-01_PRESSAO",
        projectId: "proj-hardened",
        rawValue: Number.NEGATIVE_INFINITY,
        dataType: "REAL",
        source: "OPC_UA",
        sourceTimestamp: virtualTime,
        receivedAt: virtualTime,
      });

      expect(resNegInf.tag.quality).toBe("BAD");
      expect(resNegInf.historicalSample).toBeNull();
    });

    it("4. Clock Skew (> 60s no futuro) e Timestamps Fora de Ordem: Define quality = UNCERTAIN", () => {
      const tagDef: ScadaTagDefinition = {
        id: "tag_flow",
        name: "FT-01_VAZAO",
        description: "Medidor Eletromagnético",
        dataType: "REAL",
        unit: "m³/h",
        scaleMin: 0,
        scaleMax: 100,
        value: 50.0,
        quality: "GOOD",
        driver: "OPC_UA",
        scanRateMs: 1000,
        lastUpdated: virtualTime,
        forced: false,
        sourceAddress: "ns=2;s=FT01.Flow",
      };
      runtime.registerTag(tagDef);

      // Case A: Future Timestamp (clock skew 120 seconds in future)
      const futureTime = virtualTime + 120000;
      const resSkew = runtime.processUpdate({
        tagId: "tag_flow",
        tagName: "FT-01_VAZAO",
        projectId: "proj-hardened",
        rawValue: 52.0,
        dataType: "REAL",
        source: "OPC_UA",
        sourceTimestamp: futureTime,
        receivedAt: virtualTime,
      });

      expect(resSkew.isClockSkewed).toBe(true);
      expect(resSkew.tag.quality).toBe("UNCERTAIN");

      // Case B: Normal update establishing lastSourceTimestamp
      virtualTime += 1000;
      runtime.processUpdate({
        tagId: "tag_flow",
        tagName: "FT-01_VAZAO",
        projectId: "proj-hardened",
        rawValue: 53.0,
        dataType: "REAL",
        source: "OPC_UA",
        sourceTimestamp: virtualTime,
        receivedAt: virtualTime,
      });

      // Case C: Out-of-order delayed network packet (timestamp older than previous)
      const resOutOfOrder = runtime.processUpdate({
        tagId: "tag_flow",
        tagName: "FT-01_VAZAO",
        projectId: "proj-hardened",
        rawValue: 51.0,
        dataType: "REAL",
        source: "OPC_UA",
        sourceTimestamp: virtualTime - 5000, // 5 seconds older
        receivedAt: virtualTime,
      });

      expect(resOutOfOrder.isTimestampOutOfOrder).toBe(true);
      expect(resOutOfOrder.tag.quality).toBe("UNCERTAIN");
    });
  });

  describe("FASE 3 — Deadband Decoupling & Storage Optimization", () => {
    it("1. Alarme dispara IMEDIATAMENTE mesmo quando Deadband suprime armazenamento no Historian", () => {
      // Setup Tag with initial 49.0A
      const tagDef: ScadaTagDefinition = {
        id: "tag_m01_load",
        name: "M-01_CORRENTE",
        description: "Corrente de Operação M-01",
        dataType: "REAL",
        unit: "A",
        scaleMin: 0,
        scaleMax: 60,
        value: 49.0,
        quality: "GOOD",
        driver: "MODBUS_TCP",
        scanRateMs: 1000,
        lastUpdated: virtualTime,
        forced: false,
        sourceAddress: "40005",
      };
      runtime.registerTag(tagDef);

      // Setup High Alarm at 49.2A (Hysteresis = 0.1)
      const alarmDef: ExtendedAlarmDefinition = {
        id: "alm_m01_high",
        projectId: "proj-hardened",
        tagId: "tag_m01_load",
        tagName: "M-01_CORRENTE",
        description: "Sobrecarga Alta M-01",
        alarmClass: "ELECTRICAL",
        severity: "HIGH",
        analogLimits: {
          high: 49.2,
          hysteresis: 0.1,
          delayOnMs: 0,
        },
        requireAck: true,
        autoClear: false,
        enabled: true,
      };
      alarmEngine.registerDefinition(alarmDef);

      // Verify no initial alarm at 49.0A
      const initialEvents = alarmEngine.evaluateTag(runtime.getTag("tag_m01_load")!, virtualTime);
      expect(initialEvents.length).toBe(0);
      expect(alarmEngine.getActiveInstances().length).toBe(0);

      // Telemetry update: 49.0A -> 49.25A
      // Delta = 0.25A, which is BELOW the deadband of 0.5A!
      virtualTime += 1000;
      const res = runtime.processUpdate({
        tagId: "tag_m01_load",
        tagName: "M-01_CORRENTE",
        projectId: "proj-hardened",
        rawValue: 49.25,
        dataType: "REAL",
        source: "MODBUS_TCP",
        sourceTimestamp: virtualTime,
        receivedAt: virtualTime,
        deadband: 0.5, // 0.5A deadband
      });

      // Verification A: Historian storage was suppressed because delta (0.25) < deadband (0.5)
      expect(res.historicalSample).toBeNull();
      // Verification B: Runtime tag value was updated immediately
      expect(res.tag.value).toBe(49.25);

      // Verification C: Alarm Engine evaluates live tag.value and triggers HIGH alarm!
      const alarmEvents = alarmEngine.evaluateTag(res.tag, virtualTime);
      expect(alarmEvents.length).toBe(1);
      expect(alarmEvents[0].transition).toBe("TRIGGER");
      expect(alarmEvents[0].newCondition).toBe("ACTIVE");
      expect(alarmEvents[0].value).toBe(49.25);

      const activeAlarms = alarmEngine.getActiveInstances();
      expect(activeAlarms.length).toBe(1);
      expect(activeAlarms[0].tagName).toBe("M-01_CORRENTE");
      expect(activeAlarms[0].severity).toBe("HIGH");
    });

    it("2. Benchmark de Eficiência do Deadband: Reduz mais de 80% do tráfego/armazenamento em sinal oscilatório", () => {
      const tagDef: ScadaTagDefinition = {
        id: "tag_level_steady",
        name: "TK-02_NIVEL",
        description: "Nível Estabilizado do Tanque 2",
        dataType: "REAL",
        unit: "%",
        scaleMin: 0,
        scaleMax: 100,
        value: 70.0,
        quality: "GOOD",
        driver: "INTERNAL_RUNTIME",
        scanRateMs: 1000,
        lastUpdated: virtualTime,
        forced: false,
        sourceAddress: "DB10.TK02_LVL",
      };
      runtime.registerTag(tagDef);

      let totalSamplesReceived = 0;
      let totalSamplesStored = 0;
      const deadband = 0.5; // 0.5% deadband

      // Simulate 100 cycles of minor sensor ripple (+/- 0.08% around 70.0%)
      // and only 5 true step changes (> 0.5%)
      for (let i = 1; i <= 100; i++) {
        virtualTime += 1000;
        totalSamplesReceived++;

        let raw: number;
        if (i === 20) raw = 71.5; // Step change 1 (+1.5%)
        else if (i === 50) raw = 68.0; // Step change 2 (-3.5%)
        else if (i === 80) raw = 74.0; // Step change 3 (+6.0%)
        else {
          // Ripple around latest baseline
          const noise = ((i % 5) - 2) * 0.04; // between -0.08% and +0.08%
          const base = i > 80 ? 74.0 : i > 50 ? 68.0 : i > 20 ? 71.5 : 70.0;
          raw = base + noise;
        }

        const res = runtime.processUpdate({
          tagId: "tag_level_steady",
          tagName: "TK-02_NIVEL",
          projectId: "proj-hardened",
          rawValue: raw,
          dataType: "REAL",
          source: "INTERNAL_RUNTIME",
          sourceTimestamp: virtualTime,
          receivedAt: virtualTime,
          deadband,
        });

        if (res.historicalSample !== null) {
          totalSamplesStored++;
        }
      }

      const reductionPercentage = ((totalSamplesReceived - totalSamplesStored) / totalSamplesReceived) * 100;

      // Expect reduction to exceed the 65% target (typically > 85%)
      expect(totalSamplesReceived).toBe(100);
      expect(reductionPercentage).toBeGreaterThan(80);
      expect(totalSamplesStored).toBeLessThanOrEqual(20);
    });
  });
});
