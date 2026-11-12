// ELÉTRICAI INDUSTRIAL OS — GATE 4.3.1 SECURITY & ARCHITECTURE REGRESSION SUITE
// Part 3: Fail-Closed Multi-Tenant Gateway AuthZ (Zero Fallback) & Transactional Webhook Ledger

import { describe, expect, it, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createSqliteFleetStorage } from "@/lib/edge/fleet-persistent-store.server";
import {
  executeProposeRemoteConfig,
  executeRollbackRemoteConfig,
  executeRevokeGatewayCertificate,
  executeTriggerSignedUpdate,
  executeAcknowledgeFleetAuditEvent,
} from "@/lib/edge/fleet-handlers.server";
import { remoteConfigManager } from "@/lib/edge/remote-config";
import { fleetAuditManager } from "@/lib/edge/fleet-audit";
import { ensurePersistentFleetRuntime } from "@/lib/edge/fleet-runtime.server";
import { processStripeWebhookRequest } from "@/routes/api/public/stripe.webhook";
import { processMpWebhookRequest } from "@/routes/api/public/mp.webhook";
import { SignedUpdateManager } from "@/lib/edge/signed-updates";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "eletricai-gate431-wh-"));

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

function makeFleetUserCtx(params: {
  userId: string;
  tenantId: string;
  role: string;
  platformRole?: string;
}) {
  return {
    userId: params.userId,
    claims: {
      email: `${params.userId}@eletricai.test`,
      tenant_id: params.tenantId,
      platform_role: params.platformRole,
      authorized_plant_ids: ["plant_ete_central", "plant_usina_rj"],
    },
    supabase: {
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { tenant_id: params.tenantId },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "tenant_memberships") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { role: params.role },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    },
  };
}

function makeStripeSignature(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

function makeFakeWebhookSupabase(options?: {
  failTable?: "tenants" | "subscriptions" | "invoices";
  existingDuplicates?: Set<string>;
}) {
  const insertedEvents = options?.existingDuplicates ?? new Set<string>();
  const ops: string[] = [];

  const mockAdmin: any = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        const key = String(row["event_id"] ?? row["payment_id"] ?? "");
        if (insertedEvents.has(key)) {
          return {
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          };
        }
        insertedEvents.add(key);
        ops.push(`insert:${table}:${key}`);
        return { error: null };
      },
      update: () => ({
        eq: async (_col: string, val: string) => {
          ops.push(`update:${table}:${val}`);
          if (options?.failTable === table) {
            return { error: { message: `simulated DB failure on ${table}` } };
          }
          return { error: null };
        },
      }),
      upsert: async () => {
        ops.push(`upsert:${table}`);
        if (options?.failTable === table) {
          return { error: { message: `simulated DB upsert failure on ${table}` } };
        }
        return { error: null };
      },
      delete: () => ({
        eq: async (_col: string, val: string) => {
          insertedEvents.delete(val);
          ops.push(`delete:${table}:${val}`);
          return { error: null };
        },
      }),
    }),
  };

  return { mockAdmin, ops, insertedEvents };
}

