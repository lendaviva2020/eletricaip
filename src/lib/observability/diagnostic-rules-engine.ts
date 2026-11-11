// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.8: DETERMINISTIC DIAGNOSTIC RULES ENGINE
// Phase 3: 30 Explainable Rule-Based Industrial Diagnostics & Evidence Evaluation
// Standards: ISA-95, IEC 62443, Gate 3.8 Deterministic First Architecture
// =============================================================================

import type {
  ConfidenceMethod,
  DeterministicDiagnosticRecord,
  DiagnosticRuleId,
  DiagnosticStatus,
} from "./types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "./types";

export interface DiagnosticEvaluationContext {
  tenantId: string;
  plantId: string;
  primaryComponent: string;
  affectedComponents?: string[];
  incidentId?: string;
  observedAt: number;
  evidenceReferences: string[];
  // Sinais determinísticos observados
  gatewayOnline?: boolean;
  cloudIngestionActive?: boolean;
  industrialSourceAvailable?: boolean;
  modbusTimeoutCount?: number;
  opcUaSessionLost?: boolean;
  mqttBrokerConnected?: boolean;
  certificateExpired?: boolean;
  certificateRevoked?: boolean;
  certFailureOnReconnect?: boolean;
  outboxBufferedRecords?: number;
  syncHalted?: boolean;
  edgeDiskUsagePercent?: number;
  sqliteWriteError?: boolean;
  cloudAvailable?: boolean;
  edgeAutonomousActive?: boolean;
  databaseAvailable?: boolean;
  cloudAppError?: boolean;
  historianWriting?: boolean;
  scadaRealtimeActive?: boolean;
  dataLagMs?: number;
  sequenceGapCount?: number;
  duplicateMessagesCount?: number;
  outOfOrderMessagesCount?: number;
  clockDriftMs?: number;
  persistentBadQuality?: boolean;
  sourceStateUnknown?: boolean;
  tagStale?: boolean;
  deadbandActiveNoChange?: boolean;
  acquisitionInterrupted?: boolean;
  lastValuePreserved?: boolean;
  deadbandKeepAliveTimestampUpdated?: boolean;
  scanRateMs?: number;
  lastSampleAgeMs?: number;
  contradictoryEvidenceDetected?: boolean;
  topologicalPathOnlyWithoutOriginFailure?: boolean;
  syncFailedAfterEdgeUpdate?: boolean;
  gatewayCpuPercent?: number;
  gatewayMemoryPercent?: number;
  gatewayAuthFailed?: boolean;
  crossTenantAccessAttempted?: boolean;
  historicalQueryFailed?: boolean;
  observabilityServiceInterrupted?: boolean;
  temporalProximityOnly?: boolean;
}

const RULE_VERSION = "3.8.1-deterministic";

export class DeterministicDiagnosticEngine {
  private diagnosticsByTenant: Map<string, DeterministicDiagnosticRecord[]> = new Map();

