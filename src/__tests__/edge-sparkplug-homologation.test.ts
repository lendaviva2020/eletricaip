// ELÉTRICAI INDUSTRIAL OS — GATE 3.8 MQTT SPARKPLUG B HOMOLOGATION TEST SUITE
// Test Suite: Standalone MQTT Sparkplug B Read-Only Driver & Lab Validation
// Standards: Eclipse Sparkplug B Specification V1.0 (ISO/IEC 20237), IEC 62443

import { describe, it, expect, beforeEach } from "vitest";
import { SparkplugBDriver } from "@/lib/edge/drivers/sparkplug-driver";

describe("GATE 3.8 — MQTT Sparkplug B Read-Only Driver Homologation", () => {
  let driver: SparkplugBDriver;
  const groupId = "Planta_ETE_01";
  const edgeNodeId = "Gateway_Node_A";

  beforeEach(() => {
    driver = new SparkplugBDriver({
      driverId: "drv_sparkplug_lab",
      connectionId: "conn_spb_broker_01",
      brokerUrl: "mqtts://192.168.10.150:8883",
      clientId: "eletricai-edge-gw-01",
      groupId,
      edgeNodeId,
      useTls: true,
      authorizedTopicsOnly: true,
    });
  });

  it("1. Conexão ao Broker MQTT: Conecta com sucesso e subscreve o namespace Sparkplug B", async () => {
    expect(driver.getState()).toBe("DISCONNECTED");
    const ok = await driver.connect();
    expect(ok).toBe(true);
    expect(driver.getState()).toBe("CONNECTED");
  });

  it("2. Processamento de NBIRTH: Registra nascimento do nó e métricas iniciais", async () => {
    await driver.connect();

    const topic = `spBv1.0/${groupId}/NBIRTH/${edgeNodeId}`;
    const now = Date.now();

    const res = driver.handleIncomingMessage(topic, {
      timestamp: now,
      seq: 0,
      metrics: [
        {
          name: "Node_Uptime",
          dataType: "Int32",
          value: 3600,
          timestamp: now,
          metadata: { engineeringUnits: "s" },
        },
        {
          name: "CPU_Temp",
          dataType: "Float",
          value: 48.5,
          timestamp: now,
          metadata: { engineeringUnits: "°C" },
        },
      ],
    });

    expect(res.success).toBe(true);
    expect(await driver.healthCheck()).toBe(true);

    const uptime = await driver.read("Node_Uptime");
    expect(uptime.value).toBe(3600);
    expect(uptime.quality).toBe("GOOD");
    expect(uptime.engineeringUnit).toBe("s");

    const temp = await driver.read("CPU_Temp");
    expect(temp.value).toBe(48.5);
    expect(temp.quality).toBe("GOOD");
    expect(temp.engineeringUnit).toBe("°C");
  });

  it("3. Processamento de DBIRTH & DDATA: Gerencia telemetria de dispositivos vinculados ao nó", async () => {
    await driver.connect();
    const deviceId = "Bomba_P01";
    const now = Date.now();

    // 1. DBIRTH
    driver.handleIncomingMessage(`spBv1.0/${groupId}/DBIRTH/${edgeNodeId}/${deviceId}`, {
      timestamp: now,
      seq: 0,
      metrics: [
        {
          name: "Vazao",
          dataType: "Float",
          value: 82.4,
          timestamp: now,
          metadata: { engineeringUnits: "m³/h" },
        },
        {
          name: "Ligado",
          dataType: "Boolean",
          value: true,
          timestamp: now,
        },
      ],
    });

    const flowBirth = await driver.read("Bomba_P01/Vazao");
    expect(flowBirth.value).toBe(82.4);
    expect(flowBirth.quality).toBe("GOOD");

    // 2. DDATA (atualização periódica com seq = 1)
    let callbackReceived = false;
    await driver.subscribe([], 1000, (results) => {
      const match = results.find((r) => r.tagName === "Bomba_P01/Vazao");
      if (match && match.value === 85.0) {
        callbackReceived = true;
      }
    });

    driver.handleIncomingMessage(`spBv1.0/${groupId}/DDATA/${edgeNodeId}/${deviceId}`, {
      timestamp: now + 1000,
      seq: 1,
      metrics: [
        {
          name: "Vazao",
          dataType: "Float",
          value: 85.0,
          timestamp: now + 1000,
        },
      ],
    });

    const flowData = await driver.read("Bomba_P01/Vazao");
    expect(flowData.value).toBe(85.0);
    expect(callbackReceived).toBe(true);
  });

  it("4. Validação de Tópico ACL: Rejeita mensagens de Group IDs não autorizados", async () => {
    await driver.connect();
    const unauthorizedTopic = `spBv1.0/Planta_INTRUSA/NBIRTH/${edgeNodeId}`;

    const res = driver.handleIncomingMessage(unauthorizedTopic, {
      timestamp: Date.now(),
      metrics: [{ name: "Hack_Metric", dataType: "Int32", value: 999, timestamp: Date.now() }],
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("UNAUTHORIZED_GROUP_TOPIC");
    expect(driver.getDiagnostics().requestsFailed).toBe(1);
  });

  it("5. Processamento de NDEATH: Transiciona métricas do nó para qualidade STALE", async () => {
    await driver.connect();
    const now = Date.now();

    // Send initial NBIRTH
    driver.handleIncomingMessage(`spBv1.0/${groupId}/NBIRTH/${edgeNodeId}`, {
      timestamp: now,
      seq: 0,
      metrics: [{ name: "PLC_Health", dataType: "Boolean", value: true, timestamp: now }],
    });

    const beforeDeath = await driver.read("PLC_Health");
    expect(beforeDeath.quality).toBe("GOOD");

    // Broker receives Last Will NDEATH
    driver.handleIncomingMessage(`spBv1.0/${groupId}/NDEATH/${edgeNodeId}`, {
      timestamp: now + 5000,
      metrics: [],
    });

    const afterDeath = await driver.read("PLC_Health");
    expect(afterDeath.quality).toBe("STALE");
    expect(await driver.healthCheck()).toBe(false);
  });

  it("6. Segurança Física Rígida (Gate 3 Read-Only): Sem comandos de escrita NCMD/DCMD", () => {
    expect(driver.capabilities.supportsRead).toBe(true);
    expect(driver.capabilities.supportsSubscribe).toBe(true);
    expect(driver.capabilities.supportsWrite).toBe(false);
    expect((driver as unknown as Record<string, unknown>).sendNodeCommand).toBeUndefined();
    expect((driver as unknown as Record<string, unknown>).sendDeviceCommand).toBeUndefined();
  });
});
