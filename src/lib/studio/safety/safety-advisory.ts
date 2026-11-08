// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — SAFETY ENGINEERING ADVISORY & INTERLOCK ANALYSIS
// Consultative Analysis for IEC 62061, ISO 13849-1, NR-12 & E-STOP Loop Topology
// ============================================================================

import { IS_PHYSICAL_CONTROL_ALLOWED } from "../canonical/types";

export interface SafetyLoopCheckResult {
  isCompliantWithDualChannel: boolean;
  issues: string[];
  recommendations: string[];
  diagnosticCoverageEstimate: "LOW" | "MEDIUM" | "HIGH";
  disclaimer: string;
}

export class SafetyEngineeringAdvisory {
  public static readonly LEGAL_DISCLAIMER =
    "AVISO DE SEGURANÇA MANDATÓRIO: O ElétricAi Industrial OS fornece ferramentas puramente analíticas e consultivas de engenharia. Esta simulação NÃO substitui relés de segurança certificados (SIL2/SIL3 / PLd/PLe), CLPs de segurança homologados ou circuitos físicos redundantes. Comandos físicos estão incondicionalmente bloqueados (IS_PHYSICAL_CONTROL_ALLOWED = false).";

  /**
   * Analisa topologia de parada de emergência (E-STOP) e intertravamentos de segurança.
   */
  public static analyzeEStopTopology(
    channel1Active: boolean,
    channel2Active: boolean,
    discrepancyTimeMs: number,
    maxAllowedDiscrepancyMs = 500,
  ): SafetyLoopCheckResult {
    // Verificação de barreira física
    if (IS_PHYSICAL_CONTROL_ALLOWED) {
      throw new Error("VIOLAÇÃO DE SEGURANÇA: Controle físico não é permitido no software.");
    }

    const issues: string[] = [];
    const recommendations: string[] = [];
    let isCompliant = true;
    let diagnosticCoverage: "LOW" | "MEDIUM" | "HIGH" = "HIGH";

    // 1. Verificação de canais redundantes (Category 3 / 4 ou PLd / PLe)
    if (channel1Active !== channel2Active) {
      if (discrepancyTimeMs > maxAllowedDiscrepancyMs) {
        isCompliant = false;
        diagnosticCoverage = "LOW";
        issues.push(
          `DISCREPÂNCIA DE CANAL DETECTADA: Canal 1 (${channel1Active}) e Canal 2 (${channel2Active}) divergem há ${discrepancyTimeMs}ms (limite permitido: ${maxAllowedDiscrepancyMs}ms). Falha de contato ou curto-circuito na fiação.`,
        );
        recommendations.push(
          "Inspecionar continuidade mecânica do botão E-STOP duplo contato e verificar cabeamento até os bornes do relé de segurança.",
        );
      } else {
        issues.push(
          `Discrepância transitória de comutação detectada (${discrepancyTimeMs}ms). Monitorando sincronismo.`,
        );
      }
    }

    // 2. Estado de segurança (ambos fechados = seguro; qualquer um aberto = parada segura)
    const isSafe = channel1Active && channel2Active;
    if (!isSafe) {
      recommendations.push(
        "Circuito de emergência desenergizado. Garantir que todas as saídas de potência permaneçam em estado seguro (desligadas).",
      );
    }

    return {
      isCompliantWithDualChannel: isCompliant,
      issues,
      recommendations,
      diagnosticCoverageEstimate: diagnosticCoverage,
      disclaimer: this.LEGAL_DISCLAIMER,
    };
  }
}
