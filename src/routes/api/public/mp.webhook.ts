import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "node:crypto";
import { logSecurityEvent } from "@/lib/security/security-audit-log.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FleetStorageBackend } from "@/lib/edge/types";
import {
  assertSupabaseWriteOk,
  runTransactionalWebhookHandler,
  type DbWriteResult,
} from "@/lib/security/webhook-ledger.server";

/**
 * Mercado Pago webhook receiver (hardened Gate 4.3.1).
 *
 * Authenticates via:
 *   1. Official `X-Signature` HMAC-SHA256 (`ts=<epoch>,v1=<hex>`) over
 *      `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` with 300s replay window.
 *   2. `X-Webhook-Secret` header (timing-safe).
 *
 * Wraps status transitions (`${paymentId}:${payment.status}`) in a transactional webhook ledger
 * and asserts every Supabase mutation succeeds cleanly or returns HTTP 500 for retry.
 */
export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => processMpWebhookRequest(request),
    },
  },
});

export interface MpPayment {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
}

export interface MpWebhookDeps {
  adminClient?: typeof supabaseAdmin;
  store?: FleetStorageBackend;
  sharedSecret?: string;
  accessToken?: string;
  fetchImpl?: typeof fetch;
}

export async function processMpWebhookRequest(
  request: Request,
  deps?: MpWebhookDeps,
): Promise<Response> {
  const sharedSecret = deps?.sharedSecret ?? process.env.MP_WEBHOOK_SECRET;
  const accessToken = deps?.accessToken ?? process.env.MP_ACCESS_TOKEN;
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
    const outcome = await syncMpPayment(
      rawPaymentId,
      accessToken,
      raw,
      deps?.adminClient ?? supabaseAdmin,
      deps?.store,
      deps?.fetchImpl ?? fetch,
    );
    if (outcome === "IN_FLIGHT") {
      return new Response("in_flight_conflict", { status: 409 });
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("[mp] sync error", e);
    return new Response("handler_error", { status: 500 });
  }
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

async function syncMpPayment(
  paymentId: string,
  token: string,
  rawPayload: string,
  db: typeof supabaseAdmin,
  store: FleetStorageBackend | undefined,
  fetchImpl: typeof fetch,
): Promise<"PROCESSED" | "DUPLICATE" | "IN_FLIGHT"> {
  const r = await fetchImpl(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`mp_fetch_${r.status}`);
  const p = (await r.json()) as MpPayment;

  const dedupKey = `${paymentId}:${p.status}`;
  const { error: dupErr } = await db.from("mp_webhook_processed").insert({ payment_id: dedupKey });

  if (dupErr) {
    const msg = String(dupErr.message ?? "").toLowerCase();
    const isDuplicate = msg.includes("duplicate") || (dupErr as { code?: string }).code === "23505";
    if (!isDuplicate) {
      throw new Error(`dedup_failed:${dupErr.message}`);
    }
    const existingLedger = store?.getWebhookEvent("mercadopago", dedupKey);
    if (!existingLedger || existingLedger.state === "PROCESSED") {
      return "DUPLICATE";
    }
  }

  const res = await runTransactionalWebhookHandler({
    provider: "mercadopago",
    eventId: dedupKey,
    rawPayload: rawPayload || dedupKey,
    route: "/api/public/mp/webhook",
    store,
    onRollbackReservation: async () => {
      await db.from("mp_webhook_processed").delete().eq("payment_id", dedupKey);
    },
    execute: async () => {
      const meta = (p.metadata ?? {}) as { tenant_id?: string; plan?: string };
      const [refTenant, refPlan] = (p.external_reference ?? "").split(":");
      const tenantId = String(meta.tenant_id ?? refTenant ?? "");
      const plan = String(meta.plan ?? refPlan ?? "pro");
      if (!tenantId) return;

      const invRes = (await db.from("invoices").upsert(
        {
          tenant_id: tenantId,
          stripe_invoice_id: `mp_${p.id}`,
          amount: Math.round((p.transaction_amount ?? 0) * 100),
          currency: (p.currency_id ?? "BRL").toLowerCase(),
          status: p.status === "approved" ? "paid" : p.status,
        },
        { onConflict: "stripe_invoice_id" },
      )) as DbWriteResult;
      assertSupabaseWriteOk(invRes, "invoices.upsert(mp)");

      if (p.status === "approved") {
        const tenantRes = (await db
          .from("tenants")
          .update({
            plan,
            subscription_status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("id", tenantId)) as DbWriteResult;
        assertSupabaseWriteOk(tenantRes, "tenants.update(mp.approved)");
      } else if (p.status === "cancelled" || p.status === "rejected") {
        const tenantRes = (await db
          .from("tenants")
          .update({ subscription_status: p.status, updated_at: new Date().toISOString() })
          .eq("id", tenantId)) as DbWriteResult;
        assertSupabaseWriteOk(tenantRes, `tenants.update(mp.${p.status})`);
      }
    },
  });

  if (res.statusCode === 409) return "IN_FLIGHT";
  if (res.outcome === "DUPLICATE_PROCESSED") return "DUPLICATE";
  return "PROCESSED";
}

/** Timing-safe string comparison — constant-time XOR-based. */
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
