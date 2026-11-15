// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScadaMotorsView } from "@/components/scada/views/scada-motors-view";
import { useDiagramStore } from "@/lib/diagram/store";
import { useEditorStore } from "@/lib/editor/store";
import { useSafetyStore } from "@/lib/simulation/safety-core";
import { useMotorControlStore } from "@/lib/simulation/motor-control-store";
import { buildMccDemoDiagram } from "@/lib/simulation/mcc-demo-plant";

function advance(seconds: number) {
  act(() => {
    for (let i = 0; i < Math.round(seconds / 0.1); i++) useMotorControlStore.getState().tick(0.1);
  });
}

describe("CCM supervisório — interação do operador", () => {
  beforeEach(() => {
    useMotorControlStore.getState().teardown();
    useEditorStore.setState({ deviceStates: {} });
    if (useSafetyStore.getState().emergencyLatched)
      useSafetyStore.getState().rearmEmergency("teste");
    useDiagramStore.getState().loadDoc(buildMccDemoDiagram("2026-01-01T00:00:00.000Z"));
  });
  afterEach(() => {
    act(() => useMotorControlStore.getState().teardown());
    cleanup();
  });

  it("lista automaticamente os motores do unifilar", () => {
    render(<ScadaMotorsView />);
    expect(screen.getByTestId("mcc-motor-MG-201")).toBeTruthy();
    expect(screen.getByTestId("mcc-motor-BL-201")).toBeTruthy();
  });

  it("clique liga (verde), fecha o contator no unifilar e clique de novo desliga", () => {
    render(<ScadaMotorsView />);
    act(() => useMotorControlStore.getState().setTicking(true));
    const tile = screen.getByTestId("mcc-motor-MG-201");
    fireEvent.click(tile.querySelector("button")!);
    advance(4);
    expect(tile.getAttribute("data-visual")).toBe("on");
    const fleet = useMotorControlStore.getState().fleet;
    const k = fleet.find((m) => m.config.tag === "MG-201")!.chain.contactorId!;
    expect(useEditorStore.getState().deviceStates[k]).toBe(true);

    fireEvent.click(tile.querySelector("button")!);
    advance(15);
    expect(tile.getAttribute("data-state")).toBe("STOPPED");
    expect(useEditorStore.getState().deviceStates[k]).toBe(false);
  });

  it("curto-circuito → vermelho piscando, abre disjuntor no unifilar; reconhecer fixa; rearmar limpa", () => {
    render(<ScadaMotorsView />);
    act(() => useMotorControlStore.getState().setTicking(true));
    const store = useMotorControlStore.getState();
    const m = store.fleet.find((f) => f.config.tag === "RT-203")!;
    const tile = screen.getByTestId("mcc-motor-RT-203");
    fireEvent.click(tile.querySelector("button")!);
    advance(3);
    act(() => useMotorControlStore.getState().injectFault(m.config.id, "short_circuit"));
    advance(0.2);
    expect(tile.getAttribute("data-visual")).toBe("fault-blink");
    expect(useEditorStore.getState().deviceStates[m.chain.breakerId!]).toBe(false);

    act(() => useMotorControlStore.getState().acknowledgeFault(m.config.id));
    expect(tile.getAttribute("data-visual")).toBe("fault");

    // Rearme bloqueado enquanto a causa persiste.
    act(() => useMotorControlStore.getState().resetMotor(m.config.id));
    expect(useMotorControlStore.getState().drives[m.config.id].fault).not.toBeNull();

    act(() => useMotorControlStore.getState().injectFault(m.config.id, "none"));
    act(() => useMotorControlStore.getState().resetMotor(m.config.id));
    expect(useMotorControlStore.getState().drives[m.config.id].fault).toBeNull();
    expect(useEditorStore.getState().deviceStates[m.chain.breakerId!]).toBe(true);
    // Rearme não religa o motor.
    advance(1);
    expect(useMotorControlStore.getState().drives[m.config.id].contactorClosed).toBe(false);
  });

  it("disjuntor geral aberto no unifilar impede partida e informa o motivo", () => {
    render(<ScadaMotorsView />);
    act(() => useMotorControlStore.getState().setTicking(true));
    act(() => useEditorStore.getState().setDeviceState("demo_qgbt", false));
    const m = useMotorControlStore.getState().fleet[0];
    act(() => useMotorControlStore.getState().commandMotor(m.config.id, true));
    expect(useMotorControlStore.getState().lastRejection?.reason).toMatch(/Alimentador/);
  });

  it("E-STOP desliga todos e não religa após rearme", () => {
    render(<ScadaMotorsView />);
    act(() => useMotorControlStore.getState().setTicking(true));
    const ids = useMotorControlStore
      .getState()
      .fleet.slice(0, 3)
      .map((m) => m.config.id);
    act(() => ids.forEach((id) => useMotorControlStore.getState().commandMotor(id, true)));
    advance(3);
    act(() => useSafetyStore.getState().triggerEmergency({ source: "teste", reason: "teste" }));
    advance(0.2);
    for (const id of ids) {
      expect(useMotorControlStore.getState().drives[id].contactorClosed).toBe(false);
    }
    act(() => {
      useSafetyStore.getState().rearmEmergency("teste");
    });
    advance(2);
    for (const id of ids) {
      expect(useMotorControlStore.getState().commands[id]).toBe(false);
      expect(useMotorControlStore.getState().drives[id].contactorClosed).toBe(false);
    }
  });
});
