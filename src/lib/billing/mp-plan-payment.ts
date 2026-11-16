/**
 * Interpretação PURA de um pagamento aprovado do Mercado Pago para planos.
 *
 * - Plano e período vêm da preferência criada pelo NOSSO servidor
 *   (metadata / external_reference "tenant:plan:interval").
 * - O valor pago é conferido com a tabela de preços: abaixo do menor preço
 *   possível (preço de lançamento) o plano NÃO é liberado.
 * - O vencimento é o início + 1 mês ou + 1 ano.
 */
import { periodEndFrom, planCharge, type BillingInterval, type PlanId } from "@/lib/plans";

const PAID_PLANS = new Set<PlanId>(["basic", "pro", "premium"]);

export interface MpPlanPaymentInput {
  readonly metadata: { tenant_id?: unknown; plan?: unknown; interval?: unknown } | null | undefined;
  readonly externalReference: string | null | undefined;
  readonly amountBRL: number;
  readonly approvedAt: Date;
}

export type MpPlanPaymentDecision =
  | {
      readonly ok: true;
      readonly tenantId: string;
      readonly plan: PlanId;
      readonly interval: BillingInterval;
      readonly periodStart: Date;
      readonly periodEnd: Date;
    }
  | {
      readonly ok: false;
      readonly reason: "unknown_plan" | "missing_tenant" | "amount_below_price";
    };

export function decideMpPlanPayment(input: MpPlanPaymentInput): MpPlanPaymentDecision {
  const [refTenant, refPlan, refInterval] = (input.externalReference ?? "").split(":");
  const meta = input.metadata ?? {};
  const tenantId = String(meta.tenant_id ?? refTenant ?? "").trim();
  if (!tenantId) return { ok: false, reason: "missing_tenant" };

  const planRaw = String(meta.plan ?? refPlan ?? "");
  if (!PAID_PLANS.has(planRaw as PlanId)) return { ok: false, reason: "unknown_plan" };
  const plan = planRaw as PlanId;

  const intervalRaw = String(meta.interval ?? refInterval ?? "monthly");
  const interval: BillingInterval = intervalRaw === "yearly" ? "yearly" : "monthly";

  // Menor valor legítimo = preço de lançamento. Tolerância de 1 centavo.
  const minimum = planCharge(plan, interval, true);
  if (!(Number.isFinite(input.amountBRL) && input.amountBRL + 0.01 >= minimum)) {
    return { ok: false, reason: "amount_below_price" };
  }

  return {
    ok: true,
    tenantId,
    plan,
    interval,
    periodStart: input.approvedAt,
    periodEnd: periodEndFrom(input.approvedAt, interval),
  };
}
