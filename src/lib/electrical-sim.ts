// Motor de simulação elétrica de potência — curto-circuito, seletividade,
// arco elétrico e esforço térmico de partida.
//
// Puro e determinístico (sem I/O, sem Math.random, sem Date.now). Todos os
// valores derivam de fórmulas normativas documentadas. Nada aqui atesta
// aptidão para operação: os resultados são apoio de engenharia e precisam
// ser conferidos por profissional habilitado (Termos §10).
//
// Referências:
// - IEC 60909-0: curto-circuito em redes de corrente alternada (c, ip, Ztr).
// - IEC 60947-1 / 60947-4-5: coordenação e seletividade de aparelhagem.
// - IEEE 1584.1 / 1584-2002: energia incidente de arco elétrico.
// - NBR 5410: dimensionamento de condutores (Tabelas 36, 37, 38, 40, 41, 42)
//   e queda de tensão com impedância complexa (motor unificado em electrical-calc).

import {
  ampacityIz,
  calcVoltageDrop,
  conductorThermalConstantK,
  correctedAmpacityIz,
  groupingFactorKg,
  minCommercialSectionShortCircuit,
  pickBreaker_A,
  pickCable_mm2,
  sizeConductorNBR5410,
  temperatureFactorKt,
  verifyOverloadCoordination,
  verifyThermalWithstandI2t,
  voltageDrop_pct,
  type AmpacityOptions,
  type CableSection_mm2,
  type CableSizingOptions,
  type CableSizingResult,
  type ConductorMaterial,
  type InstallationMethod,
  type InsulationType,
  type LoadedConductors,
  type OverloadCoordinationResult,
  type ThermalWithstandParams,
  type ThermalWithstandResult,
  type VoltageDropCalcResult,
  type VoltageDropOptions,
} from "@/lib/electrical-calc";

export {
  ampacityIz,
  calcVoltageDrop,
  conductorThermalConstantK,
  correctedAmpacityIz,
  groupingFactorKg,
  minCommercialSectionShortCircuit,
  pickBreaker_A,
  pickCable_mm2,
  sizeConductorNBR5410,
  temperatureFactorKt,
  verifyOverloadCoordination,
  verifyThermalWithstandI2t,
  voltageDrop_pct,
  type AmpacityOptions,
  type CableSection_mm2,
  type CableSizingOptions,
  type CableSizingResult,
  type ConductorMaterial,
  type InstallationMethod,
  type InsulationType,
  type LoadedConductors,
  type OverloadCoordinationResult,
  type ThermalWithstandParams,
  type ThermalWithstandResult,
  type VoltageDropCalcResult,
  type VoltageDropOptions,
};

const SQRT3 = Math.sqrt(3);

export interface TransformerSpec {
  power_kVA: number;
  secondary_V: number; // tensão nominal de serviço (linha)
  impedance_pct: number; // Uk (%) nominal
  vector_group?: string; // ex.: "Dyn11", "Yyn0"
  /** Relação X/R do trafo. Se ausente, usa valor típico por potência. */
  x_r_ratio?: number;
}

export type EarthingSystem = "TN-S" | "TN-C" | "TN-C-S" | "TT" | "IT";

export interface ShortCircuitResult {
  /** Corrente de curtocircuito trifásica de symmetria (kA rms). */
  Ik3ph_kA: number;
  /** Corrente de curto monofásica (terra) em regime permanente (kA rms). */
  Ik1ph_kA: number;
  /** Corrente de pico da primeira meia-onda (kA). */
  ip_kA: number;
  /** Fator X/R da rede (equivalente do trafo). */
  X_R: number;
  /** Fator de tensão c da IEC 60909-0 (1,1 em BT; 1,05 em MT). */
  c_factor: number;
  /** Fator de curto monofásico Z0/Z1 derivado do grupo vetorial. */
  k0_ratio: number;
  U_nom_V: number;
  transformer_kVA: number;
  impedance_pct: number;
  /** Impedância do trafo em ohm (por fase). */
  Z_transformer_ohm: number;
}

