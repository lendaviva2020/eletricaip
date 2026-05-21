// Pilha de histórico com coalescing de MoveNode (mesmo nó, dentro de COALESCE_MS).
import type { Command } from "./commands";

export const HISTORY_LIMIT = 200;
const COALESCE_MS = 200;

export interface HistoryEntry {
  command: Command;
  inverse: Command;
  timestamp: number;
}

export interface History {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const emptyHistory = (): History => ({ past: [], future: [] });

export function pushHistory(h: History, entry: HistoryEntry): History {
  const last = h.past[h.past.length - 1];
  // coalesce: dois MoveNode consecutivos no mesmo nó dentro da janela
  if (
    last &&
    last.command.type === "MoveNode" &&
    entry.command.type === "MoveNode" &&
    last.command.nodeId === entry.command.nodeId &&
    entry.timestamp - last.timestamp < COALESCE_MS
  ) {
    const merged: HistoryEntry = {
      timestamp: entry.timestamp,
      command: { ...entry.command, from: last.command.from },
      // o inverso passa a apontar para a posição original anterior
      inverse:
        last.inverse.type === "MoveNode"
          ? { ...last.inverse }
          : entry.inverse,
    };
    const past = h.past.slice(0, -1);
    past.push(merged);
    return { past, future: [] };
  }
  const past = [...h.past, entry];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, future: [] };
}

export function popUndo(h: History): { entry: HistoryEntry | null; next: History } {
  const entry = h.past[h.past.length - 1];
  if (!entry) return { entry: null, next: h };
  return {
    entry,
    next: { past: h.past.slice(0, -1), future: [...h.future, entry] },
  };
}

export function popRedo(h: History): { entry: HistoryEntry | null; next: History } {
  const entry = h.future[h.future.length - 1];
  if (!entry) return { entry: null, next: h };
  return {
    entry,
    next: { past: [...h.past, entry], future: h.future.slice(0, -1) },
  };
}
