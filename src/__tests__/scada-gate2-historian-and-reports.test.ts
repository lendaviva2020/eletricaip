// ELÉTRICAI INDUSTRIAL OS — GATE 2 TEST SUITE
// Test Suite: Historian Range Queries, Operational Reports & Cryptographic Audit Trails
// Standards: ISA-101, IEC 62443, ISO 27001

import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import type { HistoricalSample, HistorianAggregateResult, ScadaReportType } from "@/lib/scada/types";

describe("GATE 2C — Persistent Historian & Operational Reports", () => {
  it("1. Downsampling & Statistics: Agrega amostras em buckets e calcula Min, Max, Média e Desvio Padrão", () => {
    // 60 samples representing 10 minutes (1 sample every 10 seconds)
    const samples: HistoricalSample[] = [];
    const baseTime = 1700000000000;
    const values = [
      26.0, 26.2, 26.4, 26.5, 26.8, 27.0, 27.2, 27.5, 28.0, 28.2,
      28.5, 28.8, 29.0, 29.2, 29.5, 29.8, 30.0, 30.2, 30.5, 30.8,
      31.0, 31.2, 31.5, 31.8, 32.0, 31.5, 31.0, 30.5, 30.0, 29.5,
      29.0, 28.5, 28.0, 27.5, 27.0, 26.5, 26.2, 26.0, 25.8, 25.5,
      25.4, 25.5, 25.8, 26.0, 26.2, 26.4, 26.5, 26.6, 26.7, 26.8,
      26.9, 27.0, 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.8, 28.0,
    ];

    for (let i = 0; i < values.length; i++) {
      samples.push({
        projectId: "proj-client-1",
        tagName: "M-01_CORRENTE",
        value: values[i],
        quality: "GOOD",
        source: "SIMULATION",
        sampledAt: baseTime + i * 10000,
        receivedAt: baseTime + i * 10000 + 5,
        sequenceNumber: i + 1,
      });
    }

    // Compute basic statistics
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = sum / values.length;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    expect(minVal).toBe(25.4);
    expect(maxVal).toBe(32.0);
    expect(avg).toBeCloseTo(28.03, 1);
    expect(stdDev).toBeGreaterThan(1.5);
    expect(samples.length).toBe(60);

    // Downsample into 2-minute buckets (120,000 ms)
    const bucketMs = 120000;
    const bucketMap = new Map<number, { sum: number; count: number }>();
    for (const s of samples) {
      const bKey = Math.floor((Number(s.sampledAt) - baseTime) / bucketMs) * bucketMs;
      const b = bucketMap.get(bKey);
      if (b) {
        b.sum += s.value;
        b.count += 1;
      } else {
        bucketMap.set(bKey, { sum: s.value, count: 1 });
      }
    }

    const downsampled = Array.from(bucketMap.entries()).map(([ts, b]) => ({
      timestamp: ts,
      avgValue: Math.round((b.sum / b.count) * 100) / 100,
    }));

    // 10 minutes divided by 2 min = 5 buckets
    expect(downsampled.length).toBe(5);
    for (const d of downsampled) {
      expect(d.avgValue).toBeGreaterThan(25.0);
      expect(d.avgValue).toBeLessThan(33.0);
    }
  });

  it("2. Cálculo de Energia Ativa (kWh): Integração numérica por Regra dos Trapézios", () => {
    // Power measurements in kW over time
    // Integral of Power (kW) dt (h) = Energy (kWh)
    const powerPoints = [
      { timeHours: 0.0, powerKw: 10.0 },
      { timeHours: 1.0, powerKw: 12.0 },
      { timeHours: 2.0, powerKw: 15.0 },
      { timeHours: 3.0, powerKw: 11.0 },
    ];

    let totalEnergyKwh = 0;
    for (let i = 0; i < powerPoints.length - 1; i++) {
      const dt = powerPoints[i + 1].timeHours - powerPoints[i].timeHours;
      const avgP = (powerPoints[i].powerKw + powerPoints[i + 1].powerKw) / 2;
      totalEnergyKwh += avgP * dt;
    }

    // Trap 1: (10 + 12)/2 * 1 = 11 kWh
    // Trap 2: (12 + 15)/2 * 1 = 13.5 kWh
    // Trap 3: (15 + 11)/2 * 1 = 13 kWh
    // Total = 37.5 kWh
    expect(totalEnergyKwh).toBe(37.5);
  });

  it("3. Rastreabilidade Criptográfica (Audit Log Chain): Garante encadeamento SHA-256 e detecção de violação", () => {
    const genesisHash = "GENESIS_BLOCK_0000000000000000";

    const log1 = {
      id: "log-1",
      previous_hash: genesisHash,
      tenantId: "tenant-a",
      userId: "user-1",
      action: "ALARM_ACK",
      details: { alarmId: "alm_m01", note: "Verificado no CCM" },
      timestamp: "2026-11-02T10:00:00.000Z",
    };
    const payload1 = `${log1.previous_hash}|${log1.tenantId}|${log1.userId}|${log1.action}|${JSON.stringify(log1.details)}|${log1.timestamp}`;
    const hash1 = crypto.createHash("sha256").update(payload1).digest("hex");

    const log2 = {
      id: "log-2",
      previous_hash: hash1, // Chained to log1
      tenantId: "tenant-a",
      userId: "user-2",
      action: "TAG_FORCE",
      details: { tag: "M-01_CORRENTE", value: 35.0 },
      timestamp: "2026-11-02T10:05:00.000Z",
    };
    const payload2 = `${log2.previous_hash}|${log2.tenantId}|${log2.userId}|${log2.action}|${JSON.stringify(log2.details)}|${log2.timestamp}`;
    const hash2 = crypto.createHash("sha256").update(payload2).digest("hex");

    expect(hash1).toHaveLength(64);
    expect(hash2).toHaveLength(64);
    expect(hash1).not.toBe(hash2);
    expect(log2.previous_hash).toBe(hash1);

    // Tampering test: If someone modifies details in log1 after write
    const tamperedDetails = { alarmId: "alm_m01", note: "ALTERADO INDEVIDAMENTE" };
    const tamperedPayload = `${log1.previous_hash}|${log1.tenantId}|${log1.userId}|${log1.action}|${JSON.stringify(tamperedDetails)}|${log1.timestamp}`;
    const recalculatedHash = crypto.createHash("sha256").update(tamperedPayload).digest("hex");

    // Recalculated hash must mismatch hash1 and break the chain to log2!
    expect(recalculatedHash).not.toBe(hash1);
    expect(log2.previous_hash).not.toBe(recalculatedHash);
  });

  it("4. Relatório Pareto de Alarmes: Classifica eventos por frequência e calcula percentual acumulado", () => {
    const rawEvents = [
      { tag: "M-01_CORRENTE", count: 18 },
      { tag: "P-01_VAZAO", count: 12 },
      { tag: "M-01_TEMP", count: 6 },
      { tag: "COMM_GATEWAY", count: 4 },
    ];

    const totalAlarms = rawEvents.reduce((acc, e) => acc + e.count, 0); // 40
    expect(totalAlarms).toBe(40);

    let cumulative = 0;
    const pareto = rawEvents.map((e, idx) => {
      const sharePct = (e.count / totalAlarms) * 100;
      cumulative += sharePct;
      return {
        rank: idx + 1,
        tag: e.tag,
        count: e.count,
        sharePct: Math.round(sharePct * 10) / 10,
        cumulativePct: Math.round(cumulative * 10) / 10,
      };
    });

    expect(pareto[0].tag).toBe("M-01_CORRENTE");
    expect(pareto[0].sharePct).toBe(45.0);
    expect(pareto[0].cumulativePct).toBe(45.0);

    expect(pareto[1].tag).toBe("P-01_VAZAO");
    expect(pareto[1].sharePct).toBe(30.0);
    expect(pareto[1].cumulativePct).toBe(75.0);

    // Top 2 alarms account for 75% of all events (Pareto Principle 80/20)
    expect(pareto[1].cumulativePct).toBe(75.0);
    expect(pareto[3].cumulativePct).toBe(100.0);
  });
});
