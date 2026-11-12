// ELÉTRICAI INDUSTRIAL OS — AUTHORITATIVE CLOUD POSTGRESQL / SUPABASE FLEET STORAGE
// Server-only adapter backed by Supabase PostgreSQL tables & atomic security-definer RPCs.
// Eliminates ephemeral SQLite/in-memory state in serverless Cloud (Vercel/Nitro multi-instance).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  AsyncFleetStorageBackend,
  EdgeCertificateRecord,
  FleetAuditEvent,
  FleetGatewaySummary,
  OtaSigningKeyRecord,
  OutboxSampleEntry,
  PersistedProvisioningState,
  ProvisioningToken,
  RegisteredGatewayRecord,
  RemoteConfigPayload,
  WebhookLedgerEntry,
} from "./types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toNullableTenantUuid(organizationId: string): string | null {
  return UUID_REGEX.test(organizationId) ? organizationId.toLowerCase() : null;
}

export interface SupabaseQueryError {
  message?: string;
  code?: string;
}

export interface SupabaseQueryResult<T = unknown> {
  data: T | null;
  error: SupabaseQueryError | null;
}

export interface SupabaseSelectBuilder {
  select(columns: string): SupabaseSelectBuilder;
  eq(column: string, value: unknown): SupabaseSelectBuilder;
  gt(column: string, value: unknown): SupabaseSelectBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseSelectBuilder;
  limit(count: number): SupabaseSelectBuilder;
  maybeSingle(): PromiseLike<SupabaseQueryResult<Record<string, unknown>>>;
  then<TResult1 = SupabaseQueryResult<Array<Record<string, unknown>>>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: SupabaseQueryResult<Array<Record<string, unknown>>>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
}

export interface SupabaseMutationBuilder {
  insert(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
  ): PromiseLike<SupabaseQueryResult<unknown>>;
  upsert(
    values: Record<string, unknown> | Array<Record<string, unknown>>,
    options?: { onConflict?: string },
  ): PromiseLike<SupabaseQueryResult<unknown>>;
  update(values: Record<string, unknown>): {
    eq(column: string, value: unknown): PromiseLike<SupabaseQueryResult<unknown>>;
  };
  delete(): {
    eq(column: string, value: unknown): PromiseLike<SupabaseQueryResult<unknown>>;
  };
}

export interface SupabaseAdminClientLike {
  from(table: string): SupabaseSelectBuilder & SupabaseMutationBuilder;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<SupabaseQueryResult<unknown>>;
}

function assertNoDbError(error: SupabaseQueryError | null | undefined, operation: string): void {
  if (error) {
    throw new Error(
      `CLOUD_PG_STORAGE_ERROR[${operation}]: ${error.message || error.code || "unknown_postgres_error"}`,
    );
  }
}

export class SupabaseFleetStorageBackend implements AsyncFleetStorageBackend {
  public readonly backendKind = "supabase_postgresql" as const;
  private readonly db: SupabaseAdminClientLike;

  constructor(client?: SupabaseAdminClientLike) {
    this.db = client ?? (supabaseAdmin as unknown as SupabaseAdminClientLike);
  }

  public async loadAuditEvents(): Promise<FleetAuditEvent[]> {
    const res = await this.db
      .from("fleet_audit_chain")
      .select("event_json")
      .order("seq", { ascending: true });
    assertNoDbError(res.error, "loadAuditEvents");
    return (res.data ?? []).map((row) => row["event_json"] as FleetAuditEvent);
  }

  public async appendAuditEventAtomic(
    event: FleetAuditEvent,
    expectedPreviousHash: string,
  ): Promise<{ accepted: boolean; seq?: number; currentTipHash: string }> {
    const res = await this.db.rpc("append_fleet_audit_event_atomic", {
      p_id: event.id,
      p_organization_id: event.organizationId,
      p_plant_id: event.plantId,
      p_gateway_id: event.gatewayId,
      p_event_timestamp: event.timestamp,
      p_schema_version: event.schemaVersion ?? "4.3.2",
      p_event_type: event.eventType,
      p_severity: event.severity,
      p_result: event.result,
      p_previous_hash: expectedPreviousHash,
      p_tamper_proof_hash: event.tamperProofHash,
      p_event_json: event,
    });
    assertNoDbError(res.error, "appendAuditEventAtomic");
    const rows = Array.isArray(res.data)
      ? (res.data as Array<Record<string, unknown>>)
      : res.data
        ? [res.data as Record<string, unknown>]
        : [];
    const first = rows[0];
    if (!first) {
      throw new Error("CLOUD_PG_STORAGE_ERROR[appendAuditEventAtomic]: Empty RPC response");
    }
    return {
      accepted: Boolean(first["accepted"]),
      seq: first["seq"] !== null && first["seq"] !== undefined ? Number(first["seq"]) : undefined,
      currentTipHash: String(first["current_tip_hash"] ?? expectedPreviousHash),
    };
  }

