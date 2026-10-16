// Pure electrical calculations used by the AI architect, normative validator,
// and power simulation engine.
// Conformidade normativa: ABNT NBR 5410:2004 (Tabelas 36, 37, 38, 40, 41, 42 e §5.3.4.1 / §6.2.7).
// All units SI unless noted. No I/O, no side effects.

export type InstallationMethod = "A1" | "A2" | "B1" | "B2" | "C" | "D" | "E" | "F";
export type InsulationType = "PVC" | "EPR" | "XLPE";
export type LoadedConductors = 2 | 3;

export const NBR5410_SECTIONS = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300,
] as const;

export type CableSection_mm2 = (typeof NBR5410_SECTIONS)[number];

/** Resistividade do cobre a 70 °C de operação (Ω·mm²/m). */
export const RHO_COPPER_OHM_MM2_PER_M = 0.0178;

/**
 * Reatância indutiva típica de cabos de baixa tensão (mΩ/m = Ω/km).
 * Conforme NBR 5410 / literatura técnica (Mamede / Creder), adota-se
 * X_L = 0,08 mΩ/m para condutores de seção nominal ≥ 35 mm².
 */
export const DEFAULT_REACTANCE_MOHM_PER_M = 0.08;
export const REACTANCE_THRESHOLD_MM2 = 35;

export interface MotorSpec {
  id: string;
  power_kW: number;
  voltage_V?: number; // line-to-line, default 380
  cosphi?: number; // default 0.86
  efficiency?: number; // default 0.92
  startMethod?: "DOL" | "SOFT" | "VFD";
  installationMethod?: InstallationMethod; // default "C"
  insulation?: InsulationType; // default "PVC"
  ambientTemp_C?: number; // default 30 (ou 20 para método D)
  groupedCircuits?: number; // default 1
  cableLength_m?: number; // opcional, para verificação conjunta de queda de tensão
}

export interface MotorResult extends MotorSpec {
  In_A: number; // nominal current
  Istart_A: number; // starting current
  cable_mm2: number; // suggested cable cross-section
  breaker_A: number; // suggested breaker rating
  Iz_corrected_A?: number; // NBR 5410 corrected ampacity I'z
  kt?: number; // NBR 5410 temperature factor
  kg?: number; // NBR 5410 grouping factor
  overloadCoordinated?: boolean; // NBR 5410 Ib <= In <= I'z
}

const ROOT3 = Math.sqrt(3);

export function motorNominalCurrent(p: MotorSpec): number {
  const U = p.voltage_V ?? 380;
  const cos = p.cosphi ?? 0.86;
  const eta = p.efficiency ?? 0.92;
  return (p.power_kW * 1000) / (ROOT3 * U * cos * eta);
}

export function motorStartingCurrent(p: MotorSpec, In: number): number {
  const factor = p.startMethod === "VFD" ? 1.1 : p.startMethod === "SOFT" ? 3.5 : 7;
  return In * factor;
}

// ── ABNT NBR 5410 — Tabelas 36, 37 e 38 (Cobre) ────────────────────────────
// Capacidade de condução de corrente Iz (A) nas temperaturas de referência:
// 30 °C no ar (métodos A1, A2, B1, B2, C, E, F) e 20 °C no solo (método D).

type SectionAmpacityMap = Record<CableSection_mm2, number>;

