// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — CANONICAL INDUSTRIAL ENGINEERING STUDIO MODEL
// Single Source of Truth for Automation, Electrical, SCADA, and IEC Engineering
// ============================================================================

import { z } from "zod";

/**
 * INVARIANTE PERMANENTE DE SEGURANÇA OPERACIONAL:
 * O ElétricAi Industrial OS opera em modo consultivo e analítico para engenharia,
 * proibindo incondicionalmente comandos de escrita ou controle sobre equipamentos físicos reais.
 */
export const IS_PHYSICAL_CONTROL_ALLOWED = false as const;
export const isPhysicalControlAllowed = false as const;
export const SAFETY_CONFIG = Object.freeze({
  IS_PHYSICAL_CONTROL_ALLOWED: false as const,
  isPhysicalControlAllowed: false as const,
  OPERATIONAL_MODE: "OBSERVATIONAL_ONLY" as const,
});

export const UUIDSchema = z.string().uuid();
export type UUID = z.infer<typeof UUIDSchema>;

// ----------------------------------------------------------------------------
// 1. Tipos de Dados Industriais (IEC 61131-3 Elementary & Composite Data Types)
// ----------------------------------------------------------------------------
export const IECPrimitiveValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.null(),
]);
export type IECPrimitiveValue = z.infer<typeof IECPrimitiveValueSchema>;

export const IECValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string(),
  z.array(z.union([z.boolean(), z.number(), z.string()])),
  z.record(z.union([z.boolean(), z.number(), z.string(), z.null()])),
]);
export type IECValue = z.infer<typeof IECValueSchema>;
export const ElementaryDataTypeSchema = z.enum([
  "BOOL",
  "SINT",
  "INT",
  "DINT",
  "LINT",
  "USINT",
  "UINT",
  "UDINT",
  "ULINT",
  "REAL",
  "LREAL",
  "TIME",
  "DATE",
  "TIME_OF_DAY",
  "DATE_AND_TIME",
  "STRING",
  "WSTRING",
  "BYTE",
  "WORD",
  "DWORD",
  "LWORD",
]);
export type ElementaryDataType = z.infer<typeof ElementaryDataTypeSchema>;

export const DataTypeKindSchema = z.enum([
  "ELEMENTARY",
  "STRUCT",
  "ENUM",
  "ARRAY",
  "SUBRANGE",
  "ALIAS",
]);
export type DataTypeKind = z.infer<typeof DataTypeKindSchema>;

export const DataTypeFieldSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  type: z.string().min(1),
  defaultValue: IECValueSchema.optional(),
  comment: z.string().default(""),
});
export type DataTypeField = z.infer<typeof DataTypeFieldSchema>;

export const DataTypeDefinitionSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  kind: DataTypeKindSchema,
  baseType: z.string().optional(),
  fields: z.array(DataTypeFieldSchema).default([]),
  enumValues: z.array(z.string()).default([]),
  arrayDimensions: z.array(z.tuple([z.number().int(), z.number().int()])).optional(),
  subrangeMin: z.number().optional(),
  subrangeMax: z.number().optional(),
  comment: z.string().default(""),
});
export type DataTypeDefinition = z.infer<typeof DataTypeDefinitionSchema>;

// ----------------------------------------------------------------------------
// 2. Variáveis de PLC e GVL (Global Variable Lists)
// ----------------------------------------------------------------------------
export const VariableScopeSchema = z.enum([
  "VAR",
  "VAR_INPUT",
  "VAR_OUTPUT",
  "VAR_IN_OUT",
  "VAR_GLOBAL",
  "VAR_TEMP",
  "VAR_STAT",
  "VAR_EXTERNAL",
]);
export type VariableScope = z.infer<typeof VariableScopeSchema>;

export const PLCVariableSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  scope: VariableScopeSchema,
  dataType: z.string().min(1), // Elementary ou UDT
  address: z.string().optional(), // ex: %IX0.0, %QW100, %MD50
  initialValue: IECValueSchema.optional(),
  constant: z.boolean().default(false),
  retain: z.boolean().default(false),
  comment: z.string().default(""),
  tagId: UUIDSchema.optional(), // Vínculo canônico com Tag de Engenharia
  ioChannelId: UUIDSchema.optional(), // Vínculo canônico com canal de I/O do Rack
});
export type PLCVariable = z.infer<typeof PLCVariableSchema>;

