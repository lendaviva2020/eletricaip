// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.8: INDUSTRIAL RELIABILITY & DIAGNOSTIC METRICS
// Phase 9: Real MTTD, MTTA, MTTR (Operational Recovery vs Formal Resolution), MTBF & Root Cause Stats
// Standards: IEEE 1366, ISA-95, SRE Industrial Reliability Metrics
// =============================================================================

import type { IndustrialIncident, IndustrialReliabilityMetrics } from "./types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "./types";

export interface CalculateReliabilityMetricsInput {
  tenantId: string;
  plantId: string;
  windowStart: number;
  windowEnd: number;
  incidents: IndustrialIncident[];
  dataRecoverySamplesMs?: number[];
}

export class IndustrialReliabilityCalculator {
  /**
   * Calcula os indicadores reais de confiabilidade e diagnóstico (Fase 9)
   * exclusivamente a partir de incidentes reais do tenant/planta na janela analisada.
   * Zero valores hardcoded:
   * - Exclui incidentes em aberto das médias fechadas (MTTR / MTBF).
   * - Distingue Recuperação Operacional (recoveredAt) de Resolução Formal (resolvedAt).
   * - Retorna "INSUFFICIENT_DATA" para MTBF quando houver < 2 falhas fechadas na janela.
   */
  public calculate(input: CalculateReliabilityMetricsInput): IndustrialReliabilityMetrics {
    if (input.windowEnd <= input.windowStart) {
      throw new Error("INVALID_METRIC_WINDOW: windowEnd deve ser maior que windowStart.");
    }

    // Filtrar estritamente pelo tenantId, plantId e janela temporal
    const scopedIncidents = input.incidents.filter(
      (inc) =>
        inc.organizationId === input.tenantId &&
        inc.plantId === input.plantId &&
        inc.firstObservedAt >= input.windowStart &&
        inc.firstObservedAt <= input.windowEnd,
    );

    const totalIncidentsInWindow = scopedIncidents.length;
    const closedIncidents = scopedIncidents.filter(
      (inc) => inc.status === "RESOLVED" || inc.status === "CLOSED",
    );
    const openIncidentsExcludedFromClosedMetrics = totalIncidentsInWindow - closedIncidents.length;

    // 1. MTTD (Mean Time To Detect): detectedAt - firstObservedAt
    const mttdSamples: number[] = [];
    for (const inc of scopedIncidents) {
      const detected = inc.detectedAt ?? inc.firstObservedAt;
      if (detected >= inc.firstObservedAt) {
        mttdSamples.push(detected - inc.firstObservedAt);
      }
    }
    const mttdMs =
      mttdSamples.length > 0
        ? Math.round(mttdSamples.reduce((a, b) => a + b, 0) / mttdSamples.length)
        : null;

    // 2. MTTA (Mean Time To Acknowledge): acknowledgedAt - (detectedAt ?? firstObservedAt)
    const mttaSamples: number[] = [];
    for (const inc of scopedIncidents) {
      if (inc.acknowledgedAt !== undefined) {
        const base = inc.detectedAt ?? inc.firstObservedAt;
        if (inc.acknowledgedAt >= base) {
          mttaSamples.push(inc.acknowledgedAt - base);
        }
      }
    }
    const mttaMs =
      mttaSamples.length > 0
        ? Math.round(mttaSamples.reduce((a, b) => a + b, 0) / mttaSamples.length)
        : null;

    // 3. MTTR — Recuperação Operacional (recoveredAt - firstObservedAt) vs Resolução Formal (resolvedAt - firstObservedAt)
    // Apenas incidentes fechados/resolvidos entram nas médias fechadas
    const recoverySamples: number[] = [];
    const resolutionSamples: number[] = [];

    for (const inc of closedIncidents) {
      const recAt = inc.recoveredAt ?? inc.resolvedAt;
      if (recAt !== undefined && recAt >= inc.firstObservedAt) {
        recoverySamples.push(recAt - inc.firstObservedAt);
      }
      if (inc.resolvedAt !== undefined && inc.resolvedAt >= inc.firstObservedAt) {
        resolutionSamples.push(inc.resolvedAt - inc.firstObservedAt);
      }
    }

    const mttrRecoveryMs =
      recoverySamples.length > 0
        ? Math.round(recoverySamples.reduce((a, b) => a + b, 0) / recoverySamples.length)
        : null;

    const mttrResolutionMs =
      resolutionSamples.length > 0
        ? Math.round(resolutionSamples.reduce((a, b) => a + b, 0) / resolutionSamples.length)
        : null;

    // 4. MTBF (Mean Time Between Failures)
    // Regra obrigatória: Calcular MTBF apenas quando houver pelo menos 2 falhas fechadas na janela; caso contrário, retornar "INSUFFICIENT_DATA".
    let mtbfMs: number | "INSUFFICIENT_DATA" = "INSUFFICIENT_DATA";
    if (closedIncidents.length >= 2) {
      const sortedClosed = [...closedIncidents].sort(
        (a, b) => a.firstObservedAt - b.firstObservedAt,
      );
      const intervals: number[] = [];
      for (let i = 0; i < sortedClosed.length - 1; i++) {
        const prevEnd =
          sortedClosed[i].recoveredAt ??
          sortedClosed[i].resolvedAt ??
          sortedClosed[i].lastObservedAt;
        const nextStart = sortedClosed[i + 1].firstObservedAt;
        const uptimeBetween = Math.max(0, nextStart - prevEnd);
        intervals.push(uptimeBetween);
      }
      if (intervals.length > 0) {
        mtbfMs = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
      }
    }

    // 5. Recurrence Rate: percentual de incidentes que são reincidência de mesma combinação (componente + categoria) na janela
    const seenComponentCategory = new Map<string, number>();
    let recurrentCount = 0;
    for (const inc of scopedIncidents) {
      const key = `${inc.sourceComponentId}:${inc.category}`;
      const prevCount = seenComponentCategory.get(key) ?? 0;
      if (prevCount >= 1 || inc.dedupCount > 1) {
        recurrentCount += 1;
      }
      seenComponentCategory.set(key, prevCount + 1);
    }
    const recurrenceRatePercent =
      totalIncidentsInWindow > 0
        ? Number(((recurrentCount / totalIncidentsInWindow) * 100).toFixed(2))
        : 0;

    // 6. Incident Frequency (por dia)
    const windowDays = Math.max(
      (input.windowEnd - input.windowStart) / (1000 * 60 * 60 * 24),
      1 / 24,
    );
    const incidentFrequencyPerDay = Number((totalIncidentsInWindow / windowDays).toFixed(2));

    // 7. Percentage of Incidents with Confirmed Cause
    const confirmedCauseNumerator = scopedIncidents.filter((inc) =>
      Boolean(inc.confirmedCause),
    ).length;
    const confirmedCauseDenominator = totalIncidentsInWindow;
    const confirmedCausePercent =
      confirmedCauseDenominator > 0
        ? Number(((confirmedCauseNumerator / confirmedCauseDenominator) * 100).toFixed(2))
        : 0;

    // 8. Data Recovery Time (tempo médio para drenar fila Store-and-Forward e reconciliar histórico)
    const dataRecSamples = input.dataRecoverySamplesMs ?? [];
    const dataRecoveryTimeAverageMs =
      dataRecSamples.length > 0
        ? Math.round(dataRecSamples.reduce((a, b) => a + b, 0) / dataRecSamples.length)
        : null;

    // 9. Incidents by Root Cause
    const incidentsByRootCause: Record<string, number> = {};
    for (const inc of scopedIncidents) {
      const ruleKey =
        inc.confirmedCause?.ruleId ?? inc.probableCause?.ruleId ?? "UNCONFIRMED_CAUSE";
      incidentsByRootCause[ruleKey] = (incidentsByRootCause[ruleKey] ?? 0) + 1;
    }

    // 10. Most Affected Components
    const componentCounter = new Map<string, number>();
    for (const inc of scopedIncidents) {
      componentCounter.set(
        inc.sourceComponentId,
        (componentCounter.get(inc.sourceComponentId) ?? 0) + 1,
      );
    }
    const mostAffectedComponents = Array.from(componentCounter.entries())
      .map(([componentId, incidentCount]) => ({ componentId, incidentCount }))
      .sort((a, b) => b.incidentCount - a.incidentCount);

    return {
      tenantId: input.tenantId,
      plantId: input.plantId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      totalIncidentsInWindow,
      openIncidentsExcludedFromClosedMetrics,
      mttdMs,
      mttaMs,
      mttrRecoveryMs,
      mttrResolutionMs,
      mtbfMs,
      recurrenceRatePercent,
      incidentFrequencyPerDay,
      confirmedCausePercent,
      confirmedCauseNumerator,
      confirmedCauseDenominator,
      dataRecoveryTimeAverageMs,
      incidentsByRootCause,
      mostAffectedComponents,
      formulas: {
        MTTD: "mean(detectedAt - firstObservedAt)",
        MTTA: "mean(acknowledgedAt - (detectedAt ?? firstObservedAt))",
        MTTR_RECOVERY: "mean(recoveredAt - firstObservedAt) [closed incidents only]",
        MTTR_RESOLUTION: "mean(resolvedAt - firstObservedAt) [closed incidents only]",
        MTBF: "mean(nextIncident.firstObservedAt - prevIncident.recoveredAt) [requires >= 2 closed failures, else INSUFFICIENT_DATA]",
        CONFIRMED_CAUSE_PCT: "(incidentsWithConfirmedCause / totalIncidentsInWindow) * 100",
      },
    };
  }
}

export const industrialReliabilityCalculator = new IndustrialReliabilityCalculator();
export { IS_PHYSICAL_CONTROL_ALLOWED };
