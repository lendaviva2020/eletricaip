import { describe, expect, it } from "vitest";
import {
  THERMAL_TRIP_THETA,
  createMotorDriveState,
  magneticTrip_A,
  resetMotorFault,
  startPermissive,
  stepMotorDrive,
  thermalTripTime_s,
  type InjectedMotorFault,
  type MotorDriveConfig,
  type MotorDriveState,
  type MotorStepInputs,
} from "@/lib/simulation/motor-protection-engine";
import { assignPlcIo, buildMotorFleet, defaultBreakerFor } from "@/lib/simulation/motor-fleet";
import { buildMccDemoDiagram, MCC_DEMO_MOTORS } from "@/lib/simulation/mcc-demo-plant";
import { computeCircuitEnergization } from "@/lib/diagram/electrical-simulation";

const cfg: MotorDriveConfig = {
  id: "m1",
  tag: "M-01",
  label: "Motor teste",
  power_kW: 5.5,
  voltage_V: 380,
  In_A: 10.6,
  startMethod: "DOL",
  ratedRpm: 1750,
  loadFactor: 0.85,
  thermalSetting_A: 10.6,
  thermalClass: 10,
  breakerIn_A: 16,
  breakerCurve: "D",
  prospectiveIk_A: 10_000,
  ambient_C: 40,
};

const base: MotorStepInputs = {
  commandRun: true,
  feederEnergized: true,
  busVoltage_V: 380,
  emergencyStop: false,
  injected: "none",
};

function run(
  seconds: number,
  inputs: Partial<MotorStepInputs> = {},
  start: MotorDriveState = createMotorDriveState(cfg),
  t0 = 0,
) {
  let s = start;
  let t = t0;
  const events = [];
  const dt = 0.1;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    t += dt;
    const r = stepMotorDrive(s, cfg, { ...base, ...inputs }, dt, t);
    s = r.state;
    events.push(...r.events);
  }
  return { s, t, events };
}

