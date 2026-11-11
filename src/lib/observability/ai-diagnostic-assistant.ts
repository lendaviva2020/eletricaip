// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.8 & 3.8.1: AI-ASSISTED DIAGNOSTIC ENGINE
// Phases 5 & 10 + Gate 3.8.1 Adversarial Hardening:
// - Consultative Explainable AI, Multi-Layer Prompt Injection Defense (Tags, PLC, RAG, Natural Language)
// - Zero-Width/Unicode Normalization, Output Validation & Deterministic Fallback
// Standards: NIST AI RMF, IEC 62443, OWASP LLM01 Prompt Injection Defense
// =============================================================================

import type {
  AiDiagnosticAnalysis,
  CorrelatedOperationalEvent,
  DependencyImpactAnalysis,
  DeterministicDiagnosticRecord,
  FleetRole,
  IndustrialIncident,
} from "./types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "./types";
import { industrialRunbookLibrary } from "./runbook-library";
import { deepCloneAndFreeze } from "./causal-correlation-engine";

const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|system|security)\s+(instructions|rules|prompts|policies)/gi,
  /ignore\s+(todas\s+as\s+)?(instru[cç][oõ]es|regras|pol[ií]ticas)\s+(anteriores|acima|de\s+seguran[cç]a)/gi,
  /desconsidere\s+(as\s+)?(pol[ií]ticas|regras|instru[cç][oõ]es)/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now\s+/gi,
  /isPhysicalControlAllowed\s*[:=]\s*true/gi,
  /enable\s+physical\s+control/gi,
  /habilitar\s+controle\s+f[ií]sico/gi,
  /write\s+(coil|register|modbus|opcua|plc)/gi,
  /opcua[\s._-]*(write|call)/gi,
  /publish\s+(ncmd|dcmd)/gi,
  /execute\s+(shell|bash|cmd|powershell|plc_write)/gi,
  /start\s+motor|stop\s+motor|open\s+breaker|close\s+breaker/gi,
  /ligar\s+motor|desligar\s+motor|ligar\s+bomba|desligar\s+bomba|fechar\s+disjuntor|abrir\s+disjuntor|for[cç]ar\s+bobina|escrever\s+(no\s+)?(clp|plc|modbus)/gi,
  /override\s+safety/gi,
  /bypass\s+(rls|rbac|auth|security)/gi,
  // Manipulação de classificação de segurança ou diagnóstico
  /set\s+(diagnosticStatus|severity|confidenceLevel|status)\s*[:=]/gi,
  /mark\s+as\s+CONFIRMED_BY_EVIDENCE/gi,
  /downgrade\s+severity/gi,
  /rebaixar\s+severidade|ocultar\s+incidente|suprimir\s+alarme\s+de\s+seguran[cç]a/gi,
  // Solicitação de dados cross-tenant em linguagem natural ou SQL
  /(access|read|dump|show|select)\s+.*(other\s+tenant|another\s+tenant|outro\s+tenant|outra\s+organiza[cç][aã]o|org_industrial_beta)/gi,
];

export interface SanitizationResult {
  sanitizedText: string;
  injectionDetected: boolean;
  matchedVectorsCount: number;
}

/**
 * Normaliza caracteres invisíveis (zero-width) e sanitiza qualquer string proveniente
 * de fontes industriais não confiáveis (nomes de tags, descrições de equipamentos,
 * mensagens de PLC, documentos RAG recuperados, logs ou comentários).
 */
