// ELÉTRICAI INDUSTRIAL OS — CLOUD OPC-UA HANDLER IMPLEMENTATION (SERVER-ONLY)
// Direct OPC-UA TCP sessions from Cloud and implicit `localhost`/substring fallbacks are REMOVED.

import type { EdgeExecutionMode, TagProvenance } from "./protocol-classification";
import {
  authorizeProtocolSessionActor,
  guardProtocolWriteAttempt,
  resolveCloudToEdgeTarget,
} from "./cloud-protocol-guard.server";
import { runWithFleetManagers } from "./fleet-handlers.server";
import type { CloudGatewayRegistry } from "./cloud-gateway-registry";
import type { EdgeFleetManager } from "./fleet-manager";

export type OpcuaConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface OpcuaServerConfig {
  mode: EdgeExecutionMode;
  endpoint: string;
  securityMode?: "None" | "Sign" | "SignAndEncrypt";
  username?: string;
  password?: string;
  gatewayId?: string;
  timeoutMs?: number;
}

export interface OpcuaTagValue {
  nodeId: string;
  displayName: string;
  value: number | boolean | string;
  dataType: string;
  timestamp: string;
  quality: "good" | "bad" | "uncertain";
  provenance: TagProvenance;
}

interface OpcuaSession {
  config: OpcuaServerConfig;
  status: OpcuaConnectionStatus;
  provenance: TagProvenance;
  transport: "IN_MEMORY_SIMULATOR" | "EDGE_GATEWAY_MEDIATED";
  tags: Map<string, OpcuaTagValue>;
  error?: string;
  connectedAt?: string;
  organizationId?: string;
  _simInterval?: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, OpcuaSession>();

function getSession(userId: string): OpcuaSession | undefined {
  return sessions.get(userId);
}

function clearSessionInterval(session: OpcuaSession): void {
  if (session._simInterval) {
    clearInterval(session._simInterval);
    session._simInterval = undefined;
  }
}

function ensureSession(userId: string): OpcuaSession {
  let s = sessions.get(userId);
  if (!s) {
    s = {
      config: { mode: "SIMULATOR", endpoint: "opc.tcp://simulation:4840" },
      status: "disconnected",
      provenance: "NOT_CONNECTED",
      transport: "IN_MEMORY_SIMULATOR",
      tags: new Map(),
    };
    sessions.set(userId, s);
  } else {
    clearSessionInterval(s);
    s.tags.clear();
  }
  return s;
}

function hydrateEdgeReadOnlyTags(
  session: OpcuaSession,
  gatewayId: string,
  baseProvenance: TagProvenance,
  fleetManager: EdgeFleetManager,
  registry: CloudGatewayRegistry,
): void {
  const gateway = fleetManager.getGateway(gatewayId);
  const effectiveProvenance: TagProvenance =
    gateway?.operationalState === "ONLINE" && gateway.connectivityState === "CONNECTED"
      ? "PHYSICAL_READ_ONLY"
      : gateway?.operationalState === "DEGRADED"
        ? "STALE"
        : baseProvenance;

  session.provenance = effectiveProvenance;
  const snapshots = registry.getLatestTelemetryForGateway(gatewayId);
  session.tags.clear();
  for (const sample of snapshots) {
    const nodeId = `ns=2;s=${sample.tagName}`;
    session.tags.set(nodeId, {
      nodeId,
      displayName: sample.tagName,
      value: sample.value,
      dataType: "Double",
      timestamp: new Date(sample.sourceTimestamp).toISOString(),
      quality:
        sample.quality === "GOOD" ? "good" : sample.quality === "UNCERTAIN" ? "uncertain" : "bad",
      provenance: effectiveProvenance,
    });
  }
}

function startSimulatedSession(session: OpcuaSession) {
  const tags = [
    { nodeId: "ns=2;s=Motor_01.Speed", dataType: "Double", initial: 1450 },
    { nodeId: "ns=2;s=Motor_01.Current", dataType: "Double", initial: 14.2 },
    { nodeId: "ns=2;s=Motor_01.Temperature", dataType: "Double", initial: 65 },
    { nodeId: "ns=2;s=Tank_01.Level", dataType: "Double", initial: 50 },
    { nodeId: "ns=2;s=Tank_01.Pressure", dataType: "Double", initial: 2.5 },
    { nodeId: "ns=2;s=Valve_01.Position", dataType: "Double", initial: 50 },
    { nodeId: "ns=2;s=Conveyor_01.Speed", dataType: "Double", initial: 1200 },
    { nodeId: "ns=2;s=Line_01.Production", dataType: "Double", initial: 0 },
    { nodeId: "ns=2;s=System.Ready", dataType: "Boolean", initial: true },
    { nodeId: "ns=2;s=System.Alarm", dataType: "Boolean", initial: false },
  ];

  let tick = 0;
  const interval = setInterval(() => {
    tick++;
    const now = new Date().toISOString();
    for (const t of tags) {
      let val: number | boolean = t.initial;
      if (t.dataType === "Double") {
        const base = t.initial as number;
        val = +(base + Math.sin((tick + tags.indexOf(t)) / 20) * (base * 0.1)).toFixed(1);
      }
      session.tags.set(t.nodeId, {
        nodeId: t.nodeId,
        displayName: t.nodeId.split(";")[1] ?? t.nodeId,
        value: val,
        dataType: t.dataType,
        timestamp: now,
        quality: "good",
        provenance: "SIMULATED",
      });
    }
    if (tick % 50 === 0) {
      session.tags.set("ns=2;s=Line_01.Production", {
        nodeId: "ns=2;s=Line_01.Production",
        displayName: "Line_01.Production",
        value: tick * 5,
        dataType: "Double",
        timestamp: now,
        quality: "good",
        provenance: "SIMULATED",
      });
    }
  }, 200);

  session._simInterval = interval;
}

if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("exit", () => {
    for (const [, s] of sessions) {
      clearSessionInterval(s);
    }
  });
}

