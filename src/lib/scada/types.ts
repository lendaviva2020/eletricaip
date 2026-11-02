// SCADA SUPERVISÓRIO — Industrial Types & Contracts
// Standards: ISA-101 (HMI), ISA-18.2 (Alarms), IEC 62443 (Security), IEC 60617 (Symbols), NR-10, NR-12

export type ScadaViewId =
  | "overview" // 1. Visão Geral (ETE Sinótico Principal)
  | "synoptics" // 2. Sinóticos Industriais (Setores de Processo)
  | "alarms" // 3. Alarmes (ISA-18.2)
  | "trends" // 4. Tendências (Historian Multi-pen)
  | "equipments" // 5. Equipamentos (Inventário Unificado)
  | "tags" // 6. TAGs Industriais (Tag Registry)
  | "communication" // 7. Comunicação (OPC UA / Modbus / MQTT)
  | "events" // 8. Eventos e Logs (Audit Trail)
  | "reports" // 9. Relatórios (Exportação / Análise)
  | "hmi" // 10. Editor HMI (Konva Canvas + Sandbox)
  | "settings"; // 11. Configurações (Parâmetros Supervisório)

export type ScadaSynopticSector = "ete_geral" | "pumping" | "filtration" | "tanks" | "electrical";

// ── Gate 1A: Safety Action Hierarchy (NR-10, NR-12, ISO 13849-1, IEC 62061) ──
export type SafetyActionLevel =
  | "SIMULATION_HALT" // 1. Parada da Simulação (Ação virtual no modelo em memória, sem atuação física)
  | "OPERATIONAL_STOP_REQUEST" // 2. Solicitação de Parada Operacional (Comando de processo para parada normal/rampa via CLP)
  | "PHYSICAL_EMERGENCY_STOP" // 3. Dispositivo Físico de Parada de Emergência (Botão físico cogumelo cabeado ao circuito de corte)
  | "VALIDATED_SAFETY_FUNCTION"; // 4. Função de Segurança Validada (Malha instrumentada certificada conforme ISO 13849-1 / IEC 62061)

export interface SafetyOperationalBoundary {
  safetyLevel: SafetyActionLevel;
  isPhysicalControlAllowed: boolean; // strictly false in current Gate 1
  disclaimer: string;
  regulatoryNotice: string;
}

export type TagQuality = "GOOD" | "BAD" | "UNCERTAIN" | "STALE" | "NOT_CONNECTED" | "FORCED";

export type TagDataType = "BOOL" | "INT" | "REAL" | "STRING" | "TIME";

export type ProtocolDriver =
  "SIMULATION" | "INTERNAL_RUNTIME" | "OPC_UA" | "MODBUS_TCP" | "MQTT" | "IMPORTED";

// ── GATE 3.4: Provenance Classification (ISA-101 Visual Truth Model) ──
export type DataSourceProvenance =
  | "PHYSICAL_DATA"
  | "INTERNAL_RUNTIME"
  | "SIMULATED_DATA"
  | "FORCED_DATA"
  | "STALE_DATA"
  | "BAD_QUALITY"
  | "NOT_CONNECTED";

/**
 * Resolves the unequivocal provenance classification of a process variable.
 * Enforces rule: Never present simulated or stale data as physical measurements.
 */
export function resolveTagProvenance(
  quality: TagQuality,
  driver: ProtocolDriver,
  forced?: boolean,
  isSimulated?: boolean,
): DataSourceProvenance {
  if (forced) return "FORCED_DATA";
  if (quality === "NOT_CONNECTED") return "NOT_CONNECTED";
  if (quality === "STALE") return "STALE_DATA";
  if (quality === "BAD") return "BAD_QUALITY";
  if (isSimulated || driver === "SIMULATION") return "SIMULATED_DATA";
  if (driver === "OPC_UA" || driver === "MODBUS_TCP" || driver === "MQTT") return "PHYSICAL_DATA";
  return "INTERNAL_RUNTIME";
}