describe("motor-protection-engine — física e proteções", () => {
  it("parte DOL, atinge regime e corrente de carga (verde = RUNNING)", () => {
    const { s, events } = run(5);
    expect(s.runState).toBe("RUNNING");
    expect(s.contactorClosed).toBe(true);
    expect(s.speed_rpm).toBeGreaterThan(1650);
    // I_carga = In·(0,35 + 0,65·0,85) ≈ 0,90·In
    expect(s.current_A).toBeGreaterThan(cfg.In_A * 0.85);
    expect(s.current_A).toBeLessThan(cfg.In_A);
    expect(s.fault).toBeNull();
    expect(events.some((e) => e.kind === "start")).toBe(true);
    expect(events.some((e) => e.kind === "running")).toBe(true);
  });

  it("corrente de partida DOL ≈ 7·In no primeiro passo", () => {
    const r = stepMotorDrive(createMotorDriveState(cfg), cfg, base, 0.01, 0.01);
    expect(r.state.current_A).toBeGreaterThan(cfg.In_A * 6.5);
  });

  it("classe 10: a 7,2·Ir desarma em 10 s a frio (IEC 60947-4-1)", () => {
    expect(thermalTripTime_s(7.2, 10)).toBeCloseTo(10, 6);
    expect(thermalTripTime_s(7.2, 20)).toBeCloseTo(20, 6);
    expect(thermalTripTime_s(1.05, 10)).toBe(Number.POSITIVE_INFINITY); // não-disparo
    expect(Number.isFinite(thermalTripTime_s(1.2, 10))).toBe(true); // disparo
    expect(THERMAL_TRIP_THETA).toBeCloseTo(1.3225, 4);
  });

  it("sobrecorrente (3·In) desarma por relé térmico no tempo da curva", () => {
    const warm = run(5).s;
    const expected = thermalTripTime_s(3, 10);
    const { s } = run(expected * 1.6, { injected: "overload" }, warm, 5);
    expect(s.runState).toBe("TRIPPED");
    expect(s.fault?.code).toBe("OVERLOAD");
    expect(s.contactorClosed).toBe(false);
  });

  it("curto-circuito: disparo magnético instantâneo e disjuntor aberto", () => {
    const warm = run(5).s;
    const r = stepMotorDrive(warm, cfg, { ...base, injected: "short_circuit" }, 0.1, 5.1);
    expect(r.state.fault?.code).toBe("SHORT_CIRCUIT");
    expect(r.state.breakerClosed).toBe(false);
    expect(r.state.current_A).toBe(0);
    expect(magneticTrip_A(cfg)).toBe(320);
  });

  it("curto de baixa corrente (abaixo do magnético) não dispara instantâneo", () => {
    const weak: MotorDriveConfig = { ...cfg, prospectiveIk_A: 100 };
    const r = stepMotorDrive(run(5).s, weak, { ...base, injected: "short_circuit" }, 0.1, 5.1);
    expect(r.state.fault?.code).not.toBe("SHORT_CIRCUIT");
  });

  it("falta de fase desarma em 1,5 s", () => {
    const { s } = run(2, { injected: "phase_loss" }, run(5).s, 5);
    expect(s.fault?.code).toBe("PHASE_LOSS");
  });

  it("rotor bloqueado → FALHA DE ROTAÇÃO (corrente alta, sem velocidade)", () => {
    const { s } = run(4, { injected: "locked_rotor" });
    expect(s.fault?.code).toBe("ROTATION_FAILURE");
  });

  it("encoder sem pulsos com corrente normal → FALHA DE SENSOR (não do motor)", () => {
    const { s } = run(3, { injected: "sensor_speed" }, run(5).s, 5);
    expect(s.fault?.code).toBe("SENSOR_FAILURE");
  });

  it("PT100 aberto → FALHA DE SENSOR (fail-safe)", () => {
    const { s } = run(0.2, { injected: "sensor_temp" }, run(5).s, 5);
    expect(s.fault?.code).toBe("SENSOR_FAILURE");
    expect(s.contactorClosed).toBe(false);
  });

  it("subtensão derruba e trava sem religamento automático", () => {
    const tripped = run(0.2, { busVoltage_V: 300 }, run(5).s, 5).s;
    expect(tripped.fault?.code).toBe("UNDERVOLTAGE");
    const after = run(3, { busVoltage_V: 380 }, tripped, 6).s;
    expect(after.contactorClosed).toBe(false);
    expect(after.runState).toBe("TRIPPED");
  });

  it("E-STOP abre o contator imediatamente", () => {
    const { s } = run(0.1, { emergencyStop: true }, run(5).s, 5);
    expect(s.contactorClosed).toBe(false);
    expect(startPermissive(s, { ...base, emergencyStop: true }, cfg).allowed).toBe(false);
  });

  it("alimentador desenergizado bloqueia partida", () => {
    const p = startPermissive(createMotorDriveState(cfg), { ...base, feederEnergized: false }, cfg);
    expect(p.allowed).toBe(false);
    expect(p.reason).toMatch(/Alimentador/);
    const { s } = run(2, { feederEnergized: false });
    expect(s.contactorClosed).toBe(false);
  });

  it("rearme exige causa removida e resfriamento; nunca religa", () => {
    const tripped = run(0.2, { injected: "sensor_temp" }, run(5).s, 5).s;
    const blocked = resetMotorFault(tripped, cfg, "sensor_temp" as InjectedMotorFault, 6);
    expect(blocked.ok).toBe(false);
    const ok = resetMotorFault(tripped, cfg, "none", 6);
    expect(ok.ok).toBe(true);
    expect(ok.state.fault).toBeNull();
    expect(ok.state.contactorClosed).toBe(false);
  });

  it("relé térmico quente bloqueia rearme até resfriar", () => {
    const warm = run(5).s;
    const tripped = run(60, { injected: "overload" }, warm, 5).s;
    expect(tripped.fault?.code).toBe("OVERLOAD");
    expect(resetMotorFault(tripped, cfg, "none", 70).ok).toBe(false);
    const cooled = run(3000, { commandRun: false }, tripped, 70).s;
    expect(resetMotorFault(cooled, cfg, "none", 3100).ok).toBe(true);
  });

  it("parada por comando: STOPPING → STOPPED com rampa por inércia", () => {
    const { s } = run(15, { commandRun: false }, run(5).s, 5);
    expect(s.runState).toBe("STOPPED");
    expect(s.speed_rpm).toBe(0);
    expect(s.current_A).toBe(0);
  });

  it("dt inválido (NaN/negativo) não corrompe o estado", () => {
    const s0 = run(5).s;
    const r = stepMotorDrive(s0, cfg, base, Number.NaN, 5);
    expect(Number.isFinite(r.state.speed_rpm)).toBe(true);
    expect(r.state.thermalTheta).toBeCloseTo(s0.thermalTheta, 6);
  });
});

