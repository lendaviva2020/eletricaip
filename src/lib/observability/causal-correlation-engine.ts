// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.8 & 3.8.1: CAUSAL CORRELATION & PROPAGATION ENGINE
// Phases 1 & 4 + Gate 3.8.1 Adversarial Hardening:
// - Deep Recursive Immutability & Cryptographic Hash-Chained Event Stream
// - Strict Causal Confirmation (Versioned Criteria, Contradictory Evidence & Healthy-Origin Rejection)
// - Out-of-Order / Clock-Drift Resilient Root Cause Attribution
// Standards: ISA-18.2, IEC 62443, OpenTelemetry Causal Graph
// =============================================================================

import { sha256 } from "@/lib/diagnostics/crypto-hash";
import type {
  CausalChainAnalysis,
  ClassifiedEventNode,
  ComponentType,
  CorrelatedOperationalEvent,
  HealthSeverity,
} from "./types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "./types";
import { IndustrialDependencyGraph, industrialDependencyGraph } from "./dependency-graph";

export const CAUSAL_CONFIRMATION_CRITERIA_VERSION = "3.8.1-strict-causal" as const;

export interface IngestOperationalEventInput {
  eventId?: string;
  tenantId: string;
  plantId: string;
  componentId: string;
  componentType: ComponentType;
  equipmentId?: string;
  gatewayId?: string;
  tagId?: string;
  sourceTimestamp: number;
  observedAt: number;
  ingestionTimestamp?: number;
  sequenceNumber: number;
  eventType: string;
  severity: HealthSeverity;
  quality: "GOOD" | "BAD" | "UNCERTAIN" | "STALE" | "NOT_CONNECTED" | "FORCED";
  provenance:
    | "PHYSICAL_DATA"
    | "EDGE_DAEMON"
    | "CLOUD_SERVER"
    | "SCADA_RUNTIME"
    | "HISTORIAN_ENGINE"
    | "SECURITY_MONITOR"
    | "SIMULATED";
  correlationId: string;
  traceId?: string;
  evidenceReference: string;
  hasDirectMultiConditionEvidence?: boolean;
  isProcessSafetyAlarm?: boolean;
  metadata?: Record<string, any>;
}

export interface EventStreamBackupSnapshot {
  tenantId: string;
  plantId: string;
  exportedAt: number;
  expectedCount: number;
  headHash: string;
  events: CorrelatedOperationalEvent[];
  snapshotSignature: string;
}

const DEFAULT_CLOCK_DRIFT_THRESHOLD_MS = 5_000;

/**
 * Clona e congela recursivamente qualquer objeto ou array para impedir
 * mutação de propriedades aninhadas em memória antes ou após persistência.
 */
export function deepCloneAndFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    const clonedArr = value.map((item) => deepCloneAndFreeze(item));
    return Object.freeze(clonedArr) as unknown as T;
  }
  const clonedObj: Record<string, any> = {};
  for (const key of Object.keys(value as Record<string, any>)) {
    clonedObj[key] = deepCloneAndFreeze((value as Record<string, any>)[key]);
  }
  return Object.freeze(clonedObj) as T;
}

function computeCanonicalEventHash(params: {
  previousEventHash: string;
  chainIndex: number;
  eventId: string;
  tenantId: string;
  plantId: string;
  componentId: string;
  componentType: ComponentType;
  sourceTimestamp: number;
  observedAt: number;
  sequenceNumber: number;
  eventType: string;
  severity: HealthSeverity;
  quality: string;
  correlationId: string;
  evidenceReference: string;
  metadataJson: string;
}): string {
  return sha256(
    JSON.stringify({
      previousEventHash: params.previousEventHash,
      chainIndex: params.chainIndex,
      eventId: params.eventId,
      tenantId: params.tenantId,
      plantId: params.plantId,
      componentId: params.componentId,
      componentType: params.componentType,
      sourceTimestamp: params.sourceTimestamp,
      observedAt: params.observedAt,
      sequenceNumber: params.sequenceNumber,
      eventType: params.eventType,
      severity: params.severity,
      quality: params.quality,
      correlationId: params.correlationId,
      evidenceReference: params.evidenceReference,
      metadataJson: params.metadataJson,
    }),
  );
}

