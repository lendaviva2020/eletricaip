// ELÉTRICAI INDUSTRIAL OS — FLEET AUDIT & TAMPER-EVIDENT EVENT LOGGING (GATE 4.3.1)
// Standards: IEC 62443-4-2, 21 CFR Part 11, NIST SP 800-82 Rev. 3
// Append-only hash-chained ledger: historical events are NEVER mutated (acknowledgements emit new chained events).

import { sha256Hex } from "../security/isomorphic-crypto";
import type { FleetAuditEvent, FleetRole, FleetStorageBackend } from "./types";

export const AUDIT_GENESIS_HASH = "GENESIS_FLEET_AUDIT_BLOCK_00000000000000000000000000000000";
export const AUDIT_SCHEMA_VERSION = "4.3.1";

export interface CreateFleetAuditEventParams {
  actor: {
    id: string;
    email: string;
    role: FleetRole;
  };
  source: "EDGE_DAEMON" | "CLOUD_SERVER" | "ADMIN_CONSOLE";
  gatewayId: string;
  plantId: string;
  organizationId: string;
  eventType: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  result: "SUCCESS" | "FAILED" | "DENIED";
  correlationId?: string;
  details?: Record<string, any>;
}

/**
 * Deterministic RFC 8785-inspired canonical JSON serializer with sorted object keys.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${entries.join(",")}}`;
}

function isProductionEnv(): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  return process.env["NODE_ENV"] === "production" || process.env["VERCEL_ENV"] === "production";
}

export class FleetAuditManager {
  private events: FleetAuditEvent[] = [];
  private lastHash: string = AUDIT_GENESIS_HASH;
  private store?: FleetStorageBackend;

  constructor(options?: { store?: FleetStorageBackend }) {
    if (options?.store) {
      this.attachStorageBackend(options.store);
    }
  }

  public attachStorageBackend(store: FleetStorageBackend): void {
    this.store = store;
    const persisted = store.loadAuditEvents();
    if (persisted.length > 0) {
      this.events = persisted;
      this.lastHash = persisted[persisted.length - 1].tamperProofHash;
      return;
    }

    // If pre-attachment boot events exist in memory while DB is empty, persist them in order
    if (this.events.length > 0) {
      let prev = AUDIT_GENESIS_HASH;
      for (const ev of this.events) {
        store.appendAuditEvent(ev, prev);
        prev = ev.tamperProofHash;
      }
      this.lastHash = prev;
    }
  }

  private computeEventHash(
    previousHash: string,
    event: Omit<FleetAuditEvent, "tamperProofHash" | "lifecycleState" | "previousHash">,
  ): string {
    const canonicalPayload = canonicalJson({
      previousHash,
      schemaVersion: event.schemaVersion ?? AUDIT_SCHEMA_VERSION,
      id: event.id,
      timestamp: event.timestamp,
      actor: event.actor,
      source: event.source,
      gatewayId: event.gatewayId,
      plantId: event.plantId,
      organizationId: event.organizationId,
      eventType: event.eventType,
      severity: event.severity,
      result: event.result,
      correlationId: event.correlationId,
      details: event.details,
    });
    return sha256Hex(canonicalPayload);
  }

  public recordEvent(params: CreateFleetAuditEventParams): FleetAuditEvent {
    const timestamp = Date.now();
    const id = `aud_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
    const correlationId =
      params.correlationId || `corr_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
    const details = params.details ? structuredClone(params.details) : {};
    const previousHash = this.lastHash;

    const unsigned = {
      id,
      timestamp,
      schemaVersion: AUDIT_SCHEMA_VERSION,
      actor: { ...params.actor },
      source: params.source,
      gatewayId: params.gatewayId,
      plantId: params.plantId,
      organizationId: params.organizationId,
      eventType: params.eventType,
      severity: params.severity,
      result: params.result,
      correlationId,
      details,
    };

    const tamperProofHash = this.computeEventHash(previousHash, unsigned);

    const event: FleetAuditEvent = {
      ...unsigned,
      previousHash,
      lifecycleState: "PROCESSED",
      tamperProofHash,
    };

    if (this.store) {
      this.store.appendAuditEvent(event, previousHash);
    }

    this.lastHash = tamperProofHash;
    this.events.push(event);
    return event;
  }

  /**
   * Append-only acknowledgement: NEVER mutates historical event payload or hash.
   * Instead appends a new `GATEWAY_EVENT_ACKNOWLEDGED` block referencing original id & hash.
   */
  public acknowledgeEventAndGetRecord(
    eventId: string,
    acknowledgedBy: string,
    actorOverride?: { id?: string; email?: string; role?: FleetRole },
  ): FleetAuditEvent | null {
    const original = this.events.find((e) => e.id === eventId);
    if (!original) return null;

    return this.recordEvent({
      actor: {
        id: actorOverride?.id ?? acknowledgedBy,
        email: actorOverride?.email ?? acknowledgedBy,
        role: actorOverride?.role ?? "AUDITOR",
      },
      source: "ADMIN_CONSOLE",
      gatewayId: original.gatewayId,
      plantId: original.plantId,
      organizationId: original.organizationId,
      eventType: "GATEWAY_EVENT_ACKNOWLEDGED",
      severity: "INFO",
      result: "SUCCESS",
      correlationId: original.correlationId,
      details: {
        acknowledgedEventId: original.id,
        acknowledgedEventHash: original.tamperProofHash,
        originalEventType: original.eventType,
        acknowledgedBy,
        acknowledgedAt: Date.now(),
      },
    });
  }

  public acknowledgeEvent(
    eventId: string,
    acknowledgedBy: string,
    actorOverride?: { id?: string; email?: string; role?: FleetRole },
  ): boolean {
    return this.acknowledgeEventAndGetRecord(eventId, acknowledgedBy, actorOverride) !== null;
  }

  public getAcknowledgedEventIds(): Set<string> {
    const ids = new Set<string>();
    for (const ev of this.events) {
      if (
        ev.eventType === "GATEWAY_EVENT_ACKNOWLEDGED" &&
        typeof ev.details?.["acknowledgedEventId"] === "string"
      ) {
        ids.add(ev.details["acknowledgedEventId"]);
      }
    }
    return ids;
  }

  public getEvents(filter?: {
    organizationId?: string;
    plantId?: string;
    gatewayId?: string;
    severity?: "INFO" | "WARNING" | "CRITICAL";
    eventType?: string;
    limit?: number;
  }): FleetAuditEvent[] {
    const ackedIds = this.getAcknowledgedEventIds();
    const list = this.store ? this.store.loadAuditEvents() : this.events;
    if (this.store && list.length !== this.events.length) {
      this.events = list;
      if (list.length > 0) {
        this.lastHash = list[list.length - 1].tamperProofHash;
      }
    }

    let result = list.map((ev) =>
      ackedIds.has(ev.id) ? { ...ev, lifecycleState: "ACKNOWLEDGED" as const } : { ...ev },
    );

    if (filter?.organizationId) {
      result = result.filter((e) => e.organizationId === filter.organizationId);
    }
    if (filter?.plantId) {
      result = result.filter((e) => e.plantId === filter.plantId);
    }
    if (filter?.gatewayId) {
      result = result.filter((e) => e.gatewayId === filter.gatewayId);
    }
    if (filter?.severity) {
      result = result.filter((e) => e.severity === filter.severity);
    }
    if (filter?.eventType) {
      result = result.filter((e) => e.eventType === filter.eventType);
    }

    result.sort((a, b) => b.timestamp - a.timestamp);

    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result;
  }

  public verifyAuditChainIntegrity(): { isValid: boolean; brokenAtIndex?: number } {
    // Keep reference to live in-memory events if modified in tamper-detection unit tests
    let currentPrev = AUDIT_GENESIS_HASH;

    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      if (e.previousHash !== undefined && e.previousHash !== currentPrev) {
        return { isValid: false, brokenAtIndex: i };
      }

      const recalculated = this.computeEventHash(currentPrev, {
        id: e.id,
        timestamp: e.timestamp,
        schemaVersion: e.schemaVersion ?? AUDIT_SCHEMA_VERSION,
        actor: e.actor,
        source: e.source,
        gatewayId: e.gatewayId,
        plantId: e.plantId,
        organizationId: e.organizationId,
        eventType: e.eventType,
        severity: e.severity,
        result: e.result,
        correlationId: e.correlationId,
        details: e.details,
      });

      if (recalculated !== e.tamperProofHash) {
        return { isValid: false, brokenAtIndex: i };
      }
      currentPrev = e.tamperProofHash;
    }

    return { isValid: true };
  }

  /**
   * Reset is PERMANENTLY BLOCKED in production and whenever attached to persistent append-only DB.
   * Allowed solely on isolated in-memory unit test instances (`!this.store && !isProductionEnv()`).
   */
  public clear(): void {
    if (isProductionEnv() || this.store) {
      throw new Error(
        "AUDIT_CHAIN_IMMUTABLE: clear() é permanentemente bloqueado em produção e contra cadeias persistentes.",
      );
    }
    this.events = [];
    this.lastHash = AUDIT_GENESIS_HASH;
  }
}

export const fleetAuditManager = new FleetAuditManager();
