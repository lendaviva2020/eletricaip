export type PlanId = "free" | "basic" | "pro" | "premium";
export type BillingInterval = "monthly" | "yearly";

export interface SubscriptionPlan {
  id: PlanId;
  name: string;
  /** Público do plano (empresa × autônomo). */
  audience: string;
  /** Preço mensal (cobrança mês a mês). Mantido por compatibilidade. */
  priceBRL: number;
  /** Preço da assinatura anual (≈ 2 meses grátis). */
  priceYearlyBRL: number;
  /** AI credits per month. null = unlimited. */
  aiCreditsPerMonth: number | null;
  /** -1 = unlimited */
  maxProjects: number;
  /** Usuários inclusos (-1 = ilimitado). */
  maxUsers: number;
  /** Dispositivos IoT (Arduino/ESP32/CLP via gateway) inclusos. 0 = sem IoT. */
  maxIotDevices: number;
  realtime: boolean;
  features: string[];
}

/**
 * Tabela de preços aprovada em 2026-11-16 (pesquisa de mercado: software de
 * projeto elétrico BR R$ 100–150/mês; licenças CAD/estudos R$ 2–9 mil/ano;
 * plataforma IoT a partir de ~US$ 49/mês). IDs internos mantidos (já gravados
 * em tenants.plan e no Stripe); "basic" é exibido como "Autônomo".
 * Espelhada em `plan_limits` (migration 20261116150000) — teste garante paridade.
 */
export const SUBSCRIPTION_PLANS: Record<PlanId, SubscriptionPlan> = {
  free: {
    id: "free",
    name: "Grátis",
    audience: "Para conhecer a plataforma",
    priceBRL: 0,
    priceYearlyBRL: 0,
    aiCreditsPerMonth: 10,
    maxProjects: 3,
    maxUsers: 1,
    maxIotDevices: 0,
    realtime: false,
    features: ["3 projetos", "10 créditos de IA/mês", "Exportação PDF"],
  },
  basic: {
    id: "basic",
    name: "Autônomo",
    audience: "Profissional autônomo (pessoa física)",
    priceBRL: 119,
    priceYearlyBRL: 1190,
    aiCreditsPerMonth: 150,
    maxProjects: -1,
    maxUsers: 1,
    maxIotDevices: 0,
    realtime: false,
    features: [
      "Projetos ilimitados",
      "150 créditos de IA/mês",
      "Documentação EletricAI (bornes, cabos, referência cruzada)",
      "Catálogo próprio + busca em distribuidor",
      "Exportação PDF, DXF e Excel",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro Empresa",
    audience: "Integradoras e escritórios de engenharia",
    priceBRL: 349,
    priceYearlyBRL: 3490,
    aiCreditsPerMonth: 400,
    maxProjects: -1,
    maxUsers: 3,
    maxIotDevices: 10,
    realtime: true,
    features: [
      "Tudo do Autônomo",
      "Até 3 usuários com papéis",
      "400 créditos de IA/mês",
      "IoT em tempo real: até 10 dispositivos",
      "FB Electric Studio + supervisório SCADA",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    audience: "Indústrias e equipes maiores",
    priceBRL: 890,
    priceYearlyBRL: 8900,
    aiCreditsPerMonth: 1500,
    maxProjects: -1,
    maxUsers: 10,
    maxIotDevices: 50,
    realtime: true,
    features: [
      "Tudo do Pro Empresa",
      "Até 10 usuários",
      "1.500 créditos de IA/mês",
      "IoT em tempo real: até 50 dispositivos",
      "Suporte prioritário",
    ],
  },
};

/** Usuário adicional além do incluso no plano (cobrança manual por enquanto). */
export const EXTRA_USER_PRICE = { monthlyBRL: 79, yearlyBRL: 790 } as const;

/** Preço de lançamento: 30% por 12 meses para as primeiras 50 empresas pagantes. */
export const LAUNCH_OFFER = { discountPct: 30, slots: 50, months: 12 } as const;

/**
 * Valor a cobrar (BRL, 2 casas). Fonte ÚNICA usada no checkout e na
 * conferência do pagamento pelo webhook — nunca confie em valor vindo do cliente.
 */
export function planCharge(plan: PlanId, interval: BillingInterval, launch: boolean): number {
  const def = SUBSCRIPTION_PLANS[plan];
  const base = interval === "yearly" ? def.priceYearlyBRL : def.priceBRL;
  const value = launch ? base * (1 - LAUNCH_OFFER.discountPct / 100) : base;
  return Math.round(value * 100) / 100;
}

/** Duração paga por um pagamento avulso (Mercado Pago). */
export function periodEndFrom(start: Date, interval: BillingInterval): Date {
  const end = new Date(start.getTime());
  if (interval === "yearly") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

/** Economia do anual em relação a 12 mensalidades (em %). */
export function yearlySavingsPct(plan: PlanId): number {
  const def = SUBSCRIPTION_PLANS[plan];
  if (def.priceBRL <= 0) return 0;
  return Math.round((1 - def.priceYearlyBRL / (def.priceBRL * 12)) * 100);
}

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
