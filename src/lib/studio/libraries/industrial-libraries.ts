/**
 * ElétricAi Industrial OS — Original Industrial Libraries
 * 12 Bibliotecas Industriais com Contratos Formais, POUs e Algoritmos de Engenharia
 * 
 * Regra de Segurança Inegociável:
 * IS_PHYSICAL_CONTROL_ALLOWED = false
 */

import { LibraryPackage, LibraryRegistry } from "./library-manager";

export const IS_PHYSICAL_CONTROL_ALLOWED: false = false;

// ============================================================================
// 1. Biblioteca: ElectricalProtection (ANSI 50, 51, 50N, 51N, 27, 59, 81U, 81O)
// ============================================================================

export class FB_Overcurrent50_51 {
  public static execute(
    currentRMS: number,
    pickupCurrent: number,
    timeDial: number,
    curveType: "STANDARD_INVERSE" | "VERY_INVERSE" | "EXTREMELY_INVERSE",
    instPickupCurrent: number,
    cycleTimeSec: number,
    internalAccumulator: number
  ): { trip50: boolean; trip51: boolean; accumulator: number; timeToTripSec: number } {
    // ANSI 50: Instantâneo
    const trip50 = currentRMS >= instPickupCurrent;

    // ANSI 51: Temporizado (Curvas IEC 60255)
    // t = TimeDial * (A / ((I / Ipickup)^B - 1))
    let A = 0.14;
    let B = 0.02;

    if (curveType === "VERY_INVERSE") {
      A = 13.5;
      B = 1.0;
    } else if (curveType === "EXTREMELY_INVERSE") {
      A = 80.0;
      B = 2.0;
    }

    let trip51 = false;
    let timeToTripSec = 9999;
    let accumulator = internalAccumulator;

    if (currentRMS > pickupCurrent) {
      const M = currentRMS / pickupCurrent;
      timeToTripSec = timeDial * (A / (Math.pow(M, B) - 1));
      if (timeToTripSec < 0.02) timeToTripSec = 0.02;

      // Integração no tempo
      accumulator += cycleTimeSec / timeToTripSec;
      if (accumulator >= 1.0) {
        trip51 = true;
        accumulator = 1.0;
      }
    } else {
      // Reset da curva térmica
      accumulator = Math.max(0, accumulator - cycleTimeSec * 2.0);
    }

    return { trip50, trip51, accumulator, timeToTripSec };
  }
}

export class FB_VoltageProtection27_59 {
  public static execute(
    voltageRMS: number,
    nominalVoltage: number,
    undervoltageThresholdPct: number, // Ex: 80%
    overvoltageThresholdPct: number,  // Ex: 110%
    undervoltageDelaySec: number,
    overvoltageDelaySec: number,
    cycleTimeSec: number,
    uvTimerAcc: number,
    ovTimerAcc: number
  ): { trip27: boolean; trip59: boolean; newUvAcc: number; newOvAcc: number } {
    const vPct = (voltageRMS / nominalVoltage) * 100;
    let newUvAcc = uvTimerAcc;
    let newOvAcc = ovTimerAcc;
    let trip27 = false;
    let trip59 = false;

    // ANSI 27 Subtensão
    if (vPct < undervoltageThresholdPct) {
      newUvAcc += cycleTimeSec;
      if (newUvAcc >= undervoltageDelaySec) {
        trip27 = true;
      }
    } else {
      newUvAcc = 0;
    }

    // ANSI 59 Sobretensão
    if (vPct > overvoltageThresholdPct) {
      newOvAcc += cycleTimeSec;
      if (newOvAcc >= overvoltageDelaySec) {
        trip59 = true;
      }
    } else {
      newOvAcc = 0;
    }

    return { trip27, trip59, newUvAcc, newOvAcc };
  }
}

// ============================================================================
// 2. Biblioteca: Transformers (OLTC e Modelo Térmico IEC 60076-7)
// ============================================================================

