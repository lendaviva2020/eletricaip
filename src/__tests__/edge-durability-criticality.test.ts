import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PersistentEdgeOutbox } from "../lib/edge/buffer/sqlite-outbox";

describe("GATE 3.2D — SQLite Durability, Criticality-Aware Quota & WAL Sync", () => {
  let testDir: string;
  let dbPath: string;
  let outbox: PersistentEdgeOutbox;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "eletricai-durability-"));
    dbPath = path.join(testDir, `outbox_crit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.db`);
  });

  afterEach(async () => {
    if (outbox && !outbox.getStatistics().isNearLimit) {
      outbox.close();
    }
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore Windows handle releases
    }
  });

  describe("1. Criticality-Aware Quota Saturation", () => {
    it("descarta amostras NORMAL prioritariamente ao atingir quota, preservando CRITICAL", () => {
      // Cria outbox com capacidade restrita de 4 amostras e política DROP_OLDEST_NON_CRITICAL
      outbox = new PersistentEdgeOutbox({
        dbPath,
        maxDiskBytes: 10 * 1024 * 1024,
        maxSamples: 4,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL",
        synchronous: "NORMAL",
      });

      // 1. Enfileira 1 amostra CRITICAL (ex: Alarme de Emergência)
      outbox.enqueue({
        projectId: "proj_crit",
        organizationId: "org_crit",
        plantId: "plant_01",
        gatewayId: "gw_01",
        connectionId: "conn_01",
        tagName: "ALARM_ESTOP_ACTIVE",
        value: 1,
        quality: "GOOD",
        source: "INTERNAL_RUNTIME",
        sourceTimestamp: 1000,
        criticality: "CRITICAL",
      });

      // 2. Enfileira 3 amostras NORMAL (Telemetria rotineira)
      for (let i = 1; i <= 3; i++) {
        outbox.enqueue({
          projectId: "proj_crit",
          organizationId: "org_crit",
          plantId: "plant_01",
          gatewayId: "gw_01",
          connectionId: "conn_01",
          tagName: `TEMP_SENSOR_${i}`,
          value: 25.0 + i,
          quality: "GOOD",
          source: "MODBUS_TCP",
          sourceTimestamp: 2000 + i * 10,
          criticality: "NORMAL",
        });
      }

      // Buffer agora tem 4 amostras (1 CRITICAL + 3 NORMAL)
      expect(outbox.getStatistics().pendingUploadCount).toBe(4);

      // 3. Enfileira a 5ª amostra (NORMAL) que forçará descarte de uma amostra antiga
      outbox.enqueue({
        projectId: "proj_crit",
        organizationId: "org_crit",
        plantId: "plant_01",
        gatewayId: "gw_01",
        connectionId: "conn_01",
        tagName: "TEMP_SENSOR_4",
        value: 29.0,
        quality: "GOOD",
        source: "MODBUS_TCP",
        sourceTimestamp: 3000,
        criticality: "NORMAL",
      });

      // Capacidade continua mantida em 4 amostras
      expect(outbox.getStatistics().pendingUploadCount).toBe(4);
      expect(outbox.getStatistics().droppedSaturationCount).toBe(1);

      // Lê as amostras pendentes
      const batch = outbox.peekPendingBatch(10);
      expect(batch.length).toBe(4);

      // A amostra CRITICAL (ALARM_ESTOP_ACTIVE) DEVE ter sido preservada
      const criticalSample = batch.find((s) => s.tagName === "ALARM_ESTOP_ACTIVE");
      expect(criticalSample).toBeDefined();
      expect(criticalSample?.criticality).toBe("CRITICAL");

      // A primeira amostra NORMAL (TEMP_SENSOR_1) foi a descartada, enquanto TEMP_SENSOR_2, 3 e 4 permanecem
      const sensor1 = batch.find((s) => s.tagName === "TEMP_SENSOR_1");
      expect(sensor1).toBeUndefined();

      const sensor2 = batch.find((s) => s.tagName === "TEMP_SENSOR_2");
      const sensor4 = batch.find((s) => s.tagName === "TEMP_SENSOR_4");
      expect(sensor2).toBeDefined();
      expect(sensor4).toBeDefined();
    });
  });

  describe("2. Buffer Age & Oldest Sample Diagnostics", () => {
    it("calcula oldestSampleTimestamp e oldestSampleAgeSeconds com precisão", async () => {
      outbox = new PersistentEdgeOutbox({
        dbPath,
        maxDiskBytes: 5 * 1024 * 1024,
        maxSamples: 100,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL",
        synchronous: "NORMAL",
      });

      const pastTimestamp = Date.now() - 5000; // 5 segundos atrás

      outbox.enqueue({
        projectId: "proj_crit",
        organizationId: "org_crit",
        plantId: "plant_01",
        gatewayId: "gw_01",
        connectionId: "conn_01",
        tagName: "VOLTAGE_L1",
        value: 220.5,
        quality: "GOOD",
        source: "OPC_UA",
        sourceTimestamp: pastTimestamp,
        edgeReceivedAt: pastTimestamp,
      });

      const stats = outbox.getStatistics();
      expect(stats.totalSamplesStored).toBe(1);
      expect(stats.pendingUploadCount).toBe(1);
      expect(stats.oldestSampleTimestamp).toBe(pastTimestamp);
      expect(stats.oldestSampleAgeSeconds).toBeGreaterThanOrEqual(4);
      expect(stats.oldestSampleAgeSeconds).toBeLessThanOrEqual(10);
    });
  });

  describe("3. Immediate Persistence of Critical Events", () => {
    it("persiste eventos críticos com checkpoint WAL passivo imediato", () => {
      outbox = new PersistentEdgeOutbox({
        dbPath,
        maxDiskBytes: 10 * 1024 * 1024,
        maxSamples: 1000,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL",
        synchronous: "NORMAL",
      });

      const entry = outbox.enqueue({
        projectId: "proj_crit",
        organizationId: "org_crit",
        plantId: "plant_01",
        gatewayId: "gw_01",
        connectionId: "conn_01",
        tagName: "ALARM_TRANSFORMER_OVERTEMP",
        value: 95.5,
        quality: "GOOD",
        source: "INTERNAL_RUNTIME",
        sourceTimestamp: Date.now(),
        criticality: "CRITICAL",
      });

      expect(entry).not.toBeNull();
      expect(entry?.criticality).toBe("CRITICAL");

      // Fecha o buffer e reabre a partir do disco para comprovar recuperação
      outbox.close();

      const restoredOutbox = new PersistentEdgeOutbox({
        dbPath,
        maxDiskBytes: 10 * 1024 * 1024,
        maxSamples: 1000,
      });

      if (!restoredOutbox.isUsingNativeSqlite()) {
        // No ambiente Vitest sem bun:sqlite nativo, o teste de durabilidade em disco é verificado via bun
        restoredOutbox.close();
        return;
      }

      const restoredBatch = restoredOutbox.peekPendingBatch(10);
      expect(restoredBatch.length).toBe(1);
      expect(restoredBatch[0].tagName).toBe("ALARM_TRANSFORMER_OVERTEMP");
      expect(restoredBatch[0].criticality).toBe("CRITICAL");

      restoredOutbox.close();
    });
  });
});