/** Valores típicos de X/R por faixa de potência do trafo (IEC 60909, Anexo A). */
export function typicalXR(power_kVA: number): number {
  if (power_kVA <= 630) return 3.5;
  if (power_kVA <= 2500) return 6.5;
  return 10;
}

/**
 * Fator de sequência zero (Z0/Z1) aproximado por grupo vetorial.
 * Valores conservadores (quanto maior k0, menor a corrente monofásica).
 * Grupo ausente assume `Dyn11` (padrão de distribuição BT no Brasil).
 */
export function zeroSequenceRatio(vectorGroup?: string): number {
  const vg = (vectorGroup ?? "Dyn11").toUpperCase();
  if (vg.startsWith("DYN")) return 1.0; // estrela aterrada via delta → Z0 ≈ Z1
  if (vg.startsWith("YYN")) return 4.0; // estrela-estrela sem caminho zero-seq
  if (vg.startsWith("YN")) return 1.5;
  return 1.2; // padrão conservador
}

/**
 * Fator de tensão c (IEC 60909-0 §3.6.1):
 * 1,10 em BT (Un ≤ 1 kV) e 1,05 em MT (1 kV < Un ≤ 35 kV).
 */
export function voltageFactorC(voltage_V: number): number {
  return voltage_V <= 1000 ? 1.1 : 1.05;
}

/**
 * Fator de pico k em função de X/R (IEC 60909-0 eq. 25, 50 Hz):
 * k = 1,02 + 0,98 · e^(−3/(X/R))
 */
export function peakFactorK(xr: number): number {
  const safeXr = Math.max(0.5, xr);
  return 1.02 + 0.98 * Math.exp(-3 / safeXr);
}

/**
 * Corrente de curto-circuito na barra secundária do transformador de
 * alimentação, conforme IEC 60909-0 simplificado para fonte via trafo.
 *
 * Ztr = (uk% / 100) · Un² / Sn ;  I''k3ph = c · Un / (√3 · Ztr)
 * I''k1ph = I''k3ph · 3 / (2 + k0)
 *
 * `Sn` entra em **VA** (a entrada é em kVA e é convertida aqui); usar kVA
 * direto superestima Z em 1000× e subestima Ik em 1000×.
 */
export function shortCircuitIEC60909(
  trafo: TransformerSpec,
  opts: { voltage_V?: number; earthing?: EarthingSystem } = {},
): ShortCircuitResult {
  const U = opts.voltage_V ?? trafo.secondary_V;
  const Sn = trafo.power_kVA;
  const uk = trafo.impedance_pct;
  if (Sn <= 0) throw new Error("transformer_power_must_be_positive");
  if (uk <= 0 || uk > 30) throw new Error("transformer_impedance_out_of_range");

  const c = voltageFactorC(U);
  const Z = ((uk / 100) * (U * U)) / (Sn * 1000); // ohm/fase (Sn em VA)
  const Ik3ph = (c * U) / (SQRT3 * Z); // A rms

  const k0 = zeroSequenceRatio(trafo.vector_group);
  // IT aterrado por impedância reduz a corrente monofásica pela metade.
  const earthPenalty = opts.earthing === "IT" ? 2 : 1;
  const Ik1ph = (Ik3ph * 3) / ((2 + k0) * earthPenalty);

  const xr = trafo.x_r_ratio ?? typicalXR(Sn);
  const ip = peakFactorK(xr) * SQRT3 * Ik3ph;

  return {
    Ik3ph_kA: round2(Ik3ph / 1000),
    Ik1ph_kA: round2(Ik1ph / 1000),
    ip_kA: round2(ip / 1000),
    X_R: round2(xr),
    c_factor: c,
    k0_ratio: k0,
    U_nom_V: U,
    transformer_kVA: Sn,
    impedance_pct: uk,
    Z_transformer_ohm: round4(Z),
  };
}

// ---------------- Curto-circuito ao longo do alimentador / circuito (IEC 60909 / NBR 5410) ----------------