const TABLE_PVC_3COND: Record<InstallationMethod, SectionAmpacityMap> = {
  // Tabela 36 — PVC (70 °C), 3 condutores carregados
  A1: {
    1.5: 13.5, 2.5: 18, 4: 24, 6: 31, 10: 42, 16: 56, 25: 73, 35: 89,
    50: 108, 70: 136, 95: 164, 120: 188, 150: 216, 185: 245, 240: 286, 300: 328,
  },
  A2: {
    1.5: 13, 2.5: 17.5, 4: 23, 6: 29, 10: 39, 16: 52, 25: 68, 35: 83,
    50: 99, 70: 125, 95: 150, 120: 172, 150: 196, 185: 223, 240: 261, 300: 298,
  },
  B1: {
    1.5: 15.5, 2.5: 21, 4: 28, 6: 36, 10: 50, 16: 68, 25: 89, 35: 110,
    50: 134, 70: 171, 95: 207, 120: 239, 150: 275, 185: 314, 240: 370, 300: 426,
  },
  B2: {
    1.5: 15, 2.5: 20, 4: 27, 6: 34, 10: 46, 16: 62, 25: 80, 35: 99,
    50: 118, 70: 149, 95: 179, 120: 206, 150: 236, 185: 268, 240: 313, 300: 358,
  },
  C: {
    1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125,
    50: 151, 70: 192, 95: 232, 120: 269, 150: 309, 185: 353, 240: 415, 300: 473,
  },
  D: {
    1.5: 18, 2.5: 24, 4: 30, 6: 38, 10: 50, 16: 64, 25: 82, 35: 98,
    50: 116, 70: 143, 95: 169, 120: 192, 150: 217, 185: 243, 240: 280, 300: 316,
  },
  // Tabela 38 — PVC (70 °C), 3 condutores carregados (bandejas perfuradas / leitos / ar livre)
  E: {
    1.5: 18.5, 2.5: 25, 4: 34, 6: 43, 10: 60, 16: 80, 25: 101, 35: 126,
    50: 153, 70: 196, 95: 238, 120: 276, 150: 319, 185: 364, 240: 430, 300: 497,
  },
  F: {
    1.5: 19.5, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 85, 25: 110, 35: 137,
    50: 167, 70: 213, 95: 258, 120: 299, 150: 344, 185: 392, 240: 461, 300: 530,
  },
};

const TABLE_PVC_2COND: Record<InstallationMethod, SectionAmpacityMap> = {
  // Tabela 36 — PVC (70 °C), 2 condutores carregados
  A1: {
    1.5: 14.5, 2.5: 19.5, 4: 26, 6: 34, 10: 46, 16: 61, 25: 80, 35: 99,
    50: 119, 70: 151, 95: 182, 120: 210, 150: 240, 185: 273, 240: 321, 300: 367,
  },
  A2: {
    1.5: 14, 2.5: 18.5, 4: 25, 6: 32, 10: 43, 16: 57, 25: 75, 35: 92,
    50: 110, 70: 139, 95: 167, 120: 192, 150: 219, 185: 248, 240: 291, 300: 334,
  },
  B1: {
    1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125,
    50: 151, 70: 192, 95: 232, 120: 269, 150: 309, 185: 353, 240: 415, 300: 477,
  },
  B2: {
    1.5: 16.5, 2.5: 23, 4: 30, 6: 38, 10: 52, 16: 69, 25: 90, 35: 111,
    50: 133, 70: 168, 95: 201, 120: 232, 150: 265, 185: 300, 240: 351, 300: 401,
  },
  C: {
    1.5: 19.5, 2.5: 27, 4: 36, 6: 46, 10: 63, 16: 85, 25: 112, 35: 138,
    50: 168, 70: 213, 95: 258, 120: 299, 150: 344, 185: 392, 240: 461, 300: 530,
  },
  D: {
    1.5: 22, 2.5: 29, 4: 37, 6: 46, 10: 60, 16: 78, 25: 99, 35: 119,
    50: 140, 70: 173, 95: 204, 120: 231, 150: 261, 185: 292, 240: 336, 300: 379,
  },
  // Tabela 38 — PVC (70 °C), 2 condutores carregados
  E: {
    1.5: 22, 2.5: 30, 4: 40, 6: 51, 10: 70, 16: 94, 25: 119, 35: 148,
    50: 180, 70: 232, 95: 282, 120: 328, 150: 379, 185: 434, 240: 514, 300: 593,
  },
  F: {
    1.5: 24, 2.5: 33, 4: 45, 6: 58, 10: 80, 16: 107, 25: 131, 35: 162,
    50: 196, 70: 251, 95: 304, 120: 352, 150: 406, 185: 463, 240: 546, 300: 629,
  },
};

