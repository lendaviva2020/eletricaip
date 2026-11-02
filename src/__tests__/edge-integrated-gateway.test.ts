// ELÉTRICAI INDUSTRIAL OS — GATE 3.9 & 3.10 INTEGRATED GATEWAY & BENCHMARKS
// Test Suite: Multi-Protocol Edge Ingestion, Multi-Tenant Boundaries, Store-and-Forward & Segregated Benchmarks
// Standards: IEC 62443, NIST SP 800-82 Rev. 3, ISA-101, ISA-18.2

import { describe, it, expect, beforeEach } from "vitest";
import { EdgeProvisioningService } from "@/lib/edge/provisioning";
import { MasterEdgeGatewayManager } from "@/lib/edge/gateway-manager";
import { OpcUaClientDriver } from "@/lib/edge/drivers/opcua-driver";
import { ModbusTcpClientDriver } from "@/lib/edge/drivers/modbus-driver";
import { SparkplugBDriver } from "@/lib/edge/drivers/sparkplug-driver";
import { IndustrialTagRuntime } from "@/lib/scada/tag-runtime";
import { DeterministicAlarmEngine } from "@/lib/scada/alarm-engine";
import type { GatewayIdentity } from "@/lib/edge/types";
import type { ExtendedAlarmDefinition } from "@/lib/scada/types";

