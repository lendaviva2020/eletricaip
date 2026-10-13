// Motor de simulação de planta industrial — 8 motores + 2 exaustores.
// Puro e determinístico: sem I/O, sem Math.random, sem Date.now dentro do
// passo (o relógio `t_s` avança só pelo `dt` informado). Projetado para
// alimentar SCADA/simulação com valores *simulados de verdade* — nunca
// apresentar como medição real (ver selo SIMULAÇÃO na UI).
//
// Modelo honesto e documentado (1ª ordem, acelerado para demo):
// - Partida: corrente de rotor bloqueado (Istart) decaindo até In com a rampa.
// - Térmica: T tende a Tamb + (I/In)² · rise, com tau térmico acelerado.
// - Proteções: curto (I > 6·In, instantâneo), sobrecarga via térmica,
//   falta de fase (meia velocidade + 1,8·In), subtensão (contator cai).
// - Exaustores com histerese (liga > onTemp, desliga < offTemp) + fumaça.
// - Rung SISTEMA: START sela, STOP/ E-STOP quebram, E-STOP trava até RESET.
import { motorNominalCurrent, motorStartingCurrent } from "@/lib/electrical-calc";

export interface PlantMotorSpec {
  id: string;
  name: string;
  power_kW: number;
  voltage_V?: number;
  ratedRpm?: number;
  tripTemp_C?: number;
}

export type InjectedFault = "none" | "overload" | "short" | "phase";

export interface MotorSim {
  running: boolean;
  energized: boolean;
  speed_rpm: number;
  current_A: number;
  temp_C: number;
  starts: number;
  fault: { code: string; message: string; t: number } | null;
}

export interface ExhaustorSim {
  running: boolean;
  airflow_pct: number;
}

export interface PlantEvent {
  t: number;
  kind:
    "system_on" | "system_off" | "estop" | "estop_reset" | "trip" | "exhaust_on" | "exhaust_off";
  ref: string;
  message: string;
}

export interface PlantInputs {
  start: boolean;
  stop: boolean;
  estop: boolean;
  reset: boolean;
  motorCmd: Record<string, boolean>;
  faultInject: Record<string, InjectedFault>;
  ambientTemp_C: number;
  plantTemp_C: number;
  smoke: boolean;
  exhaustDemand: boolean;
  undervoltage: boolean;
}

export interface PlantState {
  t_s: number;
  systemOn: boolean;
  estopLatched: boolean;
  bus_V: number;
  busEnergized: boolean;
  generalAlarm: boolean;
  motors: Record<string, MotorSim>;
  motorIn_A: Record<string, number>;
  exhaustors: Record<string, ExhaustorSim>;
  events: PlantEvent[];
}

export const DEFAULT_MOTORS: PlantMotorSpec[] = Array.from({ length: 8 }, (_, i) => ({
  id: `M${String(i + 1).padStart(2, "0")}`,
  name: `Motor ${i + 1}`,
  power_kW: 5.5,
  voltage_V: 380,
  ratedRpm: 1750,
  tripTemp_C: 90,
}));

export const EXHAUST_ON_TEMP_C = 27;
export const EXHAUST_OFF_TEMP_C = 24;
const MAX_EVENTS = 50;

export function defaultPlantInputs(): PlantInputs {
  return {
    start: false,
    stop: false,
    estop: false,
    reset: false,
    motorCmd: {},
    faultInject: {},
    ambientTemp_C: 25,
    plantTemp_C: 25,
    smoke: false,
    exhaustDemand: false,
    undervoltage: false,
  };
}

export function createPlant(specs: PlantMotorSpec[] = DEFAULT_MOTORS): PlantState {
  const motors: Record<string, MotorSim> = {};
  const motorIn_A: Record<string, number> = {};
  for (const s of specs) {
    motors[s.id] = {
      running: false,
      energized: false,
      speed_rpm: 0,
      current_A: 0,
      temp_C: 25,
      starts: 0,
      fault: null,
    };
    motorIn_A[s.id] = motorNominalCurrent({ id: s.id, power_kW: s.power_kW });
  }
  return {
    t_s: 0,
    systemOn: false,
    estopLatched: false,
    bus_V: 380,
    busEnergized: false,
    generalAlarm: false,
    motors,
    motorIn_A,
    exhaustors: {
      EX01: { running: false, airflow_pct: 0 },
      EX02: { running: false, airflow_pct: 0 },
    },
    events: [],
  };
}

