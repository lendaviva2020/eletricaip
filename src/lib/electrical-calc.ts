// Pure electrical calculations used by the AI architect and the right panel.
// All units SI unless noted. No I/O, no side effects.

export interface MotorSpec {
  id: string;
  power_kW: number;
  voltage_V?: number; // line-to-line, default 380
  cosphi?: number; // default 0.86
  efficiency?: number; // default 0.92
  startMethod?: "DOL" | "SOFT" | "VFD";
}

export interface MotorResult extends MotorSpec {
  In_A: number; // nominal current
  Istart_A: number; // starting current
  cable_mm2: number; // suggested cable cross-section
  breaker_A: number; // suggested breaker rating
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

// IEC 60364 simplified ampacity ladder (PVC, 3 cond. loaded, 30°C)
const AMPACITY: [number, number][] = [
  [2.5, 24],
  [4, 32],
  [6, 41],
  [10, 57],
  [16, 76],
  [25, 101],
  [35, 125],
  [50, 151],
  [70, 192],
  [95, 232],
  [120, 269],
  [150, 309],
  [185, 353],
  [240, 415],
  [300, 473],
];

export function pickCable_mm2(currentA: number, factor = 1.25): number {
  const target = currentA * factor;
  for (const [s, a] of AMPACITY) if (a >= target) return s;
  return 300;
}

const BREAKERS = [
  10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630, 800, 1000, 1250,
  1600, 2000, 2500,
];

export function pickBreaker_A(In: number): number {
  const target = In * 1.25;
  for (const b of BREAKERS) if (b >= target) return b;
  return BREAKERS[BREAKERS.length - 1];
}

export function calcMotor(p: MotorSpec): MotorResult {
  const In = motorNominalCurrent(p);
  const Istart = motorStartingCurrent(p, In);
  return {
    ...p,
    In_A: round1(In),
    Istart_A: round1(Istart),
    cable_mm2: pickCable_mm2(In),
    breaker_A: pickBreaker_A(In),
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

export function voltageDrop_pct(
  currentA: number,
  length_m: number,
  cable_mm2: number,
  voltage_V = 380,
  cosphi = 0.86,
): number {
  // Simplified: ΔV% ≈ (√3 · ρ · L · I · cosφ) / (S · U) * 100, ρ_cu ≈ 0.0178 Ω·mm²/m
  const rho = 0.0178;
  const dv = (ROOT3 * rho * length_m * currentA * cosphi) / (cable_mm2 * voltage_V);
  return round2(dv * 100);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
