import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PLATFORM_ADMIN_EMAILS = new Set(["989111474fe@gmail.com"]);

const PLAN_TO_STRIPE_ENV: Record<string, string> = {
  basic: "VITE_STRIPE_PRICE_BASIC_MONTHLY",
  pro: "VITE_STRIPE_PRICE_PRO_MONTHLY",
  premium: "VITE_STRIPE_PRICE_PREMIUM_MONTHLY",
};

const PLAN_PRICE_BRL: Record<string, number> = {
  free: 0,
  basic: 100,
  pro: 580,
  premium: 1000,
};

function originFromHeader(): string {
  try {
    return getRequestHeader("origin") || process.env.PUBLIC_APP_URL || "";
  } catch {
    return process.env.PUBLIC_APP_URL || "";
  }
}

async function isPlatformAdminUser(context: {
  userId: string;
  claims?: Record<string, unknown>;
}): Promise<boolean> {
  const email = String(context.claims?.email ?? "").trim().toLowerCase();

  const { data: adminFlag, error } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (adminFlag) return true;

  if (!PLATFORM_ADMIN_EMAILS.has(email)) return false;

  const { error: upsertError } = await supabaseAdmin.from("platform_admins").upsert(
    {
      user_id: context.userId,
      role: "admin",
      created_by: context.userId,
    },
    { onConflict: "user_id" },
  );
  if (upsertError) throw new Error(upsertError.message);

  return true;
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

    const [{ data: tenant }, { data: subs }, { data: invoices }, { data: usage }] =
      await Promise.all([
        supabase
          .from("tenants")
          .select("plan, stripe_customer_id, stripe_subscription_id, subscription_status")
          .eq("id", tenantId)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("invoices")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("usage_records")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("period", { ascending: false })
          .limit(1),
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

/** Manual plan change — platform-admin only (server-enforced via RPC). */
export const changePlanManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ plan: z.enum(["free", "basic", "pro", "premium"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    if (!(await isPlatformAdminUser({ userId, claims }))) throw new Error("forbidden");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.tenant_id) throw new Error("no_tenant");

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("plan")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    if (tenantError) throw new Error(tenantError.message);

    const oldPlan = (tenant?.plan ?? "free").toLowerCase();
    const oldPlanType = oldPlan === "premium" ? "INDUSTRIAL" : oldPlan === "basic" || oldPlan === "pro" ? "PRO" : "FREE";
    const newPlanType = data.plan === "premium" ? "INDUSTRIAL" : data.plan === "basic" || data.plan === "pro" ? "PRO" : "FREE";

    const { error: updateError } = await supabaseAdmin
      .from("tenants")
      .update({ plan: data.plan, updated_at: new Date().toISOString() })
      .eq("id", profile.tenant_id);
    if (updateError) throw new Error(updateError.message);

    const { error: auditError } = await supabaseAdmin.from("subscription_audit_log").insert({
      user_id: userId,
      action: "manual_change",
      old_plan_type: oldPlanType,
      new_plan_type: newPlanType,
      reason: "platform_admin_override",
    });
    if (auditError) throw new Error(auditError.message);

    return { tenant_id: profile.tenant_id, plan: data.plan };
  });

/** Returns whether the current user is a platform admin. */
export const getIsPlatformAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    return { isPlatformAdmin: await isPlatformAdminUser({ userId, claims }) };
  });

/**
 * Create a Stripe Checkout Session for the requested plan.
 * Requires STRIPE_SECRET_KEY + STRIPE_PRICE_PRO/PREMIUM secrets.
 */
export const createStripeCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ plan: z.enum(["basic", "pro", "premium"]) }).parse(input))
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
  .inputValidator((input) => z.object({ plan: z.enum(["basic", "pro", "premium"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
    if (!token)
      throw new Error(
        "billing_not_configured: missing MERCADO_PAGO_ACCESS_TOKEN / MP_ACCESS_TOKEN",
      );

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
        items: [
          {
            title: `EletricAI ${data.plan.toUpperCase()} — assinatura mensal`,
            quantity: 1,
            currency_id: "BRL",
            unit_price: price,
          },
        ],
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
