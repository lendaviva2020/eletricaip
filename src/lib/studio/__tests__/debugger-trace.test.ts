import { describe, it, expect } from "vitest";
import { InteractiveDebuggerService } from "../iec/debugger/debugger-service";
import { TraceOscilloscopeEngine } from "../iec/debugger/trace-engine";
import { CompiledProjectIR } from "../iec/compiler/intermediate-representation";
import { TraceConfiguration } from "../canonical/types";

describe("Milestone 5: Interactive Debugger & Trace Oscilloscope Engine", () => {
  const mockIR: CompiledProjectIR = {
    blocks: {
      PRG_Main: {
        pouName: "PRG_Main",
        localVariables: { count: 0 },
        instructions: [
          { op: "LOAD_CONST", arg1: 10, dest: "_t0", sourceLine: 1 },
          { op: "STORE_VAR", arg1: "count", arg2: "_t0", sourceLine: 2 },
          { op: "LOAD_CONST", arg1: 20, dest: "_t1", sourceLine: 3 },
          { op: "ADD", arg1: "count", arg2: "_t1", dest: "_t2", sourceLine: 4 },
          { op: "STORE_VAR", arg1: "count", arg2: "_t2", sourceLine: 5 },
          { op: "RETURN", sourceLine: 6 },
        ],
      },
    },
    globalVariables: { rTankLevel: 50.0 },
    tasksOrder: [{ taskName: "MainTask", pouNames: ["PRG_Main"], intervalMs: 10 }],
  };

  it("InteractiveDebuggerService gerencia breakpoints e pausa a execução", () => {
    const debuggerSvc = new InteractiveDebuggerService(mockIR);

    const bp = debuggerSvc.setBreakpoint("PRG_Main", 3);
    expect(bp.enabled).toBe(true);

    debuggerSvc.resume();
    expect(debuggerSvc.getState()).toBe("PAUSED_BREAKPOINT");
    expect(debuggerSvc.getLastHitBreakpoint()?.sourceLine).toBe(3);
    expect(debuggerSvc.getLastHitBreakpoint()?.hitCount).toBe(1);
  });

  it("Executa passo a passo (Step Instruction e Step Over)", () => {
    const debuggerSvc = new InteractiveDebuggerService(mockIR);
    expect(debuggerSvc.getCurrentLocation().instructionIndex).toBe(0);

    // Passo 1 instrução
    debuggerSvc.stepInstruction();
    expect(debuggerSvc.getCurrentLocation().instructionIndex).toBe(1);

    // Step Over até a próxima linha
    debuggerSvc.stepOver();
    expect(debuggerSvc.getCurrentLocation().instructionIndex).toBeGreaterThan(1);
  });

  it("Gerencia Watch Table com histórico de amostragem e Forcing seguro", () => {
    const debuggerSvc = new InteractiveDebuggerService(mockIR);
    debuggerSvc.addWatch("rTankLevel", "REAL");

    debuggerSvc.stepInstruction();
    const watches = debuggerSvc.getWatches();
    expect(watches.length).toBe(1);
    expect(watches[0].name).toBe("rTankLevel");
    expect(watches[0].currentValue).toBe(50.0);
    expect(watches[0].history.length).toBeGreaterThan(0);

    // Forcing em memória virtual
    debuggerSvc.forceVariable("rTankLevel", 99.9);
    expect(debuggerSvc.getVariableValue("rTankLevel")).toBe(99.9);
    expect(debuggerSvc.getWatches()[0].isForced).toBe(true);

    debuggerSvc.unforceVariable("rTankLevel");
    expect(debuggerSvc.getWatches()[0].isForced).toBe(false);
  });

  it("TraceOscilloscopeEngine captura transitórios com disparo por Threshold e exporta CSV", () => {
    const config: TraceConfiguration = {
      id: "trace-cfg-1",
      projectId: "p1",
      name: "Osciloscopio_Pressao",
      bufferDepthSamples: 10,
      sampleIntervalMs: 10,
      triggerCondition: "THRESHOLD",
      triggerTagId: "rPressure",
      triggerThreshold: 100.0,
      preTriggerSamples: 2,
      channels: [
        {
          id: "ch1",
          tagId: "tag-press",
          name: "rPressure",
          color: "#FF0000",
          minDisplay: 0,
          maxDisplay: 200,
        },
        {
          id: "ch2",
          tagId: "tag-pump",
          name: "bPumpRun",
          color: "#00FF00",
          minDisplay: 0,
          maxDisplay: 1,
        },
      ],
    };

    const trace = new TraceOscilloscopeEngine(config);
    trace.arm();
    expect(trace.isRecording()).toBe(true);

    let pressure = 50.0;
    // Amostras abaixo do threshold
    for (let t = 0; t < 5; t++) {
      trace.recordSample(t * 10, (v) => (v === "rPressure" ? pressure : true));
    }

    // Dispara threshold: pressão sobe para 120.0
    pressure = 120.0;
    trace.recordSample(50, (v) => (v === "rPressure" ? pressure : true));

    // Mais algumas amostras pós-disparo
    for (let t = 6; t < 12; t++) {
      trace.recordSample(t * 10, (v) => (v === "rPressure" ? pressure : true));
    }

    const samples = trace.getSamples();
    expect(samples.length).toBeGreaterThan(0);

    const csv = trace.exportToCSV();
    expect(csv).toContain("Timestamp_ms,rPressure,bPumpRun");
    expect(csv).toContain("120");
  });
});
