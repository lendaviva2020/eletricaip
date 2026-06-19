// Server-only loader + cache for dynamic AI rate-limit configs.
// Reads from public.ai_rate_limit_configs via service role and caches
// per-user (and global) settings for 30s to avoid hitting the DB on every
// AI call.

export interface AiRateLimitConfig {
  burstWindowMs: number;
  burstMax: number;
  fallbackWindowMs: number;
  fallbackMax: number;
  source: "user" | "global" | "default";
}

const DEFAULTS: AiRateLimitConfig = {
  burstWindowMs: 10_000,
  burstMax: 10,
  fallbackWindowMs: 10_000,
  fallbackMax: 10,
  source: "default",
};

const TTL_MS = 30_000;
const _cache = new Map<string, { at: number; cfg: AiRateLimitConfig }>();
let _globalCache: { at: number; cfg: AiRateLimitConfig | null } | null = null;

async function loadGlobal(): Promise<AiRateLimitConfig | null> {
  if (_globalCache && Date.now() - _globalCache.at < TTL_MS) return _globalCache.cfg;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ai_rate_limit_configs")
      .select("burst_window_ms,burst_max,fallback_window_ms,fallback_max")
      .is("user_id", null)
      .maybeSingle();
    const cfg = data
      ? {
          burstWindowMs: data.burst_window_ms,
          burstMax: data.burst_max,
          fallbackWindowMs: data.fallback_window_ms,
          fallbackMax: data.fallback_max,
          source: "global" as const,
        }
      : null;
    _globalCache = { at: Date.now(), cfg };
    return cfg;
  } catch (err) {
    console.error("[ai-rate-limit-config] global load failed:", err);
    _globalCache = { at: Date.now(), cfg: null };
    return null;
  }
}

export async function getAiRateLimitConfig(userId: string): Promise<AiRateLimitConfig> {
  const hit = _cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.cfg;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ai_rate_limit_configs")
      .select("burst_window_ms,burst_max,fallback_window_ms,fallback_max")
      .eq("user_id", userId)
      .maybeSingle();
    let cfg: AiRateLimitConfig;
    if (data) {
      cfg = {
        burstWindowMs: data.burst_window_ms,
        burstMax: data.burst_max,
        fallbackWindowMs: data.fallback_window_ms,
        fallbackMax: data.fallback_max,
        source: "user",
      };
    } else {
      cfg = (await loadGlobal()) ?? DEFAULTS;
    }
    _cache.set(userId, { at: Date.now(), cfg });
    return cfg;
  } catch (err) {
    console.error("[ai-rate-limit-config] user load failed:", err);
    return DEFAULTS;
  }
}

export function invalidateAiRateLimitCache(userId?: string | null) {
  if (userId) _cache.delete(userId);
  else {
    _cache.clear();
    _globalCache = null;
  }
}
