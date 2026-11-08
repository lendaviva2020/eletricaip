// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — STANDARD IEC 61131-3 FUNCTION BLOCKS
// TON, TOF, TP, CTU, CTD, CTUD, R_TRIG, F_TRIG, SR, RS & PID Controller
// ============================================================================

export class TonBlock {
  public Q = false;
  public ET = 0; // ms
  private running = false;
  private startTime = 0;

  public execute(IN: boolean, PT_ms: number, deltaMs: number): void {
    if (!IN) {
      this.Q = false;
      this.ET = 0;
      this.running = false;
    } else {
      this.running = true;
      this.ET += deltaMs;
      if (this.ET >= PT_ms) {
        this.ET = PT_ms;
        this.Q = true;
      } else {
        this.Q = false;
      }
    }
  }
}

export class TofBlock {
  public Q = false;
  public ET = 0;
  private running = false;

  public execute(IN: boolean, PT_ms: number, deltaMs: number): void {
    if (IN) {
      this.Q = true;
      this.ET = 0;
      this.running = false;
    } else {
      if (this.Q) {
        this.running = true;
        this.ET += deltaMs;
        if (this.ET >= PT_ms) {
          this.ET = PT_ms;
          this.Q = false;
          this.running = false;
        }
      }
    }
  }
}

export class TpBlock {
  public Q = false;
  public ET = 0;
  private running = false;

  public execute(IN: boolean, PT_ms: number, deltaMs: number): void {
    if (!this.running) {
      if (IN) {
        this.running = true;
        this.Q = true;
        this.ET = 0;
      } else {
        this.Q = false;
        this.ET = 0;
      }
    } else {
      this.ET += deltaMs;
      if (this.ET >= PT_ms) {
        this.ET = PT_ms;
        this.Q = false;
        if (!IN) {
          this.running = false;
        }
      }
    }
  }
}

export class CtuBlock {
  public Q = false;
  public CV = 0;
  private lastCU = false;

  public execute(CU: boolean, RESET: boolean, PV: number): void {
    if (RESET) {
      this.CV = 0;
      this.Q = false;
    } else {
      // Borda de subida em CU
      if (CU && !this.lastCU) {
        if (this.CV < 32767) {
          this.CV++;
        }
      }
      this.Q = this.CV >= PV;
    }
    this.lastCU = CU;
  }
}

export class RTrigBlock {
  public Q = false;
  private lastCLK = false;

  public execute(CLK: boolean): void {
    this.Q = CLK && !this.lastCLK;
    this.lastCLK = CLK;
  }
}

export class FTrigBlock {
  public Q = false;
  private lastCLK = false;

  public execute(CLK: boolean): void {
    this.Q = !CLK && this.lastCLK;
    this.lastCLK = CLK;
  }
}

export class SrBlock {
  public Q1 = false;

  public execute(S1: boolean, R: boolean): void {
    // S1 tem prioridade (Set dominante)
    if (S1) {
      this.Q1 = true;
    } else if (R) {
      this.Q1 = false;
    }
  }
}

export class RsBlock {
  public Q1 = false;

  public execute(S: boolean, R1: boolean): void {
    // R1 tem prioridade (Reset dominante)
    if (R1) {
      this.Q1 = false;
    } else if (S) {
      this.Q1 = true;
    }
  }
}

export class PidBlock {
  public Y = 0; // Saída manipulada (%)
  private integral = 0;
  private lastError = 0;

  public execute(
    ACTUAL: number,
    SETPOINT: number,
    KP: number,
    TN: number, // Tempo integral (s)
    TV: number, // Tempo derivativo (s)
    deltaSec: number,
    MANUAL = false,
    YMANUAL = 0,
  ): void {
    if (MANUAL) {
      this.Y = Math.max(0, Math.min(100, YMANUAL));
      this.integral = this.Y;
      this.lastError = SETPOINT - ACTUAL;
      return;
    }

    const error = SETPOINT - ACTUAL;
    // P
    const pTerm = KP * error;

    // I (com anti-windup clamping)
    if (TN > 0) {
      this.integral += (KP / TN) * error * deltaSec;
      this.integral = Math.max(0, Math.min(100, this.integral));
    }

    // D
    const dTerm = TV > 0 && deltaSec > 0 ? KP * TV * ((error - this.lastError) / deltaSec) : 0;

    let output = pTerm + this.integral + dTerm;
    output = Math.max(0, Math.min(100, output));

    this.Y = output;
    this.lastError = error;
  }
}
