import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLAN_TO_STRIPE_ENV: Record<string, string> = {
  pro: "STRIPE_PRICE_PRO",
  premium: "STRIPE_PRICE_PREMIUM",
};

const PLAN_PRICE_BRL: Record<string, number> = {
  basico: 49,
  pro: 149,
  premium: 299,
};

function originFromHeader(): string {
  // Origin header is normally available; fallback to env.
  try {
    // dynamic import inside server context only
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRequestHeader } = require("@tanstack/react-start/server") as typeof import("@tanstack/react-start/server");
    return getRequestHeader("origin") || process.env.PUBLIC_APP_URL || "";
  } catch {
    return process.env.PUBLIC_APP_URL || "";
  }
}

/** Read current billing snapshot for the active tenant. */
export const getBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) throw new Error("no_tenant");

    const [{ data: tenant }, { data: subs }, { data: invoices }, { data: usage }] = await Promise.all([
      supabase.from("tenants").select("plan, stripe_customer_id, stripe_subscription_id, subscription_status").eq("id", tenantId).maybeSingle(),
      supabase.from("subscriptions").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(5),
      supabase.from("invoices").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(10),
      supabase.from("usage_records").select("*").eq("tenant_id", tenantId).order("period", { ascending: false }).limit(1),
    ]);

    return {
      tenantId,
      plan: tenant?.plan ?? "free",
      stripeCustomerId: tenant?.stripe_customer_id ?? null,
      subscriptionStatus: tenant?.subscription_status ?? null,
      subscriptions: subs ?? [],
      invoices: invoices ?? [],
      usage: usage?.[0] ?? null,
    };
  });

/** Manual plan change (admin override; production flow uses webhooks). */
export const changePlanManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ plan: z.enum(["free", "pro", "premium"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error, data: res } = await context.supabase.rpc("change_tenant_plan", { p_plan: data.plan });
    if (error) throw new Error(error.message);
    return res as { tenant_id: string; plan: string };
  });

/**
 * Create a Stripe Checkout Session for the requested plan.
 * Requires STRIPE_SECRET_KEY + STRIPE_PRICE_PRO/PREMIUM secrets.
 */
export const createStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ plan: z.enum(["pro", "premium"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new Error("billing_not_configured: missing STRIPE_SECRET_KEY");
    const priceEnv = PLAN_TO_STRIPE_ENV[data.plan];
    const priceId = process.env[priceEnv];
    if (!priceId) throw new Error(`billing_not_configured: missing ${priceEnv}`);

    const { supabase, userId, claims } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) throw new Error("no_tenant");

    const origin = originFromHeader() || "https://app.lovable.dev";
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("success_url", `${origin}/settings/billing?checkout=success`);
    params.set("cancel_url", `${origin}/settings/billing?checkout=cancel`);
    params.set("client_reference_id", tenantId);
    params.set("customer_email", String(claims.email ?? ""));
    params.set("metadata[tenant_id]", tenantId);
    params.set("metadata[plan]", data.plan);
    params.set("subscription_data[metadata][tenant_id]", tenantId);
    params.set("subscription_data[metadata][plan]", data.plan);

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const json = (await r.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!r.ok || !json.url) throw new Error(json.error?.message ?? "stripe_checkout_failed");
    return { url: json.url, sessionId: json.id };
  });

/**
 * Create a Mercado Pago Preference for the requested plan (one-shot recurring).
 * Requires MP_ACCESS_TOKEN secret.
 */
export const createMpPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ plan: z.enum(["pro", "premium"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const token = process.env.MP_ACCESS_TOKEN;
    if (!token) throw new Error("billing_not_configured: missing MP_ACCESS_TOKEN");

    const { supabase, userId, claims } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) throw new Error("no_tenant");

    const origin = originFromHeader() || "https://app.lovable.dev";
    const price = PLAN_PRICE_BRL[data.plan];

    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{
          title: `EletricAI ${data.plan.toUpperCase()} — assinatura mensal`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: price,
        }],
        payer: { email: String(claims.email ?? "") },
        external_reference: `${tenantId}:${data.plan}`,
        metadata: { tenant_id: tenantId, plan: data.plan },
        back_urls: {
          success: `${origin}/settings/billing?mp=success`,
          failure: `${origin}/settings/billing?mp=failure`,
          pending: `${origin}/settings/billing?mp=pending`,
        },
        auto_return: "approved",
        notification_url: `${origin}/api/public/mp/webhook`,
      }),
    });
    const json = (await r.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
      message?: string;
    };
    if (!r.ok || !(json.init_point || json.sandbox_init_point)) {
      throw new Error(json.message ?? "mp_preference_failed");
    }
    return {
      url: json.init_point ?? json.sandbox_init_point!,
      preferenceId: json.id,
    };
  });

/** Cancel current Stripe subscription (sets cancel_at_period_end=true). */
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new Error("billing_not_configured: missing STRIPE_SECRET_KEY");

    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profile?.tenant_id;
    if (!tenantId) throw new Error("no_tenant");

    const { data: tenant } = await supabase
      .from("tenants")
      .select("stripe_subscription_id")
      .eq("id", tenantId)
      .maybeSingle();
    const subId = tenant?.stripe_subscription_id;
    if (!subId) throw new Error("no_active_subscription");

    const params = new URLSearchParams({ cancel_at_period_end: "true" });
    const r = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!r.ok) {
      const j = (await r.json()) as { error?: { message?: string } };
      throw new Error(j.error?.message ?? "stripe_cancel_failed");
    }
    return { ok: true };
  });
