// ELÉTRICAI INDUSTRIAL OS — EDGE FLEET RPC HANDLERS (SERVER-ONLY)
// Keeps node:sqlite / node:fs / node:crypto server modules strictly out of Vite client bundles.

import { cloudGatewayRegistry } from "./cloud-gateway-registry";
import {
  resolveAuthenticatedFleetContext,
  resolveAuthoritativeGatewayForActor,
} from "./fleet-auth-context.server";
import { fleetAuditManager } from "./fleet-audit";
import { fleetCertificateManager } from "./fleet-certificates";
import { edgeFleetManager, type GatewayHeartbeatTelemetry } from "./fleet-manager";
import { fleetRbacEngine } from "./fleet-rbac";
import { ensurePersistentFleetRuntime } from "./fleet-runtime.server";
import { remoteConfigManager } from "./remote-config";
import { signedUpdateManager } from "./signed-updates";
import type {
  EdgeHardwareArch,
  EdgeOperationalState,
  FleetAuditEvent,
  FleetGatewaySummary,
  FleetMetricsSummary,
  RemoteConfigPayload,
  SignedUpdateManifest,
} from "./types";

export interface FleetGatewayFilter {
  organizationId?: string;
  plantId?: string;
  sector?: string;
  operationalState?: EdgeOperationalState;
  hardwareArch?: EdgeHardwareArch;
  searchQuery?: string;
}

export async function executeGetFleetGateways(
  data: { filter?: FleetGatewayFilter } | undefined,
  context: unknown,
): Promise<FleetGatewaySummary[]> {
  ensurePersistentFleetRuntime();
  const actor = await resolveAuthenticatedFleetContext(context);
  const scopedFilter: FleetGatewayFilter = {
    ...data?.filter,
    organizationId:
      actor.role === "PLATFORM_ADMIN" ? data?.filter?.organizationId : actor.organizationId,
  };
  return edgeFleetManager.getFleetGateways(actor, scopedFilter);
}

export async function executeGetFleetMetrics(
  data: { organizationId?: string } | undefined,
  context: unknown,
): Promise<FleetMetricsSummary> {
  ensurePersistentFleetRuntime();
  const actor = await resolveAuthenticatedFleetContext(context);
  const orgId = actor.role === "PLATFORM_ADMIN" ? data?.organizationId : actor.organizationId;
  return edgeFleetManager.getFleetMetrics(actor, orgId);
}

export async function executePostGatewayHeartbeat(data: {
  gatewayId: string;
  authToken: string;
  telemetry: GatewayHeartbeatTelemetry;
}): Promise<{ success: boolean; resolvedState: EdgeOperationalState; error?: string }> {
  ensurePersistentFleetRuntime();
  const auth = cloudGatewayRegistry.authenticateGateway(data.gatewayId, data.authToken);
  if (!auth.authorized || !auth.gateway) {
    throw new Response(auth.error || "Unauthorized gateway credential", {
      status: auth.statusCode || 401,
    });
  }
  return edgeFleetManager.postHeartbeat(auth.gateway.gatewayId, data.telemetry);
}

export async function executeProposeRemoteConfig(
  data: { config: RemoteConfigPayload; organizationId?: string; plantId?: string },
  context: unknown,
) {
  ensurePersistentFleetRuntime();
  const actor = await resolveAuthenticatedFleetContext(context);
  const gw = resolveAuthoritativeGatewayForActor(
    data.config.gatewayId,
    actor,
    "fleet/proposeRemoteConfig",
  );
  return remoteConfigManager.proposeAndApplyConfig(
    data.config,
    actor,
    gw.organizationId,
    gw.plantId,
  );
}

export async function executeRollbackRemoteConfig(
  data: { gatewayId: string; organizationId?: string; plantId?: string },
  context: unknown,
) {
  ensurePersistentFleetRuntime();
  const actor = await resolveAuthenticatedFleetContext(context);
  const gw = resolveAuthoritativeGatewayForActor(
    data.gatewayId,
    actor,
    "fleet/rollbackRemoteConfig",
  );
  return remoteConfigManager.rollbackConfig(gw.gatewayId, actor, gw.organizationId, gw.plantId);
}

