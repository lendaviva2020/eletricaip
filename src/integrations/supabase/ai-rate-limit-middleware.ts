// AI rate limiting middleware — burst + monthly quota enforcement.
// Burst limiting prefers Upstash Redis (distributed). When Upstash is
// unavailable or its circuit breaker is open we degrade to a per-instance
// fallback bucket so AI calls keep working instead of returning blank 503s.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "./auth-middleware";
import type { AuthContext } from "./auth-middleware";
import { checkRateLimit } from "@/lib/security/rate-limiter.server";
import { recordAiDecision } from "@/lib/security/ai-metrics.server";



export const requireAiQuota = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const request = getRequest();
    if (request?.method === "GET") return next();

    const authCtx = context as unknown as AuthContext;
    const supabase = authCtx.supabase;

    const { data: quotaRows, error } = await supabase.rpc("get_ai_credits_remaining");
    if (error) {
      console.error("AI quota precheck failed:", error.message);
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "AI_QUOTA_CHECK_FAILED",
            message: "Não foi possível validar a cota de IA neste momento.",
          },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }

    const quota = (Array.isArray(quotaRows) ? quotaRows[0] : quotaRows) as {
      plan?: string;
      max_credits?: number;
      used?: number;
      remaining?: number;
      unlimited?: boolean;
    } | null;

    if (!quota?.unlimited && Number(quota?.remaining ?? 0) <= 0) {
      recordAiDecision(authCtx.userId, "upstash", false, "quota");
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "PLAN_RATE_LIMIT_429",
            message: `Limite mensal de ${Number(quota?.max_credits ?? 0)} créditos de IA excedido.`,
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }

    return next();
  });

// Per-instance fallback bucket used only when Upstash is not configured.
// Window / max are loaded dynamically per-user from ai_rate_limit_configs.
const _localBuckets = new Map<string, number[]>();
function localBurstAllow(
  userId: string,
  windowMs: number,
  max: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const arr = (_localBuckets.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    const retry = Math.max(1, Math.ceil((windowMs - (now - arr[0])) / 1000));
    _localBuckets.set(userId, arr);
    return { allowed: false, retryAfterSeconds: retry };
  }
  arr.push(now);
  _localBuckets.set(userId, arr);
  return { allowed: true, retryAfterSeconds: 0 };
}

export const requireBurstLimit = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const authCtx = context as unknown as AuthContext;
    const userId = authCtx.userId;

    const upstash = await checkRateLimit("ai", userId);
    // If Upstash isn't usable (unconfigured, breaker open, or errored) we
    // degrade to a per-instance bucket instead of failing closed.
    if (upstash.bypassed) {
      const local = localBurstAllow(userId);
      recordAiDecision(userId, upstash.source, local.allowed, "burst");
      if (!local.allowed) {
        throw new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "BURST_LIMIT_429",
              message: `Muitas requisições em sequência. Tente novamente em ${local.retryAfterSeconds}s.`,
              retryAfter: local.retryAfterSeconds,
              source: upstash.source,
            },
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        );
      }
      return next();
    }

    recordAiDecision(userId, upstash.source, upstash.allowed, "burst");
    if (!upstash.allowed) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "BURST_LIMIT_429",
            message: `Muitas requisições em sequência. Tente novamente em ${upstash.retryAfterSeconds}s.`,
            retryAfter: upstash.retryAfterSeconds,
            source: upstash.source,
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }
    return next();
  });


