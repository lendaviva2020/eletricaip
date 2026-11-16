/**
 * Painel mensal do dono da plataforma: empresas, usuários, projetos, itens de
 * BOM (quantidade e valor de lista), consumo de IA e receita recorrente
 * estimada por plano.
 *
 * Segurança:
 * - autenticação + checagem `is_platform_admin()` com o token do PRÓPRIO
 *   usuário ANTES de usar a service role;
 * - a RPC `platform_monthly_metrics` só é executável por service_role e
 *   devolve apenas contagens (nenhum nome, e-mail ou id de cliente);
 * - a resposta é validada com Zod (fail-closed se o formato mudar).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUBSCRIPTION_PLANS, type PlanId } from "@/lib/plans";

const MonthRowSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  newTenants: z.number().int().nonnegative(),
  newUsers: z.number().int().nonnegative(),
  newProjects: z.number().int().nonnegative(),
  bomItems: z.number().int().nonnegative(),
  bomQuantity: z.number().nonnegative(),
  bomValueBrl: z.number().nonnegative(),
  bomUnpricedItems: z.number().int().nonnegative(),
  aiCalls: z.number().int().nonnegative(),
  aiCredits: z.number().int().nonnegative(),
});

export const PlatformMetricsSchema = z.object({
  generatedAt: z.string(),
  months: z.array(MonthRowSchema),
  tenantsByPlan: z.record(z.string(), z.number().int().nonnegative()),
  totals: z.object({
    tenants: z.number().int().nonnegative(),
    users: z.number().int().nonnegative(),
    projects: z.number().int().nonnegative(),
    bomItems: z.number().int().nonnegative(),
    catalogComponents: z.number().int().nonnegative(),
    iotDevices: z.number().int().nonnegative(),
  }),
});

export type PlatformMonthRow = z.infer<typeof MonthRowSchema>;
export type PlatformMetrics = z.infer<typeof PlatformMetricsSchema> & {
  /** Receita mensal estimada (BRL) = Σ empresas ativas × preço de tabela do plano. */
  estimatedMrrBrl: number;
};

/** MRR de tabela a partir da distribuição de planos (planos desconhecidos valem 0). */
export function estimateMrrBrl(tenantsByPlan: Record<string, number>): number {
  let total = 0;
  for (const [plan, count] of Object.entries(tenantsByPlan)) {
    const def = SUBSCRIPTION_PLANS[plan as PlanId];
    if (def) total += def.priceBRL * count;
  }
  return total;
}

export const getPlatformMonthlyMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ months: z.number().int().min(1).max(24).default(6) })
      .default({ months: 6 })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PlatformMetrics> => {
    const { data: isAdmin, error: adminErr } = await context.supabase.rpc("is_platform_admin");
    if (adminErr) throw new Error("admin_check_failed");
    if (isAdmin !== true) throw new Response("Forbidden", { status: 403 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // A RPC é nova e ainda não está nos tipos gerados: chamada sem tipagem do
    // nome, com a resposta validada por Zod logo abaixo.
    const rpc = supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data: raw, error } = await rpc.call(supabaseAdmin, "platform_monthly_metrics", {
      p_months: data.months,
    });
    if (error) throw new Error(`metrics_failed: ${error.message}`);

    const parsed = PlatformMetricsSchema.safeParse(raw);
    if (!parsed.success) throw new Error("metrics_invalid_shape");
    return { ...parsed.data, estimatedMrrBrl: estimateMrrBrl(parsed.data.tenantsByPlan) };
  });
