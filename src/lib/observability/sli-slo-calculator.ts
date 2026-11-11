// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.7: SLI / SLO CALCULATOR & AVAILABILITY ENGINE
// Formal Metrology, Error Budgeting, Explicit Denominators & Maintenance Exclusion
// Standards: SRE Google Handbook, IEEE 762 (Power Plant Availability), IEC 62443
// =============================================================================

import type { SloDefinition, SloMeasurement, SloTargetService } from "./types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "./types";

export const DEFAULT_SLO_DEFINITIONS: Record<SloTargetService, SloDefinition> = {
  CLOUD_SERVICE: {
    sloId: "slo_cloud_api_availability",
    targetService: "CLOUD_SERVICE",
    name: "Disponibilidade da API e Serviços Cloud",
    description: "Proporção de requisições HTTP e Server Functions respondidas sem erro 5xx.",
    targetPercent: 99.9,
    evaluationWindowDays: 30,
    calculationMethod: "REQUEST_SUCCESS_RATIO",
    numeratorDescription: "Total de requisições com código de status HTTP < 500",
    denominatorDescription: "Total de requisições válidas elegíveis (excluindo manutenção formal)",
    unit: "Percentual (%)",
    version: "1.0.0",
  },
  EDGE_GATEWAY: {
    sloId: "slo_edge_gateway_uptime",
    targetService: "EDGE_GATEWAY",
    name: "Disponibilidade de Gateways Edge",
    description: "Proporção de janelas de tempo com heartbeat confirmado e agente ativo.",
    targetPercent: 99.5,
    evaluationWindowDays: 30,
    calculationMethod: "TIME_WINDOW_RATIO",
    numeratorDescription: "Janelas de 1 minuto com telemetria e heartbeat confirmado",
    denominatorDescription: "Total de janelas elegíveis do período menos manutenções formais",
    unit: "Percentual (%)",
    version: "1.0.0",
  },
  INDUSTRIAL_SOURCE: {
    sloId: "slo_industrial_source_connectivity",
    targetService: "INDUSTRIAL_SOURCE",
    name: "Conectividade de Fontes Industriais (PLCs / IEDs)",
    description: "Percentual de ciclos de leitura Modbus/OPC UA completados sem timeout.",
    targetPercent: 99.0,
    evaluationWindowDays: 30,
    calculationMethod: "CYCLE_SUCCESS_RATIO",
    numeratorDescription: "Ciclos de leitura bem-sucedidos com resposta válida",
    denominatorDescription: "Total de ciclos de leitura programados",
    unit: "Percentual (%)",
    version: "1.0.0",
  },
  DATA_INGESTION: {
    sloId: "slo_data_ingestion_pipeline",
    targetService: "DATA_INGESTION",
    name: "Taxa de Sucesso na Ingestão de Dados",
    description: "Proporção de amostras de telemetria aceitas e deduplicadas sem perda.",
    targetPercent: 99.95,
    evaluationWindowDays: 30,
    calculationMethod: "SAMPLE_INGESTION_RATIO",
    numeratorDescription: "Amostras ingeridas com integridade e sequência preservadas",
    denominatorDescription: "Total de amostras enviadas pelos gateways",
    unit: "Percentual (%)",
    version: "1.0.0",
  },
  SCADA_INTERFACE: {
    sloId: "slo_scada_interface_freshness",
    targetService: "SCADA_INTERFACE",
    name: "Disponibilidade da Interface SCADA",
    description: "Disponibilidade das telas do supervisório com atualização em tempo real.",
    targetPercent: 99.5,
    evaluationWindowDays: 30,
    calculationMethod: "UI_SESSION_HEALTH_RATIO",
    numeratorDescription: "Sessões ativas com streaming de dados ativo sem queda de bridge",
    denominatorDescription: "Total de sessões de operação iniciadas",
    unit: "Percentual (%)",
    version: "1.0.0",
  },
  HISTORIAN_STORAGE: {
    sloId: "slo_historian_persistence",
    targetService: "HISTORIAN_STORAGE",
    name: "Confiabilidade de Gravação no Historian",
    description: "Garantia de gravação persistente de séries temporais sem rejeição por backlog.",
    targetPercent: 99.99,
    evaluationWindowDays: 30,
    calculationMethod: "STORAGE_COMMIT_RATIO",
    numeratorDescription: "Amostras persistidas com sucesso no banco de séries temporais",
    denominatorDescription: "Amostras encaminhadas para gravação histórica",
    unit: "Percentual (%)",
    version: "1.0.0",
  },
  DATA_FRESHNESS: {
    sloId: "slo_data_freshness_sla",
    targetService: "DATA_FRESHNESS",
    name: "Frescor de Dados Industriais (Latency SLA)",
    description: "Percentual de amostras recebidas no Cloud com atraso inferior a 3s.",
    targetPercent: 98.0,
    evaluationWindowDays: 30,
    calculationMethod: "LATENCY_THRESHOLD_RATIO",
    numeratorDescription: "Amostras com (cloudReceivedAt - sourceTimestamp) <= 3000ms",
    denominatorDescription: "Total de amostras recebidas",
    unit: "Percentual (%)",
    version: "1.0.0",
  },
};

