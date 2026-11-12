import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FleetStorageBackend } from "@/lib/edge/types";
import {
  assertSupabaseWriteOk,
  runTransactionalWebhookHandler,
  type DbWriteResult,
} from "@/lib/security/webhook-ledger.server";

/**
 * Stripe webhook receiver (Gate 4.3.1 transactional state machine).
 * Verifies `Stripe-Signature` (HMAC-SHA256 over `${t}.${payload}`), tracks ledger states
 * (`RECEIVED -> PROCESSING -> PROCESSED | FAILED | RETRYABLE`), and fails closed (HTTP 500)
 * if ANY Supabase billing write fails.
 */
export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => processStripeWebhookRequest(request),
    },
  },
});

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface StripeWebhookDeps {
  adminClient?: typeof supabaseAdmin;
  store?: FleetStorageBackend;
  webhookSecret?: string;
}

export async function processStripeWebhookRequest(
  request: Request,
  deps?: StripeWebhookDeps,
): Promise<Response> {
  const secret = deps?.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("not_configured", { status: 503 });

  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("missing_signature", { status: 400 });

  const db = deps?.adminClient ?? supabaseAdmin;

  let body: string;
  let event: StripeEvent;
  try {
    body = await request.text();
    const ok = await verifyStripeSig(body, sig, secret, 300);
    if (!ok) return new Response("invalid_signature", { status: 400 });
    event = JSON.parse(body) as StripeEvent;
  } catch {
    return new Response("invalid_payload", { status: 400 });
  }

  if (!event?.id || !event?.type) {
    return new Response("invalid_payload", { status: 400 });
  }

  // Secondary Postgres idempotency reservation backed by unique PK constraint
  const { error: dupErr } = await db
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, event_type: event.type });

  if (dupErr) {
    const msg = String(dupErr.message ?? "").toLowerCase();
    const isDuplicate = msg.includes("duplicate") || (dupErr as { code?: string }).code === "23505";
    if (!isDuplicate) {
      console.error("[stripe] insert event log failed", dupErr);
      return new Response("event_log_failed", { status: 500 });
    }
    const existingLedger = deps?.store?.getWebhookEvent("stripe", event.id);
    if (!existingLedger || existingLedger.state === "PROCESSED") {
      return new Response("ok", { status: 200 });
    }
  }

  try {
    const res = await runTransactionalWebhookHandler({
      provider: "stripe",
      eventId: event.id,
      rawPayload: body,
      route: "/api/public/stripe/webhook",
      store: deps?.store,
      execute: async () => handleStripeEvent(event, db),
      onRollbackReservation: async () => {
        await db.from("stripe_webhook_events").delete().eq("event_id", event.id);
      },
    });

    if (res.statusCode === 409) {
      return new Response("in_flight_conflict", { status: 409 });
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("[stripe] transactional handler error", e);
    return new Response("handler_error", { status: 500 });
  }
}

async function handleStripeEvent(event: StripeEvent, db: typeof supabaseAdmin): Promise<void> {
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

      const tenantRes = (await db
        .from("tenants")
        .update({
          plan,
          stripe_customer_id: customerId,
          stripe_subscription_id: subId,
          subscription_status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId)) as DbWriteResult;
      assertSupabaseWriteOk(tenantRes, "tenants.update(checkout.session.completed)");
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

      const subRes = (await db.from("subscriptions").upsert(
        {
          tenant_id: tenantId,
          stripe_subscription_id: subId,
          status,
          plan,
          current_period_start: periodStart,
          current_period_end: periodEnd,
        },
        { onConflict: "stripe_subscription_id" },
      )) as DbWriteResult;
      assertSupabaseWriteOk(subRes, "subscriptions.upsert(subscription.updated)");

      const tenantRes = (await db
        .from("tenants")
        .update({
          plan: status === "active" || status === "trialing" ? plan : "free",
          subscription_status: status,
          stripe_subscription_id: subId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId)) as DbWriteResult;
      assertSupabaseWriteOk(tenantRes, "tenants.update(subscription.updated)");
      break;
    }
    case "customer.subscription.deleted": {
      const tenantId = String(
        (obj.metadata as Record<string, string> | undefined)?.tenant_id ?? "",
      );
      const subId = String(obj.id);
      if (tenantId) {
        const tenantRes = (await db
          .from("tenants")
          .update({
            plan: "free",
            subscription_status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", tenantId)) as DbWriteResult;
        assertSupabaseWriteOk(tenantRes, "tenants.update(subscription.deleted)");
      }
      const subRes = (await db
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("stripe_subscription_id", subId)) as DbWriteResult;
      assertSupabaseWriteOk(subRes, "subscriptions.update(subscription.deleted)");
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const tenantId = String(
        (obj.metadata as Record<string, string> | undefined)?.tenant_id ?? "",
      );
      if (!tenantId) return;
      const invRes = (await db.from("invoices").upsert(
        {
          tenant_id: tenantId,
          stripe_invoice_id: String(obj.id),
          amount: Number(obj.amount_paid ?? obj.amount_due ?? 0),
          currency: String(obj.currency ?? "brl"),
          status: event.type === "invoice.paid" ? "paid" : "failed",
          pdf_url: obj.invoice_pdf ? String(obj.invoice_pdf) : null,
        },
        { onConflict: "stripe_invoice_id" },
      )) as DbWriteResult;
      assertSupabaseWriteOk(invRes, "invoices.upsert(invoice.event)");
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