/**
 * Determina se um evento representa uma anomalia/falha real vs um sinal benigno/informativo.
 */
function isFailureOrDegradedEvent(evt: CorrelatedOperationalEvent): boolean {
  if (evt.metadata?.isHealthyVerification === true || evt.metadata?.isHealthySignal === true) {
    return false;
  }
  if (
    evt.quality === "GOOD" &&
    (evt.severity === "INFO" || evt.severity === "LOW") &&
    (evt.eventType.endsWith("_OK") ||
      evt.eventType.endsWith("_HEALTHY") ||
      evt.eventType === "HEARTBEAT_OK" ||
      evt.eventType === "BATCH_DELIVERED" ||
      evt.eventType === "TELEMETRY_SAMPLE")
  ) {
    return false;
  }
  return true;
}

function isExplicitHealthyVerificationEvent(evt: CorrelatedOperationalEvent): boolean {
  return (
    evt.metadata?.isHealthyVerification === true ||
    evt.metadata?.isHealthySignal === true ||
    (evt.quality === "GOOD" &&
      (evt.eventType.endsWith("_OK") ||
        evt.eventType.endsWith("_HEALTHY") ||
        evt.eventType === "HEARTBEAT_OK"))
  );
}

export class IndustrialCorrelationEngine {
  private eventsByTenantPlant: Map<string, CorrelatedOperationalEvent[]> = new Map();
  private ledgerSealsByScope: Map<string, { expectedCount: number; lastHeadHash: string }> = new Map();
  private lastSequenceByComponent: Map<string, { seq: number; sourceTs: number }> = new Map();
  private seenEventSignatures: Set<string> = new Set();

  private scopeKey(tenantId: string, plantId: string): string {
    return `${tenantId}:${plantId}`;
  }

  private compKey(tenantId: string, plantId: string, componentId: string): string {
    return `${tenantId}:${plantId}:${componentId}`;
  }

  /**
   * Registra um evento operacional preservando imutabilidade profunda (deep freeze),
   * timestamps originais, ordem de sequência, evidência bruta e cadeia criptográfica SHA-256.
   */
  public recordEvent(input: IngestOperationalEventInput): CorrelatedOperationalEvent {
    if (!input.tenantId || !input.plantId || !input.componentId) {
      throw new Error("INVALID_EVENT_SCOPE: tenantId, plantId e componentId são obrigatórios.");
    }

    const ingestionTimestamp = input.ingestionTimestamp ?? input.observedAt;
    const clockDriftMs = Math.abs(input.observedAt - input.sourceTimestamp);

    const cKey = this.compKey(input.tenantId, input.plantId, input.componentId);
    const prev = this.lastSequenceByComponent.get(cKey);
    const isOutOfOrder = Boolean(
      prev && (input.sequenceNumber < prev.seq || input.sourceTimestamp < prev.sourceTs),
    );

    const signature = `${input.tenantId}:${input.plantId}:${input.componentId}:${input.eventType}:${input.sequenceNumber}:${input.sourceTimestamp}`;
    const isDuplicate = this.seenEventSignatures.has(signature);
    this.seenEventSignatures.add(signature);

    if (!prev || input.sequenceNumber >= prev.seq) {
      this.lastSequenceByComponent.set(cKey, {
        seq: input.sequenceNumber,
        sourceTs: input.sourceTimestamp,
      });
    }

    const sKey = this.scopeKey(input.tenantId, input.plantId);
    const list = this.eventsByTenantPlant.get(sKey) ?? [];
    const chainIndex = list.length;
    const previousEventHash =
      chainIndex > 0
        ? list[chainIndex - 1].eventHash ?? "GENESIS_EVENT_STREAM_BLOCK"
        : "GENESIS_EVENT_STREAM_BLOCK";

    const eventId =
      input.eventId ?? `evt_${input.tenantId}_${input.componentId}_${input.sequenceNumber}_${input.sourceTimestamp}`;

    const frozenMetadata = deepCloneAndFreeze({
      ...(input.metadata ?? {}),
      hasDirectMultiConditionEvidence: Boolean(input.hasDirectMultiConditionEvidence),
      isProcessSafetyAlarm: Boolean(input.isProcessSafetyAlarm),
      clockDriftExceeded: clockDriftMs > DEFAULT_CLOCK_DRIFT_THRESHOLD_MS,
    });

    const metadataJson = JSON.stringify(frozenMetadata);
    const eventHash = computeCanonicalEventHash({
      previousEventHash,
      chainIndex,
      eventId,
      tenantId: input.tenantId,
      plantId: input.plantId,
      componentId: input.componentId,
      componentType: input.componentType,
      sourceTimestamp: input.sourceTimestamp,
      observedAt: input.observedAt,
      sequenceNumber: input.sequenceNumber,
      eventType: input.eventType,
      severity: input.severity,
      quality: input.quality,
      correlationId: input.correlationId,
      evidenceReference: input.evidenceReference,
      metadataJson,
    });

    const eventObj: CorrelatedOperationalEvent = deepCloneAndFreeze({
      eventId,
      tenantId: input.tenantId,
      plantId: input.plantId,
      componentId: input.componentId,
      componentType: input.componentType,
      equipmentId: input.equipmentId,
      gatewayId: input.gatewayId,
      tagId: input.tagId,
      sourceTimestamp: input.sourceTimestamp,
      observedAt: input.observedAt,
      ingestionTimestamp,
      sequenceNumber: input.sequenceNumber,
      eventType: input.eventType,
      severity: input.severity,
      quality: input.quality,
      provenance: input.provenance,
      correlationId: input.correlationId,
      traceId: input.traceId,
      evidenceReference: input.evidenceReference,
      clockDriftMs,
      isOutOfOrder,
      isDuplicate,
      chainIndex,
      previousEventHash,
      eventHash,
      metadata: frozenMetadata,
    });

    list.push(eventObj);
    this.eventsByTenantPlant.set(sKey, list);
    this.ledgerSealsByScope.set(sKey, {
      expectedCount: list.length,
      lastHeadHash: eventHash,
    });

    return eventObj;
  }

