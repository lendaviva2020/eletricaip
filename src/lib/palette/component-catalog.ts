export const VOLTAI_COLORS = {
  power: "#E53E3E",
  control: "#D4A017",
  signal: "#2563EB",
  neutral: "#6B7280",
} as const;

export type VoltaiTerminalRole = keyof typeof VOLTAI_COLORS;
export type VoltaiTerminalSide = "left" | "right" | "top" | "bottom";
export type VoltaiParamType = "number" | "boolean" | "select" | "time";
export type VoltaiComponentType =
  | "QF"
  | "QS"
  | "DR"
  | "FU"
  | "SPD"
  | "KM"
  | "KA"
  | "FR"
  | "M"
  | "SS"
  | "VFD"
  | "TR"
  | "PS"
  | "PLC"
  | "KT"
  | "CT"
  | "BC"
  | "PT"
  | "TT"
  | "LT"
  | "FT"
  | "G"
  | "UPS"
  | "TC"
  | "TP"
  | "MPCB"
  | "CR"
  | "PFC"
  | "KWH"
  | "IED"
  | "SA"
  | "ES"
  | "HL"
  | "HZ"
  | "R"
  | "L"
  | "TCTERRA"
  | "TVSS"
  | "B"
  | "SR"
  | "PTZ"
  | "FL"
  | "PSW"
  | "LS"
  | "V"
  | "ESTOP_RELAY"
  | "MCB_AUX"
  | "SIN";

export interface VoltaiTerminal {
  id: string;
  label?: string;
  role: VoltaiTerminalRole;
  side: VoltaiTerminalSide;
  direction: "input" | "output" | "bidirectional";
}

export interface VoltaiSimulationState {
  energized: boolean;
  tripped?: boolean;
  open?: boolean;
  failed?: boolean;
  blown?: boolean;
  running?: boolean;
  currentA: number;
  voltageV: number;
  elapsedMs: number;
  thermalMs?: number;
  i2tA2s?: number;
  coilEnergized?: boolean;
  contactClosed?: boolean;
  count?: number;
  batteryRemainingMin?: number;
  activeStages?: number;
  output?: number | boolean | string;
  alarm?: string;
  timerMode?: "idle" | "timing" | "done" | "pulse";
  pulseRemainingMs?: number;
  lastInput?: boolean;
  lastCountInput?: boolean;
}

export interface ParamSpec {
  key: string;
  label: string;
  type: VoltaiParamType;
  unit?: string;
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  options?: { label: string; value: string }[];
  normRef?: string;
}

export interface VoltaiComponentDefinition<
  TParams extends Record<string, unknown> = Record<string, unknown>,
> {
  type: VoltaiComponentType;
  tagPrefix: string;
  name: string;
  category:
    | "Protecao"
    | "Potencia"
    | "Controle"
    | "Sinal"
    | "Medicao"
    | "Seguranca"
    | "Carga"
    | "Fonte";
  standard: string[];
  params: TParams;
  paramSpecs?: Record<string, ParamSpec>;
  bornes: VoltaiTerminal[];
  simulationState: VoltaiSimulationState;
}

