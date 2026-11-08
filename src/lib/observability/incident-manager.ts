// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.7 & GATE 3.8: INDUSTRIAL INCIDENT MANAGER
// Operational Incidents, Assisted Investigation, Root Cause Confirmation,
// Rejected Hypotheses, Consistent Recovery Validation & Tamper-Proof SHA-256 Audit
// Standards: IEC 62443-4-2, ISA-18.2, ITIL v4 Industrial Incident Management
// =============================================================================

import { sha256 } from "@/lib/diagnostics/crypto-hash";
import type { FleetRole } from "@/lib/edge/types";
import type {
  DeterministicDiagnosticRecord,
  IncidentAuditEntry,
  IncidentCategory,
  IncidentInvestigationStage,
  IncidentSeverity,
  IncidentStatus,
  IndustrialIncident,
  RecoverySampleEvidence,
} from "./types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "./types";

export interface CreateIncidentParams {
  organizationId: string;
  plantId: string;
  sourceComponentId: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  title: string;
  description: string;
  impact: string;
  evidence: Record<string, any>;
  correlationId?: string;
  relatedAlarms?: string[];
  firstObservedAt?: number;
  detectedAt?: number;
  actor: {
    id: string;
    email: string;
    role: FleetRole;
  };
}

export interface TransitionIncidentParams {
  incidentId: string;
  toStatus: IncidentStatus;
  note: string;
  resolution?: string;
  timestampMs?: number;
  actor: {
    id: string;
    email: string;
    role: FleetRole;
  };
}

export class IndustrialIncidentManager {
  private incidents: Map<string, IndustrialIncident> = new Map();
  private correlationIndex: Map<string, string> = new Map(); // Dedup Key -> incidentId

  private appendChainedAuditEntry(params: {
    incident: IndustrialIncident;
    fromStatus: IncidentStatus;
    toStatus: IncidentStatus;
    actor: { id: string; email: string; role: FleetRole };
    note: string;
    resolution?: string;
    timestamp: number;
    investigationStage?: IncidentInvestigationStage;
  }): IncidentAuditEntry {
    const { incident, fromStatus, toStatus, actor, note, resolution, timestamp, investigationStage } = params;
    const previousHash =
      incident.auditTrail.length > 0
        ? incident.auditTrail[incident.auditTrail.length - 1].tamperProofHash
        : "GENESIS_INCIDENT_AUDIT_BLOCK";

    const transitionData = {
      previousHash,
      incidentId: incident.incidentId,
      timestamp,
      fromStatus,
      toStatus,
      actor,
      note,
      resolution,
    };

    const tamperProofHash = sha256(JSON.stringify(transitionData));

    const entry: IncidentAuditEntry = {
      transitionId: `trans_${timestamp}_${incident.auditTrail.length}`,
      timestamp,
      fromStatus,
      toStatus,
      investigationStage,
      actorId: actor.id,
      actorEmail: actor.email,
      actorRole: actor.role,
      note,
      resolution,
      tamperProofHash,
    };

    incident.auditTrail.push(entry);
    return entry;
  }

