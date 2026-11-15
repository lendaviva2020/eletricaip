// Motor de proteção e acionamento de motores (CCM supervisório) — PURO e determinístico.
//
// Sem I/O, sem Date.now/Math.random: o relógio avança apenas pelo `dt` recebido.
// Alimenta o CCM supervisório com valores SIMULADOS — nunca apresentar como
// medição de campo (selo SIMULAÇÃO obrigatório na UI, AGENTS.md §11.1).
//
// Modelo físico (documentado e testado):
//  • Dinâmica de velocidade de 1ª ordem com τ = t_aceleração/3 (≈95 % em t_acc).
//  • Corrente: I = I_carga + (I_partida − I_carga)·escorregamento.
//    I_carga = In·(0,35 + 0,65·fator_de_carga) — 35 % ≈ corrente em vazio.
//  • Relé térmico com memória térmica (IEC 60947-4-1):
//      dθ/dt = ((I/Ir)² − θ)/τ ;  disparo em θ ≥ 1,15² (entre 1,05·Ir não-disparo
//      e 1,20·Ir disparo da norma). τ calibrado pela CLASSE: a 7,2·Ir, partindo
//      a frio, o disparo ocorre exatamente no tempo da classe (10/20/30 s).
//  • Disparo magnético do disjuntor (curva B/C/D = 5/10/20·In_disj): instantâneo.
//  • Falta de fase: corrente nas fases sãs ≈ √3·I_carga; relé diferencial dispara em 1,5 s.
//  • Monitor de rotação: sem atingir 20 % da rotação nominal em t_acc·2 (mín. 3 s)
//    ou queda abaixo de 70 % por 2 s em regime → FALHA DE ROTAÇÃO (rotor bloqueado).
//  • Discriminação de sensor: encoder em 0 rpm com corrente de regime normal
//    (< 1,5·In) indica falha do SENSOR, não do motor (rotor bloqueado puxa ≥ 3·In).
//  • PT100: leitura fora de [−200, 850] °C (aberto/curto) → FALHA DE SENSOR (fail-safe).
//  • Enrolamento: T = T_amb + 80 K·θ (elevação classe B); alarme 130 °C, disparo 155 °C (classe F).
//  • Subtensão (< 85 % Un): contator cai e trava — sem religamento automático (NR-12 §12.4.3).

export type MotorRunState = "STOPPED" | "STARTING" | "RUNNING" | "STOPPING" | "TRIPPED";

export type MotorFaultCode =
  | "OVERLOAD"
  | "SHORT_CIRCUIT"
  | "PHASE_LOSS"
  | "ROTATION_FAILURE"
  | "SENSOR_FAILURE"
  | "UNDERVOLTAGE"
  | "OVERTEMPERATURE"
  | "EMERGENCY_STOP";

export type InjectedMotorFault =
  | "none"
  | "overload"
  | "short_circuit"
  | "phase_loss"
  | "locked_rotor"
  | "sensor_temp"
  | "sensor_speed";

export type MotorWarningCode = "HIGH_CURRENT" | "HIGH_TEMPERATURE" | "THERMAL_PREALARM";

export type MotorStartMethod = "DOL" | "SOFT" | "VFD" | "STAR_DELTA";
export type BreakerCurve = "B" | "C" | "D";
export type ThermalTripClass = 10 | 20 | 30;

export interface MotorDriveConfig {
  id: string;
  tag: string;
  label: string;
  power_kW: number;
  voltage_V: number;
  /** Corrente nominal (placa) em A. */
  In_A: number;
  startMethod: MotorStartMethod;
  ratedRpm: number;
  /** Fator de carga mecânica 0..1.2 (1 = carga nominal). */
  loadFactor: number;
  /** Ajuste do relé térmico (Ir) em A e classe de disparo. */
  thermalSetting_A: number;
  thermalClass: ThermalTripClass;
  /** Corrente nominal do disjuntor-motor e curva (define o disparo magnético). */
  breakerIn_A: number;
  breakerCurve: BreakerCurve;
  /** Corrente de curto presumida no ponto (A) — usada quando há falta injetada. */
  prospectiveIk_A: number;
  ambient_C: number;
}

export interface MotorFault {
  code: MotorFaultCode;
  message: string;
  t: number;
  /** Valor medido no instante do disparo (A, rpm ou °C conforme o código). */
  value?: number;
}

