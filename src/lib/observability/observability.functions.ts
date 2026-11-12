// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.7 & GATE 3.8: OBSERVABILITY & DIAGNOSTICS RPC
// Secure Endpoints, Server-Side Identity Derivation, RBAC Authorization & Audit Trail
// =============================================================================

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { edgeFleetManager } from "@/lib/edge/fleet-manager";
import { resolveAuthenticatedFleetContext } from "@/lib/edge/fleet-auth-context.server";
import { aiDiagnosticAssistant } from "./ai-diagnostic-assistant";
import { dataReliabilityTracker } from "./data-reliability-tracker";
import { industrialDependencyGraph } from "./dependency-graph";
import { deterministicDiagnosticEngine } from "./diagnostic-rules-engine";
import { industrialHealthEngine } from "./health-engine";
import { industrialIncidentManager } from "./incident-manager";
import { industrialReliabilityCalculator } from "./reliability-metrics";
import { industrialRunbookLibrary } from "./runbook-library";
import { sliSloCalculator } from "./sli-slo-calculator";
import type {
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  RunbookCategory,
  SloTargetService,
} from "./types";

function assertPlantAuthorized(
  actor: { role: string; authorizedPlantIds: string[] },
  plantId: string | undefined,
): void {
  if (
    plantId &&
    actor.role !== "PLATFORM_ADMIN" &&
    actor.role !== "TENANT_ADMIN" &&
    actor.authorizedPlantIds.length > 0 &&
    !actor.authorizedPlantIds.includes(plantId)
  ) {
    throw new Response("Forbidden: Acesso à planta não autorizado para este usuário.", {
      status: 403,
    });
  }
}

/**
 * 1. Visão Geral Consolidada de Observabilidade (NOC/EOC Industrial)
 */
export const getObservabilityOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown): { plantId?: string } => {
    return (
      z
        .object({
          plantId: z.string().optional(),
        })
        .optional()
        .parse(d) ?? {}
    );
  })
  .handler(async ({ data, context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    const { plantId } = data;
    assertPlantAuthorized(actor, plantId);

    const snapshots = industrialHealthEngine.getAllSnapshots({
      tenantId: actor.organizationId,
      plantId,
    });

    const incidents = industrialIncidentManager.getIncidents({
      organizationId: actor.organizationId,
      plantId,
    });

    const { ensurePersistentFleetRuntime } = await import("@/lib/edge/fleet-runtime.server");
    ensurePersistentFleetRuntime();
    const fleetGateways = edgeFleetManager.getFleetGateways(actor, {
      plantId,
    });

    const openIncidentsCount = incidents.filter(
      (i) => i.status !== "RESOLVED" && i.status !== "CLOSED",
    ).length;

    const criticalIncidentsCount = incidents.filter(
      (i) => i.severity === "CRITICAL" || i.severity === "FATAL",
    ).length;

    const degradedComponentsCount = snapshots.filter((s) => s.state === "DEGRADED").length;
    const unavailableComponentsCount = snapshots.filter((s) => s.state === "UNAVAILABLE").length;
    const healthyComponentsCount = snapshots.filter((s) => s.state === "HEALTHY").length;

    const pipelineReports = dataReliabilityTracker
      .getAllReports()
      .filter((r) => r.tenantId === actor.organizationId && (!plantId || r.plantId === plantId));

    const diagnostics = deterministicDiagnosticEngine.getDiagnosticsForTenant(
      actor.organizationId,
      plantId,
    );

    return {
      timestamp: Date.now(),
      organizationId: actor.organizationId,
      plantId: plantId ?? "ALL_PLANTS",
      counts: {
        totalComponentsObserved: snapshots.length,
        healthy: healthyComponentsCount,
        degraded: degradedComponentsCount,
        unavailable: unavailableComponentsCount,
        openIncidents: openIncidentsCount,
        criticalIncidents: criticalIncidentsCount,
        fleetTotalGateways: fleetGateways.length,
        fleetOnlineGateways: fleetGateways.filter((g) => g.operationalState === "ONLINE").length,
        activeDiagnostics: diagnostics.length,
      },
      snapshots: snapshots.slice(0, 50),
      openIncidents: incidents.filter((i) => i.status !== "CLOSED").slice(0, 20),
      pipelineReports,
      diagnostics: diagnostics.slice(0, 30),
    };
  });

/**
 * 2. Consulta de Snapshots de Saúde por Filtros
 */
export const getHealthSnapshotsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown): { plantId?: string } => {
    return (
      z
        .object({
          plantId: z.string().optional(),
        })
        .optional()
        .parse(d) ?? {}
    );
  })
  .handler(async ({ data, context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    assertPlantAuthorized(actor, data.plantId);
    return industrialHealthEngine.getAllSnapshots({
      tenantId: actor.organizationId,
      plantId: data.plantId,
    });
  });

/**
 * 3. Consulta de Incidentes Operacionais
 */
export const getIndustrialIncidentsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      d: unknown,
    ): {
      plantId?: string;
      category?: IncidentCategory;
      severity?: IncidentSeverity;
      status?: IncidentStatus;
    } => {
      return (
        z
          .object({
            plantId: z.string().optional(),
            category: z.enum(["INDUSTRIAL_PROCESS", "INFRASTRUCTURE", "SECURITY_EVENT"]).optional(),
            severity: z.enum(["INFO", "WARNING", "CRITICAL", "FATAL"]).optional(),
            status: z
              .enum(["OPEN", "ACKNOWLEDGED", "INVESTIGATING", "MITIGATED", "RESOLVED", "CLOSED"])
              .optional(),
          })
          .optional()
          .parse(d) ?? {}
      );
    },
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    assertPlantAuthorized(actor, data.plantId);
    return industrialIncidentManager.getIncidents({
      organizationId: actor.organizationId,
      plantId: data.plantId,
      category: data.category,
      severity: data.severity,
      status: data.status,
    });
  });

