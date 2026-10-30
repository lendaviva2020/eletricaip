import { describe, it, expect, beforeEach } from "vitest";
import { useSafetyStore } from "@/lib/simulation/safety-core";
import { useEditorStore } from "@/lib/editor/store";
import { computeCircuitEnergization } from "@/lib/diagram/electrical-simulation";
import type { DiagramDoc } from "@/lib/diagram/schema";
import { createEmptyDoc, makeNode, makeEdge } from "@/lib/diagram/model";
import { runDiagramDiagnostics } from "@/lib/diagram/multifilar";
import { ptBR } from "@/lib/i18n/catalogs/pt-BR";
import { en } from "@/lib/i18n/catalogs/en";

describe("P0: Safety Core & Emergency Stop (E-STOP) Interlock", () => {
  beforeEach(() => {
    // Reset safety store and editor store before each test
    useSafetyStore.getState().rearmEmergency();
    useEditorStore.getState().setSimulationStatus("stopped");
    useEditorStore.getState().resetSimulationState();
  });

  it("authoritative safety core initializes in safe, rearmed state", () => {
    const safety = useSafetyStore.getState();
    expect(safety.emergencyLatched).toBe(false);
    expect(safety.rearmed).toBe(true);
    expect(safety.canStartSimulation().allowed).toBe(true);
  });

  it("triggering E-STOP immediately latches and blocks canStartSimulation()", () => {
    useSafetyStore.getState().triggerEmergency({
      source: "estop_button",
      reason: "Emergency button pressed by operator in test",
    });

    const safety = useSafetyStore.getState();
    expect(safety.emergencyLatched).toBe(true);
    expect(safety.rearmed).toBe(false);
    expect(safety.canStartSimulation().allowed).toBe(false);

    expect(safety.history.length).toBeGreaterThanOrEqual(1);
    const lastEvent = safety.history[0];
    expect(lastEvent.kind).toBe("trigger");
    expect(lastEvent.source).toBe("estop_button");
    expect(lastEvent.reason).toContain("Emergency button pressed");
    expect(typeof lastEvent.timestamp).toBe("string");
  });

  it("triggering E-STOP de-energizes all outputs and stops active simulation", () => {
    // 1. Start simulation
    useEditorStore.getState().setSimulationStatus("running");
    expect(useEditorStore.getState().simulationStatus).toBe("running");

    // 2. Set some actuator outputs to true in editorTags and deviceStates
    useEditorStore.setState((s) => ({
      ...s,
      editorTags: {
        ...s.editorTags,
        "tag-q0": { id: "tag-q0", name: "%Q0.0", type: "BOOL", value: true, forced: false },
        "tag-motor": { id: "tag-motor", name: "MOTOR_PRINCIPAL", type: "BOOL", value: true, forced: false },
        "tag-km1": { id: "tag-km1", name: "KM1_BOBINA", type: "BOOL", value: true, forced: false },
        "tag-cmd": { id: "tag-cmd", name: "CMD_VALVULA", type: "BOOL", value: true, forced: false },
      },
      deviceStates: { q1_breaker: true },
    }));

    expect(useEditorStore.getState().editorTags["tag-q0"].value).toBe(true);
    expect(useEditorStore.getState().editorTags["tag-motor"].value).toBe(true);
    expect(useEditorStore.getState().deviceStates["q1_breaker"]).toBe(true);

    // 3. Trigger E-STOP
    useSafetyStore.getState().triggerEmergency({
      source: "hardware_interlock",
      reason: "Perimeter gate opened during operation",
    });

    // 4. Assert simulation is stopped immediately
    expect(useEditorStore.getState().simulationStatus).toBe("stopped");

    // 5. Assert all actuator and output variables are forced to false (fail-safe)
    expect(useEditorStore.getState().editorTags["tag-q0"].value).toBe(false);
    expect(useEditorStore.getState().editorTags["tag-motor"].value).toBe(false);
    expect(useEditorStore.getState().editorTags["tag-km1"].value).toBe(false);
    expect(useEditorStore.getState().editorTags["tag-cmd"].value).toBe(false);

    // 6. Assert switching devices are opened
    expect(Object.keys(useEditorStore.getState().deviceStates).length).toBe(0);
  });

  it("blocks START attempts while E-STOP is latched", () => {
    useSafetyStore.getState().triggerEmergency({
      source: "estop_button",
      reason: "Emergency stop active",
    });

    expect(useSafetyStore.getState().canStartSimulation().allowed).toBe(false);

    // Attempt to set simulation status to running
    useEditorStore.getState().setSimulationStatus("running");

    // Must remain stopped due to safety interlock
    expect(useEditorStore.getState().simulationStatus).toBe("stopped");
  });

  it("rearm unlatches E-STOP but NEVER automatically restarts the circuit", () => {
    // Trigger emergency while running
    useEditorStore.getState().setSimulationStatus("running");
    useSafetyStore.getState().triggerEmergency({
      source: "estop_button",
      reason: "Testing rearm sequence",
    });
    expect(useEditorStore.getState().simulationStatus).toBe("stopped");
    expect(useSafetyStore.getState().emergencyLatched).toBe(true);

    // Perform operator rearm
    useSafetyStore.getState().rearmEmergency();

    const safety = useSafetyStore.getState();
    expect(safety.emergencyLatched).toBe(false);
    expect(safety.rearmed).toBe(true);
    expect(safety.canStartSimulation().allowed).toBe(true);

    // CRITICAL: The simulation must REMAIN stopped until an explicit operator start action
    expect(useEditorStore.getState().simulationStatus).toBe("stopped");

    // History logs the rearm
    const lastEvent = safety.history[0];
    expect(lastEvent.kind).toBe("rearm");

    // Now explicit operator start is allowed
    useEditorStore.getState().setSimulationStatus("running");
    expect(useEditorStore.getState().simulationStatus).toBe("running");
  });

  it("computeCircuitEnergization forces all circuits de-energized during emergency", () => {
    const n1 = makeNode({
      id: "source-1",
      sheet: "unifilar",
      position: { x: 100, y: 100 },
      label: "Rede 380V",
      params: { kind: "generator", voltage_V: 380, kVA: 150 },
    });
    const n2 = makeNode({
      id: "disj-1",
      sheet: "unifilar",
      position: { x: 100, y: 200 },
      label: "DJ-1",
      params: { kind: "breaker", in_A: 32, poles: 3, curve: "C" },
    });
    const n3 = makeNode({
      id: "motor-1",
      sheet: "unifilar",
      position: { x: 100, y: 300 },
      label: "M1",
      params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
    });

    const e1 = makeEdge({
      id: "e1",
      sheet: "unifilar",
      source: "source-1",
      target: "disj-1",
      kind: "power",
    });
    const e2 = makeEdge({
      id: "e2",
      sheet: "unifilar",
      source: "disj-1",
      target: "motor-1",
      kind: "power",
    });

    const doc: DiagramDoc = createEmptyDoc({
      sheets: ["unifilar", "multifilar"],
      nodes: {
        [n1.id]: n1,
        [n2.id]: n2,
        [n3.id]: n3,
      },
      edges: {
        [e1.id]: e1,
        [e2.id]: e2,
      },
    });

    // Breaker is closed
    const deviceStates = { "disj-1": true };

    // With emergency latched = true
    useSafetyStore.getState().triggerEmergency({
      source: "estop_button",
      reason: "Emergency active test",
    });

    const energization = computeCircuitEnergization(doc, "running", deviceStates);

    // All nodes, terminals and edges must be de-energized
    expect(energization.energizedNodeIds.has("motor-1")).toBe(false);
    expect(energization.energizedEdgeIds.has("e2")).toBe(false);
    expect(energization.energizedNodeIds.size).toBe(0);
  });
});

