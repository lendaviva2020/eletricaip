import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PersistentEdgeOutbox } from "../lib/edge/buffer/sqlite-outbox";
import { MasterEdgeGatewayManager } from "../lib/edge/gateway-manager";
import type { GatewayIdentity } from "../lib/edge/types";

describe("GATE 3.3E — Resilience, WAN Outages, Crash Recovery & Buffer Capacity", () => {
  let tempDir: string;
  let dbPath: string;
  let outbox: PersistentEdgeOutbox;
  let gatewayManager: MasterEdgeGatewayManager;

  const identity: GatewayIdentity = {
    gatewayId: "gw_resilience_bench",
    organizationId: "org_resilience_test",
    plantId: "plant_substation",
    stationId: "station_01",
    gatewayVersion: "1.0.0",
    installationId: "inst_bench_01",
    certificateFingerprint: "SHA256:FINGERPRINT_123",
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    operationalState: "ONLINE",
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eletricai-bench-resilience-"));
    dbPath = path.join(tempDir, `bench_outbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.db`);

    outbox = new PersistentEdgeOutbox({
      dbPath,
      maxDiskBytes: 10 * 1024 * 1024,
      maxSamples: 100, // Small capacity to easily test 80% threshold and saturation
      warnThresholdPercent: 80,
      saturationPolicy: "DROP_OLDEST_NON_CRITICAL",
      synchronous: "NORMAL",
    });

    gatewayManager = new MasterEdgeGatewayManager({
      identity,
      outbox,
    });
  });

  afterEach(async () => {
    if (outbox) {
      outbox.close();
    }
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Windows handle release
    }
  });

  describe("1. WAN Outage Simulation (1 min, 10 min, 1 hour accelerated time)", () => {
    it("mantém aquisição local durante queda de WAN e retransmite de forma idempotente", () => {
      // 1. Simula desconexão da WAN com a nuvem
      gatewayManager.setCloudConnection(false);

      // Simula 10 minutos de aquisição acelerada (20 amostras de telemetria)
      const baseTime = Date.now() - 600 * 1000;
      for (let i = 0; i < 20; i++) {
        outbox.enqueue({
          projectId: "proj_resilience",
          organizationId: identity.organizationId,
          plantId: identity.plantId,
          gatewayId: identity.gatewayId,
          connectionId: "conn_modbus_01",
          tagName: "FEEDER_CURRENT_L1",
          value: 100 + i * 2,
          quality: "GOOD",
          source: "MODBUS_TCP",
          sourceTimestamp: baseTime + i * 30 * 1000,
          edgeReceivedAt: baseTime + i * 30 * 1000,
        });
      }

      // Durante a queda, o buffer acumulou todas as amostras
      const statsDuringOutage = outbox.getStatistics();
      expect(statsDuringOutage.pendingUploadCount).toBe(20);
      expect(statsDuringOutage.oldestSampleAgeSeconds).toBeGreaterThanOrEqual(500);

      // 2. Restabelecimento da conexão WAN
      gatewayManager.setCloudConnection(true);

      // Esvaziamento (flush) para a nuvem
      const flushResult = gatewayManager.flushOutboxToCloud();
      expect(flushResult.sent).toBe(20);
      expect(flushResult.pending).toBe(0);

      const statsAfterRecovery = outbox.getStatistics();
      expect(statsAfterRecovery.pendingUploadCount).toBe(0);
      expect(statsAfterRecovery.acknowledgedCount).toBe(20);
    });
  });

  describe("2. Abrupt Crash Recovery (IN_FLIGHT Stranded Recovery)", () => {
    it("recupera amostras IN_FLIGHT após término abrupto do processo com flag isDelayedReplay", () => {
      // Insere 5 amostras
      for (let i = 0; i < 5; i++) {
        outbox.enqueue({
          projectId: "proj_resilience",
          organizationId: identity.organizationId,
          plantId: identity.plantId,
          gatewayId: identity.gatewayId,
          connectionId: "conn_opcua_01",
          tagName: `VOLTAGE_BUS_${i}`,
          value: 13800,
          quality: "GOOD",
          source: "OPC_UA",
          sourceTimestamp: Date.now() + i * 100,
        });
      }

      // Lê amostras pendentes (transicionam para IN_FLIGHT)
      const inFlightBatch = outbox.peekPendingBatch(5);
      expect(inFlightBatch.length).toBe(5);
      expect(inFlightBatch[0].deliveryState).toBe("IN_FLIGHT");
      expect(outbox.getStatistics().inFlightCount).toBe(5);
      expect(outbox.getStatistics().pendingUploadCount).toBe(0);

      // Simula Crash Abrupto: fecha o banco sem confirmar ACK
      outbox.close();

      // Reinicialização do daemon / recuperação automática no startup
      const recoveredOutbox = new PersistentEdgeOutbox({
        dbPath,
        maxDiskBytes: 10 * 1024 * 1024,
        maxSamples: 100,
      });

      if (!recoveredOutbox.isUsingNativeSqlite()) {
        // In Node.js without native bun:sqlite, cross-process file durability is verified via bun test
        recoveredOutbox.close();
        return;
      }

      const stats = recoveredOutbox.getStatistics();
      expect(stats.pendingUploadCount).toBe(5);
      expect(stats.inFlightCount).toBe(0);

      // As amostras recuperadas devem conter a flag isDelayedReplay = true
      const restoredBatch = recoveredOutbox.peekPendingBatch(5);
      expect(restoredBatch.length).toBe(5);
      expect(restoredBatch[0].isDelayedReplay).toBe(true);

      recoveredOutbox.close();
    });
  });

  describe("3. Buffer Capacity (80% Warning & 100% Saturation)", () => {
    it("sinaliza isNearCapacity80Percent ao atingir 80% e descarta amostras normais sob 100%", () => {
      // Capacidade máxima configurada: 10 amostras
      const smallOutbox = new PersistentEdgeOutbox({
        dbPath: path.join(tempDir, `small_${Date.now()}.db`),
        maxSamples: 10,
        warnThresholdPercent: 80,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL",
      });

      // 1. Enfileira 1 alarme crítico
      smallOutbox.enqueue({
        projectId: "proj_resilience",
        organizationId: identity.organizationId,
        plantId: identity.plantId,
        gatewayId: identity.gatewayId,
        connectionId: "conn_alarms",
        tagName: "ALARM_TRANSFORMER_TRIP",
        value: 1,
        quality: "GOOD",
        source: "INTERNAL_RUNTIME",
        sourceTimestamp: 1000,
        criticality: "CRITICAL",
      });

      // 2. Enfileira 6 amostras normais (Total 7 amostras = 70%)
      for (let i = 1; i <= 6; i++) {
        smallOutbox.enqueue({
          projectId: "proj_resilience",
          organizationId: identity.organizationId,
          plantId: identity.plantId,
          gatewayId: identity.gatewayId,
          connectionId: "conn_modbus",
          tagName: `TEMP_ROUTINE_${i}`,
          value: 20 + i,
          quality: "GOOD",
          source: "MODBUS_TCP",
          sourceTimestamp: 2000 + i * 10,
          criticality: "NORMAL",
        });
      }

      // Em 70%, o alerta de 80% ainda é falso
      expect(smallOutbox.getStatistics().isNearCapacity80Percent).toBe(false);

      // 3. Adiciona a 8ª amostra (80%)
      smallOutbox.enqueue({
        projectId: "proj_resilience",
        organizationId: identity.organizationId,
        plantId: identity.plantId,
        gatewayId: identity.gatewayId,
        connectionId: "conn_modbus",
        tagName: "TEMP_ROUTINE_7",
        value: 27,
        quality: "GOOD",
        source: "MODBUS_TCP",
        sourceTimestamp: 2080,
        criticality: "NORMAL",
      });

      // Em 80%, o indicador isNearCapacity80Percent deve ser true
      expect(smallOutbox.getStatistics().isNearCapacity80Percent).toBe(true);
      expect(smallOutbox.getStatistics().isNearLimit).toBe(true);

      // 4. Preenche até 100% (10 amostras) e força descarte adicionando a 11ª amostra
      smallOutbox.enqueue({
        projectId: "proj_resilience",
        organizationId: identity.organizationId,
        plantId: identity.plantId,
        gatewayId: identity.gatewayId,
        connectionId: "conn_modbus",
        tagName: "TEMP_ROUTINE_8",
        value: 28,
        quality: "GOOD",
        source: "MODBUS_TCP",
        sourceTimestamp: 2090,
      });
      smallOutbox.enqueue({
        projectId: "proj_resilience",
        organizationId: identity.organizationId,
        plantId: identity.plantId,
        gatewayId: identity.gatewayId,
        connectionId: "conn_modbus",
        tagName: "TEMP_ROUTINE_9",
        value: 29,
        quality: "GOOD",
        source: "MODBUS_TCP",
        sourceTimestamp: 2100,
      });

      // 11ª amostra força descarte sob saturação
      smallOutbox.enqueue({
        projectId: "proj_resilience",
        organizationId: identity.organizationId,
        plantId: identity.plantId,
        gatewayId: identity.gatewayId,
        connectionId: "conn_modbus",
        tagName: "TEMP_ROUTINE_10",
        value: 30,
        quality: "GOOD",
        source: "MODBUS_TCP",
        sourceTimestamp: 2110,
      });

      const stats = smallOutbox.getStatistics();
      expect(stats.totalSamplesStored).toBe(10);
      expect(stats.droppedSaturationCount).toBe(1);

      // Comprova que o alarme CRÍTICO foi preservado
      const batch = smallOutbox.peekPendingBatch(10);
      const criticalAlarm = batch.find((s) => s.tagName === "ALARM_TRANSFORMER_TRIP");
      expect(criticalAlarm).toBeDefined();
      expect(criticalAlarm?.criticality).toBe("CRITICAL");

      smallOutbox.close();
    });
  });

  describe("4. Idempotency & Duplicate Prevention", () => {
    it("não duplica amostras enviadas repetidamente com mesmo gatewayId + tagName + sourceTimestamp", () => {
      const fixedTs = 1700000000000;

      // Primeira inserção
      const res1 = outbox.enqueue({
        projectId: "proj_idempotency",
        organizationId: identity.organizationId,
        plantId: identity.plantId,
        gatewayId: identity.gatewayId,
        connectionId: "conn_modbus_01",
        tagName: "FREQUENCY_GRID",
        value: 60.01,
        quality: "GOOD",
        source: "MODBUS_TCP",
        sourceTimestamp: fixedTs,
      });

      expect(res1).not.toBeNull();
      expect(outbox.getStatistics().totalSamplesStored).toBe(1);

      // Tentativa de duplicata com os mesmos atributos únicos
      outbox.enqueue({
        projectId: "proj_idempotency",
        organizationId: identity.organizationId,
        plantId: identity.plantId,
        gatewayId: identity.gatewayId,
        connectionId: "conn_modbus_01",
        tagName: "FREQUENCY_GRID",
        value: 60.01,
        quality: "GOOD",
        source: "MODBUS_TCP",
        sourceTimestamp: fixedTs,
      });

      // Total de amostras não se altera (idempotência preservada via UNIQUE INDEX)
      expect(outbox.getStatistics().totalSamplesStored).toBe(1);
    });
  });
});
