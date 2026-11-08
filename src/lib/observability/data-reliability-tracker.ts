// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.7: DATA RELIABILITY TRACKER
// 10-Stage Pipeline Observability, Sequence Loss Detection & Deadband Invariance
// Standards: ISA-95 Part 2, IEC 62443-4-2, NIST SP 800-82 Rev. 3
// =============================================================================

import type { PipelineReliabilityReport, PipelineStage, PipelineStageMetric } from "./types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "./types";

export interface SamplePipelineEvent {
  sampleId: string;
  gatewayId: string;
  tenantId: string;
  plantId: string;
  tagName: string;
  sequenceNumber: number;
  sourceTimestamp: number;
  edgeReceivedAt: number;
  cloudReceivedAt: number;
  quality: "GOOD" | "BAD" | "UNCERTAIN" | "STALE" | "NOT_CONNECTED";
  isDuplicate?: boolean;
  isLate?: boolean;
  isDeadbandSuppressed?: boolean;
}

export class DataReliabilityTracker {
  private lastSequences: Map<string, number> = new Map(); // gatewayId:tag -> lastSequenceNumber
  private deduplicationSet: Set<string> = new Set(); // Dedup Key -> seen
  private stageMetrics: Map<string, Map<PipelineStage, PipelineStageMetric>> = new Map();
  private reports: Map<string, PipelineReliabilityReport> = new Map();

  constructor() {
    this.initDefaultStages("default");
  }

  private initDefaultStages(scopeKey: string): Map<PipelineStage, PipelineStageMetric> {
    const stages: PipelineStage[] = [
      "1_SOURCE_COLLECTION",
      "2_NORMALIZATION",
      "3_SCHEMA_VALIDATION",
      "4_BATCH_FORMATION",
      "5_LOCAL_BUFFER_PERSISTENCE",
      "6_EDGE_TRANSMISSION",
      "7_CLOUD_RECEPTION",
      "8_DEDUPLICATION",
      "9_HISTORIAN_PERSISTENCE",
      "10_SCADA_DISPATCH",
    ];

    const map = new Map<PipelineStage, PipelineStageMetric>();
    for (const stage of stages) {
      map.set(stage, {
        stage,
        samplesIn: 0,
        samplesOut: 0,
        samplesDropped: 0,
        processingTimeMs: 0,
      });
    }
    this.stageMetrics.set(scopeKey, map);
    return map;
  }

  /**
   * Rastreia a passagem de uma amostra pelo pipeline de dados industrial.
   */
  public trackSample(event: SamplePipelineEvent): {
    isAccepted: boolean;
    isSequenceLoss: boolean;
    isOutOfOrder: boolean;
    isDuplicate: boolean;
    latencyMs: number;
  } {
    const scopeKey = `${event.tenantId}:${event.gatewayId}`;
    let stages = this.stageMetrics.get(scopeKey);
    if (!stages) {
      stages = this.initDefaultStages(scopeKey);
    }

    const latencyMs = Math.max(0, event.cloudReceivedAt - event.sourceTimestamp);
    const dedupKey = `${event.gatewayId}:${event.tagName}:${event.sourceTimestamp}`;
    const tagSeqKey = `${event.gatewayId}:${event.tagName}`;

    // Estágio 1 a 6: Borda
    stages.get("1_SOURCE_COLLECTION")!.samplesIn += 1;
    stages.get("1_SOURCE_COLLECTION")!.samplesOut += 1;
    stages.get("2_NORMALIZATION")!.samplesIn += 1;
    stages.get("2_NORMALIZATION")!.samplesOut += 1;
    stages.get("3_SCHEMA_VALIDATION")!.samplesIn += 1;
    stages.get("3_SCHEMA_VALIDATION")!.samplesOut += 1;
    stages.get("4_BATCH_FORMATION")!.samplesIn += 1;
    stages.get("4_BATCH_FORMATION")!.samplesOut += 1;
    stages.get("5_LOCAL_BUFFER_PERSISTENCE")!.samplesIn += 1;
    stages.get("5_LOCAL_BUFFER_PERSISTENCE")!.samplesOut += 1;
    stages.get("6_EDGE_TRANSMISSION")!.samplesIn += 1;
    stages.get("6_EDGE_TRANSMISSION")!.samplesOut += 1;

    // Estágio 7: Cloud Reception
    stages.get("7_CLOUD_RECEPTION")!.samplesIn += 1;

    // Estágio 8: Deduplicação
    stages.get("8_DEDUPLICATION")!.samplesIn += 1;
    let isDuplicate = false;
    if (this.deduplicationSet.has(dedupKey) || event.isDuplicate) {
      isDuplicate = true;
      stages.get("8_DEDUPLICATION")!.samplesDropped += 1;
      stages.get("8_DEDUPLICATION")!.dropReason = "DUPLICATE_SAMPLE_DETECTED";
      this.updateReportMetrics(event, { isDuplicate: true, latencyMs });
      return { isAccepted: false, isSequenceLoss: false, isOutOfOrder: false, isDuplicate: true, latencyMs };
    }
    this.deduplicationSet.add(dedupKey);
    stages.get("8_DEDUPLICATION")!.samplesOut += 1;

    // Verificação de Sequência e Ordem Temporal
    let isSequenceLoss = false;
    let isOutOfOrder = false;
    const lastSeq = this.lastSequences.get(tagSeqKey);

    if (lastSeq !== undefined) {
      if (event.sequenceNumber < lastSeq) {
        // Amostra chegou fora de ordem (retransmissão ou rede assíncrona)
        isOutOfOrder = true;
      } else if (event.sequenceNumber > lastSeq + 1) {
        // Perda de sequência comprovada (salto de pacotes)
        isSequenceLoss = true;
      }
    }
    this.lastSequences.set(tagSeqKey, event.sequenceNumber);

    // Estágio 9: Persistência no Historian
    stages.get("9_HISTORIAN_PERSISTENCE")!.samplesIn += 1;
    stages.get("9_HISTORIAN_PERSISTENCE")!.samplesOut += 1;

    // Estágio 10: Disponibilização no SCADA
    stages.get("10_SCADA_DISPATCH")!.samplesIn += 1;
    stages.get("10_SCADA_DISPATCH")!.samplesOut += 1;

    this.updateReportMetrics(event, {
      isDuplicate: false,
      isOutOfOrder,
      isSequenceLoss,
      latencyMs,
    });

    return {
      isAccepted: true,
      isSequenceLoss,
      isOutOfOrder,
      isDuplicate: false,
      latencyMs,
    };
  }

