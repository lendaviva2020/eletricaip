// Auditoria Fase 2 / F2.1 — suíte de referência INDEPENDENTE do motor de cálculos.
// Valores esperados calculados manualmente (fórmulas explícitas nos testes) ou
// tomados de IEC 60364-5-52 (Tabelas B.52.2–B.52.5, cobre), que a ABNT NBR
// 5410:2004 (Tabelas 36/37) reproduz para os métodos A1–C. A conferência final
// deve ser feita contra a tabela oficial licenciada da NBR 5410.
import { describe, it, expect } from "vitest";
import {
  NBR5410_SECTIONS,
  ampacityIz,
  calcDemand,
  calcVoltageDrop,
  copperResistivityAt,
  motorNominalCurrent,
  nbr5410VoltageDropLimits,
  sizeConductorNBR5410,
  temperatureFactorKt,
  verifyThermalWithstandI2t,
  type InstallationMethod,
  type InsulationType,
} from "../electrical-calc";

const S = NBR5410_SECTIONS;

/** Referências (A) por seção 1,5…300 mm². PVC = 70 °C; XLPE = 90 °C. */
const REF: Record<string, number[]> = {
  "PVC-2-A1": [14.5, 19.5, 26, 34, 46, 61, 80, 99, 119, 151, 182, 210, 240, 273, 321, 367],
  "PVC-2-A2": [14, 18.5, 25, 32, 43, 57, 75, 92, 110, 139, 167, 192, 219, 248, 291, 334],
  "PVC-2-B1": [17.5, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 309, 353, 415, 477],
  "PVC-2-B2": [16.5, 23, 30, 38, 52, 69, 90, 111, 133, 168, 201, 232, 265, 300, 351, 401],
  "PVC-2-C": [19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299, 344, 392, 461, 530],
  "PVC-3-A1": [13.5, 18, 24, 31, 42, 56, 73, 89, 108, 136, 164, 188, 216, 245, 286, 328],
  "PVC-3-A2": [13, 17.5, 23, 29, 39, 52, 68, 83, 99, 125, 150, 172, 196, 223, 261, 298],
  "PVC-3-B1": [15.5, 21, 28, 36, 50, 68, 89, 110, 134, 171, 207, 239, 275, 314, 370, 426],
  "PVC-3-B2": [15, 20, 27, 34, 46, 62, 80, 99, 118, 149, 179, 206, 236, 268, 313, 358],
  "PVC-3-C": [17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259, 299, 341, 403, 464],
  "XLPE-2-A1": [19, 26, 35, 45, 61, 81, 106, 131, 158, 200, 241, 278, 318, 362, 424, 486],
  "XLPE-2-A2": [18.5, 25, 33, 42, 57, 76, 99, 121, 145, 183, 220, 253, 290, 329, 386, 442],
  "XLPE-2-B1": [23, 31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, 407, 464, 546, 628],
  "XLPE-2-B2": [22, 30, 40, 51, 69, 91, 119, 146, 175, 221, 265, 305, 349, 395, 462, 529],
  "XLPE-2-C": [24, 33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382, 441, 506, 599, 693],
  "XLPE-3-A1": [17, 23, 31, 40, 54, 73, 95, 117, 141, 179, 216, 249, 285, 324, 380, 435],
  "XLPE-3-A2": [16.5, 22, 30, 38, 51, 68, 89, 109, 130, 164, 197, 227, 259, 295, 346, 396],
  "XLPE-3-B1": [20, 28, 37, 48, 66, 88, 117, 144, 175, 222, 269, 312, 358, 408, 481, 553],
  "XLPE-3-B2": [19.5, 26, 35, 44, 60, 80, 105, 128, 154, 194, 233, 268, 307, 348, 407, 465],
  "XLPE-3-C": [22, 30, 40, 51, 70, 94, 119, 148, 180, 232, 282, 328, 379, 434, 514, 593],
};

const close = (a: number, b: number, tol: number) =>
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("F2.1 — corrente nominal de motor", () => {
  it("I = P / (√3 · U · cosφ · η) — 15 kW, 380 V, 0,85, 0,90", () => {
    const ref = 15000 / (Math.sqrt(3) * 380 * 0.85 * 0.9); // 29,79 A
    close(
      motorNominalCurrent({ id: "m", power_kW: 15, voltage_V: 380, cosphi: 0.85, efficiency: 0.9 }),
      ref,
      0.01,
    );
  });

  it("entradas inválidas lançam RangeError (sem NaN/Infinity silenciosos)", () => {
    expect(() => motorNominalCurrent({ id: "x", power_kW: Number.NaN })).toThrow(RangeError);
    expect(() => motorNominalCurrent({ id: "x", power_kW: 10, voltage_V: 0 })).toThrow(RangeError);
    expect(() => motorNominalCurrent({ id: "x", power_kW: -5 })).toThrow(RangeError);
    expect(() => motorNominalCurrent({ id: "x", power_kW: 10, cosphi: 1.2 })).toThrow(RangeError);
  });
});