export interface MotorDriveState {
  runState: MotorRunState;
  /** Contator K fechado (bobina energizada). */
  contactorClosed: boolean;
  /** Disjuntor do ramal fechado (abre por disparo magnético). */
  breakerClosed: boolean;
  speed_rpm: number;
  current_A: number;
  /** Memória térmica do relé (θ, adimensional; 1 = regime em Ir). */
  thermalTheta: number;
  winding_C: number;
  /** Leituras dos sensores (podem divergir do físico em falha de sensor). */
  sensorTemp_C: number;
  sensorSpeed_rpm: number;
  /** Tempo desde o comando de partida (s). */
  sinceStart_s: number;
  /** Tempo acumulado de condição anômala (falta de fase / subvelocidade) (s). */
  anomalyTimer_s: number;
  underspeedTimer_s: number;
  starts: number;
  runSeconds: number;
  fault: MotorFault | null;
  warnings: MotorWarningCode[];
}

export interface MotorStepInputs {
  /** Comando de operação (selo do CLP): true = marcha. */
  commandRun: boolean;
  /** Alimentador com tensão (topologia do unifilar + disjuntor geral fechado). */
  feederEnergized: boolean;
  /** Tensão de barramento em V (fase-fase). */
  busVoltage_V: number;
  emergencyStop: boolean;
  injected: InjectedMotorFault;
}

export interface MotorEvent {
  t: number;
  motorId: string;
  kind: "start" | "stop" | "running" | "stopped" | "trip" | "reset" | "start_rejected";
  message: string;
}

// ── Constantes normativas ─────────────────────────────────────────────────────
/** θ de disparo: (1,15)² — entre não-disparo 1,05·Ir e disparo 1,20·Ir (IEC 60947-4-1 Tab. 3). */
export const THERMAL_TRIP_THETA = 1.15 * 1.15;
/** θ máximo para rearme do relé térmico (resfriamento). */
export const THERMAL_RESET_THETA = 0.7;
export const MAGNETIC_MULTIPLE: Record<BreakerCurve, number> = { B: 5, C: 10, D: 20 };
export const PHASE_LOSS_TRIP_S = 1.5;
export const UNDERSPEED_TRIP_S = 2;
export const UNDERVOLTAGE_PU = 0.85;
export const WINDING_RISE_K = 80;
export const WINDING_ALARM_C = 130;
export const WINDING_TRIP_C = 155;
export const PT100_MIN_C = -200;
export const PT100_MAX_C = 850;
const MAX_DT_S = 0.5;

/** Fator de corrente de partida por método (múltiplo de In). */
export function startCurrentFactor(method: MotorStartMethod): number {
  switch (method) {
    case "VFD":
      return 1.1;
    case "SOFT":
      return 3.5;
    case "STAR_DELTA":
      return 7 / 3; // corrente em estrela = 1/3 da partida direta
    default:
      return 7;
  }
}

/** Tempo típico de aceleração (s) por método. */
export function accelerationTime_s(method: MotorStartMethod): number {
  switch (method) {
    case "VFD":
      return 5;
    case "SOFT":
      return 6;
    case "STAR_DELTA":
      return 5;
    default:
      return 1.5;
  }
}

/**
 * Constante térmica τ do relé calibrada pela classe: partindo a frio (θ=0) a
 * 7,2·Ir, θ(t)=7,2²·(1−e^(−t/τ)) atinge THERMAL_TRIP_THETA em t = classe.
 */
export function thermalTau_s(tripClass: ThermalTripClass): number {
  const i2 = 7.2 * 7.2;
  return -tripClass / Math.log(1 - THERMAL_TRIP_THETA / i2);
}

/** Tempo de disparo térmico a frio (s) para corrente I/Ir; Infinity se não dispara. */
export function thermalTripTime_s(multipleOfIr: number, tripClass: ThermalTripClass): number {
  const i2 = multipleOfIr * multipleOfIr;
  if (i2 <= THERMAL_TRIP_THETA) return Number.POSITIVE_INFINITY;
  return -thermalTau_s(tripClass) * Math.log(1 - THERMAL_TRIP_THETA / i2);
}