  /**
   * Bloqueia tentativas de UPDATE sobre eventos operacionais imutáveis.
   */
  public attemptUpdateEvent(_eventId: string, _patch: Record<string, any>): never {
    throw new Error(
      "IMMUTABLE_EVENT_STORE_VIOLATION: Operação UPDATE proibida sobre eventos operacionais industriais.",
    );
  }

  /**
   * Bloqueia tentativas de DELETE sobre eventos operacionais imutáveis.
   */
  public attemptDeleteEvent(_eventId: string): never {
    throw new Error(
      "IMMUTABLE_EVENT_STORE_VIOLATION: Operação DELETE proibida sobre eventos operacionais industriais.",
    );
  }

  /**
   * Bloqueia tentativas administrativas indevidas de truncamento da cadeia de eventos.
   */
  public attemptTruncateStream(_tenantId: string, _plantId: string, _actorRole: string): never {
    throw new Error(
      "IMMUTABLE_EVENT_STORE_VIOLATION: Truncamento administrativo da trilha de eventos é estritamente proibido.",
    );
  }

  /**
   * Verifica a integridade criptográfica SHA-256 de toda a trilha de eventos persistida,
   * detectando adulteração de payload pós-persistência (UPDATE), remoção intermediária (DELETE)
   * ou truncamento de cauda (TRUNCATION).
   */
  public verifyEventStreamIntegrity(
    tenantId: string,
    plantId: string,
  ): {
    isValid: boolean;
    reason?: "PAYLOAD_TAMPERED" | "CHAIN_LINK_BROKEN" | "STREAM_TRUNCATED" | "INDEX_GAP_DETECTED";
    brokenAtIndex?: number;
  } {
    const sKey = this.scopeKey(tenantId, plantId);
    const list = this.eventsByTenantPlant.get(sKey) ?? [];
    const seal = this.ledgerSealsByScope.get(sKey);

    if (seal && list.length < seal.expectedCount) {
      return {
        isValid: false,
        reason: "STREAM_TRUNCATED",
        brokenAtIndex: list.length,
      };
    }

    let expectedPrevHash = "GENESIS_EVENT_STREAM_BLOCK";

    for (let i = 0; i < list.length; i++) {
      const evt = list[i];
      if (evt.chainIndex !== i) {
        return {
          isValid: false,
          reason: "INDEX_GAP_DETECTED",
          brokenAtIndex: i,
        };
      }
      if (evt.previousEventHash !== expectedPrevHash) {
        return {
          isValid: false,
          reason: "CHAIN_LINK_BROKEN",
          brokenAtIndex: i,
        };
      }

      const recalculatedHash = computeCanonicalEventHash({
        previousEventHash: expectedPrevHash,
        chainIndex: i,
        eventId: evt.eventId,
        tenantId: evt.tenantId,
        plantId: evt.plantId,
        componentId: evt.componentId,
        componentType: evt.componentType,
        sourceTimestamp: evt.sourceTimestamp,
        observedAt: evt.observedAt,
        sequenceNumber: evt.sequenceNumber,
        eventType: evt.eventType,
        severity: evt.severity,
        quality: evt.quality,
        correlationId: evt.correlationId,
        evidenceReference: evt.evidenceReference,
        metadataJson: JSON.stringify(evt.metadata ?? {}),
      });

      if (recalculatedHash !== evt.eventHash) {
        return {
          isValid: false,
          reason: "PAYLOAD_TAMPERED",
          brokenAtIndex: i,
        };
      }

      expectedPrevHash = evt.eventHash!;
    }

    if (seal && expectedPrevHash !== seal.lastHeadHash) {
      return {
        isValid: false,
        reason: "STREAM_TRUNCATED",
        brokenAtIndex: list.length - 1,
      };
    }

    return { isValid: true };
  }

