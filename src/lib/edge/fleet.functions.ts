// ELÉTRICAI INDUSTRIAL OS — EDGE FLEET MANAGEMENT SERVER FUNCTIONS
// Typed TanStack Start RPC Endpoints for Fleet Operations, RBAC, Telemetry & Diagnostics
// Standards: IEC 62443-4-2, NIST SP 800-82 Rev. 3

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { edgeFleetManager } from "./fleet-manager";
import { fleetAuditManager } from "./fleet-audit";
import { fleetCertificateManager } from "./fleet-certificates";
import { remoteConfigManager, RemoteConfigPayloadSchema } from "./remote-config";
import { signedUpdateManager } from "./signed-updates";
import type {
  FleetGatewaySummary,
  FleetMetricsSummary,
  FleetAuditEvent,
  FleetUserContext,
  EdgeOperationalState,
} from "./types";

const DefaultPlatformAdminUser: FleetUserContext = {
  userId: "usr_admin_default",
  email: "admin@eletricai.com",
  role: "PLATFORM_ADMIN",
  organizationId: "org_sp_industrial",
  authorizedPlantIds: ["plant_ete_central", "plant_subestacao_138kv", "plant_usina_rj"],
};

/**
 * Fetches the list of gateways with optional filtering and RBAC checks.
 */
export const getFleetGatewaysFn = createServerFn({ method: "GET" })
  .validator(
    (d: unknown) =>
      z
        .object({
          user: z
            .object({
              userId: z.string(),
              email: z.string(),
              role: z.enum([
                "PLATFORM_ADMIN",
                "TENANT_ADMIN",
                "PLANT_ADMIN",
                "EDGE_OPERATOR",
                "ENGINEER",
                "AUDITOR",
                "VIEWER",
              ]),
              organizationId: z.string(),
              authorizedPlantIds: z.array(z.string()),
            })
            .optional(),
          filter: z
            .object({
              organizationId: z.string().optional(),
              plantId: z.string().optional(),
              sector: z.string().optional(),
              operationalState: z
                .enum(["PROVISIONING", "ONLINE", "OFFLINE", "DEGRADED", "MAINTENANCE", "REVOKED", "UNKNOWN"])
                .optional(),
              hardwareArch: z.enum(["x86_64", "arm64", "armv7l", "unknown"]).optional(),
              searchQuery: z.string().optional(),
            })
            .optional(),
        })
        .optional()
        .parse(d),
  )
  .handler(async ({ data }): Promise<FleetGatewaySummary[]> => {
    const user = data?.user || DefaultPlatformAdminUser;
    return edgeFleetManager.getFleetGateways(user, data?.filter);
  });

/**
 * Fetches high-level aggregated metrics for the fleet dashboard.
 */
export const getFleetMetricsFn = createServerFn({ method: "GET" })
  .validator(
    (d: unknown) =>
      z
        .object({
          user: z
            .object({
              userId: z.string(),
              email: z.string(),
              role: z.enum([
                "PLATFORM_ADMIN",
                "TENANT_ADMIN",
                "PLANT_ADMIN",
                "EDGE_OPERATOR",
                "ENGINEER",
                "AUDITOR",
                "VIEWER",
              ]),
              organizationId: z.string(),
              authorizedPlantIds: z.array(z.string()),
            })
            .optional(),
          organizationId: z.string().optional(),
        })
        .optional()
        .parse(d),
  )
  .handler(async ({ data }): Promise<FleetMetricsSummary> => {
    const user = data?.user || DefaultPlatformAdminUser;
    return edgeFleetManager.getFleetMetrics(user, data?.organizationId);
  });

/**
 * Ingests a periodic heartbeat from an Edge Gateway daemon.
 */
export const postGatewayHeartbeatFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        gatewayId: z.string().min(1),
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
  .handler(async ({ data }): Promise<{ success: boolean; resolvedState: EdgeOperationalState; error?: string }> => {
    return edgeFleetManager.postHeartbeat(data.gatewayId, data.telemetry);
  });

/**
 * Proposes and applies a remote configuration for an Edge Gateway.
 */
export const proposeRemoteConfigFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        config: RemoteConfigPayloadSchema,
        user: z.object({
          userId: z.string(),
          email: z.string(),
          role: z.enum([
            "PLATFORM_ADMIN",
            "TENANT_ADMIN",
            "PLANT_ADMIN",
            "EDGE_OPERATOR",
            "ENGINEER",
            "AUDITOR",
            "VIEWER",
          ]),
          organizationId: z.string(),
          authorizedPlantIds: z.array(z.string()),
        }),
        organizationId: z.string(),
        plantId: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return remoteConfigManager.proposeAndApplyConfig(
      data.config,
      data.user,
      data.organizationId,
      data.plantId,
    );
  });

/**
 * Rolls back an Edge Gateway configuration to the Last Known Good Configuration (LKGC).
 */
export const rollbackRemoteConfigFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        gatewayId: z.string().min(1),
        user: z.object({
          userId: z.string(),
          email: z.string(),
          role: z.enum([
            "PLATFORM_ADMIN",
            "TENANT_ADMIN",
            "PLANT_ADMIN",
            "EDGE_OPERATOR",
            "ENGINEER",
            "AUDITOR",
            "VIEWER",
          ]),
          organizationId: z.string(),
          authorizedPlantIds: z.array(z.string()),
        }),
        organizationId: z.string(),
        plantId: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return remoteConfigManager.rollbackConfig(
      data.gatewayId,
      data.user,
      data.organizationId,
      data.plantId,
    );
  });

/**
 * Revokes an Edge Gateway certificate administratively.
 */
export const revokeGatewayCertificateFn = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        gatewayId: z.string().min(1),
        reason: z.string().min(1),
        user: z.object({
          userId: z.string(),
          email: z.string(),
          role: z.enum([
            "PLATFORM_ADMIN",
            "TENANT_ADMIN",
            "PLANT_ADMIN",
            "EDGE_OPERATOR",
            "ENGINEER",
            "AUDITOR",
            "VIEWER",
          ]),
          organizationId: z.string(),
          authorizedPlantIds: z.array(z.string()),
        }),
        organizationId: z.string(),
        plantId: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const success = fleetCertificateManager.revokeCertificate(
      data.gatewayId,
      data.reason,
      data.user,
      data.organizationId,
      data.plantId,
    );
    return { success };
  });

/**
 * Queries the tamper-evident fleet audit trail.
 */
export const getFleetAuditLogsFn = createServerFn({ method: "GET" })
  .validator(
    (d: unknown) =>
      z
        .object({
          organizationId: z.string().optional(),
          plantId: z.string().optional(),
          gatewayId: z.string().optional(),
          severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
          eventType: z.string().optional(),
          limit: z.number().int().positive().optional(),
        })
        .optional()
        .parse(d),
  )
  .handler(async ({ data }): Promise<FleetAuditEvent[]> => {
    return fleetAuditManager.getEvents(data);
  });