export interface CircuitFeederShortCircuitSpec {
  /** Comprimento do alimentador em metros. */
  length_m: number;
  /** Seção transversal do condutor (mm²). */
  section_mm2: CableSection_mm2;
  /** Material do condutor (cobre ou alumínio). Padrão: "copper". */
  material?: ConductorMaterial;
  /** Tipo de isolação do condutor. Padrão: "PVC". */
  insulation?: InsulationType;
  /** Tensão nominal entre fases em V. Padrão: 380 V. */
  voltage_V?: number;
  /** Número de fases (1, 2 ou 3). Padrão: 3. */
  phases?: 1 | 2 | 3;
  /** Corrente de curto trifásico no barramento a montante em kA rms. Padrão: 25 kA. */
  upstream_Ik3_kA?: number;
  /** Especificação do transformador a montante (se disponível, substitui upstream_Ik3_kA). */
  upstream_trafo?: TransformerSpec;
  /** Relação X/R da impedância a montante. Padrão: 3.0. */
  upstream_XR?: number;
  /** Tempo total de eliminação do defeito pela proteção (s). Padrão: 0.04 s (disparo instantâneo). */
  clearingTime_s?: number;
  /** Corrente nominal do disjuntor de proteção (A). */
  breaker_A?: number;
  /** Curva do disjuntor (B = 5×In, C = 10×In, D = 20×In). Padrão: "C". */
  breaker_curve?: "B" | "C" | "D";
}

export interface CircuitFeederShortCircuitResult {
  /** Corrente de curto-circuito trifásica simétrica máxima no final do circuito (kA rms). */
  Ik3_max_kA: number;
  /** Corrente de curto-circuito bifásica no final do circuito (kA rms). */
  Ik2_kA: number;
  /** Corrente de curto-circuito monofásica/fase-terra mínima no final do circuito (kA rms). */
  Ik1_min_kA: number;
  /** Corrente de pico no final do circuito (kA). */
  ip_kA: number;
  /** Impedância total no ponto de falta para curto máximo (mΩ). */
  Z_total_max_mOhm: number;
  /** Impedância total de loop para curto mínimo fase-neutro/terra (mΩ). */
  Z_loop_min_mOhm: number;
  /** Resistência do cabo a 20 °C (frio, máximo defeito) (mΩ). */
  R_cable_20C_mOhm: number;
  /** Resistência do cabo a 70 °C (quente, mínimo defeito para desarme) (mΩ). */
  R_cable_hot_mOhm: number;
  /** Reatância indutiva do cabo (mΩ). */
  X_cable_mOhm: number;
  /** Verificação de suportabilidade térmica adiabática I²t <= k²S² (NBR 5410 §5.3.5). */
  thermalWithstand: ThermalWithstandResult;
  /** Indica se a corrente de curto mínima Ik1_min é suficiente para o disparo magnético instantâneo. */
  magneticTripGuaranteed?: boolean;
  /** Corrente mínima necessária para disparo instantâneo da curva do disjuntor (A). */
  minMagneticTripCurrent_A?: number;
}

/**
 * Calcula a corrente de curto-circuito downstream no ponto da carga/terminal de um circuito,
 * considerando a impedância a montante e a impedância distribuída dos condutores (IEC 60909-0),
 * e verifica a suportabilidade térmica adiabática do cabo (NBR 5410 §5.3.5 / I²·t <= k²·S²).
 */
