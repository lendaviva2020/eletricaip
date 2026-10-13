// Testes do motor de simulação elétrica de potência (puro/determinístico).
// Cobre IEC 60909 (curto-circuito), IEC 60947 (seletividade/ruptura),
// IEEE 1584 (arco elétrico), esforço térmico de partida e queda de tensão.
import { describe, expect, it } from "vitest";
import {
  arcFlashIEEE1584,
  breakingCapacity,
  checkBreakingCapacity,
  defaultInstantaneous,
  motorStartThermal,
  peakFactorK,
  ppeFromEnergy,
  selectivityIEC60947,
  shortCircuitIEC60909,
  typicalXR,
  voltageDropCircuit,
  voltageFactorC,
  zeroSequenceRatio,
  type ProtectionDevice,
} from "@/lib/electrical-sim";

const TRAFO_BT = { power_kVA: 750, secondary_V: 380, impedance_pct: 4.5, vector_group: "Dyn11" };

describe("fatores normativos IEC 60909", () => {
  it("usa c = 1,10 em BT e c = 1,05 em MT", () => {
    expect(voltageFactorC(380)).toBe(1.1);
    expect(voltageFactorC(1000)).toBe(1.1);
    expect(voltageFactorC(13800)).toBe(1.05);
    expect(voltageFactorC(69000)).toBe(1.05);
  });

  it("escolhe X/R típico pela faixa de potência", () => {
    expect(typicalXR(100)).toBe(3.5);
    expect(typicalXR(630)).toBe(3.5);
    expect(typicalXR(750)).toBe(6.5);
    expect(typicalXR(2500)).toBe(6.5);
    expect(typicalXR(3000)).toBe(10);
  });

  it("deriva o fator de pico k de forma monótona crescente com X/R", () => {
    expect(peakFactorK(1)).toBeLessThan(peakFactorK(5));
    expect(peakFactorK(5)).toBeLessThan(peakFactorK(10));
    // k tende a 2,0 quando X/R → ∞ (IEC 60909-0 eq. 25).
    expect(peakFactorK(1000)).toBeCloseTo(2, 2);
    // Guarda contra X/R ≤ 0 (não vira Infinity).
    expect(Number.isFinite(peakFactorK(0))).toBe(true);
  });

  it("usa k0 conservador por grupo vetorial", () => {
    expect(zeroSequenceRatio("Dyn11")).toBe(1.0);
    expect(zeroSequenceRatio("Yyn0")).toBe(4.0);
    expect(zeroSequenceRatio("Yn11")).toBe(1.5);
    // Grupo ausente assume Dyn11; grupo não reconhecido cai no fallback.
    expect(zeroSequenceRatio(undefined)).toBe(1.0);
    expect(zeroSequenceRatio("Zy")).toBe(1.2);
  });
});

describe("shortCircuitIEC60909", () => {
  it("calcula a corrente de curto coerente com a impedância do trafo", () => {
    const r = shortCircuitIEC60909(TRAFO_BT);

    // Ztr = (4,5/100)·380²/750kVA → 0,008664 Ω (Sn convertido para VA)
    expect(r.Z_transformer_ohm).toBeCloseTo(0.0087, 3);
    // Ik3 = 1,1·380/(√3·0,008664) ≈ 27,85 kA — valor de catálogo para
    // 750 kVA / 4,5% / 380 V.
    expect(r.Ik3ph_kA).toBeCloseTo(27.85, 1);
    // Pico da primeira meia-onda: k·√3·Ik, com k ≈ 1,64 para X/R = 6,5.
    expect(r.ip_kA).toBeGreaterThan(r.Ik3ph_kA * 2);
    expect(r.ip_kA).toBeLessThan(r.Ik3ph_kA * 4);
    expect(r.c_factor).toBe(1.1);
    expect(r.k0_ratio).toBe(1.0);
    expect(r.U_nom_V).toBe(380);
  });

  it("monofásico segue o k0 do grupo vetorial e IT o reduz pela metade", () => {
    // Dyn11 tem k0 = 1 → Ik1 = Ik3 exatamente (3/(2+1)).
    const dyn = shortCircuitIEC60909(TRAFO_BT, { earthing: "TN-S" });
    expect(dyn.Ik1ph_kA).toBeCloseTo(dyn.Ik3ph_kA, 2);

    // Yyn0 tem k0 = 4 → Ik1 = Ik3/2.
    const yyn = shortCircuitIEC60909({ ...TRAFO_BT, vector_group: "Yyn0" });
    expect(yyn.Ik1ph_kA).toBeCloseTo(yyn.Ik3ph_kA / 2, 1);
    expect(yyn.Ik1ph_kA).toBeLessThan(dyn.Ik1ph_kA);

    // IT aterrado por impedância corta a monofásica pela metade.
    const it = shortCircuitIEC60909(TRAFO_BT, { earthing: "IT" });
    expect(it.Ik1ph_kA).toBeCloseTo(dyn.Ik1ph_kA / 2, 2);
  });

  it("é determinístico (mesma entrada → mesmo resultado)", () => {
    expect(shortCircuitIEC60909(TRAFO_BT)).toEqual(shortCircuitIEC60909(TRAFO_BT));
  });

  it("rejeita trafo com potência ou impedância inválida", () => {
    expect(() => shortCircuitIEC60909({ ...TRAFO_BT, power_kVA: 0 })).toThrow(
      "transformer_power_must_be_positive",
    );
    expect(() => shortCircuitIEC60909({ ...TRAFO_BT, impedance_pct: 0 })).toThrow(
      "transformer_impedance_out_of_range",
    );
    expect(() => shortCircuitIEC60909({ ...TRAFO_BT, impedance_pct: 40 })).toThrow(
      "transformer_impedance_out_of_range",
    );
  });
});