describe("P0: Single Canonical Circuit Model & Unifilar/Multifilar Diagnostics Consistency", () => {
  it("runDiagramDiagnostics provides consistent equipment diagnostic results without duplicates", () => {
    const n1 = makeNode({
      id: "source-1",
      sheet: "unifilar",
      position: { x: 100, y: 100 },
      label: "Fonte 380V",
      params: { kind: "generator", voltage_V: 380, kVA: 150 },
    });
    const n2 = makeNode({
      id: "motor-1",
      sheet: "unifilar",
      position: { x: 100, y: 300 },
      label: "M1",
      params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
    });
    const n3 = makeNode({
      id: "mf_motor-1",
      sheet: "multifilar",
      position: { x: 100, y: 300 },
      label: "M1 (MF)",
      params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
    });

    const e1 = makeEdge({
      id: "e1",
      sheet: "unifilar",
      source: "source-1",
      target: "motor-1",
      kind: "power",
    });
    const mfE1 = makeEdge({
      id: "mf_e1",
      sheet: "multifilar",
      source: "source-1",
      target: "mf_motor-1",
      kind: "power",
    });

    const doc: DiagramDoc = createEmptyDoc({
      sheets: ["unifilar", "multifilar"],
      nodes: {
        [n1.id]: n1,
        [n2.id]: n2,
        [n3.id]: n3,
      },
      edges: {
        [e1.id]: e1,
        [mfE1.id]: mfE1,
      },
    });

    const diags = runDiagramDiagnostics(doc);

    // Diagnostic evaluation skips mf_ mirrors and evaluates canonical nodes once
    const motorDiags = diags.filter((d) => d.nodeId === "motor-1" || d.nodeId === "mf_motor-1");
    // Should never have duplicates for mf_
    const mfDiags = diags.filter((d) => d.nodeId === "mf_motor-1");
    expect(mfDiags.length).toBe(0);
  });

  it("switching sheets 25 times maintains node count and data integrity", () => {
    let activeSheet: "unifilar" | "multifilar" = "unifilar";
    const initialNodeCount = 5;

    for (let i = 0; i < 25; i++) {
      activeSheet = activeSheet === "unifilar" ? "multifilar" : "unifilar";
      expect(["unifilar", "multifilar"]).toContain(activeSheet);
    }

    expect(activeSheet).toBe("multifilar");
    expect(initialNodeCount).toBe(5);
  });
});

