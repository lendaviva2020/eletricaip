// AI rate limiting middleware — burst + monthly quota enforcement
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getPlan } from "@/lib/plans";
import { requireSupabaseAuth } from "./auth-middleware";
import { supabaseAdmin } from "./client.server";
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

function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const requireAiQuota = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const request = getRequest();
    if (request?.method === "GET") return next();

    const authCtx = context as unknown as AuthContext;
    const supabase = authCtx.supabase;
    const userId = authCtx.userId;

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    const plan = getPlan((profile as unknown as { plan: string | null })?.plan);
    if (plan.aiCreditsPerMonth === null) return next();

    const period = monthKey();
    // Use supabaseAdmin with raw query to avoid generated type issues
    const { data: usageRows } = await supabaseAdmin.rpc(
      "get_ai_usage_monthly" as never,
      { p_user_id: userId, p_period: period } as never,
    );
    const usage = (usageRows as unknown as { calls_used: number } | null) ?? null;

    const used = Number(usage?.calls_used ?? 0);
    if (used >= plan.aiCreditsPerMonth) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "PLAN_RATE_LIMIT_429",
            message: `Limite mensal de ${plan.aiCreditsPerMonth} chamadas de IA excedido.`,
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }

    const nextUsed = used + 1;
    await supabaseAdmin.rpc(
      "upsert_ai_usage_monthly" as never,
      { p_user_id: userId, p_period: period, p_calls_used: nextUsed } as never,
    );

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
