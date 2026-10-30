/**
 * Solver Determinístico de Seção de Condutores (Fase 4).
 *
 * Princípios:
 * 1. O motor determinístico testa seções comerciais em ordem crescente e escolhe a menor válida.
 * 2. Se houver premissas (assumptions), bloqueia a aplicação automática e solicita dados reais.
 * 3. Executa: queda de tensão, ampacidade e coordenação de sobrecarga.
 * 4. Verificação de suportabilidade a curto-circuito (não existente no motor) é catalogada como
 *    "verificação indisponível", bloqueando a aplicação automática e saindo como sugestão assistida.
 * 5. Não altera disjuntores, tensões ou elementos de segurança (SAFETY_CRITICAL_KINDS).
 * 6. Documenta efeitos colaterais técnicos (eletrodutos, bornes, mecânica).
 *
 * Conformidade: ABNT NBR 5410:2004.
 */

import {
  NBR5410_SECTIONS,
  type CableSection_mm2,
  calcVoltageDrop,
  correctedAmpacityIz,
  verifyOverloadCoordination,
} from "@/lib/electrical-calc";
import { inferCircuitConfig } from "@/lib/diagram/multifilar";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";
import {
  type FixProposal,
  type PatchOperation,
  type DiagnosticMetricComparison,
  type Diagnostic,
  classifyMargin,
  isSafetyCriticalNode,
} from "./contract";
import { NORM_PARAMS, resolveVoltageDropLimit } from "./rules-catalog";

export interface SolveConductorOptions {
  /** Se permite resolver diagnósticos em severidade warning além de error (padrão: true). */
  includeWarnings?: boolean;
  /** Limiar de margem técnica (padrão: 0.9). */
  warnAt?: number;
}

/**
 * Resolve determinísticamente a menor seção de condutor comercial válida para um diagnóstico.
 *
 * @param doc - O documento do diagrama elétrico (somente leitura).
 * @param diagnostic - O diagnóstico normativo emitido pelo catálogo.
 * @param opts - Opções de resolução e limiares.
 * @returns FixProposal estruturada ou null se não for um diagnóstico tratável por aumento de bitola.
 */