const TABLE_EPR_XLPE_3COND: Record<InstallationMethod, SectionAmpacityMap> = {
  // Tabela 37 — EPR / XLPE (90 °C), 3 condutores carregados
  A1: {
    1.5: 17, 2.5: 23, 4: 31, 6: 40, 10: 54, 16: 73, 25: 95, 35: 117,
    50: 141, 70: 179, 95: 216, 120: 249, 150: 285, 185: 324, 240: 380, 300: 435,
  },
  A2: {
    1.5: 16.5, 2.5: 22, 4: 30, 6: 38, 10: 51, 16: 68, 25: 89, 35: 109,
    50: 130, 70: 164, 95: 197, 120: 227, 150: 259, 185: 295, 240: 346, 300: 396,
  },
  B1: {
    1.5: 20, 2.5: 28, 4: 37, 6: 48, 10: 66, 16: 88, 25: 117, 35: 144,
    50: 175, 70: 222, 95: 269, 120: 312, 150: 358, 185: 408, 240: 481, 300: 553,
  },
  B2: {
    1.5: 19.5, 2.5: 26, 4: 35, 6: 44, 10: 60, 16: 80, 25: 105, 35: 128,
    50: 154, 70: 194, 95: 233, 120: 268, 150: 307, 185: 348, 240: 407, 300: 465,
  },
  C: {
    1.5: 22, 2.5: 30, 4: 40, 6: 52, 10: 71, 16: 96, 25: 119, 35: 147,
    50: 179, 70: 229, 95: 278, 120: 322, 150: 371, 185: 424, 240: 500, 300: 576,
  },
  D: {
    1.5: 22, 2.5: 29, 4: 37, 6: 46, 10: 61, 16: 79, 25: 101, 35: 122,
    50: 144, 70: 178, 95: 211, 120: 240, 150: 271, 185: 304, 240: 351, 300: 396,
  },
  // Tabela 38 — EPR / XLPE (90 °C), 3 condutores carregados
  E: {
    1.5: 23, 2.5: 31, 4: 42, 6: 54, 10: 75, 16: 100, 25: 127, 35: 158,
    50: 192, 70: 246, 95: 298, 120: 346, 150: 399, 185: 456, 240: 538, 300: 621,
  },
  F: {
    1.5: 24, 2.5: 33, 4: 45, 6: 58, 10: 80, 16: 107, 25: 138, 35: 171,
    50: 209, 70: 269, 95: 328, 120: 382, 150: 441, 185: 506, 240: 599, 300: 693,
  },
};

const TABLE_EPR_XLPE_2COND: Record<InstallationMethod, SectionAmpacityMap> = {
  // Tabela 37 — EPR / XLPE (90 °C), 2 condutores carregados
  A1: {
    1.5: 19, 2.5: 26, 4: 35, 6: 45, 10: 61, 16: 81, 25: 106, 35: 131,
    50: 158, 70: 200, 95: 241, 120: 278, 150: 318, 185: 362, 240: 424, 300: 486,
  },
  A2: {
    1.5: 18.5, 2.5: 25, 4: 33, 6: 42, 10: 57, 16: 76, 25: 99, 35: 121,
    50: 145, 70: 183, 95: 220, 120: 253, 150: 290, 185: 329, 240: 386, 300: 442,
  },
  B1: {
    1.5: 23, 2.5: 31, 4: 42, 6: 54, 10: 75, 16: 100, 25: 133, 35: 164,
    50: 198, 70: 253, 95: 306, 120: 354, 150: 407, 185: 464, 240: 546, 300: 628,
  },
  B2: {
    1.5: 22, 2.5: 30, 4: 40, 6: 51, 10: 69, 16: 91, 25: 119, 35: 146,
    50: 175, 70: 221, 95: 265, 120: 305, 150: 349, 185: 395, 240: 462, 300: 529,
  },
  C: {
    1.5: 24, 2.5: 33, 4: 45, 6: 58, 10: 80, 16: 107, 25: 138, 35: 171,
    50: 209, 70: 269, 95: 328, 120: 382, 150: 441, 185: 506, 240: 599, 300: 693,
  },
  D: {
    1.5: 26, 2.5: 34, 4: 44, 6: 56, 10: 73, 16: 95, 25: 121, 35: 146,
    50: 173, 70: 213, 95: 252, 120: 287, 150: 324, 185: 363, 240: 419, 300: 474,
  },
  // Tabela 38 — EPR / XLPE (90 °C), 2 condutores carregados
  E: {
    1.5: 26, 2.5: 36, 4: 49, 6: 63, 10: 86, 16: 115, 25: 149, 35: 185,
    50: 225, 70: 289, 95: 352, 120: 410, 150: 473, 185: 542, 240: 641, 300: 741,
  },
  F: {
    1.5: 26, 2.5: 36, 4: 49, 6: 63, 10: 86, 16: 115, 25: 161, 35: 200,
    50: 242, 70: 310, 95: 377, 120: 437, 150: 504, 185: 575, 240: 679, 300: 783,
  },
};

