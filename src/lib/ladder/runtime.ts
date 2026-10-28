// Editor shell do scan-cycle: lê tags do useEditorStore, delega ao núcleo puro
// (scan-core.ts) e escreve os resultados de volta via writeTagValue.
// A API pública (scanRungs, ScanResult, resetRuntimeState, scanRungsPure) é preservada.
import type { LadderRung, LadderProfile } from "./types";
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
  type CtudState,
} from "./scan-core";

export {
  scanRungsPure,
  createScanState,
  LadderScanTimeoutError,
  LADDER_SCAN_BUDGET_MS,
  LADDER_MAX_RUNGS,
};
export type { PureTags, ScanState, ScanResult, TimerState, CounterState, CtudState };

// Estado persistente do editor (compartilhado entre scans).
const editorState: ScanState = createScanState();
let lastScanDurationMs = 12;

export const resetRuntimeState = () => {
  editorState.timers.clear();
  editorState.counters.clear();
  editorState.edges.clear();
  editorState.ctud?.clear();
  editorState.bistables?.clear();
};

export const getLastScanDuration = () => lastScanDurationMs;

const toPureTags = (editorTags: Record<string, EditorTag>): PureTags => {
  const out: PureTags = {};
  for (const t of Object.values(editorTags)) {
    // Tags forçadas mantêm valor imutável pelo scan
    out[t.name] = t.value as any;
  }
  return out;
};

const writeTagValue = (operand: string, value: boolean | number | string) => {
  if (!operand) return;
  const state = useEditorStore.getState();
  const existing = Object.values(state.editorTags).find((t) => t.name === operand);
  if (existing) {
    if (existing.forced) return; // Respeita forçamento manual de simulação
    state.setTagValue(existing.id, value);
  } else {
    state.upsertTag({
      id: `auto-${operand}`,
      name: operand,
      type: typeof value === "number" ? "INT" : "BOOL",
      value,
      forced: false,
    });
  }
};

export const scanRungs = (
  rungs: LadderRung[],
  opts: { budgetMs?: number; maxRungs?: number; profile?: LadderProfile } = {},
): ScanResult[] => {
  const budgetMs = opts.budgetMs ?? LADDER_SCAN_BUDGET_MS;
  const maxRungs = opts.maxRungs ?? LADDER_MAX_RUNGS;
  if (rungs.length > maxRungs) {
    throw new LadderScanTimeoutError(0, rungs.length, 0);
  }

  const nowFn = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const start = nowFn();
  const storeState = useEditorStore.getState();
  const profile = opts.profile ?? storeState.ladderProfile ?? "generic";
  const before = toPureTags(storeState.editorTags);
  const forcedSet = new Set(
    Object.values(storeState.editorTags)
      .filter((t) => t.forced)
      .map((t) => t.name),
  );

  // Executa em blocos de 32 rungs preservando a propagação sequencial entre redes e blocos
  const results: ScanResult[] = [];
  let currentTags: PureTags = before;
  for (let i = 0; i < rungs.length; i += 32) {
    const elapsed = nowFn() - start;
    if (elapsed > budgetMs) {
      throw new LadderScanTimeoutError(i, rungs.length, elapsed);
    }
    const chunk = rungs.slice(i, i + 32);
    const out = scanRungsPure(chunk, currentTags, editorState, start, forcedSet, profile);
    results.push(...out.results);
    currentTags = out.tags;
  }

  // Escreve as saídas de volta no store (preservando booleanos e numéricos e respeitando forçadas)
  for (const [name, value] of Object.entries(currentTags)) {
    if (before[name] !== value && !forcedSet.has(name)) {
      writeTagValue(name, value);
    }
  }

  lastScanDurationMs = Math.max(1, Math.round(nowFn() - start));
  return results;
};