export interface ScadaTagDefinition {
  id: string;
  name: string;
  description: string;
  dataType: TagDataType;
  unit: string;
  scaleMin: number;
  scaleMax: number;
  value: number | boolean | string;
  rawSampleValue?: number;
  unforcedValue?: number | boolean | string;
  quality: TagQuality;
  driver: ProtocolDriver;
  scanRateMs: number;
  staleTimeoutMs?: number;
  lastUpdated: number;
  forced: boolean;
  forcedBy?: string;
  forceReason?: string;
  forcedAt?: number;
  forceExpiresAt?: number;
  isSafetyCritical?: boolean;
  isOutOfRange?: boolean;
  sourceAddress: string;
  linkedEquipmentId?: string;
  isSimulated?: boolean;
}

export type AlarmSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type AlarmState = "UNACK" | "ACK" | "CLEARED" | "SHELVED";

export interface ScadaAlarmItem {
  id: string;
  tag: string;
  description: string;
  priority: AlarmSeverity;
  category: "PROCESS" | "ELECTRICAL" | "SAFETY" | "COMMUNICATION";
  currentValue: number | boolean | string;
  setpointLimit: number | string;
  state: AlarmState;
  timestamp: number;
  acknowledgedAt?: number | null;
  acknowledgedBy?: string | null;
  clearedAt?: number | null;
}

export interface EquipmentTelemetry {
  id: string;
  tag: string;
  name: string;
  category: "PUMP" | "TANK" | "VALVE" | "TRANSFORMER" | "PANEL" | "PLC" | "SENSOR" | "FILTER";
  status: "RUNNING" | "STOPPED" | "TRIPPED" | "STANDBY" | "OPEN" | "CLOSED" | "MAINTENANCE";
  mode: "AUTO" | "MANUAL" | "LOCAL" | "REMOTE";
  // Electrical ratings
  voltageV: number;
  currentA: number;
  powerKw: number;
  powerFactor: number;
  frequencyHz: number;
  // Process values
  speedRpm?: number;
  flowRateM3h?: number;
  pressureBar?: number;
  levelPct?: number;
  temperatureC?: number;
  differentialPressureBar?: number;
  ph?: number;
  turbidityNtu?: number;
  // Operational counters
  runningHours: number;
  startsCount: number;
  lastMaintenance: string;
  alarmsCount: number;
  // Linked canonical tags
  linkedTags: string[];
}

export interface ScadaTrendPoint {
  timestamp: number;
  [tagName: string]: number;
}

export interface ScadaAuditLog {
  id: string;
  timestamp: number;
  category: "OPERATOR" | "ALARM" | "SECURITY" | "SYSTEM" | "COMMUNICATION";
  operator: string;
  action: string;
  equipment?: string;
  tag?: string;
  details: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
}

export interface CommunicationGatewayStatus {
  opcua: {
    status: "CONNECTED" | "DISCONNECTED" | "ERROR";
    endpoint: string;
    sessions: number;
    subscriptions: number;
    samplingIntervalMs: number;
    rxBytes: number;
    txBytes: number;
    lastError?: string;
  };
  modbus: {
    status: "CONNECTED" | "DISCONNECTED" | "ERROR";
    host: string;
    port: number;
    unitId: number;
    holdingRegisters: number;
    pollIntervalMs: number;
    requestsCount: number;
    crcErrors: number;
  };
  mqtt: {
    status: "CONNECTED" | "DISCONNECTED" | "ERROR";
    broker: string;
    clientId: string;
    subscribedTopics: string[];
    messagesRx: number;
    messagesTx: number;
  };
}

export interface ScadaSystemSettings {
  scanCycleMs: number;
  audioAlarmsEnabled: boolean;
  audioVolume: number;
  historianRetentionDays: number;
  simulationInflowMultiplier: number;
  rbacRole: "OPERATOR" | "ENGINEER" | "SUPERVISOR" | "ADMIN";
  twoPersonRuleEnabled: boolean;
  estopInterlockActive: boolean;
}

// ── GATE 2: Industrial Data Engine, Tag Runtime, Alarm Engine & Historian ──

export interface TagUpdateInput {
  tagId: string;
  tagName: string;
  projectId: string;
  equipmentId?: string;
  rawValue: number | boolean | string;
  dataType: TagDataType;
  unit?: string;
  source: ProtocolDriver;
  sourceTimestamp: number;
  receivedAt: number;
  quality?: TagQuality;
  connectionId?: string;
  sequenceNumber?: number;
  scaleMultiplier?: number;
  scaleOffset?: number;
  deadband?: number;
  clampToLimits?: boolean;
  isSafetyCritical?: boolean;
}