export async function executeConnectOpcua(data: OpcuaServerConfig, context: unknown) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: false,
    route: "opcua/connect",
    mode: data.mode,
  });

  if (!actor.allowed) {
    return {
      ok: false as const,
      error: { code: actor.code, message: actor.message },
    };
  }

  if (actor.isDevBypass && data.mode !== "SIMULATOR") {
    return {
      ok: false as const,
      error: {
        code: "FORBIDDEN",
        message: "Sessão dev bypass permite apenas modo SIMULATOR em memória.",
      },
    };
  }

  return runWithFleetManagers(async ({ fleetManager, registry }) => {
    const targetDecision = resolveCloudToEdgeTarget({
      protocol: "OPC_UA",
      mode: data.mode,
      target: data.endpoint,
      gatewayId: data.gatewayId,
      actor,
      route: "opcua/connect",
      fleetManagerOverride: fleetManager,
    });

    if (!targetDecision.allowed) {
      return {
        ok: false as const,
        error: { code: targetDecision.code, message: targetDecision.message },
      };
    }

    const session = ensureSession(actor.userId);
    session.config = data;
    session.organizationId = actor.organizationId;
    session.transport =
      targetDecision.mode === "SIMULATOR" ? "IN_MEMORY_SIMULATOR" : "EDGE_GATEWAY_MEDIATED";
    session.status = "connecting";

    await actor.supabase.from("runtime_logs").insert({
      user_id: actor.userId,
      tag: "OPCUA",
      message:
        targetDecision.mode === "SIMULATOR"
          ? `Iniciando sessão OPC-UA SIMULATOR em ${targetDecision.normalizedTarget}`
          : `Associando sessão OPC-UA EDGE_READ_ONLY via gateway ${targetDecision.gatewayId} -> ${targetDecision.normalizedTarget}`,
      level: "info",
      channel: "OPC-UA",
    });

    if (targetDecision.mode === "SIMULATOR") {
      startSimulatedSession(session);
      session.status = "connected";
      session.provenance = "SIMULATED";
      session.connectedAt = new Date().toISOString();
      return {
        ok: true as const,
        status: session.status,
        mode: "SIMULATOR" as const,
        simulated: true as const,
        provenance: "SIMULATED" as const,
        transport: session.transport,
        endpoint: targetDecision.normalizedTarget,
      };
    }

    hydrateEdgeReadOnlyTags(
      session,
      targetDecision.gatewayId,
      targetDecision.provenance,
      fleetManager,
      registry,
    );
    session.status = "connected";
    session.provenance = targetDecision.provenance;
    session.connectedAt = new Date().toISOString();

    return {
      ok: true as const,
      status: session.status,
      mode: "EDGE_READ_ONLY" as const,
      simulated: false as const,
      provenance: targetDecision.provenance,
      transport: session.transport,
      gatewayId: targetDecision.gatewayId,
      endpoint: targetDecision.normalizedTarget,
    };
  });
}

