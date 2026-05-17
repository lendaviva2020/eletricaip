import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listIotDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("iot_devices")
      .select("id, device_external_id, name, kind, metadata, created_at")
      .order("created_at", { ascending: false });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, devices: data ?? [] };
  });

export const getLatestReadings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        deviceId: z.string().uuid().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("iot_readings")
      .select("id, device_id, value, quality, timestamp, ttl_ms")
      .order("timestamp", { ascending: false })
      .limit(data.limit);
    if (data.deviceId) q = q.eq("device_id", data.deviceId);
    const { data: rows, error } = await q;
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, readings: (rows ?? []).reverse() };
  });

export const listIotAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("iot_alerts")
      .select("id, device_id, level, message, value, timestamp, is_resolved, created_at")
      .order("timestamp", { ascending: false })
      .limit(50);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, alerts: data ?? [] };
  });

export const acknowledgeAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ alertId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("iot_acknowledge_alert", { p_alert_id: data.alertId });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const enqueueIotCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        deviceExternalId: z.string().min(1).max(128),
        command: z.string().min(1).max(64),
        payload: z.record(z.string(), z.unknown()).default({}),
        watchdogMs: z.number().min(500).max(60_000).default(5000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: out, error } = await supabase.rpc("iot_enqueue_command", {
      p_device_external_id: data.deviceExternalId,
      p_command: data.command,
      p_payload: JSON.parse(JSON.stringify(data.payload ?? {})),
      p_watchdog_ms: data.watchdogMs,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, result: out };
  });

export const checkRealtimeFeature = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("tenant_has_feature", { p_feature: "realtime" });
    if (error) return { ok: false as const, error: error.message, enabled: false };
    return { ok: true as const, enabled: !!data };
  });

// === API key for IoT ingestion ===
export const createIotApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ name: z.string().min(1).max(64) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .single();
    if (!profile?.tenant_id) return { ok: false as const, error: "no_tenant" };

    const raw = `iot_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
    const enc = new TextEncoder().encode(raw);
    const hashBuf = await crypto.subtle.digest("SHA-256", enc);
    const hashHex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error } = await supabase.from("api_keys").insert({
      tenant_id: profile.tenant_id,
      user_id: userId,
      name: data.name,
      prefix: raw.slice(0, 12),
      key_hash: hashHex,
      scopes: ["iot:ingest"],
      is_active: true,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, apiKey: raw };
  });