export function magneticTrip_A(
  cfg: Pick<MotorDriveConfig, "breakerIn_A" | "breakerCurve">,
): number {
  return cfg.breakerIn_A * MAGNETIC_MULTIPLE[cfg.breakerCurve];
}

export function createMotorDriveState(cfg: MotorDriveConfig): MotorDriveState {
  return {
    runState: "STOPPED",
    contactorClosed: false,
    breakerClosed: true,
    speed_rpm: 0,
    current_A: 0,
    thermalTheta: 0,
    winding_C: cfg.ambient_C,
    sensorTemp_C: cfg.ambient_C,
    sensorSpeed_rpm: 0,
    sinceStart_s: 0,
    anomalyTimer_s: 0,
    underspeedTimer_s: 0,
    starts: 0,
    runSeconds: 0,
    fault: null,
    warnings: [],
  };
}

export interface StartPermissive {
  allowed: boolean;
  reason?: string;
}

/** Intertravamentos de partida (consultados pela UI antes de comandar). */
export function startPermissive(
  state: MotorDriveState,
  inputs: Pick<MotorStepInputs, "feederEnergized" | "busVoltage_V" | "emergencyStop">,
  cfg: MotorDriveConfig,
): StartPermissive {
  if (inputs.emergencyStop) return { allowed: false, reason: "Parada de emergência atuada" };
  if (state.fault) return { allowed: false, reason: `Falha ativa: ${state.fault.message}` };
  if (!state.breakerClosed) return { allowed: false, reason: "Disjuntor do ramal aberto" };
  if (!inputs.feederEnergized) return { allowed: false, reason: "Alimentador desenergizado" };
  if (inputs.busVoltage_V < cfg.voltage_V * UNDERVOLTAGE_PU) {
    return { allowed: false, reason: "Subtensão no barramento" };
  }
  if (state.thermalTheta >= THERMAL_RESET_THETA && state.runState === "STOPPED") {
    return { allowed: false, reason: "Relé térmico aquecido — aguarde resfriamento" };
  }
  return { allowed: true };
}

/** Rearme (RESET) — só se a causa foi removida. Nunca religa o motor. */
export function resetMotorFault(
  state: MotorDriveState,
  cfg: MotorDriveConfig,
  injected: InjectedMotorFault,
  t: number,
): { state: MotorDriveState; event: MotorEvent | null; ok: boolean; reason?: string } {
  if (!state.fault) return { state, event: null, ok: true };
  if (injected !== "none") {
    return { state, event: null, ok: false, reason: "Causa da falha ainda presente" };
  }
  if (state.thermalTheta > THERMAL_RESET_THETA) {
    return {
      state,
      event: null,
      ok: false,
      reason: `Relé térmico em resfriamento (${Math.round((state.thermalTheta / THERMAL_TRIP_THETA) * 100)} %)`,
    };
  }
  if (state.winding_C >= WINDING_ALARM_C) {
    return { state, event: null, ok: false, reason: "Enrolamento acima de 130 °C" };
  }
  return {
    ok: true,
    state: {
      ...state,
      fault: null,
      // Rearme NÃO religa: motor ainda girando por inércia segue em desaceleração.
      runState: state.speed_rpm > cfg.ratedRpm * 0.01 ? "STOPPING" : "STOPPED",
      breakerClosed: true,
      contactorClosed: false,
      anomalyTimer_s: 0,
      underspeedTimer_s: 0,
      sinceStart_s: 0,
      sensorTemp_C: state.winding_C,
      sensorSpeed_rpm: state.speed_rpm,
    },
    event: { t, motorId: cfg.id, kind: "reset", message: `${cfg.tag} — proteção rearmada` },
  };
}

const FAULT_TEXT: Record<MotorFaultCode, string> = {
  OVERLOAD: "Sobrecorrente — relé térmico atuou",
  SHORT_CIRCUIT: "Curto-circuito — disparo magnético do disjuntor",
  PHASE_LOSS: "Falta de fase — relé de proteção atuou",
  ROTATION_FAILURE: "Falha de rotação — rotor bloqueado/subvelocidade",
  SENSOR_FAILURE: "Falha de sensor",
  UNDERVOLTAGE: "Subtensão — contator desligou (sem religamento automático)",
  OVERTEMPERATURE: "Sobretemperatura do enrolamento (PT100)",
  EMERGENCY_STOP: "Parada de emergência",
};