export const GlobalVariableListSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  variables: z.array(PLCVariableSchema).default([]),
  comment: z.string().default(""),
});
export type GlobalVariableList = z.infer<typeof GlobalVariableListSchema>;

// ----------------------------------------------------------------------------
// 3. Tags de Engenharia, Qualidade e Proveniência (ISA-18.2 / OPC UA)
// ----------------------------------------------------------------------------
export const TagQualitySchema = z.enum([
  "GOOD",
  "UNCERTAIN",
  "BAD",
  "STALE",
  "NOT_CONNECTED",
  "SIMULATED",
  "FORCED",
]);
export type TagQuality = z.infer<typeof TagQualitySchema>;

export const TagProvenanceSchema = z.enum([
  "SIMULATED",
  "FORCED",
  "CALCULATED",
  "RUNTIME",
  "PHYSICAL_READ_ONLY",
  "UNKNOWN",
]);
export type TagProvenance = z.infer<typeof TagProvenanceSchema>;

export const TagSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  projectId: UUIDSchema,
  equipmentId: UUIDSchema.optional(), // Vinculado a Equipamento Unifilar/Planta
  name: z.string().min(1),
  code: z.string().min(1), // Ex: PT-101, MTR-01-RUN
  dataType: ElementaryDataTypeSchema,
  engineeringUnit: z.string().default(""),
  description: z.string().default(""),
  initialValue: IECValueSchema.optional(),
  currentValue: IECValueSchema.optional(),
  quality: TagQualitySchema.default("GOOD"),
  provenance: TagProvenanceSchema.optional(),
  isForced: z.boolean().default(false), // Apenas no simulador
  forcedValue: IECValueSchema.optional(),
  historyEnabled: z.boolean().default(true),
  sampleIntervalMs: z.number().int().positive().default(1000),
  gatewayId: UUIDSchema.optional(),
  protocolAddress: z.string().optional(),
});
export type Tag = z.infer<typeof TagSchema>;

// ----------------------------------------------------------------------------
// 4. Hardware Modules e I/O Channels (Device Tree)
// ----------------------------------------------------------------------------
export const ChannelDirectionSchema = z.enum([
  "DIGITAL_INPUT",
  "DIGITAL_OUTPUT",
  "ANALOG_INPUT",
  "ANALOG_OUTPUT",
  "COMMUNICATION",
  "SPECIAL",
]);
export type ChannelDirection = z.infer<typeof ChannelDirectionSchema>;

export const IOChannelSchema = z.object({
  id: UUIDSchema,
  moduleId: UUIDSchema,
  channelIndex: z.number().int().nonnegative(),
  name: z.string().min(1),
  direction: ChannelDirectionSchema,
  iecAddress: z.string(), // ex: %IX0.0, %IW64, %QX0.0
  mappedVariableId: UUIDSchema.optional(),
  mappedTagId: UUIDSchema.optional(),
  electricalSignal: z.string().default("24VDC"), // 24VDC, 4-20mA, 0-10V, etc.
  rawMin: z.number().default(0),
  rawMax: z.number().default(27648),
  scaledMin: z.number().default(0),
  scaledMax: z.number().default(100),
  engineeringUnit: z.string().default("%"),
  status: z.enum(["OK", "OPEN_WIRE", "SHORT_CIRCUIT", "OVER_RANGE", "DISABLED"]).default("OK"),
});
export type IOChannel = z.infer<typeof IOChannelSchema>;

export const HardwareModuleSchema = z.object({
  id: UUIDSchema,
  controllerId: UUIDSchema,
  slotNumber: z.number().int().nonnegative(),
  catalogKey: z.string().min(1),
  name: z.string().min(1),
  partNumber: z.string().default(""),
  channelsCount: z.number().int().nonnegative().default(0),
  channels: z.array(IOChannelSchema).default([]),
  hardwareParameters: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  diagnostics: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});
export type HardwareModule = z.infer<typeof HardwareModuleSchema>;

export const ControllerVendorSchema = z.enum([
  "SIEMENS",
  "ROCKWELL",
  "SCHNEIDER",
  "CODESYS_VIRTUAL",
  "GENERIC_IEC",
]);
export type ControllerVendor = z.infer<typeof ControllerVendorSchema>;

export const ControllerSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  vendor: ControllerVendorSchema,
  model: z.string().min(1),
  ipAddress: z.string().default("192.168.1.10"),
  firmwareVersion: z.string().default("3.5.20.0"),
  rackModules: z.array(HardwareModuleSchema).default([]),
  taskConfigurations: z.array(UUIDSchema).default([]),
  connected: z.boolean().default(false),
  simulationActive: z.boolean().default(false),
});
export type Controller = z.infer<typeof ControllerSchema>;