// NBR 5410 Tabela 40 (Ar, ref. 30 °C) e Tabela 41 (Solo, ref. 20 °C)
const KT_AIR_PVC: [number, number][] = [
  [10, 1.22], [15, 1.17], [20, 1.12], [25, 1.06], [30, 1.0],
  [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71], [55, 0.61], [60, 0.5],
];

const KT_AIR_EPR_XLPE: [number, number][] = [
  [10, 1.15], [15, 1.12], [20, 1.08], [25, 1.04], [30, 1.0],
  [35, 0.96], [40, 0.91], [45, 0.87], [50, 0.82], [55, 0.76], [60, 0.71],
];

const KT_SOIL_PVC: [number, number][] = [
  [10, 1.1], [15, 1.05], [20, 1.0], [25, 0.95], [30, 0.89],
  [35, 0.84], [40, 0.77], [45, 0.71], [50, 0.63], [55, 0.55], [60, 0.45],
];

const KT_SOIL_EPR_XLPE: [number, number][] = [
  [10, 1.07], [15, 1.04], [20, 1.0], [25, 0.96], [30, 0.93],
  [35, 0.89], [40, 0.85], [45, 0.8], [50, 0.76], [55, 0.71], [60, 0.65],
];

/**
 * Fator de correção de temperatura k_t (NBR 5410 Tabelas 40 e 41).
 * Para temperaturas intermediárias, adota o degrau superior da tabela (conservador).
 */
export function temperatureFactorKt(
  ambientTemp_C: number,
  insulation: InsulationType = "PVC",
  method: InstallationMethod = "C",
): number {
  const isSoil = method === "D";
  const isPvc = insulation === "PVC";
  const table = isSoil
    ? isPvc
      ? KT_SOIL_PVC
      : KT_SOIL_EPR_XLPE
    : isPvc
      ? KT_AIR_PVC
      : KT_AIR_EPR_XLPE;

  if (ambientTemp_C <= table[0][0]) return table[0][1];
  for (const [t, k] of table) {
    if (ambientTemp_C <= t) return k;
  }
  return table[table.length - 1][1];
}

/**
 * Fator de correção de agrupamento de circuitos k_g (NBR 5410 Tabela 42, Linha 1:
 * condutores em feixe ao ar livre, sobre superfície, embutidos ou em conduto fechado).
 */
export function groupingFactorKg(groupedCircuits: number): number {
  const n = Math.max(1, Math.floor(groupedCircuits));
  if (n === 1) return 1.0;
  if (n === 2) return 0.8;
  if (n === 3) return 0.7;
  if (n === 4) return 0.65;
  if (n === 5) return 0.6;
  if (n === 6) return 0.57;
  if (n === 7) return 0.54;
  if (n === 8) return 0.52;
  if (n <= 11) return 0.5;
  if (n <= 15) return 0.45;
  if (n <= 19) return 0.41;
  return 0.38;
}

export interface AmpacityOptions {
  method?: InstallationMethod;
  insulation?: InsulationType;
  loadedConductors?: LoadedConductors;
  ambientTemp_C?: number;
  groupedCircuits?: number;
}

function resolveSection(section_mm2: number): CableSection_mm2 {
  for (const s of NBR5410_SECTIONS) {
    if (s >= section_mm2) return s;
  }
  return 300;
}

