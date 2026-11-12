/**
 * Deterministic Input Recorder & Replay Engine for eletric Studio.
 * Guarantees bit-for-bit identical output digests across replays on the same model + SimulatedClock.
 */
import { z } from "zod";
import type { CompactProgramModel } from "../domain/types";
import {
  CompactExecutionEngine,
  type CompactRuntimeFrame,
} from "../runtime/compact-execution-engine";

export const CompactInputEventSchema = z.object({
  atElapsedMs: z.number().int().min(0),
  nameOrAddress: z.string().min(1).max(120),
  value: z.union([z.boolean(), z.number().finite(), z.string().max(256)]),
});

export const CompactClockJumpEventSchema = z.object({
  atElapsedMs: z.number().int().min(0),
  targetEpochMs: z.number().finite(),
});

export const CompactRecordedSessionSchema = z.object({
  version: z.literal(1),
  baseEpochMs: z.number().finite(),
  cycleTimeMs: z.number().int().min(5).max(10_000),
  totalDurationMs: z.number().int().min(0).max(3_600_000),
  inputEvents: z.array(CompactInputEventSchema).max(20_000),
  clockJumps: z.array(CompactClockJumpEventSchema).max(1_000),
});

export type CompactInputEvent = z.infer<typeof CompactInputEventSchema>;
export type CompactClockJumpEvent = z.infer<typeof CompactClockJumpEventSchema>;
export type CompactRecordedSession = z.infer<typeof CompactRecordedSessionSchema>;

export interface ReplayOutcome {
  readonly finalFrame: CompactRuntimeFrame | null;
  readonly frames: readonly CompactRuntimeFrame[];
  readonly digestHex: string;
}

function fnv1aUpdate(hash: number, text: string): number {
  let h = hash >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * Replays a recorded simulation trace deterministically on CompactExecutionEngine.
 */
export function replayCompactSession(
  model: CompactProgramModel,
  rawSession: unknown,
): ReplayOutcome {
  const session = CompactRecordedSessionSchema.parse(rawSession);
  const engine = new CompactExecutionEngine(model, session.baseEpochMs);
  if (!engine.compileOk) {
    return { finalFrame: null, frames: [], digestHex: "00000000" };
  }

  const dt = session.cycleTimeMs;
  const totalScans = Math.max(1, Math.ceil(session.totalDurationMs / dt));
  const sortedInputs = [...session.inputEvents].sort((a, b) => a.atElapsedMs - b.atElapsedMs);
  const sortedJumps = [...session.clockJumps].sort((a, b) => a.atElapsedMs - b.atElapsedMs);

  let inIdx = 0;
  let jumpIdx = 0;
  let elapsed = 0;
  let digest = 2166136261;
  const frames: CompactRuntimeFrame[] = [];

  for (let s = 0; s < totalScans; s++) {
    while (jumpIdx < sortedJumps.length && sortedJumps[jumpIdx].atElapsedMs <= elapsed) {
      engine.jumpClock(sortedJumps[jumpIdx].targetEpochMs);
      jumpIdx += 1;
    }
    while (inIdx < sortedInputs.length && sortedInputs[inIdx].atElapsedMs <= elapsed) {
      const ev = sortedInputs[inIdx];
      engine.setInput(ev.nameOrAddress, ev.value);
      inIdx += 1;
    }

    const frame = engine.step(dt);
    elapsed += dt;
    frames.push(frame);

    const varKeys = Object.keys(frame.variables).sort();
    for (const k of varKeys) {
      digest = fnv1aUpdate(digest, `${k}=${String(frame.variables[k])};`);
    }
    digest = fnv1aUpdate(digest, `t=${frame.clockEpochMs};`);
  }

  return {
    finalFrame: frames[frames.length - 1] ?? null,
    frames,
    digestHex: digest.toString(16).padStart(8, "0"),
  };
}
