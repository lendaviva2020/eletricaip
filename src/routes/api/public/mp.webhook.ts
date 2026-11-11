import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "node:crypto";
import { logSecurityEvent } from "@/lib/security/security-audit-log.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Mercado Pago webhook receiver (hardened Gate 4.3).
 *
 * Authenticates via:
 *   1. Official `X-Signature` HMAC-SHA256 (`ts=<epoch>,v1=<hex>`) over
 *      `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` with 300s replay window.
 *   2. `X-Webhook-Secret` header (timing-safe).
 *
 * Query parameter `?secret=` is permanently rejected to avoid secret leakage in URLs/logs.
 * Deduplication tracks `${paymentId}:${payment.status}` so pending -> approved PIX transitions
 * are processed cleanly while true duplicate deliveries remain idempotent.
 */
export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sharedSecret = process.env.MP_WEBHOOK_SECRET;
        const accessToken = process.env.MP_ACCESS_TOKEN;
        if (!sharedSecret || !accessToken) return new Response("not_configured", { status: 503 });

        const url = new URL(request.url);
        const raw = await request.text();
        let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
        try {
          if (raw.trim().length > 0) body = JSON.parse(raw);
        } catch {
          return new Response("invalid_json", { status: 400 });
        }

        const rawPaymentId = String(body.data?.id ?? url.searchParams.get("data.id") ?? "").trim();

        const headerSecret = request.headers.get("x-webhook-secret");
        const headerOk = headerSecret ? timingSafeEq(headerSecret, sharedSecret) : false;

        const mpSig = request.headers.get("x-signature");
        const xRequestId = request.headers.get("x-request-id") ?? "";
        const hmacOk = mpSig
          ? verifyMpHmacSignature(mpSig, rawPaymentId, xRequestId, sharedSecret, 300)
          : false;

        if (!headerOk && !hmacOk) {
          logSecurityEvent({
            category: "WEBHOOK_SIGNATURE_FAILURE",
            severity: "WARNING",
            route: "/api/public/mp/webhook",
            reason: "Invalid MP webhook secret or x-signature HMAC",
          });
          return new Response("invalid_signature", { status: 401 });
        }

        if (!rawPaymentId) return new Response("ignored", { status: 200 });

        // Strict numeric validation stops path/URL manipulation against MP payments API
        if (!/^\d{1,32}$/.test(rawPaymentId)) {
          return new Response("invalid_payment_id", { status: 400 });
        }

        try {
          await syncMpPayment(rawPaymentId, accessToken);
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

function verifyMpHmacSignature(
  signatureHeader: string,
  dataId: string,
  xRequestId: string,
  secret: string,
  toleranceSec: number,
): boolean {
  let ts = "";
  let v1 = "";
  for (const part of signatureHeader.split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === "ts" && v) ts = v.trim();
    if (k === "v1" && v) v1 = v.trim().toLowerCase();
  }
  if (!ts || !v1 || !/^\d+$/.test(ts) || !/^[a-f0-9]{64}$/.test(v1)) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - Number(ts)) > toleranceSec) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex").toLowerCase();
  return timingSafeEq(expected, v1);
}

async function syncMpPayment(paymentId: string, token: string): Promise<void> {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`mp_fetch_${r.status}`);
  const p = (await r.json()) as MpPayment;

  const dedupKey = `${paymentId}:${p.status}`;
  const { error: dupErr } = await supabaseAdmin
    .from("mp_webhook_processed")
    .insert({ payment_id: dedupKey });
  if (dupErr) {
    const msg = String(dupErr.message ?? "").toLowerCase();
    const isDuplicate = msg.includes("duplicate") || (dupErr as { code?: string }).code === "23505";
    if (isDuplicate) return;
    throw new Error(`dedup_failed:${dupErr.message}`);
  }

  try {
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
  } catch (err) {
    // Allow MP retry if persistence failed after acquiring transition lock
    await supabaseAdmin.from("mp_webhook_processed").delete().eq("payment_id", dedupKey);
    throw err;
  }
}

/** Timing-safe string comparison — constant-time XOR-based. */
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
