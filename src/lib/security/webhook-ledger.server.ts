// ELÉTRICAI INDUSTRIAL OS — TRANSACTIONAL WEBHOOK LEDGER & DB ASSERTION GUARD (SERVER-ONLY)
// Enforces explicit state machine (`RECEIVED` -> `PROCESSING` -> `PROCESSED` | `FAILED` | `RETRYABLE`),
// lease timeout recovery, idempotency, and strict Supabase write `{ error }` propagation.
// Uses PostgreSQL `SupabaseFleetStorageBackend` (`begin_webhook_event_atomic` / `complete_webhook_event_atomic`)
// in serverless Cloud and falls back to injected `SqliteFleetStorageBackend` in tests / single-node mode.

import { sha256Hex } from "./isomorphic-crypto";
import { logSecurityEvent } from "./security-audit-log.server";
import {
  ensurePersistentFleetRuntime,
  getCloudSupabaseFleetStore,
} from "../edge/fleet-runtime.server";
import type {
  AsyncFleetStorageBackend,
  FleetStorageBackend,
  WebhookLedgerEntry,
} from "../edge/types";

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
  asyncStore?: AsyncFleetStorageBackend;
  execute: () => Promise<void>;
  onRollbackReservation?: () => Promise<void>;
}): Promise<
  | { outcome: "PROCESSED"; statusCode: 200; entry: WebhookLedgerEntry }
  | { outcome: "DUPLICATE_PROCESSED"; statusCode: 200; entry: WebhookLedgerEntry }
  | { outcome: "IN_FLIGHT_CONFLICT"; statusCode: 409; entry: WebhookLedgerEntry }
> {
  const payloadHash = sha256Hex(params.rawPayload);
  const asyncStore = params.asyncStore ?? (params.store ? undefined : getCloudSupabaseFleetStore());
  const syncStore = asyncStore ? undefined : (params.store ?? ensurePersistentFleetRuntime());

  const lease = asyncStore
    ? await asyncStore.beginWebhookEvent({
        provider: params.provider,
        eventId: params.eventId,
        payloadHash,
        leaseMs: 30_000,
      })
    : syncStore!.beginWebhookEvent({
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
    if (asyncStore) {
      await asyncStore.completeWebhookEvent({
        provider: params.provider,
        eventId: params.eventId,
        state: "PROCESSED",
      });
    } else {
      syncStore!.completeWebhookEvent({
        provider: params.provider,
        eventId: params.eventId,
        state: "PROCESSED",
      });
    }
    const finalEntry = (asyncStore
      ? await asyncStore.getWebhookEvent(params.provider, params.eventId)
      : syncStore!.getWebhookEvent(params.provider, params.eventId)) ?? {
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
    const nonRetryable = message.includes("INVALID_PAYMENT_STATE_TRANSITION");
    const targetState = nonRetryable ? ("FAILED" as const) : ("RETRYABLE" as const);

    if (asyncStore) {
      await asyncStore.completeWebhookEvent({
        provider: params.provider,
        eventId: params.eventId,
        state: targetState,
        lastError: message.slice(0, 500),
      });
    } else {
      syncStore!.completeWebhookEvent({
        provider: params.provider,
        eventId: params.eventId,
        state: targetState,
        lastError: message.slice(0, 500),
      });
    }

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
      reason: `Webhook handler transition failed -> ${targetState} (${params.provider}:${params.eventId})`,
      metadata: {
        provider: params.provider,
        eventId: params.eventId,
        error: message,
      },
    });

    throw err;
  }
}
