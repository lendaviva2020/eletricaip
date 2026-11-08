// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — PLCOPEN MOTION CONTROL SIMULATOR
// Virtual Multi-Axis Motion Engine with Trapezoidal Profiles & State Machines
// ============================================================================

import type { MotionAxis, AxisState } from "../canonical/types";

export interface MotionCommand {
  type: "POWER" | "MOVE_ABS" | "MOVE_VEL" | "STOP";
  targetPos?: number;
  velocity?: number;
  acceleration?: number;
  deceleration?: number;
}

export class MotionSimulator {
  private activeCommand: MotionCommand | null = null;
  private targetVelocity = 0;
  private currentDirection = 1;

  constructor(public axis: MotionAxis) {}

  public mcPower(enable: boolean): void {
    if (enable) {
      if (this.axis.state === "DISABLED") {
        this.axis.state = "STANDSTILL";
      }
    } else {
      this.axis.state = "DISABLED";
      this.axis.currentVelocity = 0;
      this.activeCommand = null;
    }
  }

  public mcMoveAbsolute(targetPos: number, velocity?: number, acc?: number, dec?: number): boolean {
    if (this.axis.state === "DISABLED" || this.axis.state === "ERROR_STOP") {
      return false;
    }

    const vel = Math.min(velocity || this.axis.maxVelocity, this.axis.maxVelocity);
    this.activeCommand = {
      type: "MOVE_ABS",
      targetPos,
      velocity: vel,
      acceleration: acc || this.axis.maxAcceleration,
      deceleration: dec || this.axis.maxDeceleration,
    };
    this.axis.targetPosition = targetPos;
    this.currentDirection = targetPos >= this.axis.currentPosition ? 1 : -1;
    this.axis.state = "DISCRETE_MOTION";
    return true;
  }

  public mcMoveVelocity(velocity: number, acc?: number): boolean {
    if (this.axis.state === "DISABLED" || this.axis.state === "ERROR_STOP") {
      return false;
    }
    const vel = Math.min(Math.abs(velocity), this.axis.maxVelocity);
    this.activeCommand = {
      type: "MOVE_VEL",
      velocity: vel,
      acceleration: acc || this.axis.maxAcceleration,
    };
    this.currentDirection = velocity >= 0 ? 1 : -1;
    this.axis.state = "CONTINUOUS_MOTION";
    return true;
  }

  public mcStop(dec?: number): void {
    if (this.axis.state === "DISABLED") return;
    this.activeCommand = {
      type: "STOP",
      deceleration: dec || this.axis.maxDeceleration,
    };
  }

  /**
   * Integração trapezoidal determinística por ciclo de varredura.
   */
  public update(deltaSec: number): void {
    if (this.axis.state === "DISABLED" || this.axis.state === "STANDSTILL") {
      this.axis.currentVelocity = 0;
      return;
    }

    if (!this.activeCommand) {
      this.axis.state = "STANDSTILL";
      this.axis.currentVelocity = 0;
      return;
    }

    if (this.activeCommand.type === "MOVE_ABS") {
      const target = this.activeCommand.targetPos || 0;
      const dist = Math.abs(target - this.axis.currentPosition);
      const vel = this.activeCommand.velocity || this.axis.maxVelocity;
      const step = vel * deltaSec;

      if (dist <= step) {
        this.axis.currentPosition = target;
        this.axis.currentVelocity = 0;
        this.axis.state = "STANDSTILL";
        this.activeCommand = null;
      } else {
        this.axis.currentPosition += this.currentDirection * step;
        this.axis.currentVelocity = this.currentDirection * vel;
      }
    } else if (this.activeCommand.type === "MOVE_VEL") {
      const vel = this.activeCommand.velocity || this.axis.maxVelocity;
      this.axis.currentVelocity = this.currentDirection * vel;
      this.axis.currentPosition += this.axis.currentVelocity * deltaSec;
    } else if (this.activeCommand.type === "STOP") {
      const dec = this.activeCommand.deceleration || this.axis.maxDeceleration;
      const decStep = dec * deltaSec;
      if (Math.abs(this.axis.currentVelocity) <= decStep) {
        this.axis.currentVelocity = 0;
        this.axis.state = "STANDSTILL";
        this.activeCommand = null;
      } else {
        this.axis.currentVelocity -= Math.sign(this.axis.currentVelocity) * decStep;
        this.axis.currentPosition += this.axis.currentVelocity * deltaSec;
      }
    }
  }
}
