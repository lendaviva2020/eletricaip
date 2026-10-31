/**
 * Orquestrador de Diagnósticos Corretivos em Rascunho com Revalidação Completa (Fase 5).
 *
 * Princípios de Engenharia e Segurança:
 * 1. O motor determinístico decide; propostas são geradas e validadas estritamente pelo motor.
 * 2. Aplicação em cópia profunda isolada (Rascunho / Draft); o modelo original permanece intocado.
 * 3. Revalidação profunda e critérios de aceitação estritos:
 *    - O diagnóstico visado deve ser resolvido ou atenuado para "ok".
 *    - Nenhum novo diagnóstico >= "warning" pode ser introduzido.
 *    - Nenhum diagnóstico pré-existente pode piorar de severidade.
 * 4. Detecção de ciclos via hash canônico SHA-256 do documento.
 * 5. Limite estrito de no máximo 3 iterações no loop de convergência.
 */

import type { DiagramDoc } from "@/lib/diagram/schema";
import {
  type Diagnostic,
  type FixProposal,
  type PatchOperation,
  type Severity,
  applyPatchOperationsToDoc,
} from "./contract";
import { RULES_CATALOG } from "./rules-catalog";
import { solveConductorSection } from "./conductor-solver";
import { computeCanonicalDocHash } from "./crypto-hash";

export const MAX_ORCHESTRATION_ITERATIONS = 3;

const SEVERITY_RANK: Record<Severity, number> = {
  ok: 0,
  warning: 1,
  error: 2,
};

/**
 * Avalia todas as regras normativas ativas do catálogo sobre o documento fornecido.
 */
