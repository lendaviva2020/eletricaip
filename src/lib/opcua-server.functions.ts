import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OpcuaConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface OpcuaServerConfig {
  endpoint: string;
  securityMode?: "None" | "Sign" | "SignAndEncrypt";
  username?: string;
  password?: string;
  timeoutMs?: number;
}

export interface OpcuaTagValue {
  nodeId: string;
  displayName: string;
  value: number | boolean | string;
  dataType: string;
  timestamp: string;
  quality: "good" | "bad" | "uncertain";
}

interface OpcuaSession {
  config: OpcuaServerConfig;
  status: OpcuaConnectionStatus;
  tags: Map<string, OpcuaTagValue>;
  error?: string;
  connectedAt?: string;
}

const sessions = new Map<string, OpcuaSession>();

function getSession(userId: string): OpcuaSession | undefined {
  return sessions.get(userId);
}

function ensureSession(userId: string): OpcuaSession {
  let s = sessions.get(userId);
  if (!s) {
    s = { config: { endpoint: "opc.tcp://localhost:4840" }, status: "disconnected", tags: new Map() };
    sessions.set(userId, s);
  }
  return s;
}

const ConnectSchema = z.object({
  endpoint: z.string().min(1),
  securityMode: z.enum(["None", "Sign", "SignAndEncrypt"]).default("None"),
  username: z.string().optional(),
  password: z.string().optional(),
  timeoutMs: z.number().min(1000).max(30000).default(5000),
});

export const connectOpcua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConnectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    const session = ensureSession(userId);
    session.config = data;
    session.status = "connecting";

    const supabase = (context as any).supabase;
    await supabase.from("runtime_logs").insert({
      user_id: userId,
      tag: "OPCUA",
      message: `Conectando a ${data.endpoint}`,
      level: "info",
      channel: "OPC-UA",
    });

    try {
      // Use the existing Supabase Realtime channel as the OPC-UA transport.
      // If a real OPC-UA server is configured, the server-side connector
      // will push tags via broadcast. Otherwise, start simulated OPC-UA data.
      if (data.endpoint.includes("localhost") || data.endpoint.includes("simulation")) {
        startSimulatedSession(session, userId, supabase);
      } else {
        await connectRealOpcua(session, userId, supabase);
      }

      session.status = "connected";
      session.connectedAt = new Date().toISOString();
      return { ok: true as const, status: session.status, endpoint: data.endpoint };
    } catch (e: any) {
      session.status = "error";
      session.error = e.message;
      return {
        ok: false as const,
        error: { code: "CONNECTION_FAILED", message: e.message },
      };
    }
  });

export const disconnectOpcua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as any).userId as string;
    const session = sessions.get(userId);
    if (session) {
      session.status = "disconnected";
      session.error = undefined;
      session.connectedAt = undefined;
      session.tags.clear();
    }
    return { ok: true as const };
  });

export const getOpcuaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as any).userId as string;
    const session = getSession(userId);
    if (!session) {
      return {
        ok: true as const,
        status: "disconnected" as const,
        endpoint: "opc.tcp://localhost:4840",
        tags: [] as OpcuaTagValue[],
      };
    }
    return {
      ok: true as const,
      status: session.status,
      endpoint: session.config.endpoint,
      connectedAt: session.connectedAt,
      error: session.error,
      tags: Array.from(session.tags.values()),
    };
  });

const ReadTagsSchema = z.object({
  nodeIds: z.array(z.string()).min(1).max(100),
});

export const readOpcuaTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReadTagsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    const session = getSession(userId);
    if (!session || session.status !== "connected") {
      return { ok: false as const, error: { code: "NOT_CONNECTED", message: "OPC-UA desconectado." } };
    }

    const results: OpcuaTagValue[] = [];
    for (const nodeId of data.nodeIds) {
      const cached = session.tags.get(nodeId);
      if (cached) results.push(cached);
    }
    return { ok: true as const, tags: results };
  });

const WriteTagSchema = z.object({
  nodeId: z.string().min(1),
  value: z.union([z.number(), z.boolean(), z.string()]),
});

export const writeOpcuaTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => WriteTagSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = (context as any).userId as string;
    const session = getSession(userId);
    if (!session || session.status !== "connected") {
      return { ok: false as const, error: { code: "NOT_CONNECTED", message: "OPC-UA desconectado." } };
    }

    session.tags.set(data.nodeId, {
      nodeId: data.nodeId,
      displayName: data.nodeId.split(".").pop() ?? data.nodeId,
      value: data.value,
      dataType: typeof data.value === "number" ? "Double" : typeof data.value === "boolean" ? "Boolean" : "String",
      timestamp: new Date().toISOString(),
      quality: "good",
    });

    return { ok: true as const };
  });

// ── Simulated OPC-UA session (falls back when no real server) ──
function startSimulatedSession(session: OpcuaSession, userId: string, supabase: any) {
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
      });
    }
  }, 200);

  // Store the interval for cleanup
  (session as any)._simInterval = interval;
}

async function connectRealOpcua(session: OpcuaSession, userId: string, supabase: any) {
  // When node-opcua is installed and a real server is available,
  // this will establish a real OPC-UA session.
  // For now, fall back to simulation.
  const endpoint = session.config.endpoint;
  throw new Error(
    `Conexão OPC-UA real com ${endpoint} requer node-opcua instalado. Use um endpoint "simulation" para o modo simulado.`,
  );
}

// ── Cleanup on server shutdown ──
if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("exit", () => {
    for (const [, s] of sessions) {
      const interval = (s as any)._simInterval;
      if (interval) clearInterval(interval);
    }
  });
}
