import { describe, it, expect } from "vitest";
import { IECTaskScheduler } from "../iec/runtime/task-scheduler";
import { TonBlock, TofBlock, CtuBlock, PidBlock } from "../iec/runtime/standard-blocks";
import { IndustrialProjectService } from "../canonical/project-service";
import { IECCompilerPipeline } from "../iec/compiler/compiler-pipeline";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "../canonical/types";

describe("IEC Standard Function Blocks", () => {
  it("TON (Timer On-Delay) should activate Q after PT elapsed time", () => {
    const ton = new TonBlock();

    // Initial state: IN = false
    ton.execute(false, 100, 0);
    expect(ton.Q).toBe(false);
    expect(ton.ET).toBe(0);

    // IN goes true, step 50ms (PT = 100ms)
    ton.execute(true, 100, 50);
    expect(ton.Q).toBe(false);
    expect(ton.ET).toBe(50);

    // Step another 50ms (total 100ms >= PT)
    ton.execute(true, 100, 50);
    expect(ton.Q).toBe(true);
    expect(ton.ET).toBe(100);

    // IN goes false -> immediate reset
    ton.execute(false, 100, 20);
    expect(ton.Q).toBe(false);
    expect(ton.ET).toBe(0);
  });

  it("TOF (Timer Off-Delay) should keep Q true until PT elapsed after falling edge", () => {
    const tof = new TofBlock();

    // IN is true -> Q is immediately true
    tof.execute(true, 100, 10);
    expect(tof.Q).toBe(true);
    expect(tof.ET).toBe(0);

    // IN falls to false -> timer starts
    tof.execute(false, 100, 40);
    expect(tof.Q).toBe(true);
    expect(tof.ET).toBe(40);

    // Step another 60ms (total 100ms >= PT)
    tof.execute(false, 100, 60);
    expect(tof.Q).toBe(false);
    expect(tof.ET).toBe(100);
  });

  it("CTU (Counter Up) should count rising edges up to PV and trip Q", () => {
    const ctu = new CtuBlock();

    // PV = 3. Initial edge 1
    ctu.execute(true, false, 3);
    expect(ctu.CV).toBe(1);
    expect(ctu.Q).toBe(false);

    // Fall to false (no count)
    ctu.execute(false, false, 3);
    expect(ctu.CV).toBe(1);

    // Edge 2
    ctu.execute(true, false, 3);
    expect(ctu.CV).toBe(2);
    expect(ctu.Q).toBe(false);

    // Edge 3 -> reaches PV
    ctu.execute(false, false, 3);
    ctu.execute(true, false, 3);
    expect(ctu.CV).toBe(3);
    expect(ctu.Q).toBe(true);

    // RESET trips back to 0
    ctu.execute(false, true, 3);
    expect(ctu.CV).toBe(0);
    expect(ctu.Q).toBe(false);
  });

  it("PID Block should calculate proportional and integral output within limits", () => {
    const pid = new PidBlock();

    // ACTUAL = 40.0, SETPOINT = 50.0 (Error = +10.0), KP = 2.0, TN = 10s, TV = 0s, deltaSec = 0.1s
    pid.execute(40.0, 50.0, 2.0, 10.0, 0, 0.1);
    // Proportional term = 10 * 2 = 20.0, plus integral
    expect(pid.Y).toBeGreaterThanOrEqual(20.0);
    expect(pid.Y).toBeLessThanOrEqual(100.0);
  });
});

describe("IEC Task Scheduler & Deterministic Simulation", () => {
  it("should enforce IS_PHYSICAL_CONTROL_ALLOWED === false", () => {
    expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);
  });

  it("should initialize process images %I, %Q, %M and execute scan cycles", () => {
    const project = IndustrialProjectService.createSampleIndustrialProject(
      "tenant-sim",
      "SimStation",
    );
    const compileResult = IECCompilerPipeline.compile(project);
    expect(compileResult.success).toBe(true);
    expect(compileResult.compiledIR).toBeDefined();
    if (!compileResult.compiledIR) return;

    const scheduler = new IECTaskScheduler(compileResult.compiledIR);

    expect(scheduler.cycleCount).toBe(0);
    expect(scheduler.totalSimulatedTimeMs).toBe(0);

    // Run 5 scan cycles (20ms each)
    for (let i = 0; i < 5; i++) {
      scheduler.singleCycle(20);
    }

    expect(scheduler.cycleCount).toBe(5);
    expect(scheduler.totalSimulatedTimeMs).toBe(100);
  });

  it("should support simulated in-memory variable forcing without touching physical hardware", () => {
    const project = IndustrialProjectService.createSampleIndustrialProject(
      "tenant-force",
      "ForceStation",
    );
    const compileResult = IECCompilerPipeline.compile(project);
    expect(compileResult.compiledIR).toBeDefined();
    if (!compileResult.compiledIR) return;

    const scheduler = new IECTaskScheduler(compileResult.compiledIR);

    // Force variable to 999.0
    scheduler.forceVariable("rTankLevel", 999.0);
    expect(scheduler.forcedVariables["rTankLevel"]).toBe(999.0);

    // Execute cycle - value should remain forced in globalVariables
    scheduler.singleCycle(20);
    expect(scheduler.globalVariables["rTankLevel"]).toBe(999.0);

    // Release force
    scheduler.unforceVariable("rTankLevel");
    expect(scheduler.forcedVariables["rTankLevel"]).toBeUndefined();
  });
});
