// Industrial component library — IEC 60617 / NBR 5410 / NR-10 / IEC 61439.
// Defines every component the engineer or AI can drop on the Unifilar canvas,
// with factory defaults, terminals (with port colors), units and constraints.
//
// Color convention (IEC + project standard):
//   power:   #E53E3E (red)     — main power circuit
//   neutral: #6B7280 (gray)    — neutral / PE
//   control: #D4A017 (amber)   — coil / aux contacts / 24V control
//   signal:  #2563EB (blue)    — analog / digital signal (4-20mA, 0-10V, sensor)
//
// Units glossary: V, A, kW, kVA, ms, s, min, Hz, °C, kA, kVAr, mm², °, %.
//
// Each component declares:
//   - terminals: connection points exposed as React Flow handles
//   - defaults: factory parameter values + ParamSpec metadata for the editor
//   - simulate?: optional runtime behavior (current, faults, timers, counters)

export type TerminalRole = "power" | "neutral" | "control" | "signal";
export type TerminalSide = "left" | "right" | "top" | "bottom";

export interface Terminal {
  id: string; // e.g. "L1", "T1", "A1", "AI+"
  role: TerminalRole;
  side: TerminalSide;
  label?: string; // Display label (defaults to id)
  io?: "in" | "out"; // direction (informational)
}

export type ParamType = "number" | "string" | "boolean" | "enum";

export interface ParamSpec {
  type: ParamType;
  unit?: string; // V, A, kW, ms, …
  default: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[]; // for enum
  description?: string;
  group?: string; // grouping in the property panel
}

export interface ComponentDefinition {
  code: string; // "QF", "DR", "M"…
  name: string; // Human readable
  category: "power" | "protection" | "control" | "signal" | "machine" | "instrument";
  description: string;
  norms: string[]; // ["NBR 5410", "IEC 60947"]
  terminals: Terminal[];
  params: Record<string, ParamSpec>;
  // Optional simulation step (called every 50ms by simulation-engine).
  // Receives mutable state, mutates in place. Implementations are added
  // incrementally — leaving undefined means the component is "static" only.
}

export const TERMINAL_COLOR: Record<TerminalRole, string> = {
  power: "#E53E3E",
  neutral: "#6B7280",
  control: "#D4A017",
  signal: "#2563EB",
};

// --------------------------------------------------------------------------
// 1. QF — Disjuntor termomagnético
export const QF: ComponentDefinition = {
  code: "QF",
  name: "Disjuntor termomagnético",
  category: "protection",
  description: "Proteção contra sobrecarga e curto-circuito (NBR IEC 60947-2).",
  norms: ["NBR 5410", "IEC 60947-2"],
  terminals: [
    { id: "L1", role: "power", side: "top", io: "in" },
    { id: "L2", role: "power", side: "top", io: "in" },
    { id: "L3", role: "power", side: "top", io: "in" },
    { id: "T1", role: "power", side: "bottom", io: "out" },
    { id: "T2", role: "power", side: "bottom", io: "out" },
    { id: "T3", role: "power", side: "bottom", io: "out" },
  ],
  params: {
    poles: {
      type: "enum",
      options: ["1", "2", "3", "4"],
      default: "3",
      description: "Número de polos",
    },
    ratedCurrent: {
      type: "number",
      unit: "A",
      default: 100,
      min: 0.5,
      max: 6300,
      group: "Elétrico",
      description: "Corrente nominal (In)",
    },
    ratedVoltage: {
      type: "number",
      unit: "V",
      default: 400,
      min: 24,
      max: 1000,
      group: "Elétrico",
    },
    breakingCapacity: {
      type: "number",
      unit: "kA",
      default: 25,
      min: 1,
      max: 100,
      group: "Proteção",
      description: "Icu",
    },
    curve: { type: "enum", options: ["B", "C", "D"], default: "C", group: "Proteção" },
    thermalDelay: { type: "number", unit: "s", default: 300, min: 1, max: 7200, group: "Proteção" },
    magneticInstant: { type: "string", default: "5..10 x In", group: "Proteção" },
    auxContact: { type: "string", default: "1NA+1NF", group: "Auxiliar" },
  },
};