/**
 * 4. Transição de Status de Incidente com Isolamento Multi-Tenant e RBAC
 */
export const transitionIncidentStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      d: unknown,
    ): {
      incidentId: string;
      toStatus: IncidentStatus;
      note: string;
      resolution?: string;
    } => {
      return z
        .object({
          incidentId: z.string().min(1),
          toStatus: z.enum([
            "OPEN",
            "ACKNOWLEDGED",
            "INVESTIGATING",
            "MITIGATED",
            "RESOLVED",
            "CLOSED",
          ]),
          note: z.string().min(3),
          resolution: z.string().optional(),
        })
        .parse(d);
    },
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    const { incidentId, toStatus, note, resolution } = data;

    if (actor.role === "VIEWER" || actor.role === "AUDITOR") {
      throw new Response(
        `Forbidden: Usuários com papel '${actor.role}' não têm permissão para alterar status de incidentes.`,
        { status: 403 },
      );
    }

    const existingIncident = industrialIncidentManager.getIncident(incidentId);
    if (!existingIncident) {
      throw new Response("Not Found: Incidente não encontrado.", { status: 404 });
    }

    if (
      actor.role !== "PLATFORM_ADMIN" &&
      existingIncident.organizationId !== actor.organizationId
    ) {
      throw new Response("Forbidden: Acesso cross-tenant a incidente negado.", { status: 403 });
    }

    assertPlantAuthorized(actor, existingIncident.plantId);

    const res = industrialIncidentManager.transitionIncidentStatus({
      incidentId,
      toStatus,
      note,
      resolution,
      actor: {
        id: actor.userId,
        email: actor.email,
        role: actor.role,
      },
    });

    if (!res.success) {
      throw new Error(res.error || "FALHA_TRANSICAO_INCIDENTE");
    }

    return res.incident!;
  });

/**
 * 5. Consulta de Confiabilidade de Pipeline de Dados (10 Estágios)
 */
export const getDataReliabilityReportsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({}).optional().parse(d))
  .handler(async ({ context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    return dataReliabilityTracker
      .getAllReports()
      .filter((r) => r.tenantId === actor.organizationId);
  });

/**
 * 6. Consulta de Medições Reais de SLI / SLO e Error Budgets (sem dados fabricados)
 */
export const getSloMeasurementsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({}).optional().parse(d))
  .handler(async ({ context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    const definitions = sliSloCalculator.getAllDefinitions();
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;

    const snapshots = industrialHealthEngine.getAllSnapshots({
      tenantId: actor.organizationId,
    });
    const reports = dataReliabilityTracker
      .getAllReports()
      .filter((r) => r.tenantId === actor.organizationId);

    const countsForService = (
      service: SloTargetService,
    ): { total: number; valid: number; unknown: number } => {
      if (service === "DATA_INGESTION" || service === "HISTORIAN_STORAGE") {
        let total = 0;
        let valid = 0;
        for (const report of reports) {
          for (const stage of Object.values(report.stages)) {
            total += stage.samplesIn;
            valid += stage.samplesOut;
          }
        }
        return { total, valid, unknown: 0 };
      }

      const relevantSnapshots = snapshots.filter((s) => {
        if (service === "CLOUD_SERVICE") {
          return (
            s.componentType === "CLOUD_SERVICE" ||
            s.componentType === "CLOUD_API" ||
            s.componentType === "CLOUD_DATABASE"
          );
        }
        if (service === "EDGE_GATEWAY" || service === "INDUSTRIAL_SOURCE") {
          return (
            s.componentType === "EDGE_GATEWAY" ||
            s.componentType === "EDGE_FLEET" ||
            s.componentType === "INDUSTRIAL_EQUIPMENT" ||
            s.componentType === "PROTOCOL_OPC_UA" ||
            s.componentType === "PROTOCOL_MODBUS_TCP" ||
            s.componentType === "PROTOCOL_MQTT_SPARKPLUG"
          );
        }
        if (service === "SCADA_INTERFACE") {
          return s.componentType === "SCADA_CORE";
        }
        return true;
      });

      const total = relevantSnapshots.length;
      const valid = relevantSnapshots.filter((s) => s.state === "HEALTHY").length;
      const unknown = relevantSnapshots.filter((s) => s.state === "UNKNOWN").length;
      return { total, valid, unknown };
    };

    return definitions.map((def) => {
      const measured = countsForService(def.targetService);
      return sliSloCalculator.calculateSloMeasurement({
        targetService: def.targetService,
        periodStart: thirtyDaysAgo,
        periodEnd: now,
        totalObservations: measured.total,
        validObservationsNumerator: measured.valid,
        totalEligibleDenominator: Math.max(0, measured.total - measured.unknown),
        unknownIntervalsCount: measured.unknown,
        plannedMaintenanceDurationMs: 0,
        unplannedOutageDurationMs: 0,
      });
    });
  });

/**
 * 7. Gate 3.8: Consulta de Diagnósticos Determinísticos por Tenant / Planta
 */
export const getDeterministicDiagnosticsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown): { plantId?: string } => {
    return (
      z
        .object({
          plantId: z.string().optional(),
        })
        .optional()
        .parse(d) ?? {}
    );
  })
  .handler(async ({ data, context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    assertPlantAuthorized(actor, data.plantId);
    return deterministicDiagnosticEngine.getDiagnosticsForTenant(
      actor.organizationId,
      data.plantId,
    );
  });

/**
 * 8. Gate 3.8: Consulta de Grafo de Impacto e Propagação Topológica
 */
export const getDependencyImpactAnalysisFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      d: unknown,
    ): {
      plantId: string;
      originComponentId: string;
    } => {
      return z
        .object({
          plantId: z.string().min(1),
          originComponentId: z.string().min(1),
        })
        .parse(d);
    },
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    assertPlantAuthorized(actor, data.plantId);
    return industrialDependencyGraph.analyzeImpact(
      actor.organizationId,
      data.plantId,
      data.originComponentId,
    );
  });