export const DeviceKindSchema = z.enum([
  "CONTROLLER",
  "REMOTE_IO",
  "DRIVE_INVERTER",
  "HMI_PANEL",
  "SAFETY_RELAY",
  "GATEWAY",
  "FIELD_INSTRUMENT",
]);
export type DeviceKind = z.infer<typeof DeviceKindSchema>;

export const DeviceSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  projectId: UUIDSchema,
  parentId: UUIDSchema.optional(), // Hierarquia na árvore de dispositivos
  name: z.string().min(1),
  kind: DeviceKindSchema,
  controllerId: UUIDSchema.optional(),
  protocol: z.string().default("MODBUS_TCP"),
  address: z.string().default(""),
  status: z.enum(["CONFIGURED", "ONLINE_SIMULATED", "OFFLINE", "FAULT"]).default("CONFIGURED"),
});
export type Device = z.infer<typeof DeviceSchema>;

export const DeviceTreeSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  rootDevices: z.array(DeviceSchema).default([]),
});
export type DeviceTree = z.infer<typeof DeviceTreeSchema>;

// ----------------------------------------------------------------------------
// 5. Configuração de Tarefas (Task Configuration & Scheduler)
// ----------------------------------------------------------------------------
export const TaskTypeSchema = z.enum([
  "CYCLIC",
  "EVENT",
  "FREEWHEELING",
  "STATUS_TRIGGERED",
  "EXTERNAL_EVENT",
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskConfigurationSchema = z.object({
  id: UUIDSchema,
  controllerId: UUIDSchema,
  name: z.string().min(1),
  type: TaskTypeSchema.default("CYCLIC"),
  priority: z.number().int().min(0).max(31).default(1), // 0 = maior prioridade
  intervalMs: z.number().int().positive().default(10), // Ciclo em ms
  watchdogMs: z.number().int().positive().default(100),
  watchdogSensitivity: z.number().int().min(1).max(10).default(1),
  eventTriggerTagId: UUIDSchema.optional(),
  eventVariableId: UUIDSchema.optional(),
  pouIds: z.array(UUIDSchema).default([]), // Ordem de chamada dos POUs nesta tarefa
  enabled: z.boolean().default(true),
  cycleTimeActualMs: z.number().default(0),
  jitterMs: z.number().default(0),
  isOverrun: z.boolean().default(false),
});
export type TaskConfiguration = z.infer<typeof TaskConfigurationSchema>;

// ----------------------------------------------------------------------------
// 6. POUs (Program Organization Units) e Linguagens IEC 61131-3
// ----------------------------------------------------------------------------
export const POUTypeSchema = z.enum(["PROGRAM", "FUNCTION_BLOCK", "FUNCTION"]);
export type POUType = z.infer<typeof POUTypeSchema>;

export const IECLanguageSchema = z.enum(["ST", "LD", "FBD", "SFC", "IL"]);
export type IECLanguage = z.infer<typeof IECLanguageSchema>;

// Elementos de Ladder
export const LadderElementTypeSchema = z.enum([
  "CONTACT_NO",
  "CONTACT_NC",
  "CONTACT_R_TRIG",
  "CONTACT_F_TRIG",
  "COIL_STANDARD",
  "COIL_NEGATED",
  "COIL_SET",
  "COIL_RESET",
  "BLOCK",
  "BRANCH",
]);
export type LadderElementType = z.infer<typeof LadderElementTypeSchema>;

export const LadderElementSchema = z.object({
  id: UUIDSchema,
  type: LadderElementTypeSchema,
  variableId: UUIDSchema.optional(),
  tagId: UUIDSchema.optional(),
  symbolName: z.string().default(""),
  negated: z.boolean().default(false),
  blockName: z.string().optional(),
  params: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});
export type LadderElement = z.infer<typeof LadderElementSchema>;

export const LadderRungSchema = z.object({
  id: UUIDSchema,
  number: z.number().int().positive(),
  comment: z.string().default(""),
  elements: z.array(LadderElementSchema).default([]),
  branches: z.array(z.array(LadderElementSchema)).default([]),
});
export type LadderRung = z.infer<typeof LadderRungSchema>;

// Elementos de FBD
export const FBDPinSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  dataType: z.string().default("BOOL"),
  isInput: z.boolean(),
  defaultValue: IECValueSchema.optional(),
  currentValue: IECValueSchema.optional(),
});
export type FBDPin = z.infer<typeof FBDPinSchema>;