export function calculateCircuitFeederShortCircuit(
  spec: CircuitFeederShortCircuitSpec,
): CircuitFeederShortCircuitResult {
  const U = spec.voltage_V ?? 380;
  const phases = spec.phases ?? 3;
  const L = spec.length_m;
  const S = spec.section_mm2;
  const material = spec.material ?? "copper";
  const insulation = spec.insulation ?? "PVC";
  const t_clearing = spec.clearingTime_s ?? 0.04;

  // Resistividade: Cobre (0,017241 a 20°C, 0,0178 a 70°C); Alumínio (0,02826 a 20°C, 0,034 a 70°C)
  const rho20 = material === "copper" ? 0.017241 : 0.028264;
  const rhoHot = material === "copper" ? 0.0178 : 0.034;
  const x_unit = 0.08e-3; // 0,08 mΩ/m = 0,08 × 10^-3 Ω/m

  // 1. Impedância a montante (R_up e X_up em ohm)
  let R_up = 0;
  let X_up = 0;
  let xr_up = spec.upstream_XR ?? 3.0;

  if (spec.upstream_trafo) {
    const trafoRes = shortCircuitIEC60909(spec.upstream_trafo, { voltage_V: U });
    const Z_tr = trafoRes.Z_transformer_ohm;
    xr_up = trafoRes.X_R;
    R_up = Z_tr / Math.sqrt(1 + xr_up * xr_up);
    X_up = R_up * xr_up;
  } else {
    const Ik_up_kA = spec.upstream_Ik3_kA ?? 25;
    const c_max = voltageFactorC(U);
    const Z_up = (c_max * U) / (SQRT3 * (Ik_up_kA * 1000));
    R_up = Z_up / Math.sqrt(1 + xr_up * xr_up);
    X_up = R_up * xr_up;
  }

  // 2. Impedância do cabo (em ohm)
  const R_c_20 = (rho20 * L) / S;
  const R_c_hot = (rhoHot * L) / S;
  const X_c = x_unit * L;

  // 3. Curto-Circuito Máximo Trifásico (Cabo a 20 °C, c = 1,10)
  const c_max = voltageFactorC(U);
  const R_tot_max = R_up + R_c_20;
  const X_tot_max = X_up + X_c;
  const Z_tot_max = Math.sqrt(R_tot_max * R_tot_max + X_tot_max * X_tot_max);

  const Ik3_max_A = (c_max * U) / (SQRT3 * Z_tot_max);
  const Ik2_A = (SQRT3 / 2) * Ik3_max_A;

  const xr_fault = X_tot_max / Math.max(1e-6, R_tot_max);
  const ip_A = peakFactorK(xr_fault) * SQRT3 * Ik3_max_A;

  // 4. Curto-Circuito Mínimo Fase-Neutro/Fase-Terra (Cabo quente, c_min = 0,95)
  // Impedância de loop: condutor de fase + condutor de retorno neutro/PE
  const c_min = 0.95;
  const U_fase = U / SQRT3;
  const loopMultiplier = phases === 1 ? 2 : 2; // ida e volta no defeito fase-neutro/terra
  const R_loop = R_up + loopMultiplier * R_c_hot;
  const X_loop = X_up + loopMultiplier * X_c;
  const Z_loop = Math.sqrt(R_loop * R_loop + X_loop * X_loop);
  const Ik1_min_A = (c_min * U_fase) / Z_loop;

  // 5. Verificação Térmica I²t <= k²S² sob Ik3_max
  const thermalWithstand = verifyThermalWithstandI2t({
    section_mm2: S,
    material,
    insulation,
    faultCurrent_A: Ik3_max_A,
    clearingTime_s: t_clearing,
  });

  // 6. Verificação de Disparo Instantâneo Magnético
  let magneticTripGuaranteed: boolean | undefined;
  let minMagneticTripCurrent_A: number | undefined;

  if (spec.breaker_A !== undefined) {
    const curve = spec.breaker_curve ?? "C";
    const factor = curve === "B" ? 5 : curve === "D" ? 20 : 10;
    minMagneticTripCurrent_A = spec.breaker_A * factor;
    magneticTripGuaranteed = Ik1_min_A >= minMagneticTripCurrent_A;
  }

  return {
    Ik3_max_kA: round2(Ik3_max_A / 1000),
    Ik2_kA: round2(Ik2_A / 1000),
    Ik1_min_kA: round2(Ik1_min_A / 1000),
    ip_kA: round2(ip_A / 1000),
    Z_total_max_mOhm: round2(Z_tot_max * 1000),
    Z_loop_min_mOhm: round2(Z_loop * 1000),
    R_cable_20C_mOhm: round2(R_c_20 * 1000),
    R_cable_hot_mOhm: round2(R_c_hot * 1000),
    X_cable_mOhm: round2(X_c * 1000),
    thermalWithstand,
    magneticTripGuaranteed,
    minMagneticTripCurrent_A,
  };
}

