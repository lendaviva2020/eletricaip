import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    const { userId } = context;
    const { data: alert, error: alertError } = await supabaseAdmin
      .from("iot_alerts")
      .select("id, device_id")
      .eq("id", data.alertId)
      .maybeSingle();
    if (alertError) return { ok: false as const, error: alertError.message };
    if (!alert?.device_id) return { ok: false as const, error: "not_found" };

    const { data: device, error: deviceError } = await supabaseAdmin
      .from("iot_devices")
      .select("tenant_id")
      .eq("id", alert.device_id)
      .maybeSingle();
    if (deviceError) return { ok: false as const, error: deviceError.message };
    if (!device?.tenant_id) return { ok: false as const, error: "not_found" };

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", device.tenant_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) return { ok: false as const, error: membershipError.message };
    if (!membership) return { ok: false as const, error: "forbidden" };

    const { error } = await supabaseAdmin
      .from("iot_alerts")
      .update({ is_resolved: true })
      .eq("id", data.alertId);
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
    const { userId } = context;
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) return { ok: false as const, error: profileError.message };
    if (!profile?.tenant_id) return { ok: false as const, error: "no_tenant" };

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", profile.tenant_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) return { ok: false as const, error: membershipError.message };
    if (!membership || !["owner", "admin", "engineer"].includes(membership.role)) {
      return { ok: false as const, error: "forbidden" };
    }

    const { data: device, error: deviceError } = await supabaseAdmin
      .from("iot_devices")
      .select("device_external_id")
      .eq("tenant_id", profile.tenant_id)
      .eq("device_external_id", data.deviceExternalId)
      .maybeSingle();
    if (deviceError) return { ok: false as const, error: deviceError.message };
    if (!device) return { ok: false as const, error: "device_not_found" };

    const commandExternalId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const payload = JSON.parse(JSON.stringify(data.payload ?? {}));
    const expiresAt = new Date(Date.now() + data.watchdogMs).toISOString();

    const { data: inserted, error } = await supabaseAdmin
      .from("iot_command_log")
      .insert({
        command_id: commandExternalId,
        tenant_id: profile.tenant_id,
        target_device: data.deviceExternalId,
        command: data.command,
        payload,
        requested_by: userId,
        watchdog_timeout_ms: data.watchdogMs,
        fail_safe_on_timeout: true,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error) return { ok: false as const, error: error.message };

    return {
      ok: true as const,
      result: {
        ok: true,
        command_id: inserted.id,
        command_external_id: commandExternalId,
      },
    };
  });

export const checkRealtimeFeature = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) return { ok: false as const, error: profileError.message, enabled: false };
    if (!profile?.tenant_id) return { ok: true as const, enabled: false };

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("plan")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    if (tenantError) return { ok: false as const, error: tenantError.message, enabled: false };

    const { data: limits, error: limitsError } = await supabase
      .from("plan_limits")
      .select("features")
      .eq("plan", tenant?.plan ?? "free")
      .maybeSingle();
    if (limitsError) return { ok: false as const, error: limitsError.message, enabled: false };

    const features = Array.isArray(limits?.features) ? limits.features : [];
    const enabled = features.includes("realtime") || features.includes("all_features");
    return { ok: true as const, enabled };
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

// === Telemetria agregada para Dashboard ===
export const getDashboardTelemetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        projectId: z.string().uuid().optional(),
        hours: z.number().min(1).max(720).default(24), // até 30 dias
        tagPatterns: z
          .array(z.string())
          .default([
            "energy",
            "power",
            "consumption",
            "production",
            "count",
            "output",
            "temperature",
            "temp",
          ]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Buscar tenant do usuário
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError || !profile?.tenant_id) {
      return { ok: false as const, error: "no_tenant" };
    }

    // Buscar projetos do tenant (ou projeto específico)
    let projectsQuery = supabase.from("projects").select("id").eq("tenant_id", profile.tenant_id);
    if (data.projectId) {
      projectsQuery = projectsQuery.eq("id", data.projectId);
    }
    const { data: projects, error: projectsError } = await projectsQuery;
    if (projectsError) return { ok: false as const, error: projectsError.message };
    const projectIds = (projects ?? []).map((p) => p.id);
    if (projectIds.length === 0) {
      return { ok: true as const, series: {} };
    }

    // Janela de tempo
    const since = new Date(Date.now() - data.hours * 60 * 60 * 1000).toISOString();

    // Query tag_samples com ILIKE patterns sanitizados contra PostgREST filter injection
    const sanitizedPatterns = data.tagPatterns
      .map((p) => p.replace(/[^a-zA-Z0-9_.\-:[\]\s]/g, "").trim())
      .filter((p) => p.length > 0)
      .slice(0, 20);
    if (sanitizedPatterns.length === 0) {
      return { ok: true as const, series: {} };
    }
    const orFilters = sanitizedPatterns.map((p) => `tag_name.ilike.%${p}%`).join(",");
    const { data: samples, error: samplesError } = await supabase
      .from("tag_samples")
      .select("project_id, tag_name, value, sampled_at")
      .in("project_id", projectIds)
      .gte("sampled_at", since)
      .or(orFilters)
      .order("sampled_at", { ascending: true })
      .limit(5000);

    if (samplesError) return { ok: false as const, error: samplesError.message };

    // Agregar por tag_name e bucket de tempo (1 hora)
    const bucketMs = 60 * 60 * 1000; // 1 hora
    const seriesMap = new Map<string, Map<number, { sum: number; count: number }>>();

    for (const s of samples ?? []) {
      const ts = new Date(s.sampled_at).getTime();
      const bucket = Math.floor(ts / bucketMs) * bucketMs;
      if (!seriesMap.has(s.tag_name)) seriesMap.set(s.tag_name, new Map());
      const bucketMap = seriesMap.get(s.tag_name)!;
      const existing = bucketMap.get(bucket) ?? { sum: 0, count: 0 };
      existing.sum += s.value;
      existing.count += 1;
      bucketMap.set(bucket, existing);
    }

    // Converter para array ordenado por timestamp
    const series: Record<string, Array<{ timestamp: string; value: number }>> = {};
    for (const [tagName, buckets] of seriesMap) {
      series[tagName] = Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([bucket, { sum, count }]) => ({
          timestamp: new Date(bucket).toISOString(),
          value: count > 0 ? sum / count : 0,
        }));
    }

    return { ok: true as const, series };
  });
