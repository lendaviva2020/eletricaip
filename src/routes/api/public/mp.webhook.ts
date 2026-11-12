import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "node:crypto";
import { logSecurityEvent } from "@/lib/security/security-audit-log.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { AsyncFleetStorageBackend, FleetStorageBackend } from "@/lib/edge/types";
import {
  assertSupabaseWriteOk,
  runTransactionalWebhookHandler,
  type DbWriteResult,
} from "@/lib/security/webhook-ledger.server";

const ALLOWED_MP_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set([
    "pending",
    "in_process",
    "in_mediation",
    "authorized",
    "approved",
    "rejected",
    "cancelled",
  ]),
  in_process: new Set(["in_process", "authorized", "approved", "rejected", "cancelled"]),
  in_mediation: new Set(["in_mediation", "approved", "rejected", "cancelled"]),
  authorized: new Set(["authorized", "approved", "rejected", "cancelled"]),
  approved: new Set(["approved", "refunded", "charged_back", "cancelled"]),
  rejected: new Set(["rejected"]),
  cancelled: new Set(["cancelled"]),
  refunded: new Set(["refunded"]),
  charged_back: new Set(["charged_back"]),
};

export function isValidMpStatusTransition(
  previousStatus: string | null | undefined,
  nextStatus: string,
): boolean {
  if (!previousStatus) return true;
  const allowed = ALLOWED_MP_TRANSITIONS[previousStatus.toLowerCase()];
  if (!allowed) return previousStatus.toLowerCase() === nextStatus.toLowerCase();
  return allowed.has(nextStatus.toLowerCase());
}

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
  asyncStore?: AsyncFleetStorageBackend;
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
      deps?.asyncStore,
      deps?.fetchImpl ?? fetch,
    );
    if (outcome === "IN_FLIGHT") {
      return new Response("in_flight_conflict", { status: 409 });
    }
    if (outcome === "INVALID_TRANSITION") {
      return new Response("invalid_state_transition", { status: 409 });
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
  asyncStore: AsyncFleetStorageBackend | undefined,
  fetchImpl: typeof fetch,
): Promise<"PROCESSED" | "DUPLICATE" | "IN_FLIGHT" | "INVALID_TRANSITION"> {
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
    const existingLedger = asyncStore
      ? await asyncStore.getWebhookEvent("mercadopago", dedupKey)
      : store?.getWebhookEvent("mercadopago", dedupKey);
    if (!existingLedger || existingLedger.state === "PROCESSED") {
      return "DUPLICATE";
    }
  }

  let invalidTransitionDetected = false;
  try {
    const res = await runTransactionalWebhookHandler({
      provider: "mercadopago",
      eventId: dedupKey,
      rawPayload: rawPayload || dedupKey,
      route: "/api/public/mp/webhook",
      store,
      asyncStore,
      onRollbackReservation: async () => {
        await db.from("mp_webhook_processed").delete().eq("payment_id", dedupKey);
      },
      execute: async () => {
        const meta = (p.metadata ?? {}) as { tenant_id?: string; plan?: string };
        const [refTenant, refPlan] = (p.external_reference ?? "").split(":");
        const tenantId = String(meta.tenant_id ?? refTenant ?? "");
        const plan = String(meta.plan ?? refPlan ?? "pro");
        if (!tenantId) return;

        const amountCents = Math.round((p.transaction_amount ?? 0) * 100);
        const currency = (p.currency_id ?? "BRL").toLowerCase();

        // When backed by live PostgreSQL (migration 20261112120000), execute atomic multi-table transition RPC
        const maybeRpc = (
          db as unknown as {
            rpc?: (
              fn: string,
              args: Record<string, unknown>,
            ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
          }
        ).rpc;
        if (typeof maybeRpc === "function") {
          const rpcRes = await maybeRpc.call(db, "apply_mp_payment_transition_atomic", {
            p_external_payment_id: String(p.id),
            p_tenant_id: tenantId,
            p_next_status: p.status,
            p_plan: plan,
            p_amount_cents: amountCents,
            p_currency: currency,
          });
          assertSupabaseWriteOk(rpcRes, "rpc.apply_mp_payment_transition_atomic");
          const rows = Array.isArray(rpcRes.data)
            ? (rpcRes.data as Array<Record<string, unknown>>)
            : rpcRes.data
              ? [rpcRes.data as Record<string, unknown>]
              : [];
          const first = rows[0];
          if (first && first["applied"] === false) {
            invalidTransitionDetected = true;
            throw new Error(
              `INVALID_PAYMENT_STATE_TRANSITION: ${String(first["previous_status"] ?? "unknown")} -> ${p.status}`,
            );
          }
          return;
        }

        // Fallback for unit-test client mocks without `.rpc`: enforce status transition against prior invoice if readable
        const invoicesTable = db.from("invoices") as unknown as {
          select?: (cols: string) => {
            eq: (
              col: string,
              val: unknown,
            ) => {
              maybeSingle: () => Promise<{
                data: { status?: string } | null;
                error: { message?: string; code?: string } | null;
              }>;
            };
          };
        };
        if (typeof invoicesTable.select === "function") {
          const existingInv = await invoicesTable
            .select("status")
            .eq("stripe_invoice_id", `mp_${p.id}`)
            .maybeSingle();
          const prevMapped =
            existingInv.data?.status === "paid" ? "approved" : existingInv.data?.status;
          if (!isValidMpStatusTransition(prevMapped, p.status)) {
            invalidTransitionDetected = true;
            throw new Error(`INVALID_PAYMENT_STATE_TRANSITION: ${prevMapped} -> ${p.status}`);
          }
        }

        const invRes = (await db.from("invoices").upsert(
          {
            tenant_id: tenantId,
            stripe_invoice_id: `mp_${p.id}`,
            amount: amountCents,
            currency,
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
        } else if (
          p.status === "cancelled" ||
          p.status === "rejected" ||
          p.status === "refunded" ||
          p.status === "charged_back"
        ) {
          const tenantRes = (await db
            .from("tenants")
            .update({
              ...(p.status === "refunded" || p.status === "charged_back" ? { plan: "free" } : {}),
              subscription_status: p.status,
              updated_at: new Date().toISOString(),
            })
            .eq("id", tenantId)) as DbWriteResult;
          assertSupabaseWriteOk(tenantRes, `tenants.update(mp.${p.status})`);
        }
      },
    });

    if (res.statusCode === 409) return "IN_FLIGHT";
    if (res.outcome === "DUPLICATE_PROCESSED") return "DUPLICATE";
    return "PROCESSED";
  } catch (err) {
    if (invalidTransitionDetected) return "INVALID_TRANSITION";
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