describe("ruptura de aparelhos (IEC 60947)", () => {
  it("assume 25 kA quando a capacidade não é informada", () => {
    expect(breakingCapacity({ id: "Q1", type: "MCB", rating_A: 40 })).toBe(25);
    expect(breakingCapacity({ id: "Q1", type: "ACB", rating_A: 630, breaking_kA: 50 })).toBe(50);
  });

  it("marca como inadequado quando a ruptura é menor que a corrente disponível", () => {
    const devices: ProtectionDevice[] = [
      { id: "Q1", type: "MCB", rating_A: 40, breaking_kA: 10 },
      { id: "Q2", type: "MCCB", rating_A: 250, breaking_kA: 36 },
    ];
    const checks = checkBreakingCapacity(devices, 20);
    expect(checks).toHaveLength(2);

    const q1 = checks.find((c) => c.deviceId === "Q1");
    const q2 = checks.find((c) => c.deviceId === "Q2");
    expect(q1?.adequate).toBe(false);
    expect(q1?.margin).toBe(-10);
    expect(q2?.adequate).toBe(true);
    expect(q2?.margin).toBe(16);
  });
});

describe("defaultInstantaneous", () => {
  it("aplica os multiplicadores de curva MCB", () => {
    expect(defaultInstantaneous({ id: "a", type: "MCB", rating_A: 16, curve: "B" })).toBe(48);
    expect(defaultInstantaneous({ id: "a", type: "MCB", rating_A: 16, curve: "C" })).toBe(80);
    expect(defaultInstantaneous({ id: "a", type: "MCB", rating_A: 16, curve: "D" })).toBe(160);
    expect(defaultInstantaneous({ id: "a", type: "MCB", rating_A: 16, curve: "K" })).toBe(128);
  });

  it("usa 8×In para MCCB/ACB/fusível e respeita valor explícito", () => {
    expect(defaultInstantaneous({ id: "a", type: "MCCB", rating_A: 100 })).toBe(800);
    expect(
      defaultInstantaneous({ id: "a", type: "MCCB", rating_A: 100, instantaneous_A: 1500 }),
    ).toBe(1500);
  });
});

