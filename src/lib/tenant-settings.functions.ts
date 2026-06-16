import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Tenant-scoped JSONB key/value store used by Settings pages
 * (notifications, integrations, protocols/normas, appearance...).
 * Also persists a small AI status events log per tenant.
 */

async function getActiveTenantId(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const tid = (data as { tenant_id?: string | null } | null)?.tenant_id ?? null;
  if (!tid) throw new Error("no_tenant");
  return tid;
}

export type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

const SettingKey = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_.-]+$/i, "invalid_key");

export const getTenantSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ key: SettingKey }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getActiveTenantId(supabase, userId);
    const { data: row, error } = await supabase
      .from("tenant_settings")
      .select("value, updated_at")
      .eq("tenant_id", tenantId)
      .eq("key", data.key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      value: (row as { value: JsonValue }).value as JsonValue,
      updated_at: (row as { updated_at: string }).updated_at,
    };
  });

export const setTenantSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        key: SettingKey,
        value: z.unknown(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getActiveTenantId(supabase, userId);
    const payload = {
      tenant_id: tenantId,
      key: data.key,
      value: (data.value ?? {}) as never,
      updated_by: userId,
    };
    const { error } = await supabase
      .from("tenant_settings")
      .upsert(payload, { onConflict: "tenant_id,key" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ---- AI status events ----

export const recordAiStatusEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ok: z.boolean(),
        code: z.string().max(48).optional(),
        latencyMs: z.number().int().min(0).max(600_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getActiveTenantId(supabase, userId);
    const { error } = await supabase.from("ai_status_events").insert({
      tenant_id: tenantId,
      user_id: userId,
      ok: data.ok,
      code: data.code ?? null,
      latency_ms: data.latencyMs,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listAiStatusEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await getActiveTenantId(supabase, userId);
    const { data: rows, error } = await supabase
      .from("ai_status_events")
      .select("ok, code, latency_ms, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      ok: boolean;
      code: string | null;
      latency_ms: number;
      created_at: string;
    }>;
  });