export const FBDNodeSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  blockType: z.string().min(1), // Ex: AND, OR, TON, CTU, PID, ADD, SUB, USER_FB
  x: z.number().default(0),
  y: z.number().default(0),
  inputs: z.array(FBDPinSchema).default([]),
  outputs: z.array(FBDPinSchema).default([]),
  instanceVariableId: UUIDSchema.optional(),
});
export type FBDNode = z.infer<typeof FBDNodeSchema>;

export const FBDConnectionSchema = z.object({
  id: UUIDSchema,
  fromNodeId: UUIDSchema,
  fromPinId: UUIDSchema,
  toNodeId: UUIDSchema,
  toPinId: UUIDSchema,
});
export type FBDConnection = z.infer<typeof FBDConnectionSchema>;

// Elementos de SFC
export const ActionQualifierSchema = z.enum(["N", "S", "R", "P", "L", "D", "SD", "DS", "SL"]);
export type ActionQualifier = z.infer<typeof ActionQualifierSchema>;

export const SFCActionSchema = z.object({
  id: UUIDSchema,
  actionName: z.string().min(1),
  qualifier: ActionQualifierSchema.default("N"),
  stCode: z.string().default(""),
  timeLimitMs: z.number().optional(),
});
export type SFCAction = z.infer<typeof SFCActionSchema>;

export const SFCStepSchema = z.object({
  id: UUIDSchema,
  stepNumber: z.number().int().nonnegative(),
  name: z.string().min(1),
  isInitial: z.boolean().default(false),
  isActive: z.boolean().default(false),
  timeInStepMs: z.number().default(0),
  actions: z.array(SFCActionSchema).default([]),
  x: z.number().default(0),
  y: z.number().default(0),
});
export type SFCStep = z.infer<typeof SFCStepSchema>;

export const SFCTransitionSchema = z.object({
  id: UUIDSchema,
  fromStepIds: z.array(UUIDSchema).min(1),
  toStepIds: z.array(UUIDSchema).min(1),
  conditionST: z.string().min(1), // Expressão booleana em ST
  isSatisfied: z.boolean().default(false),
  x: z.number().default(0),
  y: z.number().default(0),
});
export type SFCTransition = z.infer<typeof SFCTransitionSchema>;

export const ProgramNetworkSchema = z.object({
  id: UUIDSchema,
  number: z.number().int().positive(),
  label: z.string().optional(),
  comment: z.string().default(""),
  language: IECLanguageSchema,
  stSource: z.string().default(""),
  rungs: z.array(LadderRungSchema).default([]),
  fbdNodes: z.array(FBDNodeSchema).default([]),
  fbdConnections: z.array(FBDConnectionSchema).default([]),
  sfcSteps: z.array(SFCStepSchema).default([]),
  sfcTransitions: z.array(SFCTransitionSchema).default([]),
});
export type ProgramNetwork = z.infer<typeof ProgramNetworkSchema>;

export const ActionDefinitionSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  language: IECLanguageSchema.default("ST"),
  sourceCode: z.string().default(""),
});
export type ActionDefinition = z.infer<typeof ActionDefinitionSchema>;

export const MethodDefinitionSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  returnType: z.string().optional(),
  variables: z.array(PLCVariableSchema).default([]),
  sourceST: z.string().default(""),
  accessModifier: z.enum(["PUBLIC", "PRIVATE", "PROTECTED", "INTERNAL"]).default("PUBLIC"),
});
export type MethodDefinition = z.infer<typeof MethodDefinitionSchema>;

export const PropertyDefinitionSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  dataType: z.string().min(1),
  getterSourceST: z.string().default(""),
  setterSourceST: z.string().default(""),
});
export type PropertyDefinition = z.infer<typeof PropertyDefinitionSchema>;

export const InterfaceDefinitionSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  methods: z.array(z.object({ name: z.string(), returnType: z.string().optional() })).default([]),
  properties: z.array(z.object({ name: z.string(), dataType: z.string() })).default([]),
});
export type InterfaceDefinition = z.infer<typeof InterfaceDefinitionSchema>;