describe("selectivityIEC60947", () => {
  const upstream: ProtectionDevice = {
    id: "Q1",
    type: "MCCB",
    rating_A: 250,
    instantaneous_A: 2000,
    thermal_delay_s: 30,
  };

  it("não seletiva quando a razão magnética é insuficiente", () => {
    const downstream: ProtectionDevice = {
      id: "Q2",
      type: "MCB",
      rating_A: 200,
      curve: "D",
      instantaneous_A: 2000,
      thermal_delay_s: 8,
    };
    const r = selectivityIEC60947(upstream, downstream, 5000);
    expect(r.mode).toBe("none");
    expect(r.selective).toBe(false);
    expect(r.maxDiscriminatingCurrent_A).toBe(0);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("seletiva total quando montante é bem mais robusto e defeito é moderado", () => {
    const downstream: ProtectionDevice = {
      id: "Q2",
      type: "MCB",
      rating_A: 40,
      curve: "C",
      instantaneous_A: 200,
      thermal_delay_s: 8,
    };
    const r = selectivityIEC60947(upstream, downstream, 1000);
    expect(r.mode).toBe("total");
    expect(r.selective).toBe(true);
    expect(r.upstreamId).toBe("Q1");
    expect(r.downstreamId).toBe("Q2");
  });

  it("marca 'partial' quando a classificação é suficiente mas o tempo não", () => {
    // Montante cobre 2× a classificação do jusante (ratingOk), mas o atraso
    // térmico (15 s vs 8 s) não chega à razão mínima 3:1 → parcial.
    const upstreamSlow: ProtectionDevice = {
      ...upstream,
      thermal_delay_s: 15,
    };
    const downstream: ProtectionDevice = {
      id: "Q2",
      type: "MCB",
      rating_A: 40,
      curve: "C",
      instantaneous_A: 200,
      thermal_delay_s: 8,
    };
    const r = selectivityIEC60947(upstreamSlow, downstream, 300);
    expect(r.mode).toBe("partial");
    expect(r.selective).toBe(true);
    expect(r.maxDiscriminatingCurrent_A).toBeGreaterThan(0);
  });
});

describe("arcFlashIEEE1584", () => {
  it("energia cresce com a corrente e com o tempo de corte", () => {
    const base = arcFlashIEEE1584(10);
    expect(arcFlashIEEE1584(20).incidentEnergy_cal_cm2).toBeGreaterThan(
      base.incidentEnergy_cal_cm2,
    );
    expect(arcFlashIEEE1584(10, { clearingTime_s: 1 }).incidentEnergy_cal_cm2).toBeGreaterThan(
      base.incidentEnergy_cal_cm2,
    );
  });

  it("usa 455 mm e 0,1 s como padrão IEEE 1584", () => {
    const r = arcFlashIEEE1584(10);
    expect(r.workingDistance_mm).toBe(455);
    expect(r.clearingTime_s).toBe(0.1);
  });

  it("energia baixa resulta em PPE 0 e limite de arco maior que a distância de trabalho", () => {
    const r = arcFlashIEEE1584(2, { clearingTime_s: 0.02, workingDistance_mm: 455 });
    expect(r.ppe_category).toBe(0);
    expect(r.arc_boundary_mm).toBeGreaterThan(455);
  });

  it("não explode com corrente zero (clamp em 0,1 kA)", () => {
    const r = arcFlashIEEE1584(0);
    expect(Number.isFinite(r.incidentEnergy_cal_cm2)).toBe(true);
    expect(r.incidentEnergy_cal_cm2).toBeGreaterThan(0);
  });
});

describe("ppeFromEnergy (NFPA 70E)", () => {
  it("aplica os limiares de categoria", () => {
    expect(ppeFromEnergy(0)).toBe(0);
    expect(ppeFromEnergy(1.19)).toBe(0);
    expect(ppeFromEnergy(1.2)).toBe(1);
    expect(ppeFromEnergy(3.9)).toBe(1);
    expect(ppeFromEnergy(4)).toBe(2);
    expect(ppeFromEnergy(7.9)).toBe(2);
    expect(ppeFromEnergy(8)).toBe(3);
    expect(ppeFromEnergy(24.9)).toBe(3);
    expect(ppeFromEnergy(25)).toBe(4);
    expect(ppeFromEnergy(40)).toBe(4);
  });
});

describe("motorStartThermal", () => {
  it("computa I²t e elevação proporcionais à duração e à razão de corrente", () => {
    const short = motorStartThermal("M01", 11.6, 81, 3);
    const long = motorStartThermal("M01", 11.6, 81, 10);

    expect(short.i2t_A2s).toBe(81 * 81 * 3);
    expect(long.i2t_A2s).toBe(81 * 81 * 10);
    expect(long.estimatedRise_C).toBeGreaterThan(short.estimatedRise_C);
    expect(short.currentRatio).toBeCloseTo(6.98, 1);
  });

  it("classifica o risco de disparo normalizando pela constante térmica", () => {
    // ΔT = 6,98² · (t/120) · 60 = 24,4·t → 2 s LOW, 3 s MEDIUM, 5 s HIGH.
    expect(motorStartThermal("M01", 11.6, 81, 2).tripRisk).toBe("LOW");
    expect(motorStartThermal("M01", 11.6, 81, 3).tripRisk).toBe("MEDIUM");
    expect(motorStartThermal("M01", 11.6, 81, 5).tripRisk).toBe("HIGH");
  });

  it("distingue partida DOL normal de partida prolongada e de inversor", () => {
    // DOL de 2 s (típico de 5,5 kW) → ΔT ≈ 49 °C → LOW, sem alarme falso.
    expect(motorStartThermal("M01", 11.6, 81, 2).tripRisk).toBe("LOW");
    // DOL prolongado de 6 s → ΔT ≈ 146 °C → HIGH (partida anormal).
    expect(motorStartThermal("M01", 11.6, 81, 6).tripRisk).toBe("HIGH");
    // Partida limitada via inversor: 1,3×In por 3 s → ΔT ≈ 2,1 °C → LOW.
    expect(motorStartThermal("M01", 11.6, 15, 3).tripRisk).toBe("LOW");
  });

  it("rejeita corrente nominal não positiva", () => {
    expect(() => motorStartThermal("M01", 0, 81, 5)).toThrow("nominal_current_must_be_positive");
  });
});

describe("voltageDropCircuit", () => {
  it("sinaliza excedência do limite NBR 5410", () => {
    const ok = voltageDropCircuit("C1", 11.6, 20, 4);
    expect(ok.limit_pct).toBe(5);
    expect(ok.within_limit).toBe(true);

    const bad = voltageDropCircuit("C2", 40, 250, 2.5);
    expect(bad.voltage_drop_pct).toBeGreaterThan(5);
    expect(bad.within_limit).toBe(false);
  });

  it("respeita limite customizado (3% em iluminação)", () => {
    const r = voltageDropCircuit("C3", 16, 60, 2.5, { limit_pct: 3 });
    expect(r.limit_pct).toBe(3);
    expect(r.within_limit).toBe(r.voltage_drop_pct <= 3);
  });
});