// 2. QS — Seccionadora
export const QS: ComponentDefinition = {
  code: "QS",
  name: "Seccionadora",
  category: "protection",
  description: "Seccionamento sob carga (sem proteção).",
  norms: ["IEC 60947-3"],
  terminals: QF.terminals,
  params: {
    poles: { type: "enum", options: ["1", "2", "3", "4"], default: "3" },
    ratedCurrent: { type: "number", unit: "A", default: 160, min: 16, max: 6300 },
    ratedVoltage: { type: "number", unit: "V", default: 400 },
    auxContact: { type: "string", default: "1NA+1NF" },
  },
};

// 3. DR — Diferencial residual (RCD)
export const DR: ComponentDefinition = {
  code: "DR",
  name: "Diferencial residual (RCD)",
  category: "protection",
  description: "Proteção contra contato indireto e correntes de fuga.",
  norms: ["NBR 5410 §5.1.3.2", "IEC 61008"],
  terminals: [
    { id: "L1", role: "power", side: "top", io: "in" },
    { id: "N", role: "neutral", side: "top", io: "in" },
    { id: "T1", role: "power", side: "bottom", io: "out" },
    { id: "Nout", role: "neutral", side: "bottom", io: "out" },
  ],
  params: {
    poles: { type: "enum", options: ["2", "4"], default: "2" },
    ratedCurrent: { type: "number", unit: "A", default: 40, min: 10, max: 125 },
    sensitivity: { type: "number", unit: "mA", default: 30, min: 10, max: 500, description: "IΔn" },
    tripTime: {
      type: "number",
      unit: "ms",
      default: 40,
      min: 10,
      max: 300,
      description: "Tempo de atuação a 5×IΔn",
    },
    type: { type: "enum", options: ["AC", "A", "B"], default: "AC" },
  },
};

// 4. FU — Fusível
export const FU: ComponentDefinition = {
  code: "FU",
  name: "Fusível",
  category: "protection",
  description: "Proteção por fusão. Característica gG (uso geral) ou aM (motores).",
  norms: ["IEC 60269"],
  terminals: [
    { id: "in", role: "power", side: "top", io: "in" },
    { id: "out", role: "power", side: "bottom", io: "out" },
  ],
  params: {
    ratedCurrent: { type: "number", unit: "A", default: 16, min: 0.5, max: 1250 },
    ratedVoltage: { type: "number", unit: "V", default: 500 },
    breakingCapacity: { type: "number", unit: "kA", default: 100 },
    characteristic: { type: "enum", options: ["gG", "aM"], default: "gG" },
    i2t: { type: "number", unit: "A²s", default: 200 },
  },
};

// 5. SPD — Surge Protective Device
export const SPD: ComponentDefinition = {
  code: "SPD",
  name: "Protetor contra surtos (DPS)",
  category: "protection",
  description: "Proteção contra sobretensões transitórias.",
  norms: ["NBR 5410 §6.3.5", "IEC 61643"],
  terminals: [
    { id: "L1", role: "power", side: "top", io: "in" },
    { id: "L2", role: "power", side: "top", io: "in" },
    { id: "L3", role: "power", side: "top", io: "in" },
    { id: "N", role: "neutral", side: "top", io: "in" },
    { id: "PE", role: "neutral", side: "bottom", io: "out" },
  ],
  params: {
    class: { type: "enum", options: ["I", "II", "III"], default: "II" },
    maxDischargeCurrent: { type: "number", unit: "kA", default: 40 },
    voltageProtectionLevel: { type: "number", unit: "kV", default: 1.5 },
    responseTime: { type: "number", unit: "ns", default: 25 },
  },
};

