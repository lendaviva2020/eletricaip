// ELÉTRICAI INDUSTRIAL OS — EDGE FLEET MANAGEMENT SERVER FUNCTIONS (PURE RPC BOUNDARY)
// Server logic and persistent storage live exclusively inside `./fleet-handlers.server`.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  EdgeOperationalState,
  FleetAuditEvent,
  FleetGatewaySummary,
  FleetMetricsSummary,
  SignedUpdateManifest,
} from "./types";

const RemoteConfigPayloadSchemaClient = z.object({
  configVersion: z.number().int().positive(),
  gatewayId: z.string().min(1).max(128),
  author: z.string().min(1),
  timestamp: z.number().int().positive(),
  signature: z.string().min(8),
  scanRateMs: z.number().int().min(100).max(60000),
  authorizedEndpoints: z.array(z.string().min(1)),
  enabledTags: z.array(z.string().min(1)),
  readProtocols: z.object({
    opcua: z.object({ endpoint: z.string(), enabled: z.boolean() }).optional(),
    modbus: z
      .object({ host: z.string(), port: z.number().int().min(1).max(65535), enabled: z.boolean() })
      .optional(),
    sparkplug: z.object({ brokerUrl: z.string(), enabled: z.boolean() }).optional(),
  }),
  bufferLimits: z.object({
    maxSamples: z.number().int().min(1000).max(10000000),
    maxDiskMb: z.number().int().min(100).max(100000),
    saturationPolicy: z.enum(["DROP_OLDEST_NON_CRITICAL", "DROP_NEWEST_WITH_ALARM"]),
  }),
  retentionPolicy: z.object({ maxAgeHours: z.number().int().min(1).max(8760) }),
  observability: z.object({
    metricsIntervalMs: z.number().int().min(1000).max(300000),
    logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]),
  }),
  approval: z.object({ approvedBy: z.string(), approvedAt: z.number() }).optional(),
});

const SignedUpdateManifestSchema = z.object({
  packageId: z.string().min(1),
  targetVersion: z.string().min(1),
  targetArch: z.enum(["x86_64", "arm64", "armv7l", "unknown"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  signature: z.string().min(64),
  keyId: z.string().min(1).optional(),
  manifestVersion: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional(),
  expiresAt: z.string().min(1).optional(),
  targetGateway: z.string().min(1).optional(),
  targetOrganizationId: z.string().min(1).optional(),
  targetPlantId: z.string().min(1).optional(),
  releaseNotes: z.string().min(1),
  minGatewayVersion: z.string().min(1),
  dependencies: z.record(z.string(), z.string()).optional(),
});

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
    const { executeGetFleetGateways } = await import("./fleet-handlers.server");
    return executeGetFleetGateways(data, context);
  });

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
    const { executeGetFleetMetrics } = await import("./fleet-handlers.server");
    return executeGetFleetMetrics(data, context);
  });

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
      const { executePostGatewayHeartbeat } = await import("./fleet-handlers.server");
      return executePostGatewayHeartbeat(data);
    },
  );

export const proposeRemoteConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        config: RemoteConfigPayloadSchemaClient,
        organizationId: z.string().optional(),
        plantId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { executeProposeRemoteConfig } = await import("./fleet-handlers.server");
    return executeProposeRemoteConfig(data, context);
  });

export const rollbackRemoteConfigFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        gatewayId: z.string().min(1),
        organizationId: z.string().optional(),
        plantId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { executeRollbackRemoteConfig } = await import("./fleet-handlers.server");
    return executeRollbackRemoteConfig(data, context);
  });

export const revokeGatewayCertificateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        gatewayId: z.string().min(1),
        reason: z.string().min(1),
        organizationId: z.string().optional(),
        plantId: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const { executeRevokeGatewayCertificate } = await import("./fleet-handlers.server");
    return executeRevokeGatewayCertificate(data, context);
  });

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
    const { executeGetFleetAuditLogs } = await import("./fleet-handlers.server");
    return executeGetFleetAuditLogs(data, context);
  });

export const acknowledgeFleetAuditEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ eventId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { executeAcknowledgeFleetAuditEvent } = await import("./fleet-handlers.server");
    return executeAcknowledgeFleetAuditEvent(data, context);
  });

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
  .handler(async ({ data, context }) => {
    const { executeTriggerSignedUpdate } = await import("./fleet-handlers.server");
    return executeTriggerSignedUpdate(
      { ...data, manifest: data.manifest as SignedUpdateManifest | undefined },
      context,
    );
  });
