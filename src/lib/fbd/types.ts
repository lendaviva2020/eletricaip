export type FbdBlockKind =
  | "AND"
  | "OR"
  | "NOT"
  | "XOR"
  | "SR"
  | "RS"
  | "TON"
  | "TOF"
  | "TP"
  | "CTU"
  | "CTD"
  | "ADD"
  | "SUB"
  | "MUL"
  | "DIV"
  | "GT"
  | "LT"
  | "EQ"
  | "GE"
  | "LE"
  | "NE"
  | "MOVE"
  | "SEL";

export interface FbdPin {
  id: string;
  label: string;
  type: "BOOL" | "INT" | "REAL" | "TIME" | "ANY";
  direction: "input" | "output";
  blockId: string;
}

export interface FbdBlock {
  id: string;
  kind: FbdBlockKind;
  label: string;
  position: { x: number; y: number };
  params: Record<string, number | boolean | string>;
  pins: FbdPin[];
}

export interface FbdConnection {
  id: string;
  sourcePin: string;
  targetPin: string;
}

export interface FbdProgram {
  blocks: FbdBlock[];
  connections: FbdConnection[];
}

export interface FbdBlockDefinition {
  kind: FbdBlockKind;
  label: string;
  category: string;
  description: string;
  inputs: { label: string; type: FbdPin["type"]; defaultValue?: any }[];
  outputs: { label: string; type: FbdPin["type"] }[];
  params?: { key: string; label: string; type: string; defaultValue: any }[];
}