export interface QFParams {
  poles: 1 | 2 | 3;
  ratedCurrent: number;
  ratedVoltage: number;
  breakingCapacity: number;
  curve: "B" | "C" | "D";
  thermalDelay: number;
  magneticInstant: string;
  auxContact: string;
}
export interface QSParams {
  poles: 1 | 2 | 3;
  ratedCurrent: number;
  ratedVoltage: number;
  auxContact: string;
}
export interface DRParams {
  poles: 2 | 4;
  ratedCurrent: number;
  sensitivity: number;
  tripTime: number;
  type: "AC" | "A" | "B";
}
export interface FUParams {
  ratedCurrent: number;
  ratedVoltage: number;
  breakingCapacity: number;
  characteristic: "gG" | "aM";
  i2t: number;
}
export interface SPDParams {
  class: "I" | "II" | "III";
  maxDischargeCurrent: number;
  voltageProtectionLevel: number;
  responseTime: number;
}
export interface KMParams {
  ratedCurrentAC3: number;
  coilVoltage: number;
  coilConsumption: number;
  auxContacts: string;
  pullInTime: number;
  dropOutTime: number;
}
export interface KAParams {
  coilVoltage: number;
  contacts: string;
  pullInTime: number;
  dropOutTime: number;
}
export interface FRParams {
  currentRange: string;
  tripClass: 10 | 20 | 30;
  resetMode: "manual" | "auto";
  phaseLossSensitivity: boolean;
}
export interface MParams {
  ratedPower: number;
  ratedVoltage: number;
  ratedCurrent: number;
  frequency: number;
  rpm: number;
  efficiency: number;
  powerFactor: number;
  startingCurrentRatio: number;
  startingTime: number;
  insulationClass: "B" | "F" | "H";
  serviceFactor: number;
}
export interface SSParams {
  ratedCurrent: number;
  initialVoltage: number;
  rampUpTime: number;
  rampDownTime: number;
  currentLimit: number;
  kickStart: string;
}
export interface VFDParams {
  ratedPower: number;
  outputFrequency: string;
  accelTime: number;
  decelTime: number;
  minFreq: number;
  maxFreq: number;
  controlMode: "V/f" | "vetorial";
  pidEnable: boolean;
}
export interface TRParams {
  ratedPower: number;
  primaryVoltage: number;
  secondaryVoltage: number;
  vectorGroup: string;
  impedance: number;
  cooling: string;
  taps: string;
}
export interface PSParams {
  inputVoltage: string;
  outputVoltage: number;
  ratedCurrent: number;
  power: number;
  efficiency: number;
}
export interface PLCParams {
  model: string;
  scanCycle: number;
  memory: number;
  communication: string;
}
export interface KTParams {
  function: "on-delay" | "off-delay" | "intervalo";
  timeRange: string;
  setTime: number;
  contactRating: number;
  pulseMode: boolean;
  pulseDuration: number;
}
export interface CTParams {
  preset: number;
  countDirection: "up" | "down";
  outputMode: "mantido" | "pulso 0.5s";
}
export interface BCParams {
  ratedPower: number;
  stages: number;
  controlMode: string;
}
export interface SensorParams {
  rangeMin: number;
  rangeMax: number;
  outputSignal: string;
  alarmLow: number;
  alarmHigh: number;
  responseTime: number;
}

const powerIn = (ids: string[], side: VoltaiTerminalSide = "left"): VoltaiTerminal[] =>
  ids.map((id) => ({
    id,
    role: id === "N" || id === "PE" ? "neutral" : "power",
    side,
    direction: "input",
  }));
const powerOut = (ids: string[], side: VoltaiTerminalSide = "right"): VoltaiTerminal[] =>
  ids.map((id) => ({
    id,
    role: id === "N" || id === "PE" ? "neutral" : "power",
    side,
    direction: "output",
  }));
const control = (
  ids: string[],
  side: VoltaiTerminalSide,
  direction: VoltaiTerminal["direction"] = "bidirectional",
): VoltaiTerminal[] => ids.map((id) => ({ id, role: "control", side, direction }));
const signal = (
  ids: string[],
  side: VoltaiTerminalSide,
  direction: VoltaiTerminal["direction"] = "bidirectional",
): VoltaiTerminal[] => ids.map((id) => ({ id, role: "signal", side, direction }));
const state = (extra: Partial<VoltaiSimulationState> = {}): VoltaiSimulationState => ({
  energized: false,
  currentA: 0,
  voltageV: 0,
  elapsedMs: 0,
  ...extra,
});