export const POUSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  pouType: POUTypeSchema,
  language: IECLanguageSchema,
  returnType: z.string().optional(), // Obrigatório se pouType === "FUNCTION"
  variables: z.array(PLCVariableSchema).default([]),
  rawSourceST: z.string().default(""), // Fonte ST completa quando language === "ST"
  networks: z.array(ProgramNetworkSchema).default([]), // Para LD, FBD, SFC
  actions: z.array(ActionDefinitionSchema).default([]),
  methods: z.array(MethodDefinitionSchema).default([]),
  properties: z.array(PropertyDefinitionSchema).default([]),
  implementedInterfaces: z.array(z.string()).default([]),
  comment: z.string().default(""),
});
export type POU = z.infer<typeof POUSchema>;

// ----------------------------------------------------------------------------
// 7. Visualização, HMI, Alarmes e Receitas
// ----------------------------------------------------------------------------
export const HMIWidgetTypeSchema = z.enum([
  "BUTTON",
  "PILOT_LIGHT",
  "GAUGE",
  "TANK_LEVEL",
  "NUMERIC_INPUT",
  "DISPLAY_VALUE",
  "TREND_CHART",
  "ALARM_BANNER",
  "MOTOR_SYMBOL",
  "VALVE_SYMBOL",
  "CONVEYOR_BELT",
  "IMAGE",
  "CONTAINER",
]);
export type HMIWidgetType = z.infer<typeof HMIWidgetTypeSchema>;

export const HMIWidgetSchema = z.object({
  id: UUIDSchema,
  type: HMIWidgetTypeSchema,
  name: z.string().min(1),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().default(100),
  height: z.number().default(40),
  bindingTagId: UUIDSchema.optional(),
  bindingVariableId: UUIDSchema.optional(),
  properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  securityRoleRequired: z.string().default("OPERATOR"),
});
export type HMIWidget = z.infer<typeof HMIWidgetSchema>;

export const HMIPageSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  title: z.string().default(""),
  widgets: z.array(HMIWidgetSchema).default([]),
  backgroundColor: z.string().default("#131722"),
});
export type HMIPage = z.infer<typeof HMIPageSchema>;

export const AlarmSeveritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "DIAGNOSTIC"]);
export type AlarmSeverity = z.infer<typeof AlarmSeveritySchema>;

export const AlarmDefinitionSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  tagId: UUIDSchema,
  name: z.string().min(1),
  condition: z.enum(["EQUAL", "NOT_EQUAL", "HIGH_LIMIT", "LOW_LIMIT", "DEVIATION"]),
  threshold: z.number().optional(),
  severity: AlarmSeveritySchema,
  message: z.string().min(1),
  acknowledged: z.boolean().default(false),
  active: z.boolean().default(false),
  timestamp: z.string().default(() => new Date().toISOString()),
});
export type AlarmDefinition = z.infer<typeof AlarmDefinitionSchema>;

export const TrendDefinitionSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  tagIds: z.array(UUIDSchema).default([]),
  bufferSize: z.number().int().positive().default(1000),
  sampleRateMs: z.number().int().positive().default(500),
});
export type TrendDefinition = z.infer<typeof TrendDefinitionSchema>;

export const RecipeParameterSchema = z.object({
  id: UUIDSchema,
  targetTagId: UUIDSchema,
  parameterName: z.string().min(1),
  targetValue: IECValueSchema,
  unit: z.string().default(""),
});
export type RecipeParameter = z.infer<typeof RecipeParameterSchema>;

export const RecipeDefinitionSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  productCode: z.string().default(""),
  parameters: z.array(RecipeParameterSchema).default([]),
});
export type RecipeDefinition = z.infer<typeof RecipeDefinitionSchema>;

// ----------------------------------------------------------------------------
// 8. Comunicação Industrial e Protocolos
// ----------------------------------------------------------------------------
export const IndustrialProtocolSchema = z.enum([
  "MODBUS_TCP",
  "MODBUS_RTU",
  "OPC_UA",
  "MQTT_SPARKPLUG_B",
  "ETHERNET_IP",
  "PROFINET",
  "ETHERCAT",
  "CANOPEN",
]);
export type IndustrialProtocol = z.infer<typeof IndustrialProtocolSchema>;

export const ProtocolConfigurationSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  protocol: IndustrialProtocolSchema,
  enabled: z.boolean().default(false),
  host: z.string().default("127.0.0.1"),
  port: z.number().int().positive().default(502),
  slaveId: z.number().int().optional(),
  endpointUrl: z.string().optional(),
  topicNamespace: z.string().optional(),
  timeoutMs: z.number().int().positive().default(2000),
  retryCount: z.number().int().nonnegative().default(3),
  readOnlyEnforced: z.literal(true).default(true), // Garante read-only
});
export type ProtocolConfiguration = z.infer<typeof ProtocolConfigurationSchema>;