  /**
   * Abre um novo incidente operacional ou correlaciona e incrementa deduplicação
   * caso a mesma falha já esteja aberta para o mesmo componente.
   */
  public reportIncident(params: CreateIncidentParams): { incident: IndustrialIncident; isNew: boolean } {
    const now = params.detectedAt ?? Date.now();
    const firstObservedAt = params.firstObservedAt ?? now;
    // Chave de deduplicação: mesmo tenant + planta + componente + categoria + severidade
    const dedupKey = `${params.organizationId}:${params.plantId}:${params.sourceComponentId}:${params.category}:${params.severity}`;
    const existingIncidentId = this.correlationIndex.get(dedupKey);

    if (existingIncidentId) {
      const existing = this.incidents.get(existingIncidentId);
      if (existing && existing.status !== "RESOLVED" && existing.status !== "CLOSED") {
        // Incrementa deduplicação e atualiza último timestamp
        existing.lastObservedAt = now;
        existing.dedupCount += 1;
        existing.evidence = { ...existing.evidence, ...params.evidence, lastOccurrence: now };
        if (params.relatedAlarms && params.relatedAlarms.length > 0) {
          const combined = new Set([...existing.relatedAlarms, ...params.relatedAlarms]);
          existing.relatedAlarms = Array.from(combined);
        }
        return { incident: existing, isNew: false };
      }
    }

    // Criação de Novo Incidente
    const incidentId = `inc_${now}_${Math.random().toString(36).substring(2, 8)}`;
    const correlationId = params.correlationId || `corr_${params.sourceComponentId}_${Math.floor(now / 60000)}`;

    const initialTransition: IncidentAuditEntry = {
      transitionId: `trans_${now}_0`,
      timestamp: now,
      fromStatus: "OPEN",
      toStatus: "OPEN",
      investigationStage: "INCIDENT_DETECTED",
      actorId: params.actor.id,
      actorEmail: params.actor.email,
      actorRole: params.actor.role,
      note: `Incidente registrado na categoria ${params.category}: ${params.title}`,
      tamperProofHash: sha256(
        JSON.stringify({
          incidentId,
          timestamp: now,
          actor: params.actor,
          fromStatus: "OPEN",
          toStatus: "OPEN",
          title: params.title,
        }),
      ),
    };

    const incident: IndustrialIncident = {
      incidentId,
      organizationId: params.organizationId,
      plantId: params.plantId,
      sourceComponentId: params.sourceComponentId,
      category: params.category,
      severity: params.severity,
      title: params.title,
      description: params.description,
      firstObservedAt,
      lastObservedAt: now,
      detectedAt: now,
      impact: params.impact,
      evidence: params.evidence,
      correlationId,
      status: "OPEN",
      investigationStage: "INCIDENT_DETECTED",
      auditTrail: [initialTransition],
      relatedAlarms: params.relatedAlarms || [],
      dedupCount: 1,
      associatedDiagnostics: [],
      affectedComponents: [params.sourceComponentId],
      rejectedHypotheses: [],
      recommendedRunbooks: [],
      timelineEvents: [`[${new Date(firstObservedAt).toISOString()}] Primeiro sinal observado em ${params.sourceComponentId}`],
    };

    this.incidents.set(incidentId, incident);
    this.correlationIndex.set(dedupKey, incidentId);

    return { incident, isNew: true };
  }

  /**
   * Executa a transição de status do incidente mantendo auditoria e rastreabilidade imutável.
   */
  public transitionIncidentStatus(params: TransitionIncidentParams): {
    success: boolean;
    incident?: IndustrialIncident;
    error?: string;
  } {
    if (params.actor.role === "VIEWER") {
      return {
        success: false,
        error: "RBAC_FORBIDDEN: Papel VIEWER possui acesso estritamente somente leitura e não pode alterar incidentes.",
      };
    }

    const incident = this.incidents.get(params.incidentId);
    if (!incident) {
      return { success: false, error: "INCIDENT_NOT_FOUND: Incidente não localizado." };
    }

    if (incident.status === "CLOSED") {
      return {
        success: false,
        error: "INCIDENT_ALREADY_CLOSED: Incidentes com status CLOSED não podem receber novas transições.",
      };
    }

    const now = params.timestampMs ?? Date.now();
    const fromStatus = incident.status;
    const toStatus = params.toStatus;

    // Regras de validação do ciclo de vida
    if (toStatus === "RESOLVED" && !params.resolution) {
      return {
        success: false,
        error: "RESOLUTION_REQUIRED: Para resolver um incidente, o registro da causa raiz e resolução é obrigatório.",
      };
    }

    // Regra Gate 3.8 (Fase 7): Se uma validação de recuperação foi iniciada e está inconsistente (ex: apenas 1 amostra), bloquear RESOLVED
    if (
      toStatus === "RESOLVED" &&
      incident.recoveryValidation &&
      !incident.recoveryValidation.isConsistent
    ) {
      return {
        success: false,
        error:
          "CONSISTENT_RECOVERY_REQUIRED: A recuperação operacional exige múltiplas amostras saudáveis consecutivas (>= 3) e persistência verificada antes de resolver o incidente.",
      };
    }

    const nextStage: IncidentInvestigationStage | undefined =
      toStatus === "RESOLVED" || toStatus === "CLOSED"
        ? "INCIDENT_RESOLVED"
        : incident.investigationStage;

    this.appendChainedAuditEntry({
      incident,
      fromStatus,
      toStatus,
      actor: params.actor,
      note: params.note,
      resolution: params.resolution,
      timestamp: now,
      investigationStage: nextStage,
    });

    incident.status = toStatus;
    if (nextStage) {
      incident.investigationStage = nextStage;
    }

    if (toStatus === "ACKNOWLEDGED") {
      incident.acknowledgedAt = now;
      incident.acknowledgedBy = params.actor.email;
    } else if (toStatus === "RESOLVED" || toStatus === "CLOSED") {
      incident.resolvedAt = now;
      incident.resolvedBy = params.actor.email;
      incident.resolution = params.resolution;
      if (!incident.recoveredAt) {
        incident.recoveredAt = now;
      }
    }

    return { success: true, incident };
  }