export class SliSloCalculator {
  private definitions: Map<SloTargetService, SloDefinition> = new Map();

  constructor() {
    for (const [k, v] of Object.entries(DEFAULT_SLO_DEFINITIONS)) {
      this.definitions.set(k as SloTargetService, v);
    }
  }

  /**
   * Calcula as métricas de SLI, SLO e Error Budget a partir de dados medidos auditados.
   */
  public calculateSloMeasurement(params: {
    targetService: SloTargetService;
    periodStart: number;
    periodEnd: number;
    totalObservations: number;
    validObservationsNumerator: number;
    totalEligibleDenominator: number;
    unknownIntervalsCount: number;
    plannedMaintenanceDurationMs: number;
    unplannedOutageDurationMs: number;
  }): SloMeasurement {
    const def = this.definitions.get(params.targetService) || DEFAULT_SLO_DEFINITIONS.CLOUD_SERVICE;

    // Regra matemática fundamental: se o denominador for 0 ou observações forem insuficientes
    if (params.totalEligibleDenominator <= 0) {
      return {
        sloId: def.sloId,
        targetService: params.targetService,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        totalObservations: params.totalObservations,
        validObservationsNumerator: 0,
        totalEligibleDenominator: 0,
        achievedPercent: 0,
        targetPercent: def.targetPercent,
        isCompliant: false,
        errorBudgetTotalPercent: 100 - def.targetPercent,
        errorBudgetConsumedPercent: 100,
        errorBudgetRemainingPercent: 0,
        unknownIntervalsCount: params.unknownIntervalsCount,
        plannedMaintenanceDurationMs: params.plannedMaintenanceDurationMs,
        unplannedOutageDurationMs: params.unplannedOutageDurationMs,
        calculationFormula: `${def.calculationMethod}: Numerador / Denominador`,
        policyVersion: def.version,
      };
    }

    // Cálculo formal de disponibilidade
    const achievedPercent = Number(
      ((params.validObservationsNumerator / params.totalEligibleDenominator) * 100).toFixed(4),
    );

    const isCompliant = achievedPercent >= def.targetPercent;
    const errorBudgetTotalPercent = Number((100 - def.targetPercent).toFixed(4));

    // Consumo do Error Budget: (100 - achieved) / (100 - target) * 100
    const unreliabilityPercent = Math.max(0, 100 - achievedPercent);
    const errorBudgetConsumedPercent = Number(
      Math.min(100, (unreliabilityPercent / errorBudgetTotalPercent) * 100).toFixed(2),
    );
    const errorBudgetRemainingPercent = Number(
      Math.max(0, 100 - errorBudgetConsumedPercent).toFixed(2),
    );

    return {
      sloId: def.sloId,
      targetService: params.targetService,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      totalObservations: params.totalObservations,
      validObservationsNumerator: params.validObservationsNumerator,
      totalEligibleDenominator: params.totalEligibleDenominator,
      achievedPercent,
      targetPercent: def.targetPercent,
      isCompliant,
      errorBudgetTotalPercent,
      errorBudgetConsumedPercent,
      errorBudgetRemainingPercent,
      unknownIntervalsCount: params.unknownIntervalsCount,
      plannedMaintenanceDurationMs: params.plannedMaintenanceDurationMs,
      unplannedOutageDurationMs: params.unplannedOutageDurationMs,
      calculationFormula: `(${def.numeratorDescription}) / (${def.denominatorDescription}) * 100`,
      policyVersion: def.version,
    };
  }

  public getDefinition(service: SloTargetService): SloDefinition | undefined {
    return this.definitions.get(service);
  }

  public getAllDefinitions(): SloDefinition[] {
    return Array.from(this.definitions.values());
  }
}

export const sliSloCalculator = new SliSloCalculator();
