import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const PLAN_MAP: Record<string, string> = {
  basic: "basic",
  pro: "pro",
  premium: "premium",
};

/**
 * Constant-time string equality (hex). Evita timing oracle ao comparar
 * a assinatura HMAC-SHA256 esperada com o valor recebido.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const SIGNATURE_TOLERANCE_SEC = 300;

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<any | null> {
  const encoder = new TextEncoder();
  const parts = signature.split(",");
  let sigValue = "";
  let timestamp = "";
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (k === "v1") sigValue = v;
    if (k === "t") timestamp = v;
  }
  if (!sigValue || !timestamp) return null;

  // Replay protection: rejeita payload assinado há > tolerância.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return null;
  if (Math.abs(Date.now() / 1000 - ts) > SIGNATURE_TOLERANCE_SEC) return null;

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(`${timestamp}.${payload}`),
    );
    const expected = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (!timingSafeEqual(expected, sigValue)) return null;
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function getPlanFromPrice(priceId: string): string | null {
  const envVar = `STRIPE_PRICE_${priceId.toUpperCase()}`;
  return Deno.env.get(envVar) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("Missing stripe-signature", { status: 400, headers: corsHeaders });
    }

    const payload = await req.text();
    const event = await verifyStripeSignature(payload, signature, STRIPE_WEBHOOK_SECRET);
    if (!event) {
      return new Response("Invalid signature", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log(`[stripe-webhook] Event: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerId = session.customer;
        const subscriptionId = session.subscription;
        const plan = getPlanFromPrice(
          session.metadata?.price_id ?? session.line_items?.data?.[0]?.price?.id,
        );

        if (customerId && subscriptionId && plan) {
          const { error } = await supabase
            .from("tenants")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              plan,
              subscription_status: "active",
            })
            .eq("stripe_customer_id", customerId);

          if (error) console.error("[stripe-webhook] Update error:", error.message);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object;
        const status = sub.status;
        const items = sub.items?.data ?? [];
        const priceId = items[0]?.price?.id;
        const productName = items[0]?.price?.metadata?.plan_id ?? "";

        console.log(`[stripe-webhook] Subscription ${sub.id}: status=${status}, price=${priceId}`);

        const plan = PLAN_MAP[productName] ?? null;
        const dbStatus =
          status === "active" || status === "trialing"
            ? "active"
            : status === "past_due"
              ? "past_due"
              : status === "canceled"
                ? "canceled"
                : "inactive";

        const { error } = await supabase
          .from("tenants")
          .update({
            stripe_subscription_id: sub.id,
            plan: plan ?? undefined,
            subscription_status: dbStatus,
          })
          .eq("stripe_subscription_id", sub.id);

        if (error) console.error("[stripe-webhook] Sub update error:", error.message);
        break;
      }

      case "customer.subscription.deleted": {
        const deletedSub = event.data.object;
        const { error } = await supabase
          .from("tenants")
          .update({
            plan: "free",
            subscription_status: "canceled",
          })
          .eq("stripe_subscription_id", deletedSub.id);

        if (error) console.error("[stripe-webhook] Delete error:", error.message);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const invSubId = invoice.subscription;
        const amountPaid = invoice.amount_paid ?? 0;
        const currency = invoice.currency ?? "brl";
        const invoiceUrl = invoice.hosted_invoice_url ?? "";
        const invoicePdf = invoice.invoice_pdf ?? "";

        const { data: tenant } = await supabase
          .from("tenants")
          .select("id, stripe_customer_id, plan")
          .eq("stripe_subscription_id", invSubId)
          .maybeSingle();

        if (tenant) {
          const { error: invError } = await supabase.from("invoices").insert({
            tenant_id: tenant.id,
            stripe_invoice_id: invoice.id,
            amount: Math.round(amountPaid / 100),
            currency: currency.toUpperCase(),
            status: "paid",
            pdf_url: invoicePdf || invoiceUrl,
            created_at: new Date(invoice.created * 1000).toISOString(),
          });

          if (invError) console.error("[stripe-webhook] Invoice insert error:", invError.message);
        }
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[stripe-webhook] Fatal:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
