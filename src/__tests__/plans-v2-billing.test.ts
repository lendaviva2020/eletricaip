import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LAUNCH_OFFER,
  SUBSCRIPTION_PLANS,
  periodEndFrom,
  planCharge,
  yearlySavingsPct,
} from "@/lib/plans";
import { decideMpPlanPayment } from "@/lib/billing/mp-plan-payment";

const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

describe("tabela de preços aprovada (2026-11-16)", () => {
  it("valores mensais e anuais", () => {
    expect(SUBSCRIPTION_PLANS.basic).toMatchObject({
      name: "Autônomo",
      priceBRL: 119,
      priceYearlyBRL: 1190,
    });
    expect(SUBSCRIPTION_PLANS.pro).toMatchObject({
      name: "Pro Empresa",
      priceBRL: 349,
      priceYearlyBRL: 3490,
    });
    expect(SUBSCRIPTION_PLANS.premium).toMatchObject({ priceBRL: 890, priceYearlyBRL: 8900 });
  });

  it("anual ≈ 2 meses grátis (~17%)", () => {
    for (const id of ["basic", "pro", "premium"] as const) {
      expect(yearlySavingsPct(id)).toBe(17);
    }
  });

  it("nenhum plano pago tem IA ilimitada (custo real por chamada)", () => {
    for (const p of Object.values(SUBSCRIPTION_PLANS)) {
      expect(p.aiCreditsPerMonth, p.id).not.toBeNull();
    }
  });

  it("IoT só a partir do Pro Empresa, com limite de dispositivos", () => {
    expect(SUBSCRIPTION_PLANS.free.maxIotDevices).toBe(0);
    expect(SUBSCRIPTION_PLANS.basic.maxIotDevices).toBe(0);
    expect(SUBSCRIPTION_PLANS.pro.maxIotDevices).toBe(10);
    expect(SUBSCRIPTION_PLANS.premium.maxIotDevices).toBe(50);
  });

  it("preço de lançamento: 30%", () => {
    expect(LAUNCH_OFFER.discountPct).toBe(30);
    expect(planCharge("pro", "monthly", false)).toBe(349);
    expect(planCharge("pro", "monthly", true)).toBe(244.3);
    expect(planCharge("basic", "yearly", true)).toBe(833);
  });

  it("vencimento: +1 mês ou +1 ano", () => {
    const start = new Date("2026-01-31T12:00:00Z");
    expect(periodEndFrom(start, "yearly").toISOString()).toBe("2027-01-31T12:00:00.000Z");
    expect(periodEndFrom(new Date("2026-11-16T00:00:00Z"), "monthly").toISOString()).toBe(
      "2026-12-16T00:00:00.000Z",
    );
  });
});

describe("pagamento do Mercado Pago só libera o plano pelo valor certo", () => {
  const now = new Date("2026-11-16T10:00:00Z");

  it("aceita preço cheio e preço de lançamento; grava período anual", () => {
    const full = decideMpPlanPayment({
      metadata: { tenant_id: "t1", plan: "pro", interval: "yearly" },
      externalReference: "t1:pro:yearly",
      amountBRL: 3490,
      approvedAt: now,
    });
    expect(full).toMatchObject({ ok: true, plan: "pro", interval: "yearly" });
    if (full.ok) expect(full.periodEnd.toISOString()).toBe("2027-11-16T10:00:00.000Z");
    const launch = decideMpPlanPayment({
      metadata: { tenant_id: "t1", plan: "pro", interval: "monthly" },
      externalReference: null,
      amountBRL: 244.3,
      approvedAt: now,
    });
    expect(launch.ok).toBe(true);
  });

  it("recusa valor abaixo do preço (ex.: pagar o mensal e receber o anual)", () => {
    const r = decideMpPlanPayment({
      metadata: { tenant_id: "t1", plan: "premium", interval: "yearly" },
      externalReference: null,
      amountBRL: 890,
      approvedAt: now,
    });
    expect(r).toEqual({ ok: false, reason: "amount_below_price" });
  });

  it("recusa plano desconhecido e falta de empresa", () => {
    expect(
      decideMpPlanPayment({
        metadata: { tenant_id: "t1", plan: "enterprise" },
        externalReference: null,
        amountBRL: 9999,
        approvedAt: now,
      }),
    ).toEqual({ ok: false, reason: "unknown_plan" });
    expect(
      decideMpPlanPayment({
        metadata: { plan: "pro" },
        externalReference: "",
        amountBRL: 9999,
        approvedAt: now,
      }),
    ).toEqual({ ok: false, reason: "missing_tenant" });
  });

  it("webhook usa a decisão antes de mudar o plano e grava o vencimento", () => {
    const wh = read("../routes/api/public/mp.webhook.ts");
    const exec = wh.slice(wh.indexOf("execute: async () =>"));
    expect(exec.indexOf("decideMpPlanPayment")).toBeLessThan(
      exec.indexOf("apply_mp_payment_transition_atomic"),
    );
    expect(exec).toContain("recordMpSubscriptionPeriod");
  });
});

describe("limites no banco e no servidor", () => {
  const sql = read("../../supabase/migrations/20261116150000_plans_v2_iot_limits_expiry.sql");

  it("ingestão IoT recusa dispositivo NOVO acima do limite; função só service_role", () => {
    expect(sql).toContain("RAISE EXCEPTION 'device_limit'");
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ingest_iot_reading\([^)]*\)\s+TO service_role/,
    );
  });

  it("vencimento rebaixa após 3 dias e só service_role executa", () => {
    expect(sql).toContain("interval '3 days'");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.expire_overdue_subscriptions\(\) FROM PUBLIC, anon, authenticated/,
    );
  });

  it("trigger de usuários por plano em tenant_memberships", () => {
    expect(sql).toContain("BEFORE INSERT ON public.tenant_memberships");
    expect(sql).toContain("seat_limit");
  });

  it("convite confere usuários disponíveis antes de inserir", () => {
    const t = read("../lib/tenants.functions.ts");
    const fn = t.slice(t.indexOf("export const createInvite"));
    expect(fn.indexOf("assertSeatAvailable")).toBeLessThan(fn.indexOf('.from("invites")'));
  });

  it("cron de vencimento exige CRON_SECRET (503 sem configurar)", () => {
    const cron = read("../routes/api/public/cron.expire-subscriptions.ts");
    expect(cron).toContain("cron_not_configured");
    expect(cron).toContain("timingSafeEqual");
    const vercel = JSON.parse(read("../../vercel.json")) as { crons?: { path: string }[] };
    expect(vercel.crons?.some((c) => c.path === "/api/public/cron/expire-subscriptions")).toBe(
      true,
    );
  });
});
