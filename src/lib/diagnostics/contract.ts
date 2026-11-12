/**
 * Módulo Único de Contratos de Dados, Validação Zod e Aplicação Pura de Patches (Fase 2).
 *
 * Princípios de Engenharia e Segurança:
 * 1. O motor determinístico decide; a IA apenas escolhe entre propostas já validadas.
 * 2. Whitelist estrita: somente "set-conductor-section", e apenas para AUMENTAR a seção.
 * 3. Elementos críticos de segurança (SAFETY_CRITICAL_KINDS e safety-core) são intocáveis.
 * 4. Raio de impacto limitado a no máximo 10 operações.
 * 5. Schemas Zod com .strict(), limites de tamanho e valores restritos às tabelas normativas.
 * 6. Imutabilidade total e funções puras sobre DiagramDoc.
 */

import { z } from "zod";
import { NBR5410_SECTIONS, type CableSection_mm2 } from "@/lib/electrical-calc";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";

// ── Tipos Básicos de Diagnósticos (Fase 1) ──────────────────────────────────

export type Severity = "ok" | "warning" | "error";

export interface NormReference {
  /** Identificação formal da norma técnica (ex.: "ABNT NBR 5410:2004"). */
  readonly standard: string;
  /** Cláusula ou seção normativa tabelada (provém do catálogo, nunca da IA). */
  readonly clause: string;
  /** Status da referência normativa. */
  readonly reviewStatus: "pending-human-review" | "reviewed";
}

export interface DiagnosticMeasurement {
  readonly value: number;
  readonly unit: string;
}

export interface Diagnostic {
  /** Identificador estável e determinístico no formato `${ruleId}:${elementId}`. */
  readonly id: string;
  /** Identificador da regra no catálogo normativo. */
  readonly ruleId: string;
  /** Nível de severidade calculado determinísticamente pela margem técnica. */
  readonly severity: Severity;
  /** Identificadores dos elementos do diagrama relacionados a este diagnóstico. */
  readonly elementIds: readonly string[];
  /** Valor mensurado/calculado pelo motor de engenharia. */
  readonly measured: DiagnosticMeasurement;
  /** Limite regulamentar estabelecido pela norma aplicável. */
  readonly limit: DiagnosticMeasurement;
  /** Razão entre o valor medido e o limite normativo (measured / limit). */
  readonly marginRatio: number;
  /** Premissas adotadas quando parâmetros não estiverem explícitos no projeto. */
  readonly assumptions: readonly string[];
  /** Referência formal à norma técnica. */
  readonly reference: NormReference;
  /** Contexto de dados tipados do diagnóstico. */
  readonly context: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Classifica a severidade de um diagnóstico pela razão entre a grandeza medida e o limite.
 */
export function classifyMargin(ratio: number, warnAt: number): Severity {
  if (!Number.isFinite(ratio) || ratio < 0) return "error";
  if (ratio >= 1) return "error";
  return ratio >= warnAt ? "warning" : "ok";
}

// ── Invariantes de Segurança e Whitelist de Operações (Fase 2) ──────────────

/**
 * Elementos estritamente críticos de segurança do sistema.
 * Nenhuma proposta ou operação tem permissão para conectar, modificar ou tocar neles.
 */
export const SAFETY_CRITICAL_KINDS = ["estop", "lightcurtain", "thermal_relay"] as const;

export type SafetyCriticalKind = (typeof SAFETY_CRITICAL_KINDS)[number];

export const MAX_OPERATIONS_PER_PATCH = 10;

/**
 * Erro lançado quando qualquer proposta tenta violar uma regra inegociável de segurança.
 */
export class SafetyViolationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "REDUCE_SECTION"
      | "SAFETY_ELEMENT_TOUCHED"
      | "UNKNOWN_OPERATION"
      | "UNAVAILABLE_CHECK"
      | "MAX_OPERATIONS_EXCEEDED",
  ) {
    super(`[Segurança ElétricAi] ${message}`);
    this.name = "SafetyViolationError";
  }
}

/**
 * Lista branca estrita de operações: somente set-conductor-section.
 * Nenhuma outra operação existe no tipo.
 */
export interface PatchOperation {
  readonly op: "set-conductor-section";
  readonly conductorId: string;
  readonly sectionMm2: CableSection_mm2;
}

export interface DiagnosticMetricComparison {
  readonly elementId: string;
  readonly metric: string;
  readonly before: number;
  readonly after: number;
  readonly unit: string;
  readonly limit: number;
  readonly marginRatioBefore: number;
  readonly marginRatioAfter: number;
}