function pushEvent(events: PlantEvent[], e: PlantEvent): PlantEvent[] {
  const next = [...events, e];
  return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
}

function stepMotor(
  prev: MotorSim,
  In: number,
  Istart: number,
  spec: PlantMotorSpec,
  energized: boolean,
  faultInject: InjectedFault,
  ambient: number,
  dt: number,
  t: number,
  events: PlantEvent[],
): { next: MotorSim; events: PlantEvent[] } {
  const rated = spec.ratedRpm ?? 1750;
  const tripTemp = spec.tripTemp_C ?? 90;
  let ev = events;

  // Curto-circuito injetado: trip instantâneo ao energizar.
  if (energized && faultInject === "short" && !prev.fault) {
    const fault = {
      code: "CURTO",
      message: `Curto-circuito em ${spec.id} — proteção instantânea atuou`,
      t,
    };
    const next: MotorSim = {
      ...prev,
      running: false,
      energized: false,
      speed_rpm: 0,
      current_A: 0,
      fault,
    };
    ev = pushEvent(ev, { t, kind: "trip", ref: spec.id, message: fault.message });
    return { next, events: ev };
  }

  const wasRunning = prev.running;
  const running = energized && !prev.fault;
  const starts = running && !wasRunning ? prev.starts + 1 : prev.starts;

  // Velocidade: rampa exponencial p/ nominal; costa quando desenergizado.
  const speedTarget = running ? (faultInject === "phase" ? rated * 0.6 : rated) : 0;
  const tauSpeed = running ? 0.8 : 2.0;
  const speed = prev.speed_rpm + (speedTarget - prev.speed_rpm) * (1 - Math.exp(-dt / tauSpeed));

  // Corrente: pico de partida decaindo com a rampa; falta de fase / sobrecarga elevam.
  let current: number;
  if (!running) {
    current = prev.current_A * Math.exp(-dt / 0.15);
  } else {
    const slip = 1 - Math.min(1, speed / rated);
    current = In + (Istart - In) * slip;
    if (faultInject === "overload") current *= 2.2;
    if (faultInject === "phase") current = Math.max(current, In * 1.8);
  }

  // Térmica de 1ª ordem (tau acelerado p/ demo): Tss = Tamb + (I/In)² · rise.
  const rise = 60;
  const tss = ambient + Math.pow(current / In, 2) * rise;
  const tauTh = 25;
  const temp = prev.temp_C + (tss - prev.temp_C) * (1 - Math.exp(-dt / tauTh));

  // Proteção térmica.
  if (!prev.fault && temp > tripTemp) {
    const fault = {
      code: temp > tripTemp + 15 ? "SOBRETEMPERATURA" : "SOBRECARGA",
      message: `${spec.id} desligado por proteção térmica (${temp.toFixed(1)} °C)`,
      t,
    };
    const next: MotorSim = {
      running: false,
      energized: false,
      speed_rpm: 0,
      current_A: 0,
      temp_C: temp,
      starts,
      fault,
    };
    ev = pushEvent(ev, { t, kind: "trip", ref: spec.id, message: fault.message });
    return { next, events: ev };
  }

  return {
    next: {
      running,
      energized,
      speed_rpm: Math.max(0, speed),
      current_A: Math.max(0, current),
      temp_C: temp,
      starts,
      fault: prev.fault,
    },
    events: ev,
  };
}