export class FB_TransformerThermalModel {
  public static execute(
    ambientTempC: number,
    loadCurrentPct: number, // 0 - 150% da corrente nominal
    topOilTimeConstantHours: number = 3.0,
    windingTimeConstantMinutes: number = 6.0,
    cycleTimeSec: number = 1.0,
    prevTopOilTemp: number = 40.0,
    prevHotSpotTemp: number = 55.0
  ): { topOilTempC: number; hotSpotTempC: number; thermalAgingFactor: number; alarmOverheat: boolean } {
    const loadRatio = loadCurrentPct / 100.0;
    // Elevação de regime permanente do óleo no topo (IEC 60076-7)
    const steadyStateOilRise = 45.0 * Math.pow((1 + 5 * Math.pow(loadRatio, 2)) / 6, 0.8);
    const targetTopOil = ambientTempC + steadyStateOilRise;

    const dtHours = cycleTimeSec / 3600.0;
    const topOilTempC = prevTopOilTemp + (targetTopOil - prevTopOilTemp) * (dtHours / topOilTimeConstantHours);

    // Gradiente do enrolamento ao óleo
    const windingGradient = 23.0 * Math.pow(loadRatio, 1.6);
    const targetHotSpot = topOilTempC + windingGradient;

    const dtMin = cycleTimeSec / 60.0;
    const hotSpotTempC = prevHotSpotTemp + (targetHotSpot - prevHotSpotTemp) * (dtMin / windingTimeConstantMinutes);

    // Fator de envelhecimento relativo (Arrhenius: V = 2^((HotSpot - 98) / 6))
    const thermalAgingFactor = Math.pow(2, (hotSpotTempC - 98.0) / 6.0);
    const alarmOverheat = hotSpotTempC > 118.0; // Alarme de alta temperatura crítica

    return { topOilTempC, hotSpotTempC, thermalAgingFactor, alarmOverheat };
  }
}

export class FB_OLTCTapChanger {
  public static execute(
    measuredVoltage: number,
    targetVoltage: number,
    deadbandPct: number = 1.5,
    timerDelaySec: number = 10.0,
    cycleTimeSec: number = 0.1,
    currentTap: number = 0,
    minTap: number = -16,
    maxTap: number = 16,
    accumulatedTimer: number = 0
  ): { newTap: number; raisePulse: boolean; lowerPulse: boolean; newTimer: number; inDeadband: boolean } {
    const errorPct = ((measuredVoltage - targetVoltage) / targetVoltage) * 100;
    let raisePulse = false;
    let lowerPulse = false;
    let newTap = currentTap;
    let newTimer = accumulatedTimer;
    const inDeadband = Math.abs(errorPct) <= deadbandPct;

    if (inDeadband) {
      newTimer = 0;
    } else {
      newTimer += cycleTimeSec;
      if (newTimer >= timerDelaySec) {
        newTimer = 0;
        if (errorPct < -deadbandPct && currentTap < maxTap) {
          // Tensão baixa -> Subir tap
          raisePulse = true;
          newTap++;
        } else if (errorPct > deadbandPct && currentTap > minTap) {
          // Tensão alta -> Descer tap
          lowerPulse = true;
          newTap--;
        }
      }
    }

    return { newTap, raisePulse, lowerPulse, newTimer, inDeadband };
  }
}

// ============================================================================
// 3. Biblioteca: MotorStarters (DOL, Estrela-Triângulo, Soft-Starter)
// ============================================================================

export class FB_DOLStarter {
  public static execute(
    cmdStart: boolean,
    cmdStop: boolean,
    contactorFeedback: boolean,
    overloadRelayTripped: boolean,
    eStopHealthy: boolean,
    feedbackTimeoutSec: number = 1.5,
    cycleTimeSec: number = 0.05,
    timerDiscrepancy: number = 0,
    currentMotorRun: boolean = false
  ): { motorRun: boolean; faultTrip: boolean; newTimer: number } {
    let motorRun = currentMotorRun;
    let faultTrip = false;
    let newTimer = timerDiscrepancy;

    if (!eStopHealthy || overloadRelayTripped || cmdStop) {
      motorRun = false;
    } else if (cmdStart) {
      motorRun = true;
    }

    // Supervisão de discrepância de contator
    if (motorRun !== contactorFeedback) {
      newTimer += cycleTimeSec;
      if (newTimer >= feedbackTimeoutSec) {
        faultTrip = true;
        motorRun = false;
      }
    } else {
      newTimer = 0;
    }

    return { motorRun, faultTrip, newTimer };
  }
}

