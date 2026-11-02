// SCADA SUPERVISÓRIO — Industrial Supervisory Unit & Integration Tests
// Standards: ISA-101 (HMI), ISA-18.2 (Alarms), IEC 62443 (Security), IEC 61131-3 (Control)

import { describe, it, expect, beforeEach } from "vitest";
import { useScadaStore } from "@/lib/scada/scada-store";

describe("SCADA SUPERVISÓRIO — Core Architecture & State Engine", () => {
  beforeEach(() => {
    // Reset store to known fresh state
    const state = useScadaStore.getState();
    state.resetToInitialState();
  });

  it("1. Initializes with high-fidelity KPIs matching reference image", () => {
    const state = useScadaStore.getState();

    expect(state.activeView).toBe("overview");
    expect(state.totalFlowM3h).toBeCloseTo(182.7, 1);
    expect(state.totalPowerKw).toBeCloseTo(248.5, 1);
    expect(state.powerFactor).toBeCloseTo(0.94, 2);
    expect(state.systemEfficiencyPct).toBeCloseTo(96.4, 1);
    expect(state.warningAlarmsCount).toBeGreaterThanOrEqual(1);
    expect(state.isSimulationMode).toBe(true);
  });

  it("2. Authoritative E-STOP: Halts pumps, trips critical alarm and logs security event", () => {
    const state = useScadaStore.getState();

    // Trigger Emergency Stop
    state.triggerEstop();

    const afterEstop = useScadaStore.getState();
    expect(afterEstop.estopActive).toBe(true);
    expect(afterEstop.totalFlowM3h).toBe(0);
    expect(afterEstop.totalPowerKw).toBeLessThan(20); // standby power

    // Check critical alarm created
    const estopAlarm = afterEstop.alarms.find((a) => a.tag === "ETE.SAFETY.ESTOP");
    expect(estopAlarm).toBeDefined();
    expect(estopAlarm?.priority).toBe("CRITICAL");
    expect(estopAlarm?.category).toBe("SAFETY");

    // Check equipments tripped
    expect(afterEstop.equipments["P-01"].status).toBe("TRIPPED");
    expect(afterEstop.equipments["P-02"].status).toBe("TRIPPED");

    // Check audit trail
    const estopLog = afterEstop.auditLogs.find((l) => l.action === "ESTOP_TRIGGER");
    expect(estopLog).toBeDefined();
    expect(estopLog?.severity).toBe("CRITICAL");

    // Rearm Emergency Stop
    afterEstop.rearmEstop();
    const afterRearm = useScadaStore.getState();
    expect(afterRearm.estopActive).toBe(false);
    expect(afterRearm.equipments["P-01"].status).toBe("STANDBY");
    expect(afterRearm.auditLogs.find((l) => l.action === "ESTOP_REARM")).toBeDefined();
  });

  it("3. ISA-18.2 Alarm Management: Acknowledging and clearing alarms", () => {
    const state = useScadaStore.getState();
    expect(state.alarms.length).toBeGreaterThanOrEqual(2);

    const firstAlarm = state.alarms[0];
    state.acknowledgeAlarm(firstAlarm.id, "OPERADOR_TESTE");

    const updated = useScadaStore.getState();
    const acked = updated.alarms.find((a) => a.id === firstAlarm.id);
    expect(acked?.state).toBe("ACK");
    expect(acked?.acknowledgedBy).toBe("OPERADOR_TESTE");

    // Acknowledge All
    updated.acknowledgeAllAlarms("SUPERVISOR");
    const allAcked = useScadaStore.getState();
    expect(allAcked.alarms.every((a) => a.state === "ACK" || a.state === "CLEARED")).toBe(true);
    expect(allAcked.criticalAlarmsCount).toBe(0);
    expect(allAcked.warningAlarmsCount).toBe(0);
  });

  it("4. Equipment Commands: START, STOP, AUTO, MANUAL and operator audit", () => {
    const state = useScadaStore.getState();

    state.commandEquipment("P-01", "STOP", "OP_01");
    expect(useScadaStore.getState().equipments["P-01"].status).toBe("STOPPED");

    state.commandEquipment("P-01", "START", "OP_01");
    expect(useScadaStore.getState().equipments["P-01"].status).toBe("RUNNING");

    state.commandEquipment("P-01", "MANUAL", "OP_01");
    expect(useScadaStore.getState().equipments["P-01"].mode).toBe("MANUAL");

    const cmdLog = useScadaStore
      .getState()
      .auditLogs.find((l) => l.action === "CMD_START" && l.equipment === "P-01");
    expect(cmdLog).toBeDefined();
  });

  it("5. Tag Registry: Forcing tag values and quality status updates", () => {
    const state = useScadaStore.getState();

    state.forceTagValue("ETE.TK101.LEVEL", 99.8, "ENG_AUT");
    const forcedState = useScadaStore.getState();
    const tag = forcedState.tags["ETE.TK101.LEVEL"];

    expect(tag.forced).toBe(true);
    expect(tag.quality).toBe("FORCED");
    expect(tag.value).toBe(99.8);

    // Release force
    forcedState.unforceTag("ETE.TK101.LEVEL", "ENG_AUT");
    const releasedState = useScadaStore.getState();
    const releasedTag = releasedState.tags["ETE.TK101.LEVEL"];

    expect(releasedTag.forced).toBe(false);
    expect(releasedTag.quality).toBe("GOOD");
  });

  it("6. View Navigation: Supports all 11 mandatory supervisory views", () => {
    const state = useScadaStore.getState();
    const views = [
      "overview",
      "synoptics",
      "alarms",
      "trends",
      "equipments",
      "tags",
      "communication",
      "events",
      "reports",
      "hmi",
      "settings",
    ] as const;

    for (const v of views) {
      state.setActiveView(v);
      expect(useScadaStore.getState().activeView).toBe(v);
    }
  });

  it("7. Industrial Gateways: Connects OPC UA, Modbus TCP and MQTT", () => {
    const gateway = useScadaStore.getState().gatewayStatus;

    expect(gateway.opcua.status).toBe("CONNECTED");
    expect(gateway.opcua.endpoint).toContain("opc.tcp://");

    expect(gateway.modbus.status).toBe("CONNECTED");
    expect(gateway.modbus.holdingRegisters).toBeGreaterThan(0);

    expect(gateway.mqtt.status).toBe("CONNECTED");
    expect(gateway.mqtt.clientId).toBe("SCADA_SUPERVISORY_01");
  });

  it("8. Industrial Density & Equipment Registry: contains all process & electrical assets", () => {
    const eqs = useScadaStore.getState().equipments;

    // Electrical infrastructure
    expect(eqs["TR-01"]).toBeDefined();
    expect(eqs["QM-01"]).toBeDefined();
    expect(eqs["CCM-01"]).toBeDefined();
    expect(eqs["PLC-01"]).toBeDefined();

    // Tanks
    expect(eqs["T-101"]).toBeDefined();
    expect(eqs["T-102"]).toBeDefined();
    expect(eqs["T-105"]).toBeDefined();

    // Pumps & Motors P-01 to P-08
    for (let i = 1; i <= 8; i++) {
      const id = `P-0${i}`;
      expect(eqs[id]).toBeDefined();
      expect(eqs[id].category).toBe("PUMP");
    }

    // Valves V-01 to V-08
    for (let i = 1; i <= 8; i++) {
      const id = `V-0${i}`;
      expect(eqs[id]).toBeDefined();
      expect(eqs[id].category).toBe("VALVE");
    }

    // Filters and Sensors
    expect(eqs["F-01"]).toBeDefined();
    expect(eqs["LT-01"]).toBeDefined();
    expect(eqs["LT-02"]).toBeDefined();
    expect(eqs["LT-05"]).toBeDefined();
    expect(eqs["PT-01"]).toBeDefined();
    expect(eqs["FT-01"]).toBeDefined();
    expect(eqs["AIT-01"]).toBeDefined();
  });
});
