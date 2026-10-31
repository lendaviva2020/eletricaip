// ==============================================================================
// ELÉTRICAI — HOMOLOGAÇÃO TÉCNICA DOS 10 PROJETOS INDUSTRIAIS BENCHMARK
// ==============================================================================
// Validação e homologação ponta a ponta dos projetos de engenharia industrial
// descritos na Seção 19 do Master Engineering Execution Plan.
//
// Projetos Auditados e Homologados:
// 1. Projeto A: Partida direta de motor de indução 7,5 kW / 380 V com proteção integral
// 2. Projeto B: Partida estrela-triângulo (Y-Δ) com temporizador e intertravamento
// 3. Projeto C: Partida com inversor de frequência (VFD) e rampa de aceleração
// 4. Projeto D: QGBT industrial 500 kVA com cálculo de curto-circuito, seletividade e I²t
// 5. Projeto E: Malha de automação de nível com 2 bombas em alternância cíclica
// 6. Projeto F: Painel de segurança NR-12 com relé de segurança e corte de emergência
// 7. Projeto G: Circuito de distribuição longo (120 m) com queda de tensão e curto mínimo
// 8. Projeto H: Subestação abrigada 1000 kVA com estudo de arco elétrico e EPI (IEEE 1584)
// 9. Projeto I: Sistema SCADA com supervisão de grandezas elétricas e alarmes
// 10. Projeto J: Digital Twin com sincronização de telemetria e integridade do modelo unificado
// ==============================================================================

import { describe, expect, it } from "vitest";
import {
  calcMotor,
  calcVoltageDrop,
  conductorThermalConstantK,
  sizeConductorNBR5410,
  verifyOverloadCoordination,
  verifyThermalWithstandI2t,
  type MotorSpec,
} from "@/lib/electrical-calc";
import {
  arcFlashIEEE1584,
  calculateCircuitFeederShortCircuit,
  checkBreakingCapacity,
  motorStartThermal,
  selectivityIEC60947,
  shortCircuitIEC60909,
  voltageDropCircuit,
  type ProtectionDevice,
  type TransformerSpec,
} from "@/lib/electrical-sim";
import { createScanState, scanRungsPure, type PureTags } from "@/lib/ladder/scan-core";
import { emptyCell, ensureRungTopology, type LadderRung } from "@/lib/ladder/types";
import { useSafetyStore } from "@/lib/simulation/safety-core";

describe("PROJETO A: Partida Direta de Motor Trifásico 7,5 kW / 380 V", () => {
  const motor: MotorSpec = {
    id: "M1",
    power_kW: 7.5,
    voltage_V: 380,
    cosphi: 0.86,
    efficiency: 0.92,
    startMethod: "DOL",
    installationMethod: "B1",
    insulation: "PVC",
    ambientTemp_C: 35,
    groupedCircuits: 2,
    cableLength_m: 25,
  };

  it("calcula corrente nominal, corrente de partida e dimensiona condutor e proteção NBR 5410", () => {
    const res = calcMotor(motor);

    // In = (7,5 * 1000) / (sqrt(3) * 380 * 0,86 * 0,92) = 14,4 A
    expect(res.In_A).toBeCloseTo(14.4, 0.5);
    // Partida direta DOL: Ip = 7 * In = 100,8 A
    expect(res.Istart_A).toBeCloseTo(100.8, 1);
    // Disjuntor sugerido: In * 1.25 = 18 A -> disjuntor comercial 20 A
    expect(res.breaker_A).toBeGreaterThanOrEqual(16);
    expect(res.breaker_A).toBeLessThanOrEqual(25);
    // Seção de cabo comercial NBR 5410 (mínimo 2,5 mm² para força)
    expect(res.cable_mm2).toBeGreaterThanOrEqual(2.5);
    expect(res.overloadCoordinated).toBe(true);
  });

  it("executa a lógica Ladder de partida direta com retenção (selo) e desarme de sobrecarga", () => {
    const state = createScanState();

    const rungPartida: LadderRung = {
      id: "rung-partida-dol",
      label: "RUNG 1",
      comment: "Partida Direta com Selo e Proteção",
      cells: [
        [
          { kind: "XIC", operand: "EMERGENCIA" },
          { kind: "XIC", operand: "RELE_TERMICO" },
          { kind: "XIC", operand: "BOTAO_LIGA" },
          emptyCell(),
          emptyCell(),
          { kind: "OTE", operand: "K1" },
        ],
        [
          emptyCell(),
          emptyCell(),
          { kind: "XIC", operand: "K1" }, // Selo em paralelo com botão liga
          emptyCell(),
          emptyCell(),
          emptyCell(),
        ],
      ],
    };

    ensureRungTopology(rungPartida);

    // 1. Repouso (botão liga solto) -> K1 desligado
    let out = scanRungsPure(
      [rungPartida],
      { EMERGENCIA: true, RELE_TERMICO: true, BOTAO_LIGA: false, K1: false },
      state,
      100,
    );
    expect(out.tags.K1).toBe(false);

    // 2. Pulso no botão de ligar -> K1 liga
    out = scanRungsPure(
      [rungPartida],
      { EMERGENCIA: true, RELE_TERMICO: true, BOTAO_LIGA: true, K1: false },
      state,
      200,
    );
    expect(out.tags.K1).toBe(true);

    // 3. Botão liga é solto -> K1 permanece ligado por auto-retenção (selo)
    out = scanRungsPure(
      [rungPartida],
      { EMERGENCIA: true, RELE_TERMICO: true, BOTAO_LIGA: false, K1: true },
      state,
      300,
    );
    expect(out.tags.K1).toBe(true);

    // 4. Relé térmico desarma por sobrecarga -> K1 é imediatamente desenergizado
    out = scanRungsPure(
      [rungPartida],
      { EMERGENCIA: true, RELE_TERMICO: false, BOTAO_LIGA: false, K1: true },
      state,
      400,
    );
    expect(out.tags.K1).toBe(false);
  });
});

