// ELÉTRICAI INDUSTRIAL OS — EDGE FLEET MANAGEMENT SERVER FUNCTIONS
// Typed TanStack Start RPC Endpoints for Fleet Operations, RBAC, Telemetry & Diagnostics
// Standards: IEC 62443-4-2, NIST SP 800-82 Rev. 3

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cloudGatewayRegistry } from "./cloud-gateway-registry";
import { resolveAuthenticatedFleetContext } from "./fleet-auth-context.server";
import { fleetAuditManager } from "./fleet-audit";
import { fleetCertificateManager } from "./fleet-certificates";
import { edgeFleetManager } from "./fleet-manager";
import { fleetRbacEngine } from "./fleet-rbac";
import { remoteConfigManager, RemoteConfigPayloadSchema } from "./remote-config";
import { signedUpdateManager } from "./signed-updates";
import type {
  EdgeOperationalState,
  FleetAuditEvent,
  FleetGatewaySummary,
  FleetMetricsSummary,
  SignedUpdateManifest,
} from "./types";

const SignedUpdateManifestSchema = z.object({
  packageId: z.string().min(1),
  targetVersion: z.string().min(1),
  targetArch: z.enum(["x86_64", "arm64", "armv7l", "unknown"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
  releaseNotes: z.string().min(1),
  minGatewayVersion: z.string().min(1),
  dependencies: z.record(z.string(), z.string()).optional(),
});

/**
 * Fetches the list of gateways with server-derived RBAC & multi-tenant scoping.
 */
export const getFleetGatewaysFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        filter: z
          .object({
            organizationId: z.string().optional(),
            plantId: z.string().optional(),
            sector: z.string().optional(),
            operationalState: z
              .enum([
                "PROVISIONING",
                "ONLINE",
                "OFFLINE",
                "DEGRADED",
                "MAINTENANCE",
                "REVOKED",
                "UNKNOWN",
              ])
              .optional(),
            hardwareArch: z.enum(["x86_64", "arm64", "armv7l", "unknown"]).optional(),
            searchQuery: z.string().optional(),
          })
          .optional(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<FleetGatewaySummary[]> => {
    const actor = await resolveAuthenticatedFleetContext(context);
    const scopedFilter = {
      ...data?.filter,
      organizationId:
        actor.role === "PLATFORM_ADMIN" ? data?.filter?.organizationId : actor.organizationId,
    };
    return edgeFleetManager.getFleetGateways(actor, scopedFilter);
  });

/**
 * Fetches high-level aggregated metrics for the fleet dashboard.
 */
export const getFleetMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        organizationId: z.string().optional(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<FleetMetricsSummary> => {
    const actor = await resolveAuthenticatedFleetContext(context);
    const orgId = actor.role === "PLATFORM_ADMIN" ? data?.organizationId : actor.organizationId;
    return edgeFleetManager.getFleetMetrics(actor, orgId);
  });

/**
 * Ingests a periodic heartbeat from an authenticated Edge Gateway daemon.
 */
export const postGatewayHeartbeatFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        gatewayId: z.string().min(1),
        authToken: z.string().min(1),
        telemetry: z.object({
          cpuUsagePercent: z.number().min(0).max(100),
          memoryUsagePercent: z.number().min(0).max(100),
          diskUsagePercent: z.number().min(0).max(100),
          temperatureCelsius: z.number().optional(),
          walSizeBytes: z.number().int().nonnegative(),
          pendingSamplesCount: z.number().int().nonnegative(),
          maxCapacityBytes: z.number().int().positive(),
          oldestSampleTimestampMs: z.number().nullable(),
          isDegraded: z.boolean(),
        }),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{ success: boolean; resolvedState: EdgeOperationalState; error?: string }> => {
      const auth = cloudGatewayRegistry.authenticateGateway(data.gatewayId, data.authToken);
      if (!auth.authorized || !auth.gateway) {
        throw new Response(auth.error || "Unauthorized gateway credential", {
          status: auth.statusCode || 401,
        });
      }
      return edgeFleetManager.postHeartbeat(auth.gateway.gatewayId, data.telemetry);
    },
  );

/**
 * Proposes and applies a cryptographically signed remote configuration for an Edge Gateway.
 */
export const proposeRemoteConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        config: RemoteConfigPayloadSchema,
        organizationId: z.string(),
        plantId: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    const gw = edgeFleetManager.getGateway(data.config.gatewayId);
    const targetOrgId = gw?.organizationId ?? data.organizationId;
    const targetPlantId = gw?.plantId ?? data.plantId;
    return remoteConfigManager.proposeAndApplyConfig(
      data.config,
      actor,
      targetOrgId,
      targetPlantId,
    );
  });

/**
 * Rolls back an Edge Gateway configuration to the Last Known Good Configuration (LKGC).
 */
export const rollbackRemoteConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        gatewayId: z.string().min(1),
        organizationId: z.string(),
        plantId: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    const gw = edgeFleetManager.getGateway(data.gatewayId);
    const targetOrgId = gw?.organizationId ?? data.organizationId;
    const targetPlantId = gw?.plantId ?? data.plantId;
    return remoteConfigManager.rollbackConfig(data.gatewayId, actor, targetOrgId, targetPlantId);
  });

/**
 * Revokes an Edge Gateway certificate administratively.
 */
export const revokeGatewayCertificateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        gatewayId: z.string().min(1),
        reason: z.string().min(1),
        organizationId: z.string(),
        plantId: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const actor = await resolveAuthenticatedFleetContext(context);
    const gw = edgeFleetManager.getGateway(data.gatewayId);
    const targetOrgId = gw?.organizationId ?? data.organizationId;
    const targetPlantId = gw?.plantId ?? data.plantId;
    const success = fleetCertificateManager.revokeCertificate(
      data.gatewayId,
      data.reason,
      actor,
      targetOrgId,
      targetPlantId,
    );
    return { success };
  });

/**
 * Queries the tamper-evident fleet audit trail scoped by server-verified tenant & RBAC.
 */
export const getFleetAuditLogsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        organizationId: z.string().optional(),
        plantId: z.string().optional(),
        gatewayId: z.string().optional(),
        severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
        eventType: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<FleetAuditEvent[]> => {
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
  });

/**
 * Initiates a cryptographically signed update campaign on an Edge Gateway.
 * Fails closed if the manifest is absent or fails HMAC signature verification.
 */
export const triggerSignedUpdateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        gatewayId: z.string().min(1),
        targetVersion: z.string().default("1.3.0"),
        manifest: SignedUpdateManifestSchema.optional(),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      success: boolean;
      activeVersion?: string;
      campaignId?: string;
      error?: string;
    }> => {
      const actor = await resolveAuthenticatedFleetContext(context);
      const gw = edgeFleetManager.getGateway(data.gatewayId);
      if (!gw) return { success: false, error: "Gateway não encontrado." };

      fleetRbacEngine.assertCanPerformAction(actor, "TRIGGER_UPDATE", {
        organizationId: gw.organizationId,
        plantId: gw.plantId,
        gatewayId: gw.gatewayId,
      });

      if (!data.manifest) {
        return {
          success: false,
          error:
            "UNSIGNED_MANIFEST_REJECTED: Um manifesto SignedUpdateManifest assinado criptograficamente é obrigatório.",
        };
      }

      const manifest: SignedUpdateManifest = data.manifest;
      const campaign = signedUpdateManager.createStagedCampaign(
        manifest,
        gw.plantId,
        gw.organizationId,
        actor,
      );

      return {
        success: true,
        campaignId: campaign.campaignId,
        activeVersion: gw.softwareVersion,
      };
    },
  );