  /**
   * Gate 3.8 (Fase 7): Associa diagnósticos determinísticos, escopo de impacto e runbooks ao incidente existente.
   */
  public attachDiagnosticAnalysis(params: {
    incidentId: string;
    diagnostics: DeterministicDiagnosticRecord[];
    affectedComponents?: string[];
    operationalScope?: string;
    actor: { id: string; email: string; role: FleetRole };
    timestampMs?: number;
  }): { success: boolean; incident?: IndustrialIncident; error?: string } {
    const incident = this.incidents.get(params.incidentId);
    if (!incident) {
      return { success: false, error: "INCIDENT_NOT_FOUND: Incidente não localizado." };
    }

    // Isolamento multi-tenant
    for (const d of params.diagnostics) {
      if (d.tenantId !== incident.organizationId) {
        return {
          success: false,
          error: "CROSS_TENANT_DIAGNOSTIC_FORBIDDEN: Diagnóstico pertence a outro tenant.",
        };
      }
    }

    const now = params.timestampMs ?? Date.now();
    const diagIds = new Set([...(incident.associatedDiagnostics ?? []), ...params.diagnostics.map((d) => d.diagnosticId)]);
    incident.associatedDiagnostics = Array.from(diagIds);

    const runbookIds = new Set(incident.recommendedRunbooks ?? []);
    for (const d of params.diagnostics) {
      for (const rb of d.recommendedRunbookIds) {
        runbookIds.add(rb);
      }
    }
    incident.recommendedRunbooks = Array.from(runbookIds);

    if (params.affectedComponents && params.affectedComponents.length > 0) {
      incident.affectedComponents = Array.from(
        new Set([...(incident.affectedComponents ?? []), ...params.affectedComponents]),
      );
    }
    if (params.operationalScope) {
      incident.operationalScope = params.operationalScope;
    }

    // Selecionar o diagnóstico mais confiável como causa provável (probableCause)
    const sortedDiags = [...params.diagnostics]
      .filter((d) => d.ruleId !== "RULE_00_INSUFFICIENT_EVIDENCE")
      .sort((a, b) => b.confidence - a.confidence);

    if (sortedDiags.length > 0) {
      const top = sortedDiags[0];
      incident.probableCause = {
        diagnosticId: top.diagnosticId,
        ruleId: top.ruleId,
        description: top.hypothesis,
        confidence: top.confidence,
        evidenceRefs: top.evidenceReferences,
      };
      if (incident.investigationStage === "INCIDENT_DETECTED") {
        incident.investigationStage = "ROOT_CAUSE_SUSPECTED";
      }
    }

    this.appendChainedAuditEntry({
      incident,
      fromStatus: incident.status,
      toStatus: incident.status,
      actor: params.actor,
      note: `Associados ${params.diagnostics.length} diagnóstico(s) determinístico(s) ao incidente.`,
      timestamp: now,
      investigationStage: incident.investigationStage,
    });

    return { success: true, incident };
  }

