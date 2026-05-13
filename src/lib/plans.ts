export type PlanId = "basico" | "pro" | "premium";

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  priceBRL: number;
  aiCallsPerMonth: number | null;
}

export const SUBSCRIPTION_PLANS: Record<PlanId, SubscriptionPlan> = {
  basico: { id: "basico", name: "Básico", priceBRL: 49, aiCallsPerMonth: 100 },
  pro: { id: "pro", name: "Pro", priceBRL: 149, aiCallsPerMonth: 200 },
  premium: { id: "premium", name: "Premium", priceBRL: 299, aiCallsPerMonth: null },
};

export function getPlan(id: string | null | undefined): SubscriptionPlan {
  if (id === "pro" || id === "premium" || id === "basico") return SUBSCRIPTION_PLANS[id];
  return SUBSCRIPTION_PLANS.basico;
}

export function formatAiCallsRemaining(planId: string | null | undefined, used: number) {
  const plan = getPlan(planId);
  if (plan.aiCallsPerMonth === null) return "IA ilimitada";
  return `${Math.max(0, plan.aiCallsPerMonth - used)} chamadas IA`;
}