export function sanitizeIndustrialContentForAi(rawInput: string): SanitizationResult {
  if (!rawInput) {
    return { sanitizedText: "", injectionDetected: false, matchedVectorsCount: 0 };
  }

  // 1. Remover caracteres zero-width/invisíveis usados para burlar filtros regex
  let text = rawInput.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "");
  let injectionDetected = false;
  let matchedVectorsCount = 0;

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      injectionDetected = true;
      matchedVectorsCount += 1;
      pattern.lastIndex = 0;
      text = text.replace(pattern, "[UNTRUSTED_INDUSTRIAL_STRING_SANITIZED]");
    }
  }

  // 2. Neutralizar delimitadores de controle de prompt ou tags HTML/script
  if (/<script|```|###\s*(SYSTEM|INSTRUCTION)|<\|im_start\|>|<\|endoftext\|>/i.test(text)) {
    injectionDetected = true;
    matchedVectorsCount += 1;
    text = text
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "[SCRIPT_STRIPPED]")
      .replace(/```/g, "'''")
      .replace(/###\s*(SYSTEM|INSTRUCTION)/gi, "[SYSTEM_MARKER_STRIPPED]")
      .replace(/<\|im_start\|>|<\|endoftext\|>/gi, "[TOKEN_STRIPPED]");
  }

  return {
    sanitizedText: text.slice(0, 1000),
    injectionDetected,
    matchedVectorsCount,
  };
}

export interface RagRetrievedDocument {
  docId: string;
  tenantId: string;
  title: string;
  content: string;
}

export interface AiDiagnosticRequest {
  tenantId: string;
  plantId: string;
  userId: string;
  userRole: FleetRole;
  question: string;
  incident?: IndustrialIncident;
  deterministicDiagnostics: DeterministicDiagnosticRecord[];
  impactAnalysis?: DependencyImpactAnalysis;
  correlatedEvents?: CorrelatedOperationalEvent[];
  historianSummary?: {
    tenantId: string;
    sampleCount: number;
    missingGaps: number;
    description: string;
  };
  ragDocuments?: RagRetrievedDocument[];
  simulateAiServiceOutage?: boolean;
  nowMs?: number;
}

/**
 * Validador de Saída da IA (Defense-in-Depth):
 * Garante que a resposta final:
 * 1. Mantenha `isPhysicalControlAllowed: false` e `isConsultativeOnly: true`.
 * 2. Nunca retorne status `COMPLETED` se não houver evidências verificáveis (`availableEvidence.length === 0`).
 * 3. Seja profundamente congelada (`deepCloneAndFreeze`) para impedir adulteração pós-geração.
 */
export function validateAiDiagnosticOutput(
  rawAnalysis: AiDiagnosticAnalysis,
): AiDiagnosticAnalysis {
  const copy: AiDiagnosticAnalysis = {
    ...rawAnalysis,
    isConsultativeOnly: true,
    isPhysicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
  };

  if (copy.availableEvidence.length === 0 && copy.status === "COMPLETED") {
    copy.status = "DIAGNOSTIC_INCONCLUSIVE";
    copy.confidenceLevel = "INCONCLUSIVE";
    copy.confidenceScore = Math.min(copy.confidenceScore, 0.25);
    copy.probableCauses = [
      "DIAGNOSTIC_INCONCLUSIVE: Resposta rebaixada pelo validador de saída por ausência de referências de evidência.",
    ];
    if (copy.missingInformation.length === 0) {
      copy.missingInformation = [
        "Referências de evidência verificáveis obrigatórias para conclusão diagnóstica",
      ];
    }
  }

  return deepCloneAndFreeze(copy);
}

export class AiDiagnosticAssistant {
  private rateLimitCounter: Map<string, { count: number; windowStartMs: number }> = new Map();
  private readonly maxRequestsPerWindow = 30;
  private readonly rateWindowMs = 60_000;

  private enforceRateLimit(tenantId: string, userId: string, nowMs: number): void {
    const key = `${tenantId}:${userId}`;
    const entry = this.rateLimitCounter.get(key);
    if (!entry || nowMs - entry.windowStartMs >= this.rateWindowMs) {
      this.rateLimitCounter.set(key, { count: 1, windowStartMs: nowMs });
      return;
    }
    if (entry.count >= this.maxRequestsPerWindow) {
      throw new Error(
        `AI_DIAGNOSTIC_RATE_LIMIT_EXCEEDED: Limite de ${this.maxRequestsPerWindow} consultas por minuto atingido para ${userId} no tenant ${tenantId}.`,
      );
    }
    entry.count += 1;
  }