// 6. KM — Contator
export const KM: ComponentDefinition = {
  code: "KM",
  name: "Contator",
  category: "control",
  description: "Comando de circuitos de potência por bobina.",
  norms: ["IEC 60947-4-1"],
  terminals: [
    { id: "L1", role: "power", side: "top", io: "in" },
    { id: "L2", role: "power", side: "top", io: "in" },
    { id: "L3", role: "power", side: "top", io: "in" },
    { id: "T1", role: "power", side: "bottom", io: "out" },
    { id: "T2", role: "power", side: "bottom", io: "out" },
    { id: "T3", role: "power", side: "bottom", io: "out" },
    { id: "A1", role: "control", side: "left", io: "in" },
    { id: "A2", role: "control", side: "left", io: "out" },
  ],
  params: {
    ratedCurrentAC3: { type: "number", unit: "A", default: 32 },
    coilVoltage: { type: "number", unit: "V", default: 24, description: "DC ou AC" },
    coilConsumption: { type: "number", unit: "W", default: 5 },
    auxContacts: { type: "string", default: "2NA+2NF" },
    pullInTime: { type: "number", unit: "ms", default: 20 },
    dropOutTime: { type: "number", unit: "ms", default: 10 },
  },
};

// 7. KA — Relé auxiliar
export const KA: ComponentDefinition = {
  code: "KA",
  name: "Relé auxiliar",
  category: "control",
  description: "Apenas contatos de comando (sem potência).",
  norms: ["IEC 61810"],
  terminals: [
    { id: "A1", role: "control", side: "left", io: "in" },
    { id: "A2", role: "control", side: "left", io: "out" },
    { id: "11", role: "control", side: "right", io: "in" },
    { id: "14", role: "control", side: "right", io: "out" },
    { id: "12", role: "control", side: "right", io: "out" },
  ],
  params: {
    coilVoltage: { type: "number", unit: "V", default: 24 },
    contacts: { type: "string", default: "4NA+4NF" },
    pullInTime: { type: "number", unit: "ms", default: 8 },
    dropOutTime: { type: "number", unit: "ms", default: 5 },
  },
};

// 8. FR — Relé térmico de sobrecarga
export const FR: ComponentDefinition = {
  code: "FR",
  name: "Relé térmico de sobrecarga",
  category: "protection",
  description: "Proteção contra sobrecarga de motores.",
  norms: ["IEC 60947-4-1"],
  terminals: [
    { id: "L1", role: "power", side: "top", io: "in" },
    { id: "L2", role: "power", side: "top", io: "in" },
    { id: "L3", role: "power", side: "top", io: "in" },
    { id: "T1", role: "power", side: "bottom", io: "out" },
    { id: "T2", role: "power", side: "bottom", io: "out" },
    { id: "T3", role: "power", side: "bottom", io: "out" },
    { id: "95", role: "control", side: "right", io: "in" },
    { id: "96", role: "control", side: "right", io: "out" },
    { id: "97", role: "control", side: "right", io: "in" },
    { id: "98", role: "control", side: "right", io: "out" },
  ],
  params: {
    currentRange: { type: "string", default: "23-32 A" },
    tripClass: { type: "enum", options: ["10", "20", "30"], default: "10" },
    resetMode: { type: "enum", options: ["manual", "auto"], default: "manual" },
    phaseLossSensitivity: { type: "boolean", default: true },
  },
};

// 9. M — Motor de indução trifásico
export const M: ComponentDefinition = {
  code: "M",
  name: "Motor de indução trifásico",
  category: "machine",
  description: "Motor assíncrono — gaiola de esquilo.",
  norms: ["NBR 17094", "IEC 60034"],
  terminals: [
    { id: "U1", role: "power", side: "top", io: "in" },
    { id: "V1", role: "power", side: "top", io: "in" },
    { id: "W1", role: "power", side: "top", io: "in" },
    { id: "PE", role: "neutral", side: "bottom", io: "in" },
    { id: "PTC", role: "signal", side: "right", io: "out" },
  ],
  params: {
    ratedPower: { type: "number", unit: "kW", default: 7.5, min: 0.1, max: 1000, group: "Nominal" },
    ratedVoltage: { type: "number", unit: "V", default: 400, group: "Nominal" },
    ratedCurrent: { type: "number", unit: "A", default: 14.5, group: "Nominal" },
    frequency: { type: "number", unit: "Hz", default: 60, options: undefined, group: "Nominal" },
    rpm: { type: "number", unit: "rpm", default: 1750, group: "Nominal" },
    efficiency: { type: "number", unit: "%", default: 90, min: 50, max: 100, group: "Nominal" },
    powerFactor: { type: "number", default: 0.85, min: 0.3, max: 1, step: 0.01, group: "Nominal" },
    startingCurrentRatio: { type: "number", default: 6.5, description: "Ip/In", group: "Partida" },
    startingTime: { type: "number", unit: "s", default: 8, group: "Partida" },
    insulationClass: { type: "enum", options: ["B", "F", "H"], default: "F", group: "Construtivo" },
    serviceFactor: {
      type: "number",
      default: 1.15,
      min: 1,
      max: 1.5,
      step: 0.05,
      group: "Construtivo",
    },
  },
};

