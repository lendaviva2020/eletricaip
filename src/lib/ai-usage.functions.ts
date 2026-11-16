// AI usage analytics — agrega usage_records (#AI-03)
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AiUsagePoint {
  period: string; // YYYY-MM
  tokensUsed: number;
  simulationsRun: number;
  storageMb: number;
}

export interface AiDailyUsage {
  /** Dia UTC no formato YYYY-MM-DD. */
  day: string;
  /** Número de operações de IA cobradas no dia. */
  calls: number;
  /** Créditos consumidos no dia. */
  credits: number;
}

/**
 * Consumo real por dia (UTC) dos últimos `days` dias, inclusive hoje. Dias sem
 * uso aparecem com zero (é um dado real: não houve consumo), em ordem crescente.
 */
export function buildDailyUsage(
  events: ReadonlyArray<{ created_at: string; credits: number | null }>,
  now: Date,
  days = 7,
): AiDailyUsage[] {
  const out: AiDailyUsage[] = [];
  const index = new Map<string, AiDailyUsage>();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    const row = { day, calls: 0, credits: 0 };
    out.push(row);
    index.set(day, row);
  }
  for (const ev of events) {
    const row = index.get(String(ev.created_at).slice(0, 10));
    if (!row) continue;
    row.calls += 1;
    row.credits += Number(ev.credits) || 0;
  }
  return out;
}

export interface AiUsageSummary {
  plan: string;
  maxCredits: number;
  used: number;
  remaining: number;
  unlimited: boolean;
  history: AiUsagePoint[];
  costsByOperation: Array<{ operation: string; credits: number }>;
  monthlyByOperation: Array<{ period: string } & Record<string, string | number>>;
  operationKeys: string[];
  topOperations: Array<{ operation: string; credits: number; events: number }>;
  daily: AiDailyUsage[];
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
        monthlyByOperation: [],
        operationKeys: [],
        topOperations: [],
        daily: buildDailyUsage([], new Date()),
      };
    }

    // Últimos 12 meses (janela de eventos por operação)
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 11);
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const [{ data: remaining }, { data: usage }, { data: costs }, { data: events }] =
      await Promise.all([
        supabase.rpc("get_ai_credits_remaining"),
        supabase
          .from("usage_records")
          .select("period, ai_tokens_used, simulations_run, storage_used_mb")
          .eq("tenant_id", tenantId)
          .order("period", { ascending: true })
          .limit(12),
        supabase.from("ai_credit_costs").select("operation, credits").order("credits", {
          ascending: false,
        }),
        supabase
          .from("ai_usage_events")
          .select("operation, credits, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: true })
          .limit(5000),
      ]);

    // Agregação por (período YYYY-MM, operação)
    const monthlyMap = new Map<string, Record<string, number>>();
    const opTotals = new Map<string, { credits: number; events: number }>();
    for (const ev of events ?? []) {
      const period = (ev.created_at as string).slice(0, 7);
      const op = ev.operation as string;
      const credits = (ev.credits as number) ?? 0;
      const row = monthlyMap.get(period) ?? {};
      row[op] = (row[op] ?? 0) + credits;
      monthlyMap.set(period, row);
      const t = opTotals.get(op) ?? { credits: 0, events: 0 };
      t.credits += credits;
      t.events += 1;
      opTotals.set(op, t);
    }
    const operationKeys = Array.from(opTotals.keys()).sort(
      (a, b) => (opTotals.get(b)!.credits ?? 0) - (opTotals.get(a)!.credits ?? 0),
    );
    const monthlyByOperation = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, row]) => {
        const out: Record<string, string | number> = { period };
        for (const k of operationKeys) out[k] = row[k] ?? 0;
        return out as { period: string } & Record<string, string | number>;
      });
    const topOperations = operationKeys.map((op) => ({
      operation: op,
      credits: opTotals.get(op)!.credits,
      events: opTotals.get(op)!.events,
    }));

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
      monthlyByOperation,
      operationKeys,
      topOperations,
      daily: buildDailyUsage(
        (events ?? []).map((e) => ({
          created_at: e.created_at as string,
          credits: (e.credits as number) ?? 0,
        })),
        new Date(),
      ),
    };
  });