// ----------------------------------------------------------------------------
// 9. Motion Control (PLCopen Motion)
// ----------------------------------------------------------------------------
export const AxisStateSchema = z.enum([
  "DISABLED",
  "STANDSTILL",
  "HOMING",
  "DISCRETE_MOTION",
  "CONTINUOUS_MOTION",
  "SYNCHRONIZED_MOTION",
  "ERROR_STOP",
]);
export type AxisState = z.infer<typeof AxisStateSchema>;

export const MotionAxisSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  axisIndex: z.number().int().nonnegative(),
  state: AxisStateSchema.default("STANDSTILL"),
  unit: z.string().default("mm"),
  maxVelocity: z.number().positive().default(1000),
  maxAcceleration: z.number().positive().default(5000),
  maxDeceleration: z.number().positive().default(5000),
  currentPosition: z.number().default(0),
  targetPosition: z.number().default(0),
  currentVelocity: z.number().default(0),
  isVirtual: z.boolean().default(true),
});
export type MotionAxis = z.infer<typeof MotionAxisSchema>;

export const MotionGroupTypeSchema = z.enum(["CARTESIAN_3D", "SCARA", "DELTA", "GANTRY"]);
export type MotionGroupType = z.infer<typeof MotionGroupTypeSchema>;

export const MotionGroupSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  groupType: MotionGroupTypeSchema.default("CARTESIAN_3D"),
  axisIds: z.array(UUIDSchema).default([]),
  gcodeProgram: z.string().default(""),
});
export type MotionGroup = z.infer<typeof MotionGroupSchema>;

// ----------------------------------------------------------------------------
// 10. Bibliotecas, Dependências, Compilação e Simulação
// ----------------------------------------------------------------------------
export const LibraryCategorySchema = z.enum([
  "SYSTEM",
  "STANDARD",
  "DEVICE",
  "COMMUNICATION",
  "MOTION",
  "VISUALIZATION",
  "APPLICATION",
  "USER",
  "PROJECT",
]);
export type LibraryCategory = z.infer<typeof LibraryCategorySchema>;

export const LibraryReferenceSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1),
  namespace: z.string().default(""),
  category: LibraryCategorySchema.default("STANDARD"),
  version: z.string().min(1),
  effectiveVersion: z.string().default("1.0.0"),
  vendor: z.string().default("Standard IEC"),
  checksumSha256: z.string().default(""),
  placeholder: z.string().optional(),
  isPlaceholder: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
  pousProvided: z.array(z.string()).default([]),
  dataTypesProvided: z.array(z.string()).default([]),
  description: z.string().default(""),
});
export type LibraryReference = z.infer<typeof LibraryReferenceSchema>;

export const DependencyReferenceSchema = z.object({
  sourceId: UUIDSchema,
  sourceType: z.enum(["POU", "TAG", "VARIABLE", "DEVICE", "HMI", "ALARM"]),
  targetId: UUIDSchema,
  targetType: z.enum(["POU", "TAG", "VARIABLE", "DEVICE", "HMI", "ALARM"]),
  referenceKind: z.enum(["CALLS", "READS", "WRITES", "BINDS", "INSTANTIATES"]),
});
export type DependencyReference = z.infer<typeof DependencyReferenceSchema>;

export const DependencyGraphSchema = z.object({
  projectId: UUIDSchema,
  references: z.array(DependencyReferenceSchema).default([]),
});
export type DependencyGraph = z.infer<typeof DependencyGraphSchema>;

export const SimulationScenarioSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  clockIntervalMs: z.number().int().positive().default(10),
  inputsTimeline: z.array(
    z.object({
      timeOffsetMs: z.number().nonnegative(),
      tagId: UUIDSchema,
      simulatedValue: IECValueSchema,
    }),
  ).default([]),
});
export type SimulationScenario = z.infer<typeof SimulationScenarioSchema>;

export const CompilerDiagnosticSeveritySchema = z.enum(["ERROR", "WARNING", "INFO"]);
export type CompilerDiagnosticSeverity = z.infer<typeof CompilerDiagnosticSeveritySchema>;

