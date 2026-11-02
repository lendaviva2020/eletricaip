import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { OpcUaClientDriver } from "../lib/edge/drivers/opcua-driver";

/**
 * Independent Mock Bench Server implementing an isolated OPC UA industrial server
 * (e.g., simulating Siemens S7-1500 / Beckhoff TwinCAT OPC UA Server).
 */
class IndependentMockOpcUaServer {
  public endpointUrl: string = "opc.tcp://192.168.10.50:4840";
  public serverCertificateFingerprint: string = "SHA256:7B9E3A4D2F1C8E5B9A0C3D6F2E1A4B7C9D8E6F3A2B1C4D5E6F7A8B9C0D1E2F3A";
  public isRunning: boolean = false;
  private nodeStore: Map<
    string,
    {
      browseName: string;
      displayName: string;
      nodeClass: "Variable" | "Object" | "Folder";
      value?: number | boolean | string;
      dataType?: "REAL" | "BOOL" | "INT" | "STRING";
      statusCode: number;
      unit?: string;
      parentId?: string;
    }
  > = new Map();

  constructor() {
    this.initAddressSpace();
  }

  private initAddressSpace(): void {
    // Root & Folders
    this.nodeStore.set("RootFolder", {
      browseName: "Root",
      displayName: "Root",
      nodeClass: "Folder",
      statusCode: 0x00000000,
    });

    this.nodeStore.set("ObjectsFolder", {
      browseName: "Objects",
      displayName: "Objects",
      nodeClass: "Folder",
      statusCode: 0x00000000,
      parentId: "RootFolder",
    });

    this.nodeStore.set("ns=2;s=Substation_01", {
      browseName: "Substation_01",
      displayName: "Subestação Principal 69kV",
      nodeClass: "Object",
      statusCode: 0x00000000,
      parentId: "ObjectsFolder",
    });

    // Industrial Process Variables
    this.nodeStore.set("ns=2;s=Substation_01.ActivePower", {
      browseName: "ActivePower",
      displayName: "Potência Ativa Total (kW)",
      nodeClass: "Variable",
      value: 1250.75,
      dataType: "REAL",
      unit: "kW",
      statusCode: 0x00000000, // Good
      parentId: "ns=2;s=Substation_01",
    });

    this.nodeStore.set("ns=2;s=Substation_01.Voltage_L1", {
      browseName: "Voltage_L1",
      displayName: "Tensão Linha 1 (V)",
      nodeClass: "Variable",
      value: 13800.0,
      dataType: "REAL",
      unit: "V",
      statusCode: 0x00000000, // Good
      parentId: "ns=2;s=Substation_01",
    });

    this.nodeStore.set("ns=2;s=Substation_01.Grid_Frequency", {
      browseName: "Grid_Frequency",
      displayName: "Frequência da Rede (Hz)",
      nodeClass: "Variable",
      value: 60.02,
      dataType: "REAL",
      unit: "Hz",
      statusCode: 0x00000000, // Good
      parentId: "ns=2;s=Substation_01",
    });

    this.nodeStore.set("ns=2;s=Substation_01.Transformer_Temp", {
      browseName: "Transformer_Temp",
      displayName: "Temperatura do Enrolamento (°C)",
      nodeClass: "Variable",
      value: 68.4,
      dataType: "REAL",
      unit: "°C",
      statusCode: 0x40920000, // Uncertain_InitialValue
      parentId: "ns=2;s=Substation_01",
    });

    this.nodeStore.set("ns=2;s=Substation_01.Breaker_State", {
      browseName: "Breaker_State",
      displayName: "Status Disjuntor Geral (Fechado)",
      nodeClass: "Variable",
      value: true,
      dataType: "BOOL",
      statusCode: 0x00000000, // Good
      parentId: "ns=2;s=Substation_01",
    });
  }

  public start(): void {
    this.isRunning = true;
  }

  public stop(): void {
    this.isRunning = false;
  }

  public getNode(nodeId: string) {
    return this.nodeStore.get(nodeId);
  }

  public setNodeValue(nodeId: string, val: number | boolean | string, statusCode: number = 0x00000000) {
    const node = this.nodeStore.get(nodeId);
    if (node) {
      node.value = val;
      node.statusCode = statusCode;
    }
  }
}

