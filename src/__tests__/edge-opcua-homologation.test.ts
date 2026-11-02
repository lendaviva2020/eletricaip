// ELÉTRICAI INDUSTRIAL OS — GATE 3.4 OPC UA HOMOLOGATION TEST SUITE
// Test Suite: Standalone OPC UA Read-Only Client Driver & Lab Validation
// Standards: OPC UA Part 2, Part 4, Part 5, Part 8, IEC 62443

import { describe, it, expect, beforeEach } from "vitest";
import crypto from "node:crypto";
import { OpcUaClientDriver } from "@/lib/edge/drivers/opcua-driver";
import { PersistentEdgeOutbox } from "@/lib/edge/buffer/sqlite-outbox";

describe("GATE 3.4 — OPC UA Read-Only Driver Homologation", () => {
  let driver: OpcUaClientDriver;
  let outbox: PersistentEdgeOutbox;
  const mockServerCert = "-----BEGIN CERTIFICATE-----\nMIIB...SERVER_MOCK_CERT\n-----END CERTIFICATE-----";
  const validFingerprint = crypto.createHash("sha256").update(mockServerCert).digest("hex").toUpperCase();

  beforeEach(() => {
    outbox = new PersistentEdgeOutbox({ maxSamples: 1000 });
    driver = new OpcUaClientDriver({
      driverId: "drv_opcua_ete",
      connectionId: "conn_ete_plc_01",
      endpointUrl: "opc.tcp://192.168.10.50:4840/eletricai/server",
      securityPolicy: "Basic256Sha256",
      securityMode: "SignAndEncrypt",
      trustedServerCertificates: [validFingerprint],
      rejectUntrustedCertificates: true,
    });
  });

  it("1. Endpoint e Certificado Válido: Conecta com sucesso quando certificado consta na Trust List", async () => {
    expect(driver.getState()).toBe("DISCONNECTED");
    const connected = await driver.connect(mockServerCert);
    expect(connected).toBe(true);
    expect(driver.getState()).toBe("CONNECTED");
    expect(driver.getDiagnostics().lastError).toBeNull();
  });

  it("2. Certificado Inválido / Desconhecido: Rejeita conexão com CERTIFICATE_INVALID", async () => {
    const untrustedCert = "-----BEGIN CERTIFICATE-----\nUNTRUSTED_ROGUE_CERT\n-----END CERTIFICATE-----";
    const connected = await driver.connect(untrustedCert);
    expect(connected).toBe(false);
    expect(driver.getState()).toBe("CERTIFICATE_INVALID");
    expect(driver.getDiagnostics().lastError).toContain("UNTRUSTED_SERVER_CERTIFICATE");
  });

  it("3. Rejeição de Downgrade Inseguro: Bloqueia SecurityPolicy 'None' em ambiente produtivo", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const insecureDriver = new OpcUaClientDriver({
      driverId: "drv_insecure",
      connectionId: "conn_insecure",
      endpointUrl: "opc.tcp://192.168.10.50:4840",
      securityPolicy: "None",
      securityMode: "None",
    });

    const connected = await insecureDriver.connect();
    expect(connected).toBe(false);
    expect(insecureDriver.getState()).toBe("ERROR");
    expect(insecureDriver.getDiagnostics().lastError).toContain("SECURITY_VIOLATION");

    process.env.NODE_ENV = origEnv;
  });

  it("4. Browse de Nós (Address Space): Navega hierarquia de nós industriais (Root, Motors, Tanks)", async () => {
    await driver.connect(mockServerCert);

    // Browse RootFolder
    const rootNodes = await driver.browse("RootFolder");
    expect(rootNodes.length).toBeGreaterThan(0);
    expect(rootNodes.some((n) => n.browseName === "Motors")).toBe(true);

    // Browse Motors
    const motorNodes = await driver.browse("ns=2;s=Motors");
    expect(motorNodes.length).toBe(3);
    const currentVar = motorNodes.find((n) => n.browseName === "Current");
    expect(currentVar).toBeDefined();
    expect(currentVar?.nodeId).toBe("ns=2;s=M01.Current");
    expect(currentVar?.dataType).toBe("REAL");
  });

  it("5. Leitura Síncrona (Read): Obtém valor, tipo, unidade e StatusCode", async () => {
    await driver.connect(mockServerCert);
    driver.setLabNodeValue("ns=2;s=M01.Current", 28.5, {
      dataType: "REAL",
      statusCode: 0x00000000, // Good
      unit: "A",
    });

    const result = await driver.read("ns=2;s=M01.Current");
    expect(result.tagName).toBe("ns=2;s=M01.Current");
    expect(result.value).toBe(28.5);
    expect(result.rawSampleValue).toBe(28.5);
    expect(result.quality).toBe("GOOD");
    expect(result.engineeringUnit).toBe("A");
  });

  it("6. Mapeamento de StatusCodes OPC UA para Qualidade Industrial (GOOD, BAD, UNCERTAIN)", async () => {
    await driver.connect(mockServerCert);

    // Good (0x00000000)
    driver.setLabNodeValue("ns=2;s=P01.Good", 10.0, { statusCode: 0x00000000 });
    const resGood = await driver.read("ns=2;s=P01.Good");
    expect(resGood.quality).toBe("GOOD");

    // Uncertain (0x40000000 - e.g. UncertainInitialValue / SensorNotAccurate)
    driver.setLabNodeValue("ns=2;s=P01.Uncertain", 10.0, { statusCode: 0x40000000 });
    const resUncertain = await driver.read("ns=2;s=P01.Uncertain");
    expect(resUncertain.quality).toBe("UNCERTAIN");

    // Bad (0x80000000 - e.g. BadSensorFailure / BadCommunicationError)
    driver.setLabNodeValue("ns=2;s=P01.Bad", 0.0, { statusCode: 0x80000000 });
    const resBad = await driver.read("ns=2;s=P01.Bad");
    expect(resBad.quality).toBe("BAD");
  });

  it("7. Subscriptions & DataChange: Recebe notificações de itens monitorados", async () => {
    await driver.connect(mockServerCert);
    driver.setLabNodeValue("ns=2;s=M01.Current", 24.0);

    let receivedCount = 0;
    let latestVal: number | boolean | string = 0;

    const subId = await driver.subscribe(["ns=2;s=M01.Current"], 50, (reads) => {
      receivedCount++;
      latestVal = reads[0].value;
    });

    expect(driver.getDiagnostics().activeSubscriptions).toBe(1);

    // Wait for at least 2 publish cycles
    await new Promise((r) => setTimeout(r, 120));

    expect(receivedCount).toBeGreaterThanOrEqual(1);
    expect(latestVal).toBe(24.0);

    await driver.unsubscribe(subId);
    expect(driver.getDiagnostics().activeSubscriptions).toBe(0);
  });

  it("8. Resiliência: Trata perda de conexão, reconecta e re-adquire dados", async () => {
    await driver.connect(mockServerCert);
    expect(driver.getState()).toBe("CONNECTED");

    driver.simulateConnectionLoss();
    expect(driver.getState()).toBe("DISCONNECTED");
    expect(driver.getDiagnostics().reconnectCount).toBe(1);

    // Attempt read while disconnected throws
    await expect(driver.read("ns=2;s=M01.Current")).rejects.toThrow(/OPCUA_NOT_CONNECTED/);

    // Reconnect
    const reconnected = await driver.connect(mockServerCert);
    expect(reconnected).toBe(true);
    expect(driver.getState()).toBe("CONNECTED");
  });

  it("9. Gateway Offline + Store-and-Forward: Amostras OPC UA são bufferizadas e mantêm proveniência", async () => {
    await driver.connect(mockServerCert);
    driver.setLabNodeValue("ns=2;s=M01.Current", 32.1, { unit: "A" });

    const sample = await driver.read("ns=2;s=M01.Current");

    // Internet outage simulated: enqueue to persistent outbox
    const entry = outbox.enqueue({
      projectId: "proj-123",
      organizationId: "org-industrial",
      plantId: "plant-ete",
      gatewayId: "egw_lab_01",
      connectionId: driver.connectionId,
      tagName: "M-01_CORRENTE",
      value: Number(sample.value),
      rawSampleValue: sample.rawSampleValue,
      quality: sample.quality,
      source: "OPC_UA",
      sourceTimestamp: sample.sourceTimestamp,
    });

    expect(entry).not.toBeNull();
    expect(entry?.sequenceNumber).toBe(1);
    expect(entry?.deliveryState).toBe("PENDING");

    const batch = outbox.peekPendingBatch(10);
    expect(batch.length).toBe(1);
    expect(batch[0].value).toBe(32.1);
    expect(batch[0].deliveryState).toBe("IN_FLIGHT");

    // Acknowledge delivery
    const acked = outbox.acknowledgeBatch([batch[0].id]);
    expect(acked).toBe(1);
    expect(outbox.getStatistics().pendingUploadCount).toBe(0);
  });

  it("10. Segurança Física Rígida (Gate 3 Read-Only): Sem métodos de escrita física", () => {
    expect(driver.capabilities.supportsRead).toBe(true);
    expect(driver.capabilities.supportsSubscribe).toBe(true);
    expect(driver.capabilities.supportsWrite).toBe(false);
    expect((driver as unknown as Record<string, unknown>).write).toBeUndefined();
    expect((driver as unknown as Record<string, unknown>).writeNode).toBeUndefined();
  });
});