export const CompilerDiagnosticSchema = z.object({
  id: UUIDSchema,
  pouId: UUIDSchema.optional(),
  networkId: UUIDSchema.optional(),
  line: z.number().int().positive().default(1),
  column: z.number().int().positive().default(1),
  severity: CompilerDiagnosticSeveritySchema,
  code: z.string(), // ex: IEC001, TYPE_MISMATCH
  message: z.string(),
});
export type CompilerDiagnostic = z.infer<typeof CompilerDiagnosticSchema>;

export const CompilationResultSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  success: z.boolean(),
  compiledAt: z.string().default(() => new Date().toISOString()),
  compilerVersion: z.string().default("1.0.0-IEC61131-3"),
  diagnostics: z.array(CompilerDiagnosticSchema).default([]),
  irBytecodeSize: z.number().int().nonnegative().default(0),
});
export type CompilationResult = z.infer<typeof CompilationResultSchema>;

export const DiagnosticEventSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  componentId: UUIDSchema,
  timestamp: z.string().default(() => new Date().toISOString()),
  severity: z.enum(["FATAL", "CRITICAL", "WARNING", "INFO"]),
  category: z.enum(["LOGIC", "COMMUNICATION", "HARDWARE", "SAFETY", "CYCLE_OVERRUN"]),
  message: z.string(),
  causalHypothesis: z.string().optional(),
});
export type DiagnosticEvent = z.infer<typeof DiagnosticEventSchema>;

export const ApplicationSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  controllerId: UUIDSchema,
  name: z.string().min(1),
  taskConfigurations: z.array(TaskConfigurationSchema).default([]),
  pouIds: z.array(UUIDSchema).default([]),
  gvlIds: z.array(UUIDSchema).default([]),
  libraryReferenceIds: z.array(UUIDSchema).default([]),
  isActive: z.boolean().default(true),
});
export type Application = z.infer<typeof ApplicationSchema>;

export const TraceChannelSchema = z.object({
  id: UUIDSchema,
  tagId: UUIDSchema,
  name: z.string().min(1),
  color: z.string().default("#38bdf8"),
  minDisplay: z.number().default(0),
  maxDisplay: z.number().default(100),
});
export type TraceChannel = z.infer<typeof TraceChannelSchema>;

export const TraceConfigurationSchema = z.object({
  id: UUIDSchema,
  projectId: UUIDSchema,
  name: z.string().min(1),
  sampleIntervalMs: z.number().int().positive().default(10),
  bufferDepthSamples: z.number().int().positive().default(1000),
  triggerTagId: UUIDSchema.optional(),
  triggerCondition: z.enum(["RISING_EDGE", "FALLING_EDGE", "THRESHOLD", "CONTINUOUS"]).default("CONTINUOUS"),
  triggerThreshold: z.number().default(0),
  preTriggerSamples: z.number().int().nonnegative().default(100),
  channels: z.array(TraceChannelSchema).default([]),
});
export type TraceConfiguration = z.infer<typeof TraceConfigurationSchema>;

export const X509CertificateSchema = z.object({
  id: UUIDSchema,
  controllerId: UUIDSchema.optional(),
  subject: z.string().min(1),
  issuer: z.string().min(1),
  serialNumber: z.string().min(1),
  thumbprintSha256: z.string().default(""),
  validFrom: z.string(),
  validTo: z.string(),
  purpose: z.enum(["TLS_SERVER", "TLS_CLIENT", "OPC_UA", "CODE_SIGNING"]),
  trustStatus: z.enum(["TRUSTED", "UNTRUSTED", "REVOKED", "EXPIRED"]).default("TRUSTED"),
  csrMetadata: z.string().optional(),
});
export type X509Certificate = z.infer<typeof X509CertificateSchema>;

export const DigitalTwinSyncStatusSchema = z.enum(["SYNCHRONIZED", "DRIFT_DETECTED", "DESYNCHRONIZED", "OFFLINE"]);
export type DigitalTwinSyncStatus = z.infer<typeof DigitalTwinSyncStatusSchema>;

export const DigitalTwinStateSchema = z.object({
  deviceId: UUIDSchema,
  observedState: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  declaredState: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  inferredState: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  lastSyncTimestamp: z.string().default(() => new Date().toISOString()),
  syncStatus: DigitalTwinSyncStatusSchema.default("SYNCHRONIZED"),
  driftDetails: z.array(z.string()).default([]),
});
export type DigitalTwinState = z.infer<typeof DigitalTwinStateSchema>;

