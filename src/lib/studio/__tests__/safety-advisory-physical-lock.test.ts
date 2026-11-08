import { describe, it, expect } from "vitest";
import { SafetyEngineeringAdvisory } from "../safety/safety-advisory";
import { MotionSimulator } from "../motion/motion-simulator";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "../canonical/types";
import type { MotionAxis } from "../canonical/types";

describe("Safety Advisory Engine & Strict Physical Control Lock", () => {
  it("must enforce IS_PHYSICAL_CONTROL_ALLOWED === false globally", () => {
    expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);
  });

  it("should detect dual-channel discrepancy when channels differ beyond discrepancy time", () => {
    // Both active -> compliant
    const res1 = SafetyEngineeringAdvisory.analyzeEStopTopology(true, true, 0, 100);
    expect(res1.isCompliantWithDualChannel).toBe(true);
    expect(res1.issues).toHaveLength(0);

    // Channel 1 false, Channel 2 true, 50ms (within 100ms tolerance)
    const res2 = SafetyEngineeringAdvisory.analyzeEStopTopology(false, true, 50, 100);
    expect(res2.isCompliantWithDualChannel).toBe(true);
    expect(res2.issues[0]).toContain("transitória");

    // Discrepancy 150ms (> 100ms tolerance)
    const res3 = SafetyEngineeringAdvisory.analyzeEStopTopology(false, true, 150, 100);
    expect(res3.isCompliantWithDualChannel).toBe(false);
    expect(res3.diagnosticCoverageEstimate).toBe("LOW");
    expect(res3.issues[0]).toContain("DISCREPÂNCIA DE CANAL DETECTADA");
  });

  it("should return the mandatory non-SIL advisory disclaimer", () => {
    const disclaimer = SafetyEngineeringAdvisory.LEGAL_DISCLAIMER;

    expect(disclaimer).toContain("IS_PHYSICAL_CONTROL_ALLOWED = false");
    expect(disclaimer).toContain("NÃO substitui relés de segurança certificados");
  });
});

describe("PLCopen Motion Control Simulation", () => {
  it("should follow PLCopen state machine: DISABLED -> STANDSTILL -> MOVING -> STANDSTILL", () => {
    const axis: MotionAxis = {
      id: "axis-1",
      projectId: "proj-1",
      name: "ConveyorAxis",
      axisIndex: 0,
      state: "DISABLED",
      currentPosition: 0,
      targetPosition: 0,
      currentVelocity: 0,
      maxVelocity: 500,
      maxAcceleration: 1000,
      maxDeceleration: 1000,
      unit: "mm",
      isVirtual: true,
    };

    const motion = new MotionSimulator(axis);
    expect(motion.axis.state).toBe("DISABLED");

    // mcPower(true) -> STANDSTILL
    motion.mcPower(true);
    expect(motion.axis.state).toBe("STANDSTILL");

    // mcMoveAbsolute(target: 100, velocity: 100)
    motion.mcMoveAbsolute(100, 100);
    expect(motion.axis.state).toBe("DISCRETE_MOTION");

    // Step simulation 0.5s (500ms)
    motion.update(0.5);
    expect(motion.axis.currentPosition).toBeGreaterThan(0);

    // Step simulation another 0.6s -> reaches 100mm target
    motion.update(0.6);
    expect(motion.axis.currentPosition).toBe(100);
    expect(motion.axis.state).toBe("STANDSTILL");

    // mcMoveVelocity + mcStop
    motion.mcMoveVelocity(50);
    expect(motion.axis.state).toBe("CONTINUOUS_MOTION");
    motion.mcStop(500);
    motion.update(0.2);
    expect(motion.axis.state).toBe("STANDSTILL");
  });
});
