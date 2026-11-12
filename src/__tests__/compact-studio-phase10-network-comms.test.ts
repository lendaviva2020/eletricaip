import { describe, expect, it } from "vitest";
import { createEmptyCompactProgramModel } from "../lib/compact-studio/domain";
import { createCompactBlockNode } from "../lib/compact-studio/editor";
import { resolveCompactStudioFlags } from "../lib/compact-studio/feature-flags";
import {
  CompactDeviceCommsGateway,
  OpenProtocolEndpointSchema,
  VirtualNetworkCoordinator,
} from "../lib/compact-studio/network";

describe("Fase 10 — Rede Virtual Multi-Dispositivos & Gateway Protocolos Abertos + Safety Lock", () => {
  it("exchanges NI/NQ state cleanly across virtual Compact PLC stations in lock-step", () => {
    // Station 1: I1 -> NQ1
    const m1Base = createEmptyCompactProgramModel({ id: "plc_1", name: "CLP Mestre" });
    const p1 = m1Base.pages[0].id;
    const m1 = {
      ...m1Base,
      ioSymbols: [
        {
          id: "s1",
          ioKind: "DI" as const,
          address: "I1",
          symbolicName: "I1",
          signalType: "BOOL" as const,
          comment: "",
          retentive: false,
          initialValue: false,
        },
        {
          id: "s2",
          ioKind: "NQ" as const,
          address: "NQ1",
          symbolicName: "NQ1",
          signalType: "BOOL" as const,
          comment: "",
          retentive: false,
          initialValue: false,
        },
      ],
      nodes: [
        createCompactBlockNode({
          id: "i1",
          pageId: p1,
          blockType: "INPUT_DI",
          instanceName: "I1",
          ioSymbolId: "s1",
        }),
        createCompactBlockNode({
          id: "nq1",
          pageId: p1,
          blockType: "OUTPUT_QO",
          instanceName: "NQ1",
          ioSymbolId: "s2",
        }),
      ],
      connections: [
        {
          id: "c1",
          pageId: p1,
          fromNodeId: "i1",
          fromPortId: "out",
          toNodeId: "nq1",
          toPortId: "in",
          signalType: "BOOL" as const,
        },
      ],
    };

    // Station 2: NI1 -> Q1
    const m2Base = createEmptyCompactProgramModel({ id: "plc_2", name: "CLP Escravo" });
    const p2 = m2Base.pages[0].id;
    const m2 = {
      ...m2Base,
      ioSymbols: [
        {
          id: "r1",
          ioKind: "NI" as const,
          address: "NI1",
          symbolicName: "NI1",
          signalType: "BOOL" as const,
          comment: "",
          retentive: false,
          initialValue: false,
        },
        {
          id: "r2",
          ioKind: "DO" as const,
          address: "Q1",
          symbolicName: "Q1",
          signalType: "BOOL" as const,
          comment: "",
          retentive: false,
          initialValue: false,
        },
      ],
      nodes: [
        createCompactBlockNode({
          id: "ni1",
          pageId: p2,
          blockType: "INPUT_DI",
          instanceName: "NI1",
          ioSymbolId: "r1",
        }),
        createCompactBlockNode({
          id: "q1",
          pageId: p2,
          blockType: "OUTPUT_QO",
          instanceName: "Q1",
          ioSymbolId: "r2",
        }),
      ],
      connections: [
        {
          id: "c2",
          pageId: p2,
          fromNodeId: "ni1",
          fromPortId: "out",
          toNodeId: "q1",
          toPortId: "in",
          signalType: "BOOL" as const,
        },
      ],
    };

    const bus = new VirtualNetworkCoordinator(
      [
        { stationId: "st1", name: "Painel A", ipAddress: "10.0.0.10", model: m1 },
        { stationId: "st2", name: "Painel B", ipAddress: "10.0.0.11", model: m2 },
      ],
      [
        {
          id: "lnk1",
          fromStationId: "st1",
          fromOutputOrVar: "NQ1",
          toStationId: "st2",
          toNetworkInput: "NI1",
        },
      ],
    );

    bus.setStationInput("st1", "I1", true);
    const res = bus.stepAll(20);
    expect(res.framesByStationId["st1"].variables["NQ1"]).toBe(true);
    expect(res.framesByStationId["st2"].variables["Q1"]).toBe(true);
  });

  it("enforces fieldDeviceComms feature flag, anti-SSRF, RBAC, and immutable IS_PHYSICAL_CONTROL_ALLOWED lock", () => {
    expect(() =>
      OpenProtocolEndpointSchema.parse({
        protocol: "MODBUS_TCP",
        host: "169.254.169.254",
        port: 502,
        unitIdOrTopic: "1",
      }),
    ).toThrow(/anti-SSRF/);

    const gateway = new CompactDeviceCommsGateway();
    const disabledFlags = resolveCompactStudioFlags({ logoStudio: true, fieldDeviceComms: false });
    const enabledFlags = resolveCompactStudioFlags({ logoStudio: true, fieldDeviceComms: true });

    const deniedFlag = gateway.readObservationalSnapshot({
      flags: disabledFlags,
      actorUserId: "user-1",
      role: "engineer",
      endpoint: { protocol: "MODBUS_TCP", host: "192.168.10.50", port: 502, unitIdOrTopic: "1" },
    });
    expect(deniedFlag.ok).toBe(false);
    expect(deniedFlag.status).toBe("DENIED_FLAG_DISABLED");

    const allowedRead = gateway.readObservationalSnapshot({
      flags: enabledFlags,
      actorUserId: "user-1",
      role: "engineer",
      endpoint: {
        protocol: "OPC_UA",
        host: "plc-linha-01.local",
        port: 4840,
        unitIdOrTopic: "ns=2;s=Main",
      },
    });
    expect(allowedRead.ok).toBe(true);
    expect(allowedRead.status).toBe("ALLOWED_READ_OBSERVATIONAL");

    const writeRes = gateway.requestPhysicalDeviceWrite({
      flags: enabledFlags,
      actorUserId: "admin-1",
      role: "owner",
      endpoint: { protocol: "MODBUS_TCP", host: "192.168.10.50", port: 502, unitIdOrTopic: "1" },
      dualConfirmationToken: "CONFIRMO-EXECUCAO",
    });
    expect(writeRes.allowed).toBe(false);
    expect(writeRes.outcome).toBe("DENIED_SAFETY_LOCK");
    expect(gateway.getAuditLog()).toHaveLength(3);
  });
});