// ---------------- Aparelhagem e seletividade (IEC 60947) ----------------

export type ProtectionKind =
  "MCB" | "MCCB" | "ACB" | "fuse" | "thermal_overload" | "motor_protection";

export interface ProtectionDevice {
  id: string;
  type: ProtectionKind;
  rating_A: number;
  curve?: "B" | "C" | "D" | "K" | "Z";
  /** Corrente instantânea (A). Ausente → assumida pela curva padrão. */
  instantaneous_A?: number;
  /** Capacidade de ruptura (kA). Ausente → assume 25 kA (comum em BT). */
  breaking_kA?: number;
  /** Atraso térmico (s) a 6×In, usado só na comparação qualitativa. */
  thermal_delay_s?: number;
}

/** Fator instantâneo típico por curva MCB (IEC 60898 / 60947-2). */
export function defaultInstantaneous(device: ProtectionDevice): number {
  if (device.instantaneous_A) return device.instantaneous_A;
  switch (device.curve) {
    case "B":
      return device.rating_A * 3;
    case "C":
      return device.rating_A * 5;
    case "D":
      return device.rating_A * 10;
    case "K":
    case "Z":
      return device.rating_A * 8;
    default:
      break;
  }
  // MCCB/ACB/fusível: banda magnética típica 5…10×In → usa 8×In (conservador).
  return device.rating_A * 8;
}

export function breakingCapacity(device: ProtectionDevice): number {
  return device.breaking_kA ?? 25;
}

export interface CapacityCheck {
  deviceId: string;
  Ik_kA: number;
  breaking_kA: number;
  adequate: boolean;
  margin: number; // breaking − Ik (kA)
}

/** Verifica ruptura suficiente contra a corrente de curto disponível. */
export function checkBreakingCapacity(devices: ProtectionDevice[], Ik_kA: number): CapacityCheck[] {
  return devices.map((d) => {
    const b = breakingCapacity(d);
    return {
      deviceId: d.id,
      Ik_kA: round2(Ik_kA),
      breaking_kA: round2(b),
      adequate: b >= Ik_kA,
      margin: round2(b - Ik_kA),
    };
  });
}

export type SelectivityMode = "total" | "partial" | "none";

export interface SelectivityResult {
  upstreamId: string;
  downstreamId: string;
  mode: SelectivityMode;
  selective: boolean;
  /** Corrente máxima (A) até a qual o montante isola o defeito sozinho. */
  maxDiscriminatingCurrent_A: number;
  reasons: string[];
}

/**
 * Seletividade corrente-tempo entre dois dispositivos em série.
 *
 * Regras aplicadas (conservadoras, derivadas das curvas da IEC 60947-1):
 * 1. Magnética: exige I_inst(montante) ≥ 1,5 × I_inst(jusante). Sem isso o
 *    montante pode disparar no mesmo defeito → "none".
 * 2. Térmica: exige que o tempo do montante a 1,5×In(jusante) seja maior que
 *    o do jusante. Aproximado pelo atraso térmico informado.
 * 3. Ruptura: se o montante não rompe a corrente disponível, a seletividade
 *    é irrelevantemente nula.
 *
 * Isto é uma análise de coordenação simplificada. A seletividade total
 * definitiva depende das tabelas do fabricante.
 */