  /**
   * Gate 3.8 (Fase 7): Confirma formalmente a causa raiz do incidente apoiada em evidências verificáveis.
   * Nunca permite confirmar causa baseada apenas em proximidade temporal.
   */
  public confirmRootCause(params: {
    incidentId: string;
    diagnostic: DeterministicDiagnosticRecord;
    actor: { id: string; email: string; role: FleetRole };
    timestampMs?: number;
  }): { success: boolean; incident?: IndustrialIncident; error?: string } {
    if (params.actor.role === "VIEWER") {
      return {
        success: false,
        error: "RBAC_FORBIDDEN: Papel VIEWER não pode confirmar causa raiz de incidentes.",
      };
    }

    const incident = this.incidents.get(params.incidentId);
    if (!incident) {
      return { success: false, error: "INCIDENT_NOT_FOUND: Incidente não localizado." };
    }

    if (params.diagnostic.tenantId !== incident.organizationId) {
      return {
        success: false,
        error: "CROSS_TENANT_DIAGNOSTIC_FORBIDDEN: Diagnóstico pertence a outro tenant.",
      };
    }

    if (
      params.diagnostic.confidenceMethod === "TEMPORAL_PROXIMITY_ONLY_INSUFFICIENT" ||
      params.diagnostic.diagnosticStatus === "INCONCLUSIVE"
    ) {
      return {
        success: false,
        error:
          "INSUFFICIENT_EVIDENCE_FOR_CONFIRMATION: Proibido confirmar causa raiz baseada apenas em correlação temporal ou evidência inconclusiva.",
      };
    }

    const now = params.timestampMs ?? Date.now();
    incident.confirmedCause = {
      diagnosticId: params.diagnostic.diagnosticId,
      ruleId: params.diagnostic.ruleId,
      description: params.diagnostic.hypothesis,
      confirmedBy: params.actor.email,
      confirmedAt: now,
      evidenceRefs: params.diagnostic.evidenceReferences,
    };
    incident.investigationStage = "ROOT_CAUSE_CONFIRMED";

    if (incident.status === "OPEN" || incident.status === "ACKNOWLEDGED") {
      incident.status = "INVESTIGATING";
    }

    this.appendChainedAuditEntry({
      incident,
      fromStatus: incident.status,
      toStatus: incident.status,
      actor: params.actor,
      note: `Causa raiz confirmada por evidência [${params.diagnostic.ruleId}]: ${params.diagnostic.hypothesis}`,
      timestamp: now,
      investigationStage: "ROOT_CAUSE_CONFIRMED",
    });

    return { success: true, incident };
  }

  /**
   * Gate 3.8 (Fase 7): Descarta uma hipótese diagnóstica mantendo registro completo na trilha de auditoria.
   */
  public rejectHypothesis(params: {
    incidentId: string;
    diagnosticId: string;
    hypothesis: string;
    reason: string;
    actor: { id: string; email: string; role: FleetRole };
    timestampMs?: number;
  }): { success: boolean; incident?: IndustrialIncident; error?: string } {
    if (params.actor.role === "VIEWER") {
      return {
        success: false,
        error: "RBAC_FORBIDDEN: Papel VIEWER não pode rejeitar hipóteses de investigação.",
      };
    }

    const incident = this.incidents.get(params.incidentId);
    if (!incident) {
      return { success: false, error: "INCIDENT_NOT_FOUND: Incidente não localizado." };
    }

    const now = params.timestampMs ?? Date.now();
    const list = incident.rejectedHypotheses ?? [];
    list.push({
      diagnosticId: params.diagnosticId,
      hypothesis: params.hypothesis,
      rejectedBy: params.actor.email,
      rejectedAt: now,
      reason: params.reason,
    });
    incident.rejectedHypotheses = list;

    this.appendChainedAuditEntry({
      incident,
      fromStatus: incident.status,
      toStatus: incident.status,
      actor: params.actor,
      note: `Hipótese descartada (${params.diagnosticId}): ${params.reason}`,
      timestamp: now,
      investigationStage: incident.investigationStage,
    });

    return { success: true, incident };
  }

  /**
   * Gate 3.8 (Fase 7): Registra o plano de investigação e a ação mitigadora executada pela equipe.
   */
  public recordInvestigationAndMitigation(params: {
    incidentId: string;
    investigationPlan: string;
    investigationResult: string;
    actor: { id: string; email: string; role: FleetRole };
    timestampMs?: number;
  }): { success: boolean; incident?: IndustrialIncident; error?: string } {
    if (params.actor.role === "VIEWER") {
      return {
        success: false,
        error: "RBAC_FORBIDDEN: Papel VIEWER não pode registrar mitigação em incidentes.",
      };
    }

    const incident = this.incidents.get(params.incidentId);
    if (!incident) {
      return { success: false, error: "INCIDENT_NOT_FOUND: Incidente não localizado." };
    }

    const now = params.timestampMs ?? Date.now();
    incident.investigationPlan = params.investigationPlan;
    incident.investigationResult = params.investigationResult;
    incident.investigationStage = "MITIGATION_RECORDED";

    if (incident.status !== "MITIGATED" && incident.status !== "RESOLVED" && incident.status !== "CLOSED") {
      const prevStatus = incident.status;
      incident.status = "MITIGATED";
      this.appendChainedAuditEntry({
        incident,
        fromStatus: prevStatus,
        toStatus: "MITIGATED",
        actor: params.actor,
        note: `Mitigação registrada: ${params.investigationResult}`,
        timestamp: now,
        investigationStage: "MITIGATION_RECORDED",
      });
    } else {
      this.appendChainedAuditEntry({
        incident,
        fromStatus: incident.status,
        toStatus: incident.status,
        actor: params.actor,
        note: `Atualização de investigação/mitigação: ${params.investigationResult}`,
        timestamp: now,
        investigationStage: "MITIGATION_RECORDED",
      });
    }

    return { success: true, incident };
  }

