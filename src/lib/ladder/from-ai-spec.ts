// Converte a DSL simplificada de rungs devolvida pela IA (plcLogic.rungs)
// em LadderRung do modelo matricial do editor.
import {
  emptyCell,
  resizeRungCols,
  RUNG_COLS_MIN,
  RUNG_COLS_MAX,
  type LadderCell,
  type LadderCellKind,
  type LadderRung,
} from "./types";

export interface AiRungContact {
  kind: "XIC" | "XIO";
  operand: string;
}
export interface AiRungOutput {
  kind: string;
  operand: string;
  preset?: number;
}
export interface AiRungSpec {
  id?: string;
  label?: string;
  output: AiRungOutput;
  branches?: AiRungContact[][];
}

const OUTPUT_KINDS = new Set<LadderCellKind>(["OTE", "OTL", "OTU", "TON", "TOF", "TP", "CTU"]);

const normalizeOutputKind = (k: string): LadderCellKind => {
  const up = String(k ?? "").toUpperCase() as LadderCellKind;
  return OUTPUT_KINDS.has(up) ? up : "OTE";
};

export function fromAiRungSpec(spec: AiRungSpec, index = 0): LadderRung {
  const branches = (spec.branches ?? []).map((b) => (Array.isArray(b) ? b : []));
  const rows = branches.length > 0 ? branches : [[]];

  // Colunas = maior branch + 1 (coluna de saída), normalizado aos limites do modelo.
  const widest = rows.reduce((m, b) => Math.max(m, b.length), 0);
  const cols = Math.min(RUNG_COLS_MAX, Math.max(RUNG_COLS_MIN, widest + 1));

  const outKind = normalizeOutputKind(spec.output?.kind ?? "OTE");
  const outCell: LadderCell = {
    kind: outKind,
    operand: String(spec.output?.operand ?? ""),
    ...(typeof spec.output?.preset === "number" ? { preset: spec.output.preset } : {}),
  };

  const cells: LadderCell[][] = rows.map((branch, ri) => {
    const series: LadderCell[] = branch.map((c) => ({
      kind: c?.kind === "XIO" ? "XIO" : "XIC",
      operand: String(c?.operand ?? ""),
    }));
    // Somente a row 0 carrega o output real; as demais recebem célula vazia.
    return [...series, ri === 0 ? outCell : emptyCell()];
  });

  const rung: LadderRung = {
    id: String(spec.id || `ai-rung-${index + 1}`),
    label: String(spec.label || `Rung ${index + 1}`),
    cols,
    cells,
  };

  return resizeRungCols(rung, cols);
}

export function fromAiRungSpecs(specs: unknown): LadderRung[] {
  if (!Array.isArray(specs)) return [];
  return specs
    .filter((s): s is AiRungSpec => !!s && typeof s === "object" && !!(s as AiRungSpec).output)
    .map((s, i) => fromAiRungSpec(s, i));
}