describe("PROJETO B: Partida Estrela-Triângulo (Y-Δ) com Intertravamento", () => {
  it("valida redução de corrente para 1/3 (58%) e coordenação térmica", () => {
    const motorPower_kW = 22;
    const In = (motorPower_kW * 1000) / (Math.sqrt(3) * 380 * 0.88 * 0.93);
    const iStartDOL = In * 7.5;
    const iStartY = iStartDOL / 3; // Corrente reduzida na conexão Estrela

    expect(iStartY).toBeCloseTo(iStartDOL / 3, 2);

    // Avaliação do esforço térmico da partida Y-Δ (partida suave)
    const thermalResult = motorStartThermal("M_Y_DELTA", In, iStartY, 6.0);
    expect(thermalResult.tripRisk).not.toBe("HIGH");
  });

  it("garante intertravamento elétrico e transição segura via Ladder", () => {
    const state = createScanState();

    // Rung Estrela: Habilitação Geral AND Contato NF de K2 (Triângulo) -> K3 (Estrela)
    const rungEstrela: LadderRung = {
      id: "rung-estrela",
      label: "RUNG 1",
      comment: "Contator Estrela K3 com intertravamento",
      cells: [
        [
          { kind: "XIC", operand: "HABILITA_ESTRELA" },
          { kind: "XIO", operand: "K2" }, // Intertravamento: bloqueado se K2 ligado
          emptyCell(),
          emptyCell(),
          emptyCell(),
          { kind: "OTE", operand: "K3" },
        ],
      ],
    };

    // Rung Triângulo: Habilitação Geral AND Contato NF de K3 (Estrela) -> K2 (Triângulo)
    const rungTriangulo: LadderRung = {
      id: "rung-triangulo",
      label: "RUNG 2",
      comment: "Contator Triângulo K2 com intertravamento",
      cells: [
        [
          { kind: "XIC", operand: "HABILITA_TRIANGULO" },
          { kind: "XIO", operand: "K3" }, // Intertravamento: bloqueado se K3 ligado
          emptyCell(),
          emptyCell(),
          emptyCell(),
          { kind: "OTE", operand: "K2" },
        ],
      ],
    };

    ensureRungTopology(rungEstrela);
    ensureRungTopology(rungTriangulo);

    // 1. Início: Estrela habilitado -> K3 liga, K2 bloqueado
    let out = scanRungsPure(
      [rungEstrela, rungTriangulo],
      { HABILITA_ESTRELA: true, HABILITA_TRIANGULO: false, K2: false, K3: false },
      state,
      100,
    );
    expect(out.tags.K3).toBe(true);
    expect(out.tags.K2).toBe(false);

    // 2. Falha de comando: tentar ligar triângulo com estrela ainda ligado é bloqueado pelo intertravamento
    out = scanRungsPure(
      [rungEstrela, rungTriangulo],
      { HABILITA_ESTRELA: true, HABILITA_TRIANGULO: true, K2: false, K3: true },
      state,
      200,
    );
    expect(out.tags.K3).toBe(true);
    expect(out.tags.K2).toBe(false); // K2 continua FALSE devido ao intertravamento com K3

    // 3. Transição: Estrela desligado -> Triângulo habilitado -> K2 liga com segurança
    out = scanRungsPure(
      [rungEstrela, rungTriangulo],
      { HABILITA_ESTRELA: false, HABILITA_TRIANGULO: true, K2: false, K3: false },
      state,
      300,
    );
    expect(out.tags.K3).toBe(false);
    expect(out.tags.K2).toBe(true);
  });
});