export function stepPlant(prev: PlantState, inputs: PlantInputs, dtRaw: number): PlantState {
  const dt = Math.min(Math.max(dtRaw, 0), 0.5);
  const t = prev.t_s + dt;
  let events = prev.events;

  // ── Rung SISTEMA: START sela, STOP quebra, E-STOP trava até RESET ──
  let systemOn = prev.systemOn;
  let estopLatched = prev.estopLatched;
  if (inputs.estop && !prev.estopLatched) {
    estopLatched = true;
    systemOn = false;
    events = pushEvent(events, {
      t,
      kind: "estop",
      ref: "SISTEMA",
      message: "Parada de emergência acionada — comando desenergizado",
    });
  }
  if (inputs.reset && estopLatched && !inputs.estop) {
    estopLatched = false;
    events = pushEvent(events, {
      t,
      kind: "estop_reset",
      ref: "SISTEMA",
      message: "E-STOP resetado — sistema pronto para partida",
    });
  }
  if (!estopLatched) {
    if (inputs.start) systemOn = true;
    if (inputs.stop) systemOn = false;
  }
  if (systemOn !== prev.systemOn) {
    events = pushEvent(events, {
      t,
      kind: systemOn ? "system_on" : "system_off",
      ref: "SISTEMA",
      message: systemOn ? "Sistema ligado — barramento energizado" : "Sistema desligado",
    });
  }

  const busEnergized = systemOn && !estopLatched && !inputs.undervoltage;

  const motors: Record<string, MotorSim> = {};
  for (const spec of DEFAULT_MOTORS) {
    const mPrev = prev.motors[spec.id] ?? createPlant([spec]).motors[spec.id];
    const In =
      prev.motorIn_A[spec.id] ?? motorNominalCurrent({ id: spec.id, power_kW: spec.power_kW });
    const Istart = motorStartingCurrent({ id: spec.id, power_kW: spec.power_kW }, In);
    const cmd = inputs.motorCmd[spec.id] ?? true;
    const energized = busEnergized && cmd;
    const r = stepMotor(
      mPrev,
      In,
      Istart,
      spec,
      energized,
      inputs.faultInject[spec.id] ?? "none",
      inputs.ambientTemp_C,
      dt,
      t,
      events,
    );
    events = r.events;
    motors[spec.id] = r.next;
  }

  // ── Exaustores com histerese ──
  const exhaustors: Record<string, ExhaustorSim> = {};
  for (const id of ["EX01", "EX02"]) {
    const ePrev = prev.exhaustors[id] ?? { running: false, airflow_pct: 0 };
    const shouldRun =
      busEnergized &&
      (inputs.plantTemp_C > EXHAUST_ON_TEMP_C || inputs.smoke || inputs.exhaustDemand);
    const shouldStop =
      inputs.plantTemp_C < EXHAUST_OFF_TEMP_C && !inputs.smoke && !inputs.exhaustDemand;
    const running = shouldRun ? true : shouldStop ? false : busEnergized && ePrev.running;
    if (running !== ePrev.running) {
      events = pushEvent(events, {
        t,
        kind: running ? "exhaust_on" : "exhaust_off",
        ref: id,
        message: running ? `${id} ligado (ventilação)` : `${id} desligado`,
      });
    }
    const target = running ? 80 : 0;
    exhaustors[id] = {
      running,
      airflow_pct: ePrev.airflow_pct + (target - ePrev.airflow_pct) * (1 - Math.exp(-dt / 1.5)),
    };
  }

  const generalAlarm =
    estopLatched || inputs.smoke || Object.values(motors).some((m) => m.fault !== null);

  return {
    t_s: t,
    systemOn,
    estopLatched,
    bus_V: busEnergized ? 380 : 0,
    busEnergized,
    generalAlarm,
    motors,
    motorIn_A: prev.motorIn_A,
    exhaustors,
    events,
  };
}

/** Tags derivadas para SCADA/alarmes — mesmos nomes que as regras existentes. */
export function plantTags(plant: PlantState): Record<string, number | boolean> {
  const tags: Record<string, number | boolean> = {
    SISTEMA_ON: plant.systemOn,
    ESTOP: plant.estopLatched,
    BUS_V: plant.bus_V,
    ALARME_GERAL: plant.generalAlarm,
  };
  for (const [id, m] of Object.entries(plant.motors)) {
    tags[`${id}_RUN`] = m.running;
    tags[`${id}_CURRENT`] = Math.round(m.current_A * 10) / 10;
    tags[`${id}_SPEED`] = Math.round(m.speed_rpm);
    tags[`TEMP_${id}`] = Math.round(m.temp_C * 10) / 10;
    tags[`${id}_FAULT`] = m.fault !== null;
  }
  // Compat: regras legadas do sim-canvas usam M-01/M-03 e TEMP_M01.
  const m01 = plant.motors["M01"];
  if (m01) tags["TEMP_M01"] = Math.round(m01.temp_C * 10) / 10;
  const m03 = plant.motors["M03"];
  if (m03) tags["VIBRACAO_M03"] = m03.fault ? 9 : Math.round((m03.speed_rpm / 1750) * 3 * 10) / 10;
  for (const [id, e] of Object.entries(plant.exhaustors)) {
    tags[`${id}_RUN`] = e.running;
    tags[`${id}_FLOW`] = Math.round(e.airflow_pct);
  }
  return tags;
}