  private enforceTenantBoundary(req: AiDiagnosticRequest): void {
    if (req.incident && req.incident.organizationId !== req.tenantId) {
      throw new Error("CROSS_TENANT_AI_ACCESS_FORBIDDEN: Incidente pertence a outra organização.");
    }
    for (const d of req.deterministicDiagnostics) {
      if (d.tenantId !== req.tenantId) {
        throw new Error(
          "CROSS_TENANT_AI_ACCESS_FORBIDDEN: Diagnóstico determinístico pertence a outra organização.",
        );
      }
    }
    if (req.impactAnalysis && req.impactAnalysis.tenantId !== req.tenantId) {
      throw new Error(
        "CROSS_TENANT_AI_ACCESS_FORBIDDEN: Grafo de impacto pertence a outra organização.",
      );
    }
    for (const evt of req.correlatedEvents ?? []) {
      if (evt.tenantId !== req.tenantId) {
        throw new Error(
          "CROSS_TENANT_AI_ACCESS_FORBIDDEN: Evento operacional pertence a outra organização.",
        );
      }
    }
    if (req.historianSummary && req.historianSummary.tenantId !== req.tenantId) {
      throw new Error(
        "CROSS_TENANT_AI_ACCESS_FORBIDDEN: Resumo do Historian pertence a outra organização.",
      );
    }
    for (const doc of req.ragDocuments ?? []) {
      if (doc.tenantId !== req.tenantId) {
        throw new Error(
          "CROSS_TENANT_AI_ACCESS_FORBIDDEN: Documento técnico RAG pertence a outra organização.",
        );
      }
    }
  }