export class FB_StarDeltaStarter {
  public static execute(
    cmdStart: boolean,
    cmdStop: boolean,
    overloadTripped: boolean,
    starTimeSec: number = 5.0,
    transitionDwellSec: number = 0.05, // 50ms para evitar curto fase-fase
    cycleTimeSec: number = 0.01,
    state: "OFF" | "STAR" | "DWELL" | "DELTA" = "OFF",
    timerAcc: number = 0
  ): { mainContactor: boolean; starContactor: boolean; deltaContactor: boolean; newState: "OFF" | "STAR" | "DWELL" | "DELTA"; newTimer: number } {
    if (cmdStop || overloadTripped) {
      return { mainContactor: false, starContactor: false, deltaContactor: false, newState: "OFF", newTimer: 0 };
    }

    let newState = state;
    let newTimer = timerAcc;

    switch (state) {
      case "OFF":
        if (cmdStart) {
          newState = "STAR";
          newTimer = 0;
        }
        break;
      case "STAR":
        newTimer += cycleTimeSec;
        if (newTimer >= starTimeSec) {
          newState = "DWELL";
          newTimer = 0;
        }
        break;
      case "DWELL":
        newTimer += cycleTimeSec;
        if (newTimer >= transitionDwellSec) {
          newState = "DELTA";
          newTimer = 0;
        }
        break;
      case "DELTA":
        // Permanece operando em regime
        break;
    }

    const mainContactor = newState !== "OFF";
    const starContactor = newState === "STAR";
    const deltaContactor = newState === "DELTA";

    return { mainContactor, starContactor, deltaContactor, newState, newTimer };
  }
}

// ============================================================================
// 4. Biblioteca: VFDControl (Inversores de Frequência e Rampas)
// ============================================================================

export class FB_VFDControl {
  public static execute(
    enable: boolean,
    speedSetpointHz: number,
    accelRateHzPerSec: number = 10.0,
    decelRateHzPerSec: number = 15.0,
    maxFreqHz: number = 60.0,
    minFreqHz: number = 0.0,
    cycleTimeSec: number = 0.01,
    currentOutputHz: number = 0.0
  ): { outputHz: number; controlWord: number; atSpeed: boolean } {
    if (!enable) {
      return { outputHz: 0.0, controlWord: 0x0000, atSpeed: false };
    }

    const clampedTarget = Math.max(minFreqHz, Math.min(maxFreqHz, speedSetpointHz));
    let outputHz = currentOutputHz;

    if (outputHz < clampedTarget) {
      outputHz = Math.min(clampedTarget, outputHz + accelRateHzPerSec * cycleTimeSec);
    } else if (outputHz > clampedTarget) {
      outputHz = Math.max(clampedTarget, outputHz - decelRateHzPerSec * cycleTimeSec);
    }

    const atSpeed = Math.abs(outputHz - clampedTarget) < 0.1;
    // Exemplo de Control Word CANopen/Profidrive padrão
    const controlWord = enable ? (atSpeed ? 0x047F : 0x047E) : 0x0470;

    return { outputHz, controlWord, atSpeed };
  }
}

// ============================================================================
// 5. Biblioteca: PumpsAndPiping (Alternância e Proteção Anti-Cavitação)
// ============================================================================

export class FB_DuplexPumpAlternation {
  public static execute(
    demandStages: 0 | 1 | 2,
    pump1Available: boolean,
    pump2Available: boolean,
    hoursPump1: number,
    hoursPump2: number,
    leadPumpPreference: 1 | 2
  ): { runPump1: boolean; runPump2: boolean; activeLeadPump: 1 | 2 } {
    let lead: 1 | 2 = leadPumpPreference;

    // Seleção de lead pelo menor horímetro se ambos estiverem disponíveis
    if (pump1Available && pump2Available) {
      lead = hoursPump1 <= hoursPump2 ? 1 : 2;
    } else if (pump1Available) {
      lead = 1;
    } else if (pump2Available) {
      lead = 2;
    }

    let runPump1 = false;
    let runPump2 = false;

    if (demandStages === 1) {
      if (lead === 1 && pump1Available) runPump1 = true;
      else if (lead === 2 && pump2Available) runPump2 = true;
      else if (pump1Available) runPump1 = true;
      else if (pump2Available) runPump2 = true;
    } else if (demandStages === 2) {
      if (pump1Available) runPump1 = true;
      if (pump2Available) runPump2 = true;
    }

    return { runPump1, runPump2, activeLeadPump: lead };
  }
}