/**
 * Retorna a capacidade de condução de corrente tabulada I_z (A) da NBR 5410
 * (Tabelas 36, 37 e 38) sem aplicação dos fatores de correção.
 */
export function ampacityIz(section_mm2: number, opts: AmpacityOptions = {}): number {
  const method = opts.method ?? "C";
  const insulation = opts.insulation ?? "PVC";
  const cond = opts.loadedConductors ?? 3;
  const s = resolveSection(section_mm2);

  if (insulation === "PVC") {
    return cond === 2 ? TABLE_PVC_2COND[method][s] : TABLE_PVC_3COND[method][s];
  }
  return cond === 2 ? TABLE_EPR_XLPE_2COND[method][s] : TABLE_EPR_XLPE_3COND[method][s];
}

/**
 * Retorna a capacidade de condução de corrente corrigida I'_z = I_z · k_t · k_g (A)
 * conforme NBR 5410 §6.2.5.
 */
export function correctedAmpacityIz(section_mm2: number, opts: AmpacityOptions = {}): number {
  const method = opts.method ?? "C";
  const insulation = opts.insulation ?? "PVC";
  const defaultTemp = method === "D" ? 20 : 30;
  const temp = opts.ambientTemp_C ?? defaultTemp;
  const grouped = opts.groupedCircuits ?? 1;

  const Iz = ampacityIz(section_mm2, opts);
  const kt = temperatureFactorKt(temp, insulation, method);
  const kg = groupingFactorKg(grouped);
  return round2(Iz * kt * kg);
}

export interface OverloadCoordinationResult {
  /** Verdadeiro quando ambas as condições da NBR 5410 §5.3.4.1 são atendidas. */
  coordinated: boolean;
  /** Condição 1: I_b <= I_n <= I'_z. */
  condition1_Ib_le_In_le_Iz: boolean;
  /** Condição 2: I_2 <= 1,45 · I'_z (para disjuntores IEC, I_2 = 1,45 · I_n). */
  condition2_I2_le_145Iz: boolean;
  Ib_A: number;
  In_A: number;
  Iz_corrected_A: number;
  I2_A: number;
  maxAllowedI2_A: number;
}

/**
 * Verifica a coordenação entre condutor e dispositivo de proteção contra
 * sobrecarga segundo NBR 5410 §5.3.4.1:
 *   1) I_b <= I_n <= I'_z
 *   2) I_2 <= 1,45 · I'_z
 */
export function verifyOverloadCoordination(
  Ib_A: number,
  In_A: number,
  Iz_corrected_A: number,
  I2_A?: number,
): OverloadCoordinationResult {
  const effectiveI2 = I2_A ?? round2(1.45 * In_A);
  const maxAllowedI2 = round2(1.45 * Iz_corrected_A);
  const cond1 = Ib_A <= In_A + 1e-6 && In_A <= Iz_corrected_A + 1e-6;
  const cond2 = effectiveI2 <= maxAllowedI2 + 1e-6;
  return {
    coordinated: cond1 && cond2,
    condition1_Ib_le_In_le_Iz: cond1,
    condition2_I2_le_145Iz: cond2,
    Ib_A: round2(Ib_A),
    In_A: round2(In_A),
    Iz_corrected_A: round2(Iz_corrected_A),
    I2_A: effectiveI2,
    maxAllowedI2_A: maxAllowedI2,
  };
}

export interface CableSizingOptions extends AmpacityOptions {
  /** Fator multiplicador sobre a corrente de projeto (ex.: 1.25 para motores, 1.0 geral). */
  safetyFactor?: number;
  /** Corrente nominal do dispositivo de proteção I_n (A) para coordenar I_b <= I_n <= I'_z. */
  breaker_A?: number;
  /** Seção mínima normativa (NBR 5410 Tabela 47: 2,5 mm² força, 1,5 mm² iluminação). */
  minSection_mm2?: CableSection_mm2;
  /** Comprimento do circuito (m) para verificação conjunta de queda de tensão. */
  length_m?: number;
  /** Limite máximo de queda de tensão (%) quando `length_m` é fornecido (padrão 5%). */
  maxVoltageDrop_pct?: number;
  /** Tensão nominal entre fases (V) para cálculo de queda de tensão (padrão 380 V). */
  voltage_V?: number;
  /** Fator de potência cosφ para cálculo de queda de tensão (padrão 0,86). */
  cosphi?: number;
}