export async function executeDisconnectOpcua(context: unknown) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: true,
    route: "opcua/disconnect",
  });
  if (!actor.allowed) {
    return { ok: false as const, error: { code: actor.code, message: actor.message } };
  }
  const session = sessions.get(actor.userId);
  if (session) {
    clearSessionInterval(session);
    session.status = "disconnected";
    session.provenance = "NOT_CONNECTED";
    session.error = undefined;
    session.connectedAt = undefined;
    session.tags.clear();
  }
  return { ok: true as const };
}

export async function executeGetOpcuaStatus(context: unknown) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: true,
    route: "opcua/status",
  });
  if (!actor.allowed) {
    return {
      ok: false as const,
      status: "disconnected" as const,
      mode: "SIMULATOR" as EdgeExecutionMode,
      provenance: "NOT_CONNECTED" as TagProvenance,
      endpoint: "opc.tcp://simulation:4840",
      tags: [] as OpcuaTagValue[],
    };
  }

  const session = getSession(actor.userId);
  if (!session) {
    return {
      ok: true as const,
      status: "disconnected" as const,
      mode: "SIMULATOR" as EdgeExecutionMode,
      provenance: "NOT_CONNECTED" as TagProvenance,
      endpoint: "opc.tcp://simulation:4840",
      tags: [] as OpcuaTagValue[],
    };
  }

  if (session.config.mode === "EDGE_READ_ONLY" && session.config.gatewayId) {
    const gatewayId = session.config.gatewayId;
    await runWithFleetManagers(({ fleetManager, registry }) => {
      hydrateEdgeReadOnlyTags(session, gatewayId, session.provenance, fleetManager, registry);
    });
  }

  return {
    ok: true as const,
    status: session.status,
    mode: session.config.mode,
    provenance: session.provenance,
    transport: session.transport,
    gatewayId: session.config.gatewayId,
    endpoint: session.config.endpoint,
    connectedAt: session.connectedAt,
    error: session.error,
    tags: Array.from(session.tags.values()),
  };
}

export async function executeReadOpcuaTags(data: { nodeIds: string[] }, context: unknown) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: true,
    route: "opcua/read",
  });
  if (!actor.allowed) {
    return { ok: false as const, error: { code: actor.code, message: actor.message } };
  }

  const session = getSession(actor.userId);
  if (!session || session.status !== "connected") {
    return {
      ok: false as const,
      error: { code: "NOT_CONNECTED", message: "OPC-UA desconectado." },
    };
  }

  const results: OpcuaTagValue[] = [];
  for (const nodeId of data.nodeIds) {
    const cached = session.tags.get(nodeId);
    if (cached) results.push(cached);
  }
  return { ok: true as const, mode: session.config.mode, tags: results };
}