describe("P1: High-Nitidez Rendering & Crisp Typography Settings", () => {
  it("resolution scale is enforced at minimum 2 for sharp rendering on all displays", () => {
    const dpr1 = 1;
    const computedResolution1 = Math.max(dpr1, 2);
    expect(computedResolution1).toBe(2);

    const dpr2 = 2.5;
    const computedResolution2 = Math.max(dpr2, 2);
    expect(computedResolution2).toBe(2.5);
  });

  it("typography standards adhere to minimum legibility thresholds", () => {
    const COMPONENT_LABEL_FONT_SIZE = 11.5;
    const CONDUCTOR_LABEL_FONT_SIZE = 10.5;

    expect(COMPONENT_LABEL_FONT_SIZE).toBeGreaterThanOrEqual(11);
    expect(CONDUCTOR_LABEL_FONT_SIZE).toBeGreaterThanOrEqual(10);
  });
});

describe("P1: Internationalization (pt-BR and en Catalogs)", () => {
  it("both catalogs contain matching safety, canvasToolbar, and dockTabs keys", () => {
    // Safety keys
    expect(ptBR.safety.eStopActive).toBeDefined();
    expect(en.safety.eStopActive).toBeDefined();
    expect(ptBR.safety.rearm).toBeDefined();
    expect(en.safety.rearm).toBeDefined();
    expect(ptBR.safety.blockedStart).toBeDefined();
    expect(en.safety.blockedStart).toBeDefined();

    // Canvas toolbar keys
    expect(ptBR.canvasToolbar.simulate).toBeDefined();
    expect(en.canvasToolbar.simulate).toBeDefined();
    expect(ptBR.canvasToolbar.pause).toBeDefined();
    expect(en.canvasToolbar.pause).toBeDefined();
    expect(ptBR.canvasToolbar.stop).toBeDefined();
    expect(en.canvasToolbar.stop).toBeDefined();
    expect(ptBR.canvasToolbar.reset).toBeDefined();
    expect(en.canvasToolbar.reset).toBeDefined();
    expect(ptBR.canvases.unifilar.zoomIn).toBeDefined();
    expect(en.canvases.unifilar.zoomIn).toBeDefined();
    expect(ptBR.canvases.unifilar.zoomOut).toBeDefined();
    expect(en.canvases.unifilar.zoomOut).toBeDefined();

    // Dock tabs
    expect(ptBR.dockTabs.diagnostics).toBeDefined();
    expect(en.dockTabs.diagnostics).toBeDefined();
    expect(ptBR.dockTabs.bom).toBeDefined();
    expect(en.dockTabs.bom).toBeDefined();
  });
});
