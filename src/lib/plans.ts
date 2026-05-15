export type PlanId = "free" | "basic" | "pro" | "premium";

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  priceBRL: number;
  /** AI credits per month. null = unlimited. */
  aiCreditsPerMonth: number | null;
  /** -1 = unlimited */
  maxProjects: number;
  realtime: boolean;
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<PlanId, SubscriptionPlan> = {
  free: {
    id: "free",
    name: "Grátis",
    priceBRL: 0,
    aiCreditsPerMonth: 10,
    maxProjects: 3,
    realtime: false,
    features: ["IA básica", "Exportação PDF", "Suporte da comunidade"],
  },
  basic: {
    id: "basic",
    name: "Básico",
    priceBRL: 100,
    aiCreditsPerMonth: 100,
    maxProjects: 10,
    realtime: false,
    features: ["IA padrão", "Exportação PDF", "Suporte por email"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceBRL: 580,
    aiCreditsPerMonth: 250,
    maxProjects: -1,
    realtime: true,
    features: [
      "IA avançada + Digital Twin",
      "Realtime OPC-UA / Modbus",
      "Projetos ilimitados",
      "Suporte prioritário",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceBRL: 1000,
    aiCreditsPerMonth: null,
    maxProjects: -1,
    realtime: true,
    features: [
      "Tudo do Pro",
      "IA ilimitada",
      "Capacidade dedicada",
      "SLA + integrações customizadas",
    ],
  },
};

export function getPlan(id: string | null | undefined): SubscriptionPlan {
  if (id === "free" || id === "basic" || id === "pro" || id === "premium") {
    return SUBSCRIPTION_PLANS[id];
  }
  return SUBSCRIPTION_PLANS.free;
}

export function formatAiCreditsRemaining(planId: string | null | undefined, used: number) {
  const plan = getPlan(planId);
  if (plan.aiCreditsPerMonth === null) return "IA ilimitada";
  return `${Math.max(0, plan.aiCreditsPerMonth - used)} créditos restantes`;
}

// Backwards-compat aliases (older code may import these)
export const formatAiCallsRemaining = formatAiCreditsRemaining;
