// ELÉTRICAI INDUSTRIAL OS — GATE 4.3.2 COMPREHENSIVE VERIFICATION SUITE
// Covers: Multi-instance Cloud persistence (SupabaseFleetStorageBackend + atomic RPCs),
// WAL cross-container cache invalidation, fail-closed Cloud serverless persistence enforcement,
// Ed25519 key rotation/revocation, transactional webhook state machine + MP transition checks,
// Modbus MBAP binary framing & Sparkplug ACL hardening, loopback Supabase guard & SQL RPC audit.

import { afterEach, describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  createSqliteFleetStorage,
  type SqliteFleetStorageBackend,
} from "@/lib/edge/fleet-persistent-store.server";
import {
  SupabaseFleetStorageBackend,
  toNullableTenantUuid,
  type SupabaseAdminClientLike,
} from "@/lib/edge/fleet-supabase-store.server";
import {
  createIsolatedPersistentFleetContainer,
  ensurePersistentFleetRuntime,
  getFleetStorageBackendMode,
  resetFleetRuntimeForTesting,
  withCloudFleetRuntimeAsync,
} from "@/lib/edge/fleet-runtime.server";
import {
  executeAcknowledgeFleetAuditEvent,
  executeGetFleetAuditLogs,
  executeGetFleetGateways,
  executePostGatewayHeartbeat,
  executeProposeRemoteConfig,
  executeRevokeGatewayCertificate,
} from "@/lib/edge/fleet-handlers.server";
import { EdgeProvisioningService } from "@/lib/edge/provisioning";
import { RemoteConfigManager } from "@/lib/edge/remote-config";
import { SignedUpdateManager } from "@/lib/edge/signed-updates";
import { ModbusTcpClientDriver } from "@/lib/edge/drivers/modbus-driver";
import { SparkplugBDriver } from "@/lib/edge/drivers/sparkplug-driver";
import {
  IS_PHYSICAL_CONTROL_ALLOWED,
  PROTOCOL_LAYER_CLASSIFICATION,
} from "@/lib/edge/protocol-classification";
import type { FleetAuditEvent, OutboxSampleEntry, RemoteConfigPayload } from "@/lib/edge/types";
import { processMpWebhookRequest, isValidMpStatusTransition } from "@/routes/api/public/mp.webhook";
import { processStripeWebhookRequest } from "@/routes/api/public/stripe.webhook";
import { assertSupabaseProject, SupabaseConfigError } from "@/integrations/supabase/env";

const TMP_DIRS: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TMP_DIRS.push(dir);
  return dir;
}

