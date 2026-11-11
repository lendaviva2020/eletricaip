import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SparkplugBDriver } from "../lib/edge/drivers/sparkplug-driver";

/**
 * Independent Mock Bench Broker simulating an isolated MQTT Sparkplug B Infrastructure
 * (e.g., HiveMQ / EMQX with Sparkplug B extension).
 */
class IndependentMockMqttBroker {
  public brokerUrl: string = "mqtts://10.0.0.10:8883";
  public isRunning: boolean = false;
  public messageLog: Array<{ topic: string; payload: any }> = [];

  public start(): void {
    this.isRunning = true;
  }

  public stop(): void {
    this.isRunning = false;
    this.messageLog = [];
  }

  public publish(topic: string, payload: any): void {
    this.messageLog.push({ topic, payload });
  }
}

describe("GATE 3.3D — Independent Bench MQTT Sparkplug B Interoperability & Command Denial", () => {
  let broker: IndependentMockMqttBroker;
  let driver: SparkplugBDriver;

  const groupId = "Subestacao_Norte";
  const edgeNodeId = "Gateway_Node_01";
  const deviceId = "Inverter_Solar_01";

  beforeEach(async () => {
    broker = new IndependentMockMqttBroker();
    broker.start();

    driver = new SparkplugBDriver({
      driverId: "drv_bench_sparkplug",
      connectionId: "conn_bench_sparkplug",
      brokerUrl: broker.brokerUrl,
      clientId: "egw_bench_client",
      groupId,
      edgeNodeId,
      useTls: true,
      rejectUnauthorized: true,
      authorizedTopicsOnly: true,
    });

    await driver.connect();
  });

  afterEach(async () => {
    await driver.disconnect();
    broker.stop();
  });

  describe("1. Sparkplug B Message Lifecycle (NBIRTH, NDATA, DBIRTH, DDATA, NDEATH)", () => {
    it("processa NBIRTH com registro de métricas do nó e sequência inicial", async () => {
      const nbirthTopic = `spBv1.0/${groupId}/NBIRTH/${edgeNodeId}`;
      const now = Date.now();
      const res = driver.handleIncomingMessage(nbirthTopic, {
        timestamp: now,
        seq: 0,
        metrics: [
          { name: "Node_Status", value: "ONLINE", dataType: "String", timestamp: now },
          { name: "CPU_Load", value: 14.5, dataType: "Float", timestamp: now },
          { name: "bdSeq", value: 1, dataType: "Int32", timestamp: now },
        ],
      });

      expect(res.success).toBe(true);
      const metrics = driver.getKnownMetrics();
      expect(metrics.size).toBe(3);
      expect(metrics.get("Node_Status")?.value).toBe("ONLINE");
      expect(metrics.get("CPU_Load")?.value).toBe(14.5);
      expect(metrics.get("CPU_Load")?.quality).toBe("GOOD");
    });

    it("processa NDATA incremental e atualiza valores existentes", async () => {
      const now = Date.now();
      // Step 1: NBIRTH
      driver.handleIncomingMessage(`spBv1.0/${groupId}/NBIRTH/${edgeNodeId}`, {
        timestamp: now,
        seq: 0,
        metrics: [{ name: "Ambient_Temp", value: 28.0, dataType: "Float", timestamp: now }],
      });

      // Step 2: NDATA
      const resData = driver.handleIncomingMessage(`spBv1.0/${groupId}/NDATA/${edgeNodeId}`, {
        timestamp: now + 1000,
        seq: 1,
        metrics: [{ name: "Ambient_Temp", value: 29.5, dataType: "Float", timestamp: now + 1000 }],
      });

      expect(resData.success).toBe(true);
      const metrics = driver.getKnownMetrics();
      expect(metrics.get("Ambient_Temp")?.value).toBe(29.5);
    });

    it("processa DBIRTH e DDATA de dispositivos vinculados ao nó", async () => {
      const now = Date.now();
      const dbirthTopic = `spBv1.0/${groupId}/DBIRTH/${edgeNodeId}/${deviceId}`;
      driver.handleIncomingMessage(dbirthTopic, {
        timestamp: now,
        seq: 2,
        metrics: [
          { name: "Active_Power_kW", value: 450.0, dataType: "Float", timestamp: now },
          { name: "Inverter_Efficiency", value: 98.2, dataType: "Float", timestamp: now },
        ],
      });

      const ddataTopic = `spBv1.0/${groupId}/DDATA/${edgeNodeId}/${deviceId}`;
      const resDdata = driver.handleIncomingMessage(ddataTopic, {
        timestamp: now + 500,
        seq: 3,
        metrics: [
          { name: "Active_Power_kW", value: 475.2, dataType: "Float", timestamp: now + 500 },
        ],
      });

      expect(resDdata.success).toBe(true);
      const metrics = driver.getKnownMetrics();
      expect(metrics.get(`${deviceId}/Active_Power_kW`)?.value).toBe(475.2);
    });

    it("processa NDEATH transicionando todas as métricas do nó para qualidade STALE", async () => {
      const now = Date.now();
      // Cria nó com métricas
      driver.handleIncomingMessage(`spBv1.0/${groupId}/NBIRTH/${edgeNodeId}`, {
        timestamp: now,
        seq: 0,
        metrics: [{ name: "Solar_Irradiance", value: 850.0, dataType: "Float", timestamp: now }],
      });
      expect(driver.getKnownMetrics().get("Solar_Irradiance")?.quality).toBe("GOOD");

      // Ingest NDEATH
      const resDeath = driver.handleIncomingMessage(`spBv1.0/${groupId}/NDEATH/${edgeNodeId}`, {
        timestamp: now + 2000,
        metrics: [],
      });

      expect(resDeath.success).toBe(true);
      expect(driver.getKnownMetrics().get("Solar_Irradiance")?.quality).toBe("STALE");
    });
  });

  describe("2. Topic ACL & Security Namespace Boundaries", () => {
    it("rejeita mensagens provenientes de Group IDs não autorizados", () => {
      const foreignTopic = `spBv1.0/Other_Company_Plant/NBIRTH/Node_01`;
      const res = driver.handleIncomingMessage(foreignTopic, {
        timestamp: Date.now(),
        seq: 0,
        metrics: [],
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("UNAUTHORIZED_GROUP_TOPIC");
    });

    it("rejeita qualquer publicação ou subscrição em tópicos NCMD e DCMD", async () => {
      const ncmdTopic = `spBv1.0/${groupId}/NCMD/${edgeNodeId}`;
      const dcmdTopic = `spBv1.0/${groupId}/DCMD/${edgeNodeId}/${deviceId}`;

      expect(() => driver.validateTopicAllowed(ncmdTopic)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Tópico de comando Sparkplug B.*não autorizado.*Comandos NCMD e DCMD bloqueados/,
      );

      expect(() => driver.validateTopicAllowed(dcmdTopic)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Tópico de comando Sparkplug B.*não autorizado.*Comandos NCMD e DCMD bloqueados/,
      );

      await expect(driver.publish(ncmdTopic, { command: "RESTART_INVERTER" })).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED/,
      );
    });
  });

  describe("3. Strict Read-Only Physical Safety (Deny-by-Default)", () => {
    it("sendCommand(), publishCommand() e write() rejeitam categoricamente", async () => {
      await expect(driver.sendCommand()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Envio ou execução de comandos Sparkplug B NCMD\/DCMD bloqueado/,
      );
      await expect(driver.publishCommand()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Publicação de comandos Sparkplug B NCMD\/DCMD bloqueada/,
      );
      await expect(driver.write()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Operação física de escrita Sparkplug B bloqueada/,
      );
    });
  });
});