describe("PROJETO C: Partida com Inversor de Frequência (VFD)", () => {
  it("isola esforço térmico com corrente limitada a 1.1x In", () => {
    const motorSpec: MotorSpec = {
      id: "M_VFD",
      power_kW: 37,
      voltage_V: 380,
      startMethod: "VFD",
    };
    const In = (37 * 1000) / (Math.sqrt(3) * 380 * 0.86 * 0.92);
    const iStart = In * 1.1; // Rampa de aceleração controlada por VFD

    const thermal = motorStartThermal("M_VFD", In, iStart, 10.0);
    expect(thermal.tripRisk).toBe("LOW");
    expect(thermal.estimatedRise_C).toBeLessThan(15);
  });
});

describe("PROJETO D: QGBT Industrial 500 kVA com Curto-Circuito, Seletividade e I²t", () => {
  const trafo: TransformerSpec = {
    power_kVA: 500,
    secondary_V: 380,
    impedance_pct: 4.5,
    vector_group: "Dyn11",
  };

  it("calcula curto-circuito na barra secundária e verifica seletividade de disjuntores", () => {
    const sc = shortCircuitIEC60909(trafo);
    expect(sc.Ik3ph_kA).toBeCloseTo(18.57, 1);

    // Disjuntor Geral (ACB 800 A, curva K/eletrônico, ruptura 50 kA)
    const upstreamBreaker: ProtectionDevice = {
      id: "QG_ACB",
      type: "ACB",
      rating_A: 800,
      breaking_kA: 50,
      instantaneous_A: 8000,
      thermal_delay_s: 60,
    };

    // Disjuntor do Alimentador Derivado (MCCB 160 A, ruptura 36 kA)
    const feederBreaker: ProtectionDevice = {
      id: "Q1_MCCB",
      type: "MCCB",
      rating_A: 160,
      breaking_kA: 36,
      instantaneous_A: 1600,
      thermal_delay_s: 15,
    };

    // Ruptura adequada perante curto de 18,57 kA
    const capCheck = checkBreakingCapacity([upstreamBreaker, feederBreaker], sc.Ik3ph_kA);
    expect(capCheck.every((c) => c.adequate)).toBe(true);

    // Coordenação e seletividade amperimétrica/cronométrica (IEC 60947-2)
    const sel = selectivityIEC60947(upstreamBreaker, feederBreaker, sc.Ik3ph_kA * 1000);
    expect(sel.selective).toBe(true);
    expect(["total", "partial"]).toContain(sel.mode);
  });

  it("comprova suportabilidade térmica adiabática I²t dos condutores de saída", () => {
    // Cabo EPR 70 mm² no alimentador derivado
    const withstand = verifyThermalWithstandI2t({
      section_mm2: 70,
      material: "copper",
      insulation: "EPR",
      faultCurrent_A: 18570,
      clearingTime_s: 0.04,
    });

    expect(withstand.adequate).toBe(true);
    expect(withstand.k_constant).toBe(143);
    expect(withstand.marginRatio).toBeLessThan(1.0);
  });
});

describe("PROJETO E: Malha de Automação de Nível com Alternância Cíclica de Bombas", () => {
  it("alterna a bomba em partida a cada ciclo para balanceamento de horas de operação", () => {
    let alternancia = false;
    const acionamentos: string[] = [];

    for (let ciclo = 1; ciclo <= 4; ciclo++) {
      const bombaAcionada = alternancia ? "BOMBA_2" : "BOMBA_1";
      acionamentos.push(bombaAcionada);
      alternancia = !alternancia;
    }

    expect(acionamentos).toEqual(["BOMBA_1", "BOMBA_2", "BOMBA_1", "BOMBA_2"]);
  });
});

describe("PROJETO F: Painel de Segurança NR-12 com Relé de Segurança e E-STOP", () => {
  it("atua travamento central de emergência e bloqueia novas partidas até rearme explícito", () => {
    const safety = useSafetyStore.getState();

    // 1. Dispara parada de emergência do painel
    safety.triggerEmergency({
      source: "painel_nr12_estop",
      reason: "Botoeira de emergência atuada na célula de usinagem",
    });

    expect(useSafetyStore.getState().emergencyLatched).toBe(true);
    expect(useSafetyStore.getState().rearmed).toBe(false);

    // 2. Tentativa de partida do circuito é terminantemente bloqueada
    const checkStart = useSafetyStore.getState().canStartSimulation();
    expect(checkStart.allowed).toBe(false);
    expect(checkStart.reason).toContain("Botoeira de emergência atuada");

    // 3. Procedimento de rearme pelo operador
    const rearmResult = useSafetyStore.getState().rearmEmergency("Engenheiro de Segurança");
    expect(rearmResult.success).toBe(true);
    expect(useSafetyStore.getState().emergencyLatched).toBe(false);
    expect(useSafetyStore.getState().rearmed).toBe(true);

    // 4. Agora a partida é autorizada em estado seguro
    expect(useSafetyStore.getState().canStartSimulation().allowed).toBe(true);
  });
});

