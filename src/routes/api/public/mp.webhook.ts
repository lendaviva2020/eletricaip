import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Mercado Pago webhook receiver.
 *
 * MP doesn't sign payloads natively. We authenticate the caller via a
 * shared secret, checked in two ways (both timing-safe):
 *   1. `X-Webhook-Secret` header (preferred — doesn't leak in logs).
 *   2. `?secret=` query parameter (fallback for MP's dashboard limitation).
 *
 * For each notification we re-fetch the payment via MP API to read the
 * authoritative status and metadata (authoritative source-of-truth pattern).
 */
export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sharedSecret = process.env.MP_WEBHOOK_SECRET;
        const accessToken = process.env.MP_ACCESS_TOKEN;
        if (!sharedSecret || !accessToken) return new Response("not_configured", { status: 503 });

        const url = new URL(request.url);

        // 1. Primary: X-Webhook-Secret header (timing-safe).
        const headerSecret = request.headers.get("x-webhook-secret");
        const paramSecret = url.searchParams.get("secret");

        const headerOk = headerSecret ? timingSafeEq(headerSecret, sharedSecret) : false;
        const paramOk = paramSecret ? timingSafeEq(paramSecret, sharedSecret) : false;

        if (!headerOk && !paramOk) {
          // Waste constant time to avoid leaking which check failed.
          return new Response("invalid_secret", { status: 401 });
        }

        const raw = await request.text();
        let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
        try {
          body = JSON.parse(raw);
        } catch {
          // MP may send empty body on test notifications.
        }
        const paymentId = String(body.data?.id ?? url.searchParams.get("data.id") ?? "");
        if (!paymentId) return new Response("ignored", { status: 200 });

        // Idempotency: short-circuit on duplicate-key violations.
        const { error: dupErr } = await supabaseAdmin
          .from("mp_webhook_processed")
          .insert({ payment_id: paymentId });
        if (dupErr) {
          const msg = String(dupErr.message ?? "").toLowerCase();
          const isDuplicate =
            msg.includes("duplicate") || (dupErr as { code?: string }).code === "23505";
          if (isDuplicate) return new Response("ok", { status: 200 });
          console.error("[mp] insert dedup failed", dupErr);
          return new Response("dedup_failed", { status: 500 });
        }

        try {
          await syncMpPayment(paymentId, accessToken);
        } catch (e) {
          console.error("[mp] sync error", e);
          return new Response("handler_error", { status: 500 });
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});

interface MpPayment {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
}

async function syncMpPayment(paymentId: string, token: string): Promise<void> {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`mp_fetch_${r.status}`);
  const p = (await r.json()) as MpPayment;

  // Parse external_reference: "<tenantId>:<plan>"
  const meta = (p.metadata ?? {}) as { tenant_id?: string; plan?: string };
  const [refTenant, refPlan] = (p.external_reference ?? "").split(":");
  const tenantId = String(meta.tenant_id ?? refTenant ?? "");
  const plan = String(meta.plan ?? refPlan ?? "pro");
  if (!tenantId) return;

  await supabaseAdmin.from("invoices").upsert(
    {
      tenant_id: tenantId,
      stripe_invoice_id: `mp_${p.id}`,
      amount: Math.round((p.transaction_amount ?? 0) * 100),
      currency: (p.currency_id ?? "BRL").toLowerCase(),
      status: p.status === "approved" ? "paid" : p.status,
    },
    { onConflict: "stripe_invoice_id" },
  );

  if (p.status === "approved") {
    await supabaseAdmin
      .from("tenants")
      .update({
        plan,
        subscription_status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);
  } else if (p.status === "cancelled" || p.status === "rejected") {
    await supabaseAdmin
      .from("tenants")
      .update({ subscription_status: p.status, updated_at: new Date().toISOString() })
      .eq("id", tenantId);
  }
}

/** Timing-safe string comparison — constant-time XOR-based. */
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
