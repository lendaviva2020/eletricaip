import { describe, it, expect } from "vitest";
import {
  createPlant,
  stepPlant,
  plantTags,
  defaultPlantInputs,
  EXHAUST_ON_TEMP_C,
  EXHAUST_OFF_TEMP_C,
  type PlantInputs,
} from "@/lib/simulation/plant-engine";

function run(steps: number, inputs: PlantInputs, dt = 0.1) {
  let s = createPlant();
  for (let i = 0; i < steps; i++) s = stepPlant(s, inputs, dt);
  return s;
}

const onInputs = (): PlantInputs => ({ ...defaultPlantInputs(), start: true });

describe("plant-engine — rung SISTEMA", () => {
  it("nasce desligado, sem falhas e sem eventos", () => {
    const s = createPlant();
    expect(s.systemOn).toBe(false);
    expect(s.busEnergized).toBe(false);
    expect(Object.values(s.motors)).toHaveLength(8);
    expect(Object.values(s.motors).every((m) => !m.running && m.fault === null)).toBe(true);
    expect(s.events).toHaveLength(0);
  });

  it("START sela o sistema e energiza o barramento", () => {
    const s = run(5, onInputs());
    expect(s.systemOn).toBe(true);
    expect(s.busEnergized).toBe(true);
    expect(s.bus_V).toBe(380);
    expect(s.events.some((e) => e.kind === "system_on")).toBe(true);
  });

  it("STOP quebra o selo", () => {
    let s = run(5, onInputs());
    s = stepPlant(s, { ...defaultPlantInputs(), stop: true }, 0.1);
    expect(s.systemOn).toBe(false);
    expect(s.busEnergized).toBe(false);
  });

  it("E-STOP trava, desenergiza e exige RESET com estop liberado", () => {
    let s = run(20, onInputs());
    expect(Object.values(s.motors).every((m) => m.running)).toBe(true);
    s = stepPlant(s, { ...defaultPlantInputs(), estop: true }, 0.1);
    expect(s.estopLatched).toBe(true);
    expect(s.systemOn).toBe(false);
    // START com estop travado não religa
    s = stepPlant(s, { ...onInputs(), estop: true }, 0.1);
    expect(s.systemOn).toBe(false);
    // RESET com estop ainda pressionado não libera
    s = stepPlant(s, { ...defaultPlantInputs(), estop: true, reset: true }, 0.1);
    expect(s.estopLatched).toBe(true);
    // RESET com estop liberado libera
    s = stepPlant(s, { ...defaultPlantInputs(), reset: true }, 0.1);
    expect(s.estopLatched).toBe(false);
    expect(s.events.some((e) => e.kind === "estop")).toBe(true);
    expect(s.events.some((e) => e.kind === "estop_reset")).toBe(true);
  });
});