  /**
   * Exporta um snapshot de backup assinado da trilha de eventos.
   */
  public exportBackupSnapshot(tenantId: string, plantId: string): EventStreamBackupSnapshot {
    const sKey = this.scopeKey(tenantId, plantId);
    const events = (this.eventsByTenantPlant.get(sKey) ?? []).map((e) => deepCloneAndFreeze(e));
    const headHash =
      events.length > 0 ? events[events.length - 1].eventHash! : "GENESIS_EVENT_STREAM_BLOCK";
    const exportedAt = Date.now();
    const snapshotSignature = sha256(
      JSON.stringify({
        tenantId,
        plantId,
        expectedCount: events.length,
        headHash,
      }),
    );

    return deepCloneAndFreeze({
      tenantId,
      plantId,
      exportedAt,
      expectedCount: events.length,
      headHash,
      events,
      snapshotSignature,
    });
  }

  /**
   * Restaura um backup de eventos verificando antes a integridade criptográfica de cada elo e da assinatura.
   */
  public restoreAndVerifyBackupSnapshot(snapshot: EventStreamBackupSnapshot): {
    restored: boolean;
    error?: string;
  } {
    const expectedSig = sha256(
      JSON.stringify({
        tenantId: snapshot.tenantId,
        plantId: snapshot.plantId,
        expectedCount: snapshot.expectedCount,
        headHash: snapshot.headHash,
      }),
    );

    if (expectedSig !== snapshot.snapshotSignature) {
      return {
        restored: false,
        error: "BACKUP_SIGNATURE_INVALID: Assinatura do backup não confere.",
      };
    }

    if (snapshot.events.length !== snapshot.expectedCount) {
      return {
        restored: false,
        error: "BACKUP_TRUNCATED: Quantidade de eventos no backup difere do selo esperado.",
      };
    }

    const sKey = this.scopeKey(snapshot.tenantId, snapshot.plantId);
    const previousEvents = this.eventsByTenantPlant.get(sKey);
    const previousSeal = this.ledgerSealsByScope.get(sKey);

    this.eventsByTenantPlant.set(
      sKey,
      snapshot.events.map((e) => deepCloneAndFreeze(e)),
    );
    this.ledgerSealsByScope.set(sKey, {
      expectedCount: snapshot.expectedCount,
      lastHeadHash: snapshot.headHash,
    });

    const integrity = this.verifyEventStreamIntegrity(snapshot.tenantId, snapshot.plantId);
    if (!integrity.isValid) {
      // Reverter restauração corrompida
      if (previousEvents) this.eventsByTenantPlant.set(sKey, previousEvents);
      else this.eventsByTenantPlant.delete(sKey);
      if (previousSeal) this.ledgerSealsByScope.set(sKey, previousSeal);
      else this.ledgerSealsByScope.delete(sKey);

      return {
        restored: false,
        error: `BACKUP_INTEGRITY_VERIFICATION_FAILED: Falha na cadeia criptográfica (${integrity.reason} no índice ${integrity.brokenAtIndex}).`,
      };
    }

    return { restored: true };
  }