// 10. SS — Soft-Starter
export const SS: ComponentDefinition = {
  code: "SS",
  name: "Soft-Starter",
  category: "control",
  description: "Partida suave por controle de tensão.",
  norms: ["IEC 60947-4-2"],
  terminals: [
    { id: "R", role: "power", side: "top", io: "in" },
    { id: "S", role: "power", side: "top", io: "in" },
    { id: "T", role: "power", side: "top", io: "in" },
    { id: "U", role: "power", side: "bottom", io: "out" },
    { id: "V", role: "power", side: "bottom", io: "out" },
    { id: "W", role: "power", side: "bottom", io: "out" },
    { id: "A1", role: "control", side: "left", io: "in" },
    { id: "A2", role: "control", side: "left", io: "in" },
    { id: "DI1", role: "signal", side: "right", io: "in" },
    { id: "DO1", role: "signal", side: "right", io: "out" },
    { id: "AO", role: "signal", side: "right", io: "out" },
  ],
  params: {
    ratedCurrent: { type: "number", unit: "A", default: 45 },
    initialVoltage: { type: "number", unit: "%", default: 30, min: 10, max: 100 },
    rampUpTime: { type: "number", unit: "s", default: 10 },
    rampDownTime: { type: "number", unit: "s", default: 5 },
    currentLimit: { type: "number", unit: "%", default: 300, description: "% In" },
    kickStart: { type: "string", default: "80% / 0.5 s" },
  },
};

// 11. VFD — Inversor de frequência
export const VFD: ComponentDefinition = {
  code: "VFD",
  name: "Inversor de frequência",
  category: "control",
  description: "Variação de velocidade por modulação V/f ou vetorial.",
  norms: ["IEC 61800-2"],
  terminals: [
    { id: "L1", role: "power", side: "top", io: "in" },
    { id: "L2", role: "power", side: "top", io: "in" },
    { id: "L3", role: "power", side: "top", io: "in" },
    { id: "U", role: "power", side: "bottom", io: "out" },
    { id: "V", role: "power", side: "bottom", io: "out" },
    { id: "W", role: "power", side: "bottom", io: "out" },
    { id: "DI1", role: "signal", side: "right", io: "in" },
    { id: "DI2", role: "signal", side: "right", io: "in" },
    { id: "DI3", role: "signal", side: "right", io: "in" },
    { id: "AI1", role: "signal", side: "right", io: "in" },
    { id: "AI2", role: "signal", side: "right", io: "in" },
    { id: "DO1", role: "signal", side: "right", io: "out" },
    { id: "DO2", role: "signal", side: "right", io: "out" },
    { id: "AO1", role: "signal", side: "right", io: "out" },
  ],
  params: {
    ratedPower: { type: "number", unit: "kW", default: 11 },
    outputFrequency: { type: "string", default: "0-120", unit: "Hz" },
    accelTime: { type: "number", unit: "s", default: 5 },
    decelTime: { type: "number", unit: "s", default: 5 },
    minFreq: { type: "number", unit: "Hz", default: 15 },
    maxFreq: { type: "number", unit: "Hz", default: 60 },
    controlMode: { type: "enum", options: ["V/f", "vetorial"], default: "V/f" },
    pidEnable: { type: "boolean", default: false },
  },
};