export const BLOCK_DEFINITIONS: FbdBlockDefinition[] = [
  {
    kind: "AND",
    label: "AND",
    category: "Lógica",
    description: "E lógico",
    inputs: [
      { label: "IN1", type: "BOOL" },
      { label: "IN2", type: "BOOL" },
    ],
    outputs: [{ label: "OUT", type: "BOOL" }],
  },
  {
    kind: "OR",
    label: "OR",
    category: "Lógica",
    description: "OU lógico",
    inputs: [
      { label: "IN1", type: "BOOL" },
      { label: "IN2", type: "BOOL" },
    ],
    outputs: [{ label: "OUT", type: "BOOL" }],
  },
  {
    kind: "NOT",
    label: "NOT",
    category: "Lógica",
    description: "Inversão",
    inputs: [{ label: "IN", type: "BOOL" }],
    outputs: [{ label: "OUT", type: "BOOL" }],
  },
  {
    kind: "XOR",
    label: "XOR",
    category: "Lógica",
    description: "OU exclusivo",
    inputs: [
      { label: "IN1", type: "BOOL" },
      { label: "IN2", type: "BOOL" },
    ],
    outputs: [{ label: "OUT", type: "BOOL" }],
  },
  {
    kind: "SR",
    label: "SR",
    category: "Memória",
    description: "Set-Reset dominante Set",
    inputs: [
      { label: "S", type: "BOOL" },
      { label: "R", type: "BOOL" },
    ],
    outputs: [
      { label: "Q", type: "BOOL" },
      { label: "NQ", type: "BOOL" },
    ],
  },
  {
    kind: "RS",
    label: "RS",
    category: "Memória",
    description: "Reset-Set dominante Reset",
    inputs: [
      { label: "S", type: "BOOL" },
      { label: "R", type: "BOOL" },
    ],
    outputs: [
      { label: "Q", type: "BOOL" },
      { label: "NQ", type: "BOOL" },
    ],
  },
  {
    kind: "TON",
    label: "TON",
    category: "Temporizador",
    description: "Timer on-delay (ms)",
    inputs: [
      { label: "IN", type: "BOOL" },
      { label: "PT", type: "TIME" },
    ],
    outputs: [
      { label: "Q", type: "BOOL" },
      { label: "ET", type: "TIME" },
    ],
    params: [{ key: "preset_ms", label: "Preset (ms)", type: "number", defaultValue: 1000 }],
  },
  {
    kind: "TOF",
    label: "TOF",
    category: "Temporizador",
    description: "Timer off-delay (ms)",
    inputs: [
      { label: "IN", type: "BOOL" },
      { label: "PT", type: "TIME" },
    ],
    outputs: [
      { label: "Q", type: "BOOL" },
      { label: "ET", type: "TIME" },
    ],
    params: [{ key: "preset_ms", label: "Preset (ms)", type: "number", defaultValue: 1000 }],
  },
  {
    kind: "CTU",
    label: "CTU",
    category: "Contador",
    description: "Contador crescente",
    inputs: [
      { label: "CU", type: "BOOL" },
      { label: "R", type: "BOOL" },
      { label: "PV", type: "INT" },
    ],
    outputs: [
      { label: "Q", type: "BOOL" },
      { label: "CV", type: "INT" },
    ],
    params: [{ key: "preset", label: "Preset", type: "number", defaultValue: 10 }],
  },
  {
    kind: "CTD",
    label: "CTD",
    category: "Contador",
    description: "Contador decrescente",
    inputs: [
      { label: "CD", type: "BOOL" },
      { label: "LD", type: "BOOL" },
      { label: "PV", type: "INT" },
    ],
    outputs: [
      { label: "Q", type: "BOOL" },
      { label: "CV", type: "INT" },
    ],
    params: [{ key: "preset", label: "Preset", type: "number", defaultValue: 10 }],
  },
  {
    kind: "ADD",
    label: "ADD",
    category: "Matemática",
    description: "Adição",
    inputs: [
      { label: "IN1", type: "REAL" },
      { label: "IN2", type: "REAL" },
    ],
    outputs: [{ label: "OUT", type: "REAL" }],
  },
  {
    kind: "SUB",
    label: "SUB",
    category: "Matemática",
    description: "Subtração",
    inputs: [
      { label: "IN1", type: "REAL" },
      { label: "IN2", type: "REAL" },
    ],
    outputs: [{ label: "OUT", type: "REAL" }],
  },
  {
    kind: "MUL",
    label: "MUL",
    category: "Matemática",
    description: "Multiplicação",
    inputs: [
      { label: "IN1", type: "REAL" },
      { label: "IN2", type: "REAL" },
    ],
    outputs: [{ label: "OUT", type: "REAL" }],
  },
  {
    kind: "DIV",
    label: "DIV",
    category: "Matemática",
    description: "Divisão",
    inputs: [
      { label: "IN1", type: "REAL" },
      { label: "IN2", type: "REAL" },
    ],
    outputs: [{ label: "OUT", type: "REAL" }],
  },
  {
    kind: "GT",
    label: "GT",
    category: "Comparação",
    description: "Maior que (>).",
    inputs: [
      { label: "IN1", type: "REAL" },
      { label: "IN2", type: "REAL" },
    ],
    outputs: [{ label: "OUT", type: "BOOL" }],
  },
  {
    kind: "LT",
    label: "LT",
    category: "Comparação",
    description: "Menor que (<).",
    inputs: [
      { label: "IN1", type: "REAL" },
      { label: "IN2", type: "REAL" },
    ],
    outputs: [{ label: "OUT", type: "BOOL" }],
  },
  {
    kind: "EQ",
    label: "EQ",
    category: "Comparação",
    description: "Igual (=).",
    inputs: [
      { label: "IN1", type: "REAL" },
      { label: "IN2", type: "REAL" },
    ],
    outputs: [{ label: "OUT", type: "BOOL" }],
  },
  {
    kind: "MOVE",
    label: "MOVE",
    category: "Movimentação",
    description: "Cópia de valor",
    inputs: [
      { label: "EN", type: "BOOL" },
      { label: "IN", type: "ANY" },
    ],
    outputs: [{ label: "OUT", type: "ANY" }],
  },
  {
    kind: "SEL",
    label: "SEL",
    category: "Seleção",
    description: "Seleciona IN1 (G=0) ou IN2 (G=1)",
    inputs: [
      { label: "G", type: "BOOL" },
      { label: "IN1", type: "ANY" },
      { label: "IN2", type: "ANY" },
    ],
    outputs: [{ label: "OUT", type: "ANY" }],
  },
];
