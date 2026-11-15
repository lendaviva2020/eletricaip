/**
 * Catálogo de Regras Normativas Determinísticas do ElétricAi (Fase 3).
 *
 * Princípio:
 * O motor determinístico avalia e decide segundo parâmetros regulamentares.
 * Valores normativos são estáticos em NORM_PARAMS com status de revisão explícito.
 * Não copia texto protegido da ABNT, apenas parâmetros de engenharia e referências.
 *
 * Norma: ABNT NBR 5410:2004.
 */

import { calcVoltageDrop, type CableSection_mm2 } from "@/lib/electrical-calc";
import { inferCircuitConfig } from "@/lib/diagram/multifilar";
import { estimateCircuitCurrent } from "@/lib/diagram/circuit-current";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";
import { classifyMargin, type Diagnostic, type NormReference, type Severity } from "./contract";

export const NORM_PARAMS = {
  NBR5410: {
    standard: "ABNT NBR 5410:2004",
    clause: "Tabela 33 / §6.2.7",
    reviewStatus: "pending-human-review" as const,
    voltageDropLimits: {
      /** Alimentação a partir da rede pública de baixa tensão. */
      publicGrid: 4.0,
      /** Alimentação a partir de subestação/transformador ou gerador próprio. */
      ownSubstationOrGenerator: 7.0,
      /** Critério mais restritivo adotado por padrão quando a origem não estiver explícita. */
      defaultRestrictive: 4.0,
    },
    defaultWarningMarginRatio: 0.9,
  },
} as const;

export type RuleId = "NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP";

export type CorrectionStrategy = "increase-conductor-section";

export interface RuleApplicabilityContext {
  readonly doc: DiagramDoc;
  readonly edge: DiagramEdge;
  readonly sourceNode?: DiagramNode;
  readonly targetNode?: DiagramNode;
}

export interface Rule {
  readonly id: RuleId;
  readonly standard: string;
  readonly clause: string;
  readonly reviewStatus: "pending-human-review" | "reviewed";
  readonly title: string;
  readonly allowedStrategies: readonly CorrectionStrategy[];
  /** Avalia se a regra se aplica à conexão/condutor em análise. */
  readonly isApplicable: (context: RuleApplicabilityContext) => boolean;
  /** Executa a verificação técnica determinística e emite o diagnóstico. */
  readonly evaluate: (context: RuleApplicabilityContext) => Diagnostic | null;
}

/**
 * Determina o limite normativo de queda de tensão em função da origem da alimentação.
 * Se o parâmetro não estiver explícito no modelo, aplica o critério mais restritivo
 * e registra a premissa correspondente.
 */
export function resolveVoltageDropLimit(doc: DiagramDoc): {
  limit_pct: number;
  assumptions: readonly string[];
} {
  const metadata = doc.metadata as Record<string, unknown> | undefined;
  const supplyOrigin = metadata?.supplyOrigin;

  if (supplyOrigin === "substation" || supplyOrigin === "generator") {
    return {
      limit_pct: NORM_PARAMS.NBR5410.voltageDropLimits.ownSubstationOrGenerator,
      assumptions: [],
    };
  }

  if (supplyOrigin === "public_grid") {
    return {
      limit_pct: NORM_PARAMS.NBR5410.voltageDropLimits.publicGrid,
      assumptions: [],
    };
  }

  // Se o parâmetro não existir no modelo, adota o critério mais restritivo com premissa documentada
  return {
    limit_pct: NORM_PARAMS.NBR5410.voltageDropLimits.defaultRestrictive,
    assumptions: [
      "Origem da alimentação não especificada nos parâmetros do projeto; adotado o critério mais restritivo de 4,0% (NBR 5410 Tabela 33)",
    ],
  };
}

/**
 * Regra: Queda de Tensão em Circuitos Terminais (NBR 5410 §6.2.7 / Tabela 33).
 */