/**
 * 9. Gate 3.8: Assistente Técnico Consultivo por IA (com verificação de posse e anti-prompt-injection)
 */
export const askAiDiagnosticAssistantFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      d: unknown,
    ): {
      plantId: string;
      question: string;
      incidentId?: string;
    } => {
      return z
        .object({
          plantId: z.string().min(1),
          question: z.string().min(3).max(2000),
          incidentId: z.string().optional(),
        })
        .parse(d);
    },
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    assertPlantAuthorized(actor, data.plantId);

    const incident = data.incidentId
      ? industrialIncidentManager.getIncident(data.incidentId)
      : undefined;

    if (
      incident &&
      actor.role !== "PLATFORM_ADMIN" &&
      incident.organizationId !== actor.organizationId
    ) {
      throw new Response("Forbidden: Incidente pertence a outra organização.", { status: 403 });
    }

    const diagnostics = deterministicDiagnosticEngine.getDiagnosticsForTenant(
      actor.organizationId,
      data.plantId,
    );

    return aiDiagnosticAssistant.analyze({
      tenantId: actor.organizationId,
      plantId: data.plantId,
      userId: actor.userId,
      userRole: actor.role,
      question: data.question,
      incident,
      deterministicDiagnostics: diagnostics,
    });
  });

/**
 * 10. Gate 3.8: Consulta de Biblioteca de Runbooks Técnicos Aprovados
 */
export const getIndustrialRunbooksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown): { category?: RunbookCategory } => {
    return (
      z
        .object({
          category: z
            .enum([
              "CLOUD",
              "EDGE",
              "MODBUS",
              "OPC_UA",
              "MQTT",
              "HISTORIAN",
              "SCADA",
              "DATABASE",
              "CERTIFICATES",
              "SECURITY",
              "SYNCHRONIZATION",
              "DATA_QUALITY",
            ])
            .optional(),
        })
        .optional()
        .parse(d) ?? {}
    );
  })
  .handler(async ({ data }) => {
    return data.category
      ? industrialRunbookLibrary.getRunbooksByCategory(data.category)
      : [...industrialRunbookLibrary.getAllRunbooks()];
  });

/**
 * 11. Gate 3.8: Consulta de Indicadores Reais de Confiabilidade (MTTD, MTTA, MTTR, MTBF)
 */
export const getIndustrialReliabilityMetricsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      d: unknown,
    ): {
      plantId: string;
      windowStartMs: number;
      windowEndMs: number;
    } => {
      return z
        .object({
          plantId: z.string().min(1),
          windowStartMs: z.number().int().positive(),
          windowEndMs: z.number().int().positive(),
        })
        .parse(d);
    },
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveAuthenticatedFleetContext(context);
    assertPlantAuthorized(actor, data.plantId);
    const incidents = industrialIncidentManager.getIncidents({
      organizationId: actor.organizationId,
      plantId: data.plantId,
    });
    return industrialReliabilityCalculator.calculate({
      tenantId: actor.organizationId,
      plantId: data.plantId,
      windowStart: data.windowStartMs,
      windowEnd: data.windowEndMs,
      incidents,
    });
  });