export function faultLabel(code: MotorFaultCode): string {
  return FAULT_TEXT[code];
}

function trip(
  s: MotorDriveState,
  cfg: MotorDriveConfig,
  code: MotorFaultCode,
  t: number,
  value: number | undefined,
  detail: string | undefined,
  openBreaker: boolean,
): { state: MotorDriveState; event: MotorEvent } {
  const message = `${cfg.tag} — ${FAULT_TEXT[code]}${detail ? ` (${detail})` : ""}`;
  return {
    state: {
      ...s,
      runState: "TRIPPED",
      contactorClosed: false,
      breakerClosed: openBreaker ? false : s.breakerClosed,
      fault: { code, message, t, value },
    },
    event: { t, motorId: cfg.id, kind: "trip", message },
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Avança um motor `dt` segundos. Retorna novo estado + eventos gerados.
 * `t` é o tempo absoluto da simulação após o passo (usado só para carimbo).
 */
export function stepMotorDrive(
  prev: MotorDriveState,
  cfg: MotorDriveConfig,
  inputs: MotorStepInputs,
  dtRaw: number,
  t: number,
): { state: MotorDriveState; events: MotorEvent[] } {
  const dt = Number.isFinite(dtRaw) ? Math.min(Math.max(dtRaw, 0), MAX_DT_S) : 0;
  const events: MotorEvent[] = [];
  let s: MotorDriveState = { ...prev, warnings: [] };
  const In = Math.max(cfg.In_A, 0.01);
  const Ir = Math.max(cfg.thermalSetting_A, 0.01);
  const rated = Math.max(cfg.ratedRpm, 1);
  const tAcc = accelerationTime_s(cfg.startMethod);
  const undervoltage = inputs.busVoltage_V < cfg.voltage_V * UNDERVOLTAGE_PU;
  const supplied = inputs.feederEnergized && s.breakerClosed && !undervoltage;

  // ── 1. Lógica de comando (selo) ────────────────────────────────────────────
  const wantRun = inputs.commandRun && !inputs.emergencyStop && !s.fault;
  if (inputs.emergencyStop && s.contactorClosed) {
    s = { ...s, contactorClosed: false, runState: "STOPPING" };
    events.push({ t, motorId: cfg.id, kind: "stop", message: `${cfg.tag} — parada por E-STOP` });
  }
  if (wantRun && !s.contactorClosed && s.runState !== "TRIPPED") {
    if (supplied) {
      s = {
        ...s,
        contactorClosed: true,
        runState: "STARTING",
        sinceStart_s: 0,
        starts: s.starts + 1,
      };
      s.anomalyTimer_s = 0;
      s.underspeedTimer_s = 0;
      events.push({
        t,
        motorId: cfg.id,
        kind: "start",
        message: `${cfg.tag} — partida (${cfg.startMethod})`,
      });
    }
    // Sem alimentação o comando permanece pendente; a UI consulta startPermissive()
    // antes de comandar e informa o motivo da rejeição ao operador.
  }
  if (!inputs.commandRun && s.contactorClosed) {
    s = { ...s, contactorClosed: false, runState: "STOPPING" };
    events.push({ t, motorId: cfg.id, kind: "stop", message: `${cfg.tag} — comando de parada` });
  }
  // Subtensão com motor em marcha: contator cai e TRAVA (anti-religamento).
  if (s.contactorClosed && undervoltage && !s.fault) {
    const r = trip(
      s,
      cfg,
      "UNDERVOLTAGE",
      t,
      inputs.busVoltage_V,
      `${Math.round(inputs.busVoltage_V)} V`,
      false,
    );
    s = { ...r.state, runState: "TRIPPED" };
    events.push(r.event);
  }
  // Perda do alimentador (disjuntor a montante aberto no unifilar): motor para por inércia.
  if (s.contactorClosed && !inputs.feederEnergized) {
    s = { ...s, contactorClosed: false, runState: "STOPPING" };
    events.push({
      t,
      motorId: cfg.id,
      kind: "stop",
      message: `${cfg.tag} — alimentador desenergizado`,
    });
  }

  const energized = s.contactorClosed && supplied;
  if (energized) s.sinceStart_s += dt;

  // ── 2. Curto-circuito: disparo magnético instantâneo ───────────────────────
  if (energized && inputs.injected === "short_circuit") {
    const Ik = Math.max(cfg.prospectiveIk_A, 0);
    if (Ik >= magneticTrip_A(cfg)) {
      const r = trip(
        { ...s, current_A: Ik, speed_rpm: s.speed_rpm },
        cfg,
        "SHORT_CIRCUIT",
        t,
        Ik,
        `${(Ik / 1000).toFixed(2)} kA ≥ Im ${Math.round(magneticTrip_A(cfg))} A`,
        true,
      );
      events.push(r.event);
      s = { ...r.state, current_A: 0 };
      return finalize(s, cfg, dt, t, events);
    }
  }

  // ── 3. Dinâmica mecânica ───────────────────────────────────────────────────
  const lockedRotor = inputs.injected === "locked_rotor";
  const phaseLoss = inputs.injected === "phase_loss";
  let speedTarget = 0;
  if (energized && !lockedRotor) {
    // Falta de fase durante a partida: sem conjugado de partida (motor não gira).
    if (phaseLoss && s.speed_rpm < rated * 0.2) speedTarget = s.speed_rpm;
    else speedTarget = phaseLoss ? rated * 0.93 : rated * (1 - 0.03 * cfg.loadFactor);
  }
  const tauSpeed = energized ? tAcc / 3 : 3;
  const speed = s.speed_rpm + (speedTarget - s.speed_rpm) * (1 - Math.exp(-dt / tauSpeed));
  s.speed_rpm = Math.max(0, lockedRotor && energized ? 0 : speed);

  // ── 4. Corrente ────────────────────────────────────────────────────────────
  const Iload = In * (0.35 + 0.65 * Math.min(Math.max(cfg.loadFactor, 0), 1.5));
  const Istart = In * startCurrentFactor(cfg.startMethod);
  if (energized) {
    // "Escorregamento" relativo ao ponto de operação (não à síncrona): em regime a
    // corrente deve ser a de carga, não somar a parcela de partida.
    const slip = speedTarget > 0 ? 1 - Math.min(1, s.speed_rpm / speedTarget) : 1;
    let I = Iload + Math.max(0, Istart - Iload) * slip;
    if (inputs.injected === "overload") I = Math.max(I, In * 3);
    if (phaseLoss) I = Math.max(I, Iload * Math.sqrt(3)); // fases sãs assumem √3·I_carga
    s.current_A = I;
  } else {
    s.current_A = 0; // contator aberto: corrente cessa no ciclo
  }

  // ── 5. Relé térmico com memória (IEC 60947-4-1) ────────────────────────────
  const tau = thermalTau_s(cfg.thermalClass);
  const ratio = s.current_A / Ir;
  // Resfriamento parado é ~4× mais lento (ventilação própria cessa).
  const tauEff = s.current_A > 0 ? tau : tau * 4;
  s.thermalTheta += (ratio * ratio - s.thermalTheta) * (1 - Math.exp(-dt / tauEff));
  s.winding_C = cfg.ambient_C + WINDING_RISE_K * s.thermalTheta;

  // ── 6. Sensores (com falhas injetáveis) ────────────────────────────────────
  s.sensorTemp_C = inputs.injected === "sensor_temp" ? Number.NaN : s.winding_C;
  s.sensorSpeed_rpm = inputs.injected === "sensor_speed" ? 0 : s.speed_rpm;

  // ── 7. Proteções (ordem: sensor → térmica → fase → rotação → temperatura) ─
  if (!s.fault && energized) {
    const tempReading = s.sensorTemp_C;
    if (!Number.isFinite(tempReading) || tempReading < PT100_MIN_C || tempReading > PT100_MAX_C) {
      const r = trip(s, cfg, "SENSOR_FAILURE", t, undefined, "PT100 aberto/fora de faixa", false);
      events.push(r.event);
      s = r.state;
    }
  }
  if (!s.fault && s.thermalTheta >= THERMAL_TRIP_THETA) {
    const r = trip(
      s,
      cfg,
      "OVERLOAD",
      t,
      r1(s.current_A),
      `${r1(s.current_A)} A / Ir ${r1(Ir)} A`,
      false,
    );
    events.push(r.event);
    s = r.state;
  }
  if (!s.fault && energized && phaseLoss) {
    s.anomalyTimer_s += dt;
    if (s.anomalyTimer_s >= PHASE_LOSS_TRIP_S) {
      const r = trip(s, cfg, "PHASE_LOSS", t, r1(s.current_A), undefined, false);
      events.push(r.event);
      s = r.state;
    }
  } else if (!phaseLoss) {
    s.anomalyTimer_s = 0;
  }
  if (!s.fault && energized) {
    const startWindow = Math.max(3, tAcc * 2);
    const reading = s.sensorSpeed_rpm;
    const currentLooksNormal = s.current_A < In * 1.5;
    if (s.runState === "STARTING" && s.sinceStart_s >= startWindow && reading < rated * 0.2) {
      if (currentLooksNormal) {
        const r = trip(
          s,
          cfg,
          "SENSOR_FAILURE",
          t,
          reading,
          "encoder sem pulsos com corrente normal",
          false,
        );
        events.push(r.event);
        s = r.state;
      } else {
        const r = trip(
          s,
          cfg,
          "ROTATION_FAILURE",
          t,
          r1(reading),
          `${Math.round(reading)} rpm em ${startWindow.toFixed(1)} s`,
          false,
        );
        events.push(r.event);
        s = r.state;
      }
    } else if (s.runState === "RUNNING") {
      if (reading < rated * 0.7) s.underspeedTimer_s += dt;
      else s.underspeedTimer_s = 0;
      if (s.underspeedTimer_s >= UNDERSPEED_TRIP_S) {
        const code: MotorFaultCode = currentLooksNormal ? "SENSOR_FAILURE" : "ROTATION_FAILURE";
        const detail = currentLooksNormal
          ? "encoder sem pulsos com corrente normal"
          : `${Math.round(reading)} rpm`;
        const r = trip(s, cfg, code, t, r1(reading), detail, false);
        events.push(r.event);
        s = r.state;
      }
    }
  }
  if (!s.fault && Number.isFinite(s.sensorTemp_C) && s.sensorTemp_C >= WINDING_TRIP_C) {
    const r = trip(
      s,
      cfg,
      "OVERTEMPERATURE",
      t,
      r1(s.sensorTemp_C),
      `${r1(s.sensorTemp_C)} °C`,
      false,
    );
    events.push(r.event);
    s = r.state;
  }
  if (s.fault && s.current_A > 0 && !s.contactorClosed) s.current_A = 0;

  return finalize(s, cfg, dt, t, events);
}

function finalize(
  s0: MotorDriveState,
  cfg: MotorDriveConfig,
  dt: number,
  t: number,
  events: MotorEvent[],
): { state: MotorDriveState; events: MotorEvent[] } {
  const s = { ...s0 };
  const rated = Math.max(cfg.ratedRpm, 1);
  // Transições de estado derivadas da física.
  if (!s.fault) {
    if (s.contactorClosed && s.runState === "STARTING" && s.speed_rpm >= rated * 0.9) {
      s.runState = "RUNNING";
      events.push({ t, motorId: cfg.id, kind: "running", message: `${cfg.tag} — em regime` });
    }
    if (!s.contactorClosed && s.runState === "STOPPING" && s.speed_rpm < rated * 0.01) {
      s.runState = "STOPPED";
      s.speed_rpm = 0;
      events.push({ t, motorId: cfg.id, kind: "stopped", message: `${cfg.tag} — parado` });
    }
    if (!s.contactorClosed && (s.runState === "RUNNING" || s.runState === "STARTING")) {
      s.runState = "STOPPING";
    }
  } else if (s.speed_rpm < rated * 0.01) {
    s.speed_rpm = 0;
  }
  if (s.contactorClosed) s.runSeconds += dt;

  const warnings: MotorWarningCode[] = [];
  if (s.runState === "RUNNING" && s.current_A > cfg.In_A * 1.05) warnings.push("HIGH_CURRENT");
  if (Number.isFinite(s.sensorTemp_C) && s.sensorTemp_C >= WINDING_ALARM_C)
    warnings.push("HIGH_TEMPERATURE");
  if (s.thermalTheta >= THERMAL_TRIP_THETA * 0.85 && !s.fault) warnings.push("THERMAL_PREALARM");
  s.warnings = warnings;
  return { state: s, events };
}
