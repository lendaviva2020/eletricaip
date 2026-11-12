// ELÉTRICAI INDUSTRIAL OS — TRANSACTIONAL WEBHOOK LEDGER & DB ASSERTION GUARD (SERVER-ONLY)
// Enforces explicit state machine (`RECEIVED` -> `PROCESSING` -> `PROCESSED` | `FAILED` | `RETRYABLE`),
// lease timeout recovery, idempotency, and strict Supabase write `{ error }` propagation.

import { sha256Hex } from "./isomorphic-crypto";
import { logSecurityEvent } from "./security-audit-log.server";
import { ensurePersistentFleetRuntime } from "../edge/fleet-runtime.server";
import type { FleetStorageBackend, WebhookLedgerEntry } from "../edge/types";

export interface DbWriteResult {
  error: { message?: string; code?: string } | null;
}

/**
 * Throws an explicit Error whenever ANY Supabase mutation fails so webhooks NEVER
 * silently swallow database errors and wrongly return HTTP 200 to payment providers.
 */
export function assertSupabaseWriteOk(res: DbWriteResult, operation: string): void {
  if (res.error) {
    throw new Error(
      `WEBHOOK_DB_WRITE_FAILED[${operation}]: ${res.error.message || res.error.code || "unknown_db_error"}`,
    );
  }
}

export async function runTransactionalWebhookHandler(params: {
  provider: "stripe" | "mercadopago";
  eventId: string;
  rawPayload: string;
  route: string;
  store?: FleetStorageBackend;
  execute: () => Promise<void>;
  onRollbackReservation?: () => Promise<void>;
}): Promise<
  | { outcome: "PROCESSED"; statusCode: 200; entry: WebhookLedgerEntry }
  | { outcome: "DUPLICATE_PROCESSED"; statusCode: 200; entry: WebhookLedgerEntry }
  | { outcome: "IN_FLIGHT_CONFLICT"; statusCode: 409; entry: WebhookLedgerEntry }
> {
  const store = params.store ?? ensurePersistentFleetRuntime();
  const payloadHash = sha256Hex(params.rawPayload);

  const lease = store.beginWebhookEvent({
    provider: params.provider,
    eventId: params.eventId,
    payloadHash,
    leaseMs: 30_000,
  });

  if (lease.status === "ALREADY_PROCESSED") {
    return {
      outcome: "DUPLICATE_PROCESSED",
      statusCode: 200,
      entry: lease.entry,
    };
  }

  if (lease.status === "IN_FLIGHT") {
    return {
      outcome: "IN_FLIGHT_CONFLICT",
      statusCode: 409,
      entry: lease.entry,
    };
  }

  try {
    await params.execute();
    store.completeWebhookEvent({
      provider: params.provider,
      eventId: params.eventId,
      state: "PROCESSED",
    });
    const finalEntry = store.getWebhookEvent(params.provider, params.eventId) ?? {
      ...lease.entry,
      state: "PROCESSED" as const,
    };
    return {
      outcome: "PROCESSED",
      statusCode: 200,
      entry: finalEntry,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.completeWebhookEvent({
      provider: params.provider,
      eventId: params.eventId,
      state: "RETRYABLE",
      lastError: message.slice(0, 500),
    });

    if (params.onRollbackReservation) {
      try {
        await params.onRollbackReservation();
      } catch (rbErr) {
        console.error("[webhook-ledger] reservation rollback error", rbErr);
      }
    }

    logSecurityEvent({
      category: "WEBHOOK_SIGNATURE_FAILURE",
      severity: "WARNING",
      route: params.route,
      reason: `Webhook handler transition failed -> RETRYABLE (${params.provider}:${params.eventId})`,
      metadata: {
        provider: params.provider,
        eventId: params.eventId,
        error: message,
      },
    });

    throw err;
  }
}
