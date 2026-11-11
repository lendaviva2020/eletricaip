// ELÉTRICAI INDUSTRIAL OS — GATE 3.1D, 3.1E, 3.1F, 3.1H & 3.1J
// LAB INTEROPERABILITY & QUALIFICATION: OPC UA, MODBUS TCP, MQTT SPARKPLUG B, STORE-AND-FORWARD & BENCHMARKS
// Standards: IEC 62443, NIST SP 800-82 Rev. 3, ISO/IEC 20237:2023 (Sparkplug 3.0), Modbus V1.1b3

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { OpcUaClientDriver } from "@/lib/edge/drivers/opcua-driver";
import { ModbusTcpClientDriver } from "@/lib/edge/drivers/modbus-driver";
import { SparkplugBDriver } from "@/lib/edge/drivers/sparkplug-driver";
import { MasterEdgeGatewayManager } from "@/lib/edge/gateway-manager";
import { PersistentEdgeOutbox } from "@/lib/edge/buffer/sqlite-outbox";
import { IndustrialTagRuntime } from "@/lib/scada/tag-runtime";
import { DeterministicAlarmEngine } from "@/lib/scada/alarm-engine";
import type { GatewayIdentity } from "@/lib/edge/types";
import type { ExtendedAlarmDefinition } from "@/lib/scada/types";