  /**
   * Gate 3.8 & Gate 3.8.1 (Fase 7 / Seção 4): Valida a recuperação operacional sustentada exigindo:
   * - Mínimo de >= 3 amostras únicas, em ordem, com qualidade GOOD e timestamp posterior ao início do incidente.
   * - Duração mínima sustentada (rejeitando rajadas instantâneas no mesmo milissegundo/segundo).
   * - Ausência de interrupção ou nova falha durante a janela de recuperação.
   * - Persistência histórica verificada.
   */
  public validateOperationalRecovery(params: {
    incidentId: string;
    observedHealthySamples: number;
    requiredSamples?: number;
    dataPersistedVerified: boolean;
    samples?: RecoverySampleEvidence[];
    minWindowDurationMs?: number;
    expectedCadenceMs?: number;
    recoveryInterruptedBeforeMinWindow?: boolean;
    newFailureDuringRecovery?: boolean;
    actor: { id: string; email: string; role: FleetRole };
    timestampMs?: number;
  }): {
    success: boolean;
    isConsistent: boolean;
    rejectionReasonCode?: string;
    incident?: IndustrialIncident;
    error?: string;
  } {
    if (params.actor.role === "VIEWER") {
      return {
        success: false,
        isConsistent: false,
        rejectionReasonCode: "RBAC_FORBIDDEN",
        error: "RBAC_FORBIDDEN: Papel VIEWER não pode validar recuperação de incidentes.",
      };
    }

    const incident = this.incidents.get(params.incidentId);
    if (!incident) {
      return {
        success: false,
        isConsistent: false,
        rejectionReasonCode: "INCIDENT_NOT_FOUND",
        error: "INCIDENT_NOT_FOUND: Incidente não localizado.",
      };
    }

    const requiredSamples = Math.max(3, params.requiredSamples ?? 3);
    const now = params.timestampMs ?? Date.now();
    const expectedCadenceMs = params.expectedCadenceMs ?? 5_000;
    const minWindowDurationMs =
      params.minWindowDurationMs ??
      (params.samples ? (requiredSamples - 1) * Math.min(expectedCadenceMs, 1_000) : 0);

    let rejectionReasonCode: string | undefined;
    let effectiveHealthyCount = params.observedHealthySamples;
    let observedWindowDurationMs = 0;
    let allSamplesPersisted = params.dataPersistedVerified;

    if (params.newFailureDuringRecovery === true) {
      rejectionReasonCode = "NEW_FAILURE_DURING_RECOVERY_WINDOW";
    } else if (params.recoveryInterruptedBeforeMinWindow === true) {
      rejectionReasonCode = "RECOVERY_INTERRUPTED_BEFORE_MIN_WINDOW";
    } else if (!params.dataPersistedVerified) {
      rejectionReasonCode = "PERSISTENCE_NOT_VERIFIED";
    }

    if (!rejectionReasonCode && params.samples && params.samples.length > 0) {
      // 1. Verificar qualidade de todas as amostras na janela (qualquer BAD/STALE/NOT_CONNECTED invalida a janela)
      const hasNonGoodQuality = params.samples.some((s) => s.quality !== "GOOD");
      if (hasNonGoodQuality) {
        rejectionReasonCode = "BAD_QUALITY_SAMPLE_IN_RECOVERY_WINDOW";
      }

      // 2. Verificar timestamps antigos (anteriores ao início do incidente)
      if (!rejectionReasonCode) {
        const hasOldSample = params.samples.some((s) => s.timestamp < incident.firstObservedAt);
        if (hasOldSample) {
          rejectionReasonCode = "STALE_PRE_INCIDENT_RECOVERY_SAMPLE";
        }
      }

      // 3. Verificar amostras fora de ordem (timestamp ou sequenceNumber regressivos)
      if (!rejectionReasonCode) {
        for (let i = 1; i < params.samples.length; i++) {
          if (
            params.samples[i].timestamp < params.samples[i - 1].timestamp ||
            params.samples[i].sequenceNumber < params.samples[i - 1].sequenceNumber
          ) {
            rejectionReasonCode = "OUT_OF_ORDER_RECOVERY_SAMPLES";
            break;
          }
        }
      }

      // 4. Deduplicar amostras (por sampleId e por par sequenceNumber:timestamp)
      if (!rejectionReasonCode) {
        const uniqueKeys = new Set<string>();
        const uniqueSamples: RecoverySampleEvidence[] = [];
        for (const s of params.samples) {
          const key = `${s.sampleId}|${s.sequenceNumber}|${s.timestamp}`;
          const seqKey = `seq_${s.sequenceNumber}_${s.timestamp}`;
          if (!uniqueKeys.has(key) && !uniqueKeys.has(seqKey)) {
            uniqueKeys.add(key);
            uniqueKeys.add(seqKey);
            uniqueSamples.push(s);
          }
        }
        effectiveHealthyCount = uniqueSamples.length;
        if (uniqueSamples.length < params.samples.length && uniqueSamples.length < requiredSamples) {
          rejectionReasonCode = "DUPLICATE_SAMPLES_INSUFFICIENT_UNIQUE_COUNT";
        }

        // 5. Verificar persistência individual se informada
        if (!rejectionReasonCode && uniqueSamples.some((s) => s.persistedInHistorian === false)) {
          allSamplesPersisted = false;
          rejectionReasonCode = "PERSISTENCE_NOT_VERIFIED";
        }

        // 6. Verificar duração mínima sustentada (rejeitar 3 amostras recebidas instantaneamente em burst)
        if (!rejectionReasonCode && uniqueSamples.length >= requiredSamples) {
          observedWindowDurationMs =
            uniqueSamples[uniqueSamples.length - 1].timestamp - uniqueSamples[0].timestamp;
          if (observedWindowDurationMs < minWindowDurationMs) {
            rejectionReasonCode = "INSTANTANEOUS_BURST_NOT_SUSTAINED";
          }
        }
      }
    }

    if (!rejectionReasonCode && effectiveHealthyCount < requiredSamples) {
      rejectionReasonCode = "INSUFFICIENT_HEALTHY_SAMPLE_COUNT";
    }

    const isConsistent =
      !rejectionReasonCode &&
      effectiveHealthyCount >= requiredSamples &&
      allSamplesPersisted === true;

    incident.recoveryValidation = {
      isConsistent,
      requiredSamples,
      observedHealthySamples: effectiveHealthyCount,
      dataPersistedVerified: allSamplesPersisted,
      minWindowDurationMs,
      observedWindowDurationMs,
      expectedCadenceMs,
      rejectionReasonCode,
      validatedAt: isConsistent ? now : undefined,
      validatedBy: isConsistent ? params.actor.email : undefined,
    };

    if (!isConsistent) {
      this.appendChainedAuditEntry({
        incident,
        fromStatus: incident.status,
        toStatus: incident.status,
        actor: params.actor,
        note: `Validação de recuperação rejeitada [${rejectionReasonCode ?? "INCONSISTENT"}]: ${effectiveHealthyCount}/${requiredSamples} amostras, duração=${observedWindowDurationMs}ms, persistência=${allSamplesPersisted}.`,
        timestamp: now,
        investigationStage: incident.investigationStage,
      });

      return {
        success: false,
        isConsistent: false,
        rejectionReasonCode,
        incident,
        error: `CONSISTENT_RECOVERY_WINDOW_REQUIRED [${rejectionReasonCode ?? "INCONSISTENT"}]: A recuperação sustentada exige >= ${requiredSamples} amostras únicas em ordem, qualidade GOOD, janela sustentada >= ${minWindowDurationMs}ms e persistência confirmada.`,
      };
    }

    incident.recoveredAt = now;
    incident.investigationStage = "RECOVERY_OBSERVED";

    this.appendChainedAuditEntry({
      incident,
      fromStatus: incident.status,
      toStatus: incident.status,
      actor: params.actor,
      note: `Recuperação operacional confirmada por janela consistente (${params.observedHealthySamples}/${requiredSamples} amostras saudáveis e persistência verificada).`,
      timestamp: now,
      investigationStage: "RECOVERY_OBSERVED",
    });

    return {
      success: true,
      isConsistent: true,
      incident,
    };
  }

