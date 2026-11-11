// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.7: INDUSTRIAL HEALTH ENGINE
// Deterministic Health Evaluation, Flapping Protection (Hysteresis), and Verifiable Evidence
// Standards: IEC 62443, NIST SP 800-82 Rev. 3, ISO 13374 (Condition Monitoring)
// =============================================================================

import type { ComponentHealthSnapshot, ComponentType, HealthSeverity, HealthState } from "./types";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "./types";

export interface HealthThresholdProfile {
  version: string;
  heartbeatTimeoutMs: number; // Ex: 30000ms
  cpuWarningPercent: number; // Ex: 80%
  cpuCriticalPercent: number; // Ex: 95%
  memoryWarningPercent: number; // Ex: 85%
  memoryCriticalPercent: number; // Ex: 95%
  diskWarningPercent: number; // Ex: 85%
  diskCriticalPercent: number; // Ex: 92%
  maxClockDriftMs: number; // Ex: 1000ms
  maxApiLatencyWarningMs: number; // Ex: 1500ms
  maxApiLatencyCriticalMs: number; // Ex: 5000ms
  maxStaleDataAgeMs: number; // Ex: 30000ms
  hysteresisConsecutiveOkRequired: number; // Número de medições boas seguidas para sair de DEGRADED/UNAVAILABLE
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholdProfile = {
  version: "3.7.0-industrial-standard",
  heartbeatTimeoutMs: 30_000,
  cpuWarningPercent: 80.0,
  cpuCriticalPercent: 95.0,
  memoryWarningPercent: 85.0,
  memoryCriticalPercent: 95.0,
  diskWarningPercent: 85.0,
  diskCriticalPercent: 92.0,
  maxClockDriftMs: 1_000,
  maxApiLatencyWarningMs: 1_500,
  maxApiLatencyCriticalMs: 5_000,
  maxStaleDataAgeMs: 30_000,
  hysteresisConsecutiveOkRequired: 3,
};

export interface RegisteredMaintenanceWindow {
  componentId: string;
  authorizedBy: string;
  reason: string;
  startTime: number;
  endTime: number;
  ticketId: string;
}

export class IndustrialHealthEngine {
  private snapshots: Map<string, ComponentHealthSnapshot> = new Map();
  private consecutiveOkCounts: Map<string, number> = new Map();
  private stateHistory: Map<string, HealthState[]> = new Map();
  private maintenanceWindows: Map<string, RegisteredMaintenanceWindow> = new Map();
  private thresholds: HealthThresholdProfile;