export class FB_PumpCavitationProtection {
  public static execute(
    suctionPressureBar: number,
    vaporPressureBar: number,
    liquidDensityKgM3: number = 1000,
    suctionVelocityMS: number = 1.5,
    npshRequiredM: number = 2.5
  ): { npshAvailableM: number; cavitationRisk: boolean; interlockTrip: boolean } {
    const g = 9.81;
    const staticHeadM = ((suctionPressureBar - vaporPressureBar) * 1e5) / (liquidDensityKgM3 * g);
    const velocityHeadM = Math.pow(suctionVelocityMS, 2) / (2 * g);
    const npshAvailableM = staticHeadM + velocityHeadM;

    const cavitationRisk = npshAvailableM < npshRequiredM * 1.2;
    const interlockTrip = npshAvailableM < npshRequiredM;

    return { npshAvailableM, cavitationRisk, interlockTrip };
  }
}

// ============================================================================
// 6. Biblioteca: ValvesAndActuators (Válvulas On/Off e Modulantes)
// ============================================================================

export class FB_DiscreteValve {
  public static execute(
    cmdOpen: boolean,
    limitOpen: boolean,
    limitClosed: boolean,
    maxTransitTimeSec: number = 12.0,
    cycleTimeSec: number = 0.1,
    transitTimer: number = 0
  ): { outputOpenCoil: boolean; outputCloseCoil: boolean; faultTimeout: boolean; newTimer: number } {
    const outputOpenCoil = cmdOpen;
    const outputCloseCoil = !cmdOpen;

    let faultTimeout = false;
    let newTimer = transitTimer;

    const inTargetPosition = cmdOpen ? limitOpen && !limitClosed : limitClosed && !limitOpen;

    if (!inTargetPosition) {
      newTimer += cycleTimeSec;
      if (newTimer >= maxTransitTimeSec) {
        faultTimeout = true;
      }
    } else {
      newTimer = 0;
    }

    return { outputOpenCoil, outputCloseCoil, faultTimeout, newTimer };
  }
}

// ============================================================================
// 7. Biblioteca: SensorsAndInstruments (NAMUR NE43 e Filtragem)
// ============================================================================

export class FB_AnalogInputScaling {
  public static execute(
    rawSignalMa: number,
    engMin: number,
    engMax: number
  ): { scaledValue: number; status: "OK" | "UNDER_RANGE" | "OVER_RANGE" | "FAULT_OPEN_WIRE" | "FAULT_SHORT" } {
    // NAMUR NE43
    // < 3.6 mA: Falha de fiação aberta
    // 3.6 a 3.8 mA: Subfaixa (Under-range)
    // 3.8 a 20.5 mA: Operação normal
    // 20.5 a 21.0 mA: Sobrefaixa (Over-range)
    // > 21.0 mA: Falha de curto-circuito

    if (rawSignalMa < 3.6) {
      return { scaledValue: engMin, status: "FAULT_OPEN_WIRE" };
    }
    if (rawSignalMa > 21.0) {
      return { scaledValue: engMax, status: "FAULT_SHORT" };
    }

    const clampedMa = Math.max(4.0, Math.min(20.0, rawSignalMa));
    const normalized = (clampedMa - 4.0) / 16.0;
    const scaledValue = engMin + normalized * (engMax - engMin);

    let status: "OK" | "UNDER_RANGE" | "OVER_RANGE" = "OK";
    if (rawSignalMa < 3.8) status = "UNDER_RANGE";
    else if (rawSignalMa > 20.5) status = "OVER_RANGE";

    return { scaledValue, status };
  }
}

// ============================================================================
// 8. Biblioteca: ProcessControl (Algoritmo PID com Anti-Windup)
// ============================================================================

