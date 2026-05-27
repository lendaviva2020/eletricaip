// AI rate limiting middleware — burst + monthly quota enforcement
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "./auth-middleware";
import type { AuthContext } from "./auth-middleware";

// ── In-memory sliding-window burst limiter ──────────────────────
const BURST_WINDOW_MS = 60_000;
const BURST_MAX_CALLS = 20;

const burstWindows = new Map<string, number[]>();

interface BurstResult {
  allowed: boolean;
  retryAfter: number;
}

function checkBurst(userId: string): BurstResult {
  const now = Date.now();
  let timestamps = burstWindows.get(userId);
  if (!timestamps) {
    timestamps = [];
    burstWindows.set(userId, timestamps);
  }
  // Prune entries outside the window.
  const cutoff = now - BURST_WINDOW_MS;
  let i = 0;
  while (i < timestamps.length && timestamps[i] < cutoff) i++;
  if (i > 0) timestamps.splice(0, i);

  if (timestamps.length >= BURST_MAX_CALLS) {
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((oldest + BURST_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }

  timestamps.push(now);
  return { allowed: true, retryAfter: 0 };
}

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
    const { allowed, retryAfter } = checkBurst(userId);
    if (!allowed) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "BURST_LIMIT_429",
            message: `Muitas requisições em sequência. Tente novamente em ${retryAfter}s.`,
            retryAfter,
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }
    return next();
  });
