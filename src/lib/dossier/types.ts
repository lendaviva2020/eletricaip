// Types and data contracts for the ElétricAi Engineering Dossier
// Single Source of Truth from Canvas: Unifilar, Multifilar, Ladder, FBD, SCADA

export type DossierScope = "unifilar" | "multifilar" | "ladder" | "fbd" | "scada" | "hybrid";

export type CircuitType =
  | "feeder"
  | "distribution"
  | "motor_branch"
  | "lighting_branch"
  | "socket_branch"
  | "control_24vdc"
  | "safety_chain";

export type BomGroupCategory =
  | "1_protecao_eletrica"
  | "2_manobra_comando"
  | "3_motores_acionamentos"
  | "4_clp_modulos_interfaces"
  | "5_sensores_instrumentacao"
  | "6_cabos_condutores"
  | "7_bornes_acessorios"
  | "8_paineis_barramentos_montagem"
  | "9_dispositivos_seguranca"
  | "10_identificacao_documentacao";

export const BOM_GROUP_NAMES: Record<BomGroupCategory, { pt: string; en: string }> = {
  "1_protecao_eletrica": {
    pt: "1. Proteção Elétrica",
    en: "1. Electrical Protection",
  },
  "2_manobra_comando": {
    pt: "2. Manobra e Comando",
    en: "2. Switching and Control",
  },
  "3_motores_acionamentos": {
    pt: "3. Motores e Acionamentos",
    en: "3. Motors and Drives",
  },
  "4_clp_modulos_interfaces": {
    pt: "4. CLP, Módulos e Interfaces",
    en: "4. PLC, Modules and Interfaces",
  },
  "5_sensores_instrumentacao": {
    pt: "5. Sensores e Instrumentação",
    en: "5. Sensors and Instrumentation",
  },
  "6_cabos_condutores": {
    pt: "6. Cabos e Condutores",
    en: "6. Cables and Conductors",
  },
  "7_bornes_acessorios": {
    pt: "7. Bornes e Acessórios",
    en: "7. Terminal Blocks and Accessories",
  },
  "8_paineis_barramentos_montagem": {
    pt: "8. Painéis, Barramentos e Montagem",
    en: "8. Enclosures, Busbars and Assembly",
  },
  "9_dispositivos_seguranca": {
    pt: "9. Dispositivos de Segurança",
    en: "9. Safety Devices",
  },
  "10_identificacao_documentacao": {
    pt: "10. Identificação, Montagem e Documentação",
    en: "10. Identification, Mounting and Documentation",
  },
};

export type BomItemSource =
  | "canvas_identified"
  | "calculated_derived"
  | "recommended_pending"
  | "incomplete_specification"
  | "commercial_selection_pending";

export type BomValidationState =
  | "validated"
  | "pending_catalog_selection"
  | "requires_review";

export interface BomItem {
  id: string;
  tag: string;
  description: string;
  category: BomGroupCategory;
  quantity: number;
  unit: string;
  manufacturer?: string;
  modelOrCatalog?: string;
  nominalVoltage?: string;
  nominalCurrent?: string;
  nominalPower?: string;
  poles?: number;
  breakingCapacityKa?: number;
  tripCurve?: string;
  utilizationCategory?: string;
  controlVoltage?: string;
  protectionDegree?: string;
  conductorSectionMm2?: number;
  conductorLengthM?: number;
  conductorMaterial?: "Cu" | "Al";
  insulationType?: "PVC" | "EPR" | "XLPE";
  accessories?: string[];
  circuitRef?: string;
  sourceEquipmentId?: string;
  sourceKind: BomItemSource;
  validationStatus: BomValidationState;
  notes?: string;
  unitPriceEstimatedBRL?: number;
}

// ── Multi-line Wiring and Terminal Models ────────────────────────────────────

export interface ConductorScheduleRow {
  circuitCode: string;
  wireTag: string;
  phaseOrFunction: "L1" | "L2" | "L3" | "N" | "PE" | "24V+" | "0V" | "SIGNAL";
  crossSectionMm2: number;
  material: "Cu" | "Al";
  insulation: "PVC" | "EPR" | "XLPE";
  fromEquipment: string;
  fromTerminal: string;
  toEquipment: string;
  toTerminal: string;
  lengthM: number;
  voltageDropPct?: number;
}

export interface TerminalBlockTerminal {
  blockId: string; // e.g. "X1"
  terminalNumber: number; // e.g. 1, 2, 3...
  wireTag: string;
  internalEquipment: string;
  internalTerminal: string;
  externalEquipment: string;
  externalTerminal: string;
  signalType: "power" | "control" | "analog" | "pe" | "neutral";
}

// ── PLC Automation Model ────────────────────────────────────────────────────

export interface PlcIoMapping {
  address: string; // %I0.0, %Q0.0, %IW64, %QW64
  channel: string;
  direction: "DI" | "DO" | "AI" | "AO";
  symbolicTag: string;
  description: string;
  boundEquipmentId?: string;
  boundRole?: string;
  signalType: string;
  slotNumber: number;
  modulePartNumber?: string;
}

