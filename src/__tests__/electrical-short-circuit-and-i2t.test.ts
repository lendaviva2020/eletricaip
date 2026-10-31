// Testes de Conformidade Normativa de Curto-Circuito e Suportabilidade Térmica
// Referências:
// - ABNT NBR 5410:2004 §5.3.5 / Tabela 30 (Regime adiabático I²t <= k²S²)
// - IEC 60909-0: Curto-circuito em redes CA e impedância downstream
// - IEC 60364-4-43: Proteção de condutores contra sobrecorrentes de curto-circuito

import { describe, expect, it } from "vitest";
import {
  conductorThermalConstantK,
  minCommercialSectionShortCircuit,
  verifyThermalWithstandI2t,
} from "@/lib/electrical-calc";
import {
  calculateCircuitFeederShortCircuit,
  shortCircuitIEC60909,
  type TransformerSpec,
} from "@/lib/electrical-sim";

describe("NBR 5410 §5.3.5.2 / Tabela 30 — Constante Térmica k", () => {
  it("retorna k = 115 para condutores de cobre com isolação PVC e seção <= 300 mm²", () => {
    expect(conductorThermalConstantK("copper", "PVC", 2.5)).toBe(115);
    expect(conductorThermalConstantK("copper", "PVC", 16)).toBe(115);
    expect(conductorThermalConstantK("copper", "PVC", 150)).toBe(115);
    expect(conductorThermalConstantK("copper", "PVC", 300)).toBe(115);
  });

  it("retorna k = 103 para condutores de cobre com isolação PVC e seção > 300 mm²", () => {
    expect(conductorThermalConstantK("copper", "PVC", 400)).toBe(103);
    expect(conductorThermalConstantK("copper", "PVC", 500)).toBe(103);
  });

  it("retorna k = 143 para condutores de cobre com isolação EPR ou XLPE (90 °C -> 250 °C)", () => {
    expect(conductorThermalConstantK("copper", "EPR", 2.5)).toBe(143);
    expect(conductorThermalConstantK("copper", "XLPE", 50)).toBe(143);
    expect(conductorThermalConstantK("copper", "XLPE", 240)).toBe(143);
  });

  it("retorna k correto para condutores de alumínio (PVC: 76/68; EPR/XLPE: 94)", () => {
    expect(conductorThermalConstantK("aluminum", "PVC", 16)).toBe(76);
    expect(conductorThermalConstantK("aluminum", "PVC", 400)).toBe(68);
    expect(conductorThermalConstantK("aluminum", "EPR", 50)).toBe(94);
    expect(conductorThermalConstantK("aluminum", "XLPE", 150)).toBe(94);
  });
});

describe("NBR 5410 §5.3.5.1 / IEC 60364-4-43 — Suportabilidade Térmica Adiabática (I²·t <= k²·S²)", () => {
  it("aprova condutor de cobre PVC 2,5 mm² sob corrente de falta moderada e atuação rápida", () => {
    // I = 1500 A, t = 0,03 s -> I²t = 1500² * 0,03 = 67.500 A²s
    // k²S² = 115² * 2,5² = 13.225 * 6,25 = 82.656,25 A²s -> OK!
    const res = verifyThermalWithstandI2t({
      section_mm2: 2.5,
      material: "copper",
      insulation: "PVC",
      faultCurrent_A: 1500,
      clearingTime_s: 0.03,
    });

    expect(res.adequate).toBe(true);
    expect(res.k_constant).toBe(115);
    expect(res.i2t_actual_A2s).toBe(67500);
    expect(res.k2s2_allowed_A2s).toBe(82656.3);
    expect(res.minRequiredSection_mm2).toBeLessThanOrEqual(2.5);
    expect(res.marginRatio).toBeLessThan(1.0);
  });

  it("reprova condutor de cobre PVC 2,5 mm² sob falta severa e calcula seção mínima necessária", () => {
    // I = 3000 A, t = 0,05 s -> I²t = 450.000 A²s > 82.656 A²s -> REPROVADO
    // S_min = (3000 * sqrt(0,05)) / 115 = (3000 * 0,2236) / 115 = 5,83 mm² -> comercial 6 mm²
    const res = verifyThermalWithstandI2t({
      section_mm2: 2.5,
      material: "copper",
      insulation: "PVC",
      faultCurrent_A: 3000,
      clearingTime_s: 0.05,
    });

    expect(res.adequate).toBe(false);
    expect(res.minRequiredSection_mm2).toBeCloseTo(5.83, 1);
    expect(res.marginRatio).toBeGreaterThan(1.0);

    // Menor seção comercial padronizada pela NBR 5410 que atende
    const minComm = minCommercialSectionShortCircuit(3000, 0.05, "PVC", "copper");
    expect(minComm).toBe(6);
  });

  it("calcula tempo máximo de eliminação de defeito (t_max) admitido pelo condutor", () => {
    // Para S = 10 mm², k = 115, I = 2500 A:
    // t_max = (k * S / I)² = (115 * 10 / 2500)² = (1150 / 2500)² = 0,46² = 0,2116 s
    const res = verifyThermalWithstandI2t({
      section_mm2: 10,
      faultCurrent_A: 2500,
      clearingTime_s: 0.1,
    });

    expect(res.adequate).toBe(true);
    expect(res.maxClearingTime_s).toBeCloseTo(0.2116, 3);
  });
});

