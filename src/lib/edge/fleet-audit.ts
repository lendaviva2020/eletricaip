// ELÉTRICAI INDUSTRIAL OS — FLEET AUDIT & TAMPER-EVIDENT EVENT LOGGING
// Standards: IEC 62443-4-2, 21 CFR Part 11, NIST SP 800-82 Rev. 3

import { createHash } from "node:crypto";
import type { FleetAuditEvent, FleetRole } from "./types";

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

export class FleetAuditManager {
  private events: FleetAuditEvent[] = [];
  private lastHash: string = "GENESIS_FLEET_AUDIT_BLOCK_00000000000000000000000000000000";

  public recordEvent(params: CreateFleetAuditEventParams): FleetAuditEvent {
    const timestamp = Date.now();
    const id = `aud_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;
    const correlationId =
      params.correlationId || `corr_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
    const details = params.details || {};

    const rawDataToHash = JSON.stringify({
      previousHash: this.lastHash,
      id,
      timestamp,
      actor: params.actor,
      source: params.source,
      gatewayId: params.gatewayId,
      plantId: params.plantId,
      organizationId: params.organizationId,
      eventType: params.eventType,
      severity: params.severity,
      result: params.result,
      correlationId,
      details,
    });

    const tamperProofHash = createHash("sha256").update(rawDataToHash).digest("hex");
    this.lastHash = tamperProofHash;

    const event: FleetAuditEvent = {
      id,
      timestamp,
      actor: params.actor,
      source: params.source,
      gatewayId: params.gatewayId,
      plantId: params.plantId,
      organizationId: params.organizationId,
      eventType: params.eventType,
      severity: params.severity,
      result: params.result,
      correlationId,
      lifecycleState: "PROCESSED",
      details,
      tamperProofHash,
    };

    this.events.push(event);
    return event;
  }

  public acknowledgeEvent(eventId: string, acknowledgedBy: string): boolean {
    const event = this.events.find((e) => e.id === eventId);
    if (!event) return false;
    event.lifecycleState = "ACKNOWLEDGED";
    event.details = {
      ...event.details,
      acknowledgedBy,
      acknowledgedAt: Date.now(),
    };
    return true;
  }

  public getEvents(filter?: {
    organizationId?: string;
    plantId?: string;
    gatewayId?: string;
    severity?: "INFO" | "WARNING" | "CRITICAL";
    eventType?: string;
    limit?: number;
  }): FleetAuditEvent[] {
    let result = [...this.events];

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
    let currentPrev = "GENESIS_FLEET_AUDIT_BLOCK_00000000000000000000000000000000";

    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      const raw = JSON.stringify({
        previousHash: currentPrev,
        id: e.id,
        timestamp: e.timestamp,
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

      const recalculated = createHash("sha256").update(raw).digest("hex");
      if (recalculated !== e.tamperProofHash) {
        return { isValid: false, brokenAtIndex: i };
      }
      currentPrev = e.tamperProofHash;
    }

    return { isValid: true };
  }

  public clear(): void {
    this.events = [];
    this.lastHash = "GENESIS_FLEET_AUDIT_BLOCK_00000000000000000000000000000000";
  }
}

export const fleetAuditManager = new FleetAuditManager();
