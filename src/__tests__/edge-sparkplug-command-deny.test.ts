import { describe, it, expect, beforeEach } from "vitest";
import { SparkplugBDriver } from "../lib/edge/drivers/sparkplug-driver";

describe("GATE 3.2B — Sparkplug B Command Denial & Topic Hardening", () => {
  let driver: SparkplugBDriver;

  beforeEach(async () => {
    driver = new SparkplugBDriver({
      driverId: "drv_sparkplug_hardening",
      connectionId: "conn_sparkplug_hardening",
      brokerUrl: "mqtts://127.0.0.1:8883",
      clientId: "egw_hardening_node",
      groupId: "Planta_Industrial_1",
      edgeNodeId: "EdgeNode_01",
    });
    await driver.connect();
  });

  describe("1. Strict Topic Allowlist & Denial of Command Namespaces", () => {
    it("permite tópicos de leitura e telemetria legítimos (NBIRTH, DBIRTH, NDATA, DDATA, NDEATH)", () => {
      expect(() =>
        driver.validateTopicAllowed("spBv1.0/Planta_Industrial_1/NBIRTH/EdgeNode_01")
      ).not.toThrow();

      expect(() =>
        driver.validateTopicAllowed("spBv1.0/Planta_Industrial_1/NDATA/EdgeNode_01")
      ).not.toThrow();

      expect(() =>
        driver.validateTopicAllowed("spBv1.0/Planta_Industrial_1/DBIRTH/EdgeNode_01/Device_Pump01")
      ).not.toThrow();

      expect(() =>
        driver.validateTopicAllowed("spBv1.0/Planta_Industrial_1/DDATA/EdgeNode_01/Device_Pump01")
      ).not.toThrow();

      expect(() =>
        driver.validateTopicAllowed("spBv1.0/Planta_Industrial_1/NDEATH/EdgeNode_01")
      ).not.toThrow();
    });

    it("rejeita qualquer tópico NCMD com PHYSICAL_CONTROL_BLOCKED", () => {
      const ncmdTopic = "spBv1.0/Planta_Industrial_1/NCMD/EdgeNode_01";
      expect(() => driver.validateTopicAllowed(ncmdTopic)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Tópico de comando Sparkplug B.*não autorizado.*Comandos NCMD e DCMD bloqueados/
      );
    });

    it("rejeita qualquer tópico DCMD com PHYSICAL_CONTROL_BLOCKED", () => {
      const dcmdTopic = "spBv1.0/Planta_Industrial_1/DCMD/EdgeNode_01/Device_Pump01";
      expect(() => driver.validateTopicAllowed(dcmdTopic)).toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Tópico de comando Sparkplug B.*não autorizado.*Comandos NCMD e DCMD bloqueados/
      );
    });

    it("publish() em tópico NCMD ou DCMD é bloqueado com PHYSICAL_CONTROL_BLOCKED", async () => {
      await expect(
        driver.publish("spBv1.0/Planta_Industrial_1/NCMD/EdgeNode_01", { command: "REBOOT" })
      ).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);

      await expect(
        driver.publish("spBv1.0/Planta_Industrial_1/DCMD/EdgeNode_01/Motor1", { setpoint: 100 })
      ).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
    });
  });

  describe("2. Physical Control Actuation Methods Rejection", () => {
    it("sendCommand() rejeita com PHYSICAL_CONTROL_BLOCKED", async () => {
      await expect(driver.sendCommand()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Envio ou execução de comandos Sparkplug B NCMD\/DCMD bloqueado/
      );
    });

    it("publishCommand() rejeita com PHYSICAL_CONTROL_BLOCKED", async () => {
      await expect(driver.publishCommand()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Publicação de comandos Sparkplug B NCMD\/DCMD bloqueada/
      );
    });

    it("write() rejeita com PHYSICAL_CONTROL_BLOCKED", async () => {
      await expect(driver.write()).rejects.toThrow(
        /PHYSICAL_CONTROL_BLOCKED: Operação física de escrita Sparkplug B bloqueada/
      );
    });
  });

  describe("3. Telemetry Ingestion & State Retention Across Reconnects", () => {
    it("mantém integridade de métricas e detecta desconexão do nó", async () => {
      const now = Date.now();
      // Ingest NBIRTH
      driver.handleIncomingMessage(
        "spBv1.0/Planta_Industrial_1/NBIRTH/EdgeNode_01",
        {
          timestamp: now,
          seq: 0,
          metrics: [
            { name: "NodeStatus", value: "ONLINE", dataType: "String", timestamp: now },
            { name: "CPU_Temp", value: 42.5, dataType: "Float", timestamp: now },
          ],
        },
      );

      const metrics = driver.getKnownMetrics();
      expect(metrics.size).toBe(2);
      expect(metrics.get("NodeStatus")?.value).toBe("ONLINE");
      expect(metrics.get("CPU_Temp")?.value).toBe(42.5);

      // Ingest NDEATH
      driver.handleIncomingMessage(
        "spBv1.0/Planta_Industrial_1/NDEATH/EdgeNode_01",
        {
          timestamp: now + 500,
          metrics: [],
        },
      );

      // Metrics must transition to STALE quality
      expect(driver.getKnownMetrics().get("CPU_Temp")?.quality).toBe("STALE");
    });
  });
});
