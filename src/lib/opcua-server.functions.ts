import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

interface AuthCtx {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
}

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
  _simInterval?: ReturnType<typeof setInterval>;
}

const sessions = new Map<string, OpcuaSession>();

function getSession(userId: string): OpcuaSession | undefined {
  return sessions.get(userId);
}

function ensureSession(userId: string): OpcuaSession {
  let s = sessions.get(userId);
  if (!s) {
    s = {
      config: { endpoint: "opc.tcp://localhost:4840" },
      status: "disconnected",
      tags: new Map(),
    };
    sessions.set(userId, s);
  }
  return s;
}

// SSRF guard: only allow opc.tcp:// scheme and RFC1918/DNS hosts.
// Mirrors isHostAllowed() in modbus-server.functions.ts.
function isOpcuaEndpointAllowed(endpoint: string): boolean {
  const e = endpoint.trim().toLowerCase();
  if (!e.startsWith("opc.tcp://")) return false;
  let host: string;
  try {
    const url = new URL(e.replace("opc.tcp://", "http://"));
    host = url.hostname;
  } catch {
    return false;
  }
  if (!host) return false;
  if (host === "simulation" || host.includes("simulation")) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true; // dev/sim only
  if (host.includes(":")) return false; // IPv6 literal
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const parts = ipv4.slice(1, 5).map((p) => Number(p));
    if (parts.some((p) => p < 0 || p > 255)) return false;
    const [a, b] = parts;
    if (a === 127) return true; // local dev
    if (a === 0 || a === 169 && b === 254 || a >= 224) return false;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(host)) {
    return false;
  }
  const blocked = ["metadata.google.internal", "metadata.goog", "metadata", "instance-data"];
  return !blocked.includes(host);
}

const ConnectSchema = z.object({
  endpoint: z
    .string()
    .min(1)
    .max(512)
    .refine(isOpcuaEndpointAllowed, {
      message:
        "Endpoint OPC-UA não permitido. Use opc.tcp:// com host RFC1918 privado ou DNS válido.",
    }),
  securityMode: z.enum(["None", "Sign", "SignAndEncrypt"]).default("None"),
  username: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
  timeoutMs: z.number().min(1000).max(30000).default(5000),
});

export const connectOpcua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConnectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as unknown as AuthCtx;

    // Authz: only owner/admin/engineer may open OPC-UA sessions.
    const { data: memberships } = await supabase
      .from("tenant_memberships")
      .select("role")
      .eq("user_id", userId);
    const allowed = (memberships ?? []).some((m) =>
      ["owner", "admin", "engineer"].includes(String(m.role)),
    );
    if (!allowed) {
      return {
        ok: false as const,
        error: { code: "FORBIDDEN", message: "Permissão insuficiente para abrir conexão OPC-UA." },
      };
    }

    const session = ensureSession(userId);
    session.config = data;
    session.status = "connecting";

    await supabase.from("runtime_logs").insert({
      user_id: userId,
      tag: "OPCUA",
      message: `Conectando a ${data.endpoint}`,
      level: "info",
      channel: "OPC-UA",
    });

    try {
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
      console.error("[opcua] connect failed", { userId, endpoint: data.endpoint, err: e?.message });
      session.error = "CONNECTION_FAILED";
      return {
        ok: false as const,
        error: { code: "CONNECTION_FAILED", message: "Falha ao conectar ao servidor OPC-UA." },
      };
    }
  });

export const disconnectOpcua = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as unknown as AuthCtx;
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
    const { userId } = context as unknown as AuthCtx;
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
    const { userId } = context as unknown as AuthCtx;
    const session = getSession(userId);
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
    const { userId } = context as unknown as AuthCtx;
    const session = getSession(userId);
    if (!session || session.status !== "connected") {
      return {
        ok: false as const,
        error: { code: "NOT_CONNECTED", message: "OPC-UA desconectado." },
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
  session._simInterval = interval;
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
      const interval = s._simInterval;
      if (interval) clearInterval(interval);
    }
  });
}