export const VOLTAI_COMPONENT_DEFINITIONS = [
  {
    type: "QF",
    tagPrefix: "QF",
    name: "Disjuntor Termomagnetico",
    category: "Protecao",
    standard: ["IEC 60617", "NBR 5410", "NR-10"],
    params: {
      poles: 3,
      ratedCurrent: 100,
      ratedVoltage: 400,
      breakingCapacity: 25,
      curve: "C",
      thermalDelay: 300,
      magneticInstant: "5..10 x In",
      auxContact: "1NA+1NF",
    } satisfies QFParams,
    bornes: [...powerIn(["L1", "L2", "L3"]), ...powerOut(["T1", "T2", "T3"])],
    simulationState: state({ open: false }),
  },
  {
    type: "QS",
    tagPrefix: "QS",
    name: "Seccionadora",
    category: "Protecao",
    standard: ["IEC 60617", "IEC 60947-3"],
    params: {
      poles: 3,
      ratedCurrent: 160,
      ratedVoltage: 400,
      auxContact: "1NA+1NF",
    } satisfies QSParams,
    bornes: [...powerIn(["L1", "L2", "L3"]), ...powerOut(["T1", "T2", "T3"])],
    simulationState: state({ open: false }),
  },
  {
    type: "DR",
    tagPrefix: "DR",
    name: "Dispositivo Diferencial Residual",
    category: "Protecao",
    standard: ["NBR 5410", "IEC 61008"],
    params: {
      poles: 2,
      ratedCurrent: 40,
      sensitivity: 30,
      tripTime: 40,
      type: "AC",
    } satisfies DRParams,
    bornes: [...powerIn(["L1", "N"]), ...powerOut(["T1", "Nout"])],
    simulationState: state(),
  },
  {
    type: "FU",
    tagPrefix: "FU",
    name: "Fusivel",
    category: "Protecao",
    standard: ["IEC 60617", "IEC 60269"],
    params: {
      ratedCurrent: 16,
      ratedVoltage: 500,
      breakingCapacity: 100,
      characteristic: "gG",
      i2t: 200,
    } satisfies FUParams,
    bornes: [...powerIn(["in"]), ...powerOut(["out"])],
    simulationState: state({ i2tA2s: 0 }),
  },
  {
    type: "SPD",
    tagPrefix: "SPD",
    name: "Protetor contra Surtos",
    category: "Protecao",
    standard: ["NBR 5410", "IEC 61643"],
    params: {
      class: "II",
      maxDischargeCurrent: 40,
      voltageProtectionLevel: 1.5,
      responseTime: 25,
    } satisfies SPDParams,
    bornes: [...powerIn(["L1", "L2", "L3", "N"]), ...powerOut(["PE"])],
    simulationState: state(),
  },
  {
    type: "KM",
    tagPrefix: "KM",
    name: "Contator",
    category: "Controle",
    standard: ["IEC 60617", "IEC 60947-4-1"],
    params: {
      ratedCurrentAC3: 32,
      coilVoltage: 24,
      coilConsumption: 5,
      auxContacts: "2NA+2NF",
      pullInTime: 20,
      dropOutTime: 10,
    } satisfies KMParams,
    bornes: [
      ...powerIn(["L1", "L2", "L3"]),
      ...powerOut(["T1", "T2", "T3"]),
      ...control(["A1", "A2"], "left"),
    ],
    simulationState: state({ coilEnergized: false, contactClosed: false }),
  },
  {
    type: "KA",
    tagPrefix: "KA",
    name: "Rele Auxiliar",
    category: "Controle",
    standard: ["IEC 60617", "IEC 61810"],
    params: {
      coilVoltage: 24,
      contacts: "4NA+4NF",
      pullInTime: 8,
      dropOutTime: 5,
    } satisfies KAParams,
    bornes: [...control(["A1", "A2"], "left"), ...control(["11", "12", "13", "14"], "right")],
    simulationState: state({ coilEnergized: false, contactClosed: false }),
  },
  {
    type: "FR",
    tagPrefix: "FR",
    name: "Rele Termico de Sobrecarga",
    category: "Protecao",
    standard: ["IEC 60617", "IEC 60947-4-1"],
    params: {
      currentRange: "23-32 A",
      tripClass: 10,
      resetMode: "manual",
      phaseLossSensitivity: true,
    } satisfies FRParams,
    bornes: [
      ...powerIn(["L1", "L2", "L3"]),
      ...powerOut(["T1", "T2", "T3"]),
      ...control(["95", "96", "97", "98"], "right"),
    ],
    simulationState: state(),
  },
  {
    type: "M",
    tagPrefix: "M",
    name: "Motor Eletrico",
    category: "Carga",
    standard: ["IEC 60617", "IEC 60034"],
    params: {
      ratedPower: 7.5,
      ratedVoltage: 400,
      ratedCurrent: 14.5,
      frequency: 60,
      rpm: 1750,
      efficiency: 90,
      powerFactor: 0.85,
      startingCurrentRatio: 6.5,
      startingTime: 8,
      insulationClass: "F",
      serviceFactor: 1.15,
    } satisfies MParams,
    bornes: [
      ...powerIn(["U1", "V1", "W1"]),
      ...powerOut(["PE"]),
      ...signal(["PTC"], "right", "output"),
    ],
    simulationState: state({ running: false }),
  },
  {
    type: "SS",
    tagPrefix: "SS",
    name: "Soft-Starter",
    category: "Controle",
    standard: ["IEC 60947-4-2"],
    params: {
      ratedCurrent: 45,
      initialVoltage: 30,
      rampUpTime: 10,
      rampDownTime: 5,
      currentLimit: 300,
      kickStart: "80% / 0.5 s",
    } satisfies SSParams,
    bornes: [
      ...powerIn(["R", "S", "T"]),
      ...powerOut(["U", "V", "W"]),
      ...control(["A1", "A2"], "left"),
      ...signal(["DI1", "DO1", "AO"], "right"),
    ],
    simulationState: state(),
  },
  {
    type: "VFD",
    tagPrefix: "VFD",
    name: "Inversor de Frequencia",
    category: "Controle",
    standard: ["IEC 61800"],
    params: {
      ratedPower: 11,
      outputFrequency: "0-120",
      accelTime: 5,
      decelTime: 5,
      minFreq: 15,
      maxFreq: 60,
      controlMode: "V/f",
      pidEnable: false,
    } satisfies VFDParams,
    bornes: [
      ...powerIn(["L1", "L2", "L3"]),
      ...powerOut(["U", "V", "W"]),
      ...signal(["DI1", "DI2", "DI3", "AI1", "AI2"], "left", "input"),
      ...signal(["DO1", "DO2", "AO1"], "right", "output"),
    ],
    simulationState: state(),
  },
  {
    type: "TR",
    tagPrefix: "TR",
    name: "Transformador de Potencia",
    category: "Potencia",
    standard: ["IEC 60617", "IEC 60076"],
    params: {
      ratedPower: 500,
      primaryVoltage: 13.8,
      secondaryVoltage: 0.38,
      vectorGroup: "Dyn11",
      impedance: 5,
      cooling: "ONAN",
      taps: "+/-2.5%",
    } satisfies TRParams,
    bornes: [...powerIn(["H1", "H2", "H3"]), ...powerOut(["X1", "X2", "X3"])],
    simulationState: state(),
  },
  {
    type: "PS",
    tagPrefix: "PS",
    name: "Fonte Chaveada DC",
    category: "Fonte",
    standard: ["IEC 61204"],
    params: {
      inputVoltage: "100-240",
      outputVoltage: 24,
      ratedCurrent: 5,
      power: 120,
      efficiency: 90,
    } satisfies PSParams,
    bornes: [...powerIn(["L", "N"]), ...control(["+24V", "0V"], "right", "output")],
    simulationState: state(),
  },
  {
    type: "PLC",
    tagPrefix: "PLC",
    name: "Controlador Logico Programavel",
    category: "Controle",
    standard: ["IEC 61131-3"],
    params: {
      model: "S7-1200",
      scanCycle: 10,
      memory: 125,
      communication: "Modbus TCP, OPC-UA",
    } satisfies PLCParams,
    bornes: [
      ...signal(
        Array.from({ length: 16 }, (_, i) => `DI${i}`),
        "left",
        "input",
      ),
      ...signal(
        Array.from({ length: 4 }, (_, i) => `AI${i}`),
        "left",
        "input",
      ),
      ...signal(
        Array.from({ length: 16 }, (_, i) => `DO${i}`),
        "right",
        "output",
      ),
      ...signal(["AO0", "AO1", "ETH"], "right", "output"),
    ],
    simulationState: state(),
  },
  {
    type: "KT",
    tagPrefix: "KT",
    name: "Temporizador",
    category: "Controle",
    standard: ["IEC 61812"],
    params: {
      function: "on-delay",
      timeRange: "1-10",
      setTime: 5,
      contactRating: 5,
      pulseMode: false,
      pulseDuration: 0.5,
    } satisfies KTParams,
    bornes: [
      ...control(["A1", "A2"], "left"),
      ...signal(["Y1"], "left", "input"),
      ...control(["15", "16", "18"], "right"),
    ],
    simulationState: state({ contactClosed: false }),
  },
  {
    type: "CT",
    tagPrefix: "CT",
    name: "Contador de Pulsos",
    category: "Controle",
    standard: ["IEC 61131-3"],
    params: { preset: 100, countDirection: "up", outputMode: "mantido" } satisfies CTParams,
    bornes: [
      ...control(["A1", "A2"], "left"),
      ...signal(["INP", "RST"], "left", "input"),
      ...signal(["OUT"], "right", "output"),
    ],
    simulationState: state({ count: 0 }),
  },
  {
    type: "BC",
    tagPrefix: "BC",
    name: "Banco de Capacitores",
    category: "Potencia",
    standard: ["IEC 60831"],
    params: { ratedPower: 50, stages: 3, controlMode: "automatico FP 0.95" } satisfies BCParams,
    bornes: powerIn(["L1", "L2", "L3"]),
    simulationState: state({ activeStages: 0 }),
  },
  ...(["PT", "TT", "LT", "FT"] as const).map((type) => ({
    type,
    tagPrefix: type,
    name: `${type} Sensor`,
    category: "Sinal" as const,
    standard: ["IEC 60381"],
    params: {
      rangeMin: 0,
      rangeMax: type === "TT" ? 200 : 100,
      outputSignal: "4-20 mA",
      alarmLow: 10,
      alarmHigh: 90,
      responseTime: 250,
    } satisfies SensorParams,
    bornes: signal(["AI+", "AI-"], "right", "output"),
    simulationState: state({ output: 4 }),
  })),
  {
    type: "G",
    tagPrefix: "G",
    name: "Gerador Sincrono",
    category: "Fonte",
    standard: ["IEC 60034"],
    params: {
      ratedPower: 250,
      ratedVoltage: "380/220",
      frequency: 60,
      rpm: 1800,
      powerFactor: 0.8,
      startDelay: 5,
      coolDownTime: 120,
      voltageRegulation: "1%",
    },
    bornes: [...powerOut(["U", "V", "W", "N"]), ...signal(["D+", "D-", "RPM", "TEMP"], "right")],
    simulationState: state({ running: false }),
  },
  {
    type: "UPS",
    tagPrefix: "UPS",
    name: "UPS Online",
    category: "Fonte",
    standard: ["IEC 62040"],
    params: {
      powerVA: 10,
      technology: "dupla conversao online",
      batteryAutonomy: 15,
      transferTime: 0,
      outputVoltage: 220,
      batteryVoltage: 240,
      rechargeTime: 4,
    },
    bornes: [
      ...powerIn(["Lin", "Nin"]),
      ...powerIn(["BAT+", "BAT-"], "left"),
      ...powerOut(["Lout", "Nout"]),
    ],
    simulationState: state({ batteryRemainingMin: 15 }),
  },
  {
    type: "TC",
    tagPrefix: "TC",
    name: "Transformador de Corrente",
    category: "Medicao",
    standard: ["IEC 61869-2"],
    params: {
      primaryCurrent: 600,
      secondaryCurrent: 5,
      accuracyClass: "0.5",
      protectionClass: "5P20",
      burden: 15,
      ratedFrequency: 60,
      thermalCurrent: "1.2 x In",
    },
    bornes: [...powerIn(["P1", "P2"]), ...signal(["S1", "S2", "S3", "S4"], "right", "output")],
    simulationState: state(),
  },
  {
    type: "TP",
    tagPrefix: "TP",
    name: "Transformador de Potencial",
    category: "Medicao",
    standard: ["IEC 61869-3"],
    params: {
      primaryVoltage: 13.8,
      secondaryVoltage: 115,
      accuracyClass: "0.5",
      burden: 25,
      ratedFrequency: 60,
    },
    bornes: [...powerIn(["A", "B"]), ...signal(["a", "b", "da", "dn"], "right", "output")],
    simulationState: state(),
  },
  {
    type: "MPCB",
    tagPrefix: "MPCB",
    name: "Disjuntor Motor",
    category: "Protecao",
    standard: ["IEC 60947-4-1"],
    params: {
      poles: 3,
      ratedCurrent: "6.3-10",
      breakingCapacity: 100,
      tripClass: 10,
      phaseLossProtection: true,
      auxContact: "1NA+1NF",
    },
    bornes: [...powerIn(["L1", "L2", "L3"]), ...powerOut(["T1", "T2", "T3"])],
    simulationState: state(),
  },
  {
    type: "CR",
    tagPrefix: "CR",
    name: "Rele de Controle",
    category: "Controle",
    standard: ["IEC 61810"],
    params: {
      coilVoltage: 24,
      contacts: "4NA+4NF",
      pullInTime: 8,
      dropOutTime: 5,
      timerFunction: "none",
      timerRange: "0.5-10",
    },
    bornes: [...control(["A1", "A2"], "left"), ...control(["11", "12", "13", "14"], "right")],
    simulationState: state({ coilEnergized: false }),
  },
  {
    type: "PFC",
    tagPrefix: "PFC",
    name: "Controlador FP",
    category: "Controle",
    standard: ["IEC 61921"],
    params: {
      targetPF: 0.95,
      stages: 4,
      reconnectionDelay: 30,
      disconnectionDelay: 15,
      sensitivity: 0.01,
      harmonicProtection: "THD > 20%",
    },
    bornes: [
      ...powerIn(["L1", "L2", "L3"]),
      ...signal(["S1", "S2"], "left", "input"),
      ...control(["KA1", "KA2", "KA3", "KA4"], "right", "output"),
    ],
    simulationState: state({ activeStages: 0 }),
  },
  {
    type: "KWH",
    tagPrefix: "kWh",
    name: "Medidor de Energia",
    category: "Medicao",
    standard: ["IEC 62053"],
    params: {
      voltageInput: 380,
      currentInput: 5,
      accuracy: "Classe 0.5S",
      functions: "kWh, kVArh, kVA, FP, Hz",
      pulseOutput: 1000,
      communication: "Modbus RTU 9600 8N1",
    },
    bornes: [...powerIn(["L1", "L2", "L3", "N"]), ...signal(["S1", "S2", "RS485"], "right")],
    simulationState: state({ output: 0 }),
  },
  {
    type: "IED",
    tagPrefix: "IED",
    name: "Rele de Protecao Inteligente",
    category: "Protecao",
    standard: ["IEC 61850", "IEC 60255"],
    params: {
      phasePickup: "1.2 x In",
      neutralPickup: "0.2 x In",
      undervoltage: "0.8 pu 5s",
      overvoltage: "1.1 pu 3s",
      frequency: "57.5/62.5 Hz",
      differential: "0.2 pu",
      thermalTau: "30 min",
    },
    bornes: [
      ...signal(["I1", "I2", "I3", "I0", "V1", "V2", "V3", "VN", "52a", "Reset"], "left", "input"),
      ...signal(["Trip", "Alarm", "Close", "ETH"], "right", "output"),
    ],
    simulationState: state(),
  },
  {
    type: "SA",
    tagPrefix: "SA",
    name: "Chave de Transferencia Automatica",
    category: "Potencia",
    standard: ["IEC 60947-6-1"],
    params: {
      ratedCurrent: 250,
      transferDelay: 3,
      retransferDelay: 300,
      generatorStartDelay: 2,
      voltageThreshold: 0.8,
    },
    bornes: [
      ...powerIn([
        "Rede L1",
        "Rede L2",
        "Rede L3",
        "Rede N",
        "Ger L1",
        "Ger L2",
        "Ger L3",
        "Ger N",
      ]),
      ...powerOut(["Carga L1", "Carga L2", "Carga L3", "Carga N"]),
      ...signal(["DI_Rede_OK", "DI_Ger_OK"], "left"),
      ...signal(["DO_Inicia_Ger", "DO_Transfere"], "right"),
    ],
    simulationState: state(),
  },
  {
    type: "ES",
    tagPrefix: "ES",
    name: "Botao de Emergencia",
    category: "Seguranca",
    standard: ["NR-10", "ISO 13849"],
    params: { contacts: "2NF", forceGuided: true, resetMode: "manual", safetyCategory: "4 / PL e" },
    bornes: control(["11-12", "21-22", "RST"], "right"),
    simulationState: state({ open: false }),
  },
  {
    type: "HL",
    tagPrefix: "HL",
    name: "Sinaleiro",
    category: "Sinal",
    standard: ["IEC 60617"],
    params: { color: "vermelho", voltage: 24, lensType: "LED", flashRate: 1 },
    bornes: control(["X1", "X2"], "left"),
    simulationState: state(),
  },
  {
    type: "HZ",
    tagPrefix: "HZ",
    name: "Campainha Sirene",
    category: "Sinal",
    standard: ["IEC 60617"],
    params: { soundLevel: 90, tone: "pulsante", pulseDuration: 500, voltage: 24 },
    bornes: control(["A1", "A2"], "left"),
    simulationState: state(),
  },
  {
    type: "R",
    tagPrefix: "R",
    name: "Resistor de Carga",
    category: "Carga",
    standard: ["IEC 60617"],
    params: { power: 100, steps: 10, voltage: 380, cooling: "ventilado" },
    bornes: powerIn(["L1", "L2", "L3", "N"]),
    simulationState: state(),
  },
  {
    type: "L",
    tagPrefix: "L",
    name: "Reator Indutor",
    category: "Potencia",
    standard: ["IEC 60617"],
    params: { inductance: 0.5, ratedCurrent: 200, impedance: 3, frequency: 60 },
    bornes: [...powerIn(["Lin"]), ...powerOut(["Lout"])],
    simulationState: state(),
  },
  {
    type: "TCTERRA",
    tagPrefix: "TCT",
    name: "Transformador de Aterramento",
    category: "Potencia",
    standard: ["IEC 60076"],
    params: { ratedVoltage: 13.8, neutralCurrent: 1000, impedance: 15 },
    bornes: [...powerIn(["A", "B", "C"]), ...powerOut(["N", "terra"])],
    simulationState: state(),
  },
  {
    type: "TVSS",
    tagPrefix: "TVSS",
    name: "Supressor de Surtos de Sinal",
    category: "Protecao",
    standard: ["IEC 61643-21"],
    params: { voltageProtectionLevel: 30, maxDischarge: 10, responseTime: 1 },
    bornes: signal(["Linha+", "Linha-", "Terra"], "right"),
    simulationState: state(),
  },
  {
    type: "B",
    tagPrefix: "B",
    name: "Banco de Baterias",
    category: "Fonte",
    standard: ["IEC 60896"],
    params: { capacity: 150, nominalVoltage: 125, technology: "VRLA", autonomy: 8 },
    bornes: control(["+", "-"], "right", "output"),
    simulationState: state(),
  },
  {
    type: "SR",
    tagPrefix: "SR",
    name: "Retificador Carregador",
    category: "Fonte",
    standard: ["IEC 60146"],
    params: { outputVoltage: 125, outputCurrent: 50, chargingMode: "float / boost", boostTime: 30 },
    bornes: [...powerIn(["L", "N"]), ...control(["+", "-"], "right", "output")],
    simulationState: state(),
  },
  {
    type: "PTZ",
    tagPrefix: "PTZ",
    name: "Termostato",
    category: "Sinal",
    standard: ["IEC 60617"],
    params: { setpoint: 40, hysteresis: 5, contactRating: "5 A / 250 V" },
    bornes: control(["C", "NO"], "right"),
    simulationState: state(),
  },
  {
    type: "FL",
    tagPrefix: "FL",
    name: "Fluxostato",
    category: "Sinal",
    standard: ["IEC 60617"],
    params: { setpoint: 10, hysteresis: 2, responseTime: 500 },
    bornes: control(["C", "NO"], "right"),
    simulationState: state(),
  },
  {
    type: "PSW",
    tagPrefix: "PSW",
    name: "Pressostato",
    category: "Sinal",
    standard: ["IEC 60617"],
    params: { setpoint: 6, hysteresis: 1, contactType: "SPDT" },
    bornes: control(["C", "NO"], "right"),
    simulationState: state(),
  },
  {
    type: "LS",
    tagPrefix: "LS",
    name: "Chave de Nivel",
    category: "Sinal",
    standard: ["IEC 60617"],
    params: { setpoint: 80, differential: 5, output: "contato seco" },
    bornes: control(["C", "NO"], "right"),
    simulationState: state(),
  },
  {
    type: "V",
    tagPrefix: "V",
    name: "Valvula Solenoide",
    category: "Carga",
    standard: ["IEC 60617"],
    params: { coilVoltage: 24, power: 8, responseTime: 30, failSafePosition: "NC" },
    bornes: powerIn(["L", "N"]),
    simulationState: state(),
  },
  {
    type: "ESTOP_RELAY",
    tagPrefix: "SR",
    name: "Rele de Seguranca",
    category: "Seguranca",
    standard: ["NR-10", "ISO 13849"],
    params: {
      category: "4 / PL e",
      responseTime: 10,
      resetMode: "manual monitorado",
      contacts: "2NO seguranca",
    },
    bornes: [
      ...signal(["S11", "S12", "S21", "S22"], "left"),
      ...control(["13-14", "23-24"], "right", "output"),
    ],
    simulationState: state(),
  },
  {
    type: "MCB_AUX",
    tagPrefix: "QF",
    name: "Mini Disjuntor Auxiliar",
    category: "Protecao",
    standard: ["NBR 5410"],
    params: { poles: "1+N", ratedCurrent: 6, curve: "C", breakingCapacity: 6, thermalDelay: 180 },
    bornes: powerIn(["L", "N"]),
    simulationState: state(),
  },
  {
    type: "SIN",
    tagPrefix: "SIN",
    name: "Sirene com Voz",
    category: "Sinal",
    standard: ["IEC 60617"],
    params: { messages: 4, volume: 100, pulseDuration: 2 },
    bornes: [...control(["+24V", "GND"], "left"), ...signal(["Trigger"], "left", "input")],
    simulationState: state(),
  },
] as const satisfies readonly VoltaiComponentDefinition[];

