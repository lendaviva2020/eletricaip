// ELÉTRICAI INDUSTRIAL OS — GATE 4.3.1 SECURITY & ARCHITECTURE REGRESSION SUITE
// Part 1: Cloud–Edge–OT Separation, Network Allowlist, Honest Protocol Classification & Physical Write Blocks

import { describe, expect, it, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  authorizeCloudToEdgeReadTarget,
  isEdgeOtHostAllowed,
  isHostAllowed,
  isOpcuaEndpointAllowed,
  PROTOCOL_LAYER_CLASSIFICATION,
} from "@/lib/edge/protocol-classification";
import { resolveToAllowedIPv4 } from "@/lib/edge/edge-network-allowlist";
import {
  executeConnectModbus,
  executeTestModbusHost,
  executeWriteModbusRegister,
} from "@/lib/edge/modbus-handlers.server";
import {
  executeConnectOpcua,
  executeTestOpcuaConnection,
  executeWriteOpcuaTag,
} from "@/lib/edge/opcua-handlers.server";
import { ModbusTcpClientDriver } from "@/lib/edge/drivers/modbus-driver";
import { OpcUaClientDriver } from "@/lib/edge/drivers/opcua-driver";
import { SparkplugBDriver } from "@/lib/edge/drivers/sparkplug-driver";
import {
  ModbusProtocolEngine,
  OPCUAProtocolEngine,
  SparkplugBProtocolEngine,
  MQTTProtocolEngine,
} from "@/lib/studio/communication/protocol-engine";
import { getRecentSecurityEvents } from "@/lib/security/security-audit-log.server";

const REPO_ROOT = path.resolve(__dirname, "../..");

function makeAuthCtx(userId: string, tenantId: string, role: string) {
  return {
    userId,
    claims: { tenant_id: tenantId },
    supabase: {
      from: (table: string) => {
        if (table === "tenant_memberships") {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ tenant_id: tenantId, role }],
                error: null,
              }),
            }),
          };
        }
        if (table === "runtime_logs") {
          return {
            insert: async () => ({ error: null }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { tenant_id: tenantId }, error: null }),
            }),
          }),
        };
      },
    },
  };
}

