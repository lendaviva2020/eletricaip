// AI rate limiting middleware — burst + monthly quota enforcement.
// Burst limiting REQUIRES Upstash Redis (distributed). The previous in-memory
// fallback was removed because it is ineffective across serverless instances —
// when Upstash is unavailable the middleware now fails closed (HTTP 503).
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "./auth-middleware";
import type { AuthContext } from "./auth-middleware";
import { checkRateLimit } from "@/lib/security/rate-limiter.server";



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

export const requireBurstLimit = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const authCtx = context as unknown as AuthContext;
    const userId = authCtx.userId;

    const upstash = await checkRateLimit("ai", userId);
    // Fail-closed: if the distributed limiter is offline/unconfigured we cannot
    // safely enforce per-user limits across instances, so reject the request.
    if (upstash.bypassed) {
      console.error("[ai-rate-limit] distributed limiter unavailable — failing closed");
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "RATE_LIMITER_UNAVAILABLE_503",
            message:
              "Serviço de limite de requisições temporariamente indisponível. Tente novamente em instantes.",
          },
        }),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }

    if (!upstash.allowed) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "BURST_LIMIT_429",
            message: `Muitas requisições em sequência. Tente novamente em ${upstash.retryAfterSeconds}s.`,
            retryAfter: upstash.retryAfterSeconds,
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }
    return next();
  });