describe("motor-fleet — frota derivada do unifilar", () => {
  const doc = buildMccDemoDiagram("2026-01-01T00:00:00.000Z");
  const fleet = buildMotorFleet(doc);

  it("um acionamento por motor do unifilar, com cadeia de proteção topológica", () => {
    expect(fleet).toHaveLength(MCC_DEMO_MOTORS.length);
    for (const m of fleet) {
      expect(m.chain.breakerId).toBeDefined();
      expect(m.chain.contactorId).toBeDefined();
      if (m.config.startMethod === "DOL") expect(m.chain.thermalRelayId).toBeDefined();
      else expect(m.chain.driveId).toBeDefined();
      expect(m.issues).toEqual([]);
    }
  });

  it("não atravessa o barramento (cada motor tem o SEU disjuntor)", () => {
    const breakers = new Set(fleet.map((m) => m.chain.breakerId));
    expect(breakers.size).toBe(fleet.length);
    expect(breakers.has("demo_qgbt")).toBe(false);
  });

  it("I/O de CLP determinístico e sem colisões", () => {
    expect(assignPlcIo(0).commandOutput).toBe("%Q0.0");
    expect(assignPlcIo(9).commandOutput).toBe("%Q1.1");
    const outs = new Set(fleet.map((m) => m.io.commandOutput));
    expect(outs.size).toBe(fleet.length);
  });

  it("disjuntor padrão ≥ 1,25·In comercial", () => {
    expect(defaultBreakerFor(10.6)).toBe(16);
    expect(defaultBreakerFor(100)).toBe(125);
  });

  it("acusa ramal sem proteção", () => {
    const bare = buildMccDemoDiagram("2026-01-01T00:00:00.000Z");
    delete bare.nodes["demo_q1"];
    for (const [id, e] of Object.entries(bare.edges)) {
      if (e.source === "demo_q1" || e.target === "demo_q1") delete bare.edges[id];
    }
    const f = buildMotorFleet(bare);
    const m = f.find((x) => x.config.tag === "MG-201");
    expect(m?.issues.some((i) => i.includes("curto-circuito"))).toBe(true);
  });

  it("disjuntor geral aberto desenergiza todos os ramais (integração unifilar)", () => {
    const on = computeCircuitEnergization(doc, "running", {});
    for (const m of fleet) expect(on.energizedNodeIds.has(m.chain.contactorId!)).toBe(true);
    const off = computeCircuitEnergization(doc, "running", { demo_qgbt: false });
    for (const m of fleet) expect(off.energizedNodeIds.has(m.chain.contactorId!)).toBe(false);
  });

  it("contator aberto não energiza o motor a jusante", () => {
    const m = fleet[0];
    const en = computeCircuitEnergization(doc, "running", { [m.chain.contactorId!]: false });
    expect(en.energizedNodeIds.has(m.nodeId)).toBe(false);
    expect(en.energizedNodeIds.has(m.chain.contactorId!)).toBe(true);
  });
});

describe("ramais sem barramento (disjuntor geral derivando dois ramais)", () => {
  // TR → Q0 → {Q1 → K1 → F1 → M1 (partida direta), Q2 → U1 (inversor) → M2}
  const node = (id: string, x: number, params: Record<string, unknown>) => ({
    id,
    sheet: "unifilar" as const,
    position: { x, y: 0 },
    rotation: 0,
    label: id,
    params,
  });
  const edge = (source: string, target: string) => ({
    id: `${source}-${target}`,
    sheet: "unifilar" as const,
    source,
    target,
    kind: "power" as const,
  });
  const doc = {
    id: "d",
    version: 2,
    sheets: ["unifilar"],
    nodes: Object.fromEntries(
      [
        node("TR", 0, { kind: "transformer", power_kVA: 75, primary_V: 13800, secondary_V: 380 }),
        node("Q0", 0, { kind: "breaker", in_A: 100, curve: "C", poles: 3 }),
        node("Q1", -1, { kind: "breaker", in_A: 20, curve: "C", poles: 3 }),
        node("K1", -1, { kind: "contactor", in_A: 18, coil_V: 24 }),
        node("F1", -1, { kind: "thermal_relay", tag: "F1" }),
        node("M1", -1, { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" }),
        node("Q2", 1, { kind: "breaker", in_A: 25, curve: "C", poles: 3 }),
        node("U1", 1, { kind: "vfd", power_kW: 7.5 }),
        node("M2", 1, { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" }),
      ].map((n) => [n.id, n]),
    ),
    edges: Object.fromEntries(
      [
        edge("TR", "Q0"),
        edge("Q0", "Q1"),
        edge("Q0", "Q2"),
        edge("Q1", "K1"),
        edge("K1", "F1"),
        edge("F1", "M1"),
        edge("Q2", "U1"),
        edge("U1", "M2"),
      ].map((e) => [e.id, e]),
    ),
  } as unknown as Parameters<typeof buildMotorFleet>[0];

  it("cada motor só vê o próprio ramal (M1 não herda o inversor de M2)", () => {
    const fleet = buildMotorFleet(doc);
    const m1 = fleet.find((m) => m.nodeId === "M1");
    const m2 = fleet.find((m) => m.nodeId === "M2");
    expect(m1?.chain.driveId).toBeUndefined();
    expect(m1?.chain.contactorId).toBe("K1");
    expect(m1?.chain.breakerId).toBe("Q1");
    expect(m1?.config.startMethod).toBe("DOL");
    expect(m2?.chain.driveId).toBe("U1");
    expect(m2?.chain.contactorId).toBeUndefined();
    expect(m2?.chain.breakerId).toBe("Q2");
    expect(m2?.config.startMethod).toBe("VFD");
  });
});
