// AI Diagnostic Repair Context & Engine
// Standards: IEC 60947, IEC 61131-3, ABNT NBR 5410, NR-10, ISA-18.2
// Structures diagnostic context across all engineering modules for autonomous AI remediation

import { create } from "zustand";
import { z } from "zod";
import type { DiagnosticAlert } from "@/lib/diagram/multifilar";
import type { LadderIssue } from "@/lib/ladder/validator";
import type { NormFinding } from "@/lib/norm-validator";

export const DiagnosticContextSchema = z.object({
  project_id: z.string().min(1),
  organization_id: z.string().optional(),
  module: z.enum([
    "unifilar",
    "multifilar",
    "ladder",
    "fbd",
    "plc",
    "hardware",
    "io",
    "comms",
    "simulation",
    "validation",
    "scada",
    "importer",
  ]),
  diagnostic_id: z.string().min(1),
  error_code: z.string().min(1),
  severity: z.enum(["critical", "warning", "info"]),
  error_message: z.string().min(1),
  technical_details: z.string().optional(),
  affected_components: z.array(z.string()).default([]),
  affected_connections: z.array(z.string()).default([]),
  affected_variables: z.array(z.string()).default([]),
  source_context: z.record(z.string(), z.any()).optional(),
  project_revision: z.number().int().optional(),
  runtime_state: z.string().optional(),
  related_diagnostics: z
    .array(
      z.object({
        diagnostic_id: z.string(),
        error_code: z.string(),
        message: z.string(),
      }),
    )
    .default([])
    .optional(),
});

export type DiagnosticContext = z.infer<typeof DiagnosticContextSchema>;

export interface AiDiagnosticRepairStoreState {
  pendingContext: DiagnosticContext | null;
  batchContexts: DiagnosticContext[];
  isOpen: boolean;
  openRepairWithContext: (context: DiagnosticContext) => void;
  openRepairWithBatch: (contexts: DiagnosticContext[]) => void;
  clearRepair: () => void;
  setOpen: (open: boolean) => void;
}

export const useAiDiagnosticRepairStore = create<AiDiagnosticRepairStoreState>((set) => ({
  pendingContext: null,
  batchContexts: [],
  isOpen: false,
  openRepairWithContext: (context) => {
    set({ pendingContext: context, batchContexts: [context], isOpen: true });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("eletricai-ai-repair", {
          detail: { context, batch: [context] },
        }),
      );
    }
  },
  openRepairWithBatch: (contexts) => {
    const primary = contexts[0] ?? null;
    set({ pendingContext: primary, batchContexts: contexts, isOpen: true });
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("eletricai-ai-repair", {
          detail: { context: primary, batch: contexts },
        }),
      );
    }
  },
  clearRepair: () => set({ pendingContext: null, batchContexts: [] }),
  setOpen: (isOpen) => set({ isOpen }),
}));

// ================= Helpers to extract DiagnosticContext =================

export function buildDiagnosticContextFromMultifilar(
  alert: DiagnosticAlert,
  projectId: string,
  revision = 1,
): DiagnosticContext {
  const affected: string[] = [];
  if (alert.nodeId) affected.push(alert.nodeId);

  const severity: "critical" | "warning" | "info" =
    alert.type === "ERRO" ? "critical" : alert.type === "AVISO" ? "warning" : "info";

  return {
    project_id: projectId,
    module: "unifilar",
    diagnostic_id: alert.id || `diag_${Date.now()}`,
    error_code: alert.type === "ERRO" ? "ERR_UNIFILAR_TOPOLOGY" : "WARN_UNIFILAR_TOPOLOGY",
    severity,
    error_message: alert.message,
    technical_details: alert.assumptions?.length
      ? `Premissas técnicas: ${alert.assumptions.join("; ")}`
      : undefined,
    affected_components: affected,
    affected_connections: alert.edgeId ? [alert.edgeId] : [],
    affected_variables: [],
    source_context: {
      alertType: alert.type,
      nodeId: alert.nodeId,
      edgeId: alert.edgeId,
      assumptions: alert.assumptions ? [...alert.assumptions] : [],
    },
    project_revision: revision,
    runtime_state: "design",
    related_diagnostics: [],
  };
}

export function buildDiagnosticContextFromLadder(
  issue: LadderIssue,
  projectId: string,
  revision = 1,
): DiagnosticContext {
  const severity: "critical" | "warning" | "info" =
    issue.level === "error" ? "critical" : issue.level === "warn" ? "warning" : "info";

  const affectedVars: string[] = [];
  if (issue.elementId) affectedVars.push(issue.elementId);

  return {
    project_id: projectId,
    module: "ladder",
    diagnostic_id: `${issue.rungId}_${issue.code}`,
    error_code: issue.code || "ERR_LADDER_SYNTAX",
    severity,
    error_message: issue.message,
    technical_details: issue.fixHint ? `Sugestão de correção: ${issue.fixHint}` : undefined,
    affected_components: [issue.rungId],
    affected_connections: [],
    affected_variables: affectedVars,
    source_context: {
      rungId: issue.rungId,
      elementId: issue.elementId,
      fixHint: issue.fixHint,
    },
    project_revision: revision,
    runtime_state: "design",
    related_diagnostics: [],
  };
}