  /**
   * Atribui um responsável pelo acompanhamento do incidente.
   */
  public assignIncident(
    incidentId: string,
    assignedTo: { id: string; email: string; name: string },
    actor: { id: string; email: string; role: FleetRole },
  ): boolean {
    if (actor.role === "VIEWER") return false;
    const incident = this.incidents.get(incidentId);
    if (!incident) return false;

    incident.assignedTo = assignedTo;
    const now = Date.now();
    this.appendChainedAuditEntry({
      incident,
      fromStatus: incident.status,
      toStatus: incident.status,
      actor,
      note: `Incidente atribuído para ${assignedTo.name} (${assignedTo.email}).`,
      timestamp: now,
      investigationStage: incident.investigationStage,
    });

    return true;
  }

  /**
   * Valida a integridade da cadeia de custódia e auditoria do incidente.
   */
  public verifyIncidentAuditIntegrity(incidentId: string): { isValid: boolean; brokenAtIndex?: number } {
    const incident = this.incidents.get(incidentId);
    if (!incident) return { isValid: false };

    let currentPrev = "GENESIS_INCIDENT_AUDIT_BLOCK";

    for (let i = 0; i < incident.auditTrail.length; i++) {
      const entry = incident.auditTrail[i];
      if (i === 0) {
        // Bloco inicial
        const recalculated = sha256(
          JSON.stringify({
            incidentId,
            timestamp: entry.timestamp,
            actor: { id: entry.actorId, email: entry.actorEmail, role: entry.actorRole },
            fromStatus: entry.fromStatus,
            toStatus: entry.toStatus,
            title: incident.title,
          }),
        );
        if (recalculated !== entry.tamperProofHash) {
          return { isValid: false, brokenAtIndex: 0 };
        }
      } else {
        const recalculated = sha256(
          JSON.stringify({
            previousHash: currentPrev,
            incidentId: incident.incidentId,
            timestamp: entry.timestamp,
            fromStatus: entry.fromStatus,
            toStatus: entry.toStatus,
            actor: { id: entry.actorId, email: entry.actorEmail, role: entry.actorRole },
            note: entry.note,
            resolution: entry.resolution,
          }),
        );
        if (recalculated !== entry.tamperProofHash) {
          return { isValid: false, brokenAtIndex: i };
        }
      }
      currentPrev = entry.tamperProofHash;
    }

    return { isValid: true };
  }

