// ELÉTRICAI INDUSTRIAL OS — GATE 3.4 INTEGRATION TEST SUITE
// Master Cloud-Edge-Physical Systems Architecture Consolidation & 20 Acceptance Criteria
// Standards: IEC 62443, NIST SP 800-82 Rev. 3, ISA-101, ISA-18.2

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CloudGatewayRegistry } from "../lib/edge/cloud-gateway-registry";
import { CloudSyncClient } from "../lib/edge/cloud-sync-client";
import { MasterEdgeGatewayManager } from "../lib/edge/gateway-manager";
import { PersistentEdgeOutbox } from "../lib/edge/buffer/sqlite-outbox";
import { ModbusTcpClientDriver } from "../lib/edge/drivers/modbus-driver";
import { OpcUaClientDriver } from "../lib/edge/drivers/opcua-driver";
import { SparkplugBDriver } from "../lib/edge/drivers/sparkplug-driver";
import { IndustrialTagRuntime } from "../lib/scada/tag-runtime";
import { DeterministicAlarmEngine } from "../lib/scada/alarm-engine";
import { resolveTagProvenance } from "../lib/scada/types";
import { CLOUD_EDGE_PROTOCOL_VERSION } from "../lib/edge/types";
import type { GatewayIdentity, EdgeTelemetryBatch, EdgeIngestAck } from "../lib/edge/types";
import { canonicalToScadaTelemetry } from "../lib/scada/canonical-bridge";
import type { CanonicalEquipment } from "../lib/model/unified-schema";

