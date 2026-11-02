// ELÉTRICAI INDUSTRIAL OS — GATE 2 TEST SUITE
// Test Suite: Industrial Tag Runtime (Scaling, Deadband, Staleness, Quality & Provenance)
// Standards: ISA-101, IEC 62443, OPC UA Unified Architecture Part 8

import { describe, it, expect, beforeEach } from "vitest";
import { IndustrialTagRuntime } from "@/lib/scada/tag-runtime";
import type { ScadaTagDefinition } from "@/lib/scada/types";

describe("GATE 2A — Industrial Tag Runtime Engine", () => {
  let runtime: IndustrialTagRuntime;
  let virtualTime: number;

  beforeEach(() => {
    virtualTime = 1700000000000;
    runtime = new IndustrialTagRuntime({
      staleTimeoutMs: 5000,
      defaultDeadband: 0.5,
      timeProvider: () => virtualTime,
    });
  });

  it("1. Scaling: Aplica conversão linear EU = Raw * Mult + Offset e limita a [scaleMin, scaleMax]", () => {
    const rawVal = 100;
    // 0-100% scaled to 0-50A: Mult = 0.5, Offset = 0
    const scaled = runtime.scaleValue(rawVal, 0.5, 0, 0, 45);
    // Should be clamped to 45
    expect(scaled).toBe(45);

    const normal = runtime.scaleValue(50, 0.5, 2, 0, 100);
    // 50 * 0.5 + 2 = 27
    expect(normal).toBe(27);
  });

  it("2. Deadband: Variações abaixo do deadband não geram nova amostra; variações significativas geram", () => {
    const tagDef: ScadaTagDefinition = {
      id: "tag_m01_current",
      name: "M-01_CORRENTE",
      description: "Corrente do Motor M-01",
      dataType: "REAL",
      unit: "A",
      scaleMin: 0,
      scaleMax: 50,
      value: 20.0,
      quality: "GOOD",
      driver: "SIMULATION",
      scanRateMs: 1000,
      lastUpdated: virtualTime,
      forced: false,
      sourceAddress: "PLC1.DB1.M01_I",
    };
    runtime.registerTag(tagDef);

    // Update with delta = 0.2 (below deadband of 0.5)
    virtualTime += 1000;
    const res1 = runtime.processUpdate({
      tagId: "tag_m01_current",
      tagName: "M-01_CORRENTE",
      projectId: "proj-1",
      rawValue: 20.2,
      dataType: "REAL",
      source: "SIMULATION",
      sourceTimestamp: virtualTime,
      receivedAt: virtualTime,
      deadband: 0.5,
    });

    expect(res1.hasChanged).toBe(true);
    expect(res1.historicalSample).toBeNull(); // Not stored because within deadband

    // Update with delta = 0.8 (exceeds deadband of 0.5)
    virtualTime += 1000;
    const res2 = runtime.processUpdate({
      tagId: "tag_m01_current",
      tagName: "M-01_CORRENTE",
      projectId: "proj-1",
      rawValue: 21.0,
      dataType: "REAL",
      source: "SIMULATION",
      sourceTimestamp: virtualTime,
      receivedAt: virtualTime,
      deadband: 0.5,
    });

    expect(res2.hasChanged).toBe(true);
    expect(res2.historicalSample).not.toBeNull();
    expect(res2.historicalSample?.value).toBe(21.0);
    expect(res2.historicalSample?.quality).toBe("GOOD");
  });

  it("3. Staleness: Detecta tags sem atualização superior a staleTimeoutMs e transiciona para STALE", () => {
    const tagDef: ScadaTagDefinition = {
      id: "tag_p01_flow",
      name: "P-01_VAZAO",
      description: "Vazão da Bomba P-01",
      dataType: "REAL",
      unit: "m³/h",
      scaleMin: 0,
      scaleMax: 120,
      value: 85.0,
      quality: "GOOD",
      driver: "SIMULATION",
      scanRateMs: 1000,
      lastUpdated: virtualTime,
      forced: false,
      sourceAddress: "PLC1.DB1.P01_Q",
    };
    runtime.registerTag(tagDef);

    // Advance virtual time by 3 seconds (within 5s timeout)
    virtualTime += 3000;
    const stales1 = runtime.evaluateStale(5000, virtualTime);
    expect(stales1.length).toBe(0);
    expect(runtime.getTag("tag_p01_flow")?.quality).toBe("GOOD");

    // Advance time past 5s (total 6 seconds elapsed)
    virtualTime += 3000;
    const stales2 = runtime.evaluateStale(5000, virtualTime);
    expect(stales2.length).toBe(1);
    expect(stales2[0].tag.name).toBe("P-01_VAZAO");
    expect(stales2[0].previousQuality).toBe("GOOD");
    expect(runtime.getTag("tag_p01_flow")?.quality).toBe("STALE");
  });

  it("4. Quality States: Suporta os estados GOOD, BAD, UNCERTAIN, STALE, NOT_CONNECTED, FORCED", () => {
    const tagDef: ScadaTagDefinition = {
      id: "tag_m01_temp",
      name: "M-01_TEMP",
      description: "Temperatura M-01",
      dataType: "REAL",
      unit: "°C",
      scaleMin: 0,
      scaleMax: 150,
      value: 45.0,
      quality: "GOOD",
      driver: "INTERNAL_RUNTIME",
      scanRateMs: 1000,
      lastUpdated: virtualTime,
      forced: false,
      sourceAddress: "PLC1.DB1.TEMP",
    };
    runtime.registerTag(tagDef);

    // Set to NOT_CONNECTED
    virtualTime += 1000;
    runtime.processUpdate({
      tagId: "tag_m01_temp",
      tagName: "M-01_TEMP",
      projectId: "proj-1",
      rawValue: 0,
      dataType: "REAL",
      source: "INTERNAL_RUNTIME",
      sourceTimestamp: virtualTime,
      receivedAt: virtualTime,
      quality: "NOT_CONNECTED",
    });
    expect(runtime.getTag("tag_m01_temp")?.quality).toBe("NOT_CONNECTED");

    // Set to UNCERTAIN
    virtualTime += 1000;
    runtime.processUpdate({
      tagId: "tag_m01_temp",
      tagName: "M-01_TEMP",
      projectId: "proj-1",
      rawValue: 46.0,
      dataType: "REAL",
      source: "INTERNAL_RUNTIME",
      sourceTimestamp: virtualTime,
      receivedAt: virtualTime,
      quality: "UNCERTAIN",
    });
    expect(runtime.getTag("tag_m01_temp")?.quality).toBe("UNCERTAIN");
  });

  it("5. Forçamento Operacional: Tag forçada retém valor manual e rejeita atualizações de campo até ser desforçada", () => {
    const tagDef: ScadaTagDefinition = {
      id: "tag_m01_pwr",
      name: "M-01_POTENCIA",
      description: "Potência do Motor M-01",
      dataType: "REAL",
      unit: "kW",
      scaleMin: 0,
      scaleMax: 30,
      value: 11.0,
      quality: "GOOD",
      driver: "SIMULATION",
      scanRateMs: 1000,
      lastUpdated: virtualTime,
      forced: false,
      sourceAddress: "PLC1.DB1.PWR",
    };
    runtime.registerTag(tagDef);

    // Operator forces tag to 25.0 kW
    virtualTime += 1000;
    const forcedTag = runtime.forceTagValue("tag_m01_pwr", 25.0);
    expect(forcedTag?.forced).toBe(true);
    expect(forcedTag?.quality).toBe("FORCED");
    expect(forcedTag?.value).toBe(25.0);

    // Field driver tries to write 12.0 kW (Must be IGNORED because tag is forced)
    virtualTime += 1000;
    const res = runtime.processUpdate({
      tagId: "tag_m01_pwr",
      tagName: "M-01_POTENCIA",
      projectId: "proj-1",
      rawValue: 12.0,
      dataType: "REAL",
      source: "SIMULATION",
      sourceTimestamp: virtualTime,
      receivedAt: virtualTime,
      quality: "GOOD",
    });

    expect(res.tag.value).toBe(25.0);
    expect(res.tag.quality).toBe("FORCED");
    expect(res.hasChanged).toBe(false);

    // Unforce tag
    const unforced = runtime.unforceTag("tag_m01_pwr");
    expect(unforced?.forced).toBe(false);

    // Now field update is accepted
    virtualTime += 1000;
    const res2 = runtime.processUpdate({
      tagId: "tag_m01_pwr",
      tagName: "M-01_POTENCIA",
      projectId: "proj-1",
      rawValue: 13.5,
      dataType: "REAL",
      source: "SIMULATION",
      sourceTimestamp: virtualTime,
      receivedAt: virtualTime,
      quality: "GOOD",
    });
    expect(res2.tag.value).toBe(13.5);
    expect(res2.tag.quality).toBe("GOOD");
  });

  it("6. Proveniência e Metadados: Amostras preservam source, sourceTimestamp, receivedAt e sequenceNumber", () => {
    const sourceTs = virtualTime - 50;
    const recvTs = virtualTime;
    const res = runtime.processUpdate({
      tagId: "tag_test_provenance",
      tagName: "TEST_TAG",
      projectId: "proj-client",
      rawValue: 42.1,
      dataType: "REAL",
      unit: "V",
      source: "MODBUS_TCP",
      sourceTimestamp: sourceTs,
      receivedAt: recvTs,
      sequenceNumber: 1042,
    });

    expect(res.historicalSample).not.toBeNull();
    expect(res.historicalSample?.source).toBe("MODBUS_TCP");
    expect(res.historicalSample?.sampledAt).toBe(sourceTs);
    expect(res.historicalSample?.receivedAt).toBe(recvTs);
    expect(res.historicalSample?.sequenceNumber).toBe(1042);
    expect(res.historicalSample?.projectId).toBe("proj-client");
  });
});
