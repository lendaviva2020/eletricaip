// Testes unitários de conformidade NBR 5410 (Etapa 5 — Tarefa 5.1):
// - Tabelas 36, 37 e 38 de capacidade de condução de corrente (A1, A2, B1, B2, C, D, E, F)
// - Fatores de correção de temperatura (k_t — Tabelas 40 e 41) e agrupamento (k_g — Tabela 42)
// - Coordenação de sobrecarga: I_b <= I_n <= I'_z e I_2 <= 1,45 · I'_z (NBR 5410 §5.3.4.1)
// - Casos de referência de literatura técnica (Mamede Filho / Hélio Creder)
import { describe, expect, it } from "vitest";
import {
  ampacityIz,
  calcMotor,
  correctedAmpacityIz,
  groupingFactorKg,
  pickCable_mm2,
  sizeConductorNBR5410,
  temperatureFactorKt,
  verifyOverloadCoordination,
} from "@/lib/electrical-calc";
import { validateProject } from "@/lib/norm-validator";

describe("NBR 5410 — Tabelas 36, 37 e 38 (capacidade de condução I_z)", () => {
  it("retorna valores exatos da Tabela 36 (PVC 70 °C, 3 condutores carregados) para métodos A1..D", () => {
    expect(ampacityIz(2.5, { method: "A1", insulation: "PVC", loadedConductors: 3 })).toBe(18);
    expect(ampacityIz(2.5, { method: "A2", insulation: "PVC", loadedConductors: 3 })).toBe(17.5);
    expect(ampacityIz(2.5, { method: "B1", insulation: "PVC", loadedConductors: 3 })).toBe(21);
    expect(ampacityIz(2.5, { method: "B2", insulation: "PVC", loadedConductors: 3 })).toBe(20);
    expect(ampacityIz(2.5, { method: "C", insulation: "PVC", loadedConductors: 3 })).toBe(24);
    expect(ampacityIz(2.5, { method: "D", insulation: "PVC", loadedConductors: 3 })).toBe(24);

    expect(ampacityIz(35, { method: "B1", insulation: "PVC", loadedConductors: 3 })).toBe(110);
    expect(ampacityIz(35, { method: "C", insulation: "PVC", loadedConductors: 3 })).toBe(125);
    expect(ampacityIz(35, { method: "D", insulation: "PVC", loadedConductors: 3 })).toBe(98);
  });

  it("retorna valores exatos da Tabela 37 (EPR/XLPE 90 °C, 3 condutores carregados)", () => {
    expect(ampacityIz(10, { method: "B1", insulation: "XLPE", loadedConductors: 3 })).toBe(66);
    expect(ampacityIz(25, { method: "B1", insulation: "EPR", loadedConductors: 3 })).toBe(117);
    expect(ampacityIz(50, { method: "C", insulation: "XLPE", loadedConductors: 3 })).toBe(179);
    expect(ampacityIz(120, { method: "B1", insulation: "XLPE", loadedConductors: 3 })).toBe(312);
  });

  it("retorna valores exatos da Tabela 38 (métodos E e F — leitos e bandejas perfuradas)", () => {
    expect(ampacityIz(35, { method: "E", insulation: "PVC", loadedConductors: 3 })).toBe(126);
    expect(ampacityIz(35, { method: "F", insulation: "PVC", loadedConductors: 3 })).toBe(137);
    expect(ampacityIz(95, { method: "F", insulation: "XLPE", loadedConductors: 3 })).toBe(328);
    expect(ampacityIz(240, { method: "F", insulation: "XLPE", loadedConductors: 3 })).toBe(599);
  });

  it("diferencia circuitos monofásicos/bifásicos (2 condutores carregados) de trifásicos (3 condutores)", () => {
    const iz2 = ampacityIz(16, { method: "B1", insulation: "PVC", loadedConductors: 2 });
    const iz3 = ampacityIz(16, { method: "B1", insulation: "PVC", loadedConductors: 3 });
    expect(iz2).toBe(76);
    expect(iz3).toBe(68);
    expect(iz2).toBeGreaterThan(iz3);
  });
});

