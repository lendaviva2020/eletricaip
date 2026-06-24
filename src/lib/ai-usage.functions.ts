// AI usage analytics — agrega usage_records (#AI-03)
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AiUsagePoint {
  period: string; // YYYY-MM
  tokensUsed: number;
  simulationsRun: number;
  storageMb: number;
}

export interface AiUsageSummary {
  plan: string;
  maxCredits: number;
  used: number;
  remaining: number;
  unlimited: boolean;
  history: AiUsagePoint[];
  costsByOperation: Array<{ operation: string; credits: number }>;
}

export const getAiUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiUsageSummary> => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) {
      return {
        plan: "free",
        maxCredits: 0,
        used: 0,
        remaining: 0,
        unlimited: false,
        history: [],
        costsByOperation: [],
      };
    }

    const [{ data: remaining }, { data: usage }, { data: costs }] = await Promise.all([
      supabase.rpc("get_ai_credits_remaining"),
      supabase
        .from("usage_records")
        .select("period, ai_tokens_used, simulations_run, storage_used_mb")
        .eq("tenant_id", tenantId)
        .order("period", { ascending: true })
        .limit(12),
      supabase
        .from("ai_credit_costs")
        .select("operation, credits")
        .order("credits", { ascending: false }),
    ]);

    const r = Array.isArray(remaining) ? remaining[0] : remaining;
    return {
      plan: r?.plan ?? "free",
      maxCredits: r?.max_credits ?? 0,
      used: r?.used ?? 0,
      remaining: r?.remaining ?? 0,
      unlimited: r?.unlimited ?? false,
      history: (usage ?? []).map((u) => ({
        period: u.period,
        tokensUsed: u.ai_tokens_used ?? 0,
        simulationsRun: u.simulations_run ?? 0,
        storageMb: u.storage_used_mb ?? 0,
      })),
      costsByOperation: (costs ?? []).map((c) => ({
        operation: c.operation,
        credits: c.credits ?? 0,
      })),
    };
  });
