/**
 * Host controller for the Compact Studio deterministic runtime.
 * Uses `WorkerManager` off the main thread in browser environments and falls back
 * to the identical pure synchronous `CompactExecutionEngine` in SSR/Node tests.
 */
import type { FbdValue } from "@/lib/fbd/engine";
import { WorkerManager } from "@/lib/workers/worker-manager";
import type { CompactProgramModel } from "../domain/types";
import { CompactExecutionEngine, type CompactRuntimeFrame } from "./compact-execution-engine";
import type { WorkerCommand, WorkerReply } from "./compact-runtime-worker";

let clientSeq = 0;

export class CompactRuntimeClient {
  private manager: WorkerManager<WorkerCommand, WorkerReply> | null = null;
  private syncFallback: CompactExecutionEngine | null = null;
  private readonly useWorker: boolean;

  constructor(opts?: { readonly forceSync?: boolean; readonly requestTimeoutMs?: number }) {
    const hasWorker = !opts?.forceSync && typeof Worker !== "undefined";
    this.useWorker = hasWorker;
    if (hasWorker) {
      this.manager = new WorkerManager<WorkerCommand, WorkerReply>({
        name: `compact-studio-runtime-${++clientSeq}`,
        requestTimeoutMs: opts?.requestTimeoutMs ?? 3000,
        factory: () =>
          new Worker(new URL("./compact-runtime-worker.ts", import.meta.url), {
            type: "module",
          }),
      });
    }
  }

  public async load(program: CompactProgramModel, baseEpochMs?: number): Promise<void> {
    if (this.useWorker && this.manager) {
      const res = await this.manager.request({
        op: "load",
        program,
        baseEpochMs,
      } as Omit<WorkerCommand, "reqId">);
      if (!res.ok) throw new Error(res.error);
      return;
    }
    this.syncFallback = new CompactExecutionEngine(program, baseEpochMs);
  }

  public async step(
    dtMs?: number,
    inputs?: Record<string, FbdValue>,
  ): Promise<CompactRuntimeFrame | null> {
    if (this.useWorker && this.manager) {
      if (this.manager.isBusy) return null;
      const res = await this.manager.request({
        op: "step",
        dtMs,
        inputs,
      } as Omit<WorkerCommand, "reqId">);
      if (!res.ok) throw new Error(res.error);
      return res.frame;
    }
    if (!this.syncFallback) throw new Error("Runtime não inicializado.");
    if (inputs) {
      for (const [k, v] of Object.entries(inputs)) this.syncFallback.setInput(k, v);
    }
    return this.syncFallback.step(dtMs);
  }

  public async advance(
    totalMs: number,
    inputs?: Record<string, FbdValue>,
  ): Promise<CompactRuntimeFrame | null> {
    if (this.useWorker && this.manager) {
      const res = await this.manager.request({
        op: "advance",
        totalMs,
        inputs,
      } as Omit<WorkerCommand, "reqId">);
      if (!res.ok) throw new Error(res.error);
      return res.frame;
    }
    if (!this.syncFallback) throw new Error("Runtime não inicializado.");
    if (inputs) {
      for (const [k, v] of Object.entries(inputs)) this.syncFallback.setInput(k, v);
    }
    return this.syncFallback.advanceMs(totalMs);
  }

  public async jumpClock(targetEpochMs: number): Promise<void> {
    if (this.useWorker && this.manager) {
      const res = await this.manager.request({
        op: "jumpClock",
        targetEpochMs,
      } as Omit<WorkerCommand, "reqId">);
      if (!res.ok) throw new Error(res.error);
      return;
    }
    this.syncFallback?.jumpClock(targetEpochMs);
  }

  public async force(nodeId: string, port: string, value: FbdValue): Promise<void> {
    if (this.useWorker && this.manager) {
      const res = await this.manager.request({
        op: "force",
        nodeId,
        port,
        value,
      } as Omit<WorkerCommand, "reqId">);
      if (!res.ok) throw new Error(res.error);
      return;
    }
    this.syncFallback?.forceOutput(nodeId, port, value);
  }

  public async unforce(nodeId: string, port: string): Promise<void> {
    if (this.useWorker && this.manager) {
      const res = await this.manager.request({
        op: "unforce",
        nodeId,
        port,
      } as Omit<WorkerCommand, "reqId">);
      if (!res.ok) throw new Error(res.error);
      return;
    }
    this.syncFallback?.unforceOutput(nodeId, port);
  }

  public async reset(baseEpochMs?: number): Promise<void> {
    if (this.useWorker && this.manager) {
      const res = await this.manager.request({
        op: "reset",
        baseEpochMs,
      } as Omit<WorkerCommand, "reqId">);
      if (!res.ok) throw new Error(res.error);
      return;
    }
    this.syncFallback?.reset(baseEpochMs);
  }

  public dispose(): void {
    this.manager?.terminate();
    this.manager = null;
    this.syncFallback = null;
  }
}