describe("NBR 5410 — Fatores de correção k_t (Tabelas 40/41) e k_g (Tabela 42)", () => {
  it("aplica fator de temperatura k_t no ar (Tabela 40, ref. 30 °C)", () => {
    expect(temperatureFactorKt(30, "PVC", "B1")).toBe(1.0);
    expect(temperatureFactorKt(35, "PVC", "B1")).toBe(0.94);
    expect(temperatureFactorKt(40, "PVC", "B1")).toBe(0.87);
    expect(temperatureFactorKt(45, "PVC", "B1")).toBe(0.79);
    expect(temperatureFactorKt(50, "PVC", "B1")).toBe(0.71);

    expect(temperatureFactorKt(40, "XLPE", "B1")).toBe(0.91);
    expect(temperatureFactorKt(50, "EPR", "F")).toBe(0.82);
  });

  it("aplica fator de temperatura k_t no solo para método D (Tabela 41, ref. 20 °C)", () => {
    expect(temperatureFactorKt(20, "PVC", "D")).toBe(1.0);
    expect(temperatureFactorKt(30, "PVC", "D")).toBe(0.89);
    expect(temperatureFactorKt(40, "PVC", "D")).toBe(0.77);
    expect(temperatureFactorKt(30, "XLPE", "D")).toBe(0.93);
  });

  it("aplica fator de agrupamento k_g (Tabela 42)", () => {
    expect(groupingFactorKg(1)).toBe(1.0);
    expect(groupingFactorKg(2)).toBe(0.8);
    expect(groupingFactorKg(3)).toBe(0.7);
    expect(groupingFactorKg(4)).toBe(0.65);
    expect(groupingFactorKg(5)).toBe(0.6);
    expect(groupingFactorKg(6)).toBe(0.57);
    expect(groupingFactorKg(9)).toBe(0.5);
    expect(groupingFactorKg(12)).toBe(0.45);
    expect(groupingFactorKg(16)).toBe(0.41);
    expect(groupingFactorKg(20)).toBe(0.38);
  });
});