export async function executeWriteOpcuaTag(
  data: { nodeId: string; value: number | boolean | string },
  context: unknown,
) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: false,
    route: "opcua/write",
  });
  if (!actor.allowed) {
    return {
      ok: false as const,
      error: { code: actor.code, message: actor.message },
    };
  }

  const session = getSession(actor.userId);
  if (!session || session.status !== "connected") {
    return {
      ok: false as const,
      error: { code: "NOT_CONNECTED", message: "OPC-UA desconectado." },
    };
  }

  const writeGuard = guardProtocolWriteAttempt({
    mode: session.config.mode,
    route: "opcua/write",
    userId: actor.userId,
    tenantId: actor.organizationId,
    targetDescription: `${session.config.endpoint}/${data.nodeId}`,
  });

  if (!writeGuard.allowed) {
    return {
      ok: false as const,
      error: { code: writeGuard.code, message: writeGuard.message },
    };
  }

  session.tags.set(data.nodeId, {
    nodeId: data.nodeId,
    displayName: data.nodeId.split(".").pop() ?? data.nodeId,
    value: data.value,
    dataType:
      typeof data.value === "number"
        ? "Double"
        : typeof data.value === "boolean"
          ? "Boolean"
          : "String",
    timestamp: new Date().toISOString(),
    quality: "good",
    provenance: "FORCED_SIMULATED",
  });

  return {
    ok: true as const,
    simulated: true as const,
    provenance: "FORCED_SIMULATED" as const,
  };
}

export async function executeTestOpcuaConnection(
  data: {
    mode: EdgeExecutionMode;
    endpoint: string;
    username?: string;
    password?: string;
    securityMode?: "None" | "Sign" | "SignAndEncrypt";
    gatewayId?: string;
  },
  context: unknown,
) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: true,
    route: "opcua/test",
    mode: data.mode,
  });

  if (!actor.allowed) {
    throw new Error(`${actor.code}: ${actor.message}`);
  }

  return runWithFleetManagers(async ({ fleetManager, registry }) => {
    const targetDecision = resolveCloudToEdgeTarget({
      protocol: "OPC_UA",
      mode: data.mode,
      target: data.endpoint,
      gatewayId: data.gatewayId,
      actor,
      route: "opcua/test",
      fleetManagerOverride: fleetManager,
    });

    if (!targetDecision.allowed) {
      throw new Error(`${targetDecision.code}: ${targetDecision.message}`);
    }

    if (targetDecision.mode === "SIMULATOR") {
      return {
        ok: true as const,
        mode: "SIMULATOR" as const,
        simulated: true as const,
        provenance: "SIMULATED" as const,
        transport: "IN_MEMORY_SIMULATOR" as const,
        directCloudToOtAllowed: false as const,
        tagCount: 10,
        sampleTags: [
          {
            nodeId: "ns=2;s=Motor_01.Speed",
            displayName: "Motor_01.Speed",
            dataType: "Double",
            provenance: "SIMULATED" as const,
          },
          {
            nodeId: "ns=2;s=Tank_01.Level",
            displayName: "Tank_01.Level",
            dataType: "Double",
            provenance: "SIMULATED" as const,
          },
          {
            nodeId: "ns=2;s=System.Ready",
            displayName: "System.Ready",
            dataType: "Boolean",
            provenance: "SIMULATED" as const,
          },
        ],
      };
    }

    const gateway = fleetManager.getGateway(targetDecision.gatewayId);
    const telemetry = registry.getLatestTelemetryForGateway(targetDecision.gatewayId);

    return {
      ok: true as const,
      mode: "EDGE_READ_ONLY" as const,
      simulated: false as const,
      provenance: targetDecision.provenance,
      transport: "EDGE_GATEWAY_MEDIATED" as const,
      gatewayId: targetDecision.gatewayId,
      gatewayOperationalState: gateway?.operationalState ?? "UNKNOWN",
      directCloudToOtAllowed: false as const,
      tagCount: telemetry.length,
      sampleTags: telemetry.slice(0, 5).map((s) => ({
        nodeId: `ns=2;s=${s.tagName}`,
        displayName: s.tagName,
        dataType: "Double",
        provenance: targetDecision.provenance,
      })),
    };
  });
}