  private createRecord(params: {
    ctx: DiagnosticEvaluationContext;
    ruleId: DiagnosticRuleId;
    observedConditions: string[];
    expectedConditions: string[];
    missingInformation: string[];
    hypothesis: string;
    confidence: number;
    confidenceMethod: ConfidenceMethod;
    diagnosticStatus: DiagnosticStatus;
    recommendedRunbookIds: string[];
  }): DeterministicDiagnosticRecord {
    const { ctx } = params;
    // Regras inegociáveis (Gate 3.8 & 3.8.1):
    // 1. Evidências contraditórias rebaixam para INCONCLUSIVE
    // 2. Proximidade temporal isolada ou caminho topológico sem falha na origem NUNCA produzem CONFIRMED_BY_EVIDENCE
    let effectiveStatus: DiagnosticStatus = params.diagnosticStatus;
    let effectiveMethod: ConfidenceMethod = params.confidenceMethod;

    if (ctx.contradictoryEvidenceDetected) {
      effectiveStatus = "INCONCLUSIVE";
      effectiveMethod = "INSUFFICIENT_TELEMETRY";
    } else if (
      (ctx.temporalProximityOnly || ctx.topologicalPathOnlyWithoutOriginFailure) &&
      params.diagnosticStatus === "CONFIRMED_BY_EVIDENCE"
    ) {
      effectiveStatus = "SUSPECTED";
      effectiveMethod = ctx.temporalProximityOnly
        ? "TEMPORAL_PROXIMITY_ONLY_INSUFFICIENT"
        : "TOPOLOGICAL_DEPENDENCY_VERIFICATION";
    }

    const record: DeterministicDiagnosticRecord = {
      diagnosticId: `diag_${ctx.tenantId}_${params.ruleId}_${ctx.primaryComponent}_${ctx.observedAt}`,
      ruleId: params.ruleId,
      ruleVersion: RULE_VERSION,
      incidentId: ctx.incidentId,
      tenantId: ctx.tenantId,
      plantId: ctx.plantId,
      primaryComponent: ctx.primaryComponent,
      affectedComponents: ctx.affectedComponents ?? [ctx.primaryComponent],
      evidenceReferences:
        ctx.evidenceReferences.length > 0
          ? ctx.evidenceReferences
          : [`ev_${ctx.primaryComponent}_${ctx.observedAt}`],
      observedConditions: params.observedConditions,
      expectedConditions: params.expectedConditions,
      missingInformation: params.missingInformation,
      hypothesis: params.hypothesis,
      confidence: params.confidence,
      confidenceMethod: effectiveMethod,
      createdAt: ctx.observedAt,
      diagnosticStatus: effectiveStatus,
      recommendedRunbookIds: params.recommendedRunbookIds,
    };

    const list = this.diagnosticsByTenant.get(ctx.tenantId) ?? [];
    list.push(record);
    this.diagnosticsByTenant.set(ctx.tenantId, list);
    return record;
  }