export interface FixProposal {
  /** ID determinístico único (ex.: `fix:${ruleId}:${conductorId}:${targetSection}`). */
  readonly id: string;
  /** IDs dos diagnósticos que esta proposta resolve. */
  readonly resolvesDiagnosticIds: readonly string[];
  /** Operações estritas contidas na proposta (máximo 10). */
  readonly operations: readonly PatchOperation[];
  /** Métricas de engenharia antes e após a aplicação proposta. */
  readonly metrics: readonly DiagnosticMetricComparison[];
  /** Efeitos colaterais conhecidos (ex.: conferir eletroduto, bornes de conexão). */
  readonly sideEffects: readonly string[];
  /** Verificações de engenharia executadas com sucesso pelo motor determinístico. */
  readonly verifiedChecks: readonly string[];
  /** Verificações necessárias que não existem no motor (bloqueiam aplicação automática). */
  readonly unavailableChecks: readonly string[];
  /** Justificativa em português gerada ou selecionada. */
  readonly rationalePt?: string;
  /** Se a proposta é aplicável automaticamente ou se está bloqueada. */
  readonly isApplicable: boolean;
  /** Motivo do bloqueio caso não seja aplicável. */
  readonly blockReason?: string;
}

// ── Schemas Zod Estritos (.strict()) ───────────────────────────────────────

export const SeveritySchema = z.enum(["ok", "warning", "error"]);

export const NormReferenceSchema = z
  .object({
    standard: z.string().min(1).max(128),
    clause: z.string().min(1).max(128),
    reviewStatus: z.enum(["pending-human-review", "reviewed"]),
  })
  .strict();

export const DiagnosticMeasurementSchema = z
  .object({
    value: z.number().finite(),
    unit: z.string().min(1).max(32),
  })
  .strict();

export const DiagnosticSchema = z
  .object({
    id: z.string().min(1).max(256),
    ruleId: z.string().min(1).max(128),
    severity: SeveritySchema,
    elementIds: z.array(z.string().min(1).max(128)).max(50),
    measured: DiagnosticMeasurementSchema,
    limit: DiagnosticMeasurementSchema,
    marginRatio: z.number().finite(),
    assumptions: z.array(z.string().max(256)).max(20),
    reference: NormReferenceSchema,
    context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  })
  .strict();

export const PatchOperationSchema = z
  .object({
    op: z.literal("set-conductor-section"),
    conductorId: z.string().min(1).max(128),
    sectionMm2: z
      .number()
      .finite()
      .positive()
      .refine(
        (val): val is CableSection_mm2 => (NBR5410_SECTIONS as readonly number[]).includes(val),
        {
          message: "Seção deve pertencer às seções comerciais padronizadas da ABNT NBR 5410",
        },
      ),
  })
  .strict();

export const OperationsListSchema = z
  .array(PatchOperationSchema)
  .min(1, "A lista de operações não pode ser vazia")
  .max(
    MAX_OPERATIONS_PER_PATCH,
    `Raio de impacto máximo excedido (limite: ${MAX_OPERATIONS_PER_PATCH} operações)`,
  );

export const DiagnosticMetricComparisonSchema = z
  .object({
    elementId: z.string().min(1).max(128),
    metric: z.string().min(1).max(64),
    before: z.number().finite(),
    after: z.number().finite(),
    unit: z.string().min(1).max(16),
    limit: z.number().finite(),
    marginRatioBefore: z.number().finite(),
    marginRatioAfter: z.number().finite(),
  })
  .strict();

export const FixProposalSchema = z
  .object({
    id: z.string().min(1).max(256),
    resolvesDiagnosticIds: z.array(z.string().min(1).max(128)).max(50),
    operations: OperationsListSchema,
    metrics: z.array(DiagnosticMetricComparisonSchema).max(50),
    sideEffects: z.array(z.string().max(300)).max(20),
    verifiedChecks: z.array(z.string().max(100)).max(20),
    unavailableChecks: z.array(z.string().max(100)).max(20),
    rationalePt: z.string().max(600).optional(),
    isApplicable: z.boolean(),
    blockReason: z.string().max(300).optional(),
  })
  .strict();

export const AiFixRequestSchema = z
  .object({
    projectId: z.guid("ID de projeto inválido"),
    idempotencyKey: z.string().min(16).max(128),
    diagnostics: z.array(DiagnosticSchema).min(1).max(50),
    proposals: z.array(FixProposalSchema).min(1).max(20),
  })
  .strict();