export function selectivityIEC60947(
  upstream: ProtectionDevice,
  downstream: ProtectionDevice,
  faultCurrent_A: number,
): SelectivityResult {
  const reasons: string[] = [];
  const iUp = defaultInstantaneous(upstream);
  const iDown = defaultInstantaneous(downstream);

  const magRatio = iDown > 0 ? iUp / iDown : 0;
  const magOk = magRatio >= 1.5;
  reasons.push(
    `instantâneo montante ${round1(iUp)}A vs jusante ${round1(iDown)}A (razão ${round2(magRatio)})`,
  );

  const thermalUp = upstream.thermal_delay_s ?? defaultThermalDelay(upstream.rating_A);
  const thermalDown = downstream.thermal_delay_s ?? defaultThermalDelay(downstream.rating_A);
  // Razão de tempos: proteção montante precisa ser bem mais lenta.
  const thermalRatio = thermalDown > 0 ? thermalUp / thermalDown : 0;
  const thermalOk = thermalRatio >= 3;
  reasons.push(`atraso térmico ${round1(thermalUp)}s vs ${round1(thermalDown)}s`);

  const rUp = upstream.rating_A;
  const rDown = downstream.rating_A;
  const ratingOk = rUp >= rDown * 2;
  reasons.push(`classificação ${rUp}A vs ${rDown}A`);

  const ratioFaultUpstream = iUp > 0 ? faultCurrent_A / iUp : Infinity;
  const ratioFaultDownstream = iDown > 0 ? faultCurrent_A / iDown : Infinity;

  let mode: SelectivityMode;
  if (!magOk) {
    mode = "none";
  } else if (ratingOk && thermalOk) {
    // Se o defeito excede o instantâneo do jusante, quem manda é o tempo.
    mode = ratioFaultDownstream <= 1.2 ? "total" : ratioFaultUpstream >= 1.2 ? "partial" : "total";
  } else if (ratingOk) {
    mode = "partial";
  } else {
    mode = "none";
  }

  const maxDiscriminating = mode === "total" ? iUp : mode === "partial" ? iDown * 3 : 0;

  return {
    upstreamId: upstream.id,
    downstreamId: downstream.id,
    mode,
    selective: mode !== "none",
    maxDiscriminatingCurrent_A: round1(maxDiscriminating),
    reasons,
  };
}

/** Atraso térmico típico (s) a 6×In, escala aproximada por classificação. */
function defaultThermalDelay(rating_A: number): number {
  if (rating_A <= 32) return 8;
  if (rating_A <= 125) return 15;
  if (rating_A <= 400) return 30;
  return 60;
}

// ---------------- Arco elétrico (IEEE 1584) ----------------

export type ElectrodeConfiguration = "VB" | "VC" | "VD" | "HA" | "HB" | "HC";

export interface ArcFlashResult {
  incidentEnergy_J_cm2: number;
  incidentEnergy_cal_cm2: number;
  /** Tempo de curto-circuito usado (s) — 0,1 s típico para BT. */
  clearingTime_s: number;
  /** Distância de trabalho padrão IEEE 1584 (455 mm). */
  workingDistance_mm: number;
  ppe_category: 0 | 1 | 2 | 3 | 4;
  arc_boundary_mm: number;
}

/**
 * Energia incidente de arco elétrico — IEEE 1584-2002 (equação abreviada,
 * 3 fases, proteção aterrada por condutor):
 *
 * E = 0,137 · I_bc^0,4488 · Z_k^0,2451 · D^0,6403 · e^(0,023·G)   [J/cm²]
 *
 * com I_bc em kA, Z_k = entreferro do eletrodo (mm), D = distância de
 * trabalho (mm), G = gap do arco (mm).
 */
export function arcFlashIEEE1584(
  ik_kA: number,
  opts: {
    clearingTime_s?: number;
    workingDistance_mm?: number;
    electrodeGap_mm?: number;
    configuration?: ElectrodeConfiguration;
  } = {},
): ArcFlashResult {
  const gap = opts.electrodeGap_mm ?? defaultGap(opts.configuration ?? "VB");
  const D = opts.workingDistance_mm ?? 455;
  const t = opts.clearingTime_s ?? 0.1;
  const Ibc = Math.max(0.1, ik_kA);

  const eJ =
    0.137 *
    Math.pow(Ibc, 0.4488) *
    Math.pow(gap, 0.2451) *
    Math.pow(D, 0.6403) *
    Math.exp(0.023 * gap) *
    t;
  const eCal = eJ / 4.184;

  return {
    incidentEnergy_J_cm2: round2(eJ),
    incidentEnergy_cal_cm2: round2(eCal),
    clearingTime_s: t,
    workingDistance_mm: D,
    ppe_category: ppeFromEnergy(eCal),
    arc_boundary_mm: round0(calculateArcBoundary(eCal, D)),
  };
}