  /**
   * Avalia o contexto operacional contra as 30 regras determinísticas obrigatórias da Fase 3.
   */
  public evaluate(ctx: DiagnosticEvaluationContext): DeterministicDiagnosticRecord[] {
    if (!ctx.tenantId || !ctx.plantId || !ctx.primaryComponent) {
      throw new Error(
        "INVALID_DIAGNOSTIC_CONTEXT: tenantId, plantId e primaryComponent são obrigatórios.",
      );
    }

    const results: DeterministicDiagnosticRecord[] = [];

    const isCommunicationAndAcquisitionHealthy =
      ctx.gatewayOnline !== false &&
      ctx.industrialSourceAvailable !== false &&
      ctx.acquisitionInterrupted !== true;

    const isSlowScanWithinExpectedWindow =
      ctx.scanRateMs !== undefined &&
      ctx.lastSampleAgeMs !== undefined &&
      ctx.lastSampleAgeMs <= ctx.scanRateMs * 1.5;

    // REGRA 23 (Verificação prioritária de falso positivo):
    // Deadband ativo sem variação de valor OU política de scan lento dentro da janela esperada,
    // SOMENTE quando a comunicação do gateway e a aquisição na fonte estiverem comprovadamente saudáveis!
    if (
      (ctx.deadbandActiveNoChange === true || isSlowScanWithinExpectedWindow) &&
      isCommunicationAndAcquisitionHealthy
    ) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_23_DEADBAND_NO_CHANGE_HEALTHY",
          observedConditions: [
            ctx.deadbandActiveNoChange
              ? "Deadband configurado e ativo na tag/equipamento"
              : `Política de aquisição lenta ativa (scanRate=${ctx.scanRateMs}ms, age=${ctx.lastSampleAgeMs}ms)`,
            "Sinal físico estável / dentro da janela esperada",
            "Heartbeat do gateway e sessão de aquisição de protocolo saudáveis",
          ],
          expectedConditions: [
            "Ausência de transmissão de novas amostras enquanto a variação for inferior ao deadband ou dentro do ciclo de scan",
          ],
          missingInformation: [],
          hypothesis:
            "Comportamento normal por deadband ativo ou janela de scan lento com comunicação saudável. Não classificar como falha ou tag STALE.",
          confidence: 0.99,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "RESOLVED",
          recommendedRunbookIds: ["RB_DATA_QUALITY_DEADBAND_VERIFY"],
        }),
      );
    }

    // REGRA 01: Gateway offline + ausência de ingestão
    if (ctx.gatewayOnline === false && ctx.cloudIngestionActive === false) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_01_GATEWAY_OFFLINE_INGESTION_HALT",
          observedConditions: [
            "Edge Gateway sem heartbeat ativo (OFFLINE)",
            "Ingestão de telemetria na Cloud interrompida para a planta/gateway",
          ],
          expectedConditions: [
            "Heartbeat contínuo do Edge Gateway <= 30s",
            "Fluxo regular de ingestão de pacotes assinados",
          ],
          missingInformation: [
            "Status elétrico local do painel do Edge Gateway",
            "Link WAN local na planta",
          ],
          hypothesis: "Perda de conectividade WAN ou falha elétrica/operacional do Edge Gateway.",
          confidence: 0.95,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_EDGE_OFFLINE_RECOVERY", "RB_SYNC_OUTBOX_DRAIN"],
        }),
      );
    }

    // REGRA 02: Gateway online + fonte indisponível
    if (ctx.gatewayOnline === true && ctx.industrialSourceAvailable === false) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_02_GATEWAY_ONLINE_SOURCE_UNAVAILABLE",
          observedConditions: [
            "Edge Gateway online com telemetria de saúde normal",
            "Fonte física industrial (PLC/Inversor/Medidor) sem resposta na rede OT",
          ],
          expectedConditions: [
            "Fonte industrial respondendo aos ciclos de polling dentro do timeout nominal",
          ],
          missingInformation: ["Estado físico do disjuntor/alimentação do PLC ou switch OT local"],
          hypothesis:
            "Falha na fonte industrial ou interrupção na rede local OT entre o Edge e o equipamento.",
          confidence: 0.93,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_MODBUS_TIMEOUT_DIAGNOSIS", "RB_OPCUA_SESSION_RECOVERY"],
        }),
      );
    }

    // REGRA 03: Timeouts recorrentes em Modbus TCP
    if ((ctx.modbusTimeoutCount ?? 0) >= 3) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_03_MODBUS_RECURRENT_TIMEOUTS",
          observedConditions: [
            `Timeouts recorrentes em Modbus TCP (${ctx.modbusTimeoutCount} falhas consecutivas)`,
          ],
          expectedConditions: [
            "Latência de resposta Modbus TCP < 500ms com 0 timeouts consecutivos",
          ],
          missingInformation: ["Tabela de conexões TCP do dispositivo escravo Modbus"],
          hypothesis:
            "Indisponibilidade do dispositivo Modbus, porta TCP 502 bloqueada ou congestionamento na rede local OT.",
          confidence: 0.91,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_MODBUS_TIMEOUT_DIAGNOSIS"],
        }),
      );
    }

    // REGRA 04: Queda de sessão OPC UA
    if (ctx.opcUaSessionLost === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_04_OPCUA_SESSION_LOST",
          observedConditions: [
            "Sessão segura OPC UA encerrada abruptamente ou StatusCode BadSessionIdInvalid",
          ],
          expectedConditions: [
            "SecureChannel e Session OPC UA ativos com renovação automática de token",
          ],
          missingInformation: ["Log interno do servidor OPC UA no equipamento"],
          hypothesis:
            "Perda de sessão OPC UA, certificado de aplicação rejeitado ou servidor OPC UA indisponível.",
          confidence: 0.92,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_OPCUA_SESSION_RECOVERY", "RB_CERT_ROTATION_RENEWAL"],
        }),
      );
    }

    // REGRA 05: Queda de broker MQTT
    if (ctx.mqttBrokerConnected === false) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_05_MQTT_BROKER_DISCONNECTED",
          observedConditions: [
            "Cliente MQTT Sparkplug B desconectado do broker",
            "Queda de recebimento de mensagens NDATA/DDATA",
          ],
          expectedConditions: ["Conexão MQTT TLS estabelecida com Keep-Alive e STATE=ONLINE"],
          missingInformation: ["Disponibilidade do serviço do Broker MQTT externo"],
          hypothesis: "Desconexão do broker MQTT ou falha de autenticação/TLS.",
          confidence: 0.94,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_MQTT_BROKER_RECONNECT"],
        }),
      );
    }

    // REGRA 06: Certificado expirado
    if (ctx.certificateExpired === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_06_CERTIFICATE_EXPIRED",
          observedConditions: ["Certificado X.509 do componente com timestamp notAfter expirado"],
          expectedConditions: [
            "Certificado X.509 dentro da janela de validade com margem > 15 dias",
          ],
          missingInformation: [],
          hypothesis:
            "Bloqueio de comunicação mTLS/OPC UA por certificado expirado e renovação pendente.",
          confidence: 0.99,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_CERT_ROTATION_RENEWAL"],
        }),
      );
    }

    // REGRA 07: Certificado revogado
    if (ctx.certificateRevoked === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_07_CERTIFICATE_REVOKED",
          observedConditions: ["Certificado consta na lista de revogação (CRL/OCSP) da frota"],
          expectedConditions: ["Certificado ativo e não revogado"],
          missingInformation: [],
          hypothesis:
            "Gateway bloqueado por política de segurança devido a revogação explícita de certificado.",
          confidence: 1.0,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_CERT_ROTATION_RENEWAL", "RB_SECURITY_INCIDENT_RESPONSE"],
        }),
      );
    }

    // REGRA 08: Outbox crescendo + sincronização parada
    if ((ctx.outboxBufferedRecords ?? 0) > 500 && ctx.syncHalted === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_08_OUTBOX_ACCUMULATING",
          observedConditions: [
            `Fila Store-and-Forward (Outbox SQLite WAL) acumulando (${ctx.outboxBufferedRecords} registros)`,
            "Sincronização Cloud-Edge interrompida",
          ],
          expectedConditions: ["Outbox drenando continuamente com backlog próximo de zero"],
          missingInformation: ["Latência/perda de pacotes no firewall de saída da planta"],
          hypothesis:
            "Falha de envio para a Cloud ou endpoint de ingestão inacessível a partir da rede Edge.",
          confidence: 0.93,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_SYNC_OUTBOX_DRAIN", "RB_CLOUD_DEGRADATION_RESPONSE"],
        }),
      );
    }

    // REGRA 09: Disco do Edge próximo do limite
    if ((ctx.edgeDiskUsagePercent ?? 0) >= 85) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_09_EDGE_DISK_NEAR_SATURATION",
          observedConditions: [
            `Uso de armazenamento local do Edge em ${ctx.edgeDiskUsagePercent}% (>= 85%)`,
          ],
          expectedConditions: ["Uso de disco local no Edge < 75%"],
          missingInformation: [],
          hypothesis:
            "Risco iminente de saturação da capacidade de buffer local (Store-and-Forward) e logs no Edge.",
          confidence: 0.96,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_EDGE_DISK_CLEANUP_AND_WAL"],
        }),
      );
    }

    // REGRA 10: SQLite com erro de escrita
    if (ctx.sqliteWriteError === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_10_SQLITE_STORAGE_FAILURE",
          observedConditions: [
            "Falha de I/O ou SQLITE_IOERR / SQLITE_FULL reportada pelo motor de buffer",
          ],
          expectedConditions: ["Escrita transacional SQLite WAL íntegra e sem bloqueios"],
          missingInformation: ["Saúde S.M.A.R.T. da mídia física SSD/eMMC do gateway"],
          hypothesis: "Falha de armazenamento local ou corrupção de arquivo WAL no Edge Gateway.",
          confidence: 0.97,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_EDGE_DISK_CLEANUP_AND_WAL"],
        }),
      );
    }

    // REGRA 11: Cloud indisponível + Edge operando localmente
    if (ctx.cloudAvailable === false && ctx.edgeAutonomousActive === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_11_CLOUD_UNAVAILABLE_EDGE_AUTONOMOUS",
          observedConditions: [
            "Serviço Cloud indisponível para recepção",
            "Edge Gateway operando em modo autônomo com aquisição local e buffer SQLite WAL ativos",
          ],
          expectedConditions: ["Comunicação Cloud-Edge ativa"],
          missingInformation: [],
          hypothesis:
            "Indisponibilidade da camada Cloud sem perda de aquisição local no chão de fábrica.",
          confidence: 0.96,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_CLOUD_DEGRADATION_RESPONSE", "RB_SYNC_OUTBOX_DRAIN"],
        }),
      );
    }

    // REGRA 12: Cloud saudável + banco indisponível
    if (ctx.cloudAvailable === true && ctx.databaseAvailable === false) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_12_CLOUD_HEALTHY_DB_UNAVAILABLE",
          observedConditions: [
            "Workers da aplicação Cloud operacionais",
            "Conexões com o banco de dados PostgreSQL falhando ou em timeout",
          ],
          expectedConditions: ["Pool de conexões do banco respondendo < 50ms"],
          missingInformation: ["Métricas de locks e conexões ativas no cluster PostgreSQL"],
          hypothesis:
            "Falha de persistência central no banco de dados com camada de aplicação ainda ativa.",
          confidence: 0.95,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_DATABASE_CONNECTIVITY_RECOVERY"],
        }),
      );
    }

    // REGRA 13: Banco saudável + erro de aplicação
    if (ctx.databaseAvailable === true && ctx.cloudAppError === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_13_DB_HEALTHY_APP_FAILURE",
          observedConditions: [
            "Banco de dados PostgreSQL saudável e acessível",
            "Erros HTTP 5xx ou exceções de runtime nos serviços da aplicação Cloud",
          ],
          expectedConditions: ["Taxa de erro HTTP 5xx < 0.1% nos serviços Cloud"],
          missingInformation: ["Stack trace detalhado da release ou worker afetado"],
          hypothesis:
            "Falha de serviço de aplicação Cloud independente da camada de banco de dados.",
          confidence: 0.92,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_CLOUD_DEGRADATION_RESPONSE"],
        }),
      );
    }

    // REGRA 14: Historian sem gravação + SCADA recebendo tempo real
    if (ctx.historianWriting === false && ctx.scadaRealtimeActive === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_14_HISTORIAN_FAILURE_SCADA_LIVE",
          observedConditions: [
            "SCADA Web recebendo pacotes em tempo real normalmente",
            "Historian sem persistir novas séries temporais",
          ],
          expectedConditions: [
            "Gravação contínua no Historian paralela ao barramento de tempo real",
          ],
          missingInformation: ["Estado da fila de escrita em lote do Historian"],
          hypothesis:
            "Falha específica no pipeline de persistência histórica (Historian) sem queda da aquisição em tempo real.",
          confidence: 0.96,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_HISTORIAN_INGESTION_RECOVERY"],
        }),
      );
    }

    // REGRA 15: Atraso elevado de dados
    if ((ctx.dataLagMs ?? 0) > 15_000) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_15_LATE_DATA_SYNC_INTERRUPTED",
          observedConditions: [
            `Latência fim-a-fim de dados industriais elevada (${ctx.dataLagMs} ms > 15000 ms)`,
          ],
          expectedConditions: ["Freshness de telemetria <= 5000 ms"],
          missingInformation: ["Taxa de transferência de upload WAN da planta"],
          hypothesis: "Fila acumulada no pipeline de ingestão ou sincronização intermitente.",
          confidence: 0.89,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_SYNC_OUTBOX_DRAIN", "RB_SCADA_STALE_DATA_INVESTIGATION"],
        }),
      );
    }

    // REGRA 16: Lacuna de sequência
    if ((ctx.sequenceGapCount ?? 0) > 0) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_16_PIPELINE_SEQUENCE_GAP",
          observedConditions: [
            `Detectada lacuna de sequência monotônica (${ctx.sequenceGapCount} números ausentes)`,
          ],
          expectedConditions: ["Sequência numérica contínua sem saltos entre lotes"],
          missingInformation: [
            "Confirmação se os pacotes ausentes ainda estão no buffer SQLite do Edge",
          ],
          hypothesis: "Perda ou atraso de lotes no pipeline de transporte entre Edge e Cloud.",
          confidence: 0.9,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_SYNC_OUTBOX_DRAIN"],
        }),
      );
    }

    // REGRA 17: Mensagens duplicadas
    if ((ctx.duplicateMessagesCount ?? 0) > 0) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_17_DUPLICATE_MESSAGES_STORM",
          observedConditions: [
            `Recebimento de ${ctx.duplicateMessagesCount} lotes/mensagens duplicadas`,
          ],
          expectedConditions: ["Confirmação de ACK única por lote transmitido"],
          missingInformation: ["Latência de retorno do ACK HTTP/MQTT para o Edge"],
          hypothesis: "Reenvio de lote já recebido devido a timeout de confirmação ACK na rede.",
          confidence: 0.91,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_SYNC_OUTBOX_DRAIN"],
        }),
      );
    }

    // REGRA 18: Mensagens fora de ordem
    if ((ctx.outOfOrderMessagesCount ?? 0) > 0) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_18_OUT_OF_ORDER_TELEMETRY",
          observedConditions: [
            `Detectadas ${ctx.outOfOrderMessagesCount} amostras com timestamp/sequência fora de ordem`,
          ],
          expectedConditions: ["Entrega cronológica ordenada ou flag explícita de backfill"],
          missingInformation: [],
          hypothesis:
            "Reprocessamento concorrente de buffer Store-and-Forward ou atraso de roteamento de rede.",
          confidence: 0.9,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_SYNC_OUTBOX_DRAIN", "RB_HISTORIAN_INGESTION_RECOVERY"],
        }),
      );
    }

    // REGRA 19: Clock drift elevado
    if ((ctx.clockDriftMs ?? 0) > 5_000) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_19_CLOCK_DRIFT_DETECTED",
          observedConditions: [
            `Desvio de relógio (clock drift) de ${ctx.clockDriftMs} ms detectado (> 5000 ms)`,
          ],
          expectedConditions: [
            "Sincronismo NTP/PTP entre PLC, Edge Gateway e Cloud com desvio < 1000 ms",
          ],
          missingInformation: ["Status do daemon chrony/ntpd no Edge Gateway e no PLC"],
          hypothesis: "Relógio desalinhado entre a fonte industrial, o Edge Gateway ou a Cloud.",
          confidence: 0.95,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_DATA_QUALITY_CLOCK_DRIFT"],
        }),
      );
    }

    // REGRA 20: Qualidade BAD persistente
    if (ctx.persistentBadQuality === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_20_PERSISTENT_BAD_QUALITY",
          observedConditions: [
            "Qualidade da tag reportada persistentemente como BAD pela camada de aquisição",
          ],
          expectedConditions: ["Qualidade GOOD com leitura válida do registrador/nó"],
          missingInformation: ["Diagnóstico elétrico do transdutor/sensor físico em campo"],
          hypothesis:
            "Falha de leitura na origem física, circuito de medição aberto (4-20mA) ou registrador PLC em fault.",
          confidence: 0.91,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_DATA_QUALITY_BAD_SENSOR"],
        }),
      );
    }

    // REGRA 21: Qualidade UNKNOWN
    if (ctx.sourceStateUnknown === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_21_SOURCE_STATE_UNKNOWN",
          observedConditions: ["Estado do componente ou qualidade reportada como UNKNOWN"],
          expectedConditions: ["Telemetria verificável com estado explícito"],
          missingInformation: [
            "Último pacote válido da fonte",
            "Confirmação de conectividade do coletor local",
          ],
          hypothesis:
            "Ausência de evidência suficiente sobre o estado operacional real do componente.",
          confidence: 0.4,
          confidenceMethod: "INSUFFICIENT_TELEMETRY",
          diagnosticStatus: "INCONCLUSIVE",
          recommendedRunbookIds: ["RB_SCADA_STALE_DATA_INVESTIGATION"],
        }),
      );
    }

    // REGRA 22: Tag STALE (quando não houver justificativa de deadband saudável nem scan lento dentro da janela)
    const isScanWindowExceeded =
      ctx.scanRateMs !== undefined &&
      ctx.lastSampleAgeMs !== undefined &&
      ctx.lastSampleAgeMs > ctx.scanRateMs * 1.5;

    const shouldTriggerStale =
      !isSlowScanWithinExpectedWindow &&
      ((ctx.tagStale === true &&
        (!ctx.deadbandActiveNoChange || !isCommunicationAndAcquisitionHealthy)) ||
        (ctx.deadbandActiveNoChange === true && !isCommunicationAndAcquisitionHealthy) ||
        (isScanWindowExceeded && !ctx.deadbandActiveNoChange));

    if (shouldTriggerStale) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_22_TAG_STALE_NO_SAMPLES",
          observedConditions: [
            "Tag marcada como STALE por ausência de novas amostras válidas",
            !isCommunicationAndAcquisitionHealthy
              ? "Comunicação ou aquisição interrompida (valor constante em deadband não comprova saúde quando a aquisição parou)"
              : "Deadband ou política de scan não justifica a ausência de amostras",
          ],
          expectedConditions: ["Atualização periódica da tag ou confirmação de aquisição ativa"],
          missingInformation: [
            "Status da tarefa de varredura do driver de protocolo para o grupo de tags",
          ],
          hypothesis:
            "Ausência de novas amostras dentro do tempo esperado por interrupção na coleta ou pipeline.",
          confidence: 0.89,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_SCADA_STALE_DATA_INVESTIGATION"],
        }),
      );
    }

    // REGRA 24: Falha de certificado após tentativa de reconexão
    if (ctx.certFailureOnReconnect === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_24_CERT_FAILURE_ON_RECONNECT",
          observedConditions: [
            "Handshake TLS/OPC UA recusado durante tentativa de reconexão após queda",
          ],
          expectedConditions: ["Reconexão autenticada com cadeia X.509 confiável"],
          missingInformation: ["Fingerprint do certificado apresentado pelo cliente na tentativa"],
          hypothesis:
            "Credencial criptográfica expirada, revogada ou cadeia CA incorreta após tentativa de reconexão.",
          confidence: 0.95,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_CERT_ROTATION_RENEWAL"],
        }),
      );
    }

    // REGRA 25: Falha de sincronização após atualização do Edge
    if (ctx.syncFailedAfterEdgeUpdate === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_25_SYNC_FAILURE_POST_EDGE_UPDATE",
          observedConditions: [
            "Atualização recente de versão/configuração do agente Edge detectada",
            "Sincronização com a Cloud falhou imediatamente após o deploy/restart",
          ],
          expectedConditions: ["Validação pós-atualização com sincronização bem-sucedida"],
          missingInformation: ["Diff do manifesto de configuração aplicado no gateway"],
          hypothesis:
            "Incompatibilidade de versão/contrato ou regressão operacional após atualização do Edge.",
          confidence: 0.93,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_EDGE_OFFLINE_RECOVERY", "RB_SYNC_OUTBOX_DRAIN"],
        }),
      );
    }

    // REGRA 26: Alto uso de CPU/memória no gateway
    if ((ctx.gatewayCpuPercent ?? 0) >= 90 || (ctx.gatewayMemoryPercent ?? 0) >= 90) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_26_GATEWAY_RESOURCE_SATURATION",
          observedConditions: [
            `Recursos do Edge Gateway saturados (CPU: ${ctx.gatewayCpuPercent ?? 0}%, Memória: ${ctx.gatewayMemoryPercent ?? 0}%)`,
          ],
          expectedConditions: ["Uso de CPU < 75% e Memória < 80% no host do Edge Gateway"],
          missingInformation: [
            "Lista de processos locais consumindo ciclos no host Linux/Windows do Edge",
          ],
          hypothesis:
            "Sobrecarga computacional local no Edge Gateway afetando os ciclos de varredura e envio.",
          confidence: 0.92,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_EDGE_OFFLINE_RECOVERY"],
        }),
      );
    }

    // REGRA 27: Falha de autenticação de gateway
    if (ctx.gatewayAuthFailed === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_27_GATEWAY_CLOUD_AUTH_FAILURE",
          observedConditions: [
            "Rejeição de assinatura HMAC/X.509 ou token de identidade do Edge Gateway na Cloud",
          ],
          expectedConditions: ["Identidade criptográfica do gateway validada pelo Fleet Manager"],
          missingInformation: ["Origem IP da requisição rejeitada"],
          hypothesis:
            "Credencial do gateway inválida, rotacionada sem sincronismo ou bloqueada por segurança.",
          confidence: 0.96,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_SECURITY_INCIDENT_RESPONSE", "RB_CERT_ROTATION_RENEWAL"],
        }),
      );
    }

    // REGRA 28: Tentativa de acesso cross-tenant
    if (ctx.crossTenantAccessAttempted === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_28_CROSS_TENANT_ACCESS_BLOCKED",
          observedConditions: [
            "Tentativa de leitura ou operação em organização/planta distinta do escopo autenticado",
          ],
          expectedConditions: ["Acesso estritamente restrito ao tenantId autorizado pela sessão"],
          missingInformation: [],
          hypothesis:
            "Evento de segurança bloqueado preventivamente pelas políticas RLS/RBAC multi-tenant.",
          confidence: 1.0,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_SECURITY_INCIDENT_RESPONSE"],
        }),
      );
    }

    // REGRA 29: Falha de consulta histórica
    if (ctx.historicalQueryFailed === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_29_HISTORICAL_QUERY_FAILURE",
          observedConditions: [
            "Timeout ou erro na execução de query analítica de séries temporais no Historian",
          ],
          expectedConditions: ["Consultas históricas respondendo dentro do SLA (< 2000 ms)"],
          missingInformation: ["Plano de execução da query e índice de partição temporal"],
          hypothesis: "Indisponibilidade parcial ou sobrecarga de leitura no serviço Historian.",
          confidence: 0.9,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: [
            "RB_HISTORIAN_INGESTION_RECOVERY",
            "RB_DATABASE_CONNECTIVITY_RECOVERY",
          ],
        }),
      );
    }

    // REGRA 30: Falha de serviço de observabilidade
    if (ctx.observabilityServiceInterrupted === true) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_30_OBSERVABILITY_SERVICE_INTERRUPTION",
          observedConditions: [
            "Pipeline interno de coleta de métricas/logs de observabilidade com falha ou atraso",
          ],
          expectedConditions: [
            "Auto-monitoramento (meta-monitoring) do motor de observabilidade 100% operacional",
          ],
          missingInformation: ["Integridade do coletor de telemetria interna"],
          hypothesis:
            "Perda parcial de visibilidade operacional por interrupção no próprio serviço de observabilidade.",
          confidence: 0.94,
          confidenceMethod: "DIRECT_MULTI_CONDITION_PROOF",
          diagnosticStatus: "CONFIRMED_BY_EVIDENCE",
          recommendedRunbookIds: ["RB_CLOUD_DEGRADATION_RESPONSE"],
        }),
      );
    }

    // Caso nenhuma regra determinística seja acionada (dados insuficientes)
    if (results.length === 0) {
      results.push(
        this.createRecord({
          ctx,
          ruleId: "RULE_00_INSUFFICIENT_EVIDENCE",
          observedConditions: [
            "Sinais operacionais recebidos não preenchem critérios determinísticos conclusivos",
          ],
          expectedConditions: [
            "Conjunto completo de métricas de conectividade, protocolo e armazenamento",
          ],
          missingInformation: [
            "Estado detalhado do Edge Gateway",
            "Contadores de erro de protocolo (Modbus/OPC UA/MQTT)",
            "Métricas de armazenamento e sincronização Cloud",
          ],
          hypothesis:
            "Evidência insuficiente para confirmar causa raiz determinística. Mantido como inconclusivo.",
          confidence: 0.25,
          confidenceMethod: "INSUFFICIENT_TELEMETRY",
          diagnosticStatus: "INCONCLUSIVE",
          recommendedRunbookIds: ["RB_SCADA_STALE_DATA_INVESTIGATION"],
        }),
      );
    }

    return results;
  }

  public getDiagnosticsForTenant(
    tenantId: string,
    plantId?: string,
  ): DeterministicDiagnosticRecord[] {
    const list = this.diagnosticsByTenant.get(tenantId) ?? [];
    if (!plantId) return list;
    return list.filter((d) => d.plantId === plantId);
  }

  public clear(): void {
    this.diagnosticsByTenant.clear();
  }
}

export const deterministicDiagnosticEngine = new DeterministicDiagnosticEngine();
export { IS_PHYSICAL_CONTROL_ALLOWED };
