// ELÉTRICAI INDUSTRIAL OS — EDGE STORE-AND-FORWARD BUFFER (OUTBOX ENGINE)
// Transactional Persistence, SQLite WAL Mode, Sequence Numbering, Backpressure, Idempotency, Criticality & Crash Recovery
// Standards: IEC 62443, NIST SP 800-82 Rev. 3, RFC 8446

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { OutboxSampleEntry, BufferStatistics, TagQuality, ProtocolDriver } from "../types";

let BunDatabaseClass: any = null;
try {
  const req = createRequire(import.meta.url);
  BunDatabaseClass = req("bun:sqlite").Database;
} catch {
  // Gracefully fallback when running under Node.js or browser vitest environment
  BunDatabaseClass = null;
}

export interface OutboxOptions {
  dbPath?: string;
  maxSamples?: number;
  maxDiskBytes?: number;
  saturationPolicy?: "DROP_OLDEST_NON_CRITICAL" | "DROP_NEWEST_WITH_ALARM";
  warnThresholdPercent?: number;
  synchronous?: "NORMAL" | "FULL" | "OFF";
  busyTimeoutMs?: number;
}

export class PersistentEdgeOutbox {
  private db: any = null;
  private dbPath: string;
  private sequenceCounter: number = 0;
  private maxSamples: number;
  private maxDiskBytes: number;
  private saturationPolicy: "DROP_OLDEST_NON_CRITICAL" | "DROP_NEWEST_WITH_ALARM";
  private warnThresholdPercent: number;
  private droppedCount: number = 0;
  private acknowledgedCount: number = 0;
  private isClosed: boolean = false;
  private useNativeSqlite: boolean = false;
  private currentActiveCount: number = 0;
  private isDegraded: boolean = false;
  private lastDegradationReason?: string;

  // Prepared statements for maximum high-throughput telemetry performance (<10us/op)
  private insertStmt: any = null;
  private countStmt: any = null;
  private oldestStmt: any = null;
  private deleteByIdStmt: any = null;

  // In-memory fallback map when running under Node.js
  private memoryEntries: Map<string, OutboxSampleEntry> = new Map();

  constructor(options?: OutboxOptions) {
    this.maxSamples = options?.maxSamples ?? 50000;
    this.maxDiskBytes = options?.maxDiskBytes ?? 100 * 1024 * 1024; // 100 MB default
    this.saturationPolicy = options?.saturationPolicy ?? "DROP_OLDEST_NON_CRITICAL";
    this.warnThresholdPercent = options?.warnThresholdPercent ?? 80;
    this.dbPath = options?.dbPath ?? ":memory:";

    if (BunDatabaseClass) {
      this.useNativeSqlite = true;
      if (this.dbPath !== ":memory:") {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }

      this.db = new BunDatabaseClass(this.dbPath);
      this.configurePragmas(options?.synchronous ?? "NORMAL", options?.busyTimeoutMs ?? 5000);
      this.initializeSchema();
      this.prepareStatements();
      this.recoverFromAbruptShutdown();
    }
  }

  public isUsingNativeSqlite(): boolean {
    return this.useNativeSqlite;
  }

  private configurePragmas(synchronous: string, busyTimeoutMs: number): void {
    if (this.dbPath !== ":memory:") {
      this.db.run("PRAGMA journal_mode = WAL;");
    }
    this.db.run(`PRAGMA synchronous = ${synchronous};`);
    this.db.run(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
    this.db.run("PRAGMA foreign_keys = ON;");
  }

  private initializeSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS outbox_samples (
        id TEXT PRIMARY KEY,
        sequence_number INTEGER NOT NULL,
        project_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        plant_id TEXT NOT NULL,
        gateway_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        tag_name TEXT NOT NULL,
        value REAL NOT NULL,
        raw_sample_value REAL,
        quality TEXT NOT NULL,
        source TEXT NOT NULL,
        source_timestamp INTEGER NOT NULL,
        edge_received_at INTEGER NOT NULL,
        cloud_received_at INTEGER,
        delivery_state TEXT NOT NULL CHECK(delivery_state IN ('PENDING', 'IN_FLIGHT', 'ACKNOWLEDGED', 'DROPPED_SATURATION')),
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER,
        is_delayed_replay INTEGER NOT NULL DEFAULT 0,
        criticality TEXT NOT NULL DEFAULT 'NORMAL' CHECK(criticality IN ('NORMAL', 'CRITICAL'))
      );
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_outbox_state ON outbox_samples(delivery_state, sequence_number);
    `);

    this.db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_idempotency ON outbox_samples(gateway_id, tag_name, source_timestamp);
    `);

