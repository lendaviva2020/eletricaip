import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Stripe webhook receiver.
 * Verifies `Stripe-Signature` (HMAC-SHA256 over `${t}.${payload}`).
 * Handles: checkout.session.completed, customer.subscription.{created,updated,deleted},
 * invoice.{paid,payment_failed}.
 */
export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("not_configured", { status: 503 });

        const sig = request.headers.get("stripe-signature");
        if (!sig) return new Response("missing_signature", { status: 400 });

        const body = await request.text();
        const ok = await verifyStripeSig(body, sig, secret, 300);
        if (!ok) return new Response("invalid_signature", { status: 400 });

        const event = JSON.parse(body) as StripeEvent;

        // Idempotency: only short-circuit on actual duplicate-key violations.
        const { error: dupErr } = await supabaseAdmin
          .from("stripe_webhook_events")
          .insert({ event_id: event.id, event_type: event.type });
        if (dupErr) {
          const msg = String(dupErr.message ?? "").toLowerCase();
          const isDuplicate = msg.includes("duplicate") || (dupErr as { code?: string }).code === "23505";
          if (isDuplicate) return new Response("ok", { status: 200 });
          console.error("[stripe] insert event log failed", dupErr);
          return new Response("event_log_failed", { status: 500 });
        }

        try {
          await handleStripeEvent(event);
        } catch (e) {
          console.error("[stripe] handler error", e);
          return new Response("handler_error", { status: 500 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

async function handleStripeEvent(event: StripeEvent): Promise<void> {
  const obj = event.data.object as Record<string, unknown>;
  switch (event.type) {
    case "checkout.session.completed": {
      const tenantId = String(
        obj.client_reference_id ??
          (obj.metadata as Record<string, string> | undefined)?.tenant_id ??
          "",
      );
      const plan = String((obj.metadata as Record<string, string> | undefined)?.plan ?? "pro");
      const customerId = obj.customer ? String(obj.customer) : null;
      const subId = obj.subscription ? String(obj.subscription) : null;
      if (!tenantId) return;
      await supabaseAdmin
        .from("tenants")
        .update({
          plan,
          stripe_customer_id: customerId,
          stripe_subscription_id: subId,
          subscription_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);
      // Audit log skipped: requires user_id (webhook has no auth context).

      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const tenantId = String(
        (obj.metadata as Record<string, string> | undefined)?.tenant_id ?? "",
      );
      if (!tenantId) return;
      const status = String(obj.status ?? "active");
      const plan = String((obj.metadata as Record<string, string> | undefined)?.plan ?? "pro");
      const periodStart = obj.current_period_start
        ? new Date(Number(obj.current_period_start) * 1000).toISOString()
        : null;
      const periodEnd = obj.current_period_end
        ? new Date(Number(obj.current_period_end) * 1000).toISOString()
        : null;
      const subId = String(obj.id);

      await supabaseAdmin.from("subscriptions").upsert(
        {
          tenant_id: tenantId,
          stripe_subscription_id: subId,
          status,
          plan,
          current_period_start: periodStart,
          current_period_end: periodEnd,
        },
        { onConflict: "stripe_subscription_id" },
      );
      await supabaseAdmin
        .from("tenants")
        .update({
          plan: status === "active" || status === "trialing" ? plan : "free",
          subscription_status: status,
          stripe_subscription_id: subId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);
      break;
    }
    case "customer.subscription.deleted": {
      const tenantId = String(
        (obj.metadata as Record<string, string> | undefined)?.tenant_id ?? "",
      );
      const subId = String(obj.id);
      if (tenantId) {
        await supabaseAdmin
          .from("tenants")
          .update({
            plan: "free",
            subscription_status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", tenantId);
      }
      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("stripe_subscription_id", subId);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const tenantId = String(
        (obj.metadata as Record<string, string> | undefined)?.tenant_id ?? "",
      );
      if (!tenantId) return;
      await supabaseAdmin.from("invoices").upsert(
        {
          tenant_id: tenantId,
          stripe_invoice_id: String(obj.id),
          amount: Number(obj.amount_paid ?? obj.amount_due ?? 0),
          currency: String(obj.currency ?? "brl"),
          status: event.type === "invoice.paid" ? "paid" : "failed",
          pdf_url: obj.invoice_pdf ? String(obj.invoice_pdf) : null,
        },
        { onConflict: "stripe_invoice_id" },
      );
      break;
    }
  }
}

/** Verify Stripe webhook signature (v1 scheme). */
async function verifyStripeSig(
  payload: string,
  header: string,
  secret: string,
  toleranceSec: number,
): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, ...rest] = kv.split("=");
      return [k, rest.join("=")];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEq(expected, v1);
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