describe("Gate 4.3.1 — Cloud–Edge–OT Boundary & Protocol Classification", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("Cloud server functions import zero TCP sockets (net) and zero DNS resolution (node:dns)", () => {
    const modbusSrc = fs.readFileSync(
      path.join(REPO_ROOT, "src/lib/modbus-server.functions.ts"),
      "utf8",
    );
    const opcuaSrc = fs.readFileSync(
      path.join(REPO_ROOT, "src/lib/opcua-server.functions.ts"),
      "utf8",
    );

    for (const src of [modbusSrc, opcuaSrc]) {
      expect(src).not.toMatch(/from\s+["']node:dns["']/);
      expect(src).not.toMatch(/from\s+["'](?:node:)?net["']/);
      expect(src).not.toContain("new net.Socket");
      expect(src).not.toContain("dns.promises.resolve4");
      expect(src).not.toContain('host === "192.168.1.100"');
      expect(src).not.toContain('.includes("simulation")');
      expect(src).not.toContain('.includes("localhost")');
    }
  });

  it("Strict mode separation: rejects real OT IPs under SIMULATOR mode and rejects 'simulation' under EDGE_READ_ONLY", async () => {
    const engTenantA = makeAuthCtx("usr_eng_a", "org_sp_industrial", "engineer");

    // 1. SIMULATOR mode rejects private RFC1918 IP (no silent simulation fallback on real IPs)
    await expect(
      executeTestModbusHost({ mode: "SIMULATOR", host: "192.168.1.20", port: 502 }, engTenantA),
    ).rejects.toThrow(/SIMULATOR_TARGET_MISMATCH/);

    await expect(
      executeTestOpcuaConnection(
        { mode: "SIMULATOR", endpoint: "opc.tcp://192.168.1.10:4840" },
        engTenantA,
      ),
    ).rejects.toThrow(/SIMULATOR_TARGET_MISMATCH/);

    // 2. SIMULATOR mode succeeds explicitly for virtual literal target
    const simModbus = await executeTestModbusHost(
      { mode: "SIMULATOR", host: "simulation", port: 502 },
      engTenantA,
    );
    expect(simModbus.mode).toBe("SIMULATOR");
    expect(simModbus.provenance).toBe("SIMULATED");
    expect(simModbus.directCloudToOtAllowed).toBe(false);

    const simOpcua = await executeTestOpcuaConnection(
      { mode: "SIMULATOR", endpoint: "opc.tcp://simulation:4840" },
      engTenantA,
    );
    expect(simOpcua.mode).toBe("SIMULATOR");
    expect(simOpcua.provenance).toBe("SIMULATED");
    expect(simOpcua.directCloudToOtAllowed).toBe(false);

    // 3. EDGE_READ_ONLY without gatewayId fails closed
    await expect(
      executeTestModbusHost(
        { mode: "EDGE_READ_ONLY", host: "192.168.1.20", port: 502 },
        engTenantA,
      ),
    ).rejects.toThrow(/GATEWAY_NOT_FOUND|CLOUD_DIRECT_OT_BLOCKED/);
  });

  it("Enforces multi-tenant & endpoint allowlist boundaries on EDGE_READ_ONLY protocol operations", async () => {
    const tenantB = makeAuthCtx("usr_eng_b", "org_rj_siderurgia", "engineer");
    const tenantA = makeAuthCtx("usr_eng_a", "org_sp_industrial", "engineer");

    // Cross-tenant attempt against gw_lab_ete_01 (owned by org_sp_industrial) MUST be rejected
    await expect(
      executeTestModbusHost(
        {
          mode: "EDGE_READ_ONLY",
          host: "192.168.1.20",
          port: 502,
          gatewayId: "gw_lab_ete_01",
        },
        tenantB,
      ),
    ).rejects.toThrow(/TENANT_FORBIDDEN/);

    // Same-tenant attempt against non-allowlisted OT endpoint MUST be rejected
    await expect(
      executeTestModbusHost(
        {
          mode: "EDGE_READ_ONLY",
          host: "192.168.99.99",
          port: 502,
          gatewayId: "gw_lab_ete_01",
        },
        tenantA,
      ),
    ).rejects.toThrow(/ENDPOINT_NOT_ALLOWLISTED/);

    // Same-tenant allowlisted endpoint via registered gateway succeeds read-only with zero Cloud TCP
    const okRes = await executeTestModbusHost(
      {
        mode: "EDGE_READ_ONLY",
        host: "192.168.1.20",
        port: 502,
        gatewayId: "gw_lab_ete_01",
      },
      tenantA,
    );
    expect(okRes.mode).toBe("EDGE_READ_ONLY");
    expect(okRes.simulated).toBe(false);
    expect(okRes.transport).toBe("EDGE_GATEWAY_MEDIATED");
    expect(okRes.directCloudToOtAllowed).toBe(false);
  });

  it("SSRF defense blocks IMDS, loopback, public IPv4, embedded OPC-UA credentials, and rebinding hosts", () => {
    expect(isEdgeOtHostAllowed("simulation")).toBe(false);
    expect(isEdgeOtHostAllowed("192.168.10.20")).toBe(true);
    expect(isHostAllowed("169.254.169.254")).toBe(false);
    expect(isHostAllowed("127.0.0.1")).toBe(false);
    expect(isHostAllowed("localhost")).toBe(false);
    expect(isHostAllowed("10.0.0.1.nip.io")).toBe(false);
    expect(isOpcuaEndpointAllowed("opc.tcp://admin:secret@192.168.1.10:4840")).toBe(false);
    expect(isOpcuaEndpointAllowed("http://192.168.1.10:4840")).toBe(false);
    expect(isOpcuaEndpointAllowed("opc.tcp://simulation:4840")).toBe(true);
    expect(typeof resolveToAllowedIPv4).toBe("function");

    const ssrfDecision = authorizeCloudToEdgeReadTarget({
      protocol: "MODBUS_TCP",
      mode: "EDGE_READ_ONLY",
      target: "169.254.169.254",
      port: 80,
    });
    expect(ssrfDecision.allowed).toBe(false);
    if (!ssrfDecision.allowed) {
      expect(ssrfDecision.code).toBe("SSRF_POLICY_BLOCKED");
    }
  });

  it("Permanently blocks physical writes on EDGE_READ_ONLY sessions with audit log; SIMULATOR tags writes FORCED_SIMULATED", async () => {
    const engTenantA = makeAuthCtx("usr_eng_write_test", "org_sp_industrial", "engineer");

    // 1. Connect EDGE_READ_ONLY Modbus & write -> HARD REJECT PHYSICAL_CONTROL_BLOCKED
    const connEdgeMb = await executeConnectModbus(
      {
        mode: "EDGE_READ_ONLY",
        host: "192.168.1.20",
        port: 502,
        unitId: 1,
        gatewayId: "gw_lab_ete_01",
        timeoutMs: 5000,
      },
      engTenantA,
    );
    expect(connEdgeMb.ok).toBe(true);

    const deniedMbWrite = await executeWriteModbusRegister(
      { address: 0, value: 999, type: "holding_register" },
      engTenantA,
    );
    expect(deniedMbWrite.ok).toBe(false);
    if (!deniedMbWrite.ok) {
      expect(deniedMbWrite.error.code).toBe("PHYSICAL_CONTROL_BLOCKED");
    }

    // 2. Connect EDGE_READ_ONLY OPC-UA & write -> HARD REJECT PHYSICAL_CONTROL_BLOCKED
    const connEdgeUa = await executeConnectOpcua(
      {
        mode: "EDGE_READ_ONLY",
        endpoint: "opc.tcp://192.168.1.10:4840",
        securityMode: "None",
        gatewayId: "gw_lab_ete_01",
        timeoutMs: 5000,
      },
      engTenantA,
    );
    expect(connEdgeUa.ok).toBe(true);

    const deniedUaWrite = await executeWriteOpcuaTag(
      { nodeId: "ns=2;s=Valve_01.Position", value: 100 },
      engTenantA,
    );
    expect(deniedUaWrite.ok).toBe(false);
    if (!deniedUaWrite.ok) {
      expect(deniedUaWrite.error.code).toBe("PHYSICAL_CONTROL_BLOCKED");
    }

    const recentAudit = getRecentSecurityEvents(20);
    expect(recentAudit.some((e) => e.category === "PHYSICAL_CONTROL_BLOCKED")).toBe(true);

    // 3. Connect SIMULATOR session & virtual write -> explicitly labeled FORCED_SIMULATED
    const engSim = makeAuthCtx("usr_eng_sim_only", "org_sp_industrial", "engineer");
    const simConn = await executeConnectModbus(
      {
        mode: "SIMULATOR",
        host: "simulation",
        port: 502,
        unitId: 1,
        timeoutMs: 5000,
      },
      engSim,
    );
    expect(simConn.ok).toBe(true);
    const simWrite = await executeWriteModbusRegister(
      { address: 1, value: 1234, type: "holding_register" },
      engSim,
    );
    expect(simWrite.ok).toBe(true);
    if (simWrite.ok) {
      expect(simWrite.simulated).toBe(true);
      expect(simWrite.provenance).toBe("FORCED_SIMULATED");
    }
  });

  it("Exposes honest Protocol Implementation Classes across parsers, simulators, and lab adapters", () => {
    expect(ModbusProtocolEngine.implementationClass).toBe("PARSER");
    expect(OPCUAProtocolEngine.implementationClass).toBe("PARSER");
    expect(SparkplugBProtocolEngine.implementationClass).toBe("PARSER");
    expect(MQTTProtocolEngine.implementationClass).toBe("PARSER");

    const mbDriver = new ModbusTcpClientDriver({
      driverId: "d_mb",
      connectionId: "c_mb",
      host: "192.168.1.20",
    });
    const uaDriver = new OpcUaClientDriver({
      driverId: "d_ua",
      connectionId: "c_ua",
      endpointUrl: "opc.tcp://192.168.1.10:4840",
    });
    const spDriver = new SparkplugBDriver({
      driverId: "d_sp",
      connectionId: "c_sp",
      brokerUrl: "mqtt://192.168.1.30:1883",
      clientId: "edge_sp_1",
      groupId: "spBv1.0",
      edgeNodeId: "gw1",
    });

    expect(mbDriver.implementationClass).toBe("LAB_EDGE_ADAPTER");
    expect(uaDriver.implementationClass).toBe("LAB_EDGE_ADAPTER");
    expect(spDriver.implementationClass).toBe("LAB_EDGE_ADAPTER");
    expect(PROTOCOL_LAYER_CLASSIFICATION.every((d) => !d.allowsDirectCloudToOtSocket)).toBe(true);
    expect(PROTOCOL_LAYER_CLASSIFICATION.every((d) => !d.allowsPhysicalWrites)).toBe(true);
  });
});