afterEach(() => {
  resetFleetRuntimeForTesting();
  for (const dir of TMP_DIRS.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * In-process PostgreSQL + PostgREST relational contract harness backed by SQLite,
 * enforcing the exact table schemas, unique constraints, and atomic RPC semantics
 * defined in migrations `20261111180000` & `20261112120000`.
 */
function createPgContractClientHarness(backingPath: string = ":memory:"): {
  client: SupabaseAdminClientLike;
  rawSqlite: SqliteFleetStorageBackend;
  billingState: {
    tenants: Map<string, Record<string, unknown>>;
    invoices: Map<string, Record<string, unknown>>;
    subscriptions: Map<string, Record<string, unknown>>;
    mpState: Map<string, { status: string; plan: string }>;
    stripeEvents: Set<string>;
    mpProcessed: Set<string>;
    failInvoiceWrite: boolean;
  };
} {
  const backing = createSqliteFleetStorage(backingPath);
  const billingState = {
    tenants: new Map<string, Record<string, unknown>>(),
    invoices: new Map<string, Record<string, unknown>>(),
    subscriptions: new Map<string, Record<string, unknown>>(),
    mpState: new Map<string, { status: string; plan: string }>(),
    stripeEvents: new Set<string>(),
    mpProcessed: new Set<string>(),
    failInvoiceWrite: false,
  };
  const challenges = new Map<string, number>();

  const makeTableQuery = (table: string) => {
    const filters: Array<{ col: string; val: unknown }> = [];
    let orderCol: string | undefined;
    let orderAsc = true;

    const executeSelect = (): Array<Record<string, unknown>> => {
      if (table === "fleet_audit_chain") {
        return backing.loadAuditEvents().map((e, idx) => ({
          seq: idx + 1,
          id: e.id,
          event_json: e,
        }));
      }
      if (table === "fleet_registered_gateways") {
        let rows = backing.loadRegisteredGateways().map((r) => ({
          gateway_id: r.gateway.gatewayId,
          organization_id: r.gateway.organizationId,
          payload_json: r.gateway,
          auth_token_digest: r.authTokenDigest ?? null,
          last_batch_sequence: r.lastBatchSequence,
        }));
        for (const f of filters) {
          rows = rows.filter((r) => (r as Record<string, unknown>)[f.col] === f.val);
        }
        return rows;
      }
      if (table === "fleet_gateways") {
        let rows = backing.loadFleetGateways().map((g) => ({
          gateway_id: g.gatewayId,
          payload_json: g,
        }));
        for (const f of filters) {
          rows = rows.filter((r) => (r as Record<string, unknown>)[f.col] === f.val);
        }
        return rows;
      }
      if (table === "gateway_certificates") {
        return backing.loadCertificates().map((c) => ({
          gateway_id: c.gatewayId,
          cert_json: c.cert,
          pop_public_key: c.popKey ?? null,
        }));
      }
      if (table === "gateway_certificate_challenges") {
        const keyFilter = filters.find((f) => f.col === "challenge_key")?.val as string | undefined;
        if (!keyFilter) return [];
        const exp = challenges.get(keyFilter);
        return exp !== undefined
          ? [{ challenge_key: keyFilter, expires_at: new Date(exp).toISOString() }]
          : [];
      }
      if (table === "remote_configs") {
        const all = backing.loadRemoteConfigs();
        const rows: Array<Record<string, unknown>> = [];
        for (const [gwId, entry] of Object.entries(all)) {
          for (const cfg of entry.history) {
            rows.push({
              gateway_id: gwId,
              config_version: cfg.configVersion,
              is_lkgc: entry.lkgc?.configVersion === cfg.configVersion,
              payload_json: cfg,
            });
          }
        }
        if (orderCol === "config_version") {
          rows.sort((a, b) =>
            orderAsc
              ? Number(a["config_version"]) - Number(b["config_version"])
              : Number(b["config_version"]) - Number(a["config_version"]),
          );
        }
        return rows;
      }
      if (table === "ota_campaigns") {
        return Object.entries(backing.loadOtaCampaigns()).map(([id, cmp]) => ({
          campaign_id: id,
          payload_json: cmp,
        }));
      }
      if (table === "ota_applied_packages") {
        const idFilter = String(filters.find((f) => f.col === "id")?.val ?? "");
        const [gwId, pkgId, ver] = idFilter.split(":");
        return gwId && pkgId && ver && backing.hasAppliedOtaVersion(gwId, pkgId, ver)
          ? [{ id: idFilter }]
          : [];
      }
      if (table === "ota_signing_keys") {
        return backing.loadOtaSigningKeys().map((k) => ({
          key_id: k.keyId,
          public_key_pem: k.publicKeyPem,
          status: k.status,
          revoked_reason: k.revokedReason ?? null,
          revoked_at: k.revokedAt ?? null,
        }));
      }
      if (table === "provisioning_tokens") {
        return backing.loadProvisioningState().tokens.map((t) => ({ payload_json: t }));
      }
      if (table === "provisioning_station_bindings") {
        const s = backing.loadProvisioningState().provisionedStations;
        return Object.entries(s).map(([station_key, gateway_id]) => ({ station_key, gateway_id }));
      }
      if (table === "edge_ingested_dedup") {
        const keyFilter = String(filters.find((f) => f.col === "dedup_key")?.val ?? "");
        return backing.hasIngestDedupKey(keyFilter) ? [{ dedup_key: keyFilter }] : [];
      }
      if (table === "fleet_latest_telemetry") {
        const gwFilter = String(filters.find((f) => f.col === "gateway_id")?.val ?? "");
        return backing.loadLatestTelemetryForGateway(gwFilter).map((s) => ({
          gateway_id: s.gatewayId,
          tag_name: s.tagName,
          sample_json: s,
          source_timestamp: s.sourceTimestamp,
        }));
      }
      if (table === "webhook_processing_ledger") {
        const provider = filters.find((f) => f.col === "provider")?.val as
          "stripe" | "mercadopago" | undefined;
        const eventId = String(filters.find((f) => f.col === "event_id")?.val ?? "");
        if (!provider || !eventId) return [];
        const entry = backing.getWebhookEvent(provider, eventId);
        return entry
          ? [
              {
                provider: entry.provider,
                event_id: entry.eventId,
                state: entry.state,
                payload_hash: entry.payloadHash,
                attempts: entry.attempts,
                locked_until: entry.lockedUntil ? new Date(entry.lockedUntil).toISOString() : null,
                last_error: entry.lastError ?? null,
                updated_at: entry.updatedAt,
              },
            ]
          : [];
      }
      return [];
    };

    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        filters.push({ col, val });
        return builder;
      },
      gt: () => builder,
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderCol = col;
        orderAsc = opts?.ascending ?? true;
        return builder;
      },
      limit: () => builder,
      maybeSingle: async () => {
        const rows = executeSelect();
        return { data: rows[0] ?? null, error: null };
      },
      then: <T1, T2>(
        onfulfilled?:
          | ((v: { data: Array<Record<string, unknown>>; error: null }) => T1 | PromiseLike<T1>)
          | null,
        onrejected?: ((r: unknown) => T2 | PromiseLike<T2>) | null,
      ) => Promise.resolve({ data: executeSelect(), error: null }).then(onfulfilled, onrejected),
      insert: async (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const row = Array.isArray(values) ? values[0] : values;
        if (table === "stripe_webhook_events") {
          const eid = String(row["event_id"]);
          if (billingState.stripeEvents.has(eid)) {
            return { data: null, error: { code: "23505", message: "duplicate key value" } };
          }
          billingState.stripeEvents.add(eid);
          return { data: row, error: null };
        }
        if (table === "mp_webhook_processed") {
          const pid = String(row["payment_id"]);
          if (billingState.mpProcessed.has(pid)) {
            return { data: null, error: { code: "23505", message: "duplicate key value" } };
          }
          billingState.mpProcessed.add(pid);
          return { data: row, error: null };
        }
        if (table === "gateway_certificate_challenges") {
          const key = String(row["challenge_key"]);
          const existing = challenges.get(key);
          if (existing && existing > Date.now()) {
            return { data: null, error: { code: "23505", message: "duplicate challenge" } };
          }
          challenges.set(key, Date.parse(String(row["expires_at"])));
          return { data: row, error: null };
        }
        return { data: row, error: null };
      },
      upsert: async (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const row = Array.isArray(values) ? values[0] : values;
        if (table === "fleet_registered_gateways") {
          backing.saveRegisteredGateway(
            row["payload_json"] as Parameters<typeof backing.saveRegisteredGateway>[0],
            typeof row["auth_token_digest"] === "string" ? row["auth_token_digest"] : undefined,
            Number(row["last_batch_sequence"] ?? 0),
          );
        } else if (table === "fleet_gateways") {
          backing.saveFleetGateway(
            row["payload_json"] as Parameters<typeof backing.saveFleetGateway>[0],
          );
        } else if (table === "gateway_certificates") {
          backing.saveCertificate(
            String(row["gateway_id"]),
            row["cert_json"] as Parameters<typeof backing.saveCertificate>[1],
            typeof row["pop_public_key"] === "string" ? row["pop_public_key"] : undefined,
          );
        } else if (table === "ota_campaigns") {
          backing.saveOtaCampaign(
            String(row["campaign_id"]),
            String(row["organization_id"]),
            String(row["plant_id"]),
            row["payload_json"],
          );
        } else if (table === "ota_applied_packages") {
          backing.recordAppliedOtaVersion(
            String(row["gateway_id"]),
            String(row["package_id"]),
            String(row["target_version"]),
            String(row["manifest_hash"]),
          );
        } else if (table === "ota_signing_keys") {
          backing.saveOtaSigningKey({
            keyId: String(row["key_id"]),
            publicKeyPem: String(row["public_key_pem"]),
            status: row["status"] === "REVOKED" ? "REVOKED" : "ACTIVE",
            revokedReason:
              typeof row["revoked_reason"] === "string" ? row["revoked_reason"] : undefined,
            revokedAt: typeof row["revoked_at"] === "string" ? row["revoked_at"] : undefined,
          });
        } else if (table === "provisioning_tokens") {
          backing.saveProvisioningToken(
            row["payload_json"] as Parameters<typeof backing.saveProvisioningToken>[0],
          );
        } else if (table === "invoices") {
          if (billingState.failInvoiceWrite) {
            return { data: null, error: { code: "53300", message: "PG connection pool failure" } };
          }
          billingState.invoices.set(String(row["stripe_invoice_id"]), row);
        } else if (table === "subscriptions") {
          billingState.subscriptions.set(String(row["stripe_subscription_id"]), row);
        }
        return { data: row, error: null };
      },
      update: (values: Record<string, unknown>) => ({
        eq: async (col: string, val: unknown) => {
          if (table === "remote_configs" && col === "id" && values["is_lkgc"] === true) {
            const [gwId, verStr] = String(val).split(":");
            const history = backing.loadRemoteConfigs()[gwId]?.history ?? [];
            const found = history.find((h) => h.configVersion === Number(verStr));
            if (found) backing.setLkgcConfig(gwId, found);
          } else if (table === "tenants" && col === "id") {
            const prev = billingState.tenants.get(String(val)) ?? { id: val };
            billingState.tenants.set(String(val), { ...prev, ...values });
          }
          return { data: null, error: null };
        },
      }),
      delete: () => ({
        eq: async (_col: string, val: unknown) => {
          if (table === "stripe_webhook_events") {
            billingState.stripeEvents.delete(String(val));
          } else if (table === "mp_webhook_processed") {
            billingState.mpProcessed.delete(String(val));
          } else if (table === "gateway_certificate_challenges") {
            challenges.delete(String(val));
          }
          return { data: null, error: null };
        },
      }),
    };

    return builder;
  };

  const client: SupabaseAdminClientLike = {
    from: (table: string) =>
      makeTableQuery(table) as unknown as ReturnType<SupabaseAdminClientLike["from"]>,
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      if (fn === "append_fleet_audit_event_atomic") {
        const ev = args["p_event_json"] as FleetAuditEvent;
        const expectedPrev = String(args["p_previous_hash"]);
        const events = backing.loadAuditEvents();
        const tip =
          events.length > 0
            ? events[events.length - 1].tamperProofHash
            : "GENESIS_FLEET_AUDIT_BLOCK_00000000000000000000000000000000";
        if (tip !== expectedPrev) {
          return { data: [{ seq: null, accepted: false, current_tip_hash: tip }], error: null };
        }
        backing.appendAuditEvent(ev, expectedPrev);
        return {
          data: [{ seq: events.length + 1, accepted: true, current_tip_hash: ev.tamperProofHash }],
          error: null,
        };
      }
      if (fn === "claim_provisioning_token_atomic") {
        const res = backing.claimProvisioningTokenAtomic({
          tokenHash: String(args["p_token_hash"]),
          consumedAt: Date.parse(String(args["p_consumed_at"])),
          stationKey: String(args["p_station_key"]),
          gatewayId: String(args["p_gateway_id"]),
          authTokenDigest: String(args["p_auth_token_digest"]),
        });
        if (res.claimed) {
          backing.saveRegisteredGateway(
            args["p_gateway_payload"] as Parameters<typeof backing.saveRegisteredGateway>[0],
            String(args["p_auth_token_digest"]),
            0,
          );
        }
        return { data: [res], error: null };
      }
      if (fn === "record_ingested_batch_atomic") {
        const res = backing.recordIngestedBatchAtomic({
          gatewayId: String(args["p_gateway_id"]),
          organizationId: String(args["p_organization_id"]),
          plantId: String(args["p_plant_id"]),
          expectedMinSequence: Number(args["p_expected_min_sequence"]),
          newSequence: Number(args["p_new_sequence"]),
          acceptedSamples: (args["p_samples"] as OutboxSampleEntry[]) ?? [],
          dedupKeys: (args["p_dedup_keys"] as string[]) ?? [],
        });
        return { data: [res], error: null };
      }
      if (fn === "append_remote_config_monotonic_atomic") {
        const ok = backing.appendRemoteConfigMonotonic(
          String(args["p_gateway_id"]),
          args["p_payload"] as RemoteConfigPayload,
        );
        return { data: ok, error: null };
      }
      if (fn === "begin_webhook_event_atomic") {
        const res = backing.beginWebhookEvent({
          provider: args["p_provider"] as "stripe" | "mercadopago",
          eventId: String(args["p_event_id"]),
          payloadHash: String(args["p_payload_hash"]),
          leaseMs: Number(args["p_lease_ms"] ?? 30_000),
        });
        return {
          data: [
            {
              lease_status: res.status,
              provider: res.entry.provider,
              event_id: res.entry.eventId,
              state: res.entry.state,
              payload_hash: res.entry.payloadHash,
              attempts: res.entry.attempts,
              locked_until: res.entry.lockedUntil
                ? new Date(res.entry.lockedUntil).toISOString()
                : null,
              last_error: res.entry.lastError ?? null,
              updated_at: res.entry.updatedAt,
            },
          ],
          error: null,
        };
      }
      if (fn === "complete_webhook_event_atomic") {
        backing.completeWebhookEvent({
          provider: args["p_provider"] as "stripe" | "mercadopago",
          eventId: String(args["p_event_id"]),
          state: args["p_state"] as "PROCESSED" | "FAILED" | "RETRYABLE",
          lastError: typeof args["p_last_error"] === "string" ? args["p_last_error"] : undefined,
        });
        return { data: null, error: null };
      }
      if (fn === "apply_mp_payment_transition_atomic") {
        if (billingState.failInvoiceWrite) {
          return {
            data: null,
            error: { code: "40001", message: "simulated PG serialization write failure" },
          };
        }
        const payId = String(args["p_external_payment_id"]);
        const tenantId = String(args["p_tenant_id"]);
        const nextStatus = String(args["p_next_status"]);
        const plan = String(args["p_plan"]);
        const prev = billingState.mpState.get(payId)?.status;
        if (!isValidMpStatusTransition(prev, nextStatus)) {
          return {
            data: [
              {
                applied: false,
                previous_status: prev ?? null,
                reason: "INVALID_PAYMENT_STATE_TRANSITION",
              },
            ],
            error: null,
          };
        }
        billingState.mpState.set(payId, { status: nextStatus, plan });
        billingState.invoices.set(`mp_${payId}`, {
          tenant_id: tenantId,
          stripe_invoice_id: `mp_${payId}`,
          amount: args["p_amount_cents"],
          currency: args["p_currency"],
          status: nextStatus === "approved" ? "paid" : nextStatus,
        });
        if (nextStatus === "approved") {
          billingState.tenants.set(tenantId, { plan, subscription_status: "active" });
        } else if (nextStatus === "refunded" || nextStatus === "charged_back") {
          billingState.tenants.set(tenantId, { plan: "free", subscription_status: nextStatus });
        } else if (nextStatus === "rejected" || nextStatus === "cancelled") {
          const prevTenant = billingState.tenants.get(tenantId) ?? { plan: "free" };
          billingState.tenants.set(tenantId, { ...prevTenant, subscription_status: nextStatus });
        }
        return {
          data: [{ applied: true, previous_status: prev ?? null, reason: null }],
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${fn}`);
    },
  };

  return { client, rawSqlite: backing, billingState };
}

function makeActorCtx(orgId: string, role: string, plantIds: string[] = ["plant_ete_central"]) {
  return {
    userId: `usr_${orgId}_${role}`,
    claims: {
      email: `${role}@eletricai.test`,
      tenant_id: orgId,
      authorized_plant_ids: plantIds,
    },
    supabase: {
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { tenant_id: orgId }, error: null }),
              }),
            }),
          };
        }
        if (table === "tenant_memberships") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { role }, error: null }),
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

function makeMpSignedRequest(paymentId: string, secret: string, bodyObj: object = {}): Request {
  const ts = Math.floor(Date.now() / 1000);
  const reqId = `req_${paymentId}_${ts}`;
  const manifest = `id:${paymentId};request-id:${reqId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return new Request("https://app.eletricai.local/api/public/mp/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": `ts=${ts},v1=${v1}`,
      "x-request-id": reqId,
    },
    body: JSON.stringify({ data: { id: paymentId }, ...bodyObj }),
  });
}

describe("Gate 4.3.2 — Cloud Multi-Instance Persistence, Atomic RPCs & Production Readiness", () => {
  it("maps only valid UUIDs to tenant_id FK and returns null for string lab orgs", () => {
    expect(toNullableTenantUuid("org_sp_industrial")).toBeNull();
    expect(toNullableTenantUuid("00000000-0000-4000-8000-000000000001")).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("propagates gateway revocation, config bumps, and audit acknowledgements across Cloud instances via SupabaseFleetStorageBackend", async () => {
    const pg = createPgContractClientHarness();
    const cloudStore = new SupabaseFleetStorageBackend(pg.client);
    const signingSecret = "gate-4-3-2-config-secret";
    const ownerCtx = makeActorCtx("org_sp_industrial", "owner");

    // Seed gateway credential into Cloud store via Instance A
    await withCloudFleetRuntimeAsync(
      cloudStore,
      async ({ registry, fleetManager, auditManager }) => {
        const gw = registry.getGateway("gw_lab_ete_01")!;
        registry.registerGateway(gw, "egw_secret_token_alpha");
        expect(fleetManager.getGateway("gw_lab_ete_01")?.operationalState).toBeDefined();
        auditManager.recordEvent({
          actor: { id: "usr_a", email: "a@eletricai.test", role: "TENANT_ADMIN" },
          source: "CLOUD_SERVER",
          gatewayId: "gw_lab_ete_01",
          plantId: "plant_ete_central",
          organizationId: "org_sp_industrial",
          eventType: "GATEWAY_BOOT_VERIFIED",
          severity: "INFO",
          result: "SUCCESS",
        });
      },
      { configSigningSecret: signingSecret },
    );

    // Instance B accepts valid credential initially
    const hbOk = await executePostGatewayHeartbeat(
      {
        gatewayId: "gw_lab_ete_01",
        authToken: "egw_secret_token_alpha",
        telemetry: {
          cpuUsagePercent: 12,
          memoryUsagePercent: 30,
          diskUsagePercent: 25,
          walSizeBytes: 1024,
          pendingSamplesCount: 2,
          maxCapacityBytes: 10_000_000,
          oldestSampleTimestampMs: null,
          isDegraded: false,
        },
      },
      { cloudStore },
    );
    expect(hbOk.success).toBe(true);

    // Instance A applies Remote Config v2
    const cfgMgr = new RemoteConfigManager({ signingSecret });
    const baseCfg: Omit<RemoteConfigPayload, "signature"> = {
      configVersion: 2,
      gatewayId: "gw_lab_ete_01",
      author: "owner@eletricai.test",
      timestamp: Date.now(),
      scanRateMs: 500,
      authorizedEndpoints: ["opc.tcp://192.168.1.10:4840"],
      enabledTags: ["ETE.BOMBA01.CORRENTE"],
      readProtocols: { opcua: { endpoint: "opc.tcp://192.168.1.10:4840", enabled: true } },
      bufferLimits: {
        maxSamples: 50000,
        maxDiskMb: 512,
        saturationPolicy: "DROP_OLDEST_NON_CRITICAL",
      },
      retentionPolicy: { maxAgeHours: 72 },
      observability: { metricsIntervalMs: 5000, logLevel: "INFO" },
    };
    const signedV2: RemoteConfigPayload = {
      ...baseCfg,
      signature: cfgMgr.generateConfigSignature(baseCfg),
    };
    const cfgRes = await executeProposeRemoteConfig({ config: signedV2 }, ownerCtx, {
      cloudStore,
      configSigningSecret: signingSecret,
    });
    expect(cfgRes.success).toBe(true);
    expect(cfgRes.activeConfigVersion).toBe(2);

    // Instance B rejects replay of v2 immediately via authoritative PostgreSQL check
    const replayCfgRes = await executeProposeRemoteConfig({ config: signedV2 }, ownerCtx, {
      cloudStore,
      configSigningSecret: signingSecret,
    });
    expect(replayCfgRes.success).toBe(false);
    expect(replayCfgRes.error).toContain("CONFIG_VERSION_CONFLICT");

    // Instance A revokes certificate -> Instance B denies heartbeat 403 and lists REVOKED
    const revRes = await executeRevokeGatewayCertificate(
      { gatewayId: "gw_lab_ete_01", reason: "COMPROMISED_EDGE_NODE" },
      ownerCtx,
      { cloudStore },
    );
    expect(revRes.success).toBe(true);

    await expect(
      executePostGatewayHeartbeat(
        {
          gatewayId: "gw_lab_ete_01",
          authToken: "egw_secret_token_alpha",
          telemetry: {
            cpuUsagePercent: 12,
            memoryUsagePercent: 30,
            diskUsagePercent: 25,
            walSizeBytes: 1024,
            pendingSamplesCount: 2,
            maxCapacityBytes: 10_000_000,
            oldestSampleTimestampMs: null,
            isDegraded: false,
          },
        },
        { cloudStore },
      ),
    ).rejects.toBeInstanceOf(Response);

    const gwsAfterRevoke = await executeGetFleetGateways({}, ownerCtx, { cloudStore });
    expect(gwsAfterRevoke.find((g) => g.gatewayId === "gw_lab_ete_01")?.operationalState).toBe(
      "REVOKED",
    );

    // Instance A/B audit acknowledgement preserves hash chain integrity across instances
    const logsBeforeAck = await executeGetFleetAuditLogs({}, ownerCtx, { cloudStore });
    const targetEv = logsBeforeAck[logsBeforeAck.length - 1]!;
    const ackRes = await executeAcknowledgeFleetAuditEvent({ eventId: targetEv.id }, ownerCtx, {
      cloudStore,
    });
    expect(ackRes.success).toBe(true);
    expect(ackRes.acknowledgementEvent.eventType).toBe("GATEWAY_EVENT_ACKNOWLEDGED");

    const logsAfterAck = await executeGetFleetAuditLogs({}, ownerCtx, { cloudStore });
    const updatedTarget = logsAfterAck.find((l) => l.id === targetEv.id)!;
    expect(updatedTarget.lifecycleState).toBe("ACKNOWLEDGED");

    await withCloudFleetRuntimeAsync(cloudStore, ({ auditManager }) => {
      expect(auditManager.verifyAuditChainIntegrity().isValid).toBe(true);
    });
  });

  it("serializes concurrent multi-instance provisioning claims and audit appends cleanly in PostgreSQL", async () => {
    const pg = createPgContractClientHarness();
    const cloudStore = new SupabaseFleetStorageBackend(pg.client);
    const prov = new EdgeProvisioningService();
    const tok = prov.createProvisioningToken({
      organizationId: "00000000-0000-4000-8000-0000000000aa",
      plantId: "plant_a",
      stationId: "station_atomic_01",
      issuedBy: "admin@eletricai.test",
    });
    await cloudStore.saveProvisioningToken(tok);

    const gatewayPayloadA = {
      gatewayId: "egw_race_a",
      organizationId: tok.organizationId,
      plantId: tok.plantId,
      stationId: tok.stationId,
      gatewayVersion: "1.2.0",
      installationId: "inst_a",
      certificateFingerprint: "fp_a",
      registeredAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      operationalState: "ONLINE" as const,
      isRevoked: false,
    };
    const tokHash = tok.tokenHash!;
    const [claimA, claimB] = await Promise.all([
      cloudStore.claimProvisioningTokenAtomic({
        tokenHash: tokHash,
        consumedAt: Date.now(),
        stationKey: `${tok.organizationId}:${tok.plantId}:${tok.stationId}`,
        gatewayId: "egw_race_a",
        organizationId: tok.organizationId,
        plantId: tok.plantId,
        stationId: tok.stationId,
        authTokenDigest: "sha256:digest_a",
        gatewayPayload: gatewayPayloadA,
        updatedTokenPayload: { ...tok, isConsumed: true },
      }),
      cloudStore.claimProvisioningTokenAtomic({
        tokenHash: tokHash,
        consumedAt: Date.now(),
        stationKey: `${tok.organizationId}:${tok.plantId}:${tok.stationId}`,
        gatewayId: "egw_race_b",
        organizationId: tok.organizationId,
        plantId: tok.plantId,
        stationId: tok.stationId,
        authTokenDigest: "sha256:digest_b",
        gatewayPayload: { ...gatewayPayloadA, gatewayId: "egw_race_b" },
        updatedTokenPayload: { ...tok, isConsumed: true },
      }),
    ]);
    expect([claimA.claimed, claimB.claimed].filter(Boolean)).toHaveLength(1);

    // Concurrent audit appends resolve tip atomically without breaking hash chain
    await Promise.all([
      withCloudFleetRuntimeAsync(cloudStore, ({ auditManager }) => {
        auditManager.recordEvent({
          actor: { id: "u1", email: "u1@t.com", role: "TENANT_ADMIN" },
          source: "CLOUD_SERVER",
          gatewayId: "gw_1",
          plantId: "plant_a",
          organizationId: tok.organizationId,
          eventType: "CONCURRENT_EVENT_1",
          severity: "INFO",
          result: "SUCCESS",
        });
      }),
      withCloudFleetRuntimeAsync(cloudStore, ({ auditManager }) => {
        auditManager.recordEvent({
          actor: { id: "u2", email: "u2@t.com", role: "TENANT_ADMIN" },
          source: "CLOUD_SERVER",
          gatewayId: "gw_2",
          plantId: "plant_a",
          organizationId: tok.organizationId,
          eventType: "CONCURRENT_EVENT_2",
          severity: "INFO",
          result: "SUCCESS",
        });
      }),
    ]);

    const chainCheck = await withCloudFleetRuntimeAsync(cloudStore, ({ auditManager }) =>
      auditManager.verifyAuditChainIntegrity(),
    );
    expect(chainCheck.isValid).toBe(true);
  });

  it("propagates revocations & config versions across independent SQLite WAL containers immediately without stale warm cache", () => {
    const dir = makeTmpDir("eletricai-wal-sync-");
    const dbPath = path.join(dir, "shared-fleet.sqlite");
    const containerA = createIsolatedPersistentFleetContainer(dbPath, {
      configSigningSecret: "wal-secret",
    });
    const containerB = createIsolatedPersistentFleetContainer(dbPath, {
      configSigningSecret: "wal-secret",
    });

    try {
      const gw = containerA.registry.getGateway("gw_lab_ete_01")!;
      containerA.registry.registerGateway(gw, "wal_token_001");
      expect(
        containerB.registry.authenticateGateway("gw_lab_ete_01", "wal_token_001").authorized,
      ).toBe(true);

      // Warm cache on containerB has already touched gw_lab_ete_01. Now revoke via containerA!
      containerA.registry.revokeGateway("gw_lab_ete_01", "WAL_CROSS_INSTANCE_REVOKE");
      const authB = containerB.registry.authenticateGateway("gw_lab_ete_01", "wal_token_001");
      expect(authB.authorized).toBe(false);
      expect(authB.statusCode).toBe(403);
    } finally {
      containerA.close();
      containerB.close();
    }
  });

  it("fails CLOSED in serverless production Cloud when SUPABASE_SERVICE_ROLE_KEY is missing, and blocks sync SQLite in Cloud mode", () => {
    const prevVercel = process.env["VERCEL"];
    const prevVercelEnv = process.env["VERCEL_ENV"];
    const prevDbPath = process.env["ELETRICAI_FLEET_DB_PATH"];
    const prevBackend = process.env["ELETRICAI_FLEET_STORAGE_BACKEND"];
    const prevSrvKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const prevSupaUrl = process.env["SUPABASE_URL"];
    try {
      delete process.env["ELETRICAI_FLEET_DB_PATH"];
      delete process.env["ELETRICAI_FLEET_STORAGE_BACKEND"];
      delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
      process.env["VERCEL"] = "1";
      process.env["VERCEL_ENV"] = "production";

      expect(() => getFleetStorageBackendMode()).toThrow(/CLOUD_PERSISTENCE_UNCONFIGURED/);
      expect(() => ensurePersistentFleetRuntime()).toThrow(/CLOUD_PERSISTENCE_UNCONFIGURED/);

      process.env["SUPABASE_URL"] = "http://127.0.0.1:54321";
      process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-secret-value";
      expect(getFleetStorageBackendMode()).toBe("supabase_postgresql");
      expect(() => ensurePersistentFleetRuntime()).toThrow(/CLOUD_SYNC_SQLITE_FORBIDDEN/);
    } finally {
      if (prevVercel === undefined) delete process.env["VERCEL"];
      else process.env["VERCEL"] = prevVercel;
      if (prevVercelEnv === undefined) delete process.env["VERCEL_ENV"];
      else process.env["VERCEL_ENV"] = prevVercelEnv;
      if (prevDbPath === undefined) delete process.env["ELETRICAI_FLEET_DB_PATH"];
      else process.env["ELETRICAI_FLEET_DB_PATH"] = prevDbPath;
      if (prevBackend === undefined) delete process.env["ELETRICAI_FLEET_STORAGE_BACKEND"];
      else process.env["ELETRICAI_FLEET_STORAGE_BACKEND"] = prevBackend;
      if (prevSrvKey === undefined) delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
      else process.env["SUPABASE_SERVICE_ROLE_KEY"] = prevSrvKey;
      if (prevSupaUrl === undefined) delete process.env["SUPABASE_URL"];
      else process.env["SUPABASE_URL"] = prevSupaUrl;
    }
  });

  it("enforces Ed25519 key rotation, persistent key revocation, and future timestamp rejection", () => {
    const dir = makeTmpDir("eletricai-ota-pki-");
    const store = createSqliteFleetStorage(path.join(dir, "ota.sqlite"));
    const kp1 = SignedUpdateManager.generateReleaseKeyPair("release-ed25519-v1");
    const kp2 = SignedUpdateManager.generateReleaseKeyPair("release-ed25519-v2");
    const bytes = Buffer.from("ELETRICAI_EDGE_FIRMWARE_2_0_0");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    try {
      const mgrA = new SignedUpdateManager({
        publicKeysByKeyId: { [kp1.keyId]: kp1.publicKeyPem },
        store,
      });
      mgrA.registerTrustedPublicKey(kp2.keyId, kp2.publicKeyPem);

      const m1Unsigned = {
        packageId: "edge-agent",
        targetVersion: "2.0.0",
        targetArch: "x86_64" as const,
        sha256,
        keyId: kp1.keyId,
        manifestVersion: "4.3.2",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        releaseNotes: "Release 2.0.0 signed by v1",
        minGatewayVersion: "1.0.0",
      };
      const m1 = {
        ...m1Unsigned,
        signature: mgrA.signReleaseManifest(m1Unsigned, kp1.privateKeyPem),
      };
      expect(mgrA.verifyManifestSignature(m1)).toBe(true);
      expect(mgrA.verifyArtifactBytes(bytes, m1.sha256)).toBe(true);

      // Revoke key v1 -> rejected in fresh second instance loaded from persistence
      mgrA.revokeSigningKey(kp1.keyId, "KEY_ROTATION_INCIDENT");
      const mgrB = new SignedUpdateManager({ store });
      expect(mgrB.verifyManifestSignature(m1)).toBe(false);

      // Rotated key v2 continues accepted cleanly
      const m2Unsigned = { ...m1Unsigned, keyId: kp2.keyId };
      const m2 = {
        ...m2Unsigned,
        signature: mgrB.signReleaseManifest(m2Unsigned, kp2.privateKeyPem),
      };
      expect(mgrB.verifyManifestSignature(m2)).toBe(true);

      // Future createdAt outside clock skew rejected
      const futureUnsigned = {
        ...m2Unsigned,
        createdAt: new Date(Date.now() + 3_600_000).toISOString(),
      };
      const futureManifest = {
        ...futureUnsigned,
        signature: mgrB.signReleaseManifest(futureUnsigned, kp2.privateKeyPem),
      };
      expect(mgrB.verifyManifestSignature(futureManifest)).toBe(false);
    } finally {
      store.close();
    }
  });

  it("enforces Mercado Pago payment state machine transitions and transactional Cloud webhook ledger", async () => {
    const pg = createPgContractClientHarness();
    const asyncStore = new SupabaseFleetStorageBackend(pg.client);
    const tenantId = "00000000-0000-4000-8000-000000000123";
    const mpSecret = "mp-gate432-secret";
    const mpToken = "mp-gate432-token";
    let statusFromApi = "pending";

    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          id: 99887766,
          status: statusFromApi,
          transaction_amount: 199.9,
          currency_id: "BRL",
          metadata: { tenant_id: tenantId, plan: "pro" },
        }),
        { status: 200 },
      );

    // 1. pending -> OK
    const rPending = await processMpWebhookRequest(makeMpSignedRequest("99887766", mpSecret), {
      adminClient: pg.client as unknown as Parameters<typeof processMpWebhookRequest>[1] extends {
        adminClient?: infer C;
      }
        ? C
        : never,
      asyncStore,
      sharedSecret: mpSecret,
      accessToken: mpToken,
      fetchImpl: fakeFetch,
    });
    expect(rPending.status).toBe(200);

    // 2. approved fails when DB fails -> RETRYABLE, then retry recovers -> PROCESSED
    statusFromApi = "approved";
    pg.billingState.failInvoiceWrite = true;
    const rFail = await processMpWebhookRequest(makeMpSignedRequest("99887766", mpSecret), {
      adminClient: pg.client as never,
      asyncStore,
      sharedSecret: mpSecret,
      accessToken: mpToken,
      fetchImpl: fakeFetch,
    });
    expect(rFail.status).toBe(500);
    expect((await asyncStore.getWebhookEvent("mercadopago", "99887766:approved"))?.state).toBe(
      "RETRYABLE",
    );

    pg.billingState.failInvoiceWrite = false;
    const rApproved = await processMpWebhookRequest(makeMpSignedRequest("99887766", mpSecret), {
      adminClient: pg.client as never,
      asyncStore,
      sharedSecret: mpSecret,
      accessToken: mpToken,
      fetchImpl: fakeFetch,
    });
    expect(rApproved.status).toBe(200);
    expect(pg.billingState.tenants.get(tenantId)?.["plan"]).toBe("pro");

    // 3. Out-of-order regression (`in_process` arriving after `approved`) rejected with 409 without overwriting pro plan
    statusFromApi = "in_process";
    const rRegression = await processMpWebhookRequest(makeMpSignedRequest("99887766", mpSecret), {
      adminClient: pg.client as never,
      asyncStore,
      sharedSecret: mpSecret,
      accessToken: mpToken,
      fetchImpl: fakeFetch,
    });
    expect(rRegression.status).toBe(409);
    expect(pg.billingState.tenants.get(tenantId)?.["plan"]).toBe("pro");

    // Valid transition `approved -> refunded` downgrades to free
    statusFromApi = "refunded";
    const rRefunded = await processMpWebhookRequest(makeMpSignedRequest("99887766", mpSecret), {
      adminClient: pg.client as never,
      asyncStore,
      sharedSecret: mpSecret,
      accessToken: mpToken,
      fetchImpl: fakeFetch,
    });
    expect(rRefunded.status).toBe(200);
    expect(pg.billingState.tenants.get(tenantId)?.["plan"]).toBe("free");

    // 4. Stripe concurrent in-flight 409 check with asyncStore
    await asyncStore.beginWebhookEvent({
      provider: "stripe",
      eventId: "evt_inflight_test",
      payloadHash: createHash("sha256").update("{}").digest("hex"),
      leaseMs: 60_000,
    });
    const stripeBody = JSON.stringify({
      id: "evt_inflight_test",
      type: "checkout.session.completed",
      data: { object: { client_reference_id: tenantId, metadata: { plan: "pro" } } },
    });
    const tNow = Math.floor(Date.now() / 1000);
    const sig = `t=${tNow},v1=${createHmac("sha256", "whsec_432").update(`${tNow}.${stripeBody}`).digest("hex")}`;
    // Pre-mark stripe_webhook_events as reserved to exercise in-flight conflict path
    pg.billingState.stripeEvents.add("evt_inflight_test");
    const rStripeConflict = await processStripeWebhookRequest(
      new Request("https://app.eletricai.local/api/public/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": sig },
        body: stripeBody,
      }),
      {
        adminClient: pg.client as never,
        asyncStore,
        webhookSecret: "whsec_432",
      },
    );
    expect(rStripeConflict.status).toBe(409);
  });

  it("verifies Modbus MBAP framing + endianness decoding + Sparkplug ACL + physical lock + local Supabase loopback guard", async () => {
    expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);
    expect(PROTOCOL_LAYER_CLASSIFICATION.every((p) => p.allowsPhysicalWrites === false)).toBe(true);

    // Modbus MBAP binary encoder/decoder & endianness
    const modbus = new ModbusTcpClientDriver({
      driverId: "mb_test",
      connectionId: "conn_1",
      host: "192.168.10.20",
    });
    await modbus.connect();
    const frame = modbus.buildMbapReadRequestFrame({
      transactionId: 0x1234,
      unitId: 5,
      functionCode: 3,
      startAddress: 100,
      quantity: 2,
    });
    expect(frame.length).toBe(12);
    expect(frame[6]).toBe(5);
    expect(frame[7]).toBe(3);

    const okResp = new Uint8Array([
      0x12, 0x34, 0x00, 0x00, 0x00, 0x07, 0x05, 0x03, 0x04, 0x00, 0x2a, 0x00, 0x64,
    ]);
    const decoded = modbus.decodeMbapReadResponseFrame(okResp);
    expect(decoded.registers).toEqual([42, 100]);

    const exResp = new Uint8Array([0x12, 0x34, 0x00, 0x00, 0x00, 0x03, 0x05, 0x83, 0x02]);
    expect(() => modbus.decodeMbapReadResponseFrame(exResp)).toThrow(/MODBUS_EXCEPTION_RESPONSE/);

    for (const endian of ["BIG_ENDIAN", "LITTLE_ENDIAN", "WORD_SWAPPED", "BYTE_SWAPPED"] as const) {
      modbus.setLabFloat32("HOLDING_REGISTER", 10, 48.75, endian);
      const res = await modbus.read({
        area: "HOLDING_REGISTER",
        address: 10,
        isZeroBased: true,
        dataType: "FLOAT32",
        endianness: endian,
      });
      expect(res.value).toBeCloseTo(48.75, 2);
    }

    // Sparkplug NCMD / DCMD & EdgeNodeId isolation
    const spb = new SparkplugBDriver({
      driverId: "spb_1",
      connectionId: "conn_spb",
      brokerUrl: "mqtts://broker.local:8883",
      clientId: "cid",
      groupId: "G1",
      edgeNodeId: "NODE_1",
    });
    await spb.connect();
    expect(
      spb.handleIncomingMessage("spBv1.0/G1/NCMD/NODE_1", { timestamp: Date.now(), metrics: [] })
        .error,
    ).toContain("PHYSICAL_CONTROL_BLOCKED");
    expect(
      spb.handleIncomingMessage("spBv1.0/G1/DDATA/OTHER_NODE/dev1", {
        timestamp: Date.now(),
        metrics: [],
      }).error,
    ).toContain("UNAUTHORIZED_GROUP_TOPIC");

    // Loopback Supabase test guard vs foreign project block
    expect(() =>
      assertSupabaseProject({ url: "http://127.0.0.1:54321", anonKey: "local-test-anon" }),
    ).not.toThrow();
    expect(() =>
      assertSupabaseProject({ url: "https://wrongrefxxxxxxxxxxxx.supabase.co", anonKey: "sb_x" }),
    ).toThrow(SupabaseConfigError);
  });

  it("verifies zero Cloud->OT raw sockets/DNS in Cloud handlers and hardens SQL RPCs in Gate 4.3.2 migration", () => {
    const cloudFiles = [
      "src/lib/edge/cloud-protocol-guard.server.ts",
      "src/lib/edge/modbus-handlers.server.ts",
      "src/lib/edge/opcua-handlers.server.ts",
      "src/lib/edge/fleet-handlers.server.ts",
      "src/lib/edge/fleet-supabase-store.server.ts",
      "src/lib/edge/fleet-runtime.server.ts",
    ];
    for (const relPath of cloudFiles) {
      const content = fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
      expect(content).not.toMatch(/from\s+["'](?:node:)?(?:net|dns|dgram)["']/);
      expect(content).not.toMatch(/require\(["'](?:node:)?(?:net|dns|dgram)["']\)/);
    }

    const iotContent = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/iot.functions.ts"),
      "utf8",
    );
    expect(iotContent).toContain("IS_PHYSICAL_CONTROL_ALLOWED");
    expect(iotContent).toContain("PHYSICAL_CONTROL_BLOCKED");

    const migrationSql = fs.readFileSync(
      path.resolve(
        process.cwd(),
        "supabase/migrations/20261112120000_gate4_3_2_cloud_persistence_and_rpcs.sql",
      ),
      "utf8",
    );
    expect(migrationSql).toContain("uq_fleet_audit_chain_previous_hash");
    expect(migrationSql).toContain("uq_invoices_stripe_invoice_id");
    expect(migrationSql).toContain("uq_subscriptions_stripe_subscription_id");
    expect(migrationSql).toContain("append_fleet_audit_event_atomic");
    expect(migrationSql).toContain("claim_provisioning_token_atomic");
    expect(migrationSql).toContain("apply_mp_payment_transition_atomic");
    expect(migrationSql).toContain("SET search_path = public");
    expect(migrationSql).toContain("FROM PUBLIC, anon, authenticated");
  });
});
