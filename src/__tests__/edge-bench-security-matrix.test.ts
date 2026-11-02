import { describe, it, expect, beforeEach } from "vitest";
import { MasterEdgeGatewayManager } from "../lib/edge/gateway-manager";
import { ModbusTcpClientDriver } from "../lib/edge/drivers/modbus-driver";
import { OpcUaClientDriver } from "../lib/edge/drivers/opcua-driver";
import { SparkplugBDriver } from "../lib/edge/drivers/sparkplug-driver";
import { EdgeProvisioningService } from "../lib/edge/provisioning";
import { maskSecrets } from "../edge-daemon/logger";
import type { GatewayIdentity } from "../lib/edge/types";

describe("GATE 3.3G — Master Industrial Security Matrix (Negative Testing & Boundary Protection)", () => {
  let gatewayManager: MasterEdgeGatewayManager;
  let modbusDriver: ModbusTcpClientDriver;
  let opcDriver: OpcUaClientDriver;
  let sparkplugDriver: SparkplugBDriver;
  let provService: EdgeProvisioningService;

  const validIdentity: GatewayIdentity = {
    gatewayId: "gw_security_bench_01",
    organizationId: "org_alpha_industries",
    plantId: "plant_substation_north",
    stationId: "station_01",
    gatewayVersion: "1.0.0",
    installationId: "inst_alpha_01",
    certificateFingerprint: "SHA256:FINGERPRINT_ALPHA",
    registeredAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    operationalState: "ONLINE",
  };

  beforeEach(() => {
    modbusDriver = new ModbusTcpClientDriver({
      driverId: "drv_modbus_sec",
      connectionId: "conn_modbus_sec",
      host: "127.0.0.1",
      port: 502,
    });

    opcDriver = new OpcUaClientDriver({
      driverId: "drv_opc_sec",
      connectionId: "conn_opc_sec",
      endpointUrl: "opc.tcp://127.0.0.1:4840",
    });

    sparkplugDriver = new SparkplugBDriver({
      driverId: "drv_spark_sec",
      connectionId: "conn_spark_sec",
      brokerUrl: "mqtts://127.0.0.1:8883",
      clientId: "egw_sec_client",
      groupId: "Alpha_Group",
      edgeNodeId: "Node_01",
    });

    gatewayManager = new MasterEdgeGatewayManager({
      identity: validIdentity,
    });

    provService = new EdgeProvisioningService();
  });

  describe("1. Hardware Interlock & Physical Control Permanent Denial", () => {
    it("isPhysicalControlAllowed é false e imutável no GatewayManager e em todos os drivers", () => {
      expect(gatewayManager.isPhysicalControlAllowed).toBe(false);
      expect(modbusDriver.capabilities.supportsWrite).toBe(false);
      expect(opcDriver.capabilities.supportsWrite).toBe(false);
      expect(sparkplugDriver.capabilities.supportsWrite).toBe(false);
    });

    it("executePhysicalCommand() lança PHYSICAL_CONTROL_BLOCKED", () => {
      expect(() => (gatewayManager as any).executePhysicalCommand("START_PUMP")).toThrow(
        /PHYSICAL_CONTROL_BLOCKED/
      );
    });
  });

  describe("2. Protocol-Level Write & Actuation Negative Rejection", () => {
    it("Modbus TCP: bloqueia FC5, FC6, FC15, FC16, FC22, FC23 e chamadas de escrita", async () => {
      await expect(modbusDriver.writeCoil()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      await expect(modbusDriver.writeRegister()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      await expect(modbusDriver.write()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);

      expect(() => modbusDriver.validateFunctionCode(5)).toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      expect(() => modbusDriver.validateFunctionCode(6)).toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      expect(() => modbusDriver.validateFunctionCode(15)).toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      expect(() => modbusDriver.validateFunctionCode(16)).toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      expect(() => modbusDriver.validateFunctionCode(22)).toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      expect(() => modbusDriver.validateFunctionCode(23)).toThrow(/PHYSICAL_CONTROL_BLOCKED/);
    });

    it("OPC UA: bloqueia chamadas Write, Method Call e modificação de nós", async () => {
      await expect(opcDriver.callMethod()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      await expect(opcDriver.historyUpdate()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      await expect(opcDriver.addNodes()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      await expect(opcDriver.deleteNodes()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      expect(() => opcDriver.validateService("Write")).toThrow(/PHYSICAL_CONTROL_BLOCKED/);
    });

    it("Sparkplug B: bloqueia publicação em NCMD/DCMD e métodos de envio de comando", async () => {
      await expect(sparkplugDriver.sendCommand()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      await expect(sparkplugDriver.publishCommand()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      await expect(sparkplugDriver.write()).rejects.toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      expect(() => sparkplugDriver.validateTopicAllowed("spBv1.0/G/NCMD/N")).toThrow(/PHYSICAL_CONTROL_BLOCKED/);
      expect(() => sparkplugDriver.validateTopicAllowed("spBv1.0/G/DCMD/N/D")).toThrow(/PHYSICAL_CONTROL_BLOCKED/);
    });
  });

  describe("3. Provisioning, Identity & Multi-Tenant Boundary Enforcement", () => {
    it("rejeita provisionamento com token expirado", () => {
      const expiredToken = provService.createProvisioningToken({
        organizationId: "org_alpha",
        plantId: "plant_01",
        stationId: "st_01",
        issuedBy: "admin@eletricai.com",
        ttlMinutes: -1, // Expirado no passado
      });

      const res = provService.provisionGateway({
        provisioningToken: expiredToken.token,
        stationHardwareId: "HW-EXPIRED-TEST",
        gatewayVersion: "1.0.0",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("TOKEN_EXPIRED");
    });

    it("rejeita reutilização de token consumido (Atomic Burn / One-Time Use)", () => {
      const token = provService.createProvisioningToken({
        organizationId: "org_alpha",
        plantId: "plant_01",
        stationId: "st_01",
        issuedBy: "admin@eletricai.com",
        ttlMinutes: 15,
      });

      const res1 = provService.provisionGateway({
        provisioningToken: token.token,
        stationHardwareId: "HW-STATION-01",
        gatewayVersion: "1.0.0",
      });
      expect(res1.success).toBe(true);

      const res2 = provService.provisionGateway({
        provisioningToken: token.token,
        stationHardwareId: "HW-STATION-02",
        gatewayVersion: "1.0.0",
      });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain("TOKEN_ALREADY_USED");
    });

    it("rejeita autenticação de gateway revogado administrativamente", () => {
      const token = provService.createProvisioningToken({
        organizationId: "org_alpha",
        plantId: "plant_01",
        stationId: "st_01",
        issuedBy: "admin@eletricai.com",
      });

      const res = provService.provisionGateway({
        provisioningToken: token.token,
        stationHardwareId: "HW-REVOCATION-TEST",
        gatewayVersion: "1.0.0",
      });
      expect(res.success).toBe(true);

      // Autentica com sucesso
      expect(provService.authenticateGateway(res.authToken)).not.toBeNull();

      // Revoga o gateway
      provService.revokeGateway(res.gatewayId, "SECURITY_BREACH_SUSPECTED");

      // Autenticação subsequente deve ser negada
      expect(provService.authenticateGateway(res.authToken)).toBeNull();
    });

    it("impede injeção de amostras com organizationId ou plantId divergente (Isolamento Multi-Tenant)", () => {
      gatewayManager.registerDriver(modbusDriver);

      // Mapeamento correto registrado para org_alpha_industries
      gatewayManager.mapTag({
        driverId: "drv_modbus_sec",
        sourceAddress: "4x:100",
        targetTagName: "CROSS_TENANT_TAG",
        projectId: "proj_alpha_legit",
      });

      // Tentativa de injetar dados com organização divergente lança violação estrita de segurança
      expect(() => {
        gatewayManager.ingestDriverTelemetry({
          driverId: "drv_modbus_sec",
          sourceAddress: "4x:100",
          value: 123.4,
          quality: "GOOD",
          sourceTimestamp: Date.now(),
          organizationId: "org_malicious_attacker",
          plantId: "plant_unauthorized",
          projectId: "proj_alpha_legit",
        });
      }).toThrow(/MULTI_TENANT_SECURITY_VIOLATION/);

      // Amostra legítima autenticada no tenant correto é aceita com sucesso
      gatewayManager.ingestDriverTelemetry({
        driverId: "drv_modbus_sec",
        sourceAddress: "4x:100",
        value: 123.4,
        quality: "GOOD",
        sourceTimestamp: Date.now(),
        organizationId: validIdentity.organizationId,
        plantId: validIdentity.plantId,
        projectId: "proj_alpha_legit",
      });

      const batch = gatewayManager.flushOutboxToCloud();
      expect(batch.sent).toBe(1);
    });
  });

  describe("4. Logging Sanitization & Secret Redaction (IEC 62443-4-2)", () => {
    it("mascara senhas, tokens de autenticação e chaves privadas nos logs", () => {
      const rawLog =
        'Conexão com broker estabelecida com authToken="super_secret_token_abc123" e password="IndustrialSecretPassword456". Chave privada: -----BEGIN RSA PRIVATE KEY----- MIICXAIBAAKCAQEA0... -----END RSA PRIVATE KEY-----';

      const sanitized = maskSecrets(rawLog);

      expect(sanitized).not.toContain("super_secret_token_abc123");
      expect(sanitized).not.toContain("IndustrialSecretPassword456");
      expect(sanitized).not.toContain("MIICXAIBAAKCAQEA0");
      expect(sanitized).toContain("***REDACTED***");
    });
  });
});