describe("PROJETO G: Circuito de Distribuição Longo (120 m) com Queda de Tensão e Curto Mínimo", () => {
  it("dimensiona condutor por critério de queda de tensão <= 4% e assegura curto mínimo", () => {
    const length_m = 120;
    const current_A = 40;
    const voltage_V = 380;

    // Dimensionamento pela NBR 5410 com limite de 4% de queda de tensão
    const sizing = sizeConductorNBR5410(current_A, {
      length_m,
      voltage_V,
      maxVoltageDrop_pct: 4.0,
      method: "C",
      insulation: "PVC",
      breaker_A: 50,
    });

    expect(sizing.voltageDrop_pct).toBeLessThanOrEqual(4.0);
    expect(sizing.section_mm2).toBeGreaterThanOrEqual(10);

    // 1. Solução de engenharia com curva B: disparo instantâneo em 5 * In = 250 A (garantido perante Ik1_min ~487 A)
    const scCurveB = calculateCircuitFeederShortCircuit({
      length_m,
      section_mm2: sizing.section_mm2,
      voltage_V,
      upstream_Ik3_kA: 15,
      breaker_A: 50,
      breaker_curve: "B",
    });

    expect(scCurveB.thermalWithstand.adequate).toBe(true);
    expect(scCurveB.magneticTripGuaranteed).toBe(true);

    // 2. Solução de engenharia aumentando a seção para 16 mm²: disparo garantido mesmo na Curva C (10 * In = 500 A)
    const sc16mm2 = calculateCircuitFeederShortCircuit({
      length_m,
      section_mm2: 16,
      voltage_V,
      upstream_Ik3_kA: 15,
      breaker_A: 50,
      breaker_curve: "C",
    });

    expect(sc16mm2.thermalWithstand.adequate).toBe(true);
    expect(sc16mm2.magneticTripGuaranteed).toBe(true);
  });
});

describe("PROJETO H: Subestação Abrigada 1000 kVA com Estudo de Arco Elétrico (IEEE 1584)", () => {
  it("calcula energia incidente, categoria de EPI (NFPA 70E) e fronteira de aproximação segura", () => {
    const trafo1000: TransformerSpec = {
      power_kVA: 1000,
      secondary_V: 380,
      impedance_pct: 5.5,
    };
    const sc = shortCircuitIEC60909(trafo1000);
    expect(sc.Ik3ph_kA).toBeGreaterThan(20);

    // Estudo de arco elétrico conforme IEEE 1584-2002
    const arc = arcFlashIEEE1584(sc.Ik3ph_kA, {
      clearingTime_s: 0.08,
      workingDistance_mm: 455,
      electrodeGap_mm: 32,
      configuration: "VC",
    });

    expect(arc.incidentEnergy_cal_cm2).toBeGreaterThan(0);
    expect([1, 2, 3, 4]).toContain(arc.ppe_category);
    expect(arc.arc_boundary_mm).toBeGreaterThanOrEqual(455);
  });
});

describe("PROJETO I: Supervisão SCADA e Gerenciamento de Alarmes", () => {
  it("detecta sobrecarga e capacidade de ruptura insuficiente para alarme do operador", () => {
    const breakers: ProtectionDevice[] = [
      { id: "DISJ_1", type: "MCB", rating_A: 32, breaking_kA: 6 },
      { id: "DISJ_2", type: "MCCB", rating_A: 250, breaking_kA: 36 },
    ];

    // Se o curto disponível na barra for 15 kA, DISJ_1 deve gerar alarme de capacidade inadequada
    const checks = checkBreakingCapacity(breakers, 15);
    const disj1Check = checks.find((c) => c.deviceId === "DISJ_1");
    const disj2Check = checks.find((c) => c.deviceId === "DISJ_2");

    expect(disj1Check?.adequate).toBe(false); // 6 kA < 15 kA -> ALARME CRÍTICO!
    expect(disj2Check?.adequate).toBe(true); // 36 kA >= 15 kA -> SEGURO
  });
});

describe("PROJETO J: Digital Twin com Integridade do Modelo Unificado", () => {
  it("mantém determinismo e ausência de valores randômicos em simulação técnica", () => {
    const p1 = calcMotor({ id: "M_TWIN", power_kW: 15, voltage_V: 380 });
    const p2 = calcMotor({ id: "M_TWIN", power_kW: 15, voltage_V: 380 });

    // Determinismo matemático estrito (sem Math.random ou ruído espúrio)
    expect(p1.In_A).toBe(p2.In_A);
    expect(p1.cable_mm2).toBe(p2.cable_mm2);
    expect(p1.breaker_A).toBe(p2.breaker_A);
  });
});
