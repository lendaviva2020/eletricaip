import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getPlan } from "@/lib/plans";
import { requireSupabaseAuth } from "./auth-middleware";

// ── In-memory sliding-window burst limiter ──────────────────────
const BURST_WINDOW_MS = 60_000;
const BURST_MAX_CALLS = 20;

const burstWindows = new Map<string, number[]>();

function checkBurst(userId: string): { allowed: boolean; retryAfter: number } {
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

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const requireAiQuota = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const request = getRequest();
    if (request?.method === "GET") return next();

    const supabase = (context as any).supabase;
    const userId = (context as any).userId as string;

    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    const plan = getPlan(profile?.plan);
    if (plan.aiCreditsPerMonth === null) return next();

    const period = monthKey();
    const { data: usage } = await supabase
      .from("ai_usage_monthly")
      .select("calls_used")
      .eq("user_id", userId)
      .eq("period", period)
      .maybeSingle();

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
    await supabase.from("ai_usage_monthly").upsert(
      {
        user_id: userId,
        period,
        calls_used: nextUsed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,period" },
    );

    return next();
  });

export const requireBurstLimit = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = (context as any).userId as string;
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
