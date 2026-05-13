import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getPlan } from "@/lib/plans";
import { requireSupabaseAuth } from "./auth-middleware";

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
    if (plan.aiCallsPerMonth === null) return next();

    const period = monthKey();
    const { data: usage } = await supabase
      .from("ai_usage_monthly")
      .select("calls_used")
      .eq("user_id", userId)
      .eq("period", period)
      .maybeSingle();

    const used = Number(usage?.calls_used ?? 0);
    if (used >= plan.aiCallsPerMonth) {
      throw new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "PLAN_RATE_LIMIT_429",
            message: `Limite mensal de ${plan.aiCallsPerMonth} chamadas de IA excedido.`,
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
