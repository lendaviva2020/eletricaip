// ELÉTRICAI INDUSTRIAL OS — GATE 3.1I STRICT READ-ONLY PHYSICAL SAFETY HOMOLOGATION
// Verification of Permanent Hardware Interlocks: Blocking Physical Writes, Commands, Actuations & FCs
// Standards: IEC 62443, NIST SP 800-82 Rev. 3, ISO 13849-1 (Safety of Machinery)

import { describe, it, expect, beforeEach } from "vitest";
import { ModbusTcpClientDriver } from "@/lib/edge/drivers/modbus-driver";
import { OpcUaClientDriver } from "@/lib/edge/drivers/opcua-driver";
import { SparkplugBDriver } from "@/lib/edge/drivers/sparkplug-driver";
import { MasterEdgeGatewayManager } from "@/lib/edge/gateway-manager";
import type { GatewayIdentity } from "@/lib/edge/types";

describe("GATE 3.1I — Strict Read-Only Physical Safety Enforcement", () => {
  let modbusDriver: ModbusTcpClientDriver;
  let opcDriver: OpcUaClientDriver;
  let sparkplugDriver: SparkplugBDriver;
  let gatewayManager: MasterEdgeGatewayManager;

  const identity: GatewayIdentity = {
    gatewayId: "egw_safety_lab_01",
    organizationId: "org_industrial_sp",
    plantId: "plant_ete_matriz",
    stationId: "station_rack_01",
    gatewayVersion: "3.1.0-industrial",
    installationId: "inst_01",
    certificateFingerprint: "sha256:fingerprint",
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    operationalState: "ONLINE",
  };

  beforeEach(() => {
    modbusDriver = new ModbusTcpClientDriver({
      driverId: "drv_modbus_safety",
      connectionId: "conn_modbus_safety",
      host: "127.0.0.1",
      port: 502,
    });

    opcDriver = new OpcUaClientDriver({
      driverId: "drv_opc_safety",
      connectionId: "conn_opc_safety",
      endpointUrl: "opc.tcp://127.0.0.1:4840",
    });

    sparkplugDriver = new SparkplugBDriver({
      driverId: "drv_sparkplug_safety",
      connectionId: "conn_sparkplug_safety",
      brokerUrl: "mqtts://127.0.0.1:8883",
      clientId: "egw_safety_client",
      groupId: "Planta_ETE",
      edgeNodeId: "Node_ETE",
    });

    gatewayManager = new MasterEdgeGatewayManager({
      identity,
    });
  });

  it("1. Contrato Imutável: isPhysicalControlAllowed é permanentemente false no Gateway Manager e drivers", () => {
    expect(gatewayManager.isPhysicalControlAllowed).toBe(false);
    expect(modbusDriver.capabilities.supportsWrite).toBe(false);
    expect(opcDriver.capabilities.supportsWrite).toBe(false);
    expect(sparkplugDriver.capabilities.supportsWrite).toBe(false);
  });

  it("2. Modbus TCP: Bloqueia chamadas de escrita de Coils e Registradores (FC5, FC6, FC15, FC16)", async () => {
    await expect(modbusDriver.writeCoil()).rejects.toThrow(
      /PHYSICAL_CONTROL_BLOCKED: Modbus FC5\/FC15/
    );

    await expect(modbusDriver.writeRegister()).rejects.toThrow(
      /PHYSICAL_CONTROL_BLOCKED: Modbus FC6\/FC16/
    );

    await expect(modbusDriver.write()).rejects.toThrow(
      /PHYSICAL_CONTROL_BLOCKED: Operação física de escrita Modbus bloqueada/
    );
  });

  it("3. OPC UA: Bloqueia chamadas Write e Method Call para evitar atuação em motores ou válvulas", async () => {
    // Physical Write method is completely absent from read-only driver interface
    expect((opcDriver as any).write).toBeUndefined();
    expect((opcDriver as any).writeNode).toBeUndefined();

    await expect(opcDriver.callMethod()).rejects.toThrow(
      /PHYSICAL_CONTROL_BLOCKED: Chamada OPC UA Method Call bloqueada/
    );
  });

  it("4. MQTT Sparkplug B: Bloqueia envio de mensagens de comando NCMD e DCMD", async () => {
    await expect(sparkplugDriver.sendCommand()).rejects.toThrow(
      /PHYSICAL_CONTROL_BLOCKED: Envio ou execução de comandos Sparkplug B NCMD\/DCMD bloqueado/
    );

    await expect(sparkplugDriver.write()).rejects.toThrow(
      /PHYSICAL_CONTROL_BLOCKED: Operação física de escrita Sparkplug B bloqueada/
    );
  });

  it("5. Gateway Orchestrator: Bloqueia qualquer invocação de comando físico (Start/Stop/Reset/Open/Close)", () => {
    expect(() => gatewayManager.executePhysicalCommand()).toThrow(
      /PHYSICAL_CONTROL_BLOCKED: Comandos físicos desabilitados no Gateway/
    );
  });
});
