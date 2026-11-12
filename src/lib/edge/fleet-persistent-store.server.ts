// ELÉTRICAI INDUSTRIAL OS — PERSISTENT SERVER FLEET & SECURITY STORAGE (SQLITE WAL)
// Zero third-party dependencies: uses Node v24 built-in `node:sqlite` or Bun `bun:sqlite`.
// Implements optimistic concurrency locking, atomic single-use claims, monotonic versioning,
// append-only tamper-evident triggers on `fleet_audit_chain`, and webhook idempotency ledger.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import type {
  EdgeCertificateRecord,
  FleetAuditEvent,
  FleetGatewaySummary,
  FleetStorageBackend,
  OutboxSampleEntry,
  PersistedProvisioningState,
  ProvisioningToken,
  RegisteredGatewayRecord,
  RemoteConfigPayload,
  WebhookLedgerEntry,
} from "./types";

interface SqlStatementLike {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid?: number | bigint };
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

interface SqlDatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): SqlStatementLike;
  close?: () => void;
}

const GENESIS_HASH = "GENESIS_FLEET_AUDIT_BLOCK_00000000000000000000000000000000";

function openSqliteConnection(dbPath: string): SqlDatabaseLike {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const req = createRequire(import.meta.url);
  let db: SqlDatabaseLike;

  if (typeof (globalThis as Record<string, unknown>)["Bun"] !== "undefined") {
    const bunSqlite = req("bun:sqlite") as { Database: new (p: string) => SqlDatabaseLike };
    db = new bunSqlite.Database(dbPath);
  } else {
    const nodeSqlite = req("node:sqlite") as { DatabaseSync: new (p: string) => SqlDatabaseLike };
    db = new nodeSqlite.DatabaseSync(dbPath);
  }

  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function runInTransaction<T>(db: SqlDatabaseLike, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const res = fn();
    db.exec("COMMIT;");
    return res;
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      // Ignore secondary rollback error if transaction wasn't opened cleanly
    }
    throw err;
  }
}

export class SqliteFleetStorageBackend implements FleetStorageBackend {
  private readonly db: SqlDatabaseLike;
  public readonly dbPath: string;

  constructor(dbPath: string = ":memory:") {
    this.dbPath = dbPath;
    this.db = openSqliteConnection(dbPath);
    this.applySchemaAndTriggers();
  }