export const UserRoleSchema = z.enum(["ADMIN", "LEAD_ENGINEER", "OPERATOR", "MAINTENANCE", "AUDITOR"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const RBACPermissionSchema = z.object({
  id: UUIDSchema,
  role: UserRoleSchema,
  resourceType: z.enum(["PROJECT", "CONTROLLER", "POU", "TAG", "ALARM", "RECIPE", "CERTIFICATE"]),
  resourceId: UUIDSchema.optional(),
  canRead: z.boolean().default(true),
  canWrite: z.boolean().default(false),
  canSimulate: z.boolean().default(true),
  canForce: z.boolean().default(false),
});
export type RBACPermission = z.infer<typeof RBACPermissionSchema>;

export const DiffChangeKindSchema = z.enum([
  "ADDED",
  "REMOVED",
  "MODIFIED",
  "RENAMED",
  "MOVED",
  "DEPENDENCY_CHANGED",
]);
export type DiffChangeKind = z.infer<typeof DiffChangeKindSchema>;

export const PropertyDiffSchema = z.object({
  oldValue: z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]).optional(),
  newValue: z.union([z.string(), z.number(), z.boolean(), z.null(), z.undefined()]).optional(),
});
export type PropertyDiff = z.infer<typeof PropertyDiffSchema>;

export const ProjectDiffItemSchema = z.object({
  entityId: UUIDSchema,
  entityType: z.string(),
  entityName: z.string(),
  changeKind: DiffChangeKindSchema,
  propertyDiffs: z.record(PropertyDiffSchema).default({}),
  description: z.string(),
});
export type ProjectDiffItem = z.infer<typeof ProjectDiffItemSchema>;

// ----------------------------------------------------------------------------
// 11. O Modelo Central: IndustrialProject & ProjectVersion
// ----------------------------------------------------------------------------
export const ProjectVersionSchema = z.object({
  versionNumber: z.number().int().positive(),
  commitMessage: z.string().default(""),
  author: z.string().default("Engineer"),
  timestamp: z.string().default(() => new Date().toISOString()),
  checksumSha256: z.string().default(""),
});
export type ProjectVersion = z.infer<typeof ProjectVersionSchema>;

export const IndustrialProjectSchema = z.object({
  id: UUIDSchema,
  tenantId: UUIDSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  activeVersion: z.number().int().positive().default(1),
  versionsHistory: z.array(ProjectVersionSchema).default([]),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),

  // Árvores e Controladores
  controllers: z.array(ControllerSchema).default([]),
  devices: z.array(DeviceSchema).default([]),
  applications: z.array(ApplicationSchema).default([]),
  taskConfigurations: z.array(TaskConfigurationSchema).default([]),

  // Elementos IEC de Software
  pous: z.array(POUSchema).default([]),
  dataTypes: z.array(DataTypeDefinitionSchema).default([]),
  globalVariableLists: z.array(GlobalVariableListSchema).default([]),

  // Tags e I/O Canônico
  tags: z.array(TagSchema).default([]),

  // Visualização e Operação
  hmiPages: z.array(HMIPageSchema).default([]),
  alarmDefinitions: z.array(AlarmDefinitionSchema).default([]),
  trendDefinitions: z.array(TrendDefinitionSchema).default([]),
  traceConfigurations: z.array(TraceConfigurationSchema).default([]),
  recipeDefinitions: z.array(RecipeDefinitionSchema).default([]),

  // Fieldbus e Comunicação
  protocolConfigurations: z.array(ProtocolConfigurationSchema).default([]),

  // Motion
  motionAxes: z.array(MotionAxisSchema).default([]),
  motionGroups: z.array(MotionGroupSchema).default([]),

  // Bibliotecas e Relações
  libraryReferences: z.array(LibraryReferenceSchema).default([]),
  dependencyGraph: DependencyGraphSchema.optional(),

  // Simulação e Diagnósticos
  simulationScenarios: z.array(SimulationScenarioSchema).default([]),
  lastCompilationResult: CompilationResultSchema.optional(),
  diagnosticEvents: z.array(DiagnosticEventSchema).default([]),

  // Gestão de Frota, Segurança e Digital Twin
  certificates: z.array(X509CertificateSchema).default([]),
  digitalTwinStates: z.array(DigitalTwinStateSchema).default([]),
  rbacPermissions: z.array(RBACPermissionSchema).default([]),
});
export type IndustrialProject = z.infer<typeof IndustrialProjectSchema>;