export function buildDiagnosticContextFromNormFinding(
  finding: NormFinding,
  projectId: string,
  revision = 1,
): DiagnosticContext {
  const severity: "critical" | "warning" | "info" =
    finding.severity === "error" ? "critical" : finding.severity === "warn" ? "warning" : "info";

  return {
    project_id: projectId,
    module: "validation",
    diagnostic_id: finding.id || `norm_${Date.now()}`,
    error_code: `NORM_${finding.norm.replace(/\s+/g, "_")}`,
    severity,
    error_message: `${finding.title}: ${finding.detail}`,
    technical_details: finding.fixHint ? `Dica técnica: ${finding.fixHint}` : undefined,
    affected_components: finding.nodeId ? [finding.nodeId] : [],
    affected_connections: [],
    affected_variables: [],
    source_context: {
      norm: finding.norm,
      nodeId: finding.nodeId,
      fixHint: finding.fixHint,
    },
    project_revision: revision,
    runtime_state: "design",
    related_diagnostics: [],
  };
}

export function buildDiagnosticContextFromImportIssue(
  issue: {
    id: string;
    severity: string;
    category: string;
    message: string;
    entityId?: string;
  },
  projectId: string,
): DiagnosticContext {
  const severity: "critical" | "warning" | "info" =
    issue.severity === "critical" ? "critical" : issue.severity === "warning" ? "warning" : "info";

  return {
    project_id: projectId,
    module: "importer",
    diagnostic_id: issue.id,
    error_code: `IMPORT_${issue.category.toUpperCase()}`,
    severity,
    error_message: issue.message,
    technical_details: `Categoria: ${issue.category}`,
    affected_components: issue.entityId ? [issue.entityId] : [],
    affected_connections: [],
    affected_variables: [],
    source_context: {
      category: issue.category,
      entityId: issue.entityId,
    },
    runtime_state: "import",
    related_diagnostics: [],
  };
}

/**
 * Formata um conjunto de diagnósticos no protocolo padronizado de 7 passos de remediação.
 */
export function formatDiagnosticFor7StepRemediation(
  target: DiagnosticContext | DiagnosticContext[],
  locale: "pt-BR" | "en" = "pt-BR",
): string {
  const list = Array.isArray(target) ? target : [target];
  const primary = list[0];
  if (!primary) return "";

  const isEn = locale === "en";

  const errorHeader = list
    .map(
      (d, idx) =>
        `[${idx + 1}] Módulo: ${d.module.toUpperCase()} | Código: ${d.error_code} | Severidade: ${d.severity.toUpperCase()}\n` +
        `    Mensagem: ${d.error_message}\n` +
        (d.technical_details ? `    Detalhes: ${d.technical_details}\n` : "") +
        (d.affected_components.length
          ? `    Componentes Afetados: ${d.affected_components.join(", ")}\n`
          : "") +
        (d.affected_variables.length
          ? `    Variáveis Afetadas: ${d.affected_variables.join(", ")}\n`
          : ""),
    )
    .join("\n");

  if (isEn) {
    return (
      `### [AI AUTOMATED REMEDIATION MANDATE - 7 STEPS]\n` +
      `Project ID: ${primary.project_id} (Rev: ${primary.project_revision ?? 1})\n` +
      `Detected Engineering Violations:\n\n${errorHeader}\n\n` +
      `Please execute the comprehensive 7-step remediation workflow:\n` +
      `1. ERROR INTERPRETATION: Explain the operational hazard and violation of relevant standards (IEC 60947, IEC 60364, IEC 61131-3, NFPA 70E).\n` +
      `2. ROOT CAUSE INVESTIGATION: Analyze the electrical topology, missing links, unrouted conductors, or invalid variable states.\n` +
      `3. TECHNICAL DIAGNOSIS: Provide unambiguous engineering diagnosis with exact calculation formulas or logic rules.\n` +
      `4. REPAIR PROPOSAL: Propose precise topological/parameter changes (addEdges, addNodes, updateParams, rungs) to completely eliminate all listed issues.\n` +
      `5. ASSISTED APPLICATION: Present a valid, executable JSON patch or action plan.\n` +
      `6. POST-REPAIR REVALIDATION: Verify that no secondary faults or short circuits are introduced.\n` +
      `7. RESULT REPORT: Summarize final healthy state, sizing metrics, and compliance certificate.`
    );
  }

  return (
    `### [MANDATO DE CORREÇÃO AUTOMÁTICA COM IA - 7 PASSOS]\n` +
    `Projeto ID: ${primary.project_id} (Revisão: ${primary.project_revision ?? 1})\n` +
    `Não Conformidades / Falhas Detectadas:\n\n${errorHeader}\n\n` +
    `Por favor, execute o protocolo determinístico de remediação em 7 etapas:\n` +
    `1. INTERPRETAÇÃO DO ERRO: Explique o impacto operacional, segurança física e norma violada (ABNT NBR 5410, NR-10, IEC 60947, IEC 61131-3, ISA-18.2).\n` +
    `2. INVESTIGAÇÃO DA CAUSA RAIZ: Identifique a desconexão topológica, falta de proteção de retaguarda, condutor órfão ou falha de parametrização.\n` +
    `3. DIAGNÓSTICO TÉCNICO: Detalhe as grandezas elétricas e restrições normativas exigidas para a conformidade.\n` +
    `4. PROPOSTA DE CORREÇÃO: Especifique as alterações exatas necessárias no diagrama unifilar, rungs Ladder ou parâmetros de equipamentos.\n` +
    `5. APLICAÇÃO ASSISTIDA: Apresente o patch de correção estruturado pronto para aplicação direta no projeto.\n` +
    `6. REVALIDAÇÃO PÓS-CORREÇÃO: Verifique a eliminação integral do erro e confirme que nenhum efeito colateral indesejado foi introduzido.\n` +
    `7. RELATÓRIO DO RESULTADO: Emita o sumário técnico final atestando a conformidade e integridade da engenharia.`
  );
}
