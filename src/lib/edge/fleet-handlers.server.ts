// ELÉTRICAI INDUSTRIAL OS — EDGE FLEET RPC HANDLERS (SERVER-ONLY)
// Keeps node:sqlite / node:fs / node:crypto server modules strictly out of Vite client bundles.
// Uses authoritative Cloud PostgreSQL (`SupabaseFleetStorageBackend`) in multi-instance serverless Cloud
// and falls back to `SqliteFleetStorageBackend` solely for local dev, Edge daemon, or test fixtures.

import { cloudGatewayRegistry, type CloudGatewayRegistry } from "./cloud-gateway-registry";
import {
  resolveAuthenticatedFleetContext,
  resolveAuthoritativeGatewayForActor,
} from "./fleet-auth-context.server";
import { fleetAuditManager, type FleetAuditManager } from "./fleet-audit";
import { fleetCertificateManager, type FleetCertificateManager } from "./fleet-certificates";
import {
  edgeFleetManager,
  type EdgeFleetManager,
  type GatewayHeartbeatTelemetry,
} from "./fleet-manager";
import { fleetRbacEngine } from "./fleet-rbac";
import {
  ensurePersistentFleetRuntime,
  getCloudSupabaseFleetStore,
  withCloudFleetRuntimeAsync,
} from "./fleet-runtime.server";
import { remoteConfigManager, type RemoteConfigManager } from "./remote-config";
import { signedUpdateManager, type SignedUpdateManager } from "./signed-updates";
import type {
  AsyncFleetStorageBackend,
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

export interface FleetHandlerManagers {
  registry: CloudGatewayRegistry;
  fleetManager: EdgeFleetManager;
  auditManager: FleetAuditManager;
  certManager: FleetCertificateManager;
  configManager: RemoteConfigManager;
  updateManager: SignedUpdateManager;
}

export interface FleetHandlerDeps {
  cloudStore?: AsyncFleetStorageBackend;
  configSigningSecret?: string;
  releasePublicKeysByKeyId?: Record<string, string>;
}

export async function runWithFleetManagers<T>(
  fn: (managers: FleetHandlerManagers) => Promise<T> | T,
  deps?: FleetHandlerDeps,
): Promise<T> {
  const cloudStore = deps?.cloudStore ?? getCloudSupabaseFleetStore();
  if (cloudStore) {
    return withCloudFleetRuntimeAsync(
      cloudStore,
      (rt) =>
        fn({
          registry: rt.registry,
          fleetManager: rt.fleetManager,
          auditManager: rt.auditManager,
          certManager: rt.certManager,
          configManager: rt.configManager,
          updateManager: rt.updateManager,
        }),
      {
        configSigningSecret: deps?.configSigningSecret,
        releasePublicKeysByKeyId: deps?.releasePublicKeysByKeyId,
      },
    );
  }

  ensurePersistentFleetRuntime();
  return fn({
    registry: cloudGatewayRegistry,
    fleetManager: edgeFleetManager,
    auditManager: fleetAuditManager,
    certManager: fleetCertificateManager,
    configManager: remoteConfigManager,
    updateManager: signedUpdateManager,
  });
}

export async function executeGetFleetGateways(
  data: { filter?: FleetGatewayFilter } | undefined,
  context: unknown,
  deps?: FleetHandlerDeps,
): Promise<FleetGatewaySummary[]> {
  const actor = await resolveAuthenticatedFleetContext(context);
  return runWithFleetManagers(({ fleetManager }) => {
    const scopedFilter: FleetGatewayFilter = {
      ...data?.filter,
      organizationId:
        actor.role === "PLATFORM_ADMIN" ? data?.filter?.organizationId : actor.organizationId,
    };
    return fleetManager.getFleetGateways(actor, scopedFilter);
  }, deps);
}

export async function executeGetFleetMetrics(
  data: { organizationId?: string } | undefined,
  context: unknown,
  deps?: FleetHandlerDeps,
): Promise<FleetMetricsSummary> {
  const actor = await resolveAuthenticatedFleetContext(context);
  return runWithFleetManagers(({ fleetManager }) => {
    const orgId = actor.role === "PLATFORM_ADMIN" ? data?.organizationId : actor.organizationId;
    return fleetManager.getFleetMetrics(actor, orgId);
  }, deps);
}

export async function executePostGatewayHeartbeat(
  data: {
    gatewayId: string;
    authToken: string;
    telemetry: GatewayHeartbeatTelemetry;
  },
  deps?: FleetHandlerDeps,
): Promise<{ success: boolean; resolvedState: EdgeOperationalState; error?: string }> {
  return runWithFleetManagers(({ registry, fleetManager }) => {
    const auth = registry.authenticateGateway(data.gatewayId, data.authToken);
    if (!auth.authorized || !auth.gateway) {
      throw new Response(auth.error || "Unauthorized gateway credential", {
        status: auth.statusCode || 401,
      });
    }
    return fleetManager.postHeartbeat(auth.gateway.gatewayId, data.telemetry);
  }, deps);
}

export async function executeProposeRemoteConfig(
  data: { config: RemoteConfigPayload; organizationId?: string; plantId?: string },
  context: unknown,
  deps?: FleetHandlerDeps,
) {
  const actor = await resolveAuthenticatedFleetContext(context);
  return runWithFleetManagers(({ fleetManager, configManager }) => {
    const gw = resolveAuthoritativeGatewayForActor(
      data.config.gatewayId,
      actor,
      "fleet/proposeRemoteConfig",
      fleetManager,
    );
    return configManager.proposeAndApplyConfig(data.config, actor, gw.organizationId, gw.plantId);
  }, deps);
}

export async function executeRollbackRemoteConfig(
  data: { gatewayId: string; organizationId?: string; plantId?: string },
  context: unknown,
  deps?: FleetHandlerDeps,
) {
  const actor = await resolveAuthenticatedFleetContext(context);
  return runWithFleetManagers(({ fleetManager, configManager }) => {
    const gw = resolveAuthoritativeGatewayForActor(
      data.gatewayId,
      actor,
      "fleet/rollbackRemoteConfig",
      fleetManager,
    );
    return configManager.rollbackConfig(gw.gatewayId, actor, gw.organizationId, gw.plantId);
  }, deps);
}

export async function executeRevokeGatewayCertificate(
  data: { gatewayId: string; reason: string; organizationId?: string; plantId?: string },
  context: unknown,
  deps?: FleetHandlerDeps,
): Promise<{ success: boolean }> {
  const actor = await resolveAuthenticatedFleetContext(context);
  return runWithFleetManagers(({ fleetManager, certManager }) => {
    const gw = resolveAuthoritativeGatewayForActor(
      data.gatewayId,
      actor,
      "fleet/revokeGatewayCertificate",
      fleetManager,
    );
    const success = certManager.revokeCertificate(
      gw.gatewayId,
      data.reason,
      actor,
      gw.organizationId,
      gw.plantId,
    );
    return { success };
  }, deps);
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
  deps?: FleetHandlerDeps,
): Promise<FleetAuditEvent[]> {
  const actor = await resolveAuthenticatedFleetContext(context);
  return runWithFleetManagers(({ auditManager }) => {
    const targetOrg =
      actor.role === "PLATFORM_ADMIN"
        ? (data?.organizationId ?? actor.organizationId)
        : actor.organizationId;
    fleetRbacEngine.assertCanPerformAction(actor, "VIEW_AUDIT", {
      organizationId: targetOrg,
      plantId: data?.plantId ?? actor.authorizedPlantIds[0] ?? "",
      gatewayId: data?.gatewayId ?? "audit_log_query",
    });

    const events = auditManager.getEvents({
      ...data,
      organizationId: actor.role === "PLATFORM_ADMIN" ? data?.organizationId : actor.organizationId,
    });

    if (actor.role !== "PLATFORM_ADMIN" && actor.role !== "TENANT_ADMIN") {
      return events.filter((e) => actor.authorizedPlantIds.includes(e.plantId));
    }
    return events;
  }, deps);
}

export async function executeAcknowledgeFleetAuditEvent(
  data: { eventId: string },
  context: unknown,
  deps?: FleetHandlerDeps,
): Promise<{ success: boolean; acknowledgementEvent: FleetAuditEvent }> {
  const actor = await resolveAuthenticatedFleetContext(context);
  return runWithFleetManagers(({ auditManager }) => {
    const allEvents = auditManager.getEvents();
    const targetEvent = allEvents.find((ev) => ev.id === data.eventId);
    if (!targetEvent) {
      throw new Response("Not Found: Evento de auditoria não localizado.", { status: 404 });
    }

    fleetRbacEngine.assertCanPerformAction(actor, "VIEW_AUDIT", {
      organizationId: targetEvent.organizationId,
      plantId: targetEvent.plantId,
      gatewayId: targetEvent.gatewayId,
    });

    const ackEvent = auditManager.acknowledgeEventAndGetRecord(data.eventId, actor.email, {
      id: actor.userId,
      email: actor.email,
      role: actor.role,
    });

    if (!ackEvent) {
      throw new Response("Not Found: Evento de auditoria não localizado.", { status: 404 });
    }

    return { success: true, acknowledgementEvent: ackEvent };
  }, deps);
}

export async function executeTriggerSignedUpdate(
  data: {
    gatewayId: string;
    targetVersion?: string;
    manifest?: SignedUpdateManifest;
  },
  context: unknown,
  deps?: FleetHandlerDeps,
): Promise<{
  success: boolean;
  activeVersion?: string;
  campaignId?: string;
  error?: string;
}> {
  const actor = await resolveAuthenticatedFleetContext(context);
  return runWithFleetManagers(({ fleetManager, updateManager }) => {
    const gw = resolveAuthoritativeGatewayForActor(
      data.gatewayId,
      actor,
      "fleet/triggerSignedUpdate",
      fleetManager,
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

    const campaign = updateManager.createStagedCampaign(
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
  }, deps);
}
