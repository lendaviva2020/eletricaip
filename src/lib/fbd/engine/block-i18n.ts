// Textos de exibição dos blocos FBD/IEC 61131-3 em inglês.
//
// O registro (`registry.ts`, `iec-library.ts`, `compact-blocks.ts`) mantém a
// descrição canônica em pt-BR; este módulo só traduz o que é MOSTRADO. Os
// tipos de bloco (AND, TON, CTU…) nunca são traduzidos (identificadores IEC).
import type { SupportedLocale } from "@/lib/i18n/types";

const CATEGORY_EN: Readonly<Record<string, string>> = {
  Borda: "Edge",
  Comparação: "Comparison",
  Contador: "Counter",
  Conversão: "Conversion",
  Lógica: "Logic",
  Matemática: "Math",
  Memória: "Memory",
  Seleção: "Selection",
  Temporizador: "Timer",
  Variáveis: "Variables",
};

const DESCRIPTION_EN: Readonly<Record<string, string>> = {
  VAR_IN: "Reads a variable declared in the POU",
  VAR_OUT: "Writes to a variable declared in the POU",
  CONST: "Typed constant",
  AND: "Logical / bitwise AND",
  OR: "Logical / bitwise OR",
  XOR: "Exclusive OR",
  NOT: "Logical negation / complement",
  SR: "Set-dominant bistable: Q1 := S1 OR (NOT R AND Q1)",
  RS: "Reset-dominant bistable: Q1 := NOT R1 AND (S OR Q1)",
  R_TRIG: "Rising edge detection",
  F_TRIG: "Falling edge detection",
  TON: "On-delay timer",
  TOF: "Off-delay timer",
  TP: "Pulse generator of duration PT",
  CTU: "Up counter",
  CTD: "Down counter",
  CTUD: "Up/down counter",
  EQ: "Equal",
  NE: "Not equal",
  GT: "Greater than",
  GE: "Greater or equal",
  LT: "Less than",
  LE: "Less or equal",
  SEL: "OUT := IN0 if G=FALSE, IN1 if G=TRUE",
  MOVE: "Value copy",
  MAX: "Maximum",
  MIN: "Minimum",
  LIMIT: "Clamps IN between MN and MX",
  ADD: "Addition",
  SUB: "Subtraction",
  MUL: "Multiplication",
  DIV: "Division (integers truncate toward zero)",
  MOD: "Integer division remainder",
  ABS: "Absolute value",
  SQRT: "Square root",
  HIGH: "Digital constant 1 (HIGH)",
  LOW: "Digital constant 0 (LOW)",
  STARTUP_FLAG_M8: "Startup flag M8: TRUE only on the first scan",
  OPEN_CONNECTOR: "Open connector (explicit no-effect termination)",
  NAND: "Logical NAND",
  NOR: "Logical NOR",
  AND_EDGE: "AND evaluated on rising edge",
  NAND_EDGE: "NAND evaluated on falling edge",
  PULSE_RELAY: "Pulse relay (latching / impulse switch): toggles on TRG edge with S/R",
  TONR: "Retentive timer with accumulation and priority reset",
  TON_TOF: "Combined on-delay (TH) and off-delay (TL) timer",
  WIPING_RELAY: "Wiping relay (output for TH or until TRG falls)",
  EDGE_TRIGGERED_WIPING: "Edge-triggered wiping relay with N alternating cycles (TH / TL)",
  ASYNC_PULSE_GEN: "Asynchronous pulse generator (TH / TL) with optional inversion",
  RANDOM_GEN: "Deterministic pseudo-random generator with fixed seed (LCG)",
  STAIRWAY_SWITCH: "Stairway light switch with timed switch-off and pre-warning",
  CTUD_COMPACT: "Compact up/down counter with direction and configurable ON/OFF thresholds",
  HOUR_COUNTER: "Retentive hour meter with maintenance alarm (MI)",
  THRESHOLD_TRIGGER: "Frequency threshold trigger (pulses per G_T window)",
  WEEKLY_TIMER: "Weekly time switch (3 cams) driven by the simulated clock",
  YEARLY_TIMER: "Yearly time switch driven by the simulated clock",
  ANALOG_COMP: "Differential analog comparator with gain, offset and hysteresis",
  ANALOG_THRESHOLD: "Analog threshold trigger with configurable hysteresis",
  ANALOG_AMP: "Analog amplifier and scaler (Ax * gain + offset with clamp)",
  ANALOG_MUX: "4-channel analog multiplexer (S1, S2)",
  ANALOG_RAMP: "Rate-limited analog ramp (units/second) to levels L1/L2",
  PI_CONTROLLER: "Compact PI controller with Auto/Manual and anti-windup",
  ANALOG_WATCHDOG: "Analog watchdog: detects deviation larger than delta since the last EN pulse",
  MATH_EXPR_SAFE: "Safe arithmetic operation (V1 op1 V2 op2 V3 op3 V4) without eval",
  ANALOG_FILTER: "Configurable analog moving-average filter (1..16 samples)",
  SHIFT_REGISTER: "8-bit shift register (S1..S8) with direction",
  MESSAGE_TEXT: "Builds a sanitized text message payload (virtual display)",
  DATA_LOG: "Deterministic data logging on trigger edge",
};

const CONVERSION_RE = /^Conversão explícita (\S+) → (\S+)$/;

export function blockCategoryLabel(category: string, locale: SupportedLocale): string {
  return locale === "en" ? (CATEGORY_EN[category] ?? category) : category;
}

export function blockDescriptionLabel(
  type: string,
  description: string,
  locale: SupportedLocale,
): string {
  if (locale !== "en") return description;
  const conv = CONVERSION_RE.exec(description);
  if (conv) return `Explicit conversion ${conv[1]} → ${conv[2]}`;
  return DESCRIPTION_EN[type] ?? description;
}