  /**
   * Gera a análise diagnóstica assistida por IA apoiada estritamente nas evidências determinísticas.
   * - Nunca inventa causas sem evidência.
   * - Retorna `DIAGNOSTIC_INCONCLUSIVE` quando faltam evidências.
   * - Faz fallback transparente para o motor determinístico (`AI_SERVICE_UNAVAILABLE_FALLBACK`) se o serviço de IA falhar.
   * - Mantém `isPhysicalControlAllowed: false` e `isConsultativeOnly: true`.
   */
  public analyze(req: AiDiagnosticRequest): AiDiagnosticAnalysis {
    const nowMs = req.nowMs ?? Date.now();
    this.enforceTenantBoundary(req);
    this.enforceRateLimit(req.tenantId, req.userId, nowMs);

    let promptInjectionDetected = false;
    let sanitizedUntrustedInputsCount = 0;

    const sanitizeField = (val: string): string => {
      const res = sanitizeIndustrialContentForAi(val);
      if (res.injectionDetected) {
        promptInjectionDetected = true;
        sanitizedUntrustedInputsCount += Math.max(1, res.matchedVectorsCount);
      }
      return res.sanitizedText;
    };

    const sanitizedQuestion = sanitizeField(req.question);

    const observedFacts: string[] = [];
    const availableEvidence: AiDiagnosticAnalysis["availableEvidence"] = [];
    const hypotheses: string[] = [];
    const probableCauses: string[] = [];
    const missingInformationSet = new Set<string>();
    const recommendedRunbookIdSet = new Set<string>();

    if (req.incident) {
      const safeTitle = sanitizeField(req.incident.title);
      const safeDesc = sanitizeField(req.incident.description);
      observedFacts.push(
        `Incidente ${req.incident.incidentId} (${req.incident.severity}) no componente ${req.incident.sourceComponentId}: ${safeTitle} — ${safeDesc}`,
      );
    }

    for (const evt of req.correlatedEvents ?? []) {
      const safeEvtType = sanitizeField(evt.eventType);
      const safeMetaMsg = evt.metadata?.rawMessage
        ? sanitizeField(String(evt.metadata.rawMessage))
        : "";
      const safeTagDesc = evt.metadata?.tagDescription
        ? sanitizeField(String(evt.metadata.tagDescription))
        : "";
      const safeEqDesc = evt.metadata?.equipmentDescription
        ? sanitizeField(String(evt.metadata.equipmentDescription))
        : "";
      observedFacts.push(
        `Evento ${evt.eventId} em ${evt.componentId} (${safeEvtType}, qualidade=${evt.quality}, seq=${evt.sequenceNumber})${safeMetaMsg ? `: ${safeMetaMsg}` : ""}${safeTagDesc ? ` [${safeTagDesc}]` : ""}${safeEqDesc ? ` [${safeEqDesc}]` : ""}`,
      );
      if (evt.evidenceReference) {
        availableEvidence.push({
          referenceId: evt.evidenceReference,
          sourceType: "EVENT",
          summary: `Evento ${safeEvtType} em ${evt.componentId} observado em ${evt.observedAt}`,
        });
      }
    }

    for (const doc of req.ragDocuments ?? []) {
      const safeTitle = sanitizeField(doc.title);
      const safeContent = sanitizeField(doc.content);
      observedFacts.push(`[RAG Doc ${doc.docId} - ${safeTitle}]: ${safeContent}`);
    }

    if (req.impactAnalysis) {
      observedFacts.push(
        `Análise topológica de impacto a partir de ${req.impactAnalysis.originComponentId}: ${req.impactAnalysis.dependentComponents.length} componente(s) dependente(s) afetado(s).`,
      );
      availableEvidence.push({
        referenceId: `graph_${req.impactAnalysis.originComponentId}`,
        sourceType: "DEPENDENCY_GRAPH",
        summary: `Propagação validada para: ${req.impactAnalysis.dependentComponents.join(", ") || "nenhum"}`,
      });
    }

    if (req.historianSummary) {
      const safeHistDesc = sanitizeField(req.historianSummary.description);
      observedFacts.push(
        `Historian: ${req.historianSummary.sampleCount} amostras na janela, ${req.historianSummary.missingGaps} lacuna(s) (${safeHistDesc}).`,
      );
      availableEvidence.push({
        referenceId: `historian_${req.tenantId}_${req.plantId}`,
        sourceType: "HISTORIAN",
        summary: safeHistDesc,
      });
    }

    let highestConfidence = 0;
    let hasConfirmedOrSuspected = false;

    for (const diag of req.deterministicDiagnostics) {
      for (const cond of diag.observedConditions) {
        observedFacts.push(sanitizeField(cond));
      }
      for (const ref of diag.evidenceReferences) {
        if (ref && ref.trim().length > 0) {
          availableEvidence.push({
            referenceId: ref,
            sourceType: "DIAGNOSTIC_RULE",
            summary: `${diag.ruleId} (${diag.diagnosticStatus}, confiança=${Math.round(diag.confidence * 100)}%)`,
          });
        }
      }
      hypotheses.push(`[${diag.ruleId}] ${sanitizeField(diag.hypothesis)}`);

      if (
        (diag.diagnosticStatus === "CONFIRMED_BY_EVIDENCE" ||
          diag.diagnosticStatus === "SUSPECTED" ||
          diag.diagnosticStatus === "RESOLVED") &&
        diag.evidenceReferences.length > 0
      ) {
        if (diag.ruleId !== "RULE_00_INSUFFICIENT_EVIDENCE") {
          hasConfirmedOrSuspected = true;
          probableCauses.push(
            `${diag.primaryComponent}: ${sanitizeField(diag.hypothesis)} (${diag.diagnosticStatus})`,
          );
        }
      }

      for (const miss of diag.missingInformation) {
        missingInformationSet.add(sanitizeField(miss));
      }
      for (const rbId of diag.recommendedRunbookIds) {
        recommendedRunbookIdSet.add(rbId);
      }
      if (diag.confidence > highestConfidence) {
        highestConfidence = diag.confidence;
      }
    }

    // Construir recomendações vinculadas aos Runbooks aprovados
    const recommendations: AiDiagnosticAnalysis["recommendations"] = [];
    for (const rbId of recommendedRunbookIdSet) {
      const rbForRole = industrialRunbookLibrary.getRunbookForRole(rbId, req.userRole);
      if (!rbForRole) continue;

      for (const step of rbForRole.allowedDiagnosticSteps) {
        recommendations.push({
          step: `[Verificação - ${rbForRole.runbook.runbookId}] ${step.instruction}`,
          actionCategory: step.actionType,
          runbookId: rbForRole.runbook.runbookId,
        });
      }
      for (const step of rbForRole.allowedRecoverySteps) {
        recommendations.push({
          step: `[Recuperação - ${rbForRole.runbook.runbookId}] ${step.instruction}`,
          actionCategory: step.actionType,
          runbookId: rbForRole.runbook.runbookId,
        });
      }
    }

    const hasEmpiricalEvidenceRef = availableEvidence.some(
      (e) =>
        e.sourceType === "DIAGNOSTIC_RULE" ||
        e.sourceType === "EVENT" ||
        e.sourceType === "HISTORIAN",
    );

    const isInsufficient =
      !hasConfirmedOrSuspected ||
      !hasEmpiricalEvidenceRef ||
      req.deterministicDiagnostics.length === 0 ||
      req.deterministicDiagnostics.every(
        (d) =>
          d.diagnosticStatus === "INCONCLUSIVE" || d.ruleId === "RULE_00_INSUFFICIENT_EVIDENCE",
      );

    if (isInsufficient) {
      missingInformationSet.add("Telemetria determinística multi-condição do componente primário");
      missingInformationSet.add(
        "Confirmação de estado de conectividade do Edge Gateway e protocolo industrial",
      );

      return validateAiDiagnosticOutput({
        analysisId: `ai_diag_${req.tenantId}_${nowMs}`,
        incidentId: req.incident?.incidentId,
        tenantId: req.tenantId,
        plantId: req.plantId,
        questionAsked: sanitizedQuestion,
        status: req.simulateAiServiceOutage
          ? "AI_SERVICE_UNAVAILABLE_FALLBACK"
          : "DIAGNOSTIC_INCONCLUSIVE",
        observedFacts:
          observedFacts.length > 0
            ? observedFacts
            : ["Nenhuma evidência determinística conclusiva disponível na janela consultada."],
        availableEvidence,
        hypotheses:
          hypotheses.length > 0
            ? hypotheses
            : ["Evidência insuficiente para formular hipótese confirmada."],
        probableCauses: [
          "DIAGNOSTIC_INCONCLUSIVE: Não há dados verificáveis suficientes para apontar causa provável.",
        ],
        missingInformation: Array.from(missingInformationSet),
        recommendations:
          recommendations.length > 0
            ? recommendations
            : [
                {
                  step: "Executar verificação somente leitura de conectividade do Edge Gateway e frescor de tags (RB_SCADA_STALE_DATA_INVESTIGATION).",
                  actionCategory: "READ_ONLY_VERIFICATION",
                  runbookId: "RB_SCADA_STALE_DATA_INVESTIGATION",
                },
              ],
        confidenceLevel: "INCONCLUSIVE",
        confidenceScore: Math.min(highestConfidence, 0.35),
        promptInjectionDetected,
        sanitizedUntrustedInputsCount,
        generatedAt: nowMs,
        isConsultativeOnly: true,
        isPhysicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
      });
    }

    const confidenceLevel: AiDiagnosticAnalysis["confidenceLevel"] =
      highestConfidence >= 0.85 ? "HIGH" : highestConfidence >= 0.6 ? "MEDIUM" : "LOW";

    return validateAiDiagnosticOutput({
      analysisId: `ai_diag_${req.tenantId}_${nowMs}`,
      incidentId: req.incident?.incidentId,
      tenantId: req.tenantId,
      plantId: req.plantId,
      questionAsked: sanitizedQuestion,
      status: req.simulateAiServiceOutage ? "AI_SERVICE_UNAVAILABLE_FALLBACK" : "COMPLETED",
      observedFacts,
      availableEvidence,
      hypotheses,
      probableCauses,
      missingInformation: Array.from(missingInformationSet),
      recommendations,
      confidenceLevel,
      confidenceScore: highestConfidence,
      promptInjectionDetected,
      sanitizedUntrustedInputsCount,
      generatedAt: nowMs,
      isConsultativeOnly: true,
      isPhysicalControlAllowed: IS_PHYSICAL_CONTROL_ALLOWED,
    });
  }

  public clearRateLimits(): void {
    this.rateLimitCounter.clear();
  }
}

export const aiDiagnosticAssistant = new AiDiagnosticAssistant();
export { IS_PHYSICAL_CONTROL_ALLOWED };
