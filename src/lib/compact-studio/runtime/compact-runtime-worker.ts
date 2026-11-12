/**
 * Dedicated Web Worker executing CompactExecutionEngine off the UI main thread.
 * Zero eval, zero new Function, zero network calls, deterministic SimulatedClock only.
 */
import type { FbdValue } from "@/lib/fbd/engine";
import type { CompactProgramModel } from "../domain/types";
import { parseCompactProgramModel } from "../domain/schemas";
import { CompactExecutionEngine, type CompactRuntimeFrame } from "./compact-execution-engine";

export type WorkerCommand =
  | { reqId: number; op: "load"; program: CompactProgramModel; baseEpochMs?: number }
  | { reqId: number; op: "step"; dtMs?: number; inputs?: Record<string, FbdValue> }
  | { reqId: number; op: "advance"; totalMs: number; inputs?: Record<string, FbdValue> }
  | { reqId: number; op: "jumpClock"; targetEpochMs: number }
  | { reqId: number; op: "force"; nodeId: string; port: string; value: FbdValue }
  | { reqId: number; op: "unforce"; nodeId: string; port: string }
  | { reqId: number; op: "reset"; baseEpochMs?: number };

export type WorkerReply =
  | { reqId: number; ok: true; frame: CompactRuntimeFrame | null }
  | { reqId: number; ok: false; error: string };

let engine: CompactExecutionEngine | null = null;

self.addEventListener("message", (ev: MessageEvent<WorkerCommand>) => {
  const msg = ev.data;
  try {
    switch (msg.op) {
      case "load": {
        const parsed = parseCompactProgramModel(msg.program);
        if (!parsed.ok) {
          self.postMessage({
            reqId: msg.reqId,
            ok: false,
            error: `Schema inválido no Worker: ${parsed.errors[0] ?? "erro"}`,
          } satisfies WorkerReply);
          return;
        }
        engine = new CompactExecutionEngine(parsed.model, msg.baseEpochMs);
        self.postMessage({
          reqId: msg.reqId,
          ok: true,
          frame: null,
        } satisfies WorkerReply);
        return;
      }
      case "step": {
        if (!engine) throw new Error("Engine não carregado no Worker.");
        if (msg.inputs) {
          for (const [k, v] of Object.entries(msg.inputs)) engine.setInput(k, v);
        }
        const frame = engine.step(msg.dtMs);
        self.postMessage({ reqId: msg.reqId, ok: true, frame } satisfies WorkerReply);
        return;
      }
      case "advance": {
        if (!engine) throw new Error("Engine não carregado no Worker.");
        if (msg.inputs) {
          for (const [k, v] of Object.entries(msg.inputs)) engine.setInput(k, v);
        }
        const frame = engine.advanceMs(msg.totalMs);
        self.postMessage({ reqId: msg.reqId, ok: true, frame } satisfies WorkerReply);
        return;
      }
      case "jumpClock": {
        if (!engine) throw new Error("Engine não carregado no Worker.");
        engine.jumpClock(msg.targetEpochMs);
        self.postMessage({ reqId: msg.reqId, ok: true, frame: null } satisfies WorkerReply);
        return;
      }
      case "force": {
        if (!engine) throw new Error("Engine não carregado no Worker.");
        engine.forceOutput(msg.nodeId, msg.port, msg.value);
        self.postMessage({ reqId: msg.reqId, ok: true, frame: null } satisfies WorkerReply);
        return;
      }
      case "unforce": {
        if (!engine) throw new Error("Engine não carregado no Worker.");
        engine.unforceOutput(msg.nodeId, msg.port);
        self.postMessage({ reqId: msg.reqId, ok: true, frame: null } satisfies WorkerReply);
        return;
      }
      case "reset": {
        engine?.reset(msg.baseEpochMs);
        self.postMessage({ reqId: msg.reqId, ok: true, frame: null } satisfies WorkerReply);
        return;
      }
    }
  } catch (err) {
    self.postMessage({
      reqId: msg.reqId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerReply);
  }
});
