// ELÉTRICAI INDUSTRIAL OS — CLOUD MODBUS HANDLER IMPLEMENTATION (SERVER-ONLY)
// Zero TCP sockets (`node:net`) and zero DNS resolution (`node:dns`).

import type { EdgeExecutionMode, TagProvenance } from "./protocol-classification";
import {
  authorizeProtocolSessionActor,
  guardProtocolWriteAttempt,
  resolveCloudToEdgeTarget,
} from "./cloud-protocol-guard.server";
import { runWithFleetManagers } from "./fleet-handlers.server";
import type { CloudGatewayRegistry } from "./cloud-gateway-registry";
import type { EdgeFleetManager } from "./fleet-manager";

export type ModbusConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ModbusGatewayConfig {
  mode: EdgeExecutionMode;
  host: string;
  port: number;
  unitId: number;
  gatewayId?: string;
  timeoutMs?: number;
}

export interface ModbusRegisterValue {
  address: number;
  value: number;
  type: "coil" | "discrete_input" | "holding_register" | "input_register";
  timestamp: string;
  provenance: TagProvenance;
}

interface ModbusSession {
  config: ModbusGatewayConfig;
  status: ModbusConnectionStatus;
  provenance: TagProvenance;
  transport: "IN_MEMORY_SIMULATOR" | "EDGE_GATEWAY_MEDIATED";
  values: Map<string, ModbusRegisterValue>;
  error?: string;
  connectedAt?: string;
  organizationId?: string;
  _simInterval?: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, ModbusSession>();

function getSession(userId: string): ModbusSession | undefined {
  return sessions.get(userId);
}

function clearSessionInterval(session: ModbusSession): void {
  if (session._simInterval) {
    clearInterval(session._simInterval);
    session._simInterval = undefined;
  }
}

function ensureSession(userId: string, config: ModbusGatewayConfig): ModbusSession {
  let s = sessions.get(userId);
  if (!s) {
    s = {
      config,
      status: "disconnected",
      provenance: "NOT_CONNECTED",
      transport: config.mode === "SIMULATOR" ? "IN_MEMORY_SIMULATOR" : "EDGE_GATEWAY_MEDIATED",
      values: new Map(),
    };
    sessions.set(userId, s);
  } else {
    clearSessionInterval(s);
    s.values.clear();
  }
  s.config = config;
  s.transport = config.mode === "SIMULATOR" ? "IN_MEMORY_SIMULATOR" : "EDGE_GATEWAY_MEDIATED";
  return s;
}

function hydrateEdgeReadOnlyRegisters(
  session: ModbusSession,
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
  session.values.clear();
  snapshots.forEach((sample, index) => {
    const key = `holding_register:${index}`;
    session.values.set(key, {
      address: index,
      value: Math.round(sample.value),
      type: "holding_register",
      timestamp: new Date(sample.sourceTimestamp).toISOString(),
      provenance: effectiveProvenance,
    });
  });
}

function startSimulatedModbus(session: ModbusSession) {
  const registers = [
    { address: 0, label: "Motor_01_Speed", initial: 1450 },
    { address: 1, label: "Motor_01_Current", initial: 142 },
    { address: 2, label: "Motor_01_Temp", initial: 65 },
    { address: 3, label: "Tank_01_Level", initial: 500 },
    { address: 4, label: "Tank_01_Pressure", initial: 25 },
    { address: 5, label: "Valve_01_Pos", initial: 50 },
    { address: 6, label: "Conveyor_01_Speed", initial: 1200 },
    { address: 10, label: "Prod_Count", initial: 0 },
    { address: 20, label: "Status_Word", initial: 0x8001 },
  ];

  let tick = 0;
  const interval = setInterval(() => {
    tick++;
    const now = new Date().toISOString();
    for (const r of registers) {
      let val = r.initial;
      if (r.label !== "Status_Word" && r.label !== "Prod_Count") {
        val = Math.round(r.initial + Math.sin((tick + r.address) / 15) * (r.initial * 0.15));
      }
      if (r.label === "Prod_Count" && tick % 10 === 0) {
        val = tick * 5;
      }
      const key = `holding_register:${r.address}`;
      session.values.set(key, {
        address: r.address,
        value: val,
        type: "holding_register",
        timestamp: now,
        provenance: "SIMULATED",
      });
    }
    if (tick % 60 === 0) {
      const key = "coil:0";
      const existing = session.values.get(key);
      session.values.set(key, {
        address: 0,
        value: existing ? (existing.value === 1 ? 0 : 1) : 1,
        type: "coil",
        timestamp: now,
        provenance: "SIMULATED",
      });
    }
  }, 250);

  session._simInterval = interval;
}

if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("exit", () => {
    for (const [, s] of sessions) {
      clearSessionInterval(s);
    }
  });
}

export async function executeConnectModbus(data: ModbusGatewayConfig, context: unknown) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: false,
    route: "modbus/connect",
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
      protocol: "MODBUS_TCP",
      mode: data.mode,
      target: data.host,
      port: data.port,
      gatewayId: data.gatewayId,
      actor,
      route: "modbus/connect",
      fleetManagerOverride: fleetManager,
    });

    if (!targetDecision.allowed) {
      return {
        ok: false as const,
        error: {
          code: targetDecision.code,
          message: targetDecision.message,
        },
      };
    }

    const session = ensureSession(actor.userId, data);
    session.organizationId = actor.organizationId;
    session.status = "connecting";

    await actor.supabase.from("runtime_logs").insert({
      user_id: actor.userId,
      tag: "MB",
      message:
        data.mode === "SIMULATOR"
          ? `Iniciando sessão Modbus SIMULATOR em memória (Unit ID ${data.unitId})`
          : `Associando sessão Modbus EDGE_READ_ONLY via gateway ${data.gatewayId} -> ${targetDecision.normalizedTarget}`,
      level: "info",
      channel: "Modbus",
    });

    if (targetDecision.mode === "SIMULATOR") {
      startSimulatedModbus(session);
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
        host: targetDecision.normalizedTarget,
        port: data.port,
      };
    }

    hydrateEdgeReadOnlyRegisters(
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
      host: data.host,
      port: data.port,
    };
  });
}