export interface CableSizingResult {
  section_mm2: CableSection_mm2;
  Iz_table_A: number;
  Iz_corrected_A: number;
  Ib_A: number;
  targetCurrent_A: number;
  requiredTableIz_A: number;
  kt: number;
  kg: number;
  method: InstallationMethod;
  insulation: InsulationType;
  loadedConductors: LoadedConductors;
  breaker_A: number;
  coordination: OverloadCoordinationResult;
  voltageDrop_pct?: number;
}

const BREAKERS = [
  10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630, 800, 1000, 1250,
  1600, 2000, 2500,
];

export function pickBreaker_A(In: number, factor = 1.25): number {
  const target = In * factor;
  for (const b of BREAKERS) if (b >= target) return b;
  return BREAKERS[BREAKERS.length - 1];
}

/**
 * Dimensionamento completo de condutores segundo a ABNT NBR 5410:
 * - Tabelas 36, 37 e 38 por método de instalação (A1..F) e isolação (PVC, EPR, XLPE).
 * - Fatores de correção de temperatura (k_t) e agrupamento (k_g).
 * - Coordenação de sobrecarga (I_b <= I_n <= I'_z) quando `breaker_A` é informado.
 * - Critério complementar de queda de tensão com reatância indutiva quando `length_m` é informado.
 */
export function sizeConductorNBR5410(
  currentA: number,
  opts: CableSizingOptions = {},
): CableSizingResult {
  const method = opts.method ?? "C";
  const insulation = opts.insulation ?? "PVC";
  const loadedConductors = opts.loadedConductors ?? 3;
  const defaultTemp = method === "D" ? 20 : 30;
  const ambientTemp_C = opts.ambientTemp_C ?? defaultTemp;
  const groupedCircuits = opts.groupedCircuits ?? 1;
  const safetyFactor = opts.safetyFactor ?? 1.0;
  const minSection = opts.minSection_mm2 ?? 2.5;

  const kt = temperatureFactorKt(ambientTemp_C, insulation, method);
  const kg = groupingFactorKg(groupedCircuits);
  const correctionProduct = kt * kg;

  const designTarget = currentA * safetyFactor;
  // Se breaker_A foi explicitamente informado, exige I'_z >= max(designTarget, breaker_A)
  // para garantir I_b <= I_n <= I'_z (NBR 5410 §5.3.4.1).
  const targetCurrent =
    opts.breaker_A !== undefined ? Math.max(designTarget, opts.breaker_A) : designTarget;
  const requiredTableIz = correctionProduct > 0 ? targetCurrent / correctionProduct : Infinity;

  let chosenSection: CableSection_mm2 = 300;
  for (const s of NBR5410_SECTIONS) {
    if (s < minSection) continue;
    const Iz = ampacityIz(s, { method, insulation, loadedConductors });
    const IzCorrected = Iz * correctionProduct;
    if (IzCorrected + 1e-9 < targetCurrent) continue;

    if (opts.length_m && opts.length_m > 0) {
      const maxDrop = opts.maxVoltageDrop_pct ?? 5;
      const drop = voltageDrop_pct(
        currentA,
        opts.length_m,
        s,
        opts.voltage_V ?? 380,
        opts.cosphi ?? 0.86,
      );
      if (drop > maxDrop) continue;
    }

    chosenSection = s;
    break;
  }

  const IzTable = ampacityIz(chosenSection, { method, insulation, loadedConductors });
  const IzCorrected = round2(IzTable * correctionProduct);
  const breaker_A = opts.breaker_A ?? pickBreaker_A(currentA, safetyFactor);
  const coordination = verifyOverloadCoordination(currentA, breaker_A, IzCorrected);
  const dropPct =
    opts.length_m && opts.length_m > 0
      ? voltageDrop_pct(
          currentA,
          opts.length_m,
          chosenSection,
          opts.voltage_V ?? 380,
          opts.cosphi ?? 0.86,
        )
      : undefined;

  return {
    section_mm2: chosenSection,
    Iz_table_A: IzTable,
    Iz_corrected_A: IzCorrected,
    Ib_A: round2(currentA),
    targetCurrent_A: round2(targetCurrent),
    requiredTableIz_A: round2(requiredTableIz),
    kt,
    kg,
    method,
    insulation,
    loadedConductors,
    breaker_A,
    coordination,
    voltageDrop_pct: dropPct,
  };
}