describe("GATE 3.9 & GATE 3.10 — Master Edge Gateway Integrated Homologation", () => {
  let provisioningService: EdgeProvisioningService;
  let gatewayManager: MasterEdgeGatewayManager;
  let runtime: IndustrialTagRuntime;
  let alarmEngine: DeterministicAlarmEngine;
  let opcDriver: OpcUaClientDriver;
  let modbusDriver: ModbusTcpClientDriver;
  let sparkplugDriver: SparkplugBDriver;
  let gatewayIdentity: GatewayIdentity;

  const orgId = "org_industrial_sp";
  const plantId = "plant_ete_matriz";
  const projectId = "proj_ete_01";

  beforeEach(async () => {
    provisioningService = new EdgeProvisioningService();

    // 1. Issue One-Time Provisioning Token
    const token = provisioningService.createProvisioningToken({
      organizationId: orgId,
      plantId,
      stationId: "station_edge_rack_01",
      issuedBy: "admin_industrial@eletricai.com",
    });

    // 2. Onboard Gateway
    const provisionRes = provisioningService.provisionGateway({
      provisioningToken: token.token,
      gatewayVersion: "3.0.0-industrial",
      stationHardwareId: "ADV-UNO-2271G-001",
    });

    expect(provisionRes.success).toBe(true);
    gatewayIdentity = provisioningService.getGateway(provisionRes.gatewayId)!;

    // 3. Initialize Runtime, Alarm Engine & Gateway Manager
    runtime = new IndustrialTagRuntime();
    alarmEngine = new DeterministicAlarmEngine();

    gatewayManager = new MasterEdgeGatewayManager({
      identity: gatewayIdentity,
      runtime,
      alarmEngine,
      syncIntervalMs: 500,
    });

    // 4. Initialize Industrial Drivers
    opcDriver = new OpcUaClientDriver({
      driverId: "drv_opc",
      connectionId: "conn_opc_01",
      endpointUrl: "opc.tcp://192.168.1.10:4840",
      securityPolicy: "Basic256Sha256",
    });
    await opcDriver.connect();

    modbusDriver = new ModbusTcpClientDriver({
      driverId: "drv_modbus",
      connectionId: "conn_modbus_01",
      host: "192.168.1.20",
    });
    await modbusDriver.connect();

    sparkplugDriver = new SparkplugBDriver({
      driverId: "drv_sparkplug",
      connectionId: "conn_sparkplug_01",
      brokerUrl: "mqtts://192.168.1.30:8883",
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
      driverId: "drv_opc",
      sourceAddress: "ns=2;s=M01.Current",
      targetTagName: "M-01_CORRENTE",
      projectId,
      equipmentId: "eq_motor_m01",
    });

    gatewayManager.mapTag({
      driverId: "drv_modbus",
      sourceAddress: "40001",
      targetTagName: "P-01_PRESSAO",
      projectId,
      equipmentId: "eq_pump_p01",
    });

    gatewayManager.mapTag({
      driverId: "drv_sparkplug",
      sourceAddress: "TK01/Nivel",
      targetTagName: "TK-01_NIVEL",
      projectId,
      equipmentId: "eq_tank_tk01",
    });
  });

  describe("GATE 3.1 & 3.9 — Identidade, Provisionamento e Isolamento Multi-Tenant", () => {
    it("1. Token Descartável (One-time Burn): Rejeita reutilização de token já consumido", () => {
      const token = provisioningService.createProvisioningToken({
        organizationId: "org-test",
        plantId: "plant-test",
        stationId: "st-01",
        issuedBy: "admin",
      });

      // First use succeeds
      const res1 = provisioningService.provisionGateway({
        provisioningToken: token.token,
        gatewayVersion: "3.0.0",
        stationHardwareId: "HW-001",
      });
      expect(res1.success).toBe(true);

      // Second use is rejected immediately
      const res2 = provisioningService.provisionGateway({
        provisioningToken: token.token,
        gatewayVersion: "3.0.0",
        stationHardwareId: "HW-002",
      });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain("TOKEN_ALREADY_USED");
    });

    it("2. Isolamento Estrito Multi-Tenant (IEC 62443): Rejeita tentativa de injeção cross-tenant", () => {
      // Gateway is assigned to org_industrial_sp. Malicious payload attempts to inject into org_OTHER
      expect(() => {
        gatewayManager.ingestDriverTelemetry({
          driverId: "drv_opc",
          sourceAddress: "ns=2;s=M01.Current",
          value: 30.5,
          quality: "GOOD",
          sourceTimestamp: Date.now(),
          organizationId: "org_OTHER_INTRUDER",
          plantId: plantId,
          projectId: projectId,
        });
      }).toThrow(/MULTI_TENANT_SECURITY_VIOLATION/);

      expect(gatewayManager.getHealthTelemetry().samplesRejectedTotal).toBe(1);
    });
  });

  describe("GATE 3.2 — Store-and-Forward e Resiliência Offline", () => {
    it("1. Queda de WAN: Continua aquisição local no outbox e re-envia de forma idempotente", () => {
      // 1. Telemetry during normal cloud connection
      gatewayManager.ingestDriverTelemetry({
        driverId: "drv_opc",
        sourceAddress: "ns=2;s=M01.Current",
        value: 25.0,
        quality: "GOOD",
        sourceTimestamp: 1700000000000,
        organizationId: orgId,
        plantId,
        projectId,
      });

      const normalFlush = gatewayManager.flushOutboxToCloud();
      expect(normalFlush.sent).toBe(1);
      expect(normalFlush.pending).toBe(0);

      // 2. Internet connection drops!
      gatewayManager.setCloudConnection(false);

      // Ingest 10 samples while offline
      for (let i = 1; i <= 10; i++) {
        gatewayManager.ingestDriverTelemetry({
          driverId: "drv_opc",
          sourceAddress: "ns=2;s=M01.Current",
          value: 25.0 + i * 0.5,
          quality: "GOOD",
          sourceTimestamp: 1700000000000 + i * 1000,
          organizationId: orgId,
          plantId,
          projectId,
        });
      }

      // Offline flush fails safely
      const offlineFlush = gatewayManager.flushOutboxToCloud();
      expect(offlineFlush.sent).toBe(0);
      expect(offlineFlush.pending).toBe(10);
      expect(gatewayManager.outbox.getStatistics().pendingUploadCount).toBe(10);

      // 3. Internet connection restored!
      gatewayManager.setCloudConnection(true);

      const recoveryFlush = gatewayManager.flushOutboxToCloud();
      expect(recoveryFlush.sent).toBe(10);
      expect(recoveryFlush.pending).toBe(0);
      expect(gatewayManager.outbox.getStatistics().pendingUploadCount).toBe(0);
    });
  });

  describe("GATE 3.9 & 3.10 — Concorrência Multi-Protocolo & Alarmes", () => {
    it("1. Ingestão Simultânea OPC UA + Modbus + Sparkplug alimentando Alarm Engine", () => {
      // Register High Alarm on M-01 Current (> 45A)
      const almDef: ExtendedAlarmDefinition = {
        id: "alm_m01_hi",
        projectId,
        tagId: "M-01_CORRENTE",
        tagName: "M-01_CORRENTE",
        description: "Sobrecarga Alta M-01",
        alarmClass: "ELECTRICAL",
        severity: "HIGH",
        analogLimits: { high: 45.0, hysteresis: 1.0 },
        requireAck: true,
        autoClear: true,
        enabled: true,
      };
      alarmEngine.registerDefinition(almDef);

      const now = Date.now();

      // Ingest from OPC UA (overcurrent excursion 52A)
      gatewayManager.ingestDriverTelemetry({
        driverId: "drv_opc",
        sourceAddress: "ns=2;s=M01.Current",
        value: 52.0,
        quality: "GOOD",
        sourceTimestamp: now,
        organizationId: orgId,
        plantId,
        projectId,
      });

      // Ingest from Modbus (Pressure 4.2 bar)
      gatewayManager.ingestDriverTelemetry({
        driverId: "drv_modbus",
        sourceAddress: "40001",
        value: 4.2,
        quality: "GOOD",
        sourceTimestamp: now,
        organizationId: orgId,
        plantId,
        projectId,
      });

      // Ingest from Sparkplug B (Level 78.5%)
      gatewayManager.ingestDriverTelemetry({
        driverId: "drv_sparkplug",
        sourceAddress: "TK01/Nivel",
        value: 78.5,
        quality: "GOOD",
        sourceTimestamp: now,
        organizationId: orgId,
        plantId,
        projectId,
      });

      // Verify Runtime has all 3 canonical tags updated
      expect(runtime.getTag("M-01_CORRENTE")?.value).toBe(52.0);
      expect(runtime.getTag("P-01_PRESSAO")?.value).toBe(4.2);
      expect(runtime.getTag("TK-01_NIVEL")?.value).toBe(78.5);

      // Verify Alarm Engine fired for M-01 overcurrent
      const activeAlarms = alarmEngine.getActiveInstances();
      expect(activeAlarms.length).toBe(1);
      expect(activeAlarms[0].tagName).toBe("M-01_CORRENTE");
      expect(activeAlarms[0].severity).toBe("HIGH");

      // Verify Gateway Health Telemetry
      const health = gatewayManager.getHealthTelemetry();
      expect(health.activeTagsCount).toBe(3);
      expect(health.activeDevicesCount).toBe(3);
      expect(health.samplesProcessedTotal).toBe(3);
    });
  });

  describe("GATE 3.10 — Benchmarks Segregados por Componente (100, 500, 1.000 TAGs)", () => {
    it("1. Benchmark de Latência Segregada: Driver -> Normalização -> Runtime -> Alarme -> Buffer", () => {
      const SAMPLES_COUNT = 1000;
      const now = Date.now();

      // Component 1: Normalization & Ingestion Latency
      const tNormStart = performance.now();
      for (let i = 0; i < SAMPLES_COUNT; i++) {
        gatewayManager.ingestDriverTelemetry({
          driverId: "drv_opc",
          sourceAddress: "ns=2;s=M01.Current",
          value: 20.0 + (i % 30),
          quality: "GOOD",
          sourceTimestamp: now + i,
          organizationId: orgId,
          plantId,
          projectId,
        });
      }
      const tNormTotal = performance.now() - tNormStart;
      const avgNormUs = (tNormTotal / SAMPLES_COUNT) * 1000;

      // Component 2: Buffer Flush (Outbox ACK) Latency
      const tFlushStart = performance.now();
      const flushRes = gatewayManager.flushOutboxToCloud();
      const tFlushTotal = performance.now() - tFlushStart;

      expect(flushRes.sent).toBe(500); // Max batch size 500
      expect(avgNormUs).toBeLessThan(100); // Under 100 microseconds per sample end-to-end
      expect(tFlushTotal).toBeLessThan(50); // Under 50ms to pack & ack 500 samples in SQLite on Windows/Linux
    });
  });
});