export function solveConductorSection(
  doc: DiagramDoc,
  diagnostic: Diagnostic,
  opts: SolveConductorOptions = {},
): FixProposal | null {
  const includeWarnings = opts.includeWarnings ?? true;
  const warnAt = opts.warnAt ?? NORM_PARAMS.NBR5410.defaultWarningMarginRatio;

  // Apenas diagnósticos acionáveis (error ou warning) são processados pelo solver
  if (diagnostic.severity === "ok") return null;
  if (diagnostic.severity === "warning" && !includeWarnings) return null;

  // Identifica a conexão do circuito
  const conductorId = (diagnostic.context.conductorId as string) || diagnostic.elementIds[0];
  const edge = doc.edges[conductorId];
  if (!edge) return null;

  const sourceNode = doc.nodes[edge.source];
  const targetNode = doc.nodes[edge.target];

  // Invariante de Segurança: elementos críticos não podem ser tocados
  if (sourceNode && isSafetyCriticalNode(sourceNode)) {
    return {
      id: `fix:blocked:${diagnostic.id}:safety_source`,
      resolvesDiagnosticIds: [diagnostic.id],
      operations: [],
      metrics: [],
      sideEffects: [],
      verifiedChecks: [],
      unavailableChecks: [],
      isApplicable: false,
      blockReason: `Condutor ${conductorId} está conectado ao dispositivo de segurança ${sourceNode.id} (${sourceNode.params.kind}). Correções automatizadas são proibidas em circuitos de segurança.`,
    };
  }

  if (targetNode && isSafetyCriticalNode(targetNode)) {
    return {
      id: `fix:blocked:${diagnostic.id}:safety_target`,
      resolvesDiagnosticIds: [diagnostic.id],
      operations: [],
      metrics: [],
      sideEffects: [],
      verifiedChecks: [],
      unavailableChecks: [],
      isApplicable: false,
      blockReason: `Condutor ${conductorId} está conectado ao dispositivo de segurança ${targetNode.id} (${targetNode.params.kind}). Correções automatizadas são proibidas em circuitos de segurança.`,
    };
  }

  // Regra Inviolável: se o diagnóstico contiver premissas assumidas, bloqueia aplicação automática
  if (diagnostic.assumptions.length > 0) {
    return {
      id: `fix:assumptions:${diagnostic.id}`,
      resolvesDiagnosticIds: [diagnostic.id],
      operations: [],
      metrics: [],
      sideEffects: [
        "Necessário confirmar parâmetros de projeto em campo antes de dimensionar condutores.",
      ],
      verifiedChecks: [],
      unavailableChecks: [],
      isApplicable: false,
      blockReason: `Diagnóstico baseado em premissas não confirmadas: ${diagnostic.assumptions.join("; ")}. Forneça os dados reais do projeto para habilitar a proposta.`,
    };
  }

  const currentSection = (edge.cable?.section_mm2 ?? 4) as CableSection_mm2;
  const length_m = edge.cable?.length_m ?? 25;
  const current_A = Number(diagnostic.context.current_A ?? 20);
  const limit_pct = diagnostic.limit.value;

  const config = edge.circuitConfig ?? inferCircuitConfig(edge, sourceNode, targetNode);
  const isThreePhase = config.startsWith("3F");
  const voltage_V = isThreePhase ? 380 : 220;
  const cosphi = 0.85;

  // Identifica disjuntor do circuito para coordenação de sobrecarga Ib <= In <= I'z
  let breaker_A: number | undefined;
  if (targetNode?.params.kind === "breaker") {
    breaker_A = (targetNode.params as any).in_A;
  } else if (sourceNode?.params.kind === "breaker") {
    breaker_A = (sourceNode.params as any).in_A;
  }

  // Lista de seções comerciais acima da atual em ordem crescente
  const candidateSections = (NBR5410_SECTIONS as readonly CableSection_mm2[]).filter(
    (s) => s > currentSection,
  );

  let chosenSection: CableSection_mm2 | null = null;
  let chosenMetrics: DiagnosticMetricComparison[] = [];
  const verifiedChecks: string[] = [];
  const unavailableChecks: string[] = [
    "suportabilidade_curto_circuito (NBR 5410 §5.3.5 / I²t <= k²S²)",
  ];

  for (const candidate of candidateSections) {
    // 1. Verificação de Queda de Tensão
    const calc = calcVoltageDrop(current_A, length_m, candidate, voltage_V, cosphi, {
      phases: isThreePhase ? 3 : 1,
    });
    const candidateDrop_pct = Number(calc.deltaV_pct.toFixed(2));
    const marginRatio = candidateDrop_pct / limit_pct;
    const severity = classifyMargin(marginRatio, warnAt);

    if (severity !== "ok") {
      // Seção ainda resulta em atenção ou erro de queda de tensão; tenta a próxima
      continue;
    }

    // 2. Verificação de Capacidade de Condução de Corrente (Ampacidade I'z)
    const Iz = correctedAmpacityIz(candidate, {
      method: (edge.cable?.installation as any) ?? "C",
      insulation: edge.cable?.insulation ?? "PVC",
      ambientTemp_C: 30,
      groupedCircuits: 1,
      loadedConductors: isThreePhase ? 3 : 2,
    });

    if (current_A > Iz) {
      // Corrente de projeto excede ampacidade corrigida
      continue;
    }

    // 3. Verificação de Coordenação de Sobrecarga (se houver disjuntor)
    if (breaker_A !== undefined) {
      const coord = verifyOverloadCoordination(current_A, breaker_A, Iz);
      if (!coord.coordinated) {
        // Disjuntor existente não coordena com esta bitola; tenta bitola maior
        continue;
      }
    }

    // Seção candidata aprovada em todas as verificações determinísticas disponíveis!
    chosenSection = candidate;
    verifiedChecks.push(
      "queda_de_tensao (NBR 5410 §6.2.7)",
      "capacidade_conducao_corrente_iz (NBR 5410 §6.2.5)",
    );
    if (breaker_A !== undefined) {
      verifiedChecks.push("coordenacao_sobrecarga (NBR 5410 §5.3.4.1)");
    }

    chosenMetrics = [
      {
        elementId: edge.id,
        metric: "voltage_drop_pct",
        before: diagnostic.measured.value,
        after: candidateDrop_pct,
        unit: "%",
        limit: limit_pct,
        marginRatioBefore: diagnostic.marginRatio,
        marginRatioAfter: Number(marginRatio.toFixed(4)),
      },
      {
        elementId: edge.id,
        metric: "section_mm2",
        before: currentSection,
        after: candidate,
        unit: "mm²",
        limit: 300,
        marginRatioBefore: currentSection / 300,
        marginRatioAfter: candidate / 300,
      },
    ];

    break;
  }

  if (!chosenSection) {
    return {
      id: `fix:infeasible:${diagnostic.id}`,
      resolvesDiagnosticIds: [diagnostic.id],
      operations: [],
      metrics: [],
      sideEffects: [],
      verifiedChecks: [],
      unavailableChecks,
      isApplicable: false,
      blockReason: `Inviável: nenhuma seção comercial padronizada da NBR 5410 (até 300 mm²) atende simultaneamente aos critérios de queda de tensão e ampacidade para este trecho (${length_m} m, ${current_A} A).`,
    };
  }

  const operations: readonly PatchOperation[] = [
    {
      op: "set-conductor-section",
      conductorId: edge.id,
      sectionMm2: chosenSection,
    },
  ];

  const sideEffects = [
    `Aumento da seção de ${currentSection} mm² para ${chosenSection} mm²: verificar a taxa de ocupação dos eletrodutos (NBR 5410 §6.2.11).`,
    `Verificar se os bornes de conexão dos equipamentos suportam condutores de ${chosenSection} mm².`,
  ];

  // Como a verificação de curto-circuito é mandatória por norma mas indisponível no motor,
  // a proposta sai marcada como NÃO aplicável automaticamente, exigindo homologação de engenharia
  const isApplicable = unavailableChecks.length === 0;
  const blockReason = !isApplicable
    ? "Verificação de suportabilidade a curto-circuito (NBR 5410 §5.3.5) indisponível no motor determinístico. Proposta emitida para homologação técnica manual do engenheiro responsável."
    : undefined;

  return {
    id: `fix:${diagnostic.ruleId}:${edge.id}:${chosenSection}mm2`,
    resolvesDiagnosticIds: [diagnostic.id],
    operations,
    metrics: chosenMetrics,
    sideEffects,
    verifiedChecks,
    unavailableChecks,
    rationalePt: `Aumentar a seção do condutor de ${currentSection} mm² para ${chosenSection} mm² reduz a queda de tensão de ${diagnostic.measured.value}% para ${chosenMetrics[0].after}% (limite < ${limit_pct}% NBR 5410).`,
    isApplicable,
    blockReason,
  };
}