function defaultGap(config: ElectrodeConfiguration): number {
  switch (config) {
    case "VB":
      return 32;
    case "VC":
      return 32;
    case "VD":
      return 32;
    case "HA":
      return 19;
    case "HB":
      return 19;
    case "HC":
      return 19;
    default:
      return 32;
  }
}

/** Categorias PPE da NFPA 70E (kcal/cm²): <1,2 | <4 | <8 | <25 | ≥25. */
export function ppeFromEnergy(cal_cm2: number): 0 | 1 | 2 | 3 | 4 {
  if (cal_cm2 < 1.2) return 0;
  if (cal_cm2 < 4) return 1;
  if (cal_cm2 < 8) return 2;
  if (cal_cm2 < 25) return 3;
  return 4;
}

function calculateArcBoundary(cal_cm2: number, workingDistance_mm: number): number {
  if (cal_cm2 <= 0) return workingDistance_mm;
  // E ∝ D^0,6403 → D_boundary = D · (1,2/E)^(1/0,6403)
  const ratio = 1.2 / cal_cm2;
  if (ratio <= 1) return workingDistance_mm;
  return workingDistance_mm * Math.pow(ratio, 1 / 0.6403);
}

// ---------------- Esforço térmico de partida de motor ----------------

/** Constante térmica do enrolamento (s) — partida tipo N, IEC 60947-4-5. */
const THERMAL_TIME_CONSTANT_S = 120;
/** Elevação admissível da partida acima da temperatura inicial (°C). */
const ALLOWABLE_RISE_C = 60;

export interface MotorStartThermalResult {
  motorId: string;
  Istart_A: number;
  In_A: number;
  duration_s: number;
  /** Energia adiabática I²t (A²·s). */
  i2t_A2s: number;
  /** Razão Istart/In usada na modelagem. */
  currentRatio: number;
  /** Estimativa de elevação de temperatura do condutor (°C). */
  estimatedRise_C: number;
  tripRisk: "LOW" | "MEDIUM" | "HIGH";
}

/**
 * Partida de motor em regime adiabático sobre o elemento térmico do relé.
 *
 * - I²t = Istart² · t (energia absoluta, independente do enrolamento)
 * - ΔT = (Istart/In)² · (t/τ) · ΔT_adm, com τ = 120 s (constante térmica do
 *   enrolamento, partida tipo N da IEC 60947-4-5) e ΔT_adm = 60 °C (elevação
 *   admissível da partida acima da temperatura inicial, com margem sobre a
 *   classe F).
 *
 * Modelar só a razão I²t sem normalizar por τ faz qualquer partida DOL típica
 * (≈7·In por 2–4 s) cair em "HIGH", tornando a classificação um gerador de
 * falso alarme. A normalização por τ é o que separa uma partida normal de uma
 * partida prolongada.
 *
 * O risco usa limiares de 90 °C (HIGH) e 60 °C (MEDIUM).
 */
export function motorStartThermal(
  motorId: string,
  In_A: number,
  Istart_A: number,
  duration_s: number,
): MotorStartThermalResult {
  if (In_A <= 0) throw new Error("nominal_current_must_be_positive");
  const ratio = Istart_A / In_A;
  const i2t = Istart_A * Istart_A * duration_s;
  const rise = ratio * ratio * (duration_s / THERMAL_TIME_CONSTANT_S) * ALLOWABLE_RISE_C;
  const tripRisk: MotorStartThermalResult["tripRisk"] =
    rise > 90 ? "HIGH" : rise > 60 ? "MEDIUM" : "LOW";

  return {
    motorId,
    In_A: round1(In_A),
    Istart_A: round1(Istart_A),
    duration_s: round1(duration_s),
    i2t_A2s: round0(i2t),
    currentRatio: round2(ratio),
    estimatedRise_C: round1(rise),
    tripRisk,
  };
}