export async function executeRevokeGatewayCertificate(
  data: { gatewayId: string; reason: string; organizationId?: string; plantId?: string },
  context: unknown,
): Promise<{ success: boolean }> {
  ensurePersistentFleetRuntime();
  const actor = await resolveAuthenticatedFleetContext(context);
  const gw = resolveAuthoritativeGatewayForActor(
    data.gatewayId,
    actor,
    "fleet/revokeGatewayCertificate",
  );
  const success = fleetCertificateManager.revokeCertificate(
    gw.gatewayId,
    data.reason,
    actor,
    gw.organizationId,
    gw.plantId,
  );
  return { success };
}

export async function executeGetFleetAuditLogs(
  data:
    | {
        organizationId?: string;
        plantId?: string;
        gatewayId?: string;
        severity?: "INFO" | "WARNING" | "CRITICAL";
        eventType?: string;
        limit?: number;
      }
    | undefined,
  context: unknown,
): Promise<FleetAuditEvent[]> {
  ensurePersistentFleetRuntime();
  const actor = await resolveAuthenticatedFleetContext(context);
  const targetOrg =
    actor.role === "PLATFORM_ADMIN"
      ? (data?.organizationId ?? actor.organizationId)
      : actor.organizationId;
  fleetRbacEngine.assertCanPerformAction(actor, "VIEW_AUDIT", {
    organizationId: targetOrg,
    plantId: data?.plantId ?? actor.authorizedPlantIds[0] ?? "",
    gatewayId: data?.gatewayId ?? "audit_log_query",
  });

  const events = fleetAuditManager.getEvents({
    ...data,
    organizationId: actor.role === "PLATFORM_ADMIN" ? data?.organizationId : actor.organizationId,
  });

  if (actor.role !== "PLATFORM_ADMIN" && actor.role !== "TENANT_ADMIN") {
    return events.filter((e) => actor.authorizedPlantIds.includes(e.plantId));
  }
  return events;
}

export async function executeAcknowledgeFleetAuditEvent(
  data: { eventId: string },
  context: unknown,
): Promise<{ success: boolean; acknowledgementEvent: FleetAuditEvent }> {
  ensurePersistentFleetRuntime();
  const actor = await resolveAuthenticatedFleetContext(context);
  const allEvents = fleetAuditManager.getEvents();
  const targetEvent = allEvents.find((ev) => ev.id === data.eventId);
  if (!targetEvent) {
    throw new Response("Not Found: Evento de auditoria não localizado.", { status: 404 });
  }

  fleetRbacEngine.assertCanPerformAction(actor, "VIEW_AUDIT", {
    organizationId: targetEvent.organizationId,
    plantId: targetEvent.plantId,
    gatewayId: targetEvent.gatewayId,
  });

  const ackEvent = fleetAuditManager.acknowledgeEventAndGetRecord(data.eventId, actor.email, {
    id: actor.userId,
    email: actor.email,
    role: actor.role,
  });

  if (!ackEvent) {
    throw new Response("Not Found: Evento de auditoria não localizado.", { status: 404 });
  }

  return { success: true, acknowledgementEvent: ackEvent };
}

export async function executeTriggerSignedUpdate(
  data: {
    gatewayId: string;
    targetVersion?: string;
    manifest?: SignedUpdateManifest;
  },
  context: unknown,
): Promise<{
  success: boolean;
  activeVersion?: string;
  campaignId?: string;
  error?: string;
}> {
  ensurePersistentFleetRuntime();
  const actor = await resolveAuthenticatedFleetContext(context);
  const gw = resolveAuthoritativeGatewayForActor(
    data.gatewayId,
    actor,
    "fleet/triggerSignedUpdate",
  );

  fleetRbacEngine.assertCanPerformAction(actor, "TRIGGER_UPDATE", {
    organizationId: gw.organizationId,
    plantId: gw.plantId,
    gatewayId: gw.gatewayId,
  });

  if (!data.manifest) {
    return {
      success: false,
      error:
        "UNSIGNED_MANIFEST_REJECTED: Um manifesto SignedUpdateManifest assinado criptograficamente (Ed25519) é obrigatório.",
    };
  }

  const campaign = signedUpdateManager.createStagedCampaign(
    data.manifest,
    gw.plantId,
    gw.organizationId,
    actor,
  );

  return {
    success: true,
    campaignId: campaign.campaignId,
    activeVersion: gw.softwareVersion,
  };
}
