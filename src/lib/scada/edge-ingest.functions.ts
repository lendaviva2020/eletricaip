// ELÉTRICAI INDUSTRIAL OS — CLOUD EDGE INGESTION API & PIPELINE
// Versioned Endpoint, Server-Side Tenant Derivation, Idempotency & Centralized Historian Ingest
// Standards: IEC 62443, ISA-101, ISA-18.2

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CLOUD_EDGE_PROTOCOL_VERSION } from "../edge/types";
import type { EdgeTelemetryBatch, EdgeIngestAck } from "../edge/types";

export const EdgeSamplePayloadSchema = z.object({
  sampleId: z.string().min(1),
  sequenceNumber: z.number().int().nonnegative(),
  projectId: z.string().min(1),
  tagName: z.string().min(1),
  equipmentId: z.string().optional(),
  value: z.number(),
  rawSampleValue: z.number().optional(),
  quality: z.enum(["GOOD", "BAD", "UNCERTAIN", "STALE", "NOT_CONNECTED", "FORCED"]),
  source: z.enum(["SIMULATION", "INTERNAL_RUNTIME", "OPC_UA", "MODBUS_TCP", "MQTT", "IMPORTED"]),
  sourceTimestamp: z.number().int().positive(),
  edgeReceivedAt: z.number().int().positive(),
  isDelayedReplay: z.boolean(),
  criticality: z.enum(["NORMAL", "CRITICAL"]),
});

export const EdgeTelemetryBatchSchema = z.object({
  protocolVersion: z.literal(CLOUD_EDGE_PROTOCOL_VERSION),
  gatewayId: z.string().min(1),
  batchId: z.string().min(1),
  batchSequenceNumber: z.number().int().nonnegative(),
  sentAt: z.number().int().positive(),
  samples: z.array(EdgeSamplePayloadSchema),
});

/**
 * Server function endpoint to ingest an Edge Telemetry Batch.
 * Called directly by the Edge Gateway sync client via RPC/HTTP POST.
 */
export const ingestEdgeTelemetryBatch = createServerFn({ method: "POST" })
  .validator((d: unknown): { batch: EdgeTelemetryBatch; authToken: string } => {
    return z
      .object({
        batch: EdgeTelemetryBatchSchema,
        authToken: z.string().min(1),
      })
      .parse(d);
  })
  .handler(async ({ data }): Promise<EdgeIngestAck> => {
    const [{ ensurePersistentFleetRuntime }, { cloudGatewayRegistry }] = await Promise.all([
      import("../edge/fleet-runtime.server"),
      import("../edge/cloud-gateway-registry"),
    ]);
    ensurePersistentFleetRuntime();
    const res = cloudGatewayRegistry.processTelemetryBatch(data.batch, data.authToken);
    if (!res.ack.success && (res.statusCode === 401 || res.statusCode === 403)) {
      throw new Response(res.ack.error || "Unauthorized gateway credential", {
        status: res.statusCode,
      });
    }
    return res.ack;
  });