  /**
   * Consulta eventos preservados por janela temporal e filtros opcionais, retornando cópias imutáveis.
   */
  public queryEvents(params: {
    tenantId: string;
    plantId: string;
    windowStartMs?: number;
    windowEndMs?: number;
    correlationId?: string;
    componentId?: string;
    equipmentId?: string;
    gatewayId?: string;
    tagId?: string;
  }): CorrelatedOperationalEvent[] {
    const sKey = this.scopeKey(params.tenantId, params.plantId);
    const list = this.eventsByTenantPlant.get(sKey) ?? [];

    return list
      .filter((evt) => {
        if (params.windowStartMs !== undefined && evt.observedAt < params.windowStartMs) return false;
        if (params.windowEndMs !== undefined && evt.observedAt > params.windowEndMs) return false;
        if (params.correlationId && evt.correlationId !== params.correlationId) return false;
        if (params.componentId && evt.componentId !== params.componentId) return false;
        if (params.equipmentId && evt.equipmentId !== params.equipmentId) return false;
        if (params.gatewayId && evt.gatewayId !== params.gatewayId) return false;
        if (params.tagId && evt.tagId !== params.tagId) return false;
        return true;
      })
      .map((evt) => deepCloneAndFreeze(evt));
  }

  /**
   * FASE 1, FASE 4 & GATE 3.8.1: Analisa uma janela de eventos correlacionados usando o Grafo de Dependências Industriais.
   * Garantias Adversariais (Gate 3.8.1):
   * 1. Relação topológica existente SEM evidência de falha na origem (`isFailureOrDegradedEvent === false` ou estado saudável)
   *    NUNCA absorve sintomas downstream nem recebe atribuição de causa raiz (`topologicalOnlyWithoutOriginFailureRejected: true`).
   * 2. Evidências contraditórias para o mesmo componente na janela (`hasContradictoryEvidence: true`) rebaixam o status para
   *    `INCONCLUSIVE` (jamais `CONFIRMED_BY_EVIDENCE`).
   * 3. Causa primária nunca é atribuída a um sintoma secundário mesmo quando o sintoma secundário apresenta `sourceTimestamp`
   *    anterior devido a clock drift ou entrega fora de ordem.
   * 4. Caminho topológico com aresta `CONFIGURED_UNVERIFIED` ou proximidade temporal sem evidência direta na origem
   *    mantém a hipótese como `SUSPECTED`.
   */
  public correlateEventsAndPropagate(params: {
    tenantId: string;
    plantId: string;
    correlationId: string;
    windowStartMs?: number;
    windowEndMs?: number;
    graph?: IndustrialDependencyGraph;
  }): CausalChainAnalysis {
    const graph = params.graph ?? industrialDependencyGraph;
    const rawEvents = this.queryEvents({
      tenantId: params.tenantId,
      plantId: params.plantId,
      correlationId: params.correlationId,
      windowStartMs: params.windowStartMs,
      windowEndMs: params.windowEndMs,
    });

    if (rawEvents.length === 0) {
      throw new Error(
        `NO_CORRELATED_EVENTS_FOUND: Nenhum evento encontrado para correlationId=${params.correlationId} no tenant=${params.tenantId}.`,
      );
    }

    // Ordenar eventos cronologicamente pelo timestamp original da fonte (desempate por sequenceNumber e observedAt)
    const sortedEvents = [...rawEvents].sort((a, b) => {
      if (a.sourceTimestamp !== b.sourceTimestamp) return a.sourceTimestamp - b.sourceTimestamp;
      if (a.sequenceNumber !== b.sequenceNumber) return a.sequenceNumber - b.sequenceNumber;
      return a.observedAt - b.observedAt;
    });

    // Identificar componentes com falha real versus componentes apenas com eventos saudáveis/informativos
    const failureEvents = sortedEvents.filter((e) => isFailureOrDegradedEvent(e));
    const healthyVerificationComponents = new Set(
      sortedEvents.filter((e) => isExplicitHealthyVerificationEvent(e)).map((e) => e.componentId),
    );
    const failureComponentIds = new Set(failureEvents.map((e) => e.componentId));

    // Detectar evidências contraditórias (mesmo componente reportando falha crítica e prova saudável na mesma janela)
    const contradictoryComponents = new Set<string>();
    for (const compId of failureComponentIds) {
      if (healthyVerificationComponents.has(compId)) {
        contradictoryComponents.add(compId);
      }
      const compEvents = sortedEvents.filter((e) => e.componentId === compId);
      if (compEvents.some((e) => e.metadata?.contradictsFailure === true)) {
        contradictoryComponents.add(compId);
      }
    }
    const hasContradictoryEvidence = contradictoryComponents.size > 0;

    let topologicalOnlyWithoutOriginFailureRejected = false;
    let temporalOnlyCorrelationRejected = false;

    const groupedSymptoms: ClassifiedEventNode[] = [];
    const pathCanonicallyValidatedBySymptom = new Map<string, boolean>();

    const eventsToClassify = failureEvents.length > 0 ? failureEvents : sortedEvents;
    const allEventComponentIds = Array.from(new Set(sortedEvents.map((e) => e.componentId)));

    for (const evt of eventsToClassify) {
      let upstreamCauseComponentId: string | undefined;
      let dependencyPathFromCause: string[] | undefined;
      let isPathAllCanonical = false;

      for (const candidateRootId of allEventComponentIds) {
        if (candidateRootId === evt.componentId) continue;

        const pathInfo = graph.getDependencyPathWithValidation(
          params.tenantId,
          params.plantId,
          candidateRootId,
          evt.componentId,
        );

        if (pathInfo && pathInfo.path.length >= 2) {
          // Verificar se o candidato upstream realmente apresenta evidência de falha!
          if (!failureComponentIds.has(candidateRootId)) {
            // Existe relação topológica no grafo, mas o componente upstream NÃO falhou (apenas emitiu heartbeat/OK)!
            topologicalOnlyWithoutOriginFailureRejected = true;
            continue;
          }

          if (!upstreamCauseComponentId || pathInfo.path.length > (dependencyPathFromCause?.length ?? 0)) {
            upstreamCauseComponentId = candidateRootId;
            dependencyPathFromCause = pathInfo.path;
            isPathAllCanonical = pathInfo.allEdgesCanonicalValidated;
          }
        }
      }

      if (upstreamCauseComponentId && dependencyPathFromCause) {
        const isProcessAlarm = Boolean(evt.metadata?.isProcessSafetyAlarm);
        pathCanonicallyValidatedBySymptom.set(evt.eventId, isPathAllCanonical);
        groupedSymptoms.push({
          eventId: evt.eventId,
          componentId: evt.componentId,
          eventType: evt.eventType,
          role: "SECONDARY_PROPAGATED_SYMPTOM",
          suppressedVisualAlert: !isProcessAlarm,
          preservedOriginalEvent: evt,
          upstreamCauseComponentId,
          dependencyPathFromCause,
        });
      } else {
        // Verificar se este componente com falha é provedor upstream de algum outro componente com falha na janela
        const hasDownstreamFailureInWindow = Array.from(failureComponentIds).some((otherId) => {
          if (otherId === evt.componentId) return false;
          const p = graph.getDependencyPath(params.tenantId, params.plantId, evt.componentId, otherId);
          return Boolean(p && p.length >= 2);
        });

        if (hasDownstreamFailureInWindow || failureComponentIds.size <= 1) {
          groupedSymptoms.push({
            eventId: evt.eventId,
            componentId: evt.componentId,
            eventType: evt.eventType,
            role: "PRIMARY_ROOT_CAUSE_CANDIDATE",
            suppressedVisualAlert: false,
            preservedOriginalEvent: evt,
          });
        } else {
          temporalOnlyCorrelationRejected = true;
          groupedSymptoms.push({
            eventId: evt.eventId,
            componentId: evt.componentId,
            eventType: evt.eventType,
            role: "INDEPENDENT_ANOMALY",
            suppressedVisualAlert: false,
            preservedOriginalEvent: evt,
          });
        }
      }
    }

    // Construir lista de causas primárias garantindo que sintoma secundário nunca receba causa primária
    const primaryCauses: CausalChainAnalysis["primaryCauses"] = [];
    const seenRootComponents = new Set<string>();

    for (const node of groupedSymptoms) {
      if (node.role === "SECONDARY_PROPAGATED_SYMPTOM") continue;
      if (seenRootComponents.has(node.componentId)) continue;
      seenRootComponents.add(node.componentId);

      const evt = node.preservedOriginalEvent;
      const hasDirectEvidence = Boolean(evt.metadata?.hasDirectMultiConditionEvidence);
      const isContradicted = contradictoryComponents.has(node.componentId);

      const downstreamSymptoms = groupedSymptoms.filter(
        (s) => s.role === "SECONDARY_PROPAGATED_SYMPTOM" && s.upstreamCauseComponentId === node.componentId,
      );
      const allDownstreamPathsCanonical =
        downstreamSymptoms.length === 0 ||
        downstreamSymptoms.every((s) => pathCanonicallyValidatedBySymptom.get(s.eventId) === true);

      let status: "CONFIRMED_BY_EVIDENCE" | "SUSPECTED" | "INCONCLUSIVE" = "SUSPECTED";

      if (isContradicted) {
        status = "INCONCLUSIVE";
      } else if (hasDirectEvidence && allDownstreamPathsCanonical && !temporalOnlyCorrelationRejected) {
        status = "CONFIRMED_BY_EVIDENCE";
      } else if (hasDirectEvidence && node.role === "PRIMARY_ROOT_CAUSE_CANDIDATE" && allDownstreamPathsCanonical) {
        status = "CONFIRMED_BY_EVIDENCE";
      } else {
        status = "SUSPECTED";
      }

      const downstreamSymptomRefs = downstreamSymptoms.map(
        (s) => s.preservedOriginalEvent.evidenceReference,
      );

      primaryCauses.push({
        componentId: node.componentId,
        eventId: evt.eventId,
        eventType: evt.eventType,
        status,
        evidenceRefs: Array.from(new Set([evt.evidenceReference, ...downstreamSymptomRefs])),
        explanation:
          status === "CONFIRMED_BY_EVIDENCE"
            ? `Causa primária confirmada (${CAUSAL_CONFIRMATION_CRITERIA_VERSION}) por evidência direta em ${node.componentId} (${evt.eventType}).`
            : status === "INCONCLUSIVE"
              ? `Evidências contraditórias detectadas para ${node.componentId}; confirmação bloqueada.`
              : `Hipótese em ${node.componentId} (${evt.eventType}) mantida como SUSPECTED (exige evidência direta na origem e caminho canônico validado).`,
      });
    }

    // Selecionar o primeiro sinal real entre as causas primárias (evitando que clock drift em sintoma secundário sequestre a origem)
    const rootCauseEvents = groupedSymptoms
      .filter((s) => s.role !== "SECONDARY_PROPAGATED_SYMPTOM")
      .map((s) => s.preservedOriginalEvent);
    const firstSignalEvent = rootCauseEvents.length > 0 ? rootCauseEvents[0] : sortedEvents[0];

    const propagationChain: string[] = [];
    for (const evt of sortedEvents) {
      const stepLabel = `${evt.componentId}:${evt.eventType}`;
      if (!propagationChain.includes(stepLabel)) {
        propagationChain.push(stepLabel);
      }
    }

    return {
      analysisId: `causal_${params.tenantId}_${params.correlationId}_${firstSignalEvent.observedAt}`,
      tenantId: params.tenantId,
      plantId: params.plantId,
      correlationId: params.correlationId,
      confirmationCriteriaVersion: CAUSAL_CONFIRMATION_CRITERIA_VERSION,
      firstSignalEvent,
      primaryCauses,
      groupedSymptoms,
      propagationChain,
      hasMultipleIndependentCauses: primaryCauses.length > 1,
      temporalOnlyCorrelationRejected,
      hasContradictoryEvidence,
      topologicalOnlyWithoutOriginFailureRejected,
    };
  }

  public clear(): void {
    this.eventsByTenantPlant.clear();
    this.ledgerSealsByScope.clear();
    this.lastSequenceByComponent.clear();
    this.seenEventSignatures.clear();
  }
}

export const industrialCorrelationEngine = new IndustrialCorrelationEngine();
export { IS_PHYSICAL_CONTROL_ALLOWED };