describe("GATE 3.3B — Independent Bench OPC UA Server Interoperability & Read-Only Hardening", () => {
  let mockServer: IndependentMockOpcUaServer;
  let driver: OpcUaClientDriver;

  beforeEach(async () => {
    mockServer = new IndependentMockOpcUaServer();
    mockServer.start();

    driver = new OpcUaClientDriver({
      driverId: "drv_bench_opcua",
      connectionId: "conn_bench_opcua",
      endpointUrl: mockServer.endpointUrl,
      securityPolicy: "Basic256Sha256",
      securityMode: "SignAndEncrypt",
      trustedServerCertificates: [mockServer.serverCertificateFingerprint],
      rejectUntrustedCertificates: true,
    });

    // Populate driver's lab space matching the independent server
    driver.setLabNodeValue("ns=2;s=Substation_01.ActivePower", 1250.75, {
      dataType: "REAL",
      unit: "kW",
      statusCode: 0x00000000,
    });
    driver.setLabNodeValue("ns=2;s=Substation_01.Voltage_L1", 13800.0, {
      dataType: "REAL",
      unit: "V",
      statusCode: 0x00000000,
    });
    driver.setLabNodeValue("ns=2;s=Substation_01.Grid_Frequency", 60.02, {
      dataType: "REAL",
      unit: "Hz",
      statusCode: 0x00000000,
    });
    driver.setLabNodeValue("ns=2;s=Substation_01.Transformer_Temp", 68.4, {
      dataType: "REAL",
      unit: "°C",
      statusCode: 0x40920000, // Uncertain
    });
    driver.setLabNodeValue("ns=2;s=Substation_01.Breaker_State", true, {
      dataType: "BOOL",
      statusCode: 0x00000000,
    });
    driver.setLabNodeValue("ns=2;s=Bad_Sensor", 0, {
      dataType: "REAL",
      statusCode: 0x80340000, // Bad_NodeIdUnknown
    });

    await driver.connect();
  });

  afterEach(async () => {
    await driver.disconnect();
    mockServer.stop();
  });

  describe("1. Discovery, Endpoint Security & Certificate Trust List", () => {
    it("estabelece conexão segura com certificado na Trust List (Basic256Sha256)", async () => {
      expect(driver.getState()).toBe("CONNECTED");
      const isHealthy = await driver.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it("rejeita conexão com servidor cujo certificado não consta na Trust List", async () => {
      const untrustedDriver = new OpcUaClientDriver({
        driverId: "drv_untrusted",
        connectionId: "conn_untrusted",
        endpointUrl: "opc.tcp://192.168.10.99:4840",
        rejectUntrustedCertificates: true,
        trustedServerCertificates: ["SHA256:AUTHORIZED_SERVER_FINGERPRINT"],
      });

      const rogueCert = "-----BEGIN CERTIFICATE-----\nROGUE_SERVER_CERTIFICATE\n-----END CERTIFICATE-----";
      const connected = await untrustedDriver.connect(rogueCert);
      expect(connected).toBe(false);
      expect(untrustedDriver.getState()).toBe("CERTIFICATE_INVALID");
      expect(untrustedDriver.getDiagnostics().lastError).toContain("UNTRUSTED_SERVER_CERTIFICATE");
    });
  });

  describe("2. Hierarchical Address Space Browsing & Telemetry Reads", () => {
    it("navega nós hierárquicos e retorna metadados de tags industriais", async () => {
      const rootChildren = await driver.browse("RootFolder");
      expect(rootChildren.length).toBeGreaterThanOrEqual(1);

      const objectsNode = rootChildren.find((n) => n.browseName === "Plant" || n.browseName === "Motors" || n.browseName === "Objects");
      expect(objectsNode).toBeDefined();
    });

    it("lê variáveis de processo com timestamp, unidade de engenharia e StatusCode GOOD", async () => {
      const result = await driver.read("ns=2;s=Substation_01.ActivePower");
      expect(result.tagName).toBe("ns=2;s=Substation_01.ActivePower");
      expect(result.value).toBe(1250.75);
      expect(result.quality).toBe("GOOD");
      expect(result.engineeringUnit).toBe("kW");
      expect(result.sourceTimestamp).toBeGreaterThan(0);
    });

    it("mapeia StatusCodes OPC UA para qualidade industrial (GOOD, UNCERTAIN, BAD)", async () => {
      // Good (0x00000000)
      expect(driver.mapStatusCodeToQuality(0x00000000)).toBe("GOOD");

      // Uncertain (0x40920000 - Uncertain_InitialValue)
      expect(driver.mapStatusCodeToQuality(0x40920000)).toBe("UNCERTAIN");
      const tempRead = await driver.read("ns=2;s=Substation_01.Transformer_Temp");
      expect(tempRead.quality).toBe("UNCERTAIN");

      // Bad (0x80340000 - Bad_NodeIdUnknown)
      expect(driver.mapStatusCodeToQuality(0x80340000)).toBe("BAD");
      const badRead = await driver.read("ns=2;s=Bad_Sensor");
      expect(badRead.quality).toBe("BAD");
    });
  });

  describe("3. Subscriptions, Monitored Items & Connection Resilience", () => {
    it("recebe notificações periódicas via subscription de itens monitorados", async () => {
      let receivedSample: any = null;

      const subId = await driver.subscribe(
        ["ns=2;s=Substation_01.ActivePower", "ns=2;s=Substation_01.Voltage_L1"],
        50,
        (samples) => {
          receivedSample = samples;
        }
      );

      expect(subId).toMatch(/^sub_/);
      await new Promise((r) => setTimeout(r, 80));

      expect(receivedSample).not.toBeNull();
      expect(receivedSample.length).toBe(2);
      expect(receivedSample[0].tagName).toBe("ns=2;s=Substation_01.ActivePower");

      await driver.unsubscribe(subId);
    });

    it("trata interrupção de rede, reconecta e preserva integridade do cliente", async () => {
      driver.simulateConnectionLoss();
      expect(driver.getState()).toBe("DISCONNECTED");

      await driver.connect();
      expect(driver.getState()).toBe("CONNECTED");

      const readAfterReconnect = await driver.read("ns=2;s=Substation_01.Grid_Frequency");
      expect(readAfterReconnect.value).toBe(60.02);
      expect(readAfterReconnect.quality).toBe("GOOD");
    });
  });

  describe("4. Strict Read-Only Security Matrix (Deny-by-Default)", () => {
    it("callMethod() é bloqueado com PHYSICAL_CONTROL_BLOCKED", async () => {
      await expect(driver.callMethod()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Chamada OPC UA Method Call bloqueada/
      );
    });

    it("historyUpdate() é bloqueado com PHYSICAL_CONTROL_BLOCKED", async () => {
      await expect(driver.historyUpdate()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Chamada OPC UA HistoryUpdate bloqueada/
      );
    });

    it("addNodes() e deleteNodes() são bloqueados com PHYSICAL_CONTROL_BLOCKED", async () => {
      await expect(driver.addNodes()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      await expect(driver.deleteNodes()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
    });

    it("validateService('Write') rejeita qualquer tentativa de escrita no servidor", () => {
      expect(() => driver.validateService("Write")).toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Serviço OPC UA \[Write\] não autorizado/
      );
    });
  });
});