  public async loadRegisteredGateways(): Promise<
    Array<{
      gateway: RegisteredGatewayRecord;
      authTokenDigest?: string;
      lastBatchSequence: number;
    }>
  > {
    const res = await this.db
      .from("fleet_registered_gateways")
      .select("payload_json, auth_token_digest, last_batch_sequence");
    assertNoDbError(res.error, "loadRegisteredGateways");
    return (res.data ?? []).map((row) => ({
      gateway: row["payload_json"] as RegisteredGatewayRecord,
      authTokenDigest:
        typeof row["auth_token_digest"] === "string" ? row["auth_token_digest"] : undefined,
      lastBatchSequence: Number(row["last_batch_sequence"] ?? 0),
    }));
  }

  public async getRegisteredGateway(gatewayId: string): Promise<{
    gateway: RegisteredGatewayRecord;
    authTokenDigest?: string;
    lastBatchSequence: number;
  } | null> {
    const res = await this.db
      .from("fleet_registered_gateways")
      .select("payload_json, auth_token_digest, last_batch_sequence")
      .eq("gateway_id", gatewayId)
      .maybeSingle();
    assertNoDbError(res.error, "getRegisteredGateway");
    if (!res.data) return null;
    return {
      gateway: res.data["payload_json"] as RegisteredGatewayRecord,
      authTokenDigest:
        typeof res.data["auth_token_digest"] === "string"
          ? res.data["auth_token_digest"]
          : undefined,
      lastBatchSequence: Number(res.data["last_batch_sequence"] ?? 0),
    };
  }

