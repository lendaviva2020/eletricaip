// ELÉTRICAI INDUSTRIAL OS — GATE 2.5 INTEGRITY AUDIT TEST SUITE
// Test Suite: Staleness Multi-rate Monotonic Detection & Operational Forcing Hardening
// Standards: ISA-101, IEC 62443, NR-10, NR-12

import { describe, it, expect, beforeEach } from "vitest";
import { IndustrialTagRuntime } from "@/lib/scada/tag-runtime";
import { DeterministicAlarmEngine } from "@/lib/scada/alarm-engine";
import type { ScadaTagDefinition } from "@/lib/scada/types";

describe("GATE 2.5 — FASE 4 & FASE 5: Staleness & Forcing Hardening", () => {
  let runtime: IndustrialTagRuntime;
  let alarmEngine: DeterministicAlarmEngine;
  let wallClockTime: number;
  let monotonicTime: number;

  beforeEach(() => {
    wallClockTime = 1700000000000;
    monotonicTime = 100000; // 100 seconds elapsed since boot
    runtime = new IndustrialTagRuntime({
      staleTimeoutMs: 5000,
      timeProvider: () => wallClockTime,
      monotonicClock: () => monotonicTime,
    });
    alarmEngine = new DeterministicAlarmEngine({
      timeProvider: () => wallClockTime,
    });
  });

  describe("FASE 4 — Staleness Detection & Multi-rate Monotonic Hardening", () => {
    it("1. Respeita timeouts diferenciados por TAG (Fast 200ms vs Slow 10s)", () => {
      // Fast telemetry tag: 200ms scan rate, explicit stale timeout = 600ms
      const fastTag: ScadaTagDefinition = {
        id: "tag_fast_vibration",
        name: "M-01_VIBRACOES",
        description: "Sensor de Vibração de Alta Velocidade",
        dataType: "REAL",
        unit: "mm/s",
        scaleMin: 0,
        scaleMax: 50,
        value: 2.1,
        quality: "GOOD",
        driver: "INTERNAL_RUNTIME",
        scanRateMs: 200,
        staleTimeoutMs: 600,
        lastUpdated: wallClockTime,
        forced: false,
        sourceAddress: "FAST.VIB",
      };

      // Slow telemetry tag: 5000ms scan rate, stale timeout = scanRateMs * 3 = 15000ms
      const slowTag: ScadaTagDefinition = {
        id: "tag_slow_temp",
        name: "TK-01_TEMP_AMBIENTE",
        description: "Temperatura Ambiente do Galpão",
        dataType: "REAL",
        unit: "°C",
        scaleMin: -10,
        scaleMax: 60,
        value: 24.5,
        quality: "GOOD",
        driver: "MODBUS_TCP",
        scanRateMs: 5000, // 3 * 5000 = 15000ms
        lastUpdated: wallClockTime,
        forced: false,
        sourceAddress: "MODBUS.TEMP",
      };

      runtime.registerTags([fastTag, slowTag]);

      // Advance time by 800ms
      monotonicTime += 800;
      wallClockTime += 800;

      const stales800 = runtime.evaluateStale();
      // Fast tag (800ms > 600ms timeout) must be STALE
      // Slow tag (800ms < 15000ms timeout) must remain GOOD
      expect(stales800.length).toBe(1);
      expect(stales800[0].tag.name).toBe("M-01_VIBRACOES");
      expect(runtime.getTag("tag_fast_vibration")?.quality).toBe("STALE");
      expect(runtime.getTag("tag_slow_temp")?.quality).toBe("GOOD");

      // Advance time by another 15000ms (total 15800ms)
      monotonicTime += 15000;
      wallClockTime += 15000;

      const stales15800 = runtime.evaluateStale();
      // Slow tag now also becomes STALE
      expect(stales15800.length).toBe(1);
      expect(stales15800[0].tag.name).toBe("TK-01_TEMP_AMBIENTE");
      expect(runtime.getTag("tag_slow_temp")?.quality).toBe("STALE");
    });

    it("2. Imunidade a salto de relógio de parede (NTP clock rollback não corrompe staleness)", () => {
      const tag: ScadaTagDefinition = {
        id: "tag_crit_flow",
        name: "P-01_VAZAO",
        description: "Vazão da Bomba P-01",
        dataType: "REAL",
        unit: "m³/h",
        scaleMin: 0,
        scaleMax: 100,
        value: 65.0,
        quality: "GOOD",
        driver: "OPC_UA",
        scanRateMs: 1000,
        staleTimeoutMs: 3000,
        lastUpdated: wallClockTime,
        forced: false,
        sourceAddress: "OPC.FLOW",
      };
      runtime.registerTag(tag);

      // System administrator or NTP rolls back wall-clock by 1 hour (3600s in past)
      // but monotonic clock moves forward by 4000ms
      wallClockTime -= 3600000;
      monotonicTime += 4000;

      // evaluateStale uses monotonic elapsed time: 4000ms > 3000ms timeout
      const stales = runtime.evaluateStale();
      expect(stales.length).toBe(1);
      expect(stales[0].tag.name).toBe("P-01_VAZAO");
      expect(runtime.getTag("tag_crit_flow")?.quality).toBe("STALE");
    });

    it("3. Transição para STALE aciona alarme de COMMUNICATION no Alarm Engine", () => {
      const tag: ScadaTagDefinition = {
        id: "tag_comm_test",
        name: "PLC_HEARTBEAT",
        description: "Heartbeat do CLP Principal",
        dataType: "BOOL",
        unit: "",
        scaleMin: 0,
        scaleMax: 1,
        value: 1,
        quality: "GOOD",
        driver: "OPC_UA",
        scanRateMs: 1000,
        staleTimeoutMs: 2500,
        lastUpdated: wallClockTime,
        forced: false,
        sourceAddress: "PLC.HB",
      };
      runtime.registerTag(tag);

      // Initially no comm alarm
      expect(alarmEngine.getActiveInstances().length).toBe(0);

      // Elapsed time exceeds 2500ms
      monotonicTime += 3000;
      wallClockTime += 3000;

      const stales = runtime.evaluateStale();
      expect(stales.length).toBe(1);

      // Evaluate tag in Alarm Engine
      const commEvents = alarmEngine.evaluateTag(stales[0].tag, wallClockTime);
      expect(commEvents.length).toBe(1);
      expect(commEvents[0].transition).toBe("TRIGGER");
      expect(commEvents[0].newCondition).toBe("ACTIVE");

      const activeAlarms = alarmEngine.getActiveInstances();
      expect(activeAlarms.length).toBe(1);
      expect(activeAlarms[0].alarmClass).toBe("COMMUNICATION");
      expect(activeAlarms[0].severity).toBe("HIGH");
      expect(activeAlarms[0].description).toContain("Falha de Comunicação / Sinal STALE");

      // Telemetry resumes: update arrives with GOOD quality
      monotonicTime += 500;
      wallClockTime += 500;
      const res = runtime.processUpdate({
        tagId: "tag_comm_test",
        tagName: "PLC_HEARTBEAT",
        projectId: "proj-hardened",
        rawValue: 1,
        dataType: "BOOL",
        source: "OPC_UA",
        sourceTimestamp: wallClockTime,
        receivedAt: wallClockTime,
        quality: "GOOD",
      });

      expect(res.tag.quality).toBe("GOOD");
      const recoveryEvents = alarmEngine.evaluateTag(res.tag, wallClockTime);
      // Because it was unacknowledged, ISA-18.2 transitions to RETURNED_TO_NORMAL
      expect(recoveryEvents.length).toBe(1);
      expect(recoveryEvents[0].transition).toBe("RETURN_TO_NORMAL");
      expect(recoveryEvents[0].newCondition).toBe("RETURNED_TO_NORMAL");
    });
  });

  describe("FASE 5 — Operational Forcing Hardening & Safety Interlocks", () => {
    it("1. Intertravamento de Segurança (NR-12 / IEC 62443): Bloqueia forçamento em TAGs críticas sem credencial", () => {
      const safetyTag: ScadaTagDefinition = {
        id: "tag_estop_status",
        name: "E-STOP_CIRCUITO_SEGURANCA",
        description: "Malha de Segurança Categoria 4 (NR-12)",
        dataType: "BOOL",
        unit: "",
        scaleMin: 0,
        scaleMax: 1,
        value: 1, // 1 = Circuito Fechado (Seguro)
        quality: "GOOD",
        driver: "INTERNAL_RUNTIME",
        scanRateMs: 100,
        lastUpdated: wallClockTime,
        forced: false,
        isSafetyCritical: true, // Marked strictly as safety critical!
        sourceAddress: "SAFETY.RELAY.CH1",
      };
      runtime.registerTag(safetyTag);

      // Attempt A: Normal operator attempts to force without safety credential
      expect(() => {
        runtime.forceTagValue("tag_estop_status", 1, {
          operator: "OPERADOR_COMUM",
          reason: "Burlar botão danificado",
        });
      }).toThrow(/SAFETY_INTERLOCK_VIOLATION/);

      expect(runtime.getTag("tag_estop_status")?.forced).toBe(false);
      expect(runtime.getTag("tag_estop_status")?.quality).toBe("GOOD");

      // Attempt B: Qualified Safety Engineer with authorizedSafetyOverride = true
      const forcedTag = runtime.forceTagValue("tag_estop_status", 1, {
        operator: "ENG_SEGURANCA_QUALIFICADO",
        reason: "Comissionamento de bancada com ART recolhida",
        authorizedSafetyOverride: true,
      });

      expect(forcedTag).not.toBeNull();
      expect(forcedTag?.forced).toBe(true);
      expect(forcedTag?.quality).toBe("FORCED");
      expect(forcedTag?.forcedBy).toBe("ENG_SEGURANCA_QUALIFICADO");
    });

    it("2. TTL de Forçamento: Expira automaticamente após tempo limite configurado", () => {
      const processTag: ScadaTagDefinition = {
        id: "tag_valve_override",
        name: "XV-01_POSICAO",
        description: "Comando Solenoide Válvula XV-01",
        dataType: "BOOL",
        unit: "",
        scaleMin: 0,
        scaleMax: 1,
        value: 0,
        quality: "GOOD",
        driver: "SIMULATION",
        scanRateMs: 1000,
        lastUpdated: wallClockTime,
        forced: false,
        sourceAddress: "VALVE.XV01",
      };
      runtime.registerTag(processTag);

      // Force with TTL = 5000ms (5 seconds)
      runtime.forceTagValue("tag_valve_override", 1, {
        operator: "TECNICO_CAMPO",
        reason: "Teste de estanqueidade temporário",
        ttlMs: 5000,
      });

      expect(runtime.getTag("tag_valve_override")?.forced).toBe(true);
      expect(runtime.getTag("tag_valve_override")?.value).toBe(1);

      // Incoming field reading before expiration (at 3000ms)
      wallClockTime += 3000;
      monotonicTime += 3000;
      runtime.processUpdate({
        tagId: "tag_valve_override",
        tagName: "XV-01_POSICAO",
        projectId: "proj-hardened",
        rawValue: 0,
        dataType: "BOOL",
        source: "SIMULATION",
        sourceTimestamp: wallClockTime,
        receivedAt: wallClockTime,
      });

      // Still forced because 3000ms < 5000ms TTL
      expect(runtime.getTag("tag_valve_override")?.forced).toBe(true);
      expect(runtime.getTag("tag_valve_override")?.value).toBe(1);

      // Advance time past TTL (total 6000ms)
      wallClockTime += 3000;
      monotonicTime += 3000;

      // Telemetry update arrives after TTL expiration
      const res = runtime.processUpdate({
        tagId: "tag_valve_override",
        tagName: "XV-01_POSICAO",
        projectId: "proj-hardened",
        rawValue: 0,
        dataType: "BOOL",
        source: "SIMULATION",
        sourceTimestamp: wallClockTime,
        receivedAt: wallClockTime,
      });

      // TTL expired: tag was auto-unforced and returned to field value!
      expect(res.tag.forced).toBe(false);
      expect(res.tag.value).toBe(0);
    });

    it("3. Preservação de Leituras Reais em Segundo Plano: Telemetria de campo não é descartada durante forçamento", () => {
      const tag: ScadaTagDefinition = {
        id: "tag_boiler_temp",
        name: "TC-01_TEMPERATURA",
        description: "Temperatura Caldeira",
        dataType: "REAL",
        unit: "°C",
        scaleMin: 0,
        scaleMax: 300,
        value: 120.0,
        quality: "GOOD",
        driver: "MODBUS_TCP",
        scanRateMs: 1000,
        lastUpdated: wallClockTime,
        forced: false,
        sourceAddress: "MODBUS.TC01",
      };
      runtime.registerTag(tag);

      const forced = runtime.forceTagValue("tag_boiler_temp", 100.0, {
        operator: "OPERADOR_1",
        reason: "Calibração de malha",
      });

      expect(forced?.value).toBe(100.0);
      expect(forced?.quality).toBe("FORCED");

      // Field sensor actually increases to 185.4°C
      wallClockTime += 1000;
      monotonicTime += 1000;
      const resForced = runtime.processUpdate({
        tagId: "tag_boiler_temp",
        tagName: "TC-01_TEMPERATURA",
        projectId: "proj-hardened",
        rawValue: 185.4,
        dataType: "REAL",
        source: "MODBUS_TCP",
        sourceTimestamp: wallClockTime,
        receivedAt: wallClockTime,
      });

      // Display value remains forced
      expect(resForced.tag.value).toBe(100.0);
      expect(resForced.historicalSample).toBeNull(); // No false field data ingested
      // Background field tracking preserves actual field temperature!
      expect(resForced.tag.unforcedValue).toBe(185.4);
      expect(resForced.tag.rawSampleValue).toBe(185.4);

      // Operator unforces the tag
      const unforcedTag = runtime.unforceTag("tag_boiler_temp");
      expect(unforcedTag).not.toBeNull();
      expect(unforcedTag?.forced).toBe(false);
      // Immediately recovers the true field value (185.4°C) without waiting for next scan!
      expect(unforcedTag?.value).toBe(185.4);
    });
  });
});