  private applySchemaAndTriggers(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fleet_audit_chain (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        timestamp INTEGER NOT NULL,
        schema_version TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        plant_id TEXT NOT NULL,
        gateway_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        result TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        tamper_proof_hash TEXT NOT NULL UNIQUE,
        event_json TEXT NOT NULL
      );

      CREATE TRIGGER IF NOT EXISTS trg_fleet_audit_no_update
      BEFORE UPDATE ON fleet_audit_chain
      BEGIN
        SELECT RAISE(ABORT, 'AUDIT_CHAIN_IMMUTABLE: UPDATE proibido na cadeia de auditoria append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_fleet_audit_no_delete
      BEFORE DELETE ON fleet_audit_chain
      BEGIN
        SELECT RAISE(ABORT, 'AUDIT_CHAIN_IMMUTABLE: DELETE proibido na cadeia de auditoria append-only');
      END;

      CREATE TABLE IF NOT EXISTS registered_gateways (
        gateway_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        plant_id TEXT NOT NULL,
        station_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        auth_token_digest TEXT,
        last_batch_sequence INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ingested_telemetry_dedup (
        dedup_key TEXT PRIMARY KEY,
        gateway_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        plant_id TEXT NOT NULL,
        tag_name TEXT NOT NULL,
        source_timestamp INTEGER NOT NULL,
        sample_json TEXT NOT NULL,
        ingested_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS latest_gateway_telemetry (
        gateway_id TEXT NOT NULL,
        tag_name TEXT NOT NULL,
        source_timestamp INTEGER NOT NULL,
        sample_json TEXT NOT NULL,
        PRIMARY KEY (gateway_id, tag_name)
      );

      CREATE TABLE IF NOT EXISTS fleet_gateways (
        gateway_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        plant_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS gateway_certificates (
        gateway_id TEXT PRIMARY KEY,
        cert_json TEXT NOT NULL,
        pop_key TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS certificate_challenges (
        challenge_key TEXT PRIMARY KEY,
        gateway_id TEXT NOT NULL,
        consumed_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS remote_configs (
        id TEXT PRIMARY KEY,
        gateway_id TEXT NOT NULL,
        config_version INTEGER NOT NULL,
        is_lkgc INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (gateway_id, config_version)
      );

      CREATE TABLE IF NOT EXISTS ota_campaigns (
        campaign_id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        plant_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ota_applied_packages (
        id TEXT PRIMARY KEY,
        gateway_id TEXT NOT NULL,
        package_id TEXT NOT NULL,
        target_version TEXT NOT NULL,
        manifest_hash TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        UNIQUE (gateway_id, package_id, target_version)
      );

      CREATE TABLE IF NOT EXISTS provisioning_tokens (
        token_hash TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL,
        plant_id TEXT NOT NULL,
        station_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        is_consumed INTEGER NOT NULL DEFAULT 0,
        is_revoked INTEGER NOT NULL DEFAULT 0,
        consumed_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS provisioned_stations (
        station_key TEXT PRIMARY KEY,
        gateway_id TEXT NOT NULL UNIQUE,
        auth_token_digest TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webhook_processing_ledger (
        provider TEXT NOT NULL,
        event_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('RECEIVED','PROCESSING','PROCESSED','FAILED','RETRYABLE')),
        payload_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 1,
        locked_until INTEGER,
        last_error TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (provider, event_id)
      );

      CREATE TABLE IF NOT EXISTS ota_signing_keys (
        key_id TEXT PRIMARY KEY,
        public_key_pem TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
        revoked_reason TEXT,
        revoked_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Exposed strictly for SQLite trigger/immutability verification tests.
   */
  public executeRawSqlForTest(sql: string): void {
    this.db.exec(sql);
  }

  // ── Fleet Audit Chain (Append-Only) ────────────────────────────────────────
  public loadAuditEvents(): FleetAuditEvent[] {
    const rows = this.db.prepare("SELECT event_json FROM fleet_audit_chain ORDER BY seq ASC").all();
    return rows.map((r) => JSON.parse(String(r["event_json"])) as FleetAuditEvent);
  }

  public appendAuditEvent(event: FleetAuditEvent, expectedPreviousHash: string): void {
    runInTransaction(this.db, () => {
      const latest = this.db
        .prepare("SELECT tamper_proof_hash FROM fleet_audit_chain ORDER BY seq DESC LIMIT 1")
        .get();
      const persistedPrev = latest ? String(latest["tamper_proof_hash"]) : GENESIS_HASH;
      if (persistedPrev !== expectedPreviousHash) {
        throw new Error(
          `AUDIT_CHAIN_CONFLICT: Hash anterior esperado (${expectedPreviousHash}) diverge do último bloco persistido (${persistedPrev}).`,
        );
      }
      this.db
        .prepare(
          `INSERT INTO fleet_audit_chain (
            id, timestamp, schema_version, organization_id, plant_id, gateway_id,
            event_type, severity, result, previous_hash, tamper_proof_hash, event_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.id,
          event.timestamp,
          event.schemaVersion ?? "4.3.1",
          event.organizationId,
          event.plantId,
          event.gatewayId,
          event.eventType,
          event.severity,
          event.result,
          expectedPreviousHash,
          event.tamperProofHash,
          JSON.stringify(event),
        );
    });
  }

  // ── Cloud Gateway Registry ─────────────────────────────────────────────────
  public loadRegisteredGateways(): Array<{
    gateway: RegisteredGatewayRecord;
    authTokenDigest?: string;
    lastBatchSequence: number;
  }> {
    const rows = this.db
      .prepare(
        "SELECT payload_json, auth_token_digest, last_batch_sequence, version FROM registered_gateways",
      )
      .all();
    return rows.map((r) => {
      const gateway = JSON.parse(String(r["payload_json"])) as RegisteredGatewayRecord;
      gateway.recordVersion = Number(r["version"]);
      return {
        gateway,
        authTokenDigest: r["auth_token_digest"] ? String(r["auth_token_digest"]) : undefined,
        lastBatchSequence: Number(r["last_batch_sequence"] ?? 0),
      };
    });
  }

  public saveRegisteredGateway(
    gateway: RegisteredGatewayRecord,
    authTokenDigest?: string,
    lastBatchSequence?: number,
  ): void {
    const now = new Date().toISOString();
    runInTransaction(this.db, () => {
      const existing = this.db
        .prepare(
          "SELECT auth_token_digest, last_batch_sequence, version FROM registered_gateways WHERE gateway_id = ?",
        )
        .get(gateway.gatewayId);

      if (!existing) {
        this.db
          .prepare(
            `INSERT INTO registered_gateways (
              gateway_id, organization_id, plant_id, station_id, payload_json,
              auth_token_digest, last_batch_sequence, version, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          )
          .run(
            gateway.gatewayId,
            gateway.organizationId,
            gateway.plantId,
            gateway.stationId,
            JSON.stringify({ ...gateway, recordVersion: 1 }),
            authTokenDigest ?? null,
            lastBatchSequence ?? 0,
            now,
          );
        return;
      }

      const nextVersion = Number(existing["version"]) + 1;
      const effectiveDigest =
        authTokenDigest !== undefined
          ? authTokenDigest
          : existing["auth_token_digest"]
            ? String(existing["auth_token_digest"])
            : null;
      const effectiveSeq =
        lastBatchSequence !== undefined
          ? lastBatchSequence
          : Number(existing["last_batch_sequence"] ?? 0);

      this.db
        .prepare(
          `UPDATE registered_gateways
           SET organization_id = ?, plant_id = ?, station_id = ?, payload_json = ?,
               auth_token_digest = ?, last_batch_sequence = ?, version = ?, updated_at = ?
           WHERE gateway_id = ?`,
        )
        .run(
          gateway.organizationId,
          gateway.plantId,
          gateway.stationId,
          JSON.stringify({ ...gateway, recordVersion: nextVersion }),
          effectiveDigest,
          effectiveSeq,
          nextVersion,
          now,
          gateway.gatewayId,
        );
    });
  }

  public hasIngestDedupKey(dedupKey: string): boolean {
    const row = this.db
      .prepare("SELECT 1 AS found FROM ingested_telemetry_dedup WHERE dedup_key = ?")
      .get(dedupKey);
    return Boolean(row);
  }

  public recordIngestedBatchAtomic(params: {
    gatewayId: string;
    organizationId: string;
    plantId: string;
    expectedMinSequence: number;
    newSequence: number;
    acceptedSamples: OutboxSampleEntry[];
    dedupKeys: string[];
  }): { committed: boolean; reason?: string } {
    const now = new Date().toISOString();
    return runInTransaction(this.db, () => {
      const gwRow = this.db
        .prepare("SELECT last_batch_sequence FROM registered_gateways WHERE gateway_id = ?")
        .get(params.gatewayId);
      if (!gwRow) {
        return { committed: false, reason: "GATEWAY_NOT_FOUND" };
      }
      const persistedSeq = Number(gwRow["last_batch_sequence"] ?? 0);
      if (params.newSequence < persistedSeq || params.newSequence < params.expectedMinSequence) {
        return { committed: false, reason: "SEQUENCE_CONFLICT" };
      }

      const insertDedup = this.db.prepare(
        `INSERT OR IGNORE INTO ingested_telemetry_dedup (
          dedup_key, gateway_id, organization_id, plant_id, tag_name,
          source_timestamp, sample_json, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const upsertLatest = this.db.prepare(
        `INSERT INTO latest_gateway_telemetry (gateway_id, tag_name, source_timestamp, sample_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(gateway_id, tag_name) DO UPDATE SET
           source_timestamp = CASE WHEN excluded.source_timestamp >= latest_gateway_telemetry.source_timestamp THEN excluded.source_timestamp ELSE latest_gateway_telemetry.source_timestamp END,
           sample_json = CASE WHEN excluded.source_timestamp >= latest_gateway_telemetry.source_timestamp THEN excluded.sample_json ELSE latest_gateway_telemetry.sample_json END`,
      );

      for (let i = 0; i < params.acceptedSamples.length; i++) {
        const sample = params.acceptedSamples[i];
        const dedupKey = params.dedupKeys[i];
        const json = JSON.stringify(sample);
        insertDedup.run(
          dedupKey,
          params.gatewayId,
          params.organizationId,
          params.plantId,
          sample.tagName,
          sample.sourceTimestamp,
          json,
          now,
        );
        upsertLatest.run(params.gatewayId, sample.tagName, sample.sourceTimestamp, json);
      }

      this.db
        .prepare(
          "UPDATE registered_gateways SET last_batch_sequence = ?, updated_at = ? WHERE gateway_id = ?",
        )
        .run(params.newSequence, now, params.gatewayId);

      return { committed: true };
    });
  }

  public loadLatestTelemetryForGateway(gatewayId: string): OutboxSampleEntry[] {
    const rows = this.db
      .prepare(
        "SELECT sample_json FROM latest_gateway_telemetry WHERE gateway_id = ? ORDER BY tag_name ASC",
      )
      .all(gatewayId);
    return rows.map((r) => JSON.parse(String(r["sample_json"])) as OutboxSampleEntry);
  }

  // ── Edge Fleet Manager ─────────────────────────────────────────────────────
  public loadFleetGateways(): FleetGatewaySummary[] {
    const rows = this.db.prepare("SELECT payload_json, version FROM fleet_gateways").all();
    return rows.map((r) => {
      const gw = JSON.parse(String(r["payload_json"])) as FleetGatewaySummary;
      gw.recordVersion = Number(r["version"]);
      return gw;
    });
  }

  public saveFleetGateway(gateway: FleetGatewaySummary, expectedVersion?: number): boolean {
    const now = new Date().toISOString();
    return runInTransaction(this.db, () => {
      const existing = this.db
        .prepare("SELECT version FROM fleet_gateways WHERE gateway_id = ?")
        .get(gateway.gatewayId);

      if (!existing) {
        const nextPayload = { ...gateway, recordVersion: 1 };
        this.db
          .prepare(
            `INSERT INTO fleet_gateways (gateway_id, organization_id, plant_id, payload_json, version, updated_at)
             VALUES (?, ?, ?, ?, 1, ?)`,
          )
          .run(
            gateway.gatewayId,
            gateway.organizationId,
            gateway.plantId,
            JSON.stringify(nextPayload),
            now,
          );
        gateway.recordVersion = 1;
        return true;
      }

      const currentVersion = Number(existing["version"]);
      if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
        return false;
      }

      const nextVersion = currentVersion + 1;
      const nextPayload = { ...gateway, recordVersion: nextVersion };
      const res = this.db
        .prepare(
          `UPDATE fleet_gateways
           SET organization_id = ?, plant_id = ?, payload_json = ?, version = ?, updated_at = ?
           WHERE gateway_id = ? AND version = ?`,
        )
        .run(
          gateway.organizationId,
          gateway.plantId,
          JSON.stringify(nextPayload),
          nextVersion,
          now,
          gateway.gatewayId,
          currentVersion,
        );

      const updated = Number(res.changes) === 1;
      if (updated) {
        gateway.recordVersion = nextVersion;
      }
      return updated;
    });
  }

  // ── Certificates & Challenge Anti-Replay ───────────────────────────────────
  public loadCertificates(): Array<{
    gatewayId: string;
    cert: EdgeCertificateRecord;
    popKey?: string;
  }> {
    const rows = this.db
      .prepare("SELECT gateway_id, cert_json, pop_key FROM gateway_certificates")
      .all();
    return rows.map((r) => ({
      gatewayId: String(r["gateway_id"]),
      cert: JSON.parse(String(r["cert_json"])) as EdgeCertificateRecord,
      popKey: r["pop_key"] ? String(r["pop_key"]) : undefined,
    }));
  }

  public saveCertificate(gatewayId: string, cert: EdgeCertificateRecord, popKey?: string): void {
    const now = new Date().toISOString();
    runInTransaction(this.db, () => {
      const existing = this.db
        .prepare("SELECT pop_key, version FROM gateway_certificates WHERE gateway_id = ?")
        .get(gatewayId);
      const effectivePopKey =
        popKey !== undefined ? popKey : existing?.["pop_key"] ? String(existing["pop_key"]) : null;

      if (!existing) {
        this.db
          .prepare(
            `INSERT INTO gateway_certificates (gateway_id, cert_json, pop_key, version, updated_at)
             VALUES (?, ?, ?, 1, ?)`,
          )
          .run(gatewayId, JSON.stringify(cert), effectivePopKey, now);
      } else {
        const nextVersion = Number(existing["version"]) + 1;
        this.db
          .prepare(
            `UPDATE gateway_certificates
             SET cert_json = ?, pop_key = ?, version = ?, updated_at = ?
             WHERE gateway_id = ?`,
          )
          .run(JSON.stringify(cert), effectivePopKey, nextVersion, now, gatewayId);
      }
    });
  }

  public consumeChallengeOnce(
    gatewayId: string,
    challenge: string,
    ttlMs: number = 24 * 3600 * 1000,
  ): boolean {
    const now = Date.now();
    const key = `${gatewayId}:${challenge}`;
    return runInTransaction(this.db, () => {
      // Purge expired challenges first
      this.db.prepare("DELETE FROM certificate_challenges WHERE expires_at < ?").run(now);
      const res = this.db
        .prepare(
          `INSERT OR IGNORE INTO certificate_challenges (challenge_key, gateway_id, consumed_at, expires_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(key, gatewayId, now, now + ttlMs);
      return Number(res.changes) === 1;
    });
  }

  // ── Remote Config Monotonicity & LKGC ──────────────────────────────────────
  public loadRemoteConfigs(): Record<
    string,
    { history: RemoteConfigPayload[]; lkgc?: RemoteConfigPayload }
  > {
    const rows = this.db
      .prepare(
        "SELECT gateway_id, is_lkgc, payload_json FROM remote_configs ORDER BY config_version ASC",
      )
      .all();

    const map: Record<string, { history: RemoteConfigPayload[]; lkgc?: RemoteConfigPayload }> = {};
    for (const r of rows) {
      const gwId = String(r["gateway_id"]);
      if (!map[gwId]) map[gwId] = { history: [] };
      const payload = JSON.parse(String(r["payload_json"])) as RemoteConfigPayload;
      map[gwId].history.push(payload);
      if (Number(r["is_lkgc"]) === 1) {
        map[gwId].lkgc = payload;
      }
    }
    return map;
  }

  public appendRemoteConfigMonotonic(gatewayId: string, config: RemoteConfigPayload): boolean {
    const now = new Date().toISOString();
    return runInTransaction(this.db, () => {
      const maxRow = this.db
        .prepare("SELECT MAX(config_version) AS max_ver FROM remote_configs WHERE gateway_id = ?")
        .get(gatewayId);
      const currentMax = maxRow && maxRow["max_ver"] !== null ? Number(maxRow["max_ver"]) : 0;
      if (config.configVersion <= currentMax) {
        return false;
      }

      this.db.prepare("UPDATE remote_configs SET is_lkgc = 0 WHERE gateway_id = ?").run(gatewayId);
      this.db
        .prepare(
          `INSERT INTO remote_configs (id, gateway_id, config_version, is_lkgc, payload_json, created_at)
           VALUES (?, ?, ?, 1, ?, ?)`,
        )
        .run(
          `${gatewayId}:${config.configVersion}`,
          gatewayId,
          config.configVersion,
          JSON.stringify(config),
          now,
        );

      return true;
    });
  }

  public setLkgcConfig(gatewayId: string, config: RemoteConfigPayload): void {
    const now = new Date().toISOString();
    runInTransaction(this.db, () => {
      this.db.prepare("UPDATE remote_configs SET is_lkgc = 0 WHERE gateway_id = ?").run(gatewayId);
      const res = this.db
        .prepare(
          "UPDATE remote_configs SET is_lkgc = 1, payload_json = ? WHERE gateway_id = ? AND config_version = ?",
        )
        .run(JSON.stringify(config), gatewayId, config.configVersion);
      if (Number(res.changes) === 0) {
        this.db
          .prepare(
            `INSERT INTO remote_configs (id, gateway_id, config_version, is_lkgc, payload_json, created_at)
             VALUES (?, ?, ?, 1, ?, ?)`,
          )
          .run(
            `${gatewayId}:${config.configVersion}`,
            gatewayId,
            config.configVersion,
            JSON.stringify(config),
            now,
          );
      }
    });
  }

  // ── OTA Signed Updates & Campaigns ─────────────────────────────────────────
  public loadOtaCampaigns(): Record<string, unknown> {
    const rows = this.db.prepare("SELECT campaign_id, payload_json FROM ota_campaigns").all();
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      out[String(r["campaign_id"])] = JSON.parse(String(r["payload_json"]));
    }
    return out;
  }

  public saveOtaCampaign(
    campaignId: string,
    organizationId: string,
    plantId: string,
    campaign: unknown,
  ): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO ota_campaigns (campaign_id, organization_id, plant_id, payload_json, version, updated_at)
         VALUES (?, ?, ?, ?, 1, ?)
         ON CONFLICT(campaign_id) DO UPDATE SET
           payload_json = excluded.payload_json,
           version = ota_campaigns.version + 1,
           updated_at = excluded.updated_at`,
      )
      .run(campaignId, organizationId, plantId, JSON.stringify(campaign), now);
  }

  public hasAppliedOtaVersion(
    gatewayId: string,
    packageId: string,
    targetVersion: string,
  ): boolean {
    const row = this.db
      .prepare(
        "SELECT 1 AS found FROM ota_applied_packages WHERE gateway_id = ? AND package_id = ? AND target_version = ?",
      )
      .get(gatewayId, packageId, targetVersion);
    return Boolean(row);
  }

  public recordAppliedOtaVersion(
    gatewayId: string,
    packageId: string,
    targetVersion: string,
    manifestHash: string,
  ): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO ota_applied_packages (id, gateway_id, package_id, target_version, manifest_hash, applied_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `${gatewayId}:${packageId}:${targetVersion}`,
        gatewayId,
        packageId,
        targetVersion,
        manifestHash,
        new Date().toISOString(),
      );
  }

  public loadOtaSigningKeys(): Array<{
    keyId: string;
    publicKeyPem: string;
    status: "ACTIVE" | "REVOKED";
    revokedReason?: string;
    revokedAt?: string;
  }> {
    const rows = this.db
      .prepare(
        "SELECT key_id, public_key_pem, status, revoked_reason, revoked_at FROM ota_signing_keys",
      )
      .all();
    return rows.map((r) => ({
      keyId: String(r["key_id"]),
      publicKeyPem: String(r["public_key_pem"]),
      status: String(r["status"]) === "REVOKED" ? "REVOKED" : "ACTIVE",
      revokedReason: r["revoked_reason"] ? String(r["revoked_reason"]) : undefined,
      revokedAt: r["revoked_at"] ? String(r["revoked_at"]) : undefined,
    }));
  }

  public saveOtaSigningKey(record: {
    keyId: string;
    publicKeyPem: string;
    status: "ACTIVE" | "REVOKED";
    revokedReason?: string;
    revokedAt?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO ota_signing_keys (key_id, public_key_pem, status, revoked_reason, revoked_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key_id) DO UPDATE SET
           public_key_pem = excluded.public_key_pem,
           status = excluded.status,
           revoked_reason = excluded.revoked_reason,
           revoked_at = excluded.revoked_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.keyId,
        record.publicKeyPem,
        record.status,
        record.revokedReason ?? null,
        record.revokedAt ?? null,
        new Date().toISOString(),
      );
  }

  // ── Provisioning Tokens (Atomic Single-Use Burn) ───────────────────────────
  public loadProvisioningState(): PersistedProvisioningState {
    const tokenRows = this.db
      .prepare("SELECT payload_json, is_consumed, is_revoked, consumed_at FROM provisioning_tokens")
      .all();
    const tokens: ProvisioningToken[] = tokenRows.map((r) => {
      const t = JSON.parse(String(r["payload_json"])) as ProvisioningToken;
      t.isConsumed = Number(r["is_consumed"]) === 1;
      t.isRevoked = Number(r["is_revoked"]) === 1;
      if (r["consumed_at"] !== null && r["consumed_at"] !== undefined) {
        t.consumedAt = Number(r["consumed_at"]);
      }
      return t;
    });

    const stationRows = this.db
      .prepare("SELECT station_key, gateway_id, auth_token_digest FROM provisioned_stations")
      .all();
    const activeAuthTokens: Record<string, { gatewayId: string; authTokenDigest: string }> = {};
    const provisionedStations: Record<string, string> = {};

    for (const r of stationRows) {
      const stationKey = String(r["station_key"]);
      const gatewayId = String(r["gateway_id"]);
      const authTokenDigest = String(r["auth_token_digest"]);
      provisionedStations[stationKey] = gatewayId;
      activeAuthTokens[authTokenDigest] = { gatewayId, authTokenDigest };
    }

    return { tokens, activeAuthTokens, provisionedStations };
  }

  public saveProvisioningToken(token: ProvisioningToken): void {
    const key = token.tokenHash ?? token.token;
    this.db
      .prepare(
        `INSERT INTO provisioning_tokens (
          token_hash, organization_id, plant_id, station_id, payload_json,
          is_consumed, is_revoked, consumed_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(token_hash) DO UPDATE SET
          payload_json = excluded.payload_json,
          is_consumed = excluded.is_consumed,
          is_revoked = excluded.is_revoked,
          consumed_at = excluded.consumed_at,
          version = provisioning_tokens.version + 1`,
      )
      .run(
        key,
        token.organizationId,
        token.plantId,
        token.stationId,
        JSON.stringify(token),
        token.isConsumed ? 1 : 0,
        token.isRevoked ? 1 : 0,
        token.consumedAt ?? null,
      );
  }

  public claimProvisioningTokenAtomic(params: {
    tokenHash: string;
    consumedAt: number;
    stationKey: string;
    gatewayId: string;
    authTokenDigest: string;
  }): { claimed: boolean; reason?: string } {
    return runInTransaction(this.db, () => {
      const existing = this.db
        .prepare(
          "SELECT payload_json, is_consumed, is_revoked FROM provisioning_tokens WHERE token_hash = ?",
        )
        .get(params.tokenHash);
      if (!existing) return { claimed: false, reason: "INVALID_TOKEN" };
      if (Number(existing["is_revoked"]) === 1) return { claimed: false, reason: "TOKEN_REVOKED" };
      if (Number(existing["is_consumed"]) === 1) {
        return { claimed: false, reason: "TOKEN_ALREADY_USED" };
      }

      const parsed = JSON.parse(String(existing["payload_json"])) as ProvisioningToken;
      if (params.consumedAt > parsed.expiresAt) {
        return { claimed: false, reason: "TOKEN_EXPIRED" };
      }

      parsed.isConsumed = true;
      parsed.consumedAt = params.consumedAt;

      const res = this.db
        .prepare(
          `UPDATE provisioning_tokens
           SET is_consumed = 1, consumed_at = ?, payload_json = ?, version = version + 1
           WHERE token_hash = ? AND is_consumed = 0 AND is_revoked = 0`,
        )
        .run(params.consumedAt, JSON.stringify(parsed), params.tokenHash);

      if (Number(res.changes) !== 1) {
        return { claimed: false, reason: "CONCURRENT_CLAIM_CONFLICT" };
      }

      this.db
        .prepare(
          `INSERT INTO provisioned_stations (station_key, gateway_id, auth_token_digest, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(station_key) DO UPDATE SET
             gateway_id = excluded.gateway_id,
             auth_token_digest = excluded.auth_token_digest,
             updated_at = excluded.updated_at`,
        )
        .run(params.stationKey, params.gatewayId, params.authTokenDigest, new Date().toISOString());

      return { claimed: true };
    });
  }

  // ── Transactional Webhook State Machine ────────────────────────────────────
  public beginWebhookEvent(params: {
    provider: "stripe" | "mercadopago";
    eventId: string;
    payloadHash: string;
    leaseMs?: number;
  }): { status: "ACQUIRED" | "ALREADY_PROCESSED" | "IN_FLIGHT"; entry: WebhookLedgerEntry } {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const leaseMs = params.leaseMs ?? 30_000;

    return runInTransaction(this.db, () => {
      const existing = this.db
        .prepare("SELECT * FROM webhook_processing_ledger WHERE provider = ? AND event_id = ?")
        .get(params.provider, params.eventId);

      if (!existing) {
        const entry: WebhookLedgerEntry = {
          provider: params.provider,
          eventId: params.eventId,
          state: "PROCESSING",
          payloadHash: params.payloadHash,
          attempts: 1,
          lockedUntil: nowMs + leaseMs,
          lastError: null,
          updatedAt: nowIso,
        };
        this.db
          .prepare(
            `INSERT INTO webhook_processing_ledger (
              provider, event_id, state, payload_hash, attempts, locked_until, last_error, updated_at
            ) VALUES (?, ?, 'PROCESSING', ?, 1, ?, NULL, ?)`,
          )
          .run(params.provider, params.eventId, params.payloadHash, entry.lockedUntil, nowIso);
        return { status: "ACQUIRED", entry };
      }

      const currentState = String(existing["state"]) as WebhookLedgerEntry["state"];
      const lockedUntil = existing["locked_until"] ? Number(existing["locked_until"]) : 0;

      if (currentState === "PROCESSED") {
        return {
          status: "ALREADY_PROCESSED",
          entry: mapWebhookRow(existing),
        };
      }

      if (currentState === "PROCESSING" && lockedUntil > nowMs) {
        return {
          status: "IN_FLIGHT",
          entry: mapWebhookRow(existing),
        };
      }

      // RETRYABLE, FAILED, or expired lease PROCESSING -> acquire cleanly
      const nextAttempts = Number(existing["attempts"] ?? 0) + 1;
      const nextLock = nowMs + leaseMs;
      this.db
        .prepare(
          `UPDATE webhook_processing_ledger
           SET state = 'PROCESSING', payload_hash = ?, attempts = ?, locked_until = ?, updated_at = ?
           WHERE provider = ? AND event_id = ?`,
        )
        .run(params.payloadHash, nextAttempts, nextLock, nowIso, params.provider, params.eventId);

      const updated = this.db
        .prepare("SELECT * FROM webhook_processing_ledger WHERE provider = ? AND event_id = ?")
        .get(params.provider, params.eventId)!;

      return { status: "ACQUIRED", entry: mapWebhookRow(updated) };
    });
  }

  public completeWebhookEvent(params: {
    provider: "stripe" | "mercadopago";
    eventId: string;
    state: "PROCESSED" | "FAILED" | "RETRYABLE";
    lastError?: string;
  }): void {
    this.db
      .prepare(
        `UPDATE webhook_processing_ledger
         SET state = ?, locked_until = NULL, last_error = ?, updated_at = ?
         WHERE provider = ? AND event_id = ?`,
      )
      .run(
        params.state,
        params.lastError ?? null,
        new Date().toISOString(),
        params.provider,
        params.eventId,
      );
  }

  public getWebhookEvent(
    provider: "stripe" | "mercadopago",
    eventId: string,
  ): WebhookLedgerEntry | undefined {
    const row = this.db
      .prepare("SELECT * FROM webhook_processing_ledger WHERE provider = ? AND event_id = ?")
      .get(provider, eventId);
    return row ? mapWebhookRow(row) : undefined;
  }

  public close(): void {
    this.db.close?.();
  }
}

function mapWebhookRow(row: Record<string, unknown>): WebhookLedgerEntry {
  return {
    provider: String(row["provider"]) as "stripe" | "mercadopago",
    eventId: String(row["event_id"]),
    state: String(row["state"]) as WebhookLedgerEntry["state"],
    payloadHash: String(row["payload_hash"]),
    attempts: Number(row["attempts"] ?? 1),
    lockedUntil: row["locked_until"] ? Number(row["locked_until"]) : null,
    lastError: row["last_error"] ? String(row["last_error"]) : null,
    updatedAt: String(row["updated_at"]),
  };
}

export function createSqliteFleetStorage(dbPath?: string): SqliteFleetStorageBackend {
  return new SqliteFleetStorageBackend(dbPath);
}

export function resolveDefaultFleetDbPath(): string {
  const configured =
    typeof process !== "undefined" && process.env
      ? process.env["ELETRICAI_FLEET_DB_PATH"]
      : undefined;
  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }
  const isVitest =
    typeof process !== "undefined" &&
    Boolean(process.env["VITEST"] || process.env["NODE_ENV"] === "test");
  if (isVitest) {
    return ":memory:";
  }
  return path.join(process.cwd(), "data", "eletricai-fleet.sqlite");
}
