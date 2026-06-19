// Admin-only CRUD for AI rate-limit configs. All handlers verify
// is_platform_admin via the user's RLS context before any write.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ConfigSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().nullable(),
  burst_window_ms: z.number().int().min(1000).max(3_600_000),
  burst_max: z.number().int().min(1).max(10_000),
  fallback_window_ms: z.number().int().min(1000).max(3_600_000),
  fallback_max: z.number().int().min(1).max(10_000),
  note: z.string().trim().max(500).nullable().optional(),
});

async function assertAdmin(ctx: { supabase: any }) {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

export const listAiRateLimitConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("ai_rate_limit_configs")
      .select("id,user_id,burst_window_ms,burst_max,fallback_window_ms,fallback_max,note,updated_at,updated_by")
      .order("user_id", { ascending: true, nullsFirst: true });
    if (error) throw new Error(error.message);
    return { ok: true as const, rows: data ?? [] };
  });

export const upsertAiRateLimitConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfigSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const payload = {
      user_id: data.user_id,
      burst_window_ms: data.burst_window_ms,
      burst_max: data.burst_max,
      fallback_window_ms: data.fallback_window_ms,
      fallback_max: data.fallback_max,
      note: data.note ?? null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const { data: row, error } = await context.supabase
      .from("ai_rate_limit_configs")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    const { invalidateAiRateLimitCache } = await import("@/lib/security/ai-rate-limit-config.server");
    invalidateAiRateLimitCache(data.user_id);
    return { ok: true as const, row };
  });

export const deleteAiRateLimitConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: existing } = await context.supabase
      .from("ai_rate_limit_configs")
      .select("user_id")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase
      .from("ai_rate_limit_configs")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { invalidateAiRateLimitCache } = await import("@/lib/security/ai-rate-limit-config.server");
    invalidateAiRateLimitCache(existing?.user_id ?? null);
    return { ok: true as const };
  });