// 12. TR — Transformador de potência
export const TR: ComponentDefinition = {
  code: "TR",
  name: "Transformador de potência",
  category: "power",
  description: "Transformador trifásico imerso a óleo ou seco.",
  norms: ["NBR 5356", "IEC 60076"],
  terminals: [
    { id: "H1", role: "power", side: "top", io: "in" },
    { id: "H2", role: "power", side: "top", io: "in" },
    { id: "H3", role: "power", side: "top", io: "in" },
    { id: "X1", role: "power", side: "bottom", io: "out" },
    { id: "X2", role: "power", side: "bottom", io: "out" },
    { id: "X3", role: "power", side: "bottom", io: "out" },
  ],
  params: {
    ratedPower: { type: "number", unit: "kVA", default: 500 },
    primaryVoltage: { type: "number", unit: "kV", default: 13.8 },
    secondaryVoltage: { type: "number", unit: "kV", default: 0.38 },
    vectorGroup: { type: "enum", options: ["Dyn1", "Dyn5", "Dyn11", "Yyn0"], default: "Dyn11" },
    impedance: { type: "number", unit: "%", default: 5 },
    cooling: { type: "enum", options: ["ONAN", "ONAF", "AN"], default: "ONAN" },
    taps: { type: "string", default: "±2.5%" },
  },
};

// 13. PS — Fonte chaveada DC
export const PS: ComponentDefinition = {
  code: "PS",
  name: "Fonte chaveada DC",
  category: "power",
  description: "Conversão AC/DC para circuito de comando 24V.",
  norms: ["IEC 61204"],
  terminals: [
    { id: "L", role: "power", side: "top", io: "in" },
    { id: "N", role: "neutral", side: "top", io: "in" },
    { id: "+24V", role: "control", side: "bottom", io: "out" },
    { id: "0V", role: "control", side: "bottom", io: "out" },
  ],
  params: {
    inputVoltage: { type: "string", unit: "V AC", default: "100-240" },
    outputVoltage: { type: "number", unit: "V DC", default: 24 },
    ratedCurrent: { type: "number", unit: "A", default: 5 },
    power: { type: "number", unit: "W", default: 120 },
    efficiency: { type: "number", unit: "%", default: 90 },
  },
};

// 14. PLC — Controlador
export const PLC: ComponentDefinition = {
  code: "PLC",
  name: "Controlador lógico programável",
  category: "control",
  description: "CPU + rack de IO digital/analógico, comunicação Ethernet.",
  norms: ["IEC 61131-3"],
  terminals: [
    ...Array.from({ length: 16 }, (_, i) => ({
      id: `DI${i}`,
      role: "signal" as const,
      side: "left" as const,
      io: "in" as const,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `AI${i}`,
      role: "signal" as const,
      side: "left" as const,
      io: "in" as const,
    })),
    ...Array.from({ length: 16 }, (_, i) => ({
      id: `DO${i}`,
      role: "signal" as const,
      side: "right" as const,
      io: "out" as const,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `AO${i}`,
      role: "signal" as const,
      side: "right" as const,
      io: "out" as const,
    })),
    { id: "ETH", role: "signal", side: "bottom", io: "out", label: "Ethernet" },
  ],
  params: {
    model: {
      type: "enum",
      options: ["S7-1200", "S7-1500", "M221", "M251", "ControlLogix"],
      default: "S7-1200",
    },
    scanCycle: { type: "number", unit: "ms", default: 10 },
    memory: { type: "number", unit: "kB", default: 125 },
    communication: { type: "string", default: "Modbus TCP, OPC-UA" },
  },
};

// 15. KT — Temporizador
export const KT: ComponentDefinition = {
  code: "KT",
  name: "Temporizador (relé)",
  category: "control",
  description: "Relé de tempo on-delay / off-delay / intervalo.",
  norms: ["IEC 61812"],
  terminals: [
    { id: "A1", role: "control", side: "left", io: "in" },
    { id: "A2", role: "control", side: "left", io: "in" },
    { id: "Y1", role: "signal", side: "left", io: "in" },
    { id: "15", role: "control", side: "right", io: "in" },
    { id: "16", role: "control", side: "right", io: "out" },
    { id: "18", role: "control", side: "right", io: "out" },
  ],
  params: {
    function: {
      type: "enum",
      options: ["on-delay", "off-delay", "intervalo"],
      default: "on-delay",
    },
    timeRange: { type: "string", default: "1-10", unit: "s" },
    setTime: { type: "number", unit: "s", default: 5.0, step: 0.1 },
    contactRating: { type: "number", unit: "A", default: 5 },
    pulseMode: { type: "boolean", default: false },
  },
};