// ---------------- Queda de tensão e dimensionamento NBR 5410 ----------------

export interface VoltageDropCircuitOptions extends VoltageDropOptions {
  voltage_V?: number;
  cosphi?: number;
  limit_pct?: number;
  installationMethod?: InstallationMethod;
  insulation?: InsulationType;
  loadedConductors?: LoadedConductors;
  ambientTemp_C?: number;
  groupedCircuits?: number;
  breaker_A?: number;
}

export interface VoltageDropResult {
  circuitId: string;
  length_m: number;
  current_A: number;
  cable_mm2: number;
  voltage_drop_V: number;
  voltage_drop_pct: number;
  resistance_ohm: number;
  reactance_ohm: number;
  /** NBR 5410: ≤3% em iluminação, ≤5% em força. */
  limit_pct: number;
  within_limit: boolean;
  /** Capacidade de condução corrigida I'_z (A) segundo NBR 5410. */
  Iz_corrected_A: number;
  /** Atende I_b <= I'_z (e I_b <= I_n <= I'_z quando disjuntor informado). */
  thermal_adequate: boolean;
  /** Seção mínima recomendada (mm²) combinando critério térmico + queda de tensão. */
  recommended_cable_mm2: number;
}

export function voltageDropCircuit(
  circuitId: string,
  current_A: number,
  length_m: number,
  cable_mm2: number,
  opts: VoltageDropCircuitOptions = {},
): VoltageDropResult {
  const limit = opts.limit_pct ?? 5;
  const voltage_V = opts.voltage_V ?? 380;
  const cosphi = opts.cosphi ?? 0.86;
  const vd = calcVoltageDrop(current_A, length_m, cable_mm2, voltage_V, cosphi, {
    phases: opts.phases,
    reactance_mOhm_per_m: opts.reactance_mOhm_per_m,
    includeReactance: opts.includeReactance,
    rho_ohm_mm2_per_m: opts.rho_ohm_mm2_per_m,
  });

  const ampOpts: AmpacityOptions = {
    method: opts.installationMethod ?? "C",
    insulation: opts.insulation ?? "PVC",
    loadedConductors: opts.loadedConductors ?? (opts.phases && opts.phases < 3 ? 2 : 3),
    ambientTemp_C: opts.ambientTemp_C,
    groupedCircuits: opts.groupedCircuits ?? 1,
  };
  const IzCorrected = correctedAmpacityIz(cable_mm2, ampOpts);
  const thermalAdequate =
    opts.breaker_A !== undefined
      ? verifyOverloadCoordination(current_A, opts.breaker_A, IzCorrected).coordinated
      : current_A <= IzCorrected + 1e-6;

  const recommended = sizeConductorNBR5410(current_A, {
    ...ampOpts,
    breaker_A: opts.breaker_A,
    length_m,
    maxVoltageDrop_pct: limit,
    voltage_V,
    cosphi,
  }).section_mm2;

  return {
    circuitId,
    length_m,
    current_A: round1(current_A),
    cable_mm2,
    voltage_drop_V: vd.deltaV_V,
    voltage_drop_pct: vd.deltaV_pct,
    resistance_ohm: vd.resistance_ohm,
    reactance_ohm: vd.reactance_ohm,
    limit_pct: limit,
    within_limit: vd.deltaV_pct <= limit,
    Iz_corrected_A: IzCorrected,
    thermal_adequate: thermalAdequate,
    recommended_cable_mm2: recommended,
  };
}

// ---------------- utilitários ----------------

function round0(n: number) {
  return Math.round(n);
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
