export type PlcVendor = "siemens" | "rockwell" | "schneider" | "generic";

export type PlcAddressType = "I" | "Q" | "M" | "DB";

export interface PlcVariable {
  id: string;
  name: string;
  address: string;
  type: "BOOL" | "BYTE" | "WORD" | "DWORD" | "INT" | "DINT" | "REAL" | "TIME" | "STRING";
  initialValue?: number | boolean | string;
  comment: string;
  retentive: boolean;
}

export type ModuleCategory = "cpu" | "di" | "do" | "ai" | "ao" | "comm" | "power";

export interface PlcModule {
  id: string;
  catalogKey: string;
  category: ModuleCategory;
  label: string;
  description: string;
  slot: number;
  channels: number;
  params: Record<string, string | number>;
}

export interface PlcRack {
  id: string;
  label: string;
  modules: PlcModule[];
}

export type ProgramLang = "ladder" | "fbd" | "st";

export interface PlcLadderSnapshot {
  rungs: unknown[]; // LadderRung[] — kept opaque here to avoid cycle with editor types
}
export interface PlcFbdSnapshot {
  nodes: unknown[];
  edges: unknown[];
}

export interface PlcProgramBlock {
  id: string;
  name: string;
  type: "OB" | "FC" | "FB" | "DB";
  number: number;
  language: ProgramLang;
  /** Compiled / authored ST source. Updated when user clicks "Compilar" on a ladder/FBD block. */
  code: string;
  comment: string;
  /** Persisted Ladder snapshot for this block (when language === "ladder"). */
  ladder?: PlcLadderSnapshot;
  /** Persisted FBD snapshot for this block (when language === "fbd"). */
  fbd?: PlcFbdSnapshot;
}


export interface PlcProject {
  vendor: PlcVendor;
  rack: PlcRack;
  variables: PlcVariable[];
  programBlocks: PlcProgramBlock[];
  cycleTimeMs: number;
}

export interface HardwareModuleDef {
  key: string;
  category: ModuleCategory;
  label: string;
  description: string;
  channels: number;
  params?: Record<string, { label: string; type: string; options?: any[]; defaultValue: any }>;
}

export const HARDWARE_CATALOG: HardwareModuleDef[] = [
  {
    key: "cpu-s7-1211c",
    category: "cpu",
    label: "CPU S7-1211C",
    description: "6 DI/4 DO/2 AI",
    channels: 0,
  },
  {
    key: "cpu-s7-1214c",
    category: "cpu",
    label: "CPU S7-1214C",
    description: "14 DI/10 DO/2 AI",
    channels: 0,
  },
  {
    key: "cpu-s7-1511",
    category: "cpu",
    label: "CPU S7-1511",
    description: "64 DI/64 DO/4 AI",
    channels: 0,
  },
  {
    key: "cpu-s7-1516",
    category: "cpu",
    label: "CPU S7-1516",
    description: "128 DI/128 DO/8 AI",
    channels: 0,
  },
  {
    key: "di-8x24v",
    category: "di",
    label: "DI 8×24V",
    description: "Entrada digital 8 canais",
    channels: 8,
  },
  {
    key: "di-16x24v",
    category: "di",
    label: "DI 16×24V",
    description: "Entrada digital 16 canais",
    channels: 16,
  },
  {
    key: "di-32x24v",
    category: "di",
    label: "DI 32×24V",
    description: "Entrada digital 32 canais",
    channels: 32,
  },
  {
    key: "do-8xrelay",
    category: "do",
    label: "DO 8×Relé",
    description: "Saída relé 8 canais",
    channels: 8,
  },
  {
    key: "do-16x24v",
    category: "do",
    label: "DO 16×24V",
    description: "Saída digital 16 canais",
    channels: 16,
  },
  {
    key: "do-32x24v",
    category: "do",
    label: "DO 32×24V",
    description: "Saída digital 32 canais",
    channels: 32,
  },
  {
    key: "ai-4x12b",
    category: "ai",
    label: "AI 4×12bit",
    description: "Entrada analógica 4 canais",
    channels: 4,
  },
  {
    key: "ai-8x12b",
    category: "ai",
    label: "AI 8×12bit",
    description: "Entrada analógica 8 canais",
    channels: 8,
  },
  {
    key: "ao-4x12b",
    category: "ao",
    label: "AO 4×12bit",
    description: "Saída analógica 4 canais",
    channels: 4,
  },
  {
    key: "cm-profinet",
    category: "comm",
    label: "CM Profinet",
    description: "Interface Profinet",
    channels: 0,
  },
  {
    key: "cm-modbus",
    category: "comm",
    label: "CM Modbus TCP",
    description: "Interface Modbus TCP",
    channels: 0,
  },
  {
    key: "ps-24v-10a",
    category: "power",
    label: "PS 24V/10A",
    description: "Fonte alimentação 24V 10A",
    channels: 0,
  },
];

export const ADDRESS_TYPES: PlcVariable["type"][] = [
  "BOOL",
  "BYTE",
  "WORD",
  "DWORD",
  "INT",
  "DINT",
  "REAL",
  "TIME",
  "STRING",
];

export function createDefaultPlcProject(): PlcProject {
  return {
    vendor: "siemens",
    rack: { id: "rack-1", label: "Rack Principal", modules: [] },
    variables: [
      {
        id: "var-1",
        name: "START",
        address: "%I0.0",
        type: "BOOL",
        comment: "Botão liga",
        retentive: false,
      },
      {
        id: "var-2",
        name: "STOP",
        address: "%I0.1",
        type: "BOOL",
        comment: "Botão desliga",
        retentive: false,
      },
      {
        id: "var-3",
        name: "MOTOR_RUN",
        address: "%Q0.0",
        type: "BOOL",
        comment: "Comando motor",
        retentive: false,
      },
      {
        id: "var-4",
        name: "ALARM",
        address: "%Q0.1",
        type: "BOOL",
        comment: "Sinal alarme",
        retentive: false,
      },
      {
        id: "var-5",
        name: "SPEED_SP",
        address: "%MW0",
        type: "INT",
        comment: "Setpoint velocidade",
        retentive: true,
        initialValue: 1200,
      },
    ],
    programBlocks: [
      {
        id: "pb-1",
        name: "Main",
        type: "OB",
        number: 1,
        language: "ladder",
        code: "",
        comment: "Ciclo principal",
      },
      {
        id: "pb-2",
        name: "MotorCtrl",
        type: "FC",
        number: 1,
        language: "st",
        code: `// Controle do motor
IF START AND NOT STOP THEN
  MOTOR_RUN := TRUE;
ELSE
  MOTOR_RUN := FALSE;
END_IF;

// Alarme de sobrecarga
IF MOTOR_RUN AND CURRENT > 18.0 THEN
  ALARM := TRUE;
ELSE
  ALARM := FALSE;
END_IF;`,
        comment: "Lógica de acionamento do motor",
      },
    ],
    cycleTimeMs: 10,
  };
}