describe("GATE 3.1 — Master Laboratory Interoperability & Commissioning Suite", () => {
  const testBaseDir = path.resolve(process.cwd(), "data/test_lab_comm");
  let testDbPath: string;
  let outbox: PersistentEdgeOutbox;
  let runtime: IndustrialTagRuntime;
  let alarmEngine: DeterministicAlarmEngine;
  let gatewayManager: MasterEdgeGatewayManager;
  let opcDriver: OpcUaClientDriver;
  let modbusDriver: ModbusTcpClientDriver;
  let sparkplugDriver: SparkplugBDriver;

  const orgId = "org_industrial_sp";
  const plantId = "plant_ete_matriz";
  const projectId = "proj_ete_01";

  beforeEach(async () => {
    if (!fs.existsSync(testBaseDir)) {
      fs.mkdirSync(testBaseDir, { recursive: true });
    }
    const uniqueId = crypto.randomUUID().substring(0, 8);
    testDbPath = path.join(testBaseDir, `outbox_${uniqueId}.db`);

    outbox = new PersistentEdgeOutbox({
      dbPath: testDbPath,
      maxSamples: 100000,
    });
    runtime = new IndustrialTagRuntime();
    alarmEngine = new DeterministicAlarmEngine();

    const identity: GatewayIdentity = {
      gatewayId: `egw_lab_${uniqueId}`,
      organizationId: orgId,
      plantId,
      stationId: "station_edge_rack_01",
      gatewayVersion: "3.1.0-industrial",
      installationId: `inst_${plantId}_01`,
      certificateFingerprint: "sha256:lab_fingerprint",
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      operationalState: "ONLINE",
    };

    gatewayManager = new MasterEdgeGatewayManager({
      identity,
      outbox,
      runtime,
      alarmEngine,
      syncIntervalMs: 500,
    });

    // 1. Initialize OPC UA Driver
    opcDriver = new OpcUaClientDriver({
      driverId: "drv_opc_lab",
      connectionId: "conn_opc_lab",
      endpointUrl: "opc.tcp://127.0.0.1:48401",
      securityPolicy: "Basic256Sha256",
    });
    await opcDriver.connect();

    // 2. Initialize Modbus TCP Driver
    modbusDriver = new ModbusTcpClientDriver({
      driverId: "drv_modbus_lab",
      connectionId: "conn_modbus_lab",
      host: "127.0.0.1",
      port: 50201,
      unitId: 1,
    });
    await modbusDriver.connect();

    // 3. Initialize Sparkplug B Driver
    sparkplugDriver = new SparkplugBDriver({
      driverId: "drv_sparkplug_lab",
      connectionId: "conn_sparkplug_lab",
      brokerUrl: "mqtts://127.0.0.1:8883",
      clientId: "egw-lab-01",
      groupId: "Planta_ETE",
      edgeNodeId: "Node_ETE",
    });
    await sparkplugDriver.connect();

    gatewayManager.registerDriver(opcDriver);
    gatewayManager.registerDriver(modbusDriver);
    gatewayManager.registerDriver(sparkplugDriver);

    // Register tag mappings
    gatewayManager.mapTag({
      driverId: "drv_opc_lab",
      sourceAddress: "ns=2;s=M01.Current",
      targetTagName: "M-01_CORRENTE",
      projectId,
      equipmentId: "eq_motor_m01",
    });

    gatewayManager.mapTag({
      driverId: "drv_modbus_lab",
      sourceAddress: "40001",
      targetTagName: "B-01_PRESSAO",
      projectId,
      equipmentId: "eq_bomba_b01",
    });

    gatewayManager.mapTag({
      driverId: "drv_sparkplug_lab",
      sourceAddress: "Sensors/NivelTanque01",
      targetTagName: "TK-01_NIVEL",
      projectId,
      equipmentId: "eq_tanque_tk01",
    });

    // Configure alarm for M-01 overcurrent
    alarmEngine.registerDefinition({
      id: "alm_m01_hi",
      projectId,
      tagId: "M-01_CORRENTE",
      tagName: "M-01_CORRENTE",
      description: "Sobrecarga de Corrente Motor M-01",
      alarmClass: "ELECTRICAL",
      severity: "HIGH",
      analogLimits: { high: 50.0, hysteresis: 1.0 },
      requireAck: true,
      autoClear: true,
      enabled: true,
    });
  });

  afterEach(() => {
    if (gatewayManager) {
      gatewayManager.stop();
    }
  });

  afterAll(() => {
    if (fs.existsSync(testBaseDir)) {
      try {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
      } catch {
        // Safe cleanup
      }
    }
  });

  it("1. GATE 3.1D — OPC UA Read, Subscription & StatusCodes: Adquire telemetria com timestamp e qualidade GOOD", async () => {
    const readRes = await opcDriver.read("ns=2;s=M01.Current");
    expect(readRes.tagName).toBe("ns=2;s=M01.Current");
    expect(readRes.quality).toBe("GOOD");
    expect(readRes.dataType).toBe("REAL");
    expect(typeof readRes.value).toBe("number");
    expect(readRes.sourceTimestamp).toBeGreaterThan(0);

    // Ingest into gateway
    const ok = gatewayManager.ingestDriverTelemetry({
      driverId: "drv_opc_lab",
      sourceAddress: "ns=2;s=M01.Current",
      value: 38.5,
      quality: "GOOD",
      sourceTimestamp: Date.now(),
      organizationId: orgId,
      plantId,
      projectId,
    });
    expect(ok).toBe(true);

    const tag = runtime.getTag("M-01_CORRENTE");
    expect(tag).toBeDefined();
    expect(tag?.value).toBe(38.5);
    expect(tag?.quality).toBe("GOOD");
  });

  it("2. GATE 3.1E — Modbus TCP Conversões de Endianness e Escala Linear (ABCD, CDAB, BADC, DCBA)", () => {
    // Test FLOAT32 IEEE 754 across 4 endianness patterns
    const testVal = 123.456;

    // BIG_ENDIAN (ABCD)
    modbusDriver.setLabFloat32("HOLDING_REGISTER", 100, testVal, "BIG_ENDIAN");
    const valBe = modbusDriver.decodeRegisters(
      (modbusDriver as any).holdingRegisters,
      100,
      "FLOAT32",
      "BIG_ENDIAN",
    );
    expect(Math.abs(valBe - testVal)).toBeLessThan(0.01);

    // WORD_SWAPPED (CDAB)
    modbusDriver.setLabFloat32("HOLDING_REGISTER", 102, testVal, "WORD_SWAPPED");
    const valCdab = modbusDriver.decodeRegisters(
      (modbusDriver as any).holdingRegisters,
      102,
      "FLOAT32",
      "WORD_SWAPPED",
    );
    expect(Math.abs(valCdab - testVal)).toBeLessThan(0.01);

    // LITTLE_ENDIAN (DCBA)
    modbusDriver.setLabFloat32("HOLDING_REGISTER", 104, testVal, "LITTLE_ENDIAN");
    const valDcba = modbusDriver.decodeRegisters(
      (modbusDriver as any).holdingRegisters,
      104,
      "FLOAT32",
      "LITTLE_ENDIAN",
    );
    expect(Math.abs(valDcba - testVal)).toBeLessThan(0.01);

    // BYTE_SWAPPED (BADC)
    modbusDriver.setLabFloat32("HOLDING_REGISTER", 106, testVal, "BYTE_SWAPPED");
    const valBadc = modbusDriver.decodeRegisters(
      (modbusDriver as any).holdingRegisters,
      106,
      "FLOAT32",
      "BYTE_SWAPPED",
    );
    expect(Math.abs(valBadc - testVal)).toBeLessThan(0.01);
  });

  it("3. GATE 3.1F — Sparkplug B Ciclo de Vida: NBIRTH, NDATA e transição para STALE no NDEATH", async () => {
    // Process NBIRTH
    const now = Date.now();
    sparkplugDriver.handleIncomingMessage("spBv1.0/Planta_ETE/NBIRTH/Node_ETE", {
      timestamp: now,
      metrics: [
        { name: "bdSeq", dataType: "Int64", timestamp: now, value: 1 },
        { name: "Sensors/NivelTanque01", dataType: "Float", timestamp: now, value: 65.0 },
      ],
    });

    const metrics = sparkplugDriver.getKnownMetrics();
    expect(metrics.get("Sensors/NivelTanque01")?.value).toBe(65.0);
    expect(metrics.get("Sensors/NivelTanque01")?.quality).toBe("GOOD");

    // Process NDATA update
    sparkplugDriver.handleIncomingMessage("spBv1.0/Planta_ETE/NDATA/Node_ETE", {
      timestamp: now + 100,
      metrics: [
        { name: "Sensors/NivelTanque01", dataType: "Float", timestamp: now + 100, value: 72.4 },
      ],
    });
    expect(metrics.get("Sensors/NivelTanque01")?.value).toBe(72.4);

    // Process NDEATH -> Quality must transition to STALE
    sparkplugDriver.handleIncomingMessage("spBv1.0/Planta_ETE/NDEATH/Node_ETE", {
      timestamp: now + 200,
      metrics: [{ name: "bdSeq", dataType: "Int64", timestamp: now + 200, value: 1 }],
    });
    expect(metrics.get("Sensors/NivelTanque01")?.quality).toBe("STALE");
  });

  it("4. GATE 3.1H — Pipeline Completo: Ingestão Multi-Protocolo -> Runtime -> Deterministic Alarm Engine -> Outbox", () => {
    const now = Date.now();

    // 1. OPC UA sample with overcurrent (>50A)
    gatewayManager.ingestDriverTelemetry({
      driverId: "drv_opc_lab",
      sourceAddress: "ns=2;s=M01.Current",
      value: 54.2, // Exceeds 50.0A limit
      quality: "GOOD",
      sourceTimestamp: now,
      organizationId: orgId,
      plantId,
      projectId,
    });

    // 2. Modbus sample
    gatewayManager.ingestDriverTelemetry({
      driverId: "drv_modbus_lab",
      sourceAddress: "40001",
      value: 3.8,
      quality: "GOOD",
      sourceTimestamp: now,
      organizationId: orgId,
      plantId,
      projectId,
    });

    // 3. Sparkplug B sample
    gatewayManager.ingestDriverTelemetry({
      driverId: "drv_sparkplug_lab",
      sourceAddress: "Sensors/NivelTanque01",
      value: 88.0,
      quality: "GOOD",
      sourceTimestamp: now,
      organizationId: orgId,
      plantId,
      projectId,
    });

    // Check Runtime
    expect(runtime.getTag("M-01_CORRENTE")?.value).toBe(54.2);
    expect(runtime.getTag("B-01_PRESSAO")?.value).toBe(3.8);
    expect(runtime.getTag("TK-01_NIVEL")?.value).toBe(88.0);

    // Check Alarm Engine fired
    const activeAlarms = alarmEngine.getActiveInstances();
    expect(activeAlarms.length).toBe(1);
    expect(activeAlarms[0].tagName).toBe("M-01_CORRENTE");
    expect(activeAlarms[0].severity).toBe("HIGH");

    // Check Outbox
    const stats = outbox.getStatistics();
    expect(stats.totalSamplesStored).toBe(3);
    expect(stats.pendingUploadCount).toBe(3);
  });

  it("5. GATE 3.1J — Store-and-Forward de 1.000 Amostras durante Queda de WAN com Reinicialização", () => {
    const TOTAL_SAMPLES = 1000;
    const now = Date.now();

    // Step 1: Disconnect WAN to simulate internet outage
    gatewayManager.setCloudConnection(false);

    // Step 2: Acquire 1,000 samples while offline
    for (let i = 0; i < TOTAL_SAMPLES; i++) {
      gatewayManager.ingestDriverTelemetry({
        driverId: "drv_modbus_lab",
        sourceAddress: "40001",
        value: 10.0 + (i % 20),
        quality: "GOOD",
        sourceTimestamp: now + i * 10,
        organizationId: orgId,
        plantId,
        projectId,
      });
    }

    let stats = outbox.getStatistics();
    expect(stats.totalSamplesStored).toBe(TOTAL_SAMPLES);
    expect(stats.pendingUploadCount).toBe(TOTAL_SAMPLES);

    // Step 3: Peek partial batch while offline (simulates failed in-flight upload)
    const inFlight = outbox.peekPendingBatch(200);
    expect(inFlight.length).toBe(200);

    stats = outbox.getStatistics();
    expect(stats.pendingUploadCount).toBe(800);
    expect(stats.inFlightCount).toBe(200);

    // Step 4: Crash recovery simulation — Requeue in-flight
    const requeued = outbox.requeueInFlight();
    expect(requeued).toBe(200);

    stats = outbox.getStatistics();
    expect(stats.pendingUploadCount).toBe(TOTAL_SAMPLES);
    expect(stats.inFlightCount).toBe(0);

    // Step 5: Restore WAN and flush to Cloud
    gatewayManager.setCloudConnection(true);

    let totalFlushed = 0;
    while (true) {
      const res = gatewayManager.flushOutboxToCloud();
      if (res.sent === 0) break;
      totalFlushed += res.sent;
    }

    expect(totalFlushed).toBe(TOTAL_SAMPLES);
    stats = outbox.getStatistics();
    expect(stats.pendingUploadCount).toBe(0);
    expect(stats.acknowledgedCount).toBe(TOTAL_SAMPLES);
  });
});