describe("IEC 60909 / NBR 5410 — Curto-Circuito em Alimentadores Downstream", () => {
  it("calcula a impedância acumulada e a atenuação da corrente de curto ao longo do cabo", () => {
    // Alimentador trifásico 380 V, 40 m de cabo cobre PVC 16 mm²
    // Barramento montante com Ik3 = 15 kA
    const res = calculateCircuitFeederShortCircuit({
      length_m: 40,
      section_mm2: 16,
      material: "copper",
      insulation: "PVC",
      voltage_V: 380,
      phases: 3,
      upstream_Ik3_kA: 15,
      clearingTime_s: 0.03,
      breaker_A: 63,
      breaker_curve: "C",
    });

    // 1. A corrente no terminal de carga DEVE ser menor que a corrente a montante (atenuação por impedância)
    expect(res.Ik3_max_kA).toBeLessThan(15);
    expect(res.Ik3_max_kA).toBeGreaterThan(1);

    // 2. Curto bifásico deve ser exatamente (sqrt(3)/2) * Ik3
    const expectedIk2 = (Math.sqrt(3) / 2) * res.Ik3_max_kA;
    expect(res.Ik2_kA).toBeCloseTo(expectedIk2, 1);

    // 3. Curto fase-neutro/terra mínimo deve ser calculado com impedância de loop
    expect(res.Ik1_min_kA).toBeGreaterThan(0);
    expect(res.Ik1_min_kA).toBeLessThan(res.Ik3_max_kA);

    // 4. Suportabilidade térmica adiabática do cabo de 16 mm²
    expect(res.thermalWithstand.adequate).toBe(true);

    // 5. Verificação de disparo magnético instantâneo com disjuntor curva C 63 A (disparo a 10 * In = 630 A)
    expect(res.minMagneticTripCurrent_A).toBe(630);
    expect(res.magneticTripGuaranteed).toBe(true);
  });

  it("integração com transformador dedicado a montante (IEC 60909)", () => {
    const trafo: TransformerSpec = {
      power_kVA: 500,
      secondary_V: 380,
      impedance_pct: 4.5,
      vector_group: "Dyn11",
    };

    // Curto no secundário do trafo
    const trafoIk = shortCircuitIEC60909(trafo);
    expect(trafoIk.Ik3ph_kA).toBeCloseTo(18.57, 1);

    // Curto após alimentador de 60 metros de 35 mm²
    const feeder = calculateCircuitFeederShortCircuit({
      length_m: 60,
      section_mm2: 35,
      material: "copper",
      insulation: "EPR",
      upstream_trafo: trafo,
      clearingTime_s: 0.04,
      breaker_A: 125,
      breaker_curve: "C",
    });

    expect(feeder.Ik3_max_kA).toBeLessThan(trafoIk.Ik3ph_kA);
    expect(feeder.thermalWithstand.adequate).toBe(true);
    expect(feeder.thermalWithstand.k_constant).toBe(143); // EPR
    expect(feeder.magneticTripGuaranteed).toBe(true);
  });

  it("detecta não atuação do disparo magnético quando o circuito é excessivamente longo", () => {
    // Circuito muito longo (350 metros) com condutor fino (2,5 mm²) e disjuntor curva D 32 A (disparo instantâneo em 20 * In = 640 A)
    const longCircuit = calculateCircuitFeederShortCircuit({
      length_m: 350,
      section_mm2: 2.5,
      material: "copper",
      insulation: "PVC",
      upstream_Ik3_kA: 10,
      breaker_A: 32,
      breaker_curve: "D",
    });

    // A impedância de loop elevada (2 * R_cabo) reduz Ik1_min abaixo de 640 A
    expect(longCircuit.minMagneticTripCurrent_A).toBe(640);
    expect(longCircuit.magneticTripGuaranteed).toBe(false);
  });
});