  public async saveRegisteredGateway(
    gateway: RegisteredGatewayRecord,
    authTokenDigest?: string,
    lastBatchSequence: number = 0,
  ): Promise<void> {
    const res = await this.db.from("fleet_registered_gateways").upsert(
      {
        gateway_id: gateway.gatewayId,
        tenant_id: toNullableTenantUuid(gateway.organizationId),
        organization_id: gateway.organizationId,
        plant_id: gateway.plantId,
        station_id: gateway.stationId,
        payload_json: gateway,
        auth_token_digest: authTokenDigest ?? null,
        last_batch_sequence: lastBatchSequence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gateway_id" },
    );
    assertNoDbError(res.error, "saveRegisteredGateway");
  }

  public async hasIngestDedupKey(dedupKey: string): Promise<boolean> {
    const res = await this.db
      .from("edge_ingested_dedup")
      .select("dedup_key")
      .eq("dedup_key", dedupKey)
      .maybeSingle();
    assertNoDbError(res.error, "hasIngestDedupKey");
    return Boolean(res.data);
  }

  public async recordIngestedBatchAtomic(params: {
    gatewayId: string;
    organizationId: string;
    plantId: string;
    expectedMinSequence: number;
    newSequence: number;
    acceptedSamples: OutboxSampleEntry[];
    dedupKeys: string[];
  }): Promise<{ committed: boolean; reason?: string }> {
    const res = await this.db.rpc("record_ingested_batch_atomic", {
      p_gateway_id: params.gatewayId,
      p_organization_id: params.organizationId,
      p_plant_id: params.plantId,
      p_expected_min_sequence: params.expectedMinSequence,
      p_new_sequence: params.newSequence,
      p_samples: params.acceptedSamples,
      p_dedup_keys: params.dedupKeys,
    });
    assertNoDbError(res.error, "recordIngestedBatchAtomic");
    const rows = Array.isArray(res.data)
      ? (res.data as Array<Record<string, unknown>>)
      : res.data
        ? [res.data as Record<string, unknown>]
        : [];
    const first = rows[0];
    return {
      committed: Boolean(first?.["committed"]),
      reason: typeof first?.["reason"] === "string" ? first["reason"] : undefined,
    };
  }

  public async loadLatestTelemetryForGateway(gatewayId: string): Promise<OutboxSampleEntry[]> {
    const res = await this.db
      .from("fleet_latest_telemetry")
      .select("sample_json")
      .eq("gateway_id", gatewayId)
      .order("source_timestamp", { ascending: false });
    assertNoDbError(res.error, "loadLatestTelemetryForGateway");
    return (res.data ?? []).map((row) => row["sample_json"] as OutboxSampleEntry);
  }

  public async loadFleetGateways(): Promise<FleetGatewaySummary[]> {
    const res = await this.db.from("fleet_gateways").select("payload_json");
    assertNoDbError(res.error, "loadFleetGateways");
    return (res.data ?? []).map((row) => row["payload_json"] as FleetGatewaySummary);
  }

  public async getFleetGateway(gatewayId: string): Promise<FleetGatewaySummary | null> {
    const res = await this.db
      .from("fleet_gateways")
      .select("payload_json")
      .eq("gateway_id", gatewayId)
      .maybeSingle();
    assertNoDbError(res.error, "getFleetGateway");
    return res.data ? (res.data["payload_json"] as FleetGatewaySummary) : null;
  }

  public async saveFleetGateway(
    gateway: FleetGatewaySummary,
    _expectedVersion?: number,
  ): Promise<boolean> {
    const res = await this.db.from("fleet_gateways").upsert(
      {
        gateway_id: gateway.gatewayId,
        tenant_id: toNullableTenantUuid(gateway.organizationId),
        organization_id: gateway.organizationId,
        plant_id: gateway.plantId,
        payload_json: gateway,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gateway_id" },
    );
    assertNoDbError(res.error, "saveFleetGateway");
    return true;
  }

  public async loadCertificates(): Promise<
    Array<{
      gatewayId: string;
      cert: EdgeCertificateRecord;
      popKey?: string;
    }>
  > {
    const res = await this.db
      .from("gateway_certificates")
      .select("gateway_id, cert_json, pop_public_key");
    assertNoDbError(res.error, "loadCertificates");
    return (res.data ?? []).map((row) => ({
      gatewayId: String(row["gateway_id"]),
      cert: row["cert_json"] as EdgeCertificateRecord,
      popKey: typeof row["pop_public_key"] === "string" ? row["pop_public_key"] : undefined,
    }));
  }

  public async saveCertificate(
    gatewayId: string,
    cert: EdgeCertificateRecord,
    popKey?: string,
  ): Promise<void> {
    const gwRes = await this.db
      .from("fleet_registered_gateways")
      .select("organization_id")
      .eq("gateway_id", gatewayId)
      .maybeSingle();
    assertNoDbError(gwRes.error, "saveCertificate.lookupGateway");
    const orgId =
      typeof gwRes.data?.["organization_id"] === "string"
        ? gwRes.data["organization_id"]
        : "org_sp_industrial";

    const res = await this.db.from("gateway_certificates").upsert(
      {
        gateway_id: gatewayId,
        tenant_id: toNullableTenantUuid(orgId),
        cert_json: cert,
        pop_public_key: popKey ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "gateway_id" },
    );
    assertNoDbError(res.error, "saveCertificate");
  }

  public async consumeChallengeOnce(
    gatewayId: string,
    challenge: string,
    ttlMs: number = 300_000,
  ): Promise<boolean> {
    const challengeKey = `${gatewayId}:${challenge}`;
    const existing = await this.db
      .from("gateway_certificate_challenges")
      .select("challenge_key, expires_at")
      .eq("challenge_key", challengeKey)
      .maybeSingle();
    assertNoDbError(existing.error, "consumeChallengeOnce.lookup");
    if (existing.data) {
      const expiresAtMs = Date.parse(String(existing.data["expires_at"] ?? ""));
      if (!Number.isNaN(expiresAtMs) && expiresAtMs > Date.now()) {
        return false;
      }
      await this.db
        .from("gateway_certificate_challenges")
        .delete()
        .eq("challenge_key", challengeKey);
    }

    const insertRes = await this.db.from("gateway_certificate_challenges").insert({
      challenge_key: challengeKey,
      gateway_id: gatewayId,
      consumed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    });
    if (insertRes.error) {
      const msg = String(insertRes.error.message ?? "").toLowerCase();
      if (insertRes.error.code === "23505" || msg.includes("duplicate")) {
        return false;
      }
      assertNoDbError(insertRes.error, "consumeChallengeOnce.insert");
    }
    return true;
  }

  public async loadRemoteConfigs(): Promise<
    Record<string, { history: RemoteConfigPayload[]; lkgc?: RemoteConfigPayload }>
  > {
    const res = await this.db
      .from("remote_configs")
      .select("gateway_id, config_version, is_lkgc, payload_json")
      .order("config_version", { ascending: true });
    assertNoDbError(res.error, "loadRemoteConfigs");

    const grouped: Record<string, { history: RemoteConfigPayload[]; lkgc?: RemoteConfigPayload }> =
      {};
    for (const row of res.data ?? []) {
      const gwId = String(row["gateway_id"]);
      if (!grouped[gwId]) grouped[gwId] = { history: [] };
      const payload = row["payload_json"] as RemoteConfigPayload;
      grouped[gwId].history.push(payload);
      if (row["is_lkgc"] === true) {
        grouped[gwId].lkgc = payload;
      }
    }
    return grouped;
  }

  public async appendRemoteConfigMonotonic(
    gatewayId: string,
    config: RemoteConfigPayload,
    organizationId: string = "org_sp_industrial",
  ): Promise<boolean> {
    const res = await this.db.rpc("append_remote_config_monotonic_atomic", {
      p_gateway_id: gatewayId,
      p_organization_id: organizationId,
      p_config_version: config.configVersion,
      p_payload: config,
      p_set_lkgc: true,
    });
    assertNoDbError(res.error, "appendRemoteConfigMonotonic");
    return Boolean(res.data);
  }

  public async setLkgcConfig(gatewayId: string, config: RemoteConfigPayload): Promise<void> {
    const clearRes = await this.db
      .from("remote_configs")
      .update({ is_lkgc: false })
      .eq("gateway_id", gatewayId);
    assertNoDbError(clearRes.error, "setLkgcConfig.clear");

    const setRes = await this.db
      .from("remote_configs")
      .update({ is_lkgc: true })
      .eq("id", `${gatewayId}:${config.configVersion}`);
    assertNoDbError(setRes.error, "setLkgcConfig.mark");
  }

  public async loadOtaCampaigns(): Promise<Record<string, unknown>> {
    const res = await this.db.from("ota_campaigns").select("campaign_id, payload_json");
    assertNoDbError(res.error, "loadOtaCampaigns");
    const out: Record<string, unknown> = {};
    for (const row of res.data ?? []) {
      out[String(row["campaign_id"])] = row["payload_json"];
    }
    return out;
  }

  public async saveOtaCampaign(
    campaignId: string,
    organizationId: string,
    plantId: string,
    campaign: unknown,
  ): Promise<void> {
    const res = await this.db.from("ota_campaigns").upsert(
      {
        campaign_id: campaignId,
        tenant_id: toNullableTenantUuid(organizationId),
        organization_id: organizationId,
        plant_id: plantId,
        payload_json: campaign,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campaign_id" },
    );
    assertNoDbError(res.error, "saveOtaCampaign");
  }

  public async hasAppliedOtaVersion(
    gatewayId: string,
    packageId: string,
    targetVersion: string,
  ): Promise<boolean> {
    const res = await this.db
      .from("ota_applied_packages")
      .select("id")
      .eq("id", `${gatewayId}:${packageId}:${targetVersion}`)
      .maybeSingle();
    assertNoDbError(res.error, "hasAppliedOtaVersion");
    return Boolean(res.data);
  }

  public async recordAppliedOtaVersion(
    gatewayId: string,
    packageId: string,
    targetVersion: string,
    manifestHash: string,
    organizationId: string = "org_sp_industrial",
  ): Promise<void> {
    const res = await this.db.from("ota_applied_packages").upsert(
      {
        id: `${gatewayId}:${packageId}:${targetVersion}`,
        tenant_id: toNullableTenantUuid(organizationId),
        gateway_id: gatewayId,
        package_id: packageId,
        target_version: targetVersion,
        manifest_hash: manifestHash,
        applied_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    assertNoDbError(res.error, "recordAppliedOtaVersion");
  }

  public async loadOtaSigningKeys(): Promise<OtaSigningKeyRecord[]> {
    const res = await this.db
      .from("ota_signing_keys")
      .select("key_id, public_key_pem, status, revoked_reason, revoked_at");
    assertNoDbError(res.error, "loadOtaSigningKeys");
    return (res.data ?? []).map((row) => ({
      keyId: String(row["key_id"]),
      publicKeyPem: String(row["public_key_pem"]),
      status: String(row["status"]) === "REVOKED" ? "REVOKED" : "ACTIVE",
      revokedReason: typeof row["revoked_reason"] === "string" ? row["revoked_reason"] : undefined,
      revokedAt: typeof row["revoked_at"] === "string" ? row["revoked_at"] : undefined,
    }));
  }

  public async saveOtaSigningKey(record: OtaSigningKeyRecord): Promise<void> {
    const res = await this.db.from("ota_signing_keys").upsert(
      {
        key_id: record.keyId,
        public_key_pem: record.publicKeyPem,
        status: record.status,
        revoked_reason: record.revokedReason ?? null,
        revoked_at: record.revokedAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key_id" },
    );
    assertNoDbError(res.error, "saveOtaSigningKey");
  }

  public async loadProvisioningState(): Promise<PersistedProvisioningState> {
    const [tokRes, gwRes, stationRes] = await Promise.all([
      this.db.from("provisioning_tokens").select("payload_json"),
      this.db
        .from("fleet_registered_gateways")
        .select("gateway_id, auth_token_digest")
        .order("updated_at", { ascending: true }),
      this.db.from("provisioning_station_bindings").select("station_key, gateway_id"),
    ]);
    assertNoDbError(tokRes.error, "loadProvisioningState.tokens");
    assertNoDbError(gwRes.error, "loadProvisioningState.gateways");
    assertNoDbError(stationRes.error, "loadProvisioningState.stations");

    const tokens = (tokRes.data ?? []).map((r) => r["payload_json"] as ProvisioningToken);
    const activeAuthTokens: Record<string, { gatewayId: string; authTokenDigest: string }> = {};
    for (const gw of gwRes.data ?? []) {
      const digest = gw["auth_token_digest"];
      if (typeof digest === "string" && digest.length > 0) {
        const cleanDigest = digest.startsWith("sha256:") ? digest.slice(7) : digest;
        activeAuthTokens[cleanDigest] = {
          gatewayId: String(gw["gateway_id"]),
          authTokenDigest: cleanDigest,
        };
      }
    }
    const provisionedStations: Record<string, string> = {};
    for (const s of stationRes.data ?? []) {
      provisionedStations[String(s["station_key"])] = String(s["gateway_id"]);
    }
    return { tokens, activeAuthTokens, provisionedStations };
  }

  public async saveProvisioningToken(token: ProvisioningToken): Promise<void> {
    const res = await this.db.from("provisioning_tokens").upsert(
      {
        token_hash: token.tokenHash,
        tenant_id: toNullableTenantUuid(token.organizationId),
        organization_id: token.organizationId,
        plant_id: token.plantId,
        station_id: token.stationId,
        payload_json: token,
        is_consumed: token.isConsumed,
        is_revoked: token.isRevoked,
        consumed_at: token.consumedAt ? new Date(token.consumedAt).toISOString() : null,
        expires_at: new Date(token.expiresAt).toISOString(),
      },
      { onConflict: "token_hash" },
    );
    assertNoDbError(res.error, "saveProvisioningToken");
  }

  public async claimProvisioningTokenAtomic(params: {
    tokenHash: string;
    consumedAt: number;
    stationKey: string;
    gatewayId: string;
    organizationId: string;
    plantId: string;
    stationId: string;
    authTokenDigest: string;
    gatewayPayload: RegisteredGatewayRecord;
    updatedTokenPayload: ProvisioningToken;
  }): Promise<{ claimed: boolean; reason?: string }> {
    const res = await this.db.rpc("claim_provisioning_token_atomic", {
      p_token_hash: params.tokenHash,
      p_consumed_at: new Date(params.consumedAt).toISOString(),
      p_station_key: params.stationKey,
      p_gateway_id: params.gatewayId,
      p_organization_id: params.organizationId,
      p_plant_id: params.plantId,
      p_station_id: params.stationId,
      p_auth_token_digest: params.authTokenDigest,
      p_gateway_payload: params.gatewayPayload,
      p_updated_token_payload: params.updatedTokenPayload,
    });
    assertNoDbError(res.error, "claimProvisioningTokenAtomic");
    const rows = Array.isArray(res.data)
      ? (res.data as Array<Record<string, unknown>>)
      : res.data
        ? [res.data as Record<string, unknown>]
        : [];
    const first = rows[0];
    return {
      claimed: Boolean(first?.["claimed"]),
      reason: typeof first?.["reason"] === "string" ? first["reason"] : undefined,
    };
  }

  public async beginWebhookEvent(params: {
    provider: "stripe" | "mercadopago";
    eventId: string;
    payloadHash: string;
    leaseMs?: number;
  }): Promise<{
    status: "ACQUIRED" | "ALREADY_PROCESSED" | "IN_FLIGHT";
    entry: WebhookLedgerEntry;
  }> {
    const res = await this.db.rpc("begin_webhook_event_atomic", {
      p_provider: params.provider,
      p_event_id: params.eventId,
      p_payload_hash: params.payloadHash,
      p_lease_ms: params.leaseMs ?? 30_000,
    });
    assertNoDbError(res.error, "beginWebhookEvent");
    const rows = Array.isArray(res.data)
      ? (res.data as Array<Record<string, unknown>>)
      : res.data
        ? [res.data as Record<string, unknown>]
        : [];
    const row = rows[0];
    if (!row) {
      throw new Error("CLOUD_PG_STORAGE_ERROR[beginWebhookEvent]: Empty RPC response");
    }
    const status = String(row["lease_status"]) as "ACQUIRED" | "ALREADY_PROCESSED" | "IN_FLIGHT";
    return {
      status,
      entry: {
        provider: String(row["provider"]) as "stripe" | "mercadopago",
        eventId: String(row["event_id"]),
        state: String(row["state"]) as WebhookLedgerEntry["state"],
        payloadHash: String(row["payload_hash"]),
        attempts: Number(row["attempts"] ?? 1),
        lockedUntil: row["locked_until"] ? Date.parse(String(row["locked_until"])) : null,
        lastError: typeof row["last_error"] === "string" ? row["last_error"] : null,
        updatedAt: String(row["updated_at"]),
      },
    };
  }

  public async completeWebhookEvent(params: {
    provider: "stripe" | "mercadopago";
    eventId: string;
    state: "PROCESSED" | "FAILED" | "RETRYABLE";
    lastError?: string;
  }): Promise<void> {
    const res = await this.db.rpc("complete_webhook_event_atomic", {
      p_provider: params.provider,
      p_event_id: params.eventId,
      p_state: params.state,
      p_last_error: params.lastError ?? null,
    });
    assertNoDbError(res.error, "completeWebhookEvent");
  }

  public async getWebhookEvent(
    provider: "stripe" | "mercadopago",
    eventId: string,
  ): Promise<WebhookLedgerEntry | undefined> {
    const res = await this.db
      .from("webhook_processing_ledger")
      .select(
        "provider, event_id, state, payload_hash, attempts, locked_until, last_error, updated_at",
      )
      .eq("provider", provider)
      .eq("event_id", eventId)
      .maybeSingle();
    assertNoDbError(res.error, "getWebhookEvent");
    if (!res.data) return undefined;
    const row = res.data;
    return {
      provider: String(row["provider"]) as "stripe" | "mercadopago",
      eventId: String(row["event_id"]),
      state: String(row["state"]) as WebhookLedgerEntry["state"],
      payloadHash: String(row["payload_hash"]),
      attempts: Number(row["attempts"] ?? 1),
      lockedUntil: row["locked_until"] ? Date.parse(String(row["locked_until"])) : null,
      lastError: typeof row["last_error"] === "string" ? row["last_error"] : null,
      updatedAt: String(row["updated_at"]),
    };
  }
}