export const AiFixResponseSchema = z
  .object({
    chosenProposalId: z.string().min(1).max(256).nullable(),
    rationalePt: z.string().min(1).max(600),
  })
  .strict();

// ── Aplicação Pura e Imutável de Operações no Modelo ───────────────────────

/**
 * Aplica um lote de operações validadas sobre uma cópia profunda imutável do DiagramDoc.
 *
 * Invariantes verificadas estritamente nesta função:
 * 1. O condutor deve existir no modelo.
 * 2. O condutor NÃO pode estar conectado a dispositivos de segurança (SAFETY_CRITICAL_KINDS).
 * 3. A nova seção deve ser ESTRITAMENTE MAIOR que a seção atual (nunca reduz bitola).
 * 4. Máximo de 10 operações por patch.
 * 5. Nenhum parâmetro de disjuntor, tensão, esquema de aterramento ou global é alterado.
 *
 * @throws {SafetyViolationError} se qualquer invariante for violada.
 * @returns Nova instância imutável do DiagramDoc com as seções atualizadas.
 */
export function applyPatchOperationsToDoc(
  doc: DiagramDoc,
  operations: readonly PatchOperation[],
): DiagramDoc {
  if (operations.length === 0) return doc;

  if (operations.length > MAX_OPERATIONS_PER_PATCH) {
    throw new SafetyViolationError(
      `O patch contém ${operations.length} operações, excedendo o limite de segurança de ${MAX_OPERATIONS_PER_PATCH}.`,
      "MAX_OPERATIONS_EXCEEDED",
    );
  }

  // Clone profundo usando JSON serializável do modelo canônico
  const nextDoc: DiagramDoc = JSON.parse(JSON.stringify(doc));

  for (const op of operations) {
    // 1. Validação do schema da operação
    PatchOperationSchema.parse(op);

    // 2. Localização do condutor
    const edge = nextDoc.edges[op.conductorId];
    if (!edge) {
      throw new Error(`Condutor ${op.conductorId} não encontrado no modelo.`);
    }

    // 3. Verificação de segurança: não tocar em elementos críticos de segurança
    const srcNode = nextDoc.nodes[edge.source];
    const tgtNode = nextDoc.nodes[edge.target];
    if (srcNode && isSafetyCriticalNode(srcNode)) {
      throw new SafetyViolationError(
        `Condutor ${op.conductorId} está conectado ao elemento de segurança ${srcNode.id} (${srcNode.params.kind}). Operação bloqueada.`,
        "SAFETY_ELEMENT_TOUCHED",
      );
    }
    if (tgtNode && isSafetyCriticalNode(tgtNode)) {
      throw new SafetyViolationError(
        `Condutor ${op.conductorId} está conectado ao elemento de segurança ${tgtNode.id} (${tgtNode.params.kind}). Operação bloqueada.`,
        "SAFETY_ELEMENT_TOUCHED",
      );
    }

    // 4. Invariante: apenas AUMENTAR a seção (nunca reduzir)
    const currentSection = edge.cable?.section_mm2 ?? 4;
    if (op.sectionMm2 <= currentSection) {
      throw new SafetyViolationError(
        `Tentativa de reduzir ou manter seção do condutor ${op.conductorId} de ${currentSection} mm² para ${op.sectionMm2} mm². Somente aumentos de bitola são permitidos.`,
        "REDUCE_SECTION",
      );
    }

    // 5. Aplicação da nova seção mantendo os demais parâmetros intocados
    edge.cable = {
      ...(edge.cable ?? { insulation: "PVC" }),
      section_mm2: op.sectionMm2,
    };

    // Sincronização do espelho multifilar (se existir no mesmo doc)
    const mfEdgeId = `mf_${edge.id}`;
    if (nextDoc.edges[mfEdgeId]) {
      nextDoc.edges[mfEdgeId].cable = {
        ...(nextDoc.edges[mfEdgeId].cable ?? { insulation: "PVC" }),
        section_mm2: op.sectionMm2,
      };
    }
  }

  return nextDoc;
}

/**
 * Verifica se um nó do diagrama pertence à lista de elementos críticos de segurança.
 */
export function isSafetyCriticalNode(node: DiagramNode): boolean {
  const kind = node.params.kind;
  return (SAFETY_CRITICAL_KINDS as readonly string[]).includes(kind);
}