describe("F2.1/F2.2 — capacidade de condução Iz (tabelas)", () => {
  for (const [key, ref] of Object.entries(REF)) {
    const [ins, n, method] = key.split("-") as [string, string, InstallationMethod];
    const insulation = (ins === "PVC" ? "PVC" : "XLPE") as InsulationType;
    const loadedConductors = Number(n) as 2 | 3;
    it(`${key}: nunca acima da referência`, () => {
      S.forEach((s, i) => {
        expect(ampacityIz(s, { method, insulation, loadedConductors })).toBeLessThanOrEqual(ref[i]);
      });
    });
  }

  it("PVC método C, 3 carregados (método padrão do sistema) = referência exata", () => {
    S.forEach((s, i) => expect(ampacityIz(s, { method: "C" })).toBe(REF["PVC-3-C"][i]));
  });

  it("propriedades: 2 carregados ≥ 3 carregados; XLPE ≥ PVC; Iz crescente com a seção", () => {
    for (const method of ["A1", "A2", "B1", "B2", "C", "D", "E", "F"] as InstallationMethod[]) {
      let prev = 0;
      for (const s of S) {
        const pvc3 = ampacityIz(s, { method, insulation: "PVC", loadedConductors: 3 });
        const pvc2 = ampacityIz(s, { method, insulation: "PVC", loadedConductors: 2 });
        const xl3 = ampacityIz(s, { method, insulation: "XLPE", loadedConductors: 3 });
        expect(pvc2).toBeGreaterThanOrEqual(pvc3);
        expect(xl3).toBeGreaterThanOrEqual(pvc3);
        expect(pvc3).toBeGreaterThan(prev);
        prev = pvc3;
      }
    }
  });

  it("seção não comercial usa a seção tabelada IMEDIATAMENTE INFERIOR (conservador)", () => {
    expect(ampacityIz(20)).toBe(ampacityIz(16));
    expect(ampacityIz(1)).toBe(0);
  });

  it("alumínio não é tabelado: lança em vez de usar a tabela de cobre", () => {
    expect(() => ampacityIz(16, { material: "aluminum" })).toThrow(RangeError);
  });
});

describe("F2.3 — queda de tensão", () => {
  it("resistividade do cobre a 70 °C ≈ 0,02063 Ω·mm²/m (ρ20 = 0,017241; α = 0,00393)", () => {
    close(copperResistivityAt(70), 0.017241 * (1 + 0.00393 * 50), 1e-6);
  });

  it("trifásico 50 A / 100 m / 16 mm² / 380 V / cosφ 0,85, PVC (70 °C) ≈ 2,50 %", () => {
    const R = (0.017241 * 1.1965 * 100) / 16;
    const ref = ((Math.sqrt(3) * 50 * R * 0.85) / 380) * 100; // 2,50 %
    close(calcVoltageDrop(50, 100, 16, 380, 0.85).deltaV_pct, ref, 0.02);
  });

  it("monofásico sem tensão informada usa 220 V (não 380 V)", () => {
    const R = (0.017241 * 1.1965 * 30) / 2.5;
    const ref = ((2 * 16 * R * 0.95) / 220) * 100; // 3,42 %
    close(calcVoltageDrop(16, 30, 2.5, undefined, 0.95, { phases: 1 }).deltaV_pct, ref, 0.02);
  });

  it("seção ≤ 0 ou comprimento negativo lançam RangeError", () => {
    expect(() => calcVoltageDrop(10, 10, 0)).toThrow(RangeError);
    expect(() => calcVoltageDrop(10, -1, 10)).toThrow(RangeError);
  });

  it("limites NBR 5410 §6.2.7 estruturados por origem e circuito terminal", () => {
    expect(nbr5410VoltageDropLimits("OWN_TRANSFORMER")).toEqual({
      fromOriginMaxPct: 7,
      terminalCircuitMaxPct: 4,
    });
    expect(nbr5410VoltageDropLimits("LV_UTILITY")).toEqual({
      fromOriginMaxPct: 5,
      terminalCircuitMaxPct: 4,
    });
  });
});

describe("F2.5 — estados de erro explícitos", () => {
  it("nenhuma seção atende → status NO_SECTION_SATISFIES (não '300 mm²' silencioso)", () => {
    const r = sizeConductorNBR5410(900);
    expect(r.status).toBe("NO_SECTION_SATISFIES");
  });

  it("caso normal → status OK", () => {
    expect(sizeConductorNBR5410(20).status).toBe("OK");
  });

  it("temperatura ambiente acima da tabela → k_t = 0 (não aplicável), não 0,5", () => {
    expect(temperatureFactorKt(65, "PVC", "C")).toBe(0);
    expect(sizeConductorNBR5410(20, { ambientTemp_C: 65 }).status).toBe("NO_SECTION_SATISFIES");
  });

  it("t > 5 s fora do regime adiabático: inadequado e sinalizado (não truncado para 5 s)", () => {
    const r = verifyThermalWithstandI2t({
      section_mm2: 10,
      faultCurrent_A: 400,
      clearingTime_s: 10,
    });
    expect(r.adiabaticValid).toBe(false);
    expect(r.adequate).toBe(false);
    expect(r.clearingTime_s).toBe(10);
  });

  it("t ≤ 5 s: I²t ≤ k²S² (k = 115, Cu/PVC)", () => {
    const r = verifyThermalWithstandI2t({
      section_mm2: 10,
      faultCurrent_A: 1000,
      clearingTime_s: 0.5,
    });
    expect(r.adequate).toBe(1000 * 1000 * 0.5 <= 115 * 115 * 100);
    expect(r.adiabaticValid).toBe(true);
  });
});

describe("F2.6 — demanda com rendimento", () => {
  it("100 kW mecânicos, η 0,92, div 0,85, cosφ 0,88 → S ≈ 105,0 kVA", () => {
    const ref = ((100 / 0.92) * 0.85) / 0.88;
    close(calcDemand([{ id: "a", power_kW: 100 }]).apparent_kVA, ref, 0.1);
  });
});
