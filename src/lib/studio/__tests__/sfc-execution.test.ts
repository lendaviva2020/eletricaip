import { describe, it, expect } from "vitest";
import { SFCEngine } from "../iec/sfc/sfc-engine";
import type { SFCStep, SFCTransition, SFCAction } from "../canonical/types";

describe("IEC 61131-3 Sequential Function Chart (SFC) Engine", () => {
  it("should initialize with initial steps active and step timer at 0", () => {
    const steps: SFCStep[] = [
      {
        id: "step-init",
        stepNumber: 0,
        name: "InitStep",
        isInitial: true,
        isActive: true,
        timeInStepMs: 0,
        actions: [{ id: "act-1", actionName: "ReadyAction", qualifier: "N", stCode: "bReady := TRUE;" }],
        x: 0,
        y: 0,
      },
      {
        id: "step-run",
        stepNumber: 1,
        name: "RunStep",
        isInitial: false,
        isActive: false,
        timeInStepMs: 0,
        actions: [],
        x: 0,
        y: 100,
      },
    ];

    const transitions: SFCTransition[] = [
      {
        id: "trans-1",
        fromStepIds: ["step-init"],
        toStepIds: ["step-run"],
        conditionST: "bStart = TRUE",
        isSatisfied: false,
        x: 0,
        y: 50,
      },
    ];

    const engine = new SFCEngine(steps, transitions);
    const state = engine.getState();

    expect(state.activeStepIds.has("step-init")).toBe(true);
    expect(state.activeStepIds.has("step-run")).toBe(false);
    expect(state.stepTimers.get("step-init")).toBe(0);
  });

  it("should accumulate step timer and fire transition when condition is met", () => {
    const steps: SFCStep[] = [
      {
        id: "step-fill",
        stepNumber: 0,
        name: "FillTank",
        isInitial: true,
        isActive: true,
        timeInStepMs: 0,
        actions: [],
        x: 0,
        y: 0,
      },
      {
        id: "step-mix",
        stepNumber: 1,
        name: "MixIngredients",
        isInitial: false,
        isActive: false,
        timeInStepMs: 0,
        actions: [],
        x: 0,
        y: 100,
      },
    ];

    const transitions: SFCTransition[] = [
      {
        id: "trans-fill-to-mix",
        fromStepIds: ["step-fill"],
        toStepIds: ["step-mix"],
        conditionST: "rLevel >= 80.0",
        isSatisfied: false,
        x: 0,
        y: 50,
      },
    ];

    const engine = new SFCEngine(steps, transitions);
    const noopDispatch = (action: SFCAction, isActive: boolean) => {};

    // Cycle 1: Condition false, delta 50ms
    engine.executeCycle(50, () => false, noopDispatch);
    expect(engine.getState().activeStepIds.has("step-fill")).toBe(true);
    expect(engine.getState().activeStepIds.has("step-mix")).toBe(false);
    expect(engine.getState().stepTimers.get("step-fill")).toBe(50);

    // Cycle 2: Condition becomes true, delta 50ms
    engine.executeCycle(50, () => true, noopDispatch);
    expect(engine.getState().activeStepIds.has("step-fill")).toBe(false);
    expect(engine.getState().activeStepIds.has("step-mix")).toBe(true);
    expect(engine.getState().stepTimers.get("step-mix")).toBe(0);
  });

  it("should handle action qualifiers N, S, R and recognize stored actions", () => {
    const steps: SFCStep[] = [
      {
        id: "step-set",
        stepNumber: 0,
        name: "SetActionStep",
        isInitial: true,
        isActive: true,
        timeInStepMs: 0,
        actions: [
          { id: "act-s", actionName: "PumpRunAction", qualifier: "S", stCode: "bPumpRunning := TRUE;" },
          { id: "act-n", actionName: "ValveOpenAction", qualifier: "N", stCode: "bValveOpen := TRUE;" },
        ],
        x: 0,
        y: 0,
      },
      {
        id: "step-reset",
        stepNumber: 1,
        name: "ResetActionStep",
        isInitial: false,
        isActive: false,
        timeInStepMs: 0,
        actions: [
          { id: "act-r", actionName: "PumpStopAction", qualifier: "R", stCode: "bPumpRunning := FALSE;" },
        ],
        x: 0,
        y: 100,
      },
    ];

    const transitions: SFCTransition[] = [
      {
        id: "trans-to-reset",
        fromStepIds: ["step-set"],
        toStepIds: ["step-reset"],
        conditionST: "TRUE",
        isSatisfied: false,
        x: 0,
        y: 50,
      },
    ];

    const engine = new SFCEngine(steps, transitions);
    const noopDispatch = (action: SFCAction, isActive: boolean) => {};

    // First cycle in step-set: S actions stored, N actions active
    engine.executeCycle(20, () => false, noopDispatch);
    expect(engine.getState().storedActions.has("PumpRunAction")).toBe(true);

    // Advance to step-reset (trans-to-reset fires)
    engine.executeCycle(20, () => true, noopDispatch);
    expect(engine.getState().activeStepIds.has("step-reset")).toBe(true);

    // In step-reset, act-r is dispatched
    let resetDispatched = false;
    engine.executeCycle(20, () => false, (action) => {
      if (action.id === "act-r") {
        resetDispatched = true;
        engine.getState().storedActions.delete("PumpRunAction");
      }
    });
    expect(resetDispatched).toBe(true);
    expect(engine.getState().storedActions.has("PumpRunAction")).toBe(false);
  });

  it("should detect deadlock when active steps have no outgoing transitions", () => {
    const steps: SFCStep[] = [
      {
        id: "step-orphan",
        stepNumber: 0,
        name: "OrphanStep",
        isInitial: true,
        isActive: true,
        timeInStepMs: 0,
        actions: [],
        x: 0,
        y: 0,
      },
    ];

    // No transitions defined
    const transitions: SFCTransition[] = [];
    const engine = new SFCEngine(steps, transitions);

    engine.executeCycle(50, () => false, () => {});
    expect(engine.getState().isDeadlocked).toBe(true);
    expect(engine.getState().deadlockReason).toContain("Nenhuma transição de saída");
  });
});