export async function executeDisconnectModbus(context: unknown) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: true,
    route: "modbus/disconnect",
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
    session.values.clear();
  }
  return { ok: true as const };
}

export async function executeGetModbusStatus(context: unknown) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: true,
    route: "modbus/status",
  });
  if (!actor.allowed) {
    return {
      ok: false as const,
      status: "disconnected" as const,
      mode: "SIMULATOR" as EdgeExecutionMode,
      provenance: "NOT_CONNECTED" as TagProvenance,
      host: "simulation",
      port: 502,
      values: [] as ModbusRegisterValue[],
    };
  }

  const session = getSession(actor.userId);
  if (!session) {
    return {
      ok: true as const,
      status: "disconnected" as const,
      mode: "SIMULATOR" as EdgeExecutionMode,
      provenance: "NOT_CONNECTED" as TagProvenance,
      host: "simulation",
      port: 502,
      values: [] as ModbusRegisterValue[],
    };
  }

  if (session.config.mode === "EDGE_READ_ONLY" && session.config.gatewayId) {
    const gatewayId = session.config.gatewayId;
    await runWithFleetManagers(({ fleetManager, registry }) => {
      hydrateEdgeReadOnlyRegisters(session, gatewayId, session.provenance, fleetManager, registry);
    });
  }

  return {
    ok: true as const,
    status: session.status,
    mode: session.config.mode,
    provenance: session.provenance,
    transport: session.transport,
    gatewayId: session.config.gatewayId,
    host: session.config.host,
    port: session.config.port,
    unitId: session.config.unitId,
    connectedAt: session.connectedAt,
    error: session.error,
    values: Array.from(session.values.values()),
  };
}

export async function executeReadModbusRegisters(
  data: {
    address: number;
    count: number;
    type: "holding_register" | "input_register" | "coil" | "discrete_input";
  },
  context: unknown,
) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: true,
    route: "modbus/read",
  });
  if (!actor.allowed) {
    return { ok: false as const, error: { code: actor.code, message: actor.message } };
  }

  const session = getSession(actor.userId);
  if (!session || session.status !== "connected") {
    return {
      ok: false as const,
      error: { code: "NOT_CONNECTED", message: "Modbus desconectado." },
    };
  }

  const results: ModbusRegisterValue[] = [];
  const now = new Date().toISOString();
  for (let i = 0; i < data.count; i++) {
    const addr = data.address + i;
    const key = `${data.type}:${addr}`;
    const cached = session.values.get(key);
    if (cached) {
      results.push(cached);
    } else if (session.config.mode === "SIMULATOR") {
      const val: ModbusRegisterValue = {
        address: addr,
        value: 0,
        type: data.type,
        timestamp: now,
        provenance: "SIMULATED",
      };
      session.values.set(key, val);
      results.push(val);
    } else {
      results.push({
        address: addr,
        value: 0,
        type: data.type,
        timestamp: now,
        provenance: "NOT_CONNECTED",
      });
    }
  }
  return { ok: true as const, mode: session.config.mode, registers: results };
}

export async function executeWriteModbusRegister(
  data: { address: number; value: number; type: "coil" | "holding_register" },
  context: unknown,
) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: false,
    route: "modbus/write",
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
      error: { code: "NOT_CONNECTED", message: "Modbus desconectado." },
    };
  }

  const writeGuard = guardProtocolWriteAttempt({
    mode: session.config.mode,
    route: "modbus/write",
    userId: actor.userId,
    tenantId: actor.organizationId,
    targetDescription: `${session.config.host}:${session.config.port}/${data.type}:${data.address}`,
  });

  if (!writeGuard.allowed) {
    return {
      ok: false as const,
      error: { code: writeGuard.code, message: writeGuard.message },
    };
  }

  const key = `${data.type}:${data.address}`;
  session.values.set(key, {
    address: data.address,
    value: data.value,
    type: data.type,
    timestamp: new Date().toISOString(),
    provenance: "FORCED_SIMULATED",
  });

  return {
    ok: true as const,
    simulated: true as const,
    provenance: "FORCED_SIMULATED" as const,
  };
}

export async function executeTestModbusHost(
  data: { mode: EdgeExecutionMode; host: string; port: number; gatewayId?: string },
  context: unknown,
) {
  const actor = await authorizeProtocolSessionActor(context, {
    allowReadOnlyRoles: true,
    route: "modbus/test",
    mode: data.mode,
  });

  if (!actor.allowed) {
    throw new Error(`${actor.code}: ${actor.message}`);
  }

  return runWithFleetManagers(({ fleetManager }) => {
    const targetDecision = resolveCloudToEdgeTarget({
      protocol: "MODBUS_TCP",
      mode: data.mode,
      target: data.host,
      port: data.port,
      gatewayId: data.gatewayId,
      actor,
      route: "modbus/test",
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
      };
    }

    const gateway = fleetManager.getGateway(targetDecision.gatewayId);
    return {
      ok: true as const,
      mode: "EDGE_READ_ONLY" as const,
      simulated: false as const,
      provenance: targetDecision.provenance,
      transport: "EDGE_GATEWAY_MEDIATED" as const,
      gatewayId: targetDecision.gatewayId,
      gatewayOperationalState: gateway?.operationalState ?? "UNKNOWN",
      directCloudToOtAllowed: false as const,
    };
  });
}