export class FB_PIDController {
  public static execute(
    setpoint: number,
    processVariable: number,
    kp: number,
    tiSec: number,
    tdSec: number,
    minOutput: number = 0,
    maxOutput: number = 100,
    cycleTimeSec: number = 0.1,
    integralAcc: number = 0,
    prevError: number = 0
  ): { controlOutput: number; newIntegralAcc: number; newError: number } {
    const error = setpoint - processVariable;
    const propTerm = kp * error;

    // Integral com Anti-Reset Windup
    let newIntegralAcc = integralAcc;
    if (tiSec > 0) {
      newIntegralAcc += (kp / tiSec) * error * cycleTimeSec;
    }

    // Derivativo
    let derivTerm = 0;
    if (tdSec > 0 && cycleTimeSec > 0) {
      derivTerm = kp * tdSec * ((error - prevError) / cycleTimeSec);
    }

    let rawOutput = propTerm + newIntegralAcc + derivTerm;

    // Clamping de Saída e Anti-Windup
    if (rawOutput > maxOutput) {
      rawOutput = maxOutput;
      newIntegralAcc = maxOutput - propTerm - derivTerm;
    } else if (rawOutput < minOutput) {
      rawOutput = minOutput;
      newIntegralAcc = minOutput - propTerm - derivTerm;
    }

    return { controlOutput: rawOutput, newIntegralAcc, newError: error };
  }
}

// ============================================================================
// 9. Biblioteca: EnergyMetering (Trifásico e Janela de Demanda)
// ============================================================================

export class FB_ThreePhasePowerMeter {
  public static execute(
    vPhaseA: number,
    vPhaseB: number,
    vPhaseC: number,
    iPhaseA: number,
    iPhaseB: number,
    iPhaseC: number,
    powerFactorPhaseA: number = 0.95,
    cycleTimeSec: number = 1.0,
    prevActiveEnergyKWh: number = 0
  ): {
    totalActivePowerKW: number;
    totalReactivePowerKvar: number;
    totalApparentPowerKVA: number;
    globalPowerFactor: number;
    accumulatedEnergyKWh: number;
  } {
    const pA = (vPhaseA * iPhaseA * powerFactorPhaseA) / 1000;
    const pB = (vPhaseB * iPhaseB * powerFactorPhaseA) / 1000;
    const pC = (vPhaseC * iPhaseC * powerFactorPhaseA) / 1000;
    const totalActivePowerKW = pA + pB + pC;

    const sA = (vPhaseA * iPhaseA) / 1000;
    const sB = (vPhaseB * iPhaseB) / 1000;
    const sC = (vPhaseC * iPhaseC) / 1000;
    const totalApparentPowerKVA = sA + sB + sC;

    const totalReactivePowerKvar = Math.sqrt(Math.max(0, Math.pow(totalApparentPowerKVA, 2) - Math.pow(totalActivePowerKW, 2)));
    const globalPowerFactor = totalApparentPowerKVA > 0 ? totalActivePowerKW / totalApparentPowerKVA : 1.0;

    const energyIncKWh = totalActivePowerKW * (cycleTimeSec / 3600.0);
    const accumulatedEnergyKWh = prevActiveEnergyKWh + energyIncKWh;

    return {
      totalActivePowerKW,
      totalReactivePowerKvar,
      totalApparentPowerKVA,
      globalPowerFactor,
      accumulatedEnergyKWh,
    };
  }
}

// ============================================================================
// 10. Biblioteca: SafetyMonitoring (E-Stop Bicanal e Invariante de Segurança)
// ============================================================================

export class FB_DualChannelEStop {
  public static execute(
    channel1: boolean,
    channel2: boolean,
    resetButton: boolean,
    maxDiscrepancyTimeSec: number = 0.05, // 50ms
    cycleTimeSec: number = 0.005,
    timerDiscrepancy: number = 0,
    latchedTrip: boolean = false
  ): { safetyHealthy: boolean; faultDiscrepancy: boolean; newTimer: number; newLatchedTrip: boolean } {
    let faultDiscrepancy = false;
    let newTimer = timerDiscrepancy;
    let newLatchedTrip = latchedTrip;

    // Se houver discrepância entre os dois canais de segurança
    if (channel1 !== channel2) {
      newTimer += cycleTimeSec;
      if (newTimer >= maxDiscrepancyTimeSec) {
        faultDiscrepancy = true;
        newLatchedTrip = true;
      }
    } else {
      newTimer = 0;
    }

    if (!channel1 && !channel2) {
      newLatchedTrip = true;
    }

    // Reset manual supervisionado
    if (newLatchedTrip && channel1 && channel2 && resetButton && !faultDiscrepancy) {
      newLatchedTrip = false;
    }

    const safetyHealthy = channel1 && channel2 && !newLatchedTrip && !faultDiscrepancy;

    return { safetyHealthy, faultDiscrepancy, newTimer, newLatchedTrip };
  }
}