describe("Gate 4.3.1 — Multi-Tenant Gateway AuthZ (Zero Client Fallback) & Transactional Webhooks", () => {
  it("Fail-closed 404 when gatewayId does not exist — ignores client-supplied organizationId/plantId", async () => {
    const adminA = makeFleetUserCtx({
      userId: "usr_ten_a_404",
      tenantId: "org_sp_industrial",
      role: "admin",
    });

    const dummyCfg = {
      ...remoteConfigManager.getActiveConfig("gw_lab_ete_01")!,
      gatewayId: "gw_nonexistent_spoof",
      configVersion: 2,
    };

    // Even when client spoofs its own organizationId & plantId, missing gateway MUST throw HTTP 404
    let caughtPropose: any;
    try {
      await executeProposeRemoteConfig(
        {
          config: dummyCfg,
          organizationId: "org_sp_industrial",
          plantId: "plant_ete_central",
        },
        adminA,
      );
    } catch (e) {
      caughtPropose = e;
    }
    expect(caughtPropose).toBeInstanceOf(Response);
    expect(caughtPropose.status).toBe(404);

    let caughtRollback: any;
    try {
      await executeRollbackRemoteConfig(
        {
          gatewayId: "gw_nonexistent_spoof",
          organizationId: "org_sp_industrial",
          plantId: "plant_ete_central",
        },
        adminA,
      );
    } catch (e) {
      caughtRollback = e;
    }
    expect(caughtRollback).toBeInstanceOf(Response);
    expect(caughtRollback.status).toBe(404);

    let caughtRevoke: any;
    try {
      await executeRevokeGatewayCertificate(
        {
          gatewayId: "gw_nonexistent_spoof",
          reason: "spoof test",
          organizationId: "org_sp_industrial",
          plantId: "plant_ete_central",
        },
        adminA,
      );
    } catch (e) {
      caughtRevoke = e;
    }
    expect(caughtRevoke).toBeInstanceOf(Response);
    expect(caughtRevoke.status).toBe(404);
  });

  it("Fail-closed 403 on cross-tenant mutation against existing gateway (even when payload claims attacker tenant)", async () => {
    const adminB = makeFleetUserCtx({
      userId: "usr_attacker_b",
      tenantId: "org_rj_siderurgia",
      role: "owner",
    });

    const spoofedCfg = {
      ...remoteConfigManager.getActiveConfig("gw_lab_ete_01")!,
      gatewayId: "gw_lab_ete_01", // Belongs to org_sp_industrial!
      configVersion: 99,
    };

    let caughtCrossTenant: any;
    try {
      await executeProposeRemoteConfig(
        {
          config: spoofedCfg,
          organizationId: "org_rj_siderurgia", // Attacker tries to spoof fallback
          plantId: "plant_usina_rj",
        },
        adminB,
      );
    } catch (e) {
      caughtCrossTenant = e;
    }
    expect(caughtCrossTenant).toBeInstanceOf(Response);
    expect(caughtCrossTenant.status).toBe(403);

    const releaseKeys = SignedUpdateManager.generateReleaseKeyPair("test-ota-k1");
    let caughtUpdate: any;
    try {
      await executeTriggerSignedUpdate(
        {
          gatewayId: "gw_lab_ete_01",
          manifest: {
            packageId: "evil-pkg",
            targetVersion: "2.0.0",
            targetArch: "x86_64",
            sha256: "b".repeat(64),
            signature: "c".repeat(88),
            keyId: releaseKeys.keyId,
            releaseNotes: "cross-tenant test",
            minGatewayVersion: "1.0.0",
          },
        },
        adminB,
      );
    } catch (e) {
      caughtUpdate = e;
    }
    expect(caughtUpdate).toBeInstanceOf(Response);
    expect(caughtUpdate.status).toBe(403);
  });

  it("Maps unknown tenant membership roles cleanly to VIEWER least privilege & handles append-only audit acknowledgement RPC", async () => {
    ensurePersistentFleetRuntime();
    const unknownRoleCtx = makeFleetUserCtx({
      userId: "usr_unknown_role",
      tenantId: "org_sp_industrial",
      role: "super_custom_untrusted_role",
    });

    // VIEWER cannot propose remote config -> FleetAuthorizationError (403)
    const cfg = {
      ...remoteConfigManager.getActiveConfig("gw_lab_ete_01")!,
      configVersion: 10,
    };
    await expect(executeProposeRemoteConfig({ config: cfg }, unknownRoleCtx)).rejects.toThrow(
      /RBAC_DENIED/,
    );

    // Authorized auditor can acknowledge an audit event via append-only GATEWAY_EVENT_ACKNOWLEDGED RPC
    const ev = fleetAuditManager.recordEvent({
      actor: { id: "usr_ops", email: "ops@sp.com", role: "TENANT_ADMIN" },
      source: "ADMIN_CONSOLE",
      gatewayId: "gw_lab_ete_01",
      plantId: "plant_ete_central",
      organizationId: "org_sp_industrial",
      eventType: "CONFIG_TEST_EVENT",
      severity: "INFO",
      result: "SUCCESS",
    });
    const hashBefore = ev.tamperProofHash;

    const auditorCtx = makeFleetUserCtx({
      userId: "usr_auditor_sp",
      tenantId: "org_sp_industrial",
      role: "auditor",
    });
    const ackRes = await executeAcknowledgeFleetAuditEvent({ eventId: ev.id }, auditorCtx);
    expect(ackRes.success).toBe(true);
    expect(ackRes.acknowledgementEvent.eventType).toBe("GATEWAY_EVENT_ACKNOWLEDGED");
    expect(ackRes.acknowledgementEvent.details["acknowledgedEventId"]).toBe(ev.id);
    expect(ev.tamperProofHash).toBe(hashBefore);
    expect(fleetAuditManager.verifyAuditChainIntegrity().isValid).toBe(true);
  });

  it("Stripe webhook rejects silently swallowed DB errors (returns HTTP 500 + RETRYABLE) and recovers idempotently on retry", async () => {
    const dbPath = path.join(TMP_DIR, "stripe-webhook-ledger.sqlite");
    const store = createSqliteFleetStorage(dbPath);
    const secret = "whsec_test_stripe_gate431";

    const payload = JSON.stringify({
      id: "evt_stripe_retry_001",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "tenant_sp_1",
          metadata: { tenant_id: "tenant_sp_1", plan: "pro" },
          customer: "cus_123",
          subscription: "sub_123",
        },
      },
    });

    // Attempt 1: Supabase fails updating `tenants` -> MUST return HTTP 500 + mark RETRYABLE + roll back Postgres reservation
    const failingMock = makeFakeWebhookSupabase({ failTable: "tenants" });
    const req1 = new Request("https://eletricai.test/api/public/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": makeStripeSignature(payload, secret),
      },
      body: payload,
    });
    const res1 = await processStripeWebhookRequest(req1, {
      adminClient: failingMock.mockAdmin,
      store,
      webhookSecret: secret,
    });
    expect(res1.status).toBe(500);
    expect(store.getWebhookEvent("stripe", "evt_stripe_retry_001")?.state).toBe("RETRYABLE");
    expect(failingMock.insertedEvents.has("evt_stripe_retry_001")).toBe(false);

    // Attempt 2: Supabase healthy -> retries cleanly, advances attempts=2 -> PROCESSED (HTTP 200)
    const healthyMock = makeFakeWebhookSupabase();
    const req2 = new Request("https://eletricai.test/api/public/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": makeStripeSignature(payload, secret),
      },
      body: payload,
    });
    const res2 = await processStripeWebhookRequest(req2, {
      adminClient: healthyMock.mockAdmin,
      store,
      webhookSecret: secret,
    });
    expect(res2.status).toBe(200);
    const processedEntry = store.getWebhookEvent("stripe", "evt_stripe_retry_001");
    expect(processedEntry?.state).toBe("PROCESSED");
    expect(processedEntry?.attempts).toBe(2);

    // Attempt 3: Duplicate event returns HTTP 200 idempotently WITHOUT invoking downstream updates
    const countBeforeDup = healthyMock.ops.length;
    const req3 = new Request("https://eletricai.test/api/public/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": makeStripeSignature(payload, secret),
      },
      body: payload,
    });
    const res3 = await processStripeWebhookRequest(req3, {
      adminClient: healthyMock.mockAdmin,
      store,
      webhookSecret: secret,
    });
    expect(res3.status).toBe(200);
    expect(healthyMock.ops.length).toBe(countBeforeDup);

    store.close();
  });

  it("Mercado Pago webhook fails closed (HTTP 500 + RETRYABLE) when invoices upsert returns DB error and recovers on retry", async () => {
    const dbPath = path.join(TMP_DIR, "mp-webhook-ledger.sqlite");
    const store = createSqliteFleetStorage(dbPath);
    const sharedSecret = "mp_secret_gate431";

    const fakeFetch: any = async () => ({
      ok: true,
      json: async () => ({
        id: 987654321,
        status: "approved",
        transaction_amount: 199.9,
        currency_id: "BRL",
        external_reference: "tenant_mp_1:pro",
      }),
    });

    const failingMock = makeFakeWebhookSupabase({ failTable: "invoices" });
    const reqFail = new Request("https://eletricai.test/api/public/mp/webhook", {
      method: "POST",
      headers: { "x-webhook-secret": sharedSecret, "content-type": "application/json" },
      body: JSON.stringify({ data: { id: "987654321" } }),
    });
    const resFail = await processMpWebhookRequest(reqFail, {
      adminClient: failingMock.mockAdmin,
      store,
      sharedSecret,
      accessToken: "mp_tok_test",
      fetchImpl: fakeFetch,
    });
    expect(resFail.status).toBe(500);
    expect(store.getWebhookEvent("mercadopago", "987654321:approved")?.state).toBe("RETRYABLE");

    const healthyMock = makeFakeWebhookSupabase();
    const reqOk = new Request("https://eletricai.test/api/public/mp/webhook", {
      method: "POST",
      headers: { "x-webhook-secret": sharedSecret, "content-type": "application/json" },
      body: JSON.stringify({ data: { id: "987654321" } }),
    });
    const resOk = await processMpWebhookRequest(reqOk, {
      adminClient: healthyMock.mockAdmin,
      store,
      sharedSecret,
      accessToken: "mp_tok_test",
      fetchImpl: fakeFetch,
    });
    expect(resOk.status).toBe(200);
    expect(store.getWebhookEvent("mercadopago", "987654321:approved")?.state).toBe("PROCESSED");

    store.close();
  });

  it("Supabase Edge stripe-webhook throws on DB write errors and never swallows failures", () => {
    const edgeWebhookPath = path.resolve(
      __dirname,
      "../../supabase/functions/stripe-webhook/index.ts",
    );
    const src = fs.readFileSync(edgeWebhookPath, "utf8");
    expect(src).toContain("throw new Error(`stripe_checkout_update_failed:");
    expect(src).toContain("throw new Error(`stripe_subscription_update_failed:");
    expect(src).toContain("throw new Error(`stripe_invoice_upsert_failed:");
    expect(src).toContain("stripe_webhook_events");
  });
});