  constructor(thresholds: HealthThresholdProfile = DEFAULT_HEALTH_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  /**
   * Registra formalmente uma janela de manutenção preventiva ou corretiva autorizada.
   */
  public registerMaintenanceWindow(window: RegisteredMaintenanceWindow): void {
    this.maintenanceWindows.set(window.componentId, window);
  }

  public clearMaintenanceWindow(componentId: string): void {
    this.maintenanceWindows.delete(componentId);
  }

  /**
   * Avalia a saúde de um serviço Cloud (API, Server Function, Database).
   */
  public evaluateCloudService(params: {
    serviceId: string;
    tenantId: string;
    plantId: string;
    endpoint: string;
    isHttpAvailable: boolean;
    httpStatusCode?: number;
    latencyMs: number;
    dbPingSuccess: boolean;
    dbLatencyMs?: number;
    externalDependencyFailure?: boolean; // Ex: Gemini API ou Stripe fora
  }): ComponentHealthSnapshot {
    const now = Date.now();
    const componentId = params.serviceId;

    // 1. Verificação de Manutenção Registrada
    const maint = this.checkActiveMaintenance(componentId, now);
    if (maint) {
      return this.commitSnapshot({
        componentId,
        componentType: "CLOUD_SERVICE",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: now,
        state: "MAINTENANCE",
        severity: "INFO",
        reasonCode: "PLANNED_MAINTENANCE",
        evidenceReference: `Ticket ${maint.ticketId} autorizado por ${maint.authorizedBy}: ${maint.reason}`,
        source: "HEALTH_PROBE",
        metricValues: { latencyMs: params.latencyMs, status: params.httpStatusCode ?? 200 },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 2. Falha de Banco de Dados Crítico
    if (!params.dbPingSuccess) {
      return this.commitSnapshot({
        componentId,
        componentType: "CLOUD_DATABASE",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: null,
        state: "UNAVAILABLE",
        severity: "CRITICAL",
        reasonCode: "DATABASE_CONNECTION_LOST",
        evidenceReference: `Falha de conexão com banco de dados Supabase/PostgreSQL. Ping falhou.`,
        source: "HEALTH_PROBE",
        metricValues: { dbPingSuccess: false, latencyMs: params.latencyMs },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 3. Falha HTTP 5xx
    if (!params.isHttpAvailable || (params.httpStatusCode && params.httpStatusCode >= 500)) {
      return this.commitSnapshot({
        componentId,
        componentType: "CLOUD_API",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: null,
        state: "UNAVAILABLE",
        severity: "HIGH",
        reasonCode: "HTTP_5XX_OUTAGE",
        evidenceReference: `Servidor retornou código HTTP ${params.httpStatusCode || 503}.`,
        source: "HEALTH_PROBE",
        metricValues: {
          httpStatusCode: params.httpStatusCode ?? null,
          latencyMs: params.latencyMs,
        },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 4. Distinção de falha de dependência externa (ex: API de IA terceirizada)
    if (params.externalDependencyFailure) {
      return this.commitSnapshot({
        componentId,
        componentType: "CLOUD_AI_SERVICE",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: now,
        state: "DEGRADED",
        severity: "MEDIUM",
        reasonCode: "EXTERNAL_DEPENDENCY_DEGRADED",
        evidenceReference:
          "Serviço Cloud operacional, porém dependência externa upstream reportou indisponibilidade.",
        source: "HEALTH_PROBE",
        metricValues: { externalDependencyFailure: true, latencyMs: params.latencyMs },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 5. Latência Degradada
    if (params.latencyMs >= this.thresholds.maxApiLatencyCriticalMs) {
      return this.commitSnapshot({
        componentId,
        componentType: "CLOUD_API",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: now,
        state: "DEGRADED",
        severity: "HIGH",
        reasonCode: "LATENCY_CRITICAL",
        evidenceReference: `Latência de ${params.latencyMs}ms excedeu limite crítico de ${this.thresholds.maxApiLatencyCriticalMs}ms.`,
        source: "HEALTH_PROBE",
        metricValues: { latencyMs: params.latencyMs },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    if (params.latencyMs >= this.thresholds.maxApiLatencyWarningMs) {
      return this.commitSnapshot({
        componentId,
        componentType: "CLOUD_API",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: now,
        state: "DEGRADED",
        severity: "MEDIUM",
        reasonCode: "LATENCY_HIGH",
        evidenceReference: `Latência de ${params.latencyMs}ms excedeu patamar de aviso (${this.thresholds.maxApiLatencyWarningMs}ms).`,
        source: "HEALTH_PROBE",
        metricValues: { latencyMs: params.latencyMs },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 6. Saudável com histerese
    return this.applyHysteresisRecovery(
      componentId,
      "CLOUD_SERVICE",
      params.tenantId,
      params.plantId,
      now,
      {
        latencyMs: params.latencyMs,
        httpStatusCode: params.httpStatusCode ?? 200,
      },
    );
  }

  /**
   * Avalia a saúde de um Edge Gateway com telemetria de hardware e heartbeat.
   */
  public evaluateEdgeGateway(params: {
    gatewayId: string;
    tenantId: string;
    plantId: string;
    lastHeartbeatTimestamp: number | null;
    isInstrumented: boolean;
    cpuPercent?: number | null;
    memoryPercent?: number | null;
    diskPercent?: number | null;
    walSizeBytes?: number;
    pendingSamplesCount?: number;
    oldestSampleTimestampMs?: number | null;
    clockDriftMs?: number | null;
    isCertificateRevoked?: boolean;
    isCertificateExpired?: boolean;
  }): ComponentHealthSnapshot {
    const now = Date.now();
    const componentId = params.gatewayId;

    // 1. Manutenção registrada
    const maint = this.checkActiveMaintenance(componentId, now);
    if (maint) {
      return this.commitSnapshot({
        componentId,
        componentType: "EDGE_GATEWAY",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.lastHeartbeatTimestamp,
        state: "MAINTENANCE",
        severity: "INFO",
        reasonCode: "GATEWAY_IN_MAINTENANCE",
        evidenceReference: `Manutenção programada: ${maint.reason} (Ticket ${maint.ticketId})`,
        source: "HEARTBEAT",
        metricValues: { isMaintenance: true },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 2. Não instrumentado (sistema embarcado legado ou SO restrito)
    if (!params.isInstrumented) {
      return this.commitSnapshot({
        componentId,
        componentType: "EDGE_GATEWAY",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.lastHeartbeatTimestamp,
        state: "NOT_INSTRUMENTED",
        severity: "LOW",
        reasonCode: "HARDWARE_METRICS_UNAVAILABLE",
        evidenceReference:
          "Agente Edge em execução, porém métricas de SO (CPU/Memória) não são expostas pelo host.",
        source: "HEARTBEAT",
        metricValues: { isInstrumented: false },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 3. Ausência de Observações anteriores
    if (!params.lastHeartbeatTimestamp) {
      return this.commitSnapshot({
        componentId,
        componentType: "EDGE_GATEWAY",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: null,
        state: "UNKNOWN",
        severity: "MEDIUM",
        reasonCode: "NO_OBSERVATIONS_YET",
        evidenceReference: "Nenhum sinal de heartbeat jamais recebido deste gateway.",
        source: "HEARTBEAT",
        metricValues: { heartbeatAgeMs: null },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 4. Timeout de Heartbeat (Gateway Offline / Indisponível)
    const heartbeatAgeMs = now - params.lastHeartbeatTimestamp;
    if (heartbeatAgeMs > this.thresholds.heartbeatTimeoutMs) {
      return this.commitSnapshot({
        componentId,
        componentType: "EDGE_GATEWAY",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.lastHeartbeatTimestamp,
        state: "UNAVAILABLE",
        severity: "CRITICAL",
        reasonCode: "HEARTBEAT_TIMEOUT",
        evidenceReference: `Último sinal recebido há ${Math.round(heartbeatAgeMs / 1000)}s (limite máximo: ${this.thresholds.heartbeatTimeoutMs / 1000}s).`,
        source: "HEARTBEAT",
        metricValues: { heartbeatAgeMs },
        evaluationWindowMs: this.thresholds.heartbeatTimeoutMs,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 5. Certificado revogado ou expirado (Segurança / Bloqueio)
    if (params.isCertificateRevoked) {
      return this.commitSnapshot({
        componentId,
        componentType: "EDGE_GATEWAY",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.lastHeartbeatTimestamp,
        state: "UNAVAILABLE",
        severity: "CRITICAL",
        reasonCode: "CERTIFICATE_REVOKED",
        evidenceReference: "Certificado mTLS do gateway revogado pela autoridade de segurança.",
        source: "SECURITY_AUDIT",
        metricValues: { isRevoked: true },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    if (params.isCertificateExpired) {
      return this.commitSnapshot({
        componentId,
        componentType: "EDGE_GATEWAY",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.lastHeartbeatTimestamp,
        state: "DEGRADED",
        severity: "HIGH",
        reasonCode: "CERTIFICATE_EXPIRED",
        evidenceReference: "Certificado mTLS expirado. Renovação mandatória necessária.",
        source: "SECURITY_AUDIT",
        metricValues: { isExpired: true },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 6. Recursos de Hardware em saturação crítica
    if (
      params.diskPercent !== null &&
      params.diskPercent !== undefined &&
      params.diskPercent >= this.thresholds.diskCriticalPercent
    ) {
      return this.commitSnapshot({
        componentId,
        componentType: "EDGE_GATEWAY",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.lastHeartbeatTimestamp,
        state: "DEGRADED",
        severity: "HIGH",
        reasonCode: "DISK_CRITICAL_SATURATION",
        evidenceReference: `Ocupação de disco em ${params.diskPercent}% (limite crítico: ${this.thresholds.diskCriticalPercent}%). Risco de corrupção WAL.`,
        source: "HEARTBEAT",
        metricValues: { diskPercent: params.diskPercent, walSizeBytes: params.walSizeBytes ?? 0 },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    if (
      params.memoryPercent !== null &&
      params.memoryPercent !== undefined &&
      params.memoryPercent >= this.thresholds.memoryCriticalPercent
    ) {
      return this.commitSnapshot({
        componentId,
        componentType: "EDGE_GATEWAY",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.lastHeartbeatTimestamp,
        state: "DEGRADED",
        severity: "HIGH",
        reasonCode: "MEMORY_CRITICAL_SATURATION",
        evidenceReference: `Uso de memória RAM em ${params.memoryPercent}% (limite crítico: ${this.thresholds.memoryCriticalPercent}%).`,
        source: "HEARTBEAT",
        metricValues: { memoryPercent: params.memoryPercent },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 7. Desvio de Relógio (Clock Drift)
    if (
      params.clockDriftMs !== null &&
      params.clockDriftMs !== undefined &&
      Math.abs(params.clockDriftMs) > this.thresholds.maxClockDriftMs
    ) {
      return this.commitSnapshot({
        componentId,
        componentType: "EDGE_GATEWAY",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.lastHeartbeatTimestamp,
        state: "DEGRADED",
        severity: "MEDIUM",
        reasonCode: "CLOCK_DRIFT_EXCEEDED",
        evidenceReference: `Desvio de relógio local de ${Math.abs(params.clockDriftMs)}ms em relação ao NTP Cloud (tolerância: ${this.thresholds.maxClockDriftMs}ms).`,
        source: "HEARTBEAT",
        metricValues: { clockDriftMs: params.clockDriftMs },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // 8. Saudável
    return this.applyHysteresisRecovery(
      componentId,
      "EDGE_GATEWAY",
      params.tenantId,
      params.plantId,
      now,
      {
        cpuPercent: params.cpuPercent,
        memoryPercent: params.memoryPercent,
        diskPercent: params.diskPercent,
        heartbeatAgeMs,
      },
    );
  }

  /**
   * Avalia a conectividade e saúde de uma fonte de protocolo industrial.
   */
  public evaluateProtocolSource(params: {
    sourceId: string;
    protocol: "MODBUS_TCP" | "OPC_UA" | "MQTT_SPARKPLUG";
    tenantId: string;
    plantId: string;
    isConnected: boolean;
    timeoutCount: number;
    badStatusCount?: number;
    lastError?: string;
    reconnectCount: number;
    responseTimeMs?: number;
  }): ComponentHealthSnapshot {
    const now = Date.now();
    const componentId = params.sourceId;
    const compType: ComponentType =
      params.protocol === "MODBUS_TCP"
        ? "PROTOCOL_MODBUS_TCP"
        : params.protocol === "OPC_UA"
          ? "PROTOCOL_OPC_UA"
          : "PROTOCOL_MQTT_SPARKPLUG";

    if (!params.isConnected) {
      return this.commitSnapshot({
        componentId,
        componentType: compType,
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: null,
        state: "UNAVAILABLE",
        severity: "CRITICAL",
        reasonCode: "PROTOCOL_DISCONNECTED",
        evidenceReference: `Canal de comunicação ${params.protocol} offline. Erro: ${params.lastError || "Conexão rejeitada ou timeout"}.`,
        source: "HEALTH_PROBE",
        metricValues: {
          isConnected: false,
          reconnectCount: params.reconnectCount,
          timeoutCount: params.timeoutCount,
        },
        evaluationWindowMs: 30_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    if (params.timeoutCount > 5 || (params.badStatusCount && params.badStatusCount > 10)) {
      return this.commitSnapshot({
        componentId,
        componentType: compType,
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: now,
        state: "DEGRADED",
        severity: "HIGH",
        reasonCode: "PROTOCOL_ERRORS_HIGH",
        evidenceReference: `Canal ${params.protocol} conectado, mas registrou ${params.timeoutCount} timeouts e ${params.badStatusCount || 0} status codes anormais.`,
        source: "HEALTH_PROBE",
        metricValues: {
          timeoutCount: params.timeoutCount,
          badStatusCount: params.badStatusCount ?? 0,
          responseTimeMs: params.responseTimeMs ?? 0,
        },
        evaluationWindowMs: 30_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    return this.applyHysteresisRecovery(
      componentId,
      compType,
      params.tenantId,
      params.plantId,
      now,
      {
        isConnected: true,
        reconnectCount: params.reconnectCount,
        responseTimeMs: params.responseTimeMs ?? 0,
      },
    );
  }

  /**
   * Avalia a saúde de uma tag ou equipamento diferenciando dado estático (deadband) de falha real (STALE_DATA).
   */
  public evaluateEquipmentTagHealth(params: {
    tagId: string;
    tenantId: string;
    plantId: string;
    sourceTimestamp: number | null;
    ingestionTimestamp: number | null;
    isSourceConnected: boolean;
    scanRateMs: number;
    isDeadbandSuppressed: boolean;
    sampleQuality: "GOOD" | "BAD" | "UNCERTAIN" | "STALE" | "NOT_CONNECTED";
  }): ComponentHealthSnapshot {
    const now = Date.now();
    const componentId = params.tagId;

    if (!params.isSourceConnected || params.sampleQuality === "NOT_CONNECTED") {
      return this.commitSnapshot({
        componentId,
        componentType: "INDUSTRIAL_EQUIPMENT",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.sourceTimestamp,
        state: "UNAVAILABLE",
        severity: "HIGH",
        reasonCode: "TAG_SOURCE_DISCONNECTED",
        evidenceReference: "A fonte física de telemetria desta tag encontra-se desconectada.",
        source: "TELEMETRY_PIPELINE",
        metricValues: { quality: params.sampleQuality },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    if (params.sampleQuality === "BAD") {
      return this.commitSnapshot({
        componentId,
        componentType: "INDUSTRIAL_EQUIPMENT",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.sourceTimestamp,
        state: "DEGRADED",
        severity: "HIGH",
        reasonCode: "TAG_QUALITY_BAD",
        evidenceReference:
          "Amostra recebida com qualidade BAD (falha no sensor ou erro de conversão analógica).",
        source: "TELEMETRY_PIPELINE",
        metricValues: { quality: "BAD" },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // Distinção mandatória: se o valor não mudou mas está dentro da deadband, NÃO é falha!
    if (params.isDeadbandSuppressed) {
      return this.commitSnapshot({
        componentId,
        componentType: "INDUSTRIAL_EQUIPMENT",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.sourceTimestamp,
        state: "HEALTHY",
        severity: "INFO",
        reasonCode: "DEADBAND_UNCHANGED",
        evidenceReference:
          "Valor estável dentro da faixa de histerese/deadband configurada. Equipamento saudável.",
        source: "TELEMETRY_PIPELINE",
        metricValues: { deadbandSuppressed: true },
        evaluationWindowMs: 60_000,
        thresholdVersion: this.thresholds.version,
      });
    }

    // Atraso real superior a 3x scanRate sem deadband
    const expectedIntervalMs = Math.max(params.scanRateMs * 3, this.thresholds.maxStaleDataAgeMs);
    const dataAgeMs = params.sourceTimestamp ? now - params.sourceTimestamp : null;

    if (dataAgeMs !== null && dataAgeMs > expectedIntervalMs) {
      return this.commitSnapshot({
        componentId,
        componentType: "INDUSTRIAL_EQUIPMENT",
        tenantId: params.tenantId,
        plantId: params.plantId,
        observedAt: now,
        lastSuccessfulObservationAt: params.sourceTimestamp,
        state: "DEGRADED",
        severity: "MEDIUM",
        reasonCode: "STALE_DATA_TIMEOUT",
        evidenceReference: `Dado atrasado há ${Math.round(dataAgeMs / 1000)}s (tolerância para scan rate de ${params.scanRateMs}ms é ${Math.round(expectedIntervalMs / 1000)}s).`,
        source: "TELEMETRY_PIPELINE",
        metricValues: { dataAgeMs, scanRateMs: params.scanRateMs },
        evaluationWindowMs: expectedIntervalMs,
        thresholdVersion: this.thresholds.version,
      });
    }

    return this.applyHysteresisRecovery(
      componentId,
      "INDUSTRIAL_EQUIPMENT",
      params.tenantId,
      params.plantId,
      now,
      {
        quality: params.sampleQuality,
        dataAgeMs,
      },
    );
  }

  /**
   * Aplica histerese para recuperação: exige N medições saudáveis consecutivas
   * para sair de DEGRADED/UNAVAILABLE, prevenindo oscilação descontrolada (flapping).
   */
  private applyHysteresisRecovery(
    componentId: string,
    componentType: ComponentType,
    tenantId: string,
    plantId: string,
    observedAt: number,
    metricValues: Record<string, unknown>,
  ): ComponentHealthSnapshot {
    const prev = this.snapshots.get(componentId);
    const currentOkCount = (this.consecutiveOkCounts.get(componentId) ?? 0) + 1;
    this.consecutiveOkCounts.set(componentId, currentOkCount);

    // Se estava DEGRADED ou UNAVAILABLE e ainda não atingiu o limiar de histerese
    if (prev && (prev.state === "DEGRADED" || prev.state === "UNAVAILABLE")) {
      if (currentOkCount < this.thresholds.hysteresisConsecutiveOkRequired) {
        return this.commitSnapshot({
          componentId,
          componentType,
          tenantId,
          plantId,
          observedAt,
          lastSuccessfulObservationAt: observedAt,
          state: prev.state, // Mantém estado anterior até atingir histerese
          severity: prev.severity,
          reasonCode: "HYSTERESIS_STABILIZING",
          evidenceReference: `Recuperação em progresso: ${currentOkCount}/${this.thresholds.hysteresisConsecutiveOkRequired} amostras saudáveis consecutivas.`,
          source: "HEALTH_PROBE",
          metricValues: { ...metricValues, currentOkCount },
          evaluationWindowMs: 60_000,
          thresholdVersion: this.thresholds.version,
          flappingDetected: true,
        });
      }
    }

    return this.commitSnapshot({
      componentId,
      componentType,
      tenantId,
      plantId,
      observedAt,
      lastSuccessfulObservationAt: observedAt,
      state: "HEALTHY",
      severity: "INFO",
      reasonCode: "NOMINAL_OPERATION",
      evidenceReference: `Todas as métricas verificadas dentro das tolerâncias operacionais (${this.thresholds.version}).`,
      source: "HEALTH_PROBE",
      metricValues: metricValues as any,
      evaluationWindowMs: 60_000,
      thresholdVersion: this.thresholds.version,
    });
  }

  private checkActiveMaintenance(
    componentId: string,
    now: number,
  ): RegisteredMaintenanceWindow | null {
    const window = this.maintenanceWindows.get(componentId);
    if (!window) return null;
    if (now >= window.startTime && now <= window.endTime) {
      return window;
    }
    if (now > window.endTime) {
      this.maintenanceWindows.delete(componentId);
    }
    return null;
  }

  private commitSnapshot(snapshot: ComponentHealthSnapshot): ComponentHealthSnapshot {
    this.snapshots.set(snapshot.componentId, snapshot);

    // Histórico de estados para auditoria
    const hist = this.stateHistory.get(snapshot.componentId) ?? [];
    hist.push(snapshot.state);
    if (hist.length > 20) hist.shift();
    this.stateHistory.set(snapshot.componentId, hist);

    return snapshot;
  }

  public getSnapshot(componentId: string): ComponentHealthSnapshot | undefined {
    return this.snapshots.get(componentId);
  }

  public getAllSnapshots(filter?: {
    tenantId?: string;
    plantId?: string;
  }): ComponentHealthSnapshot[] {
    let list = Array.from(this.snapshots.values());
    if (filter?.tenantId) {
      list = list.filter((s) => s.tenantId === filter.tenantId);
    }
    if (filter?.plantId) {
      list = list.filter((s) => s.plantId === filter.plantId);
    }
    return list;
  }

  public clear(): void {
    this.snapshots.clear();
    this.consecutiveOkCounts.clear();
    this.stateHistory.clear();
    this.maintenanceWindows.clear();
  }
}

export const industrialHealthEngine = new IndustrialHealthEngine();