export type AlarmClass =
  | "PROCESS"
  | "EQUIPMENT"
  | "ELECTRICAL"
  | "COMMUNICATION"
  | "INSTRUMENTATION"
  | "SYSTEM"
  | "SAFETY_INDICATION";

export type AlarmProcessCondition =
  | "NORMAL"
  | "ACTIVE"
  | "RETURNED_TO_NORMAL"
  | "SUPPRESSED"
  | "OUT_OF_SERVICE";

export type AlarmAckState = "UNACKNOWLEDGED" | "ACKNOWLEDGED";

export type AlarmTransitionType =
  | "TRIGGER"
  | "ACKNOWLEDGE"
  | "RETURN_TO_NORMAL"
  | "CLEAR"
  | "SUPPRESS"
  | "UNSUPPRESS"
  | "SHELVE";

export interface AnalogAlarmLimitConfig {
  highHigh?: number | null;
  high?: number | null;
  low?: number | null;
  lowLow?: number | null;
  hysteresis: number;
  deadband?: number;
  delayOnMs?: number;
  delayOffMs?: number;
}

export interface ExtendedAlarmDefinition {
  id: string;
  projectId: string;
  tagId: string;
  tagName: string;
  description: string;
  equipmentId?: string;
  equipmentType?: string;
  alarmClass: AlarmClass;
  severity: AlarmSeverity;
  analogLimits?: AnalogAlarmLimitConfig;
  discreteTriggerValue?: boolean | string;
  requireAck: boolean;
  autoClear: boolean;
  enabled: boolean;
  suppressedUntil?: number | null;
  suppressionReason?: string;
  area?: string;
  location?: string;
}

export interface ExtendedAlarmInstance {
  id: string;
  definitionId: string;
  projectId: string;
  tagName: string;
  equipmentId?: string;
  description: string;
  alarmClass: AlarmClass;
  severity: AlarmSeverity;
  processCondition: AlarmProcessCondition;
  ackState: AlarmAckState;
  triggeredAt: number;
  triggerValue: number | boolean | string;
  setpointLimit: number | string;
  limitType?: "HH" | "H" | "L" | "LL" | "DISCRETE" | "QUALITY";
  returnedToNormalAt?: number | null;
  acknowledgedAt?: number | null;
  acknowledgedBy?: string | null;
  ackComment?: string | null;
  clearedAt?: number | null;
  clearedBy?: string | null;
  isChattering?: boolean;
  chatterCount?: number;
}

export interface AlarmTransitionEvent {
  id: string;
  instanceId: string;
  definitionId: string;
  projectId: string;
  tagName: string;
  timestamp: number;
  transition: AlarmTransitionType;
  previousCondition: AlarmProcessCondition;
  newCondition: AlarmProcessCondition;
  previousAckState: AlarmAckState;
  newAckState: AlarmAckState;
  value: number | boolean | string;
  operator?: string | null;
  comment?: string | null;
}

export interface HistoricalSample {
  id?: number | string;
  projectId: string;
  tagName: string;
  value: number;
  quality: TagQuality;
  source: ProtocolDriver;
  sampledAt: string | number;
  receivedAt?: string | number;
  sequenceNumber?: number;
}

export interface HistorianQueryOptions {
  projectId: string;
  tagNames: string[];
  startTime: string;
  endTime: string;
  limit?: number;
  downsampleMinutes?: number;
  qualityFilter?: TagQuality[];
}

export interface HistorianAggregateResult {
  tagName: string;
  unit: string;
  source: ProtocolDriver;
  sampleCount: number;
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  firstTimestamp: number;
  lastTimestamp: number;
  samples: Array<{ timestamp: number; value: number; quality: TagQuality }>;
}

export type ScadaReportType =
  | "ALARM_PARETO"
  | "ALARM_HISTORY"
  | "ENERGY_CONSUMPTION"
  | "POWER_DEMAND"
  | "EQUIPMENT_AVAILABILITY"
  | "PROCESS_BALANCE"
  | "DAILY_OPERATIONAL_LOG";

export interface OperationalReportData {
  reportType: ScadaReportType;
  projectId: string;
  projectName: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  metrics: Record<string, number | string>;
  tableData: Array<Record<string, string | number | boolean>>;
  summary: string;
}