  private updateReportMetrics(
    event: SamplePipelineEvent,
    details: {
      isDuplicate: boolean;
      isOutOfOrder?: boolean;
      isSequenceLoss?: boolean;
      latencyMs: number;
    },
  ): void {
    const key = `${event.tenantId}:${event.gatewayId}`;
    let report = this.reports.get(key);

    const stagesMap = this.stageMetrics.get(key) || this.initDefaultStages(key);
    const stagesObj: any = {};
    stagesMap.forEach((v, k) => {
      stagesObj[k] = { ...v };
    });

    if (!report) {
      report = {
        gatewayId: event.gatewayId,
        tenantId: event.tenantId,
        plantId: event.plantId,
        evaluatedAt: Date.now(),
        stages: stagesObj,
        totalSamplesReceived: 0,
        invalidSamplesCount: 0,
        duplicateSamplesCount: 0,
        lateSamplesCount: 0,
        outOfOrderCount: 0,
        rejectedBatchesCount: 0,
        schemaErrorsCount: 0,
        authenticationFailuresCount: 0,
        sequenceLossCount: 0,
        averageIngestionDurationMs: details.latencyMs,
        averageSyncDurationMs: 0,
        currentBacklogSamples: 0,
        oldestBacklogSampleAgeMs: 0,
      };
      this.reports.set(key, report);
    }

    report.totalSamplesReceived += 1;
    report.evaluatedAt = Date.now();
    report.stages = stagesObj;

    if (details.isDuplicate) {
      report.duplicateSamplesCount += 1;
    }
    if (details.isOutOfOrder) {
      report.outOfOrderCount += 1;
    }
    if (details.isSequenceLoss) {
      report.sequenceLossCount += 1;
    }
    if (event.isLate) {
      report.lateSamplesCount += 1;
    }

    // Média móvel exponencial de latência
    report.averageIngestionDurationMs = Math.round(
      report.averageIngestionDurationMs * 0.9 + details.latencyMs * 0.1,
    );
  }

  public getReliabilityReport(tenantId: string, gatewayId: string): PipelineReliabilityReport | undefined {
    return this.reports.get(`${tenantId}:${gatewayId}`);
  }

  public getAllReports(): PipelineReliabilityReport[] {
    return Array.from(this.reports.values());
  }

  public clear(): void {
    this.lastSequences.clear();
    this.deduplicationSet.clear();
    this.stageMetrics.clear();
    this.reports.clear();
  }
}

export const dataReliabilityTracker = new DataReliabilityTracker();
