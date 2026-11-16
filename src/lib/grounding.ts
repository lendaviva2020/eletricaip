// Aterramento — resistência de eletrodos (puro, determinístico, sem I/O).
//
// Referências:
//  • Dwight (1936) / IEEE Std 80 & IEEE Std 142 (Green Book): haste vertical
//      R = ρ / (2πL) · [ ln(4L / a) − 1 ]   (a = raio da haste)
//  • IEEE Std 142, Tabela 4-5: fatores de multiplicação para n hastes em
//    paralelo com espaçamento ≥ comprimento da haste: Rn = (R1 / n) · F(n).
//  • NBR 5410 §5.1.2.2.4.2 (esquema TT): RA · IΔn ≤ UL, com UL = 50 V (situação 1).

export interface RodGroundingInput {
  /** Resistividade do solo (Ω·m). */
  soilResistivity_ohm_m: number;
  /** Comprimento da haste cravada (m). */
  rodLength_m: number;
  /** Diâmetro da haste (mm). Padrão 15,875 mm (5/8"). */
  rodDiameter_mm?: number;
  /** Número de hastes em paralelo (1..24), espaçadas de pelo menos um comprimento. */
  rods?: number;
}

export interface RodGroundingResult {
  singleRod_ohm: number;
  multiplier: number;
  total_ohm: number;
  rods: number;
}

/** IEEE Std 142 Tabela 4-5 (n → F). Interpolação linear entre pontos. */
const PARALLEL_FACTORS: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 1.16],
  [3, 1.29],
  [4, 1.36],
  [8, 1.68],
  [12, 1.8],
  [16, 1.92],
  [20, 2.0],
  [24, 2.16],
];

export function parallelRodFactor(n: number): number {
  const rods = Math.round(n);
  if (rods <= 1) return 1;
  for (let i = 1; i < PARALLEL_FACTORS.length; i++) {
    const [n1, f1] = PARALLEL_FACTORS[i - 1];
    const [n2, f2] = PARALLEL_FACTORS[i];
    if (rods <= n2) return f1 + ((rods - n1) * (f2 - f1)) / (n2 - n1);
  }
  return PARALLEL_FACTORS[PARALLEL_FACTORS.length - 1][1];
}

export function rodGroundingResistance(input: RodGroundingInput): RodGroundingResult {
  const rho = input.soilResistivity_ohm_m;
  const L = input.rodLength_m;
  const d_mm = input.rodDiameter_mm ?? 15.875;
  const n = Math.round(input.rods ?? 1);
  if (!Number.isFinite(rho) || rho <= 0) throw new Error("resistivity_must_be_positive");
  if (!Number.isFinite(L) || L <= 0) throw new Error("rod_length_must_be_positive");
  if (!Number.isFinite(d_mm) || d_mm <= 0) throw new Error("rod_diameter_must_be_positive");
  if (n < 1 || n > 24) throw new Error("rods_out_of_range");
  const a = d_mm / 2000; // raio em m
  if (4 * L <= a * Math.E) throw new Error("rod_geometry_invalid");
  const R1 = (rho / (2 * Math.PI * L)) * (Math.log((4 * L) / a) - 1);
  const F = parallelRodFactor(n);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { singleRod_ohm: r2(R1), multiplier: r2(F), total_ohm: r2((R1 / n) * F), rods: n };
}

export interface TTCheck {
  /** Resistência máxima de aterramento das massas: UL / IΔn (Ω). */
  maxRA_ohm: number;
  compliant: boolean;
}

/** NBR 5410 esquema TT: RA ≤ UL / IΔn (UL = 50 V em locais normais, 25 V em locais molhados). */
export function checkTTProtection(
  RA_ohm: number,
  residualCurrent_mA: number,
  touchLimit_V = 50,
): TTCheck {
  if (!(residualCurrent_mA > 0)) throw new Error("residual_current_must_be_positive");
  const maxRA = touchLimit_V / (residualCurrent_mA / 1000);
  return { maxRA_ohm: Math.round(maxRA * 100) / 100, compliant: RA_ohm <= maxRA };
}
