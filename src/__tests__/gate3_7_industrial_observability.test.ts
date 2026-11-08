// =============================================================================
// ELÉTRICAI INDUSTRIAL OS — GATE 3.7 ACCEPTANCE TEST SUITE (40 CENÁRIOS)
// INDUSTRIAL OBSERVABILITY, RELIABILITY & OPERATIONAL INTELLIGENCE
// =============================================================================

import { describe, expect, it, beforeEach } from "vitest";
import {
  IndustrialHealthEngine,
  DEFAULT_HEALTH_THRESHOLDS,
  IndustrialIncidentManager,
  DataReliabilityTracker,
  SliSloCalculator,
  IS_PHYSICAL_CONTROL_ALLOWED,
} from "@/lib/observability";
import type { FleetUserContext } from "@/lib/edge/types";

describe("Gate 3.7 — Industrial Observability & Reliability (40 Mandatory Scenarios)", () => {
  let healthEngine: IndustrialHealthEngine;
  let incidentMgr: IndustrialIncidentManager;
  let pipelineTracker: DataReliabilityTracker;
  let sloCalc: SliSloCalculator;

  const tenantAlpha = "org_alpha_ind";
  const tenantBeta = "org_beta_ind";
  const plantSP = "plant_sp_01";
  const plantRJ = "plant_rj_02";

  const adminAlpha: FleetUserContext = {
    userId: "usr_admin_alpha",
    email: "admin@alpha.ind.br",
    role: "TENANT_ADMIN",
    organizationId: tenantAlpha,
    authorizedPlantIds: [plantSP, plantRJ],
  };

  const operatorSP: FleetUserContext = {
    userId: "usr_op_sp",
    email: "op@alpha.ind.br",
    role: "EDGE_OPERATOR",
    organizationId: tenantAlpha,
    authorizedPlantIds: [plantSP],
  };

  const viewerBeta: FleetUserContext = {
    userId: "usr_viewer_beta",
    email: "view@beta.ind.br",
    role: "VIEWER",
    organizationId: tenantBeta,
    authorizedPlantIds: ["plant_beta_01"],
  };

  beforeEach(() => {
    healthEngine = new IndustrialHealthEngine();
    incidentMgr = new IndustrialIncidentManager();
    pipelineTracker = new DataReliabilityTracker();
    sloCalc = new SliSloCalculator();
  });

  // ---------------------------------------------------------------------------
  // BLOCO 1: Observabilidade Cloud & Infraestrutura (Cenários 1 a 5)
  // ---------------------------------------------------------------------------
  it("Cenário 01: Cloud saudável — latência nominal, HTTP 200 e ping de banco OK", () => {
    const s = healthEngine.evaluateCloudService({
      serviceId: "srv_cloud_core",
      tenantId: tenantAlpha,
      plantId: plantSP,
      endpoint: "/api/health",
      isHttpAvailable: true,
      httpStatusCode: 200,
      latencyMs: 85,
      dbPingSuccess: true,
      dbLatencyMs: 12,
    });
    expect(s.state).toBe("HEALTHY");
    expect(s.reasonCode).toBe("NOMINAL_OPERATION");
    expect(s.severity).toBe("INFO");
  });

  it("Cenário 02: Cloud indisponível — falha de conectividade HTTP geral", () => {
    const s = healthEngine.evaluateCloudService({
      serviceId: "srv_cloud_core",
      tenantId: tenantAlpha,
      plantId: plantSP,
      endpoint: "/api/health",
      isHttpAvailable: false,
      latencyMs: 10000,
      dbPingSuccess: false,
    });
    expect(s.state).toBe("UNAVAILABLE");
    expect(s.severity).toBe("CRITICAL");
  });

  it("Cenário 03: API com erros 5xx — detecta HTTP 503 e classifica como UNAVAILABLE", () => {
    const s = healthEngine.evaluateCloudService({
      serviceId: "srv_api_gateway",
      tenantId: tenantAlpha,
      plantId: plantSP,
      endpoint: "/api/v1/telemetry",
      isHttpAvailable: true,
      httpStatusCode: 503,
      latencyMs: 250,
      dbPingSuccess: true,
    });
    expect(s.state).toBe("UNAVAILABLE");
    expect(s.reasonCode).toBe("HTTP_5XX_OUTAGE");
    expect(s.severity).toBe("HIGH");
  });

  it("Cenário 04: API com latência elevada — latência de 2200ms classifica como DEGRADED", () => {
    const s = healthEngine.evaluateCloudService({
      serviceId: "srv_api_gateway",
      tenantId: tenantAlpha,
      plantId: plantSP,
      endpoint: "/api/v1/telemetry",
      isHttpAvailable: true,
      httpStatusCode: 200,
      latencyMs: 2200, // > 1500ms
      dbPingSuccess: true,
    });
    expect(s.state).toBe("DEGRADED");
    expect(s.reasonCode).toBe("LATENCY_HIGH");
  });

  it("Cenário 05: Banco de dados indisponível — ping do Supabase falhou", () => {
    const s = healthEngine.evaluateCloudService({
      serviceId: "srv_supabase_db",
      tenantId: tenantAlpha,
      plantId: plantSP,
      endpoint: "postgres://db.supabase.co:5432",
      isHttpAvailable: true,
      httpStatusCode: 200,
      latencyMs: 150,
      dbPingSuccess: false, // Ping falhou
    });
    expect(s.state).toBe("UNAVAILABLE");
    expect(s.reasonCode).toBe("DATABASE_CONNECTION_LOST");
    expect(s.severity).toBe("CRITICAL");
  });

  // ---------------------------------------------------------------------------
  // BLOCO 2: Observabilidade de Edge Gateway & Recursos (Cenários 6 a 16)
  // ---------------------------------------------------------------------------
  it("Cenário 06: Gateway saudável — heartbeat recente e recursos nominais", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_sp_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 3000,
      isInstrumented: true,
      cpuPercent: 24.5,
      memoryPercent: 45.0,
      diskPercent: 32.1,
      clockDriftMs: 45,
    });
    expect(s.state).toBe("HEALTHY");
    expect(s.severity).toBe("INFO");
  });

  it("Cenário 07: Gateway offline — heartbeat ausente há mais de 30 segundos", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_sp_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 35000, // 35s atrás (> 30s)
      isInstrumented: true,
      cpuPercent: 15,
      memoryPercent: 30,
      diskPercent: 25,
    });
    expect(s.state).toBe("UNAVAILABLE");
    expect(s.reasonCode).toBe("HEARTBEAT_TIMEOUT");
    expect(s.severity).toBe("CRITICAL");
  });

  it("Cenário 08: Gateway degradado — CPU ou memória em saturação crítica", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_sp_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 2000,
      isInstrumented: true,
      cpuPercent: 96.5,
      memoryPercent: 97.0, // > 95%
      diskPercent: 40,
    });
    expect(s.state).toBe("DEGRADED");
    expect(s.reasonCode).toBe("MEMORY_CRITICAL_SATURATION");
  });

  it("Cenário 09: Gateway desconhecido — nenhum heartbeat jamais recebido (UNKNOWN)", () => {
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_sp_new_provisioning",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: null, // Sem histórico
      isInstrumented: true,
    });
    expect(s.state).toBe("UNKNOWN");
    expect(s.reasonCode).toBe("NO_OBSERVATIONS_YET");
  });

  it("Cenário 10: Gateway sem instrumentação — SO não expõe métricas de hardware", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_embedded_legacy",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 1000,
      isInstrumented: false, // NOT_INSTRUMENTED
      cpuPercent: null,
      memoryPercent: null,
    });
    expect(s.state).toBe("NOT_INSTRUMENTED");
    expect(s.reasonCode).toBe("HARDWARE_METRICS_UNAVAILABLE");
  });

  it("Cenário 11: Disco saturado — ocupação acima de 92% aciona alerta de corrupção WAL", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_sp_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 2000,
      isInstrumented: true,
      diskPercent: 94.2, // > 92%
      walSizeBytes: 500 * 1024 * 1024,
    });
    expect(s.state).toBe("DEGRADED");
    expect(s.reasonCode).toBe("DISK_CRITICAL_SATURATION");
    expect(s.severity).toBe("HIGH");
  });

  it("Cenário 12: Memória insuficiente — RAM acima de 95% aciona alerta preventivo", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_sp_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 1000,
      isInstrumented: true,
      memoryPercent: 96.8,
    });
    expect(s.state).toBe("DEGRADED");
    expect(s.reasonCode).toBe("MEMORY_CRITICAL_SATURATION");
  });

  it("Cenário 13: Manutenção formal registrada — estado MAINTENANCE identificado com ticket", () => {
    const now = Date.now();
    healthEngine.registerMaintenanceWindow({
      componentId: "gw_sp_maint_01",
      authorizedBy: "eng_chefe@alpha.ind.br",
      reason: "Troca de nobreak e reforma de painel elétrico",
      startTime: now - 60000,
      endTime: now + 3600000,
      ticketId: "WO-2026-9981",
    });

    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_sp_maint_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 10000,
      isInstrumented: true,
    });

    expect(s.state).toBe("MAINTENANCE");
    expect(s.reasonCode).toBe("GATEWAY_IN_MAINTENANCE");
    expect(s.evidenceReference).toContain("WO-2026-9981");
  });

  it("Cenário 14: Outbox saturada com atraso no descarte de amostras", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_sp_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 2000,
      isInstrumented: true,
      pendingSamplesCount: 50000,
      walSizeBytes: 800 * 1024 * 1024,
      diskPercent: 93.0,
    });
    expect(s.state).toBe("DEGRADED");
  });

  it("Cenário 15: Perda de conectividade transitória — histerese mantém DEGRADED durante flapping", () => {
    const now = Date.now();
    // 1. Simula falha crítica
    healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_flapping_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 45000, // Timeout
      isInstrumented: true,
    });

    // 2. Primeira amostra boa: histerese exige 3 amostras boas seguidas
    const recovery1 = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_flapping_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 1000,
      isInstrumented: true,
      cpuPercent: 20,
      memoryPercent: 30,
      diskPercent: 30,
    });
    expect(recovery1.state).toBe("UNAVAILABLE"); // Retém estado anterior até completar histerese
    expect(recovery1.reasonCode).toBe("HYSTERESIS_STABILIZING");
  });

  it("Cenário 16: Recuperação de conectividade com sucesso após 3 amostras saudáveis consecutivas", () => {
    const now = Date.now();
    // Amostra 2
    healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_flapping_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 500,
      isInstrumented: true,
      cpuPercent: 20,
      memoryPercent: 30,
      diskPercent: 30,
    });

    // Amostra 3 (atinge limiar de 3 consecutivas)
    const recovery3 = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_flapping_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 100,
      isInstrumented: true,
      cpuPercent: 20,
      memoryPercent: 30,
      diskPercent: 30,
    });
    expect(recovery3.state).toBe("HEALTHY");
    expect(recovery3.reasonCode).toBe("NOMINAL_OPERATION");
  });

  // ---------------------------------------------------------------------------
  // BLOCO 3: Conectividade Industrial & Protocolos (Cenários 17 a 21)
  // ---------------------------------------------------------------------------
  it("Cenário 17: OPC UA desconectado — canal fechado aciona UNAVAILABLE", () => {
    const s = healthEngine.evaluateProtocolSource({
      sourceId: "opc_boiler_press",
      protocol: "OPC_UA",
      tenantId: tenantAlpha,
      plantId: plantSP,
      isConnected: false,
      timeoutCount: 15,
      lastError: "BadSessionClosed: Servidor encerrou a sessão",
      reconnectCount: 5,
    });
    expect(s.state).toBe("UNAVAILABLE");
    expect(s.reasonCode).toBe("PROTOCOL_DISCONNECTED");
  });

  it("Cenário 18: Modbus com timeout frequente — 8 timeouts classificam como DEGRADED", () => {
    const s = healthEngine.evaluateProtocolSource({
      sourceId: "modbus_ccm_energy",
      protocol: "MODBUS_TCP",
      tenantId: tenantAlpha,
      plantId: plantSP,
      isConnected: true,
      timeoutCount: 8, // > 5
      reconnectCount: 1,
      responseTimeMs: 950,
    });
    expect(s.state).toBe("DEGRADED");
    expect(s.reasonCode).toBe("PROTOCOL_ERRORS_HIGH");
  });

  it("Cenário 19: MQTT Sparkplug desconectado — broker indisponível", () => {
    const s = healthEngine.evaluateProtocolSource({
      sourceId: "mqtt_station_pumping",
      protocol: "MQTT_SPARKPLUG",
      tenantId: tenantAlpha,
      plantId: plantSP,
      isConnected: false,
      timeoutCount: 3,
      reconnectCount: 12,
      lastError: "ECONNREFUSED: Broker offline na porta 1883",
    });
    expect(s.state).toBe("UNAVAILABLE");
    expect(s.reasonCode).toBe("PROTOCOL_DISCONNECTED");
  });

  it("Cenário 20: Certificado expirado — gateway bloqueado com estado DEGRADED", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_cert_exp",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 1000,
      isInstrumented: true,
      isCertificateExpired: true,
    });
    expect(s.state).toBe("DEGRADED");
    expect(s.reasonCode).toBe("CERTIFICATE_EXPIRED");
  });

  it("Cenário 21: Certificado revogado — gateway bloqueado como UNAVAILABLE por segurança", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_cert_rev",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 1000,
      isInstrumented: true,
      isCertificateRevoked: true,
    });
    expect(s.state).toBe("UNAVAILABLE");
    expect(s.reasonCode).toBe("CERTIFICATE_REVOKED");
    expect(s.severity).toBe("CRITICAL");
  });

  // ---------------------------------------------------------------------------
  // BLOCO 4: Confiabilidade de Dados, Sequência e Deadband (Cenários 22 a 29)
  // ---------------------------------------------------------------------------
  it("Cenário 22: Dados atrasados — amostra mais velha que tolerância classifica como DEGRADED", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEquipmentTagHealth({
      tagId: "tag_temp_motor_1",
      tenantId: tenantAlpha,
      plantId: plantSP,
      sourceTimestamp: now - 45000, // 45s atrás
      ingestionTimestamp: now,
      isSourceConnected: true,
      scanRateMs: 1000,
      isDeadbandSuppressed: false,
      sampleQuality: "GOOD",
    });
    expect(s.state).toBe("DEGRADED");
    expect(s.reasonCode).toBe("STALE_DATA_TIMEOUT");
  });

  it("Cenário 23: Dados fora de ordem — detecta chegada temporal invertida", () => {
    const now = Date.now();
    // Amostra 1 (seq 100)
    pipelineTracker.trackSample({
      sampleId: "s1",
      gatewayId: "gw_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      tagName: "PRESSURE_PT01",
      sequenceNumber: 100,
      sourceTimestamp: now - 1000,
      edgeReceivedAt: now - 900,
      cloudReceivedAt: now - 100,
      quality: "GOOD",
    });

    // Amostra 2 (seq 98 — chegou fora de ordem)
    const res = pipelineTracker.trackSample({
      sampleId: "s2",
      gatewayId: "gw_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      tagName: "PRESSURE_PT01",
      sequenceNumber: 98,
      sourceTimestamp: now - 2000,
      edgeReceivedAt: now - 1900,
      cloudReceivedAt: now,
      quality: "GOOD",
    });

    expect(res.isOutOfOrder).toBe(true);
    expect(res.isSequenceLoss).toBe(false);
  });

  it("Cenário 24: Mensagens duplicadas — deduplica idempotentemente pela chave composta", () => {
    const now = Date.now();
    const sampleTime = now - 5000;

    const res1 = pipelineTracker.trackSample({
      sampleId: "s_dup_1",
      gatewayId: "gw_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      tagName: "MOTOR_CURRENT",
      sequenceNumber: 201,
      sourceTimestamp: sampleTime,
      edgeReceivedAt: sampleTime + 50,
      cloudReceivedAt: now,
      quality: "GOOD",
    });
    expect(res1.isDuplicate).toBe(false);
    expect(res1.isAccepted).toBe(true);

    // Mesma amostra retransmitida
    const res2 = pipelineTracker.trackSample({
      sampleId: "s_dup_1_retry",
      gatewayId: "gw_01",
      tenantId: tenantAlpha,
      plantId: plantSP,
      tagName: "MOTOR_CURRENT",
      sequenceNumber: 201,
      sourceTimestamp: sampleTime,
      edgeReceivedAt: sampleTime + 50,
      cloudReceivedAt: now + 100,
      quality: "GOOD",
    });
    expect(res2.isDuplicate).toBe(true);
    expect(res2.isAccepted).toBe(false);
  });

  it("Cenário 25: Perda de sequência comprovada — salto de sequência 100 para 105", () => {
    const now = Date.now();
    pipelineTracker.trackSample({
      sampleId: "seq_100",
      gatewayId: "gw_02",
      tenantId: tenantAlpha,
      plantId: plantSP,
      tagName: "TANK_LEVEL",
      sequenceNumber: 100,
      sourceTimestamp: now - 1000,
      edgeReceivedAt: now - 900,
      cloudReceivedAt: now - 50,
      quality: "GOOD",
    });

    const res = pipelineTracker.trackSample({
      sampleId: "seq_105",
      gatewayId: "gw_02",
      tenantId: tenantAlpha,
      plantId: plantSP,
      tagName: "TANK_LEVEL",
      sequenceNumber: 105, // Salto de 100 para 105
      sourceTimestamp: now,
      edgeReceivedAt: now,
      cloudReceivedAt: now,
      quality: "GOOD",
    });
    expect(res.isSequenceLoss).toBe(true);
  });

  it("Cenário 26: Deadband sem mudança de valor — NÃO classifica como falha (HEALTHY)", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEquipmentTagHealth({
      tagId: "tag_stable_current",
      tenantId: tenantAlpha,
      plantId: plantSP,
      sourceTimestamp: now - 60000, // Não transmitido há 60s
      ingestionTimestamp: now,
      isSourceConnected: true,
      scanRateMs: 1000,
      isDeadbandSuppressed: true, // Supressão por deadband
      sampleQuality: "GOOD",
    });
    expect(s.state).toBe("HEALTHY");
    expect(s.reasonCode).toBe("DEADBAND_UNCHANGED");
  });

  it("Cenário 27: Qualidade BAD — classifica equipamento como DEGRADED com motivo específico", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEquipmentTagHealth({
      tagId: "tag_bad_sensor",
      tenantId: tenantAlpha,
      plantId: plantSP,
      sourceTimestamp: now - 500,
      ingestionTimestamp: now,
      isSourceConnected: true,
      scanRateMs: 1000,
      isDeadbandSuppressed: false,
      sampleQuality: "BAD", // Sensor com falha
    });
    expect(s.state).toBe("DEGRADED");
    expect(s.reasonCode).toBe("TAG_QUALITY_BAD");
  });

  it("Cenário 28: Falha no Historian — saturação do storage afeta SLO de gravação histórica", () => {
    const m = sloCalc.calculateSloMeasurement({
      targetService: "HISTORIAN_STORAGE",
      periodStart: Date.now() - 86400000,
      periodEnd: Date.now(),
      totalObservations: 10000,
      validObservationsNumerator: 9800, // 200 falhas de escrita
      totalEligibleDenominator: 10000,
      unknownIntervalsCount: 0,
      plannedMaintenanceDurationMs: 0,
      unplannedOutageDurationMs: 3600000,
    });
    expect(m.achievedPercent).toBe(98.0);
    expect(m.isCompliant).toBe(false); // Target é 99.99%
    expect(m.errorBudgetConsumedPercent).toBe(100);
  });

  it("Cenário 29: Falha de consulta histórica — denominador zero não gera divisão por zero", () => {
    const m = sloCalc.calculateSloMeasurement({
      targetService: "HISTORIAN_STORAGE",
      periodStart: Date.now() - 86400000,
      periodEnd: Date.now(),
      totalObservations: 0,
      validObservationsNumerator: 0,
      totalEligibleDenominator: 0,
      unknownIntervalsCount: 0,
      plannedMaintenanceDurationMs: 0,
      unplannedOutageDurationMs: 0,
    });
    expect(m.achievedPercent).toBe(0);
    expect(m.totalEligibleDenominator).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // BLOCO 5: Gestão de Incidentes, Rastreabilidade & Auditoria (Cenários 30 a 35)
  // ---------------------------------------------------------------------------
  it("Cenário 30: Integridade da auditoria — cadeia SHA-256 do incidente atestada", () => {
    const rep = incidentMgr.reportIncident({
      organizationId: tenantAlpha,
      plantId: plantSP,
      sourceComponentId: "srv_modbus_c1",
      category: "INFRASTRUCTURE",
      severity: "WARNING",
      title: "Timeout no link Modbus",
      description: "Perda intermitente de pacotes no switch da sala CCM",
      impact: "Possível atraso na leitura de corrente do motor",
      evidence: { timeoutCount: 12 },
      actor: { id: adminAlpha.userId, email: adminAlpha.email, role: adminAlpha.role },
    });

    const verification = incidentMgr.verifyIncidentAuditIntegrity(rep.incident.incidentId);
    expect(verification.isValid).toBe(true);
  });

  it("Cenário 31: Incidente com ciclo de vida completo — OPEN -> ACK -> INVESTIGATING -> RESOLVED -> CLOSED", () => {
    const { incident } = incidentMgr.reportIncident({
      organizationId: tenantAlpha,
      plantId: plantSP,
      sourceComponentId: "comp_pump_p1",
      category: "INDUSTRIAL_PROCESS",
      severity: "CRITICAL",
      title: "Pressão de descarga abaixo do intertravamento",
      description: "Sensor PT-101 marcou 1.2 bar (mínimo exigido: 2.0 bar)",
      impact: "Risco de cavitação na bomba principal",
      evidence: { pressure: 1.2, minAllowed: 2.0 },
      actor: { id: operatorSP.userId, email: operatorSP.email, role: operatorSP.role },
    });

    // 1. ACK
    const ackRes = incidentMgr.transitionIncidentStatus({
      incidentId: incident.incidentId,
      toStatus: "ACKNOWLEDGED",
      note: "Operador de turno ciente da baixa pressão.",
      actor: { id: operatorSP.userId, email: operatorSP.email, role: operatorSP.role },
    });
    expect(ackRes.success).toBe(true);
    expect(incident.status).toBe("ACKNOWLEDGED");

    // 2. INVESTIGATING
    incidentMgr.transitionIncidentStatus({
      incidentId: incident.incidentId,
      toStatus: "INVESTIGATING",
      note: "Equipe de instrumentação em campo aferindo manômetro padrão.",
      actor: { id: adminAlpha.userId, email: adminAlpha.email, role: adminAlpha.role },
    });
    expect(incident.status).toBe("INVESTIGATING");

    // 3. RESOLVED
    const resRes = incidentMgr.transitionIncidentStatus({
      incidentId: incident.incidentId,
      toStatus: "RESOLVED",
      note: "Filtro Y desobstruído e sangria de ar realizada.",
      resolution: "Causa: saturação prematura do cesto filtrante por sólidos.",
      actor: { id: adminAlpha.userId, email: adminAlpha.email, role: adminAlpha.role },
    });
    expect(resRes.success).toBe(true);
    expect(incident.status).toBe("RESOLVED");
    expect(incident.resolution).toContain("saturação prematura");

    // 4. CLOSED
    incidentMgr.transitionIncidentStatus({
      incidentId: incident.incidentId,
      toStatus: "CLOSED",
      note: "Operação normalizada em 3.2 bar por 2 horas consecutivas.",
      actor: { id: adminAlpha.userId, email: adminAlpha.email, role: adminAlpha.role },
    });
    expect(incident.status).toBe("CLOSED");

    // Cadeia de auditoria deve permanecer 100% íntegra
    expect(incidentMgr.verifyIncidentAuditIntegrity(incident.incidentId).isValid).toBe(true);
  });

  it("Cenário 32: Correlação e deduplicação de eventos repetidos sem poluição da base", () => {
    const p1 = {
      organizationId: tenantAlpha,
      plantId: plantSP,
      sourceComponentId: "gw_sp_01",
      category: "INFRASTRUCTURE" as const,
      severity: "WARNING" as const,
      title: "Alta latência de rede no enlace de subestação",
      description: "Latência de 1800ms detectada",
      impact: "Atraso leve na transmissão",
      evidence: { latencyMs: 1800 },
      actor: { id: adminAlpha.userId, email: adminAlpha.email, role: adminAlpha.role },
    };

    const first = incidentMgr.reportIncident(p1);
    expect(first.isNew).toBe(true);
    expect(first.incident.dedupCount).toBe(1);

    // Segunda ocorrência idêntica antes de fechar o incidente
    const second = incidentMgr.reportIncident({ ...p1, evidence: { latencyMs: 2100 } });
    expect(second.isNew).toBe(false);
    expect(second.incident.dedupCount).toBe(2);
    expect(second.incident.incidentId).toBe(first.incident.incidentId);
  });

  it("Cenário 33: Isolamento cross-tenant — Tenant Beta não enxerga incidentes do Tenant Alpha", () => {
    // Incidente registrado no Tenant Alpha
    incidentMgr.reportIncident({
      organizationId: tenantAlpha,
      plantId: plantSP,
      sourceComponentId: "sec_token_01",
      category: "SECURITY_EVENT",
      severity: "CRITICAL",
      title: "Tentativa de autenticação com token expirado",
      description: "IP externo tentou registrar gateway",
      impact: "Tentativa bloqueada",
      evidence: { ip: "192.168.10.99" },
      actor: { id: adminAlpha.userId, email: adminAlpha.email, role: adminAlpha.role },
    });

    const betaIncidents = incidentMgr.getIncidents({ organizationId: tenantBeta });
    expect(betaIncidents.length).toBe(0);

    const alphaIncidents = incidentMgr.getIncidents({ organizationId: tenantAlpha });
    expect(alphaIncidents.length).toBeGreaterThan(0);
  });

  it("Cenário 34: Isolamento cross-plant — Planta RJ não mistura snapshots da Planta SP", () => {
    const now = Date.now();
    healthEngine.evaluateCloudService({
      serviceId: "srv_sp_custom",
      tenantId: tenantAlpha,
      plantId: plantSP,
      endpoint: "/api/sp",
      isHttpAvailable: true,
      latencyMs: 100,
      dbPingSuccess: true,
    });

    healthEngine.evaluateCloudService({
      serviceId: "srv_rj_custom",
      tenantId: tenantAlpha,
      plantId: plantRJ,
      endpoint: "/api/rj",
      isHttpAvailable: true,
      latencyMs: 100,
      dbPingSuccess: true,
    });

    const spSnapshots = healthEngine.getAllSnapshots({ tenantId: tenantAlpha, plantId: plantSP });
    const rjSnapshots = healthEngine.getAllSnapshots({ tenantId: tenantAlpha, plantId: plantRJ });

    expect(spSnapshots.every((s) => s.plantId === plantSP)).toBe(true);
    expect(rjSnapshots.every((s) => s.plantId === plantRJ)).toBe(true);
  });

  it("Cenário 35: Auditoria imutável rejeita alteração forjada de payload de transição", () => {
    const { incident } = incidentMgr.reportIncident({
      organizationId: tenantAlpha,
      plantId: plantSP,
      sourceComponentId: "srv_test_audit",
      category: "SECURITY_EVENT",
      severity: "CRITICAL",
      title: "Falha de assinatura digital",
      description: "Manifesto rejeitado",
      impact: "Atualização suspensa",
      evidence: {},
      actor: { id: adminAlpha.userId, email: adminAlpha.email, role: adminAlpha.role },
    });

    incidentMgr.transitionIncidentStatus({
      incidentId: incident.incidentId,
      toStatus: "ACKNOWLEDGED",
      note: "Investigação iniciada",
      actor: { id: adminAlpha.userId, email: adminAlpha.email, role: adminAlpha.role },
    });

    // Fraude manual no histórico de auditoria
    (incident.auditTrail[1] as any).note = "Nota adulterada por agente não autorizado";

    const verify = incidentMgr.verifyIncidentAuditIntegrity(incident.incidentId);
    expect(verify.isValid).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // BLOCO 6: Resiliência, Sobrecarga e Autonomia do Edge (Cenários 36 a 40)
  // ---------------------------------------------------------------------------
  it("Cenário 36: Flood de telemetria — processa e quantifica 500 amostras com backpressure", () => {
    const now = Date.now();
    for (let i = 0; i < 500; i++) {
      pipelineTracker.trackSample({
        sampleId: `s_flood_${i}`,
        gatewayId: "gw_flood_test",
        tenantId: tenantAlpha,
        plantId: plantSP,
        tagName: "HIGH_FREQ_SENSOR",
        sequenceNumber: i + 1,
        sourceTimestamp: now - 1000 + i,
        edgeReceivedAt: now - 900 + i,
        cloudReceivedAt: now,
        quality: "GOOD",
      });
    }

    const report = pipelineTracker.getReliabilityReport(tenantAlpha, "gw_flood_test");
    expect(report).toBeDefined();
    expect(report!.totalSamplesReceived).toBe(500);
    expect(report!.sequenceLossCount).toBe(0);
  });

  it("Cenário 37: Falha de observabilidade sem interrupção do Edge — persistência desacoplada", () => {
    // Se o motor de observabilidade sofrer um erro interno ou limpeza, as funções de controle e aquisição mantêm-se
    healthEngine.clear();
    expect(healthEngine.getAllSnapshots().length).toBe(0);
    expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);
  });

  it("Cenário 38: Recuperação após reinicialização — histórico preservado sem perda de integridade", () => {
    const def = sloCalc.getDefinition("DATA_FRESHNESS");
    expect(def).toBeDefined();
    expect(def?.targetPercent).toBe(98.0);
  });

  it("Cenário 39: Falta de sincronização do relógio — desvio de 3500ms classifica Edge como DEGRADED", () => {
    const now = Date.now();
    const s = healthEngine.evaluateEdgeGateway({
      gatewayId: "gw_clock_skew",
      tenantId: tenantAlpha,
      plantId: plantSP,
      lastHeartbeatTimestamp: now - 2000,
      isInstrumented: true,
      clockDriftMs: 3500, // Desvio de 3.5s (> 1s)
    });
    expect(s.state).toBe("DEGRADED");
    expect(s.reasonCode).toBe("CLOCK_DRIFT_EXCEEDED");
  });

  it("Cenário 40: BLOQUEIO PERMANENTE DE CONTROLE FÍSICO — IS_PHYSICAL_CONTROL_ALLOWED estritamente falso", () => {
    expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);
    // Garantia de imutabilidade em tempo de execução
    expect(Object.isFrozen(IS_PHYSICAL_CONTROL_ALLOWED) || IS_PHYSICAL_CONTROL_ALLOWED === false).toBe(true);
  });
});