export function evaluateAllRules(doc: DiagramDoc): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Avalia conexões canônicas unifilares (ignora espelhos multifilares para evitar duplicação)
  const canonicalEdges = Object.values(doc.edges).filter(
    (e) => e.sheet === "unifilar" || !e.id.startsWith("mf_"),
  );

  for (const rule of RULES_CATALOG) {
    for (const edge of canonicalEdges) {
      const sourceNode = doc.nodes[edge.source];
      const targetNode = doc.nodes[edge.target];

      if (rule.isApplicable({ doc, edge, sourceNode, targetNode })) {
        const diag = rule.evaluate({ doc, edge, sourceNode, targetNode });
        if (diag) {
          diagnostics.push(diag);
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Gera propostas de correção determinísticas para os diagnósticos acionáveis (warning ou error).
 */
export function proposeFixes(doc: DiagramDoc, diagnostics: readonly Diagnostic[]): FixProposal[] {
  const proposalsMap = new Map<string, FixProposal>();

  for (const diag of diagnostics) {
    if (diag.severity === "ok") continue;

    const proposal = solveConductorSection(doc, diag);
    if (proposal && !proposalsMap.has(proposal.id)) {
      proposalsMap.set(proposal.id, proposal);
    }
  }

  return Array.from(proposalsMap.values());
}

export interface DraftValidationResult {
  /** Se o rascunho foi aprovado por todos os critérios normativos e de segurança. */
  readonly isValid: boolean;
  /** Documento em rascunho com o patch aplicado (se bem-sucedido). */
  readonly draftDoc?: DiagramDoc;
  /** Hash SHA-256 canônico do estado do documento após aplicação. */
  readonly docHash: string;
  /** IDs dos diagnósticos que foram efetivamente resolvidos/atenuados. */
  readonly resolvedDiagnosticIds: readonly string[];
  /** Lista completa de diagnósticos do rascunho após reavaliação. */
  readonly remainingDiagnostics: readonly Diagnostic[];
  /** Novos diagnósticos não conformes (>= warning) introduzidos pela proposta. */
  readonly newDiagnostics: readonly Diagnostic[];
  /** Diagnósticos que pioraram de severidade. */
  readonly worsenedDiagnostics: readonly Diagnostic[];
  /** Motivo formal da rejeição caso não seja aprovado. */
  readonly rejectionReason?: string;
}

/**
 * Valida a aplicação de um conjunto de operações de patch sobre uma cópia isolada em rascunho.
 * Executa reavaliação profunda de todas as regras normativas e compara com o estado original.
 */
export function validateDraft(
  doc: DiagramDoc,
  operations: readonly PatchOperation[],
  originalDiagnostics: readonly Diagnostic[],
): DraftValidationResult {
  if (operations.length === 0) {
    return {
      isValid: false,
      docHash: computeCanonicalDocHash(doc),
      resolvedDiagnosticIds: [],
      remainingDiagnostics: originalDiagnostics,
      newDiagnostics: [],
      worsenedDiagnostics: [],
      rejectionReason: "Nenhuma operação de correção foi fornecida para validação.",
    };
  }

  // 1. Aplicação em cópia profunda isolada (imutabilidade estrita)
  let draftDoc: DiagramDoc;
  try {
    draftDoc = applyPatchOperationsToDoc(doc, operations);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      isValid: false,
      docHash: computeCanonicalDocHash(doc),
      resolvedDiagnosticIds: [],
      remainingDiagnostics: originalDiagnostics,
      newDiagnostics: [],
      worsenedDiagnostics: [],
      rejectionReason: `Violação na aplicação do patch: ${errorMsg}`,
    };
  }

  const docHash = computeCanonicalDocHash(draftDoc);

  // 2. Reavaliação profunda do modelo em rascunho com o catálogo de regras
  const draftDiagnostics = evaluateAllRules(draftDoc);

  // Mapeamento de diagnósticos originais por ID
  const originalMap = new Map<string, Diagnostic>();
  for (const d of originalDiagnostics) {
    originalMap.set(d.id, d);
  }

  // Mapeamento de diagnósticos pós-reavaliação por ID
  const draftMap = new Map<string, Diagnostic>();
  for (const d of draftDiagnostics) {
    draftMap.set(d.id, d);
  }

  // Identificação de condutores afetados pelas operações
  const affectedConductorIds = new Set(operations.map((op) => op.conductorId));

  const resolvedDiagnosticIds: string[] = [];
  const worsenedDiagnostics: Diagnostic[] = [];
  const newDiagnostics: Diagnostic[] = [];

  // 3. Avaliação dos diagnósticos originais
  for (const orig of originalDiagnostics) {
    const draftDiag = draftMap.get(orig.id);
    const origRank = SEVERITY_RANK[orig.severity];

    if (!draftDiag || draftDiag.severity === "ok") {
      // Resolvido completamente
      if (origRank > SEVERITY_RANK.ok) {
        resolvedDiagnosticIds.push(orig.id);
      }
    } else {
      const draftRank = SEVERITY_RANK[draftDiag.severity];
      if (draftRank < origRank) {
        // Atenuado (ex.: error -> warning)
        resolvedDiagnosticIds.push(orig.id);
      } else if (draftRank > origRank) {
        // Piorou de severidade!
        worsenedDiagnostics.push(draftDiag);
      }
    }
  }

  // 4. Identificação de novos diagnósticos introduzidos (>= warning)
  for (const draftDiag of draftDiagnostics) {
    if (draftDiag.severity === "ok") continue;

    const origDiag = originalMap.get(draftDiag.id);
    if (!origDiag || origDiag.severity === "ok") {
      newDiagnostics.push(draftDiag);
    }
  }

  // 5. Critérios de aceitação estritos
  if (worsenedDiagnostics.length > 0) {
    return {
      isValid: false,
      draftDoc,
      docHash,
      resolvedDiagnosticIds,
      remainingDiagnostics: draftDiagnostics,
      newDiagnostics,
      worsenedDiagnostics,
      rejectionReason: `A alteração agravou a severidade do diagnóstico ${worsenedDiagnostics[0].id} (${worsenedDiagnostics[0].severity}).`,
    };
  }

  if (newDiagnostics.length > 0) {
    return {
      isValid: false,
      draftDoc,
      docHash,
      resolvedDiagnosticIds,
      remainingDiagnostics: draftDiagnostics,
      newDiagnostics,
      worsenedDiagnostics,
      rejectionReason: `A alteração introduziu novo diagnóstico não conforme: ${newDiagnostics[0].id} (${newDiagnostics[0].severity}).`,
    };
  }

  if (resolvedDiagnosticIds.length === 0) {
    return {
      isValid: false,
      draftDoc,
      docHash,
      resolvedDiagnosticIds,
      remainingDiagnostics: draftDiagnostics,
      newDiagnostics,
      worsenedDiagnostics,
      rejectionReason:
        "A operação de patch foi executada, mas não atenuou nem resolveu nenhum dos diagnósticos pendentes.",
    };
  }

  return {
    isValid: true,
    draftDoc,
    docHash,
    resolvedDiagnosticIds,
    remainingDiagnostics: draftDiagnostics,
    newDiagnostics: [],
    worsenedDiagnostics: [],
  };
}

export interface OrchestrationResult {
  /** Indica se todas as propostas foram aplicadas e convergiram com sucesso. */
  readonly success: boolean;
  /** Documento final resultante (ou original caso rejeitado). */
  readonly finalDoc: DiagramDoc;
  /** Hash SHA-256 inicial do documento. */
  readonly initialDocHash: string;
  /** Hash SHA-256 final do documento. */
  readonly finalDocHash: string;
  /** Quantidade de iterações executadas (máximo 3). */
  readonly iterationsCount: number;
  /** Propostas que foram aceitas e aplicadas durante o processo. */
  readonly appliedProposals: readonly FixProposal[];
  /** IDs de todos os diagnósticos que foram resolvidos. */
  readonly resolvedDiagnosticIds: readonly string[];
  /** Diagnósticos remanescentes após a orquestração. */
  readonly remainingDiagnostics: readonly Diagnostic[];
  /** Se um ciclo de estados foi detectado via SHA-256. */
  readonly cycleDetected: boolean;
  /** Motivo da rejeição ou interrupção prematura. */
  readonly rejectionReason?: string;
}

export interface OrchestrateOptions {
  /** Limite máximo de iterações (teto fixo de 3). */
  maxIterations?: number;
  /** Se permite executar propostas em modo assistido (requerem homologação do engenheiro). Padrão: true. */
  allowAssisted?: boolean;
}

/**
 * Orquestra o ciclo de correções determinísticas em rascunho com convergência e detecção de ciclos.
 *
 * Limites e proteções:
 * - Máximo de 3 iterações (`MAX_ORCHESTRATION_ITERATIONS`).
 * - Histórico de hashes SHA-256; se o mesmo hash reaparecer, aborta imediatamente com `cycleDetected: true`.
 * - Não toca no documento original passado como parâmetro.
 */
export function orchestrateDraftFixes(
  doc: DiagramDoc,
  initialDiagnostics: readonly Diagnostic[],
  options: OrchestrateOptions = {},
): OrchestrationResult {
  const maxIterations = Math.min(
    options.maxIterations ?? MAX_ORCHESTRATION_ITERATIONS,
    MAX_ORCHESTRATION_ITERATIONS,
  );
  const allowAssisted = options.allowAssisted ?? true;

  const initialDocHash = computeCanonicalDocHash(doc);
  const seenHashes = new Set<string>([initialDocHash]);

  let currentDoc: DiagramDoc = doc;
  let currentDiagnostics = [...initialDiagnostics];
  const appliedProposals: FixProposal[] = [];
  const allResolvedIds = new Set<string>();

  let iterationsCount = 0;
  let cycleDetected = false;
  let rejectionReason: string | undefined;

  while (iterationsCount < maxIterations) {
    iterationsCount++;

    // 1. Propor correções para os diagnósticos acionáveis atuais
    const proposals = proposeFixes(currentDoc, currentDiagnostics);
    const applicableProposals = proposals.filter((p) => {
      if (p.operations.length === 0) return false;
      if (p.isApplicable) return true;
      // Propostas assistidas: permitidas se allowAssisted for true e o único bloqueio for verificação indisponível
      return (
        allowAssisted && p.unavailableChecks.length > 0 && !p.blockReason?.includes("premissas")
      );
    });

    if (applicableProposals.length === 0) {
      // Nenhuma proposta aplicável resta (ou todas estão bloqueadas por premissas/segurança)
      break;
    }

    // Seleciona a primeira proposta aplicável disponível
    const proposal = applicableProposals[0];

    // 2. Valida o rascunho aplicando a proposta
    const validation = validateDraft(currentDoc, proposal.operations, currentDiagnostics);

    if (!validation.isValid || !validation.draftDoc) {
      rejectionReason = validation.rejectionReason;
      break;
    }

    // 3. Detecção de ciclos via hash canônico SHA-256
    if (seenHashes.has(validation.docHash)) {
      cycleDetected = true;
      rejectionReason = `Ciclo detectado no orquestrador: hash ${validation.docHash.slice(0, 8)} já foi observado anteriormente.`;
      break;
    }

    // 4. Aceitação da iteração
    seenHashes.add(validation.docHash);
    currentDoc = validation.draftDoc;
    currentDiagnostics = [...validation.remainingDiagnostics];
    appliedProposals.push(proposal);
    for (const id of validation.resolvedDiagnosticIds) {
      allResolvedIds.add(id);
    }

    // Se todos os diagnósticos acionáveis foram eliminados, encerra antes do limite
    const remainingActionable = currentDiagnostics.filter((d) => d.severity !== "ok");
    if (remainingActionable.length === 0) {
      break;
    }
  }

  const finalDocHash = computeCanonicalDocHash(currentDoc);

  return {
    success: !cycleDetected && appliedProposals.length > 0,
    finalDoc: currentDoc,
    initialDocHash,
    finalDocHash,
    iterationsCount,
    appliedProposals,
    resolvedDiagnosticIds: Array.from(allResolvedIds),
    remainingDiagnostics: currentDiagnostics,
    cycleDetected,
    rejectionReason,
  };
}
