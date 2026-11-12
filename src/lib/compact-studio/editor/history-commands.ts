/**
 * Command & History Engine for CompactProgramModel.
 * Pure, reversible, with MoveNodes coalescing within COALESCE_MS (reusing HISTORY_LIMIT).
 */
import { HISTORY_LIMIT } from "@/lib/diagram/history";
import type {
  CompactNotation,
  CompactProgramModel,
  CompactVisualNodeLayout,
} from "../domain/types";

const COALESCE_MS = 200;

export interface CompactMoveDelta {
  readonly nodeId: string;
  readonly from: CompactVisualNodeLayout;
  readonly to: CompactVisualNodeLayout;
}

export interface CompactHistoryEntry {
  readonly label: string;
  readonly kind: "move" | "structural";
  readonly notation?: CompactNotation;
  readonly moveDeltas?: readonly CompactMoveDelta[];
  readonly before: CompactProgramModel;
  readonly after: CompactProgramModel;
  readonly timestamp: number;
}

export interface CompactHistoryStack {
  readonly past: readonly CompactHistoryEntry[];
  readonly future: readonly CompactHistoryEntry[];
}

export function createEmptyCompactHistory(): CompactHistoryStack {
  return { past: [], future: [] };
}

export function pushCompactHistory(
  stack: CompactHistoryStack,
  entry: CompactHistoryEntry,
): CompactHistoryStack {
  const last = stack.past[stack.past.length - 1];
  if (
    last &&
    last.kind === "move" &&
    entry.kind === "move" &&
    last.notation === entry.notation &&
    entry.timestamp - last.timestamp < COALESCE_MS &&
    last.moveDeltas?.length === entry.moveDeltas?.length &&
    last.moveDeltas?.every((d, i) => d.nodeId === entry.moveDeltas?.[i]?.nodeId)
  ) {
    const merged: CompactHistoryEntry = {
      ...entry,
      before: last.before,
      moveDeltas: entry.moveDeltas?.map((d, i) => ({
        nodeId: d.nodeId,
        from: last.moveDeltas?.[i]?.from ?? d.from,
        to: d.to,
      })),
    };
    const nextPast = [...stack.past.slice(0, -1), merged];
    return { past: nextPast, future: [] };
  }

  const nextPast = [...stack.past, entry];
  if (nextPast.length > HISTORY_LIMIT) {
    nextPast.shift();
  }
  return { past: nextPast, future: [] };
}

export function undoCompactHistory(stack: CompactHistoryStack): {
  readonly model: CompactProgramModel | null;
  readonly next: CompactHistoryStack;
} {
  const last = stack.past[stack.past.length - 1];
  if (!last) return { model: null, next: stack };
  return {
    model: last.before,
    next: {
      past: stack.past.slice(0, -1),
      future: [...stack.future, last],
    },
  };
}

export function redoCompactHistory(stack: CompactHistoryStack): {
  readonly model: CompactProgramModel | null;
  readonly next: CompactHistoryStack;
} {
  const top = stack.future[stack.future.length - 1];
  if (!top) return { model: null, next: stack };
  return {
    model: top.after,
    next: {
      past: [...stack.past, top],
      future: stack.future.slice(0, -1),
    },
  };
}
