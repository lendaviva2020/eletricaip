import { describe, it, expect } from "vitest";
import {
  ModbusProtocolEngine,
  OPCUAProtocolEngine,
  SparkplugBProtocolEngine,
} from "../communication/protocol-engine";
import { ControllerFleetManager } from "../fleet/fleet-manager";
import { IndustrialCertificateManager } from "../fleet/certificate-manager";
import { Controller, DigitalTwinState, X509Certificate } from "../canonical/types";

describe("Milestones 8 & 9: Industrial Communication, Fleet Management & Certificates", () => {
  it("ModbusProtocolEngine calcula CRC16 e decodifica quadros TCP", () => {
    // Teste padrão Modbus RTU CRC16 para [0x01, 0x03, 0x00, 0x00, 0x00, 0x0A] -> CRC 0xC5CD
    const rtuData = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]);
    const crc = ModbusProtocolEngine.calculateCRC16(rtuData);
    expect(crc).toBe(52677);

    // Frame Modbus TCP FC03 Read Holding Registers (12 bytes)
    const tcpFrame = new Uint8Array([
      0x00,
      0x01, // Transaction ID = 1
      0x00,
      0x00, // Protocol ID = 0 (Modbus)
      0x00,
      0x06, // Length = 6
      0x01, // Unit ID = 1
      0x03, // Function Code = 3
      0x00,
      0x64, // Starting Address = 100
      0x00,
      0x02, // Quantity = 2 registers
    ]);

    const parsed = ModbusProtocolEngine.parseModbusTCPFrame(tcpFrame);
    expect(parsed.transactionId).toBe(1);
    expect(parsed.unitId).toBe(1);
    expect(parsed.pdu.functionCode).toBe(3);
    expect(parsed.pdu.startingAddress).toBe(100);
    expect(parsed.pdu.quantityOrValue).toBe(2);

    // Executa leitura na memória virtual
    const virtualHoldingRegs = new Map<number, number>([
      [100, 1234],
      [101, 5678],
    ]);
    const resp = ModbusProtocolEngine.executeVirtualModbus(parsed.pdu, virtualHoldingRegs);
    expect(resp.isException).toBe(false);
    expect(resp.registersOrCoils).toEqual([1234, 5678]);
  });

  it("OPCUAProtocolEngine faz o parsing de NodeIds e realiza leitura virtual", () => {
    const nodeStr = "ns=2;s=Device1.Motor.SpeedRPM";
    const parsedNode = OPCUAProtocolEngine.parseNodeId(nodeStr);
    expect(parsedNode.namespaceIndex).toBe(2);
    expect(parsedNode.identifierType).toBe("STRING");
    expect(parsedNode.identifier).toBe("Device1.Motor.SpeedRPM");

    const virtualAddressSpace = new Map([[nodeStr, { value: 1750.5, dataType: "Float" }]]);

    const readRes = OPCUAProtocolEngine.readNode(nodeStr, virtualAddressSpace);
    expect(readRes.statusCode).toBe("Good");
    expect(readRes.value).toBe(1750.5);

    const notFoundRes = OPCUAProtocolEngine.readNode("ns=1;i=9999", virtualAddressSpace);
    expect(notFoundRes.statusCode).toBe("Bad_NotFound");
  });

  it("SparkplugBProtocolEngine valida tópicos canônicos e codifica payloads com seq", () => {
    const validTopic = "spBv1.0/PlantaSul/NDATA/Gateway01/Sensor01";
    const topicMeta = SparkplugBProtocolEngine.parseTopic(validTopic);
    expect(topicMeta.namespace).toBe("spBv1.0");
    expect(topicMeta.groupId).toBe("PlantaSul");
    expect(topicMeta.messageType).toBe("NDATA");
    expect(topicMeta.edgeNodeId).toBe("Gateway01");
    expect(topicMeta.deviceId).toBe("Sensor01");

    const payload = SparkplugBProtocolEngine.encodePayload(
      [{ name: "Temperatura", timestamp: Date.now(), dataType: "Float", value: 45.2 }],
      255,
    );
    expect(payload.seq).toBe(255);
    expect(payload.metrics.length).toBe(1);
  });

  it("ControllerFleetManager detecta Version Drift e valida permissões RBAC", () => {
    const ctrl: Controller = {
      id: "ctrl-subestacao-1",
      tenantId: "tenant-1",
      projectId: "proj-1",
      name: "PLC_SE_01",
      vendor: "CODESYS_VIRTUAL",
      model: "SoftPLC",
      ipAddress: "192.168.1.50",
      firmwareVersion: "3.5.20.0",
      rackModules: [],
      taskConfigurations: [],
      connected: true,
      simulationActive: true,
    };

    const twin: DigitalTwinState = {
      deviceId: ctrl.id,
      observedState: { checksum: "HASH_VERSAO_ANTIGA" },
      declaredState: {},
      inferredState: {},
      lastSyncTimestamp: new Date().toISOString(),
      syncStatus: "DRIFT_DETECTED",
      driftDetails: ["Checksum mismatch"],
    };

    const fleetMgr = new ControllerFleetManager([ctrl], [twin]);
    // O projeto compilou com HASH_VERSAO_NOVA -> deve detectar DRIFT
    const health = fleetMgr.getFleetHealth("HASH_VERSAO_NOVA");
    expect(health.length).toBe(1);
    expect(health[0].status).toBe("DRIFT_DETECTED");
    expect(health[0].isTwinInSync).toBe(false);

    // Validação de RBAC
    expect(ControllerFleetManager.checkPermission("LEAD_ENGINEER", "POU", "WRITE")).toBe(true);
    expect(ControllerFleetManager.checkPermission("OPERATOR", "POU", "WRITE")).toBe(false);
    expect(ControllerFleetManager.checkPermission("OPERATOR", "ALARM", "WRITE")).toBe(true);
    expect(ControllerFleetManager.checkPermission("AUDITOR", "ALARM", "WRITE")).toBe(false);
  });

  it("IndustrialCertificateManager avalia datas de validade e alertas de expiração", () => {
    const validCert: X509Certificate = {
      id: "cert-1",
      controllerId: "c1",
      subject: "CN=PLC01",
      issuer: "CN=RootCA",
      serialNumber: "SN-001",
      validFrom: "2026-01-01T00:00:00Z",
      validTo: "2028-01-01T00:00:00Z",
      thumbprintSha256: "THUMB1",
      purpose: "TLS_SERVER",
      trustStatus: "TRUSTED",
    };

    const expiringCert: X509Certificate = {
      id: "cert-2",
      controllerId: "c1",
      subject: "CN=PLC02",
      issuer: "CN=RootCA",
      serialNumber: "SN-002",
      validFrom: "2025-01-01T00:00:00Z",
      validTo: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // Expira em 10 dias
      thumbprintSha256: "THUMB2",
      purpose: "OPC_UA",
      trustStatus: "TRUSTED",
    };

    const certMgr = new IndustrialCertificateManager([validCert, expiringCert]);
    const report = certMgr.evaluateCertificates();

    expect(report.find((r) => r.id === "cert-1")?.status).toBe("VALID");
    expect(report.find((r) => r.id === "cert-2")?.status).toBe("EXPIRING_SOON");
  });
});