export interface LadderNetworkDoc {
  networkNumber: number;
  title: string;
  functionalDescription: string;
  rungsCount: number;
  tagsUsed: string[];
  hasSafetyInterlock: boolean;
  codeIlPreview?: string;
  codeStPreview?: string;
}

export interface PlcProgramDoc {
  vendor: string;
  rackName: string;
  cpuModel: string;
  ioModules: Array<{
    slot: number;
    partNumber: string;
    description: string;
    channelsCount: number;
    type: "DI" | "DO" | "AI" | "AO";
  }>;
  ioMappings: PlcIoMapping[];
  networks: LadderNetworkDoc[];
  safetyChainDocumented: boolean;
  estopPresent: boolean;
  plcopenXmlSupported: boolean;
}

// ── Deterministic Electrical Calculation Memory ─────────────────────────────

export interface CircuitCalculation {
  circuitCode: string;
  description: string;
  circuitType: CircuitType;
  phases: string;
  powerKw: number;
  voltageV: number;
  powerFactor: number;
  efficiency: number;
  designCurrentIbA: number;
  
  // Condutor por capacidade de condução (NBR 5410 Tabelas 36-38, 40, 42)
  installationMethod: string;
  insulation: "PVC" | "EPR" | "XLPE";
  ambientTempC: number;
  tempFactorKt: number;
  groupedCircuits: number;
  groupFactorKg: number;
  selectedCableMm2: number;
  nominalAmpacityIzA: number;
  correctedAmpacityIzA: number;
  ampacityCheckPass: boolean;

  // Condutor por queda de tensão (NBR 5410 §6.2.7)
  lengthM: number;
  resistanceOhmPerM: number;
  reactanceOhmPerM: number;
  voltageDropV: number;
  voltageDropPct: number;
  maxAllowedVoltageDropPct: number;
  voltageDropPass: boolean;

  // Condutores de Neutro e PE (NBR 5410 §6.2.6 e Tabela 58)
  neutralCableMm2: number;
  peCableMm2: number;

  // Proteção
  breakerRatingInA: number;
  breakerCurve: "B" | "C" | "D" | "MA";
  breakingCapacityIcuKa: number;
  presumedIccKa: number;
  protectionCoordinationPass: boolean; // Ib <= In <= I'z

  // Motor / Carga Específica
  startMethod?: "DOL" | "STAR_DELTA" | "SOFT" | "VFD";
  startingCurrentIstartA?: number;
  overloadRelaySettingA?: number;

  calculationNotes: string[];
}

export interface ElectricalCalculationMemory {
  summary: {
    totalInstalledPowerKw: number;
    totalDemandPowerKw: number;
    demandFactor: number;
    totalApparentPowerKva: number;
    systemVoltageV: number;
    nominalFrequencyHz: number;
    earthingScheme: string;
    recommendedTransformerKva: number;
    mainFeederCurrentIbA: number;
    mainFeederCableMm2: number;
    mainBreakerRatingInA: number;
    mainBreakerIcuKa: number;
  };
  circuits: CircuitCalculation[];
  calculationAssumptions: string[];
  standardsApplied: Array<{
    standard: string;
    edition: string;
    clauses: string[];
  }>;
}

// ── Normative Validation Engine ─────────────────────────────────────────────

export type NormativeResultState =
  | "VALIDADO"
  | "REPROVADO"
  | "PENDENTE"
  | "NAO_APLICAVEL"
  | "REVISAO_PROFISSIONAL_NECESSARIA";

export interface NormativeFinding {
  id: string;
  code: string;
  standard: string;
  edition: string;
  clause: string;
  status: NormativeResultState;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  evidence: string;
  involvedEntityId?: string;
  involvedCircuit?: string;
  correctiveAction: string;
  isResolved: boolean;
  testToConfirm: string;
}

export interface NormativeValidationReport {
  overallStatus: "approved" | "blocked_by_critical_findings" | "pending_user_input";
  evaluationDate: string;
  standardsEvaluated: string[];
  summary: {
    totalChecked: number;
    validatedCount: number;
    reprovedCount: number;
    pendingCount: number;
    notApplicableCount: number;
    requiresProfessionalReviewCount: number;
  };
  findings: NormativeFinding[];
}

// ── Engineering Dossier Metadata & Formal Approval ──────────────────────────

export interface EngineeringApproval {
  engineerName: string;
  professionalRegistration: string; // CREA / CFT
  issueDate: string;
  revision: number;
  isApproved: boolean;
  approvalNotes?: string;
  blockingReasons?: string[];
}

export interface CompleteEngineeringDossier {
  dossierId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  description: string;
  scope: DossierScope;
  createdAt: string;
  revision: number;
  
  approval: EngineeringApproval;
  calculationMemory: ElectricalCalculationMemory;
  normativeReport: NormativeValidationReport;
  bom: BomItem[];
  conductorsSchedule: ConductorScheduleRow[];
  terminalsSchedule: TerminalBlockTerminal[];
  plcProgram: PlcProgramDoc;
  
  // Pending missing inputs requiring engineer resolution
  pendingInputs: Array<{
    id: string;
    entityId: string;
    label: string;
    missingField: string;
    recommendedDefault: string | number;
    impact: string;
  }>;
}
