import { describe, expect, it } from "vitest";
import { peakFactorK, shortCircuitIEC60909 } from "@/lib/electrical-sim";
import { calcDemand, motorNominalCurrent } from "@/lib/electrical-calc";
import { computeCircuitEnergization, isPowerSourceNode } from "@/lib/diagram/electrical-simulation";
import type { DiagramDoc, DiagramNode } from "@/lib/diagram/schema";
import { createPlant, defaultPlantInputs, stepPlant } from "@/lib/simulation/plant-engine";
import { mapPlantTagsToProjectTags } from "@/lib/simulation/plant-definition";

describe("IEC 60909 — corrente de pico", () => {
  it("ip = κ·√2·I''k (não √3)", () => {
    const r = shortCircuitIEC60909({
      power_kVA: 500,
      secondary_V: 380,
      impedance_pct: 5,
      vector_group: "Dyn11",
      x_r_ratio: 3.5,
    });
    const expected = peakFactorK(3.5) * Math.SQRT2 * r.Ik3ph_kA;
    expect(r.ip_kA).toBeCloseTo(expected, 1);
    expect(r.ip_kA).toBeLessThan(2 * Math.SQRT2 * r.Ik3ph_kA + 0.01); // κ ≤ 2
  });
});

describe("Demanda — potência de eixo vs elétrica", () => {
  it("considera rendimento η (P_el = P_eixo/η)", () => {
    const d = calcDemand([{ id: "M", power_kW: 92 }], { diversity: 1, cosphi: 1 });
    expect(d.totalLoad_kW).toBe(92);
    expect(d.apparent_kVA).toBeCloseTo(100, 0); // 92/0,92 = 100 kVA com cosφ=1
  });

  it("corrente nominal com entrada inválida não gera Infinity/NaN", () => {
    expect(motorNominalCurrent({ id: "x", power_kW: 0 })).toBe(0);
    expect(Number.isFinite(motorNominalCurrent({ id: "x", power_kW: 5, voltage_V: 0 }))).toBe(true);
    expect(Number.isFinite(motorNominalCurrent({ id: "x", power_kW: 5, cosphi: 0 }))).toBe(true);
  });
});

function node(id: string, params: DiagramNode["params"], label = ""): DiagramNode {
  return { id, sheet: "unifilar", position: { x: 0, y: 0 }, rotation: 0, label, params };
}

describe("Energização do unifilar", () => {
  const doc: DiagramDoc = {
    version: 1,
    id: "d",
    metadata: { title: "t", norms: [] },
    sheets: ["unifilar"],
    nodes: {
      tr: node("tr", {
        kind: "transformer",
        kVA: 150,
        primary_V: 13800,
        secondary_V: 380,
        vector: "Dyn11",
      }),
      q1: node("q1", { kind: "breaker", in_A: 16, curve: "C", poles: 3 }),
      m1: node("m1", { kind: "motor", power_kW: 5.5, voltage_V: 380, startMethod: "DOL" }),
      plc: node("plc", { kind: "plc", cpu: "x", io_count: 16 }),
    },
    edges: {
      e1: { id: "e1", sheet: "unifilar", source: "tr", target: "q1", kind: "power" },
      e2: { id: "e2", sheet: "unifilar", source: "q1", target: "m1", kind: "power" },
      // Fio de comando CLP→motor NÃO pode contornar o disjuntor aberto.
      e3: { id: "e3", sheet: "unifilar", source: "tr", target: "plc", kind: "power" },
      e4: { id: "e4", sheet: "unifilar", source: "plc", target: "m1", kind: "signal" },
    },
  };

  it("disjuntor aberto desenergiza o motor mesmo com ligação de sinal paralela", () => {
    const en = computeCircuitEnergization(doc, "running", { q1: false });
    expect(en.energizedNodeIds.has("m1")).toBe(false);
    expect(en.energizedEdgeIds.has("e4")).toBe(false);
  });

  it("rótulo 'Alimentador' / tag 'TR-201' de carga não vira fonte", () => {
    expect(
      isPowerSourceNode(
        node(
          "x",
          { kind: "motor", power_kW: 1, voltage_V: 380, startMethod: "DOL", tag: "TR-201" },
          "Alimentador M1",
        ),
      ),
    ).toBe(false);
    expect(
      isPowerSourceNode(
        node("q0", { kind: "breaker", in_A: 400, curve: "C", poles: 3, tag: "Q0" }),
      ),
    ).toBe(true);
  });
});

describe("Planta 8M+2EX", () => {
  it("falha de motor rearma via RESET quando a causa é removida", () => {
    let plant = createPlant();
    const inputs = { ...defaultPlantInputs(), start: true, faultInject: { M01: "short" as const } };
    plant = stepPlant(plant, inputs, 0.1);
    plant = stepPlant(plant, { ...inputs, start: false }, 0.1);
    expect(plant.motors.M01.fault?.code).toBe("CURTO");
    plant = stepPlant(plant, { ...defaultPlantInputs(), reset: true }, 0.1);
    expect(plant.motors.M01.fault).toBeNull();
  });

  it("planta com specs customizadas simula os motores declarados", () => {
    let plant = createPlant([{ id: "MX", name: "X", power_kW: 2.2 }]);
    plant = stepPlant(plant, { ...defaultPlantInputs(), start: true }, 0.5);
    plant = stepPlant(plant, defaultPlantInputs(), 0.5);
    expect(Object.keys(plant.motors)).toEqual(["MX"]);
    expect(plant.motors.MX.running).toBe(true);
  });

  it("aliases copiam valores falsos (motor parado não fica 'RUN=true' obsoleto)", () => {
    const mapped = mapPlantTagsToProjectTags({ M01_RUN: false, EX01_RUN: false });
    expect(mapped.M01_RUN).toBe(false);
    expect(mapped.EX01_RUN).toBe(false);
  });
});