export const VOLTAI_COMPONENT_BY_TYPE = Object.fromEntries(
  VOLTAI_COMPONENT_DEFINITIONS.map((component) => [component.type, component]),
) as unknown as Record<VoltaiComponentType, VoltaiComponentDefinition>;

const LABELS: Record<string, string> = {
  ratedCurrent: "Corrente nominal",
  ratedVoltage: "Tensao nominal",
  breakingCapacity: "Capacidade de interrupcao",
  thermalDelay: "Delay termico",
  magneticInstant: "Disparo magnetico",
  i2t: "Limite I2t",
  setTime: "Tempo ajustado",
  pulseDuration: "Duracao do pulso",
  preset: "Preset",
  countDirection: "Direcao de contagem",
  outputMode: "Modo de saida",
};

const UNITS: Record<string, string> = {
  ratedCurrent: "A",
  ratedVoltage: "V",
  breakingCapacity: "kA",
  thermalDelay: "s",
  i2t: "A2s",
  setTime: "s",
  pulseDuration: "s",
  preset: "pulsos",
  coilVoltage: "V",
  responseTime: "ms",
};

const SELECT_OPTIONS: Record<string, string[]> = {
  curve: ["B", "C", "D"],
  function: ["on-delay", "off-delay", "intervalo"],
  countDirection: ["up", "down"],
  outputMode: ["mantido", "pulso 0.5s"],
  characteristic: ["gG", "aM"],
  resetMode: ["manual", "auto"],
  controlMode: ["V/f", "vetorial"],
};