  public getIncident(incidentId: string): IndustrialIncident | undefined {
    return this.incidents.get(incidentId);
  }

  public getIncidents(filter?: {
    organizationId?: string;
    plantId?: string;
    sourceComponentId?: string;
    category?: IncidentCategory;
    severity?: IncidentSeverity;
    status?: IncidentStatus;
    rootCauseRuleId?: string;
    windowStartMs?: number;
    windowEndMs?: number;
  }): IndustrialIncident[] {
    let list = Array.from(this.incidents.values());

    if (filter?.organizationId) {
      list = list.filter((i) => i.organizationId === filter.organizationId);
    }
    if (filter?.plantId) {
      list = list.filter((i) => i.plantId === filter.plantId);
    }
    if (filter?.sourceComponentId) {
      list = list.filter((i) => i.sourceComponentId === filter.sourceComponentId);
    }
    if (filter?.category) {
      list = list.filter((i) => i.category === filter.category);
    }
    if (filter?.severity) {
      list = list.filter((i) => i.severity === filter.severity);
    }
    if (filter?.status) {
      list = list.filter((i) => i.status === filter.status);
    }
    if (filter?.rootCauseRuleId) {
      list = list.filter(
        (i) =>
          i.confirmedCause?.ruleId === filter.rootCauseRuleId ||
          i.probableCause?.ruleId === filter.rootCauseRuleId,
      );
    }
    if (filter?.windowStartMs !== undefined) {
      list = list.filter((i) => i.firstObservedAt >= filter.windowStartMs!);
    }
    if (filter?.windowEndMs !== undefined) {
      list = list.filter((i) => i.firstObservedAt <= filter.windowEndMs!);
    }

    list.sort((a, b) => b.lastObservedAt - a.lastObservedAt);
    return list;
  }

  public clear(): void {
    this.incidents.clear();
    this.correlationIndex.clear();
  }
}

export const industrialIncidentManager = new IndustrialIncidentManager();
export { IS_PHYSICAL_CONTROL_ALLOWED };