// ============================================================================
// 11. Biblioteca: WaterTreatmentETE (Neutralização pH e Sopro de Ar)
// ============================================================================

export class FB_WaterTreatmentETE {
  public static execute(
    measuredPH: number,
    targetPH: number = 7.0,
    deadband: number = 0.3
  ): { dosingAcidCmd: boolean; dosingBaseCmd: boolean; aerationNeeded: boolean } {
    let dosingAcidCmd = false;
    let dosingBaseCmd = false;

    if (measuredPH > targetPH + deadband) {
      dosingAcidCmd = true;
    } else if (measuredPH < targetPH - deadband) {
      dosingBaseCmd = true;
    }

    const aerationNeeded = measuredPH >= 6.5 && measuredPH <= 8.5;

    return { dosingAcidCmd, dosingBaseCmd, aerationNeeded };
  }
}

// ============================================================================
// 12. Biblioteca: Conveyors (Zero-Pressure Accumulation e Detecção de Congestionamento)
// ============================================================================

export class FB_ZeroPressureAccumulation {
  public static execute(
    zonePhotoeye: boolean,
    downstreamZoneClear: boolean,
    maxTravelTimeSec: number = 5.0,
    cycleTimeSec: number = 0.05,
    zoneTimer: number = 0
  ): { zoneRun: boolean; jamAlarm: boolean; newTimer: number } {
    const zoneRun = downstreamZoneClear;
    let jamAlarm = false;
    let newTimer = zoneTimer;

    if (zonePhotoeye && zoneRun) {
      newTimer += cycleTimeSec;
      if (newTimer >= maxTravelTimeSec) {
        jamAlarm = true;
      }
    } else if (!zonePhotoeye) {
      newTimer = 0;
    }

    return { zoneRun, jamAlarm, newTimer };
  }
}

// ============================================================================
// Registro de Todas as 12 Bibliotecas no LibraryRegistry
// ============================================================================