/**
 * Seleciona a seção comercial (mm²) do condutor conforme NBR 5410.
 * Aceita tanto o fator numérico clássico (`pickCable_mm2(100, 1.25)`) quanto o
 * objeto completo de opções normativas (`pickCable_mm2(100, { method: "B1", ambientTemp_C: 40, groupedCircuits: 4 })`).
 */
export function pickCable_mm2(
  currentA: number,
  factorOrOpts: number | CableSizingOptions = 1.25,
): number {
  if (typeof factorOrOpts === "number") {
    return sizeConductorNBR5410(currentA, {
      safetyFactor: factorOrOpts,
      method: "C",
      insulation: "PVC",
      loadedConductors: 3,
      ambientTemp_C: 30,
      groupedCircuits: 1,
      minSection_mm2: 2.5,
    }).section_mm2;
  }
  return sizeConductorNBR5410(currentA, factorOrOpts).section_mm2;
}

export function calcMotor(p: MotorSpec): MotorResult {
  const In = motorNominalCurrent(p);
  const Istart = motorStartingCurrent(p, In);
  const breaker_A = pickBreaker_A(In);
  const sizing = sizeConductorNBR5410(In, {
    safetyFactor: 1.25,
    method: p.installationMethod ?? "C",
    insulation: p.insulation ?? "PVC",
    ambientTemp_C: p.ambientTemp_C,
    groupedCircuits: p.groupedCircuits ?? 1,
    loadedConductors: 3,
    breaker_A,
    length_m: p.cableLength_m,
    voltage_V: p.voltage_V ?? 380,
    cosphi: p.cosphi ?? 0.86,
  });
  return {
    ...p,
    In_A: round1(In),
    Istart_A: round1(Istart),
    cable_mm2: sizing.section_mm2,
    breaker_A,
    Iz_corrected_A: sizing.Iz_corrected_A,
    kt: sizing.kt,
    kg: sizing.kg,
    overloadCoordinated: sizing.coordination.coordinated,
  };
}

export interface DemandResult {
  totalLoad_kW: number;
  diversifiedLoad_kW: number;
  apparent_kVA: number;
  current_A: number;
  transformer_kVA: number;
  voltage_V: number;
}

const TRAFOS = [75, 112.5, 150, 225, 300, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000];

export function calcDemand(
  motors: MotorSpec[],
  opts: { voltage_V?: number; diversity?: number; cosphi?: number } = {},
): DemandResult {
  const U = opts.voltage_V ?? 380;
  const div = opts.diversity ?? 0.85;
  const cos = opts.cosphi ?? 0.88;
  const total = motors.reduce((s, m) => s + m.power_kW, 0);
  const diversified = total * div;
  const apparent = diversified / cos;
  const current = (apparent * 1000) / (ROOT3 * U);
  const trafo = TRAFOS.find((t) => t >= apparent * 1.25) ?? TRAFOS[TRAFOS.length - 1];
  return {
    totalLoad_kW: round1(total),
    diversifiedLoad_kW: round1(diversified),
    apparent_kVA: round1(apparent),
    current_A: round1(current),
    transformer_kVA: trafo,
    voltage_V: U,
  };
}

// ── Queda de Tensão com Impedância Complexa (Resistência + Reatância Indutiva) ──

