// AI rate limiting middleware — burst + monthly quota enforcement.
// Burst limiting prefers Upstash Redis (distributed). When Upstash is
// unavailable or its circuit breaker is open:
//   - By default: FAIL-CLOSED (deny AI requests) to prevent uncontrolled costs
//   - Opt-in via AI_RATE_LIMIT_LOCAL_FALLBACK=true: per-instance fallback bucket
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

// Per-instance fallback bucket used ONLY when explicitly enabled via env var
// and Upstash is unavailable. Window/max loaded from ai_rate_limit_configs.
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

const LOCAL_FALLBACK_ENABLED = process.env.AI_RATE_LIMIT_LOCAL_FALLBACK === "true";

export const requireBurstLimit = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const authCtx = context as unknown as AuthContext;
    const userId = authCtx.userId;

    const { getAiRateLimitConfig } = await import("@/lib/security/ai-rate-limit-config.server");
    const cfg = await getAiRateLimitConfig(userId);

    const rl = await checkRateLimit("ai", userId);

    // FAIL-CLOSED: if bypassed and failClosed=true, deny immediately
    if (rl.failClosed) {
      recordAiDecision(userId, rl.source, false, "burst");
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "RATE_LIMITER_UNAVAILABLE",
            message: "Serviço de rate limiting indisponível. Tente novamente em instantes.",
            retryAfter: rl.retryAfterSeconds,
            source: rl.source,
          },
        }),
        {
          status: 503,
          headers: {
            "content-type": "application/json",
            "Retry-After": String(rl.retryAfterSeconds),
          },
        },
      );
    }

    // If bypassed but not fail-closed (shouldn't happen for AI, but defensive)
    if (rl.bypassed) {
      if (!LOCAL_FALLBACK_ENABLED) {
        recordAiDecision(userId, rl.source, false, "burst");
        throw new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "RATE_LIMITER_UNAVAILABLE",
              message:
                "Serviço de rate limiting indisponível. Configure AI_RATE_LIMIT_LOCAL_FALLBACK=true para fallback local.",
              retryAfter: rl.retryAfterSeconds,
              source: rl.source,
            },
          }),
          {
            status: 503,
            headers: {
              "content-type": "application/json",
              "Retry-After": String(rl.retryAfterSeconds),
            },
          },
        );
      }

      // Local fallback enabled explicitly
      const local = localBurstAllow(userId, cfg.fallbackWindowMs, cfg.fallbackMax);
      recordAiDecision(userId, rl.source, local.allowed, "burst");
      if (!local.allowed) {
        throw new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "BURST_LIMIT_429",
              message: `Muitas requisições em sequência. Tente novamente em ${local.retryAfterSeconds}s.`,
              retryAfter: local.retryAfterSeconds,
              source: "local-fallback",
            },
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        );
      }
      return next();
    }

    // Normal path: Upstash responded
    recordAiDecision(userId, rl.source, rl.allowed, "burst");
    if (!rl.allowed) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "BURST_LIMIT_429",
            message: `Muitas requisições em sequência. Tente novamente em ${rl.retryAfterSeconds}s.`,
            retryAfter: rl.retryAfterSeconds,
            source: rl.source,
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }
    return next();
  });