export function registerIndustrialLibraries(registry: LibraryRegistry = LibraryRegistry.getInstance()): void {
  // 1. Standard (Placeholders básicos)
  registry.register({
    id: "lib-std-001",
    name: "EletricAi_Standard",
    vendor: "ElétricAi Industrial OS",
    version: "3.5.20.0",
    category: "STANDARD",
    description: "Biblioteca padrão IEC 61131-3 (TON, TOF, TP, CTU, CTD, R_TRIG, F_TRIG)",
    dependencies: [],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "TON", kind: "FUNCTION_BLOCK", description: "Timer On-Delay", signature: "(IN: BOOL, PT: TIME) -> (Q: BOOL, ET: TIME)" },
      { name: "TOF", kind: "FUNCTION_BLOCK", description: "Timer Off-Delay", signature: "(IN: BOOL, PT: TIME) -> (Q: BOOL, ET: TIME)" },
      { name: "TP", kind: "FUNCTION_BLOCK", description: "Timer Pulse", signature: "(IN: BOOL, PT: TIME) -> (Q: BOOL, ET: TIME)" },
      { name: "R_TRIG", kind: "FUNCTION_BLOCK", description: "Rising Edge Trigger", signature: "(CLK: BOOL) -> (Q: BOOL)" },
      { name: "F_TRIG", kind: "FUNCTION_BLOCK", description: "Falling Edge Trigger", signature: "(CLK: BOOL) -> (Q: BOOL)" },
    ],
  });

  // Placeholder #Standard
  registry.register({
    id: "plh-std-001",
    name: "#Standard",
    vendor: "ElétricAi Industrial OS",
    version: "3.5.20.0",
    category: "STANDARD",
    description: "Placeholder para biblioteca padrão IEC 61131-3",
    dependencies: [],
    isPlaceholder: true,
    defaultResolution: "EletricAi_Standard",
    exportedSymbols: [],
  });

  // Placeholder #SysTypes
  registry.register({
    id: "plh-systypes-001",
    name: "#SysTypes",
    vendor: "ElétricAi Industrial OS",
    version: "3.5.20.0",
    category: "SYSTEM",
    description: "Placeholder para tipos de sistema de baixo nível",
    dependencies: [],
    isPlaceholder: true,
    defaultResolution: "EletricAi_SysTypes",
    exportedSymbols: [],
  });

  registry.register({
    id: "lib-systypes-001",
    name: "EletricAi_SysTypes",
    vendor: "ElétricAi Industrial OS",
    version: "3.5.20.0",
    category: "SYSTEM",
    description: "Definições fundamentais de tipos primitivos e estruturas de ponteiros",
    dependencies: [],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "RTS_IEC_HANDLE", kind: "DUT", description: "Handle opaco de runtime", signature: "TYPE RTS_IEC_HANDLE : DWORD;" },
      { name: "RTS_IEC_RESULT", kind: "DUT", description: "Código de resultado de operação", signature: "TYPE RTS_IEC_RESULT : UDINT;" },
    ],
  });

  // 1. ElectricalProtection
  registry.register({
    id: "lib-elec-prot-001",
    name: "ElectricalProtection",
    vendor: "ElétricAi Power Systems",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Funções de proteção ANSI 50, 51, 50N, 51N, 27, 59, 81U, 81O",
    dependencies: [{ name: "EletricAi_Standard", versionRange: "^3.5.0" }],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_Overcurrent50_51", kind: "FUNCTION_BLOCK", description: "Sobrecorrente instantânea e temporizada IEC 60255", signature: "FB_Overcurrent50_51" },
      { name: "FB_VoltageProtection27_59", kind: "FUNCTION_BLOCK", description: "Proteção de subtensão e sobretensão", signature: "FB_VoltageProtection27_59" },
    ],
  });

  // 2. Transformers
  registry.register({
    id: "lib-transf-001",
    name: "Transformers",
    vendor: "ElétricAi Power Systems",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Modelo térmico IEC 60076-7 e comutador de tapes sob carga (OLTC)",
    dependencies: [{ name: "ElectricalProtection", versionRange: "^1.0.0" }],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_TransformerThermalModel", kind: "FUNCTION_BLOCK", description: "Modelo térmico de topo de óleo e ponto mais quente", signature: "FB_TransformerThermalModel" },
      { name: "FB_OLTCTapChanger", kind: "FUNCTION_BLOCK", description: "Controle automático de tap OLTC", signature: "FB_OLTCTapChanger" },
    ],
  });

  // 3. MotorStarters
  registry.register({
    id: "lib-motor-start-001",
    name: "MotorStarters",
    vendor: "ElétricAi Machinery",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Partidas de motores elétricos: Direta (DOL), Estrela-Triângulo e Soft-Starter",
    dependencies: [{ name: "EletricAi_Standard", versionRange: "^3.5.0" }],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_DOLStarter", kind: "FUNCTION_BLOCK", description: "Partida Direta com supervisão de contator", signature: "FB_DOLStarter" },
      { name: "FB_StarDeltaStarter", kind: "FUNCTION_BLOCK", description: "Partida Estrela-Triângulo com dwell anti-flashover", signature: "FB_StarDeltaStarter" },
    ],
  });

  // 4. VFDControl
  registry.register({
    id: "lib-vfd-ctrl-001",
    name: "VFDControl",
    vendor: "ElétricAi Drives",
    version: "1.0.0",
    category: "MOTION",
    description: "Controle de inversores de frequência com gerador de rampas e palavras de controle",
    dependencies: [{ name: "EletricAi_Standard", versionRange: "^3.5.0" }],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_VFDControl", kind: "FUNCTION_BLOCK", description: "Rampa e controle de velocidade em malha aberta/fechada", signature: "FB_VFDControl" },
    ],
  });

  // 5. PumpsAndPiping
  registry.register({
    id: "lib-pumps-001",
    name: "PumpsAndPiping",
    vendor: "ElétricAi Hydro",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Supervisão e alternância de bombas centrífugas e proteção de cavitação NPSH",
    dependencies: [{ name: "MotorStarters", versionRange: "^1.0.0" }],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_DuplexPumpAlternation", kind: "FUNCTION_BLOCK", description: "Alternância de bombas por horímetro e escalonamento", signature: "FB_DuplexPumpAlternation" },
      { name: "FB_PumpCavitationProtection", kind: "FUNCTION_BLOCK", description: "Proteção contra cavitação e cálculo de NPSH", signature: "FB_PumpCavitationProtection" },
    ],
  });

  // 6. ValvesAndActuators
  registry.register({
    id: "lib-valves-001",
    name: "ValvesAndActuators",
    vendor: "ElétricAi Process",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Válvulas de controle on/off, modulantes e supervisão de tempo de curso",
    dependencies: [{ name: "EletricAi_Standard", versionRange: "^3.5.0" }],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_DiscreteValve", kind: "FUNCTION_BLOCK", description: "Válvula solenoide/motorizada com supervisão de fim de curso", signature: "FB_DiscreteValve" },
    ],
  });

  // 7. SensorsAndInstruments
  registry.register({
    id: "lib-sensors-001",
    name: "SensorsAndInstruments",
    vendor: "ElétricAi Instrumentation",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Escalonamento analógico NAMUR NE43, extração de raiz quadrada e filtros digitais",
    dependencies: [],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_AnalogInputScaling", kind: "FUNCTION_BLOCK", description: "Escalonamento analógico 4-20mA com NAMUR NE43", signature: "FB_AnalogInputScaling" },
    ],
  });

  // 8. ProcessControl
  registry.register({
    id: "lib-proc-ctrl-001",
    name: "ProcessControl",
    vendor: "ElétricAi Process",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Malhas de controle PID avançadas com anti-windup e tracking sem solavancos",
    dependencies: [{ name: "SensorsAndInstruments", versionRange: "^1.0.0" }],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_PIDController", kind: "FUNCTION_BLOCK", description: "Controlador PID industrial com anti-reset windup", signature: "FB_PIDController" },
    ],
  });

  // 9. EnergyMetering
  registry.register({
    id: "lib-energy-001",
    name: "EnergyMetering",
    vendor: "ElétricAi Power Systems",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Medição de grandezas elétricas trifásicas (kW, kvar, kVA, FP) e integração de energia",
    dependencies: [],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_ThreePhasePowerMeter", kind: "FUNCTION_BLOCK", description: "Medidor trifásico de potência e energia ativa/reativa", signature: "FB_ThreePhasePowerMeter" },
    ],
  });

  // 10. SafetyMonitoring
  registry.register({
    id: "lib-safety-001",
    name: "SafetyMonitoring",
    vendor: "ElétricAi Safety",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Monitoramento de emergência bicanal com discrepância e trava de segurança física",
    dependencies: [{ name: "EletricAi_Standard", versionRange: "^3.5.0" }],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_DualChannelEStop", kind: "FUNCTION_BLOCK", description: "Parada de emergência bicanal supervisionada", signature: "FB_DualChannelEStop" },
    ],
  });

  // 11. WaterTreatmentETE
  registry.register({
    id: "lib-ete-001",
    name: "WaterTreatmentETE",
    vendor: "ElétricAi Water",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Tratamento de efluentes industriais: neutralização de pH e controle de aeração",
    dependencies: [{ name: "ProcessControl", versionRange: "^1.0.0" }, { name: "PumpsAndPiping", versionRange: "^1.0.0" }],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_WaterTreatmentETE", kind: "FUNCTION_BLOCK", description: "Loop de neutralização de pH para estações de efluentes", signature: "FB_WaterTreatmentETE" },
    ],
  });

  // 12. Conveyors
  registry.register({
    id: "lib-convey-001",
    name: "Conveyors",
    vendor: "ElétricAi Logistics",
    version: "1.0.0",
    category: "APPLICATION",
    description: "Logística interna: controle de esteiras de acúmulo com pressão zero (ZPA)",
    dependencies: [{ name: "MotorStarters", versionRange: "^1.0.0" }],
    isPlaceholder: false,
    exportedSymbols: [
      { name: "FB_ZeroPressureAccumulation", kind: "FUNCTION_BLOCK", description: "Lógica de zona ZPA com detecção de emperramento", signature: "FB_ZeroPressureAccumulation" },
    ],
  });
}
