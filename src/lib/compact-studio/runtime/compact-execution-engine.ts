/**
 * Deterministic Execution Engine wrapping the single shared `FbdRuntime` + `SimulatedClock`.
 * Suitable for direct synchronous testing in Node/Vitest as well as Web Worker execution.
 */
import {
  FbdRuntime,
  type FbdValue,
  type RuntimeFault,
  type RuntimeSnapshot,
} from "@/lib/fbd/engine";
import type { CompactProgramModel } from "../domain/types";
import { getCompactStudioRegistry, SIM_CLOCK_VAR_NAME } from "./compact-blocks";
import { compileCompactProgram, type CompiledCompactMapping } from "./compact-compiler";
import {
  advanceSimulatedClock,
  createSimulatedClock,
  getSimulatedEpochMs,
  jumpSimulatedClockTo,
  type SimulatedClock,
} from "./simulated-clock";

export interface CompactDataLogEntry {
  readonly seq: number;
  readonly epochMs: number;
  readonly nodeId: string;
  readonly label: string;
  readonly v1: number;
  readonly v2: number;
}

export interface CompactActiveMessage {
  readonly nodeId: string;
  readonly instanceName: string;
  readonly text: string;
}

export interface CompactRuntimeFrame {
  readonly scans: number;
  readonly elapsedMs: number;
  readonly clockEpochMs: number;
  readonly faults: readonly RuntimeFault[];
  readonly variables: Readonly<Record<string, FbdValue>>;
  readonly outputs: Readonly<Record<string, Readonly<Record<string, FbdValue>>>>;
  readonly activeMessages: readonly CompactActiveMessage[];
  readonly dataLogs: readonly CompactDataLogEntry[];
}

export class CompactExecutionEngine {
  private readonly mapping: CompiledCompactMapping;
  private readonly runtime: FbdRuntime | null;
  private clock: SimulatedClock;
  private readonly dataLogs: CompactDataLogEntry[] = [];
  private lastDataLogSeqByNode = new Map<string, number>();

  constructor(
    private readonly model: CompactProgramModel,
    baseEpochMs?: number,
  ) {
    this.clock = createSimulatedClock(baseEpochMs);
    this.mapping = compileCompactProgram(model);
    if (this.mapping.compileResult.ok && this.mapping.compileResult.ir) {
      this.runtime = new FbdRuntime(this.mapping.compileResult.ir, getCompactStudioRegistry());
      this.runtime.setVariable(SIM_CLOCK_VAR_NAME, getSimulatedEpochMs(this.clock));
    } else {
      this.runtime = null;
    }
  }

  public get compileOk(): boolean {
    return this.mapping.compileResult.ok;
  }

  public get diagnostics() {
    return this.mapping.compileResult.diagnostics;
  }

  public setInput(nameOrAddress: string, value: FbdValue): void {
    if (!this.runtime) return;
    const mapped = this.mapping.fbdDocument.variables.find(
      (v) => v.name === nameOrAddress || v.address === nameOrAddress,
    );
    if (mapped) {
      this.runtime.setVariable(mapped.name, value);
    }
  }

  public forceOutput(nodeId: string, port: string, value: FbdValue): void {
    this.runtime?.force(nodeId, port, value);
  }

  public unforceOutput(nodeId: string, port: string): void {
    this.runtime?.unforce(nodeId, port);
  }

  public jumpClock(targetEpochMs: number): void {
    this.clock = jumpSimulatedClockTo(this.clock, targetEpochMs);
    this.runtime?.setVariable(SIM_CLOCK_VAR_NAME, getSimulatedEpochMs(this.clock));
  }

  public reset(baseEpochMs?: number): void {
    this.clock = createSimulatedClock(baseEpochMs);
    this.dataLogs.length = 0;
    this.lastDataLogSeqByNode.clear();
    if (this.runtime) {
      this.runtime.reset();
      this.runtime.setVariable(SIM_CLOCK_VAR_NAME, getSimulatedEpochMs(this.clock));
    }
  }

  public step(dtMs = this.model.cycleTimeMs): CompactRuntimeFrame {
    if (!this.runtime) {
      return {
        scans: 0,
        elapsedMs: this.clock.elapsedMs,
        clockEpochMs: getSimulatedEpochMs(this.clock),
        faults: this.mapping.compileResult.diagnostics.map((d) => ({
          nodeId: d.nodeId ?? "",
          instanceName: "",
          code: d.code,
          message: d.message,
        })),
        variables: {},
        outputs: {},
        activeMessages: [],
        dataLogs: [],
      };
    }

    this.clock = advanceSimulatedClock(this.clock, dtMs);
    const epochMs = getSimulatedEpochMs(this.clock);
    this.runtime.setVariable(SIM_CLOCK_VAR_NAME, epochMs);

    const report = this.runtime.scan(dtMs);
    const snap = this.runtime.exportSnapshot();

    const activeMessages: CompactActiveMessage[] = [];
    for (const node of this.model.nodes) {
      const outs = snap.outputs[node.id];
      if (!outs) continue;

      if (
        node.blockType === "MESSAGE_TEXT" &&
        outs.ACTIVE === true &&
        typeof outs.TEXT === "string"
      ) {
        activeMessages.push({
          nodeId: node.id,
          instanceName: node.instanceName,
          text: outs.TEXT,
        });
      }

      if (
        node.blockType === "DATA_LOG" &&
        typeof outs.LAST_RECORD === "string" &&
        outs.LAST_RECORD !== ""
      ) {
        const count = typeof outs.COUNT === "number" ? outs.COUNT : 0;
        const prevSeq = this.lastDataLogSeqByNode.get(node.id) ?? 0;
        if (count > prevSeq) {
          this.lastDataLogSeqByNode.set(node.id, count);
          try {
            const parsed = JSON.parse(outs.LAST_RECORD) as {
              seq?: number;
              epochMs?: number;
              label?: string;
              v1?: number;
              v2?: number;
            };
            this.dataLogs.push({
              seq: parsed.seq ?? count,
              epochMs: parsed.epochMs ?? epochMs,
              nodeId: node.id,
              label: parsed.label ?? node.instanceName,
              v1: parsed.v1 ?? 0,
              v2: parsed.v2 ?? 0,
            });
            if (this.dataLogs.length > 2000) this.dataLogs.shift();
          } catch {
            // Ignore malformed log string
          }
        }
      }
    }

    return {
      scans: snap.scans,
      elapsedMs: snap.elapsedMs,
      clockEpochMs: epochMs,
      faults: report.faults,
      variables: snap.variables,
      outputs: snap.outputs,
      activeMessages,
      dataLogs: [...this.dataLogs],
    };
  }

  public advanceMs(totalMs: number): CompactRuntimeFrame {
    const stepMs = Math.max(1, this.model.cycleTimeMs);
    const steps = Math.max(1, Math.round(totalMs / stepMs));
    let last = this.step(stepMs);
    for (let i = 1; i < steps; i++) {
      last = this.step(stepMs);
    }
    return last;
  }

  public exportRuntimeSnapshot(): RuntimeSnapshot | null {
    return this.runtime ? this.runtime.exportSnapshot() : null;
  }
}
