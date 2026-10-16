// Testes unitários de queda de tensão com reatância indutiva (Etapa 5 — Tarefa 5.2):
// - Fórmula completa: ΔV = √3 · I · (R · cosφ + X_L · sinφ), com X_L = 0,08 mΩ/m para S >= 35 mm²
// - Comparação entre modelo puramente resistivo e modelo com impedância complexa (35 mm² a 300 mm²)
// - Erro inferior a 1% em relação ao cálculo analítico de engenharia
// - Unificação entre electrical-calc.ts (calcVoltageDrop / voltageDrop_pct) e electrical-sim.ts (voltageDropCircuit)
import { describe, expect, it } from "vitest";
import {
  DEFAULT_REACTANCE_MOHM_PER_M,
  RHO_COPPER_OHM_MM2_PER_M,
  calcVoltageDrop,
  sizeConductorNBR5410,
  voltageDrop_pct,
} from "@/lib/electrical-calc";
import { voltageDropCircuit } from "@/lib/electrical-sim";

describe("NBR 5410 — Queda de tensão com reatância indutiva (35 mm² a 300 mm²)", () => {
  it("mantém modelo puramente resistivo por padrão em bitolas pequenas (< 35 mm²)", () => {
    const r = calcVoltageDrop(25, 60, 10, 380, 0.85);
    expect(r.reactance_ohm).toBe(0);
    expect(r.reactiveDrop_V).toBe(0);
    expect(r.deltaV_V).toBe(r.resistiveDrop_V);
  });

  it("inclui automaticamente X_L = 0,08 mΩ/m para condutores de 35 mm² a 300 mm²", () => {
    const sections = [35, 50, 70, 95, 120, 150, 185, 240, 300] as const;

    for (const s of sections) {
      const withReactance = calcVoltageDrop(200, 150, s, 380, 0.85);
      const resistiveOnly = calcVoltageDrop(200, 150, s, 380, 0.85, { includeReactance: false });

      expect(withReactance.reactance_ohm).toBeCloseTo(0.012, 4); // 0,08 mΩ/m * 150 m = 0,012 Ω
      expect(withReactance.reactiveDrop_V).toBeGreaterThan(0);
      expect(withReactance.deltaV_pct).toBeGreaterThan(resistiveOnly.deltaV_pct);
    }
  });

  it("apresenta erro inferior a 1% frente ao cálculo analítico de engenharia em circuitos de alta potência", () => {
    // Caso de engenharia: Alimentador trifásico 380 V, I = 320 A, L = 180 m, S = 185 mm², cosφ = 0,85
    const I = 320;
    const L = 180;
    const S = 185;
    const U = 380;
    const cosphi = 0.85;
    const sinphi = Math.sqrt(1 - cosphi * cosphi);

    const R = (RHO_COPPER_OHM_MM2_PER_M * L) / S;
    const XL = DEFAULT_REACTANCE_MOHM_PER_M * 1e-3 * L;
    const expectedDeltaV = Math.sqrt(3) * I * (R * cosphi + XL * sinphi);
    const expectedPct = (expectedDeltaV / U) * 100;

    const calc = calcVoltageDrop(I, L, S, U, cosphi);
    const relativeErrorPct = Math.abs((calc.deltaV_pct - expectedPct) / expectedPct) * 100;

    expect(relativeErrorPct).toBeLessThan(1);
    expect(calc.deltaV_V).toBeCloseTo(expectedDeltaV, 1);
    expect(calc.deltaV_pct).toBeCloseTo(expectedPct, 1);
  });

  it("demonstra que ignorar a reatância em cabos >= 150 mm² subestima severamente a queda de tensão", () => {
    // Em 240 mm², R/L = 0,0742 mΩ/m é menor que X_L = 0,08 mΩ/m!
    const full = calcVoltageDrop(400, 200, 240, 380, 0.8);
    const resistiveOnly = calcVoltageDrop(400, 200, 240, 380, 0.8, { includeReactance: false });

    // Parcela reativa representa mais de 40% da queda total nesse cabo
    expect(full.reactiveDrop_V).toBeGreaterThan(resistiveOnly.deltaV_V * 0.6);
    expect(full.deltaV_pct).toBeGreaterThan(resistiveOnly.deltaV_pct * 1.4);
  });

  it("unifica os resultados entre voltageDrop_pct (electrical-calc) e voltageDropCircuit (electrical-sim)", () => {
    const pctDirect = voltageDrop_pct(180, 140, 95, 380, 0.86);
    const simCircuit = voltageDropCircuit("ALIM-CCM1", 180, 140, 95, {
      voltage_V: 380,
      cosphi: 0.86,
      limit_pct: 4,
      installationMethod: "F",
      insulation: "XLPE",
      ambientTemp_C: 35,
      groupedCircuits: 2,
    });

    expect(simCircuit.voltage_drop_pct).toBe(pctDirect);
    expect(simCircuit.reactance_ohm).toBeCloseTo(0.08 * 1e-3 * 140, 4);
    expect(simCircuit.Iz_corrected_A).toBeGreaterThan(180);
    expect(simCircuit.thermal_adequate).toBe(true);
  });

  it("aumenta automaticamente a seção do condutor quando a queda de tensão com reatância excede o limite", () => {
    // 110 A em método C (30 °C, 1 circ.): termicamente 35 mm² bastaria (Iz = 125 A),
    // mas a 220 m de distância em 380 V a queda em 35 mm² supera 5% -> exige seção superior
    const thermalOnly = sizeConductorNBR5410(110, { method: "C" });
    const withLongRun = sizeConductorNBR5410(110, {
      method: "C",
      length_m: 220,
      maxVoltageDrop_pct: 5,
      voltage_V: 380,
      cosphi: 0.86,
    });

    expect(thermalOnly.section_mm2).toBe(35);
    expect(withLongRun.section_mm2).toBeGreaterThan(35);
    expect(withLongRun.voltageDrop_pct).toBeLessThanOrEqual(5);
  });
});