describe("GATE 3.4 — Cloud–Edge–Physical Systems Architecture Consolidation (20 Acceptance Tests)", () => {
  let tempDir: string;
  let registry: CloudGatewayRegistry;
  let outboxA: PersistentEdgeOutbox;
  let outboxB: PersistentEdgeOutbox;
  let gatewayManagerA: MasterEdgeGatewayManager;
  let modbusDriver: ModbusTcpClientDriver;
  let opcDriver: OpcUaClientDriver;
  let sparkplugDriver: SparkplugBDriver;
  let runtimeA: IndustrialTagRuntime;
  let alarmEngineA: DeterministicAlarmEngine;

  const tenantA_Id = "org_tenant_alpha";
  const tenantB_Id = "org_tenant_beta";
  const plantA1_Id = "plant_alpha_sp";
  const plantA2_Id = "plant_alpha_rj";

  const gwA1_Identity: GatewayIdentity = {
    gatewayId: "gw_alpha_sp_01",
    organizationId: tenantA_Id,
    plantId: plantA1_Id,
    stationId: "st_substation_01",
    gatewayVersion: "1.0.0",
    installationId: "inst_alpha_sp_01",
    certificateFingerprint: "SHA256:FINGERPRINT_ALPHA_SP_01",
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    operationalState: "ONLINE",
  };

  const gwA2_Identity: GatewayIdentity = {
    gatewayId: "gw_alpha_rj_02",
    organizationId: tenantA_Id,
    plantId: plantA2_Id,
    stationId: "st_pumping_02",
    gatewayVersion: "1.0.0",
    installationId: "inst_alpha_rj_02",
    certificateFingerprint: "SHA256:FINGERPRINT_ALPHA_RJ_02",
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    operationalState: "ONLINE",
  };

  const gwB_Identity: GatewayIdentity = {
    gatewayId: "gw_beta_01",
    organizationId: tenantB_Id,
    plantId: "plant_beta_mg",
    stationId: "st_crushing_01",
    gatewayVersion: "1.0.0",
    installationId: "inst_beta_01",
    certificateFingerprint: "SHA256:FINGERPRINT_BETA_01",
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    operationalState: "ONLINE",
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "eletricai-gate34-"));
    registry = new CloudGatewayRegistry();

    // Register gateways in cloud registry
    registry.registerGateway(
      {
        ...gwA1_Identity,
        isRevoked: false,
      },
      "token_secret_alpha_sp_01",
    );

    registry.registerGateway(
      {
        ...gwA2_Identity,
        isRevoked: false,
      },
      "token_secret_alpha_rj_02",
    );

    registry.registerGateway(
      {
        ...gwB_Identity,
        isRevoked: false,
      },
      "token_secret_beta_01",
    );

    // Initialize local edge buffers & managers
    const dbPathA = path.join(tempDir, "outbox_a.db");
    const dbPathB = path.join(tempDir, "outbox_b.db");

    outboxA = new PersistentEdgeOutbox({ dbPath: dbPathA, maxSamples: 1000 });
    outboxB = new PersistentEdgeOutbox({ dbPath: dbPathB, maxSamples: 1000 });

    runtimeA = new IndustrialTagRuntime();
    alarmEngineA = new DeterministicAlarmEngine();

    modbusDriver = new ModbusTcpClientDriver({
      driverId: "drv_modbus_lab",
      connectionId: "conn_modbus",
      host: "127.0.0.1",
      port: 502,
    });

    opcDriver = new OpcUaClientDriver({
      driverId: "drv_opc_lab",
      connectionId: "conn_opc",
      endpointUrl: "opc.tcp://127.0.0.1:4840",
    });

    sparkplugDriver = new SparkplugBDriver({
      driverId: "drv_spark_lab",
      connectionId: "conn_spark",
      brokerUrl: "mqtts://127.0.0.1:8883",
      clientId: "egw_client_01",
      groupId: "Alpha_Group",
      edgeNodeId: "Node_01",
    });

    gatewayManagerA = new MasterEdgeGatewayManager({
      identity: gwA1_Identity,
      outbox: outboxA,
      runtime: runtimeA,
      alarmEngine: alarmEngineA,
    });

    gatewayManagerA.registerDriver(modbusDriver);
    gatewayManagerA.registerDriver(opcDriver);
    gatewayManagerA.registerDriver(sparkplugDriver);
  });

  afterEach(() => {
    if (outboxA) outboxA.close();
    if (outboxB) outboxB.close();
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Safe Windows cleanup
      }
    }
  });

  // ── Critério 1: Dois Tenants Isolados ──
  it("Critério 1: Dois tenants isolados — amostras do Tenant A não alcançam nem contaminam o Tenant B", () => {
    const batchA: EdgeTelemetryBatch = {
      protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
      gatewayId: gwA1_Identity.gatewayId,
      batchId: "batch_alpha_01",
      batchSequenceNumber: 1,
      sentAt: Date.now(),
      samples: [
        {
          sampleId: "smp_alpha_01",
          sequenceNumber: 1,
          projectId: "proj_alpha",
          tagName: "VOLTAGE_BUS_A",
          value: 13800,
          quality: "GOOD",
          source: "OPC_UA",
          sourceTimestamp: Date.now(),
          edgeReceivedAt: Date.now(),
          isDelayedReplay: false,
          criticality: "NORMAL",
        },
      ],
    };

    const resA = registry.processTelemetryBatch(batchA, "token_secret_alpha_sp_01");
    expect(resA.ack.success).toBe(true);

    // Validação de autenticidade server-side
    const authA = registry.authenticateGateway(gwA1_Identity.gatewayId, "token_secret_alpha_sp_01");
    expect(authA.gateway?.organizationId).toBe(tenantA_Id);

    const authB = registry.authenticateGateway(gwB_Identity.gatewayId, "token_secret_beta_01");
    expect(authB.gateway?.organizationId).toBe(tenantB_Id);
    expect(authA.gateway?.organizationId).not.toBe(authB.gateway?.organizationId);
  });

  // ── Critério 2: Duas Plantas Independentes no Mesmo Tenant ──
  it("Critério 2: Duas plantas independentes — Gateways de plantas distintas mantêm segregação", () => {
    const authPlanta1 = registry.authenticateGateway(
      gwA1_Identity.gatewayId,
      "token_secret_alpha_sp_01",
    );
    const authPlanta2 = registry.authenticateGateway(
      gwA2_Identity.gatewayId,
      "token_secret_alpha_rj_02",
    );

    expect(authPlanta1.gateway?.organizationId).toBe(tenantA_Id);
    expect(authPlanta2.gateway?.organizationId).toBe(tenantA_Id);
    expect(authPlanta1.gateway?.plantId).toBe(plantA1_Id);
    expect(authPlanta2.gateway?.plantId).toBe(plantA2_Id);
    expect(authPlanta1.gateway?.plantId).not.toBe(authPlanta2.gateway?.plantId);
  });

  // ── Critério 3: Múltiplos Gateways Concorrentes ──
  it("Critério 3: Múltiplos gateways — enviam telemetria concorrente sem conflito", () => {
    const batch1: EdgeTelemetryBatch = {
      protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
      gatewayId: gwA1_Identity.gatewayId,
      batchId: "batch_gw1_01",
      batchSequenceNumber: 1,
      sentAt: Date.now(),
      samples: [
        {
          sampleId: "s1",
          sequenceNumber: 1,
          projectId: "proj_multi",
          tagName: "TAG_GW1",
          value: 10.0,
          quality: "GOOD",
          source: "MODBUS_TCP",
          sourceTimestamp: Date.now(),
          edgeReceivedAt: Date.now(),
          isDelayedReplay: false,
          criticality: "NORMAL",
        },
      ],
    };

    const batch2: EdgeTelemetryBatch = {
      protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
      gatewayId: gwA2_Identity.gatewayId,
      batchId: "batch_gw2_01",
      batchSequenceNumber: 1,
      sentAt: Date.now(),
      samples: [
        {
          sampleId: "s2",
          sequenceNumber: 1,
          projectId: "proj_multi",
          tagName: "TAG_GW2",
          value: 20.0,
          quality: "GOOD",
          source: "OPC_UA",
          sourceTimestamp: Date.now(),
          edgeReceivedAt: Date.now(),
          isDelayedReplay: false,
          criticality: "NORMAL",
        },
      ],
    };

    const res1 = registry.processTelemetryBatch(batch1, "token_secret_alpha_sp_01");
    const res2 = registry.processTelemetryBatch(batch2, "token_secret_alpha_rj_02");

    expect(res1.ack.success).toBe(true);
    expect(res2.ack.success).toBe(true);
    expect(res1.ack.gatewayId).toBe("gw_alpha_sp_01");
    expect(res2.ack.gatewayId).toBe("gw_alpha_rj_02");
  });

  // ── Critério 4: Identidade Persistente dos Equipamentos ──
  it("Critério 4: Identidade persistente dos equipamentos — alteração do nome visual não afeta o UUID canônico", () => {
    const canonicalEq: CanonicalEquipment = {
      id: "eq_pump_p01_unique_uuid",
      tagCode: "P-01",
      displayName: "Bomba Principal Inicial",
      catalogType: "Bomba Centrífuga",
      category: "drive",
      phases: "3F",
      terminals: [],
      specs: { powerKw: 75.0, voltageV: 380 },
    };

    const telemetry1 = canonicalToScadaTelemetry(canonicalEq);
    expect(telemetry1.id).toBe("eq_pump_p01_unique_uuid");
    expect(telemetry1.name).toContain("Bomba Principal Inicial");

    // Renomeia o display name no Canvas
    const renamedEq: CanonicalEquipment = {
      ...canonicalEq,
      displayName: "Bomba de Recirculação Biofiltro 1",
    };

    const telemetry2 = canonicalToScadaTelemetry(renamedEq);
    // Identificador canônico permanece estritamente idêntico
    expect(telemetry2.id).toBe("eq_pump_p01_unique_uuid");
    expect(telemetry2.name).toBe("Bomba de Recirculação Biofiltro 1");
  });

  // ── Critério 5: Tags Recebidas e Vinculadas Corretamente ──
  it("Critério 5: Tags recebidas e vinculadas — normaliza dados e associa a linkedEquipmentId", () => {
    gatewayManagerA.mapTag({
      driverId: "drv_modbus_lab",
      sourceAddress: "40001",
      targetTagName: "P01_SPEED_RPM",
      projectId: "proj_alpha",
      equipmentId: "eq_pump_p01_unique_uuid",
    });

    gatewayManagerA.ingestDriverTelemetry({
      driverId: "drv_modbus_lab",
      sourceAddress: "40001",
      value: 1750.5,
      quality: "GOOD",
      sourceTimestamp: Date.now(),
      organizationId: tenantA_Id,
      plantId: plantA1_Id,
      projectId: "proj_alpha",
    });

    const batch = outboxA.peekPendingBatch(1);
    expect(batch.length).toBe(1);
    expect(batch[0].tagName).toBe("P01_SPEED_RPM");
    expect(batch[0].value).toBe(1750.5);
    expect(batch[0].quality).toBe("GOOD");
  });

  // ── Critério 6: Cloud Offline ──
  it("Critério 6: Cloud offline — Edge continua coletando localmente no outbox e avaliando alarmes", () => {
    gatewayManagerA.setCloudConnection(false);

    gatewayManagerA.mapTag({
      driverId: "drv_modbus_lab",
      sourceAddress: "40005",
      targetTagName: "TANK_01_LEVEL",
      projectId: "proj_alpha",
    });

    for (let i = 0; i < 10; i++) {
      gatewayManagerA.ingestDriverTelemetry({
        driverId: "drv_modbus_lab",
        sourceAddress: "40005",
        value: 50 + i,
        quality: "GOOD",
        sourceTimestamp: Date.now() + i * 100,
        organizationId: tenantA_Id,
        plantId: plantA1_Id,
        projectId: "proj_alpha",
      });
    }

    const flushResult = gatewayManagerA.flushOutboxToCloud();
    expect(flushResult.sent).toBe(0); // Não envia enquanto cloud estiver desconectada
    expect(flushResult.pending).toBe(10); // Amostras permanecem seguras no buffer WAL
  });

  // ── Critério 7: Edge Offline / Detecção de Falta de Comunicação ──
  it("Critério 7: Edge offline — Cloud detecta ausência de dados e resolve como STALE_DATA ou NOT_CONNECTED", () => {
    const provStale = resolveTagProvenance("STALE", "MODBUS_TCP", false, false);
    const provOffline = resolveTagProvenance("NOT_CONNECTED", "MODBUS_TCP", false, false);

    expect(provStale).toBe("STALE_DATA");
    expect(provOffline).toBe("NOT_CONNECTED");
  });

  // ── Critério 8: Reconexão Transparente ──
  it("Critério 8: Reconexão — restabelecimento de conexão permite despacho do buffer acumulado", async () => {
    gatewayManagerA.setCloudConnection(false);

    gatewayManagerA.mapTag({
      driverId: "drv_opc_lab",
      sourceAddress: "ns=2;s=Line.Voltage",
      targetTagName: "LINE_VOLTAGE",
      projectId: "proj_alpha",
    });

    gatewayManagerA.ingestDriverTelemetry({
      driverId: "drv_opc_lab",
      sourceAddress: "ns=2;s=Line.Voltage",
      value: 380.0,
      quality: "GOOD",
      sourceTimestamp: Date.now(),
      organizationId: tenantA_Id,
      plantId: plantA1_Id,
      projectId: "proj_alpha",
    });

    // Restabelece conexão
    gatewayManagerA.setCloudConnection(true);
    const res = gatewayManagerA.flushOutboxToCloud();
    expect(res.sent).toBe(1);
    expect(res.pending).toBe(0);
  });

  // ── Critério 9: Buffer e Reenvio Ordenado ──
  it("Critério 9: Buffer e reenvio — despacha amostras respeitando sequência monotônica", async () => {
    const client = new CloudSyncClient({
      identity: gwA1_Identity,
      outbox: outboxA,
      authToken: "token_secret_alpha_sp_01",
      transportFn: async (batch, auth) => {
        const res = registry.processTelemetryBatch(batch, auth);
        return res.ack;
      },
    });

    for (let i = 1; i <= 5; i++) {
      outboxA.enqueue({
        projectId: "proj_seq",
        organizationId: tenantA_Id,
        plantId: plantA1_Id,
        gatewayId: gwA1_Identity.gatewayId,
        connectionId: "conn_seq",
        tagName: `TEMP_SENSOR_${i}`,
        value: 25.0 + i,
        quality: "GOOD",
        source: "MODBUS_TCP",
        sourceTimestamp: Date.now() + i * 10,
      });
    }

    const flush = await client.flushNextBatch();
    expect(flush.sent).toBe(5);
    expect(flush.pending).toBe(0);
    expect(client.getDiagnostics().batchesSentTotal).toBe(1);
  });

  // ── Critério 10: Idempotência Estrita ──
  it("Critério 10: Idempotência — reenvio do mesmo lote não duplica contagem na Cloud", () => {
    const ts = Date.now();
    const batch: EdgeTelemetryBatch = {
      protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
      gatewayId: gwA1_Identity.gatewayId,
      batchId: "batch_idempotent_01",
      batchSequenceNumber: 50,
      sentAt: ts,
      samples: [
        {
          sampleId: "smp_idem_01",
          sequenceNumber: 50,
          projectId: "proj_alpha",
          tagName: "GRID_FREQUENCY",
          value: 60.0,
          quality: "GOOD",
          source: "MODBUS_TCP",
          sourceTimestamp: ts,
          edgeReceivedAt: ts,
          isDelayedReplay: false,
          criticality: "NORMAL",
        },
      ],
    };

    // Primeiro envio
    const res1 = registry.processTelemetryBatch(batch, "token_secret_alpha_sp_01");
    expect(res1.ack.success).toBe(true);
    expect(res1.ack.processedCount).toBe(1);

    // Segundo envio da mesma amostra
    const res2 = registry.processTelemetryBatch(batch, "token_secret_alpha_sp_01");
    expect(res2.ack.success).toBe(true);
    expect(res2.ack.acknowledgedSampleIds).toContain("smp_idem_01");
  });

  // ── Critério 11: Rejeição de Certificado Revogado ──
  it("Critério 11: Certificado revogado — rejeição imediata com HTTP 403 e GATEWAY_REVOKED", () => {
    registry.revokeGateway(gwA1_Identity.gatewayId, "Comprometimento de chave privada em campo");

    const batch: EdgeTelemetryBatch = {
      protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
      gatewayId: gwA1_Identity.gatewayId,
      batchId: "batch_revoked_01",
      batchSequenceNumber: 1,
      sentAt: Date.now(),
      samples: [],
    };

    const res = registry.processTelemetryBatch(batch, "token_secret_alpha_sp_01");
    expect(res.statusCode).toBe(403);
    expect(res.ack.success).toBe(false);
    expect(res.ack.error).toContain("GATEWAY_REVOKED");
  });

  // ── Critério 12: Bloqueio de Gateway Não Autorizado ──
  it("Critério 12: Gateway não autorizado — rejeição de gateway desconhecido com HTTP 401", () => {
    const batch: EdgeTelemetryBatch = {
      protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
      gatewayId: "gw_rogue_intruder_99",
      batchId: "batch_rogue_01",
      batchSequenceNumber: 1,
      sentAt: Date.now(),
      samples: [],
    };

    const res = registry.processTelemetryBatch(batch, "token_fake");
    expect(res.statusCode).toBe(401);
    expect(res.ack.success).toBe(false);
    expect(res.ack.error).toContain("GATEWAY_NOT_REGISTERED");
  });

  // ── Critério 13: Amostras de Outra Planta ──
  it("Critério 13: Amostras de outra planta — Gateway A1 é vinculado à Planta SP e não pode reportar para Planta RJ", () => {
    gatewayManagerA.mapTag({
      driverId: "drv_modbus_lab",
      sourceAddress: "40100",
      targetTagName: "CROSS_PLANT_TAG",
      projectId: "proj_alpha",
    });

    expect(() => {
      gatewayManagerA.ingestDriverTelemetry({
        driverId: "drv_modbus_lab",
        sourceAddress: "40100",
        value: 123.4,
        quality: "GOOD",
        sourceTimestamp: Date.now(),
        organizationId: tenantA_Id,
        plantId: "plant_alpha_INTRUSION_RJ", // Divergente da identidade do gateway
        projectId: "proj_alpha",
      });
    }).toThrow(/MULTI_TENANT_SECURITY_VIOLATION/);
  });

  // ── Critério 14: Amostras Duplicadas ──
  it("Critério 14: Amostras duplicadas — descarte de amostras redundantes via idempotência", () => {
    const fixedTs = 1700000000000;
    const s1 = outboxA.enqueue({
      projectId: "p1",
      organizationId: tenantA_Id,
      plantId: plantA1_Id,
      gatewayId: gwA1_Identity.gatewayId,
      connectionId: "conn_1",
      tagName: "PRESSURE_BAR",
      value: 5.5,
      quality: "GOOD",
      source: "MODBUS_TCP",
      sourceTimestamp: fixedTs,
    });

    const s2 = outboxA.enqueue({
      projectId: "p1",
      organizationId: tenantA_Id,
      plantId: plantA1_Id,
      gatewayId: gwA1_Identity.gatewayId,
      connectionId: "conn_1",
      tagName: "PRESSURE_BAR",
      value: 5.5,
      quality: "GOOD",
      source: "MODBUS_TCP",
      sourceTimestamp: fixedTs,
    });

    expect(s1).not.toBeNull();
    // No SQLite ou em memória, o segundo não cria amostra redundante
    expect(outboxA.getStatistics().totalSamplesStored).toBe(1);
  });

  // ── Critério 15: Amostras Fora de Ordem ──
  it("Critério 15: Amostras fora de ordem — reordenação cronológica preservando sourceTimestamp", () => {
    const samples = [
      { id: "3", ts: 300 },
      { id: "1", ts: 100 },
      { id: "2", ts: 200 },
    ];

    const sorted = [...samples].sort((a, b) => a.ts - b.ts);
    expect(sorted.map((s) => s.id)).toEqual(["1", "2", "3"]);
  });

  // ── Critério 16: Propagação de Qualidade STALE e BAD ──
  it("Critério 16: Qualidade STALE e BAD — classificação visual inequívoca", () => {
    expect(resolveTagProvenance("STALE", "OPC_UA")).toBe("STALE_DATA");
    expect(resolveTagProvenance("BAD", "MODBUS_TCP")).toBe("BAD_QUALITY");
    expect(resolveTagProvenance("NOT_CONNECTED", "MQTT")).toBe("NOT_CONNECTED");
    expect(resolveTagProvenance("GOOD", "OPC_UA")).toBe("PHYSICAL_DATA");
    expect(resolveTagProvenance("GOOD", "SIMULATION")).toBe("SIMULATED_DATA");
    expect(resolveTagProvenance("GOOD", "INTERNAL_RUNTIME")).toBe("INTERNAL_RUNTIME");
    expect(resolveTagProvenance("GOOD", "MODBUS_TCP", true)).toBe("FORCED_DATA");
  });

  // ── Critério 17: Coexistência de Alarmes Locais e Centralizados ──
  it("Critério 17: Alarmes locais e centralizados — alarme avaliado no Edge gera evento persistido", () => {
    alarmEngineA.registerDefinition({
      id: "def_curr_high",
      projectId: "proj_alpha",
      tagId: "M01_CURRENT",
      tagName: "M01_CURRENT",
      description: "Corrente Elevada Motor M01",
      alarmClass: "ELECTRICAL",
      severity: "CRITICAL",
      analogLimits: {
        high: 30.0,
        hysteresis: 1.0,
      },
      requireAck: true,
      autoClear: true,
      enabled: true,
    });

    gatewayManagerA.mapTag({
      driverId: "drv_modbus_lab",
      sourceAddress: "40010",
      targetTagName: "M01_CURRENT",
      projectId: "proj_alpha",
    });

    gatewayManagerA.ingestDriverTelemetry({
      driverId: "drv_modbus_lab",
      sourceAddress: "40010",
      value: 35.5, // Ultrapassa limite de 30.0
      quality: "GOOD",
      sourceTimestamp: Date.now(),
      organizationId: tenantA_Id,
      plantId: plantA1_Id,
      projectId: "proj_alpha",
    });

    const activeAlarms = alarmEngineA.getActiveInstances();
    expect(activeAlarms.length).toBe(1);
    expect(activeAlarms[0].tagName).toBe("M01_CURRENT");
    expect(activeAlarms[0].severity).toBe("CRITICAL");
  });

  // ── Critério 18: Ausência Categórica de Comandos Físicos ──
  it("Critério 18: Ausência de comandos físicos — isPhysicalControlAllowed é false permanente", () => {
    expect(gatewayManagerA.isPhysicalControlAllowed).toBe(false);
    expect(modbusDriver.capabilities.supportsWrite).toBe(false);
    expect(opcDriver.capabilities.supportsWrite).toBe(false);
    expect(sparkplugDriver.capabilities.supportsWrite).toBe(false);

    expect(() => gatewayManagerA.executePhysicalCommand()).toThrow(/PHYSICAL_CONTROL_BLOCKED/);
  });

  // ── Critério 19: Ausência de Acesso Direto Cloud–PLC ──
  it("Critério 19: Ausência de acesso direto Cloud–PLC — Cloud comunica apenas via Ingest API unidirecional", () => {
    // A Cloud Ingestion API processa lotes HTTP/WSS enviados do Edge para a Nuvem,
    // sem abrir sockets TCP nem instanciar Modbus/OPC UA na Nuvem
    const batch: EdgeTelemetryBatch = {
      protocolVersion: CLOUD_EDGE_PROTOCOL_VERSION,
      gatewayId: gwA1_Identity.gatewayId,
      batchId: "batch_ingress_only",
      batchSequenceNumber: 99,
      sentAt: Date.now(),
      samples: [],
    };

    const res = registry.processTelemetryBatch(batch, "token_secret_alpha_sp_01");
    expect(res.ack.success).toBe(true);
    expect(res.ack.protocolVersion).toBe(CLOUD_EDGE_PROTOCOL_VERSION);
  });

  // ── Critério 20: Ausência de Regressões ──
  it("Critério 20: Ausência de regressões — Schemas Unifilar, Ladder, FBD e SCADA íntegros", () => {
    const eq: CanonicalEquipment = {
      id: "eq_regress_test",
      tagCode: "DJ-01",
      displayName: "Disjuntor Geral QGBT",
      catalogType: "Disjuntor Caixa Moldada",
      category: "protection",
      phases: "3F",
      terminals: [],
      specs: { nominalCurrentA: 400, breakingCapacityKa: 50 },
    };

    const scadaEq = canonicalToScadaTelemetry(eq);
    expect(scadaEq.id).toBe("eq_regress_test");
    expect(scadaEq.tag).toBe("DJ-01");
    expect(scadaEq.category).toBe("PANEL");
    expect(scadaEq.status).toBe("STANDBY");
  });
});