export interface VoltageDropOptions {
  /** Número de fases do circuito (3 = trifásico √3, 1 ou 2 = monofásico/bifásico 2). Padrão: 3. */
  phases?: 1 | 2 | 3;
  /** Reatância indutiva unitária em mΩ/m (Ω/km). Padrão: 0,08 mΩ/m para S >= 35 mm². */
  reactance_mOhm_per_m?: number;
  /**
   * Força inclusão ou exclusão da parcela reativa X_L·sinφ.
   * Quando omitido, inclui automaticamente para condutores com seção >= 35 mm².
   */
  includeReactance?: boolean;
  /** Resistividade do condutor (Ω·mm²/m). Padrão: 0,0178 (cobre). */
  rho_ohm_mm2_per_m?: number;
}

export interface VoltageDropCalcResult {
  /** Queda de tensão absoluta (V). */
  deltaV_V: number;
  /** Queda de tensão percentual (%). */
  deltaV_pct: number;
  /** Parcela puramente resistiva √3·I·R·cosφ (V). */
  resistiveDrop_V: number;
  /** Parcela indutiva √3·I·X_L·sinφ (V). */
  reactiveDrop_V: number;
  /** Resistência total do trecho R = (ρ·L)/S (Ω). */
  resistance_ohm: number;
  /** Reatância indutiva total do trecho X_L = x_L·L (Ω). */
  reactance_ohm: number;
  cosphi: number;
  sinphi: number;
  phases: 1 | 2 | 3;
}

/**
 * Calcula a queda de tensão completa segundo a NBR 5410:
 *   ΔV = k · I · (R · cosφ + X_L · sinφ)
 * onde k = √3 (trifásico) ou 2 (monofásico/bifásico),
 * R = ρ · L / S (ρ_Cu = 0,0178 Ω·mm²/m) e
 * X_L = x_L · L (x_L = 0,08 mΩ/m para condutores >= 35 mm²).
 */
export function calcVoltageDrop(
  currentA: number,
  length_m: number,
  cable_mm2: number,
  voltage_V = 380,
  cosphi = 0.86,
  opts: VoltageDropOptions = {},
): VoltageDropCalcResult {
  const phases = opts.phases ?? 3;
  const phaseFactor = phases === 3 ? ROOT3 : 2;
  const rho = opts.rho_ohm_mm2_per_m ?? RHO_COPPER_OHM_MM2_PER_M;
  const clampedCos = Math.min(1, Math.max(0, cosphi));
  const sinphi = Math.sqrt(Math.max(0, 1 - clampedCos * clampedCos));

  const useReactance =
    opts.includeReactance !== undefined
      ? opts.includeReactance
      : opts.reactance_mOhm_per_m !== undefined || cable_mm2 >= REACTANCE_THRESHOLD_MM2;

  const xUnit_mOhm_per_m = useReactance
    ? (opts.reactance_mOhm_per_m ?? DEFAULT_REACTANCE_MOHM_PER_M)
    : 0;

  const R = (rho * length_m) / cable_mm2; // Ω
  const XL = (xUnit_mOhm_per_m * 1e-3) * length_m; // Ω

  const resistiveDrop_V = phaseFactor * currentA * R * clampedCos;
  const reactiveDrop_V = phaseFactor * currentA * XL * sinphi;
  const deltaV_V = resistiveDrop_V + reactiveDrop_V;
  const deltaV_pct = (deltaV_V / voltage_V) * 100;

  return {
    deltaV_V: round2(deltaV_V),
    deltaV_pct: round2(deltaV_pct),
    resistiveDrop_V: round2(resistiveDrop_V),
    reactiveDrop_V: round2(reactiveDrop_V),
    resistance_ohm: round4(R),
    reactance_ohm: round4(XL),
    cosphi: round4(clampedCos),
    sinphi: round4(sinphi),
    phases,
  };
}

/**
 * Retorna a queda de tensão percentual ΔV% = (ΔV / U) × 100, considerando
 * impedância complexa (R·cosφ + X_L·sinφ) para condutores >= 35 mm².
 */
export function voltageDrop_pct(
  currentA: number,
  length_m: number,
  cable_mm2: number,
  voltage_V = 380,
  cosphi = 0.86,
  opts: VoltageDropOptions = {},
): number {
  return calcVoltageDrop(currentA, length_m, cable_mm2, voltage_V, cosphi, opts).deltaV_pct;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

