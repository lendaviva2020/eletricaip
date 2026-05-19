import { createClient, type RealtimeChannel, type SupabaseClient, type RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useProjectStore, type TickPayload } from "./project-store";

const STORAGE_KEY = "eletricai.runtime.config";
const CHANNEL_NAME = "eletricai:runtime";

export interface RuntimeConfig {
  url: string;
  anonKey: string;
  channel?: string;
}

let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let localTimer: ReturnType<typeof setInterval> | null = null;
let localTick = 0;

export function loadConfig(): RuntimeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RuntimeConfig) : null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg: RuntimeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function connectSupabase(cfg: RuntimeConfig): Promise<boolean> {
  await disconnect();
  const store = useProjectStore.getState();
  try {
    client = createClient(cfg.url, cfg.anonKey, {
      realtime: { params: { eventsPerSecond: 20 } },
      auth: { persistSession: false },
    });
    const channelName = cfg.channel || CHANNEL_NAME;
    channel = client.channel(channelName, { config: { broadcast: { self: false, ack: false } } });

    channel.on("broadcast", { event: "tick" }, ({ payload }) => {
      useProjectStore.getState().applyTick(payload as TickPayload);
    });

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "runtime_logs" },
      (msg: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const r = msg.new as Record<string, unknown>;
        useProjectStore.getState().pushLog({
          t: new Date((r.ts as number) ?? Date.now()).toLocaleTimeString(),
          tag: (r.tag as string) ?? "RT",
          msg: (r.message as string) ?? "",
          lvl: (r.level as "info" | "warn" | "err" | "ok") ?? "info",
          channel: (r.channel as "Logs" | "Alarmes" | "IA" | "Eventos" | "OPC-UA" | "Modbus" | "Runtime" | "Terminal") ?? "Logs",
        });
      },
    );

    await new Promise<void>((resolve, reject) => {
      channel!.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          store.setRuntime({ connected: true, source: "supabase", url: cfg.url, error: undefined });
          store.pushLog({
            t: new Date().toLocaleTimeString(),
            tag: "RT",
            msg: `Conectado · ${channelName}`,
            lvl: "ok",
            channel: "Runtime",
          });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          reject(new Error(`Realtime ${status}`));
        }
      });
      setTimeout(() => reject(new Error("Realtime timeout")), 8000);
    });
    saveConfig(cfg);
    return true;
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    useProjectStore.getState().setRuntime({ connected: false, source: "off", error: errorMessage });
    useProjectStore.getState().pushLog({
      t: new Date().toLocaleTimeString(),
      tag: "RT",
      msg: `Falha: ${errorMessage}`,
      lvl: "err",
      channel: "Runtime",
    });
    await disconnect();
    throw e;
  }
}

export async function disconnect(): Promise<void> {
  if (channel) {
    await channel.unsubscribe();
    channel = null;
  }
  if (client) {
    await client.removeAllChannels();
    client = null;
  }
  if (localTimer) {
    clearInterval(localTimer);
    localTimer = null;
  }
  useProjectStore.getState().setRuntime({ connected: false, source: "off" });
}

// Local fallback simulator — runs in the browser when Supabase isn't connected.
export function startLocalSimulation(): void {
  if (localTimer) return;
  const store = useProjectStore.getState();
  store.setRuntime({ connected: true, source: "local", cycleMs: 50 });
  store.pushLog({
    t: new Date().toLocaleTimeString(),
    tag: "SIM",
    msg: "Simulador local iniciado (50 ms)",
    lvl: "ok",
    channel: "Runtime",
  });

  localTimer = setInterval(() => {
    localTick++;
    const s = useProjectStore.getState();
    const tags: Record<string, number | boolean> = {};
    const params: Record<string, Record<string, string | number>> = {};
    const energized: Record<string, boolean> = {};
    const logs: import("./project-store").RuntimeLog[] = [];

    for (const n of s.nodes) {
      if (n.kind === "tank") {
        const lvl = 50 + Math.sin(localTick / 30) * 30;
        tags[`${n.id}.NIVEL`] = +lvl.toFixed(1);
        params[n.id] = { nivel: `${lvl.toFixed(1)}%` };
      }
      if (n.kind === "motor" || n.kind === "pump") {
        const speed = 1450 + Math.sin(localTick / 8 + n.id.length) * 40;
        const current = 14 + Math.abs(Math.sin(localTick / 10)) * 4;
        tags[`${n.id}.SPEED`] = Math.round(speed);
        tags[`${n.id}.CURRENT`] = +current.toFixed(1);
        params[n.id] = { Speed: `${Math.round(speed)} rpm`, I: `${current.toFixed(1)}A` };
        energized[n.id] = current > 12;
      }
      if (n.kind === "valve") {
        const pos = 50 + Math.sin(localTick / 20) * 40;
        tags[`${n.id}.POS`] = +pos.toFixed(0);
        params[n.id] = { pos: `${pos.toFixed(0)}%` };
      }
    }

    if (localTick % 80 === 0) {
      logs.push({
        t: new Date().toLocaleTimeString(),
        tag: "PLC",
        msg: `OB1 cycle ${(7 + Math.random()).toFixed(1)} ms`,
        lvl: "ok" as const,
        channel: "Logs" as const,
      });
    }
    if (localTick % 240 === 0) {
      logs.push({
        t: new Date().toLocaleTimeString(),
        tag: "ALM",
        msg: "Sobrecorrente M-02 (transiente)",
        lvl: "warn" as const,
        channel: "Alarmes" as const,
      });
    }

    s.applyTick({ ts: Date.now(), cycleMs: 50, tags, params, energized, logs });
  }, 50);
}

export function isLocalRunning(): boolean {
  return !!localTimer;
}

export async function autoConnect(): Promise<boolean> {
  const cfg = loadConfig();
  if (!cfg) return false;
  try {
    await connectSupabase(cfg);
    return true;
  } catch {
    return false;
  }
}
