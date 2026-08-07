// Editor shell do scan-cycle: lê tags do useEditorStore, delega ao núcleo puro
// (scan-core.ts) e escreve os resultados de volta via writeBool.
// A API pública (scanRungs, ScanResult, resetRuntimeState, scanRungsPure) é preservada.
import type { LadderRung } from "./types";
import { useEditorStore, type EditorTag } from "@/lib/editor/store";
import {
  scanRungsPure,
  createScanState,
  LadderScanTimeoutError,
  LADDER_SCAN_BUDGET_MS,
  LADDER_MAX_RUNGS,
  type PureTags,
  type ScanState,
  type ScanResult,
  type TimerState,
  type CounterState,
} from "./scan-core";

export {
  scanRungsPure,
  createScanState,
  LadderScanTimeoutError,
  LADDER_SCAN_BUDGET_MS,
  LADDER_MAX_RUNGS,
};
export type { PureTags, ScanState, ScanResult, TimerState, CounterState };

// Estado persistente do editor (compartilhado entre scans).
const editorState: ScanState = createScanState();

export const resetRuntimeState = () => {
  editorState.timers.clear();
  editorState.counters.clear();
};

const toPureTags = (editorTags: Record<string, EditorTag>): PureTags => {
  const out: PureTags = {};
  for (const t of Object.values(editorTags)) {
    const v = t.value;
    out[t.name] = typeof v === "boolean" || typeof v === "number" ? v : Boolean(v);
  }
  return out;
};

const writeBool = (operand: string, value: boolean) => {
  if (!operand) return;
  const state = useEditorStore.getState();
  const existing = Object.values(state.editorTags).find((t) => t.name === operand);
  if (existing) {
    state.setTagValue(existing.id, value);
  } else {
    state.upsertTag({
      id: `auto-${operand}`,
      name: operand,
      type: "BOOL",
      value,
      forced: false,
    });
  }
};

export const scanRungs = (
  rungs: LadderRung[],
  opts: { budgetMs?: number; maxRungs?: number } = {},
): ScanResult[] => {
  const budgetMs = opts.budgetMs ?? LADDER_SCAN_BUDGET_MS;
  const maxRungs = opts.maxRungs ?? LADDER_MAX_RUNGS;
  if (rungs.length > maxRungs) {
    throw new LadderScanTimeoutError(0, rungs.length, 0);
  }

  const nowFn = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const start = nowFn();
  const before = toPureTags(useEditorStore.getState().editorTags);

  // Executa em blocos de 32 rungs para preservar a checagem de orçamento.
  const results: ScanResult[] = [];
  let after: PureTags = before;
  for (let i = 0; i < rungs.length; i += 32) {
    const elapsed = nowFn() - start;
    if (elapsed > budgetMs) {
      throw new LadderScanTimeoutError(i, rungs.length, elapsed);
    }
    const chunk = rungs.slice(i, i + 32);
    const out = scanRungsPure(chunk, before, editorState, start);
    results.push(...out.results);
    after = { ...after, ...out.tags };
  }

  // Escreve as saídas de volta no store (mesmo efeito colateral de antes).
  for (const [name, value] of Object.entries(after)) {
    if (before[name] !== value) writeBool(name, Boolean(value));
  }

  return results;
};