describe("NBR 5410 — Dimensionamento e casos de referência (Mamede / Creder)", () => {
  it("Caso Mamede 1: circuito trifásico 45 A em eletroduto aparente (B1), PVC, 35 °C, 3 circuitos agrupados", () => {
    // I_b = 45 A; k_t(35°C, PVC) = 0,94; k_g(3 circ.) = 0,70 -> k_t * k_g = 0,658
    // I_z necessário = 45 / 0,658 = 68,39 A
    // Tabela 36 (B1, 3 cond.): 16 mm² = 68 A (< 68,39 A) -> adota 25 mm² (89 A, I'_z = 58,56 A)
    const res = sizeConductorNBR5410(45, {
      method: "B1",
      insulation: "PVC",
      loadedConductors: 3,
      ambientTemp_C: 35,
      groupedCircuits: 3,
      breaker_A: 50,
    });

    expect(res.kt).toBe(0.94);
    expect(res.kg).toBe(0.7);
    expect(res.section_mm2).toBe(25);
    expect(res.Iz_table_A).toBe(89);
    expect(res.Iz_corrected_A).toBeCloseTo(58.56, 2);
    expect(res.coordination.coordinated).toBe(true);
  });

  it("Caso Creder 2: alimentador trifásico 120 A em leito (F), XLPE 90 °C, 40 °C, 4 circuitos agrupados", () => {
    // I_b = 120 A, disjuntor I_n = 125 A; k_t(40°C, XLPE) = 0,91; k_g(4 circ.) = 0,65 -> produto = 0,5915
    // Para atender I'_z >= 125 A: I_z_tab >= 125 / 0,5915 = 211,33 A
    // Tabela 38 (F, XLPE, 3 cond.): 50 mm² = 209 A (< 211,33 A) -> seleciona 70 mm² (269 A, I'_z = 159,11 A)
    const res = sizeConductorNBR5410(120, {
      method: "F",
      insulation: "XLPE",
      loadedConductors: 3,
      ambientTemp_C: 40,
      groupedCircuits: 4,
      breaker_A: 125,
    });

    expect(res.kt).toBe(0.91);
    expect(res.kg).toBe(0.65);
    expect(res.section_mm2).toBe(70);
    expect(res.Iz_table_A).toBe(269);
    expect(res.Iz_corrected_A).toBeCloseTo(159.11, 2);
    expect(res.coordination.coordinated).toBe(true);
  });

  it("varia a seção escolhida conforme método de instalação e agrupamento", () => {
    // Mesma corrente de projeto (60 A), mas condições de instalação progressivamente mais severas
    const sMetodoF = pickCable_mm2(60, {
      method: "F",
      insulation: "XLPE",
      ambientTemp_C: 30,
      groupedCircuits: 1,
    });
    const sMetodoB1 = pickCable_mm2(60, {
      method: "B1",
      insulation: "PVC",
      ambientTemp_C: 30,
      groupedCircuits: 1,
    });
    const sMetodoA1Agrupado = pickCable_mm2(60, {
      method: "A1",
      insulation: "PVC",
      ambientTemp_C: 45,
      groupedCircuits: 6,
    });

    expect(sMetodoF).toBe(10); // XLPE F: 10 mm² -> 80 A >= 60 A
    expect(sMetodoB1).toBe(16); // PVC B1: 16 mm² -> 68 A >= 60 A
    expect(sMetodoA1Agrupado).toBe(70); // PVC A1 45°C (0,79) x 6 circ (0,57) = 0,4503 -> 70 mm² (136 * 0,4503 = 61,24 A)
    expect(sMetodoF).toBeLessThan(sMetodoB1);
    expect(sMetodoB1).toBeLessThan(sMetodoA1Agrupado);
  });

  it("verifica rigorosamente a coordenação de sobrecarga I_b <= I_n <= I'_z (NBR 5410 §5.3.4.1)", () => {
    // Caso coordenado: Ib = 38 A, In = 40 A, I'z = 44 A
    const ok = verifyOverloadCoordination(38, 40, 44);
    expect(ok.coordinated).toBe(true);
    expect(ok.condition1_Ib_le_In_le_Iz).toBe(true);
    expect(ok.condition2_I2_le_145Iz).toBe(true);

    // Caso violado: Ib = 38 A, In = 50 A, I'z = 44 A (disjuntor maior que a capacidade corrigida do cabo)
    const badBreaker = verifyOverloadCoordination(38, 50, 44);
    expect(badBreaker.coordinated).toBe(false);
    expect(badBreaker.condition1_Ib_le_In_le_Iz).toBe(false);

    // Caso violado: Ib = 42 A > In = 40 A
    const badLoad = verifyOverloadCoordination(42, 40, 44);
    expect(badLoad.coordinated).toBe(false);
  });

  it("integra o dimensionamento NBR 5410 em calcMotor e validateProject", () => {
    // Motor 15 kW / 380 V (In ≈ 28,8 A) em método B2, 40 °C, 4 circuitos agrupados
    const motor = calcMotor({
      id: "M-15KW",
      power_kW: 15,
      voltage_V: 380,
      installationMethod: "B2",
      ambientTemp_C: 40,
      groupedCircuits: 4,
    });
    expect(motor.cable_mm2).toBe(25);
    expect(motor.overloadCoordinated).toBe(true);

    // Se o projeto declarar cabo de 10 mm² nessas condições, validateProject aponta erro NBR 5410
    const findings = validateProject(
      [
        {
          id: "M-15KW",
          kind: "motor",
          category: "mech",
          label: "Motor Moinho",
          position: { x: 0, y: 0 },
          params: {
            power_kW: 15,
            voltage_V: 380,
            installationMethod: "B2",
            ambientTemp_C: 40,
            groupedCircuits: 4,
            cable_mm2: 10,
            breaker_A: 40,
          },
        },
      ],
      [],
    );
    const cableError = findings.find((f) => f.id === "cable-M-15KW");
    expect(cableError).toBeDefined();
    expect(cableError?.norm).toBe("NBR 5410");
    expect(cableError?.severity).toBe("error");
    expect(
      correctedAmpacityIz(10, { method: "B2", ambientTemp_C: 40, groupedCircuits: 4 }),
    ).toBeLessThan(motor.In_A);
  });
});
