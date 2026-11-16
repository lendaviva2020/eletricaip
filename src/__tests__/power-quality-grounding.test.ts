import { describe, expect, it } from "vitest";
import { analyzeHarmonics, ieee519TddLimit } from "@/lib/power-quality";
import { checkTTProtection, parallelRodFactor, rodGroundingResistance } from "@/lib/grounding";

describe("Harmônicas (IEEE 519 / C57.110)", () => {
  it("THD, RMS e fator K de espectro típico de retificador 6 pulsos", () => {
    // I1 = 100 A; I5 = 20 %, I7 = 14,3 %, I11 = 9,1 %, I13 = 7,7 % (1/h)
    const r = analyzeHarmonics(100, [
      { order: 5, current_A: 20 },
      { order: 7, current_A: 14.3 },
      { order: 11, current_A: 9.1 },
      { order: 13, current_A: 7.7 },
    ]);
    const sumH2 = 20 ** 2 + 14.3 ** 2 + 9.1 ** 2 + 7.7 ** 2;
    expect(r.thd_pct).toBeCloseTo(Math.sqrt(sumH2), 1); // ≈ 27,6 %
    expect(r.rms_A).toBeCloseTo(Math.sqrt(100 ** 2 + sumH2), 1);
    const rms2 = 100 ** 2 + sumH2;
    const k = (100 ** 2 + 20 ** 2 * 25 + 14.3 ** 2 * 49 + 9.1 ** 2 * 121 + 7.7 ** 2 * 169) / rms2;
    expect(r.kFactor).toBeCloseTo(k, 1);
    expect(r.kFactor).toBeCloseTo(4.66, 2); // 50 060 / 10 746,6
    expect(r.kRatedTransformer).toBe(9); // menor classe padronizada ≥ 4,66
    expect(r.neutralTriplen_A).toBe(0); // sem triplens
  });

  it("carga linear: THD 0 e K = 1", () => {
    const r = analyzeHarmonics(50, []);
    expect(r.thd_pct).toBe(0);
    expect(r.kFactor).toBe(1);
    expect(r.kRatedTransformer).toBe(1);
  });

  it("triplens somam no neutro (3·I3)", () => {
    const r = analyzeHarmonics(10, [{ order: 3, current_A: 4 }]);
    expect(r.neutralTriplen_A).toBe(12);
    expect(r.thirdHarmonic_pct).toBe(40);
  });

  it("TDD usa a corrente de demanda e o limite da Tabela 2", () => {
    const r = analyzeHarmonics(80, [{ order: 5, current_A: 8 }], 100, 30);
    expect(r.tdd_pct).toBe(8);
    expect(r.tddLimit_pct).toBe(8);
    expect(r.tddCompliant).toBe(true);
    expect(ieee519TddLimit(10)).toBe(5);
    expect(ieee519TddLimit(2000)).toBe(20);
  });

  it("rejeita entradas inválidas", () => {
    expect(() => analyzeHarmonics(0, [])).toThrow();
    expect(() => analyzeHarmonics(10, [{ order: 1, current_A: 1 }])).toThrow();
    expect(() => analyzeHarmonics(10, [{ order: 5, current_A: -1 }])).toThrow();
  });
});

describe("Aterramento (Dwight / IEEE 142 / NBR 5410)", () => {
  it('haste 5/8" × 2,4 m em solo de 100 Ω·m ≈ 40,4 Ω (Dwight)', () => {
    const r = rodGroundingResistance({ soilResistivity_ohm_m: 100, rodLength_m: 2.4 });
    expect(r.singleRod_ohm).toBeCloseTo(40.44, 1);
    expect(r.total_ohm).toBeCloseTo(40.44, 1);
  });

  it("4 hastes em paralelo: R1/4 · 1,36", () => {
    const r = rodGroundingResistance({ soilResistivity_ohm_m: 100, rodLength_m: 2.4, rods: 4 });
    expect(r.multiplier).toBe(1.36);
    expect(r.total_ohm).toBeCloseTo((40.44 / 4) * 1.36, 1);
  });

  it("fator de paralelo interpola a tabela", () => {
    expect(parallelRodFactor(6)).toBeCloseTo(1.52, 2);
    expect(parallelRodFactor(1)).toBe(1);
  });

  it("esquema TT com DR 30 mA: RA ≤ 1666,67 Ω", () => {
    const c = checkTTProtection(40, 30);
    expect(c.maxRA_ohm).toBeCloseTo(1666.67, 2);
    expect(c.compliant).toBe(true);
    // Local molhado (UL = 25 V) com DR 300 mA: RA máx = 83,3 Ω
    expect(checkTTProtection(40, 300, 25).compliant).toBe(true);
    expect(checkTTProtection(100, 300, 25).compliant).toBe(false);
  });

  it("rejeita geometria e resistividade inválidas", () => {
    expect(() => rodGroundingResistance({ soilResistivity_ohm_m: 0, rodLength_m: 2.4 })).toThrow();
    expect(() =>
      rodGroundingResistance({ soilResistivity_ohm_m: 100, rodLength_m: 2.4, rods: 30 }),
    ).toThrow();
  });
});