    const maxSeqRow = this.db
      .query("SELECT MAX(sequence_number) as max_seq, COUNT(*) as total FROM outbox_samples;")
      .get() as { max_seq: number | null; total: number | null };
    this.sequenceCounter = maxSeqRow?.max_seq ?? 0;
    this.currentActiveCount = maxSeqRow?.total ?? 0;
  }

  private prepareStatements(): void {
    if (!this.db) return;
    this.insertStmt = this.db.prepare(
      `INSERT OR REPLACE INTO outbox_samples (
        id, sequence_number, project_id, organization_id, plant_id, gateway_id, connection_id,
        tag_name, value, raw_sample_value, quality, source, source_timestamp,
        edge_received_at, delivery_state, attempts, is_delayed_replay, criticality
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, 0, ?);`,
    );

    this.countStmt = this.db.prepare(
      "SELECT COUNT(*) as total FROM outbox_samples WHERE delivery_state IN ('PENDING', 'IN_FLIGHT');",
    );

    // Prioritize non-critical records first when dropping under quota saturation
    this.oldestStmt = this.db.prepare(
      `SELECT id FROM outbox_samples
       WHERE delivery_state = 'PENDING'
       ORDER BY CASE WHEN criticality = 'CRITICAL' THEN 1 ELSE 0 END ASC, sequence_number ASC
       LIMIT 1;`,
    );

    this.deleteByIdStmt = this.db.prepare("DELETE FROM outbox_samples WHERE id = ?;");
  }

  /**
   * Recovers in-flight transactions stranded after abrupt process termination / crash / power outage.
   * Any sample left in 'IN_FLIGHT' is marked 'PENDING' with is_delayed_replay = 1.
   */
  public recoverFromAbruptShutdown(): number {
    if (this.useNativeSqlite && this.db) {
      const res = this.db.run(`
        UPDATE outbox_samples
        SET delivery_state = 'PENDING',
            is_delayed_replay = 1
        WHERE delivery_state = 'IN_FLIGHT';
      `);
      return res.changes;
    }

    let recovered = 0;
    for (const entry of this.memoryEntries.values()) {
      if (entry.deliveryState === "IN_FLIGHT") {
        entry.deliveryState = "PENDING";
        entry.isDelayedReplay = true;
        recovered++;
      }
    }
    return recovered;
  }

  /**
   * Enqueues an acquired industrial telemetry sample into the persistent transactional outbox.
   * Assigns a monotonic sequenceNumber, records arrival timestamps, enforces buffer quotas,
   * and prioritizes critical alarms/audit events with immediate persistence.
   */
  public enqueue(sample: {
    projectId: string;
    organizationId: string;
    plantId: string;
    gatewayId: string;
    connectionId: string;
    tagName: string;
    value: number;
    rawSampleValue?: number;
    quality: TagQuality;
    source: ProtocolDriver;
    sourceTimestamp: number;
    edgeReceivedAt?: number;
    criticality?: "NORMAL" | "CRITICAL";
  }): OutboxSampleEntry | null {
    if (this.isClosed) {
      throw new Error("OUTBOX_CLOSED: Cannot enqueue to closed persistent outbox.");
    }

    const now = Date.now();
    const edgeReceivedAt = sample.edgeReceivedAt ?? now;
    const criticality = sample.criticality ?? "NORMAL";

    if (this.useNativeSqlite && this.db && this.insertStmt) {
      // Saturation check using in-memory tracker (zero SQL latency)
      if (this.currentActiveCount >= this.maxSamples) {
        if (this.saturationPolicy === "DROP_NEWEST_WITH_ALARM") {
          this.droppedCount++;
          return null;
        }

        const oldestRow = this.oldestStmt.get() as { id: string } | null;
        if (oldestRow) {
          this.deleteByIdStmt.run(oldestRow.id);
          this.currentActiveCount = Math.max(0, this.currentActiveCount - 1);
          this.droppedCount++;
        }
      }

      this.sequenceCounter++;
      this.currentActiveCount++;
      const id = `smp_${crypto.randomUUID()}`;

      try {
        this.insertStmt.run(
          id,
          this.sequenceCounter,
          sample.projectId,
          sample.organizationId,
          sample.plantId,
          sample.gatewayId,
          sample.connectionId,
          sample.tagName,
          sample.value,
          sample.rawSampleValue ?? null,
          sample.quality,
          sample.source,
          sample.sourceTimestamp,
          edgeReceivedAt,
          criticality,
        );

        // Immediate WAL checkpoint flush for critical audit/alarm transactions
        if (criticality === "CRITICAL" && this.dbPath !== ":memory:") {
          try {
            this.db.run("PRAGMA wal_checkpoint(PASSIVE);");
          } catch (chkErr: any) {
            // Signal degradation if checkpoint cannot be completed
            this.isDegraded = true;
            this.lastDegradationReason = `WAL_CHECKPOINT_DEGRADED: ${chkErr?.message ?? "Falha de checkpoint"}`;
          }
        }
      } catch (err: any) {
        this.droppedCount++;
        if (criticality === "CRITICAL") {
          this.isDegraded = true;
          this.lastDegradationReason = `CRITICAL_EVENT_PERSISTENCE_FAILED: Falha na persistência física do alarme/evento (${err?.message ?? "Falha de disco"}).`;
          throw new Error(
            `CRITICAL_EVENT_PERSISTENCE_FAILED: Falha na persistência física de evento crítico no SQLite WAL: ${err?.message ?? "Falha de disco"}`,
          );
        }
        return null;
      }

      return {
        id,
        sequenceNumber: this.sequenceCounter,
        projectId: sample.projectId,
        organizationId: sample.organizationId,
        plantId: sample.plantId,
        gatewayId: sample.gatewayId,
        connectionId: sample.connectionId,
        tagName: sample.tagName,
        value: sample.value,
        rawSampleValue: sample.rawSampleValue,
        quality: sample.quality,
        source: sample.source,
        sourceTimestamp: sample.sourceTimestamp,
        edgeReceivedAt,
        deliveryState: "PENDING",
        attempts: 0,
        isDelayedReplay: false,
        criticality,
      };
    }

    // In-memory fallback
    for (const existing of this.memoryEntries.values()) {
      if (
        existing.gatewayId === sample.gatewayId &&
        existing.tagName === sample.tagName &&
        existing.sourceTimestamp === sample.sourceTimestamp
      ) {
        return existing; // Idempotent duplicate
      }
    }

    if (this.memoryEntries.size >= this.maxSamples) {
      if (this.saturationPolicy === "DROP_NEWEST_WITH_ALARM") {
        this.droppedCount++;
        return null;
      }

      // Drop oldest non-critical first
      let keyToDrop: string | undefined;
      for (const [k, v] of this.memoryEntries.entries()) {
        if (v.criticality !== "CRITICAL") {
          keyToDrop = k;
          break;
        }
      }
      if (!keyToDrop) {
        keyToDrop = this.memoryEntries.keys().next().value;
      }

      if (keyToDrop) {
        this.memoryEntries.delete(keyToDrop);
        this.droppedCount++;
      }
    }

    this.sequenceCounter++;
    const id = `smp_${crypto.randomUUID()}`;

    const entry: OutboxSampleEntry = {
      id,
      sequenceNumber: this.sequenceCounter,
      projectId: sample.projectId,
      organizationId: sample.organizationId,
      plantId: sample.plantId,
      gatewayId: sample.gatewayId,
      connectionId: sample.connectionId,
      tagName: sample.tagName,
      value: sample.value,
      rawSampleValue: sample.rawSampleValue,
      quality: sample.quality,
      source: sample.source,
      sourceTimestamp: sample.sourceTimestamp,
      edgeReceivedAt,
      deliveryState: "PENDING",
      attempts: 0,
      isDelayedReplay: false,
      criticality,
    };

    this.memoryEntries.set(id, entry);
    return entry;
  }

  public enqueueBatch(samples: Array<Parameters<PersistentEdgeOutbox["enqueue"]>[0]>): number {
    let count = 0;
    if (this.useNativeSqlite && this.db) {
      const tx = this.db.transaction(() => {
        for (const s of samples) {
          if (this.enqueue(s)) count++;
        }
      });
      tx();
      return count;
    }

    for (const s of samples) {
      if (this.enqueue(s)) count++;
    }
    return count;
  }

  /**
   * Peeks the next batch of pending samples for transmission to the cloud.
   * Atomically marks them as IN_FLIGHT and increments transmission attempts.
   */
  public peekPendingBatch(batchSize: number = 200): OutboxSampleEntry[] {
    if (this.isClosed) return [];
    const now = Date.now();

    if (this.useNativeSqlite && this.db) {
      const rows = this.db
        .query(
          `SELECT * FROM outbox_samples
         WHERE delivery_state = 'PENDING'
         ORDER BY sequence_number ASC
         LIMIT ?;`,
        )
        .all(batchSize) as any[];

      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => "?").join(",");

      this.db.run(
        `UPDATE outbox_samples
         SET delivery_state = 'IN_FLIGHT',
             attempts = attempts + 1,
             last_attempt_at = ?
         WHERE id IN (${placeholders});`,
        [now, ...ids],
      );

      return rows.map((r) => ({
        id: r.id,
        sequenceNumber: r.sequence_number,
        projectId: r.project_id,
        organizationId: r.organization_id,
        plantId: r.plant_id,
        gatewayId: r.gateway_id,
        connectionId: r.connection_id,
        tagName: r.tag_name,
        value: r.value,
        rawSampleValue: r.raw_sample_value ?? undefined,
        quality: r.quality as TagQuality,
        source: r.source as ProtocolDriver,
        sourceTimestamp: r.source_timestamp,
        edgeReceivedAt: r.edge_received_at,
        cloudReceivedAt: r.cloud_received_at ?? undefined,
        deliveryState: "IN_FLIGHT",
        attempts: r.attempts + 1,
        lastAttemptAt: now,
        isDelayedReplay: Boolean(r.is_delayed_replay),
        criticality: r.criticality as "NORMAL" | "CRITICAL",
      }));
    }

    const batch: OutboxSampleEntry[] = [];
    for (const entry of this.memoryEntries.values()) {
      if (entry.deliveryState === "PENDING") {
        entry.deliveryState = "IN_FLIGHT";
        entry.attempts++;
        entry.lastAttemptAt = now;
        batch.push({ ...entry });
        if (batch.length >= batchSize) break;
      }
    }
    return batch;
  }

  /**
   * Confirms delivery of a transmitted batch by sample IDs.
   * Removes confirmed samples from the persistent queue to reclaim storage.
   */
  public acknowledgeBatch(sampleIds: string[]): number {
    if (this.isClosed || sampleIds.length === 0) return 0;

    if (this.useNativeSqlite && this.db) {
      const placeholders = sampleIds.map(() => "?").join(",");
      const res = this.db.run(
        `DELETE FROM outbox_samples WHERE id IN (${placeholders});`,
        sampleIds,
      );
      this.acknowledgedCount += res.changes;
      this.currentActiveCount = Math.max(0, this.currentActiveCount - res.changes);
      return res.changes;
    }

    let acked = 0;
    for (const id of sampleIds) {
      if (this.memoryEntries.delete(id)) {
        this.acknowledgedCount++;
        acked++;
      }
    }
    return acked;
  }

  /**
   * Requeues in-flight samples that timed out or failed to transmit during network outages.
   */
  public requeueInFlight(): number {
    if (this.isClosed) return 0;

    if (this.useNativeSqlite && this.db) {
      const res = this.db.run(`
        UPDATE outbox_samples
        SET delivery_state = 'PENDING',
            is_delayed_replay = 1
        WHERE delivery_state = 'IN_FLIGHT';
      `);
      return res.changes;
    }

    let requeued = 0;
    for (const entry of this.memoryEntries.values()) {
      if (entry.deliveryState === "IN_FLIGHT") {
        entry.deliveryState = "PENDING";
        entry.isDelayedReplay = true;
        requeued++;
      }
    }
    return requeued;
  }

  /**
   * Returns current buffer diagnostics and storage health metrics.
   */
  public getStatistics(): BufferStatistics {
    if (this.isClosed) {
      return {
        totalSamplesStored: 0,
        pendingUploadCount: 0,
        inFlightCount: 0,
        acknowledgedCount: this.acknowledgedCount,
        droppedSaturationCount: this.droppedCount,
        diskBytesUsed: 0,
        diskLimitBytes: this.maxDiskBytes,
        isNearLimit: false,
        saturationPolicy: this.saturationPolicy,
      };
    }

    if (this.useNativeSqlite && this.db) {
      const counts = this.db
        .query(
          `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN delivery_state = 'PENDING' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN delivery_state = 'IN_FLIGHT' THEN 1 ELSE 0 END) as in_flight,
          MIN(CASE WHEN delivery_state = 'PENDING' THEN edge_received_at ELSE NULL END) as oldest_ts
        FROM outbox_samples;
      `,
        )
        .get() as {
        total: number;
        pending: number | null;
        in_flight: number | null;
        oldest_ts: number | null;
      };

      const totalSamplesStored = counts?.total ?? 0;
      const pendingUploadCount = counts?.pending ?? 0;
      const inFlightCount = counts?.in_flight ?? 0;
      const oldestSampleTimestamp = counts?.oldest_ts ?? undefined;
      const oldestSampleAgeSeconds = oldestSampleTimestamp
        ? Math.max(0, Math.floor((Date.now() - oldestSampleTimestamp) / 1000))
        : 0;

      let diskBytesUsed = totalSamplesStored * 256;
      if (this.dbPath !== ":memory:" && fs.existsSync(this.dbPath)) {
        try {
          const stat = fs.statSync(this.dbPath);
          diskBytesUsed = stat.size;
          const walPath = `${this.dbPath}-wal`;
          if (fs.existsSync(walPath)) {
            diskBytesUsed += fs.statSync(walPath).size;
          }
        } catch {
          // Fallback to estimation
        }
      }

      const capacityPercent = (totalSamplesStored / this.maxSamples) * 100;
      const isNearLimit = capacityPercent >= this.warnThresholdPercent;
      const isNearCapacity80Percent = capacityPercent >= 80;

      return {
        totalSamplesStored,
        pendingUploadCount,
        inFlightCount,
        acknowledgedCount: this.acknowledgedCount,
        droppedSaturationCount: this.droppedCount,
        diskBytesUsed,
        diskLimitBytes: this.maxDiskBytes,
        isNearLimit,
        saturationPolicy: this.saturationPolicy,
        oldestSampleTimestamp,
        oldestSampleAgeSeconds,
        isNearCapacity80Percent,
        isDegraded: this.isDegraded,
        lastDegradationReason: this.lastDegradationReason,
      };
    }

    let pendingCount = 0;
    let inFlightCount = 0;
    let oldestTimestamp: number | undefined;

    for (const entry of this.memoryEntries.values()) {
      if (entry.deliveryState === "PENDING") {
        pendingCount++;
        if (oldestTimestamp === undefined || entry.edgeReceivedAt < oldestTimestamp) {
          oldestTimestamp = entry.edgeReceivedAt;
        }
      } else if (entry.deliveryState === "IN_FLIGHT") {
        inFlightCount++;
      }
    }

    const diskBytesUsed = this.memoryEntries.size * 256;
    const capacityPercent = (this.memoryEntries.size / this.maxSamples) * 100;
    const isNearLimit = capacityPercent >= this.warnThresholdPercent;
    const isNearCapacity80Percent = capacityPercent >= 80;
    const oldestAgeSeconds = oldestTimestamp
      ? Math.max(0, Math.floor((Date.now() - oldestTimestamp) / 1000))
      : 0;

    return {
      totalSamplesStored: this.memoryEntries.size,
      pendingUploadCount: pendingCount,
      inFlightCount,
      acknowledgedCount: this.acknowledgedCount,
      droppedSaturationCount: this.droppedCount,
      diskBytesUsed,
      diskLimitBytes: this.maxDiskBytes,
      isNearLimit,
      saturationPolicy: this.saturationPolicy,
      oldestSampleTimestamp: oldestTimestamp,
      oldestSampleAgeSeconds: oldestAgeSeconds,
      isNearCapacity80Percent,
      isDegraded: this.isDegraded,
      lastDegradationReason: this.lastDegradationReason,
    };
  }

  public setDegraded(reason: string): void {
    this.isDegraded = true;
    this.lastDegradationReason = reason;
  }

  public resetDegradation(): void {
    this.isDegraded = false;
    this.lastDegradationReason = undefined;
  }

  /**
   * Truncates the WAL log and safely closes the database connection.
   */
  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    if (this.useNativeSqlite && this.db) {
      try {
        if (this.dbPath !== ":memory:") {
          this.db.run("PRAGMA wal_checkpoint(TRUNCATE);");
        }
        this.db.close();
      } catch {
        // Ignore errors on close
      }
    }
  }

  public clear(): void {
    if (this.isClosed) return;
    if (this.useNativeSqlite && this.db) {
      this.db.run("DELETE FROM outbox_samples;");
    } else {
      this.memoryEntries.clear();
    }
    this.sequenceCounter = 0;
    this.currentActiveCount = 0;
    this.droppedCount = 0;
    this.acknowledgedCount = 0;
  }
}