function inferParamSpec(key: string, value: unknown): ParamSpec {
  const selectValues = SELECT_OPTIONS[key];
  const type: VoltaiParamType =
    typeof value === "boolean"
      ? "boolean"
      : selectValues
        ? "select"
        : /time|delay|duration/i.test(key)
          ? "time"
          : typeof value === "number"
            ? "number"
            : "select";
  return {
    key,
    label:
      LABELS[key] ??
      key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (char) => char.toUpperCase())
        .trim(),
    type,
    unit: UNITS[key],
    defaultValue:
      typeof value === "number" || typeof value === "boolean" || typeof value === "string"
        ? value
        : String(value ?? ""),
    min: typeof value === "number" ? 0 : undefined,
    options: selectValues?.map((option) => ({ label: option, value: option })),
    normRef: key === "ratedCurrent" || key === "breakingCapacity" ? "IEC 60947" : undefined,
  };
}

export const VOLTAI_COMP_DEFS = VOLTAI_COMPONENT_DEFINITIONS.map((component) => ({
  ...component,
  paramSpecs: Object.fromEntries(
    Object.entries(component.params).map(([key, value]) => [key, inferParamSpec(key, value)]),
  ),
})) as readonly (VoltaiComponentDefinition & { paramSpecs: Record<string, ParamSpec> })[];

export const VOLTAI_COMP_DEF_BY_TYPE = Object.fromEntries(
  VOLTAI_COMP_DEFS.map((component) => [component.type, component]),
) as Record<
  VoltaiComponentType,
  VoltaiComponentDefinition & { paramSpecs: Record<string, ParamSpec> }
>;

export function getVoltaiCompDef(type: VoltaiComponentType) {
  return VOLTAI_COMP_DEF_BY_TYPE[type];
}

export function getVoltaiFactoryParams(
  type: VoltaiComponentType,
): Record<string, number | boolean | string> {
  const definition = getVoltaiCompDef(type);
  return Object.fromEntries(
    Object.entries(definition.paramSpecs).map(([key, spec]) => [key, spec.defaultValue]),
  );
}

export const isBreakerComponent = (type: string): type is "QF" | "MPCB" | "MCB_AUX" =>
  type === "QF" || type === "MPCB" || type === "MCB_AUX";

export function createVoltaiDefaultState(type: VoltaiComponentType): VoltaiSimulationState {
  return { ...VOLTAI_COMPONENT_BY_TYPE[type].simulationState };
}