describe("plant-engine — motores", () => {
  it("rampa velocidade e corrente parte do pico até In", () => {
    let s = createPlant();
    s = stepPlant(s, onInputs(), 0.1);
    const first = s.motors["M01"].current_A;
    const In = s.motorIn_A["M01"];
    expect(first).toBeGreaterThan(In * 2);
    s = run(200, onInputs());
    const m = s.motors["M01"];
    expect(m.speed_rpm).toBeGreaterThan(1700);
    expect(m.speed_rpm).toBeLessThanOrEqual(1750);
    expect(Math.abs(m.current_A - In)).toBeLessThan(In * 0.15);
  });

  it("comando individual desliga só o motor comandado", () => {
    const inputs = { ...onInputs(), motorCmd: { M03: false } };
    const s = run(100, inputs);
    expect(s.motors["M03"].running).toBe(false);
    expect(s.motors["M01"].running).toBe(true);
  });

  it("sobrecarga injetada tripa por proteção térmica", () => {
    const inputs = { ...onInputs(), faultInject: { M02: "overload" } } as PlantInputs;
    const s = run(3000, inputs);
    const m = s.motors["M02"];
    expect(m.fault).not.toBeNull();
    expect(m.running).toBe(false);
    expect(s.events.some((e) => e.kind === "trip" && e.ref === "M02")).toBe(true);
    // vizinho segue saudável
    expect(s.motors["M01"].fault).toBeNull();
  });

  it("curto injetado tripa instantâneo", () => {
    const inputs = { ...onInputs(), faultInject: { M04: "short" } } as PlantInputs;
    const s = run(3, inputs);
    expect(s.motors["M04"].fault?.code).toBe("CURTO");
  });

  it("subtensão derruba contatores sem gerar falha", () => {
    let s = run(100, onInputs());
    expect(s.motors["M01"].running).toBe(true);
    s = stepPlant(s, { ...defaultPlantInputs(), undervoltage: true }, 0.1);
    expect(s.busEnergized).toBe(false);
    expect(s.motors["M01"].running).toBe(false);
    expect(s.motors["M01"].fault).toBeNull();
  });

  it("conta partidas (starts) por motor", () => {
    let s = createPlant();
    s = stepPlant(s, onInputs(), 0.1);
    s = stepPlant(s, { ...defaultPlantInputs(), stop: true }, 0.1);
    s = stepPlant(s, onInputs(), 0.1);
    expect(s.motors["M01"].starts).toBe(2);
  });
});

describe("plant-engine — exaustores com histerese", () => {
  it(`liga acima de ${EXHAUST_ON_TEMP_C}°C e só desliga abaixo de ${EXHAUST_OFF_TEMP_C}°C`, () => {
    let s = run(30, { ...onInputs(), plantTemp_C: 28 });
    expect(s.exhaustors["EX01"].running).toBe(true);
    expect(s.exhaustors["EX02"].running).toBe(true);
    // zona morta: entre 24 e 27 mantém ligado
    s = stepPlant(s, { ...defaultPlantInputs(), plantTemp_C: 25 }, 0.1);
    expect(s.exhaustors["EX01"].running).toBe(true);
    // abaixo de 24 desliga
    let s2 = s;
    for (let i = 0; i < 30; i++)
      s2 = stepPlant(s2, { ...defaultPlantInputs(), plantTemp_C: 22 }, 0.1);
    expect(s2.exhaustors["EX01"].running).toBe(false);
  });

  it("fumaça liga exaustores mesmo com temperatura baixa", () => {
    const s = run(30, { ...onInputs(), plantTemp_C: 20, smoke: true });
    expect(s.exhaustors["EX01"].running).toBe(true);
    expect(s.generalAlarm).toBe(true);
  });
});

describe("plant-engine — determinismo e tags", () => {
  it("mesma sequência de passos produz estado idêntico", () => {
    const a = run(150, onInputs());
    const b = run(150, onInputs());
    expect(a).toEqual(b);
  });

  it("dt é limitado (sem explosão numérica)", () => {
    const s = stepPlant(createPlant(), onInputs(), 100);
    expect(Number.isFinite(s.motors["M01"].speed_rpm)).toBe(true);
    expect(Number.isFinite(s.motors["M01"].temp_C)).toBe(true);
  });

  it("tags derivadas alimentam SCADA/alarmes legados", () => {
    const s = run(200, { ...onInputs(), plantTemp_C: 28 });
    const tags = plantTags(s);
    expect(tags["SISTEMA_ON"]).toBe(true);
    expect(tags["M01_RUN"]).toBe(true);
    expect(tags["TEMP_M01"]).toBeGreaterThan(0);
    expect(tags["EX01_RUN"]).toBe(true);
    expect(typeof tags["M01_CURRENT"]).toBe("number");
  });

  it("eventos são limitados", () => {
    let s = createPlant();
    for (let i = 0; i < 200; i++) {
      s = stepPlant(s, i % 2 === 0 ? onInputs() : { ...defaultPlantInputs(), stop: true }, 0.1);
    }
    expect(s.events.length).toBeLessThanOrEqual(50);
  });
});
