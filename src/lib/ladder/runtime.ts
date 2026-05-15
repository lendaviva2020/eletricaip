// Tiny scan-cycle runtime for the rung matrix.
// Reads tag values from the editor store, evaluates rung-by-rung, writes outputs.
import type { LadderCell, LadderRung } from "./types";
import { isOutputKind } from "./types";
import { useEditorStore, type EditorTag } from "@/lib/editor/store";

const truthy = (v: EditorTag["value"] | undefined): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return Boolean(v);
};

const readBool = (operand: string, tags: Record<string, EditorTag>): boolean => {
  if (!operand) return false;
  const tag = Object.values(tags).find((t) => t.name === operand);
  return tag ? truthy(tag.value) : false;
};

const writeBool = (operand: string, value: boolean) => {
  if (!operand) return;
  const state = useEditorStore.getState();
  const existing = Object.values(state.tags).find((t) => t.name === operand);
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

const evalContact = (cell: LadderCell, tags: Record<string, EditorTag>): boolean => {
  const v = readBool(cell.operand, tags);
  if (cell.kind === "XIC") return v;
  if (cell.kind === "XIO") return !v;
  return true; // EMPTY pass-through (handled by caller)
};

const evalRow = (row: LadderCell[], tags: Record<string, EditorTag>): boolean => {
  let result = true;
  let any = false;
  for (let i = 0; i < row.length - 1; i++) {
    const c = row[i];
    if (c.kind === "EMPTY") continue;
    any = true;
    result = result && evalContact(c, tags);
    if (!result) break;
  }
  return any ? result : false;
};

export interface ScanResult {
  rungId: string;
  poweredOut: boolean;
  perCell: boolean[][];
}

export const scanRungs = (rungs: LadderRung[]): ScanResult[] => {
  const tags = useEditorStore.getState().tags;
  const results: ScanResult[] = [];
  for (const rung of rungs) {
    const perCell: boolean[][] = [];
    let powered = false;
    for (const row of rung.cells) {
      const rowOn = evalRow(row, tags);
      powered = powered || rowOn;
      perCell.push(row.map((c, i) => (i === row.length - 1 ? powered : c.kind === "EMPTY" ? rowOn : evalContact(c, tags))));
    }
    // Apply output (only first-row output cell)
    const outRow = rung.cells[0] ?? [];
    const outCell = outRow[outRow.length - 1];
    if (outCell && isOutputKind(outCell.kind) && outCell.operand) {
      if (outCell.kind === "OTE") writeBool(outCell.operand, powered);
      else if (outCell.kind === "OTL" && powered) writeBool(outCell.operand, true);
      else if (outCell.kind === "OTU" && powered) writeBool(outCell.operand, false);
      else if (outCell.kind === "TON") {
        // Simplified: write powered immediately (preset ignored at MVP).
        writeBool(outCell.operand, powered);
      }
    }
    results.push({ rungId: rung.id, poweredOut: powered, perCell });
  }
  return results;
};
