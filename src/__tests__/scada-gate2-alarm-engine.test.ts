// ELÉTRICAI INDUSTRIAL OS — GATE 2 TEST SUITE
// Test Suite: Deterministic Alarm Engine (ISA-18.2 State Model, Limits, Hysteresis, Delays, Chattering)
// Standards: ISA-18.2, IEC 62682, EEMUA 191

import { describe, it, expect, beforeEach } from "vitest";
import { DeterministicAlarmEngine } from "@/lib/scada/alarm-engine";
import type { ExtendedAlarmDefinition, ScadaTagDefinition } from "@/lib/scada/types";

describe("GATE 2B — Deterministic Alarm Engine (ISA-18.2)", () => {
  let engine: DeterministicAlarmEngine;
  let virtualTime: number;

  beforeEach(() => {
    virtualTime = 1700000000000;
    engine = new DeterministicAlarmEngine({
      timeProvider: () => virtualTime,
      chatterWindowMs: 10000,
      chatterThreshold: 3,
    });
  });

  it("1. Limites Analógicos e Histerese: Dispara em limite High e só limpa abaixo de (High - Hysteresis)", () => {
    const alarmDef: ExtendedAlarmDefinition = {
      id: "alm_m01_current_high",
      projectId: "proj-1",
      tagId: "tag_m01_i",
      tagName: "M-01_CORRENTE",
      description: "Sobrecarga de Corrente Alta no Motor M-01",
      alarmClass: "ELECTRICAL",
      severity: "HIGH",
      analogLimits: {
        high: 30.0,
        highHigh: 40.0,
        hysteresis: 2.0,
        delayOnMs: 0,
        delayOffMs: 0,
      },
      requireAck: true,
      autoClear: false,
      enabled: true,
    };
    engine.registerDefinition(alarmDef);

    const tag: ScadaTagDefinition = {
      id: "tag_m01_i",
      name: "M-01_CORRENTE",
      description: "Corrente",
      dataType: "REAL",
      unit: "A",
      scaleMin: 0,
      scaleMax: 50,
      value: 28.0,
      quality: "GOOD",
      driver: "SIMULATION",
      scanRateMs: 100,
      lastUpdated: virtualTime,
      forced: false,
      sourceAddress: "PLC.I",
    };

    // Value 28.0A: Under limit 30.0A -> No alarm
    const evts1 = engine.evaluateTag(tag, virtualTime);
    expect(evts1.length).toBe(0);
    expect(engine.getActiveInstances().length).toBe(0);

    // Value rises to 31.5A -> Triggers High Alarm (TRIGGER)
    virtualTime += 1000;
    tag.value = 31.5;
    const evts2 = engine.evaluateTag(tag, virtualTime);
    expect(evts2.length).toBe(1);
    expect(evts2[0].transition).toBe("TRIGGER");
    expect(evts2[0].newCondition).toBe("ACTIVE");
    expect(evts2[0].newAckState).toBe("UNACKNOWLEDGED");

    const inst = engine.getActiveInstances()[0];
    expect(inst.processCondition).toBe("ACTIVE");
    expect(inst.ackState).toBe("UNACKNOWLEDGED");
    expect(inst.limitType).toBe("H");

    // Value drops to 29.0A: Below 30.0A, but ABOVE (30.0 - 2.0 = 28.0A) hysteresis threshold!
    // Must REMAIN ACTIVE (deadband/hysteresis hold)
    virtualTime += 1000;
    tag.value = 29.0;
    const evts3 = engine.evaluateTag(tag, virtualTime);
    expect(evts3.length).toBe(0); // No transition, stays ACTIVE
    expect(engine.getActiveInstances()[0].processCondition).toBe("ACTIVE");

    // Value drops to 27.5A: Below (30.0 - 2.0 = 28.0A) hysteresis threshold!
    // Since it was UNACKNOWLEDGED, it transitions to RETURNED_TO_NORMAL (still unacknowledged, waiting for operator ACK)
    virtualTime += 1000;
    tag.value = 27.5;
    const evts4 = engine.evaluateTag(tag, virtualTime);
    expect(evts4.length).toBe(1);
    expect(evts4[0].transition).toBe("RETURN_TO_NORMAL");
    expect(evts4[0].newCondition).toBe("RETURNED_TO_NORMAL");
    expect(evts4[0].newAckState).toBe("UNACKNOWLEDGED");
  });

  it("2. Temporizações (DelayOn e DelayOff): Respeita atrasos antes de disparar e antes de retornar ao normal", () => {
    const alarmDef: ExtendedAlarmDefinition = {
      id: "alm_p01_flow_delay",
      projectId: "proj-1",
      tagId: "tag_p01_q",
      tagName: "P-01_VAZAO",
      description: "Vazão Baixa com Atraso de 2000ms",
      alarmClass: "PROCESS",
      severity: "MEDIUM",
      analogLimits: {
        low: 50.0,
        hysteresis: 5.0,
        delayOnMs: 2000,
        delayOffMs: 1500,
      },
      requireAck: true,
      autoClear: false,
      enabled: true,
    };
    engine.registerDefinition(alarmDef);

    const tag: ScadaTagDefinition = {
      id: "tag_p01_q",
      name: "P-01_VAZAO",
      description: "Vazão",
      dataType: "REAL",
      unit: "m³/h",
      scaleMin: 0,
      scaleMax: 100,
      value: 80.0,
      quality: "GOOD",
      driver: "SIMULATION",
      scanRateMs: 100,
      lastUpdated: virtualTime,
      forced: false,
      sourceAddress: "PLC.Q",
    };

    // Value drops to 40.0 (below limit 50.0) at t=0 -> Condition exceeded but waiting for delayOn (2000ms)
    tag.value = 40.0;
    const evts1 = engine.evaluateTag(tag, virtualTime);
    expect(evts1.length).toBe(0);
    expect(engine.getActiveInstances().length).toBe(0);

    // Advance 1000ms (t=1000ms): Still under 2000ms -> No trigger
    virtualTime += 1000;
    const evts2 = engine.evaluateTag(tag, virtualTime);
    expect(evts2.length).toBe(0);

    // Advance another 1100ms (t=2100ms): delayOn (2000ms) has elapsed -> Triggers!
    virtualTime += 1100;
    const evts3 = engine.evaluateTag(tag, virtualTime);
    expect(evts3.length).toBe(1);
    expect(evts3[0].transition).toBe("TRIGGER");
    expect(engine.getActiveInstances().length).toBe(1);
  });

  it("3. Ciclo Completo de Reconhecimento ISA-18.2: Disparo -> Reconhecimento -> Retorno -> Limpeza", () => {
    const alarmDef: ExtendedAlarmDefinition = {
      id: "alm_m01_trip",
      projectId: "proj-1",
      tagId: "tag_m01_i",
      tagName: "M-01_CORRENTE",
      description: "Sobrecarga de Corrente",
      alarmClass: "ELECTRICAL",
      severity: "CRITICAL",
      analogLimits: {
        high: 35.0,
        hysteresis: 1.0,
      },
      requireAck: true,
      autoClear: false,
      enabled: true,
    };
    engine.registerDefinition(alarmDef);

    const tag: ScadaTagDefinition = {
      id: "tag_m01_i",
      name: "M-01_CORRENTE",
      description: "Corrente",
      dataType: "REAL",
      unit: "A",
      scaleMin: 0,
      scaleMax: 50,
      value: 36.0,
      quality: "GOOD",
      driver: "SIMULATION",
      scanRateMs: 100,
      lastUpdated: virtualTime,
      forced: false,
      sourceAddress: "PLC.I",
    };

    // 1. Trigger
    engine.evaluateTag(tag, virtualTime);
    let inst = engine.getActiveInstances()[0];
    expect(inst.processCondition).toBe("ACTIVE");
    expect(inst.ackState).toBe("UNACKNOWLEDGED");

    // 2. Operator Acknowledges while still active
    virtualTime += 5000;
    const ackEvt = engine.acknowledgeAlarm(
      inst.id,
      "OPERADOR_1",
      "Em análise pela equipe elétrica",
      virtualTime,
    );
    expect(ackEvt).not.toBeNull();
    expect(ackEvt?.transition).toBe("ACKNOWLEDGE");
    expect(ackEvt?.newAckState).toBe("ACKNOWLEDGED");

    inst = engine.getActiveInstances()[0];
    expect(inst.processCondition).toBe("ACTIVE");
    expect(inst.ackState).toBe("ACKNOWLEDGED");
    expect(inst.acknowledgedBy).toBe("OPERADOR_1");

    // 3. Process returns to normal (value drops to 25.0A)
    virtualTime += 5000;
    tag.value = 25.0;
    const returnEvts = engine.evaluateTag(tag, virtualTime);
    expect(returnEvts.length).toBe(1);
    expect(returnEvts[0].transition).toBe("CLEAR");
    expect(returnEvts[0].newCondition).toBe("NORMAL");

    // Active instances must now be empty and moved to history!
    expect(engine.getActiveInstances().length).toBe(0);
    expect(engine.getHistory().length).toBe(1);
    expect(engine.getHistory()[0].clearedAt).toBe(virtualTime);
  });

  it("4. Detecção de Alarme Oscilante (Chattering): Sinaliza isChattering quando transições > 3 em 10 segundos", () => {
    const alarmDef: ExtendedAlarmDefinition = {
      id: "alm_chatter",
      projectId: "proj-1",
      tagId: "tag_osc",
      tagName: "NIVEL_OSC",
      description: "Nível com oscilação rápida",
      alarmClass: "PROCESS",
      severity: "MEDIUM",
      analogLimits: {
        high: 50.0,
        hysteresis: 0.1,
      },
      requireAck: false,
      autoClear: true,
      enabled: true,
    };
    engine.registerDefinition(alarmDef);

    const tag: ScadaTagDefinition = {
      id: "tag_osc",
      name: "NIVEL_OSC",
      description: "Nivel",
      dataType: "REAL",
      unit: "%",
      scaleMin: 0,
      scaleMax: 100,
      value: 49.0,
      quality: "GOOD",
      driver: "SIMULATION",
      scanRateMs: 100,
      lastUpdated: virtualTime,
      forced: false,
      sourceAddress: "PLC.N",
    };

    // Transition 1: High
    virtualTime += 1000;
    tag.value = 51.0;
    engine.evaluateTag(tag, virtualTime);

    // Transition 2: Normal
    virtualTime += 1000;
    tag.value = 49.0;
    engine.evaluateTag(tag, virtualTime);

    // Transition 3: High
    virtualTime += 1000;
    tag.value = 51.0;
    engine.evaluateTag(tag, virtualTime);

    // Transition 4: Normal
    virtualTime += 1000;
    tag.value = 49.0;
    engine.evaluateTag(tag, virtualTime);

    // Transition 5: High (exceeded chatter threshold within 10s)
    virtualTime += 1000;
    tag.value = 51.0;
    engine.evaluateTag(tag, virtualTime);

    const inst = engine.getActiveInstances()[0];
    expect(inst).toBeDefined();
    expect(inst.isChattering).toBe(true);
    expect(inst.chatterCount).toBeGreaterThanOrEqual(3);
  });

  it("5. Falha de Comunicação / Sinal STALE: Dispara alarme de COMMUNICATION sem limpar alarme de processo", () => {
    const alarmDef: ExtendedAlarmDefinition = {
      id: "alm_m01_proc",
      projectId: "proj-1",
      tagId: "tag_m01",
      tagName: "M-01_CORRENTE",
      description: "Corrente de Processo",
      alarmClass: "PROCESS",
      severity: "HIGH",
      analogLimits: { high: 30.0, hysteresis: 1.0 },
      requireAck: true,
      autoClear: false,
      enabled: true,
    };
    engine.registerDefinition(alarmDef);

    const tag: ScadaTagDefinition = {
      id: "tag_m01",
      name: "M-01_CORRENTE",
      description: "Corrente",
      dataType: "REAL",
      unit: "A",
      scaleMin: 0,
      scaleMax: 50,
      value: 32.0,
      quality: "GOOD",
      driver: "SIMULATION",
      scanRateMs: 100,
      lastUpdated: virtualTime,
      forced: false,
      sourceAddress: "PLC.I",
    };

    // 1. Process alarm triggers
    engine.evaluateTag(tag, virtualTime);
    expect(engine.getActiveInstances().length).toBe(1);

    // 2. Field source disconnects -> Tag quality becomes STALE
    virtualTime += 2000;
    tag.quality = "STALE";
    const commEvts = engine.evaluateTag(tag, virtualTime);

    // Must trigger a communication alarm!
    expect(commEvts.some((e) => e.transition === "TRIGGER")).toBe(true);
    const instances = engine.getActiveInstances();

    // Both process alarm and communication alarm must be active simultaneously!
    const commAlarm = instances.find((i) => i.alarmClass === "COMMUNICATION");
    const procAlarm = instances.find((i) => i.alarmClass === "PROCESS");

    expect(commAlarm).toBeDefined();
    expect(procAlarm).toBeDefined();
    expect(commAlarm?.processCondition).toBe("ACTIVE");
    expect(procAlarm?.processCondition).toBe("ACTIVE"); // Not cleared by comm loss!
  });

  it("6. Supressão / Shelving: Alarme suprimido é ignorado durante o período de manutenção", () => {
    const alarmDef: ExtendedAlarmDefinition = {
      id: "alm_suppress",
      projectId: "proj-1",
      tagId: "tag_sup",
      tagName: "TAG_SUP",
      description: "Alarme de Teste",
      alarmClass: "INSTRUMENTATION",
      severity: "LOW",
      analogLimits: { high: 10.0, hysteresis: 1.0 },
      requireAck: true,
      autoClear: false,
      enabled: true,
    };
    engine.registerDefinition(alarmDef);

    // Operator suppresses for 30 minutes
    engine.suppressAlarm(
      "alm_suppress",
      "Manutenção preventiva de campo",
      30 * 60 * 1000,
      "ENGENHEIRO",
      virtualTime,
    );

    const tag: ScadaTagDefinition = {
      id: "tag_sup",
      name: "TAG_SUP",
      description: "Tag Sup",
      dataType: "REAL",
      unit: "V",
      scaleMin: 0,
      scaleMax: 20,
      value: 15.0, // Exceeds limit 10.0
      quality: "GOOD",
      driver: "SIMULATION",
      scanRateMs: 100,
      lastUpdated: virtualTime,
      forced: false,
      sourceAddress: "PLC.V",
    };

    // Evaluate while suppressed -> Must NOT trigger
    const evts = engine.evaluateTag(tag, virtualTime);
    expect(evts.length).toBe(0);
    expect(engine.getActiveInstances().length).toBe(0);

    // Advance time past 30 minutes
    virtualTime += 31 * 60 * 1000;
    const evtsAfter = engine.evaluateTag(tag, virtualTime);
    expect(evtsAfter.length).toBe(1);
    expect(evtsAfter[0].transition).toBe("TRIGGER");
  });
});