// 16. CT — Contador de pulsos
export const CT: ComponentDefinition = {
  code: "CT",
  name: "Contador de pulsos",
  category: "control",
  description: "Contador eletrônico bidirecional.",
  norms: ["IEC 61131-3"],
  terminals: [
    { id: "A1", role: "control", side: "left", io: "in" },
    { id: "A2", role: "control", side: "left", io: "in" },
    { id: "INP", role: "signal", side: "left", io: "in" },
    { id: "RST", role: "signal", side: "left", io: "in" },
    { id: "OUT", role: "signal", side: "right", io: "out" },
  ],
  params: {
    preset: { type: "number", unit: "pulsos", default: 100 },
    countDirection: { type: "enum", options: ["up", "down"], default: "up" },
    outputMode: { type: "enum", options: ["mantido", "pulso 0.5s"], default: "mantido" },
  },
};

// 17. BC — Banco de capacitores
export const BC: ComponentDefinition = {
  code: "BC",
  name: "Banco de capacitores",
  category: "power",
  description: "Correção de fator de potência.",
  norms: ["NBR 5282"],
  terminals: [
    { id: "L1", role: "power", side: "top", io: "in" },
    { id: "L2", role: "power", side: "top", io: "in" },
    { id: "L3", role: "power", side: "top", io: "in" },
  ],
  params: {
    ratedPower: { type: "number", unit: "kVAr", default: 50 },
    stages: { type: "number", default: 3, min: 1, max: 12 },
    controlMode: { type: "string", default: "automático (FP alvo 0.95)" },
  },
};

// 18. Sensores (PT/TT/LT/FT)
const sensorBase = (
  code: string,
  name: string,
  unit: string,
  defaults: Partial<Record<string, ParamSpec>>,
): ComponentDefinition => ({
  code,
  name,
  category: "instrument",
  description: `Sensor industrial 4-20 mA · faixa em ${unit}.`,
  norms: ["IEC 60381"],
  terminals: [
    { id: "AI+", role: "signal", side: "right", io: "out" },
    { id: "AI-", role: "signal", side: "right", io: "out" },
  ],
  params: {
    rangeMin: { type: "number", unit, default: 0 },
    rangeMax: { type: "number", unit, default: 100 },
    outputSignal: { type: "string", default: "4-20", unit: "mA" },
    alarmLow: { type: "number", unit, default: 10 },
    alarmHigh: { type: "number", unit, default: 90 },
    responseTime: { type: "number", unit: "ms", default: 250 },
    ...defaults,
  } as Record<string, ParamSpec>,
});

export const PT_PRESSURE = sensorBase("PT", "Transmissor de pressão", "bar", {});
export const TT_TEMP = sensorBase("TT", "Transmissor de temperatura", "°C", {
  rangeMin: { type: "number", unit: "°C", default: -50 },
  rangeMax: { type: "number", unit: "°C", default: 200 },
});
export const LT_LEVEL = sensorBase("LT", "Transmissor de nível", "%", {});
export const FT_FLOW = sensorBase("FT", "Transmissor de vazão", "m³/h", {
  rangeMax: { type: "number", unit: "m³/h", default: 200 },
});

// --------------------------------------------------------------------------
export const COMPONENT_LIBRARY: ComponentDefinition[] = [
  QF,
  QS,
  DR,
  FU,
  SPD,
  KM,
  KA,
  FR,
  M,
  SS,
  VFD,
  TR,
  PS,
  PLC,
  KT,
  CT,
  BC,
  PT_PRESSURE,
  TT_TEMP,
  LT_LEVEL,
  FT_FLOW,
];

export const COMPONENT_BY_CODE: Record<string, ComponentDefinition> = Object.fromEntries(
  COMPONENT_LIBRARY.map((c) => [c.code, c]),
);

export function defaultParamsFor(code: string): Record<string, string | number | boolean> {
  const d = COMPONENT_BY_CODE[code];
  if (!d) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [k, spec] of Object.entries(d.params)) out[k] = spec.default;
  return out;
}