export const ruleVoltageDropTerminalCircuit: Rule = {
  id: "NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP",
  standard: NORM_PARAMS.NBR5410.standard,
  clause: NORM_PARAMS.NBR5410.clause,
  reviewStatus: NORM_PARAMS.NBR5410.reviewStatus,
  title: "Queda de tensão em circuito terminal",
  allowedStrategies: ["increase-conductor-section"],

  isApplicable: ({ edge }) => {
    // Aplica-se a conexões de potência (ou com cabo configurado) no diagrama unifilar/canônico
    return edge.kind === "power" || edge.cable !== undefined;
  },

  evaluate: ({ doc, edge, sourceNode, targetNode }) => {
    const assumptions: string[] = [];
    const { limit_pct, assumptions: originAssumptions } = resolveVoltageDropLimit(doc);
    assumptions.push(...originAssumptions);

    const cable = edge.cable;
    if (!cable?.length_m) {
      assumptions.push("Comprimento do circuito não declarado; adotado 25 m como padrão");
    }
    if (!cable?.section_mm2) {
      assumptions.push("Seção do condutor não declarada; adotado 4 mm² como padrão");
    }

    const length_m = cable?.length_m ?? 25;
    const section_mm2 = (cable?.section_mm2 ?? 4) as CableSection_mm2;

    const config = edge.circuitConfig ?? inferCircuitConfig(edge, sourceNode, targetNode);
    const isThreePhase = config.startsWith("3F");

    // Auditoria F2.7: corrente pela fonte única (cosφ/η do motor de cálculos,
    // fórmula trifásica para carga trifásica), com premissas explícitas.
    const est = estimateCircuitCurrent([targetNode, sourceNode], isThreePhase);
    assumptions.push(...est.assumptions);
    let current_A = est.current_A;
    if (current_A === undefined) {
      current_A = 20;
      assumptions.push("Corrente de projeto não informada; adotado valor nominal padrão de 20 A");
    }
    const voltage_V = est.voltage_V ?? (isThreePhase ? 380 : 220);
    const cosphi = est.cosphi;

    // Cálculo pela função de engenharia pura existente em electrical-calc
    const calc = calcVoltageDrop(current_A, length_m, section_mm2, voltage_V, cosphi, {
      phases: isThreePhase ? 3 : 1,
      insulation: cable?.insulation ?? "PVC",
    });

    const drop_pct = Number(calc.deltaV_pct.toFixed(2));
    // F2.7: margem sobre o valor não arredondado (4,004% não vira 4,00% "conforme").
    const rawDropPct = (calc.deltaV_V / voltage_V) * 100;
    const marginRatio = Number((rawDropPct / limit_pct).toFixed(6));
    const severity: Severity = classifyMargin(
      marginRatio,
      NORM_PARAMS.NBR5410.defaultWarningMarginRatio,
    );

    const elementIds = [edge.id];
    if (targetNode) elementIds.push(targetNode.id);

    const reference: NormReference = {
      standard: NORM_PARAMS.NBR5410.standard,
      clause: NORM_PARAMS.NBR5410.clause,
      reviewStatus: NORM_PARAMS.NBR5410.reviewStatus,
    };

    return {
      id: `${ruleVoltageDropTerminalCircuit.id}:${edge.id}`,
      ruleId: ruleVoltageDropTerminalCircuit.id,
      severity,
      elementIds,
      measured: { value: drop_pct, unit: "%" },
      limit: { value: limit_pct, unit: "%" },
      marginRatio,
      assumptions,
      reference,
      context: {
        conductorId: edge.id,
        length_m,
        section_mm2,
        current_A,
        drop_pct,
        limit_pct,
        isThreePhase,
        voltage_V,
      },
    };
  },
};

/** Catálogo de regras ativas do sistema. */
export const RULES_CATALOG: readonly Rule[] = [ruleVoltageDropTerminalCircuit] as const;
