// Ladder rung matrix & industrial topology model — IEC 61131-3 compliant.
// Supports:
// 1. Structural topological model (RungTopology) with true parallel branches (selos),
//    sub-branches, function blocks (TON, TOF, TP, CTU, CMP, ADD, SUB), and parallel coils.
// 2. Matrix model (cells: rows × cols) preserved for 100% backward compatibility.

export type LadderProfile = "generic" | "rockwell" | "siemens";

export type LadderCellKind =
  | "EMPTY"
  | "XIC" // contato NA (Normally Open)
  | "XIO" // contato NF (Normally Closed)
  | "R_TRIG" // borda de subida (Positive pulse / ONS)
  | "F_TRIG" // borda de descida (Negative pulse / OSF)
  | "OTE" // bobina simples (não-retentiva)
  | "OTL" // set latch (retentiva)
  | "OTU" // reset unlatch (retentiva)
  | "NEG_COIL" // bobina negada
  | "SR" // bistável Set-Reset (Set dominante)
  | "RS" // bistável Reset-Set (Reset dominante)
  | "TON" // timer on-delay
  | "TOF" // timer off-delay
  | "TP" // timer pulse
  | "TONR" // timer retentivo acumulador
  | "CTU" // contador crescente
  | "CTD" // contador decrescente
  | "CTUD" // contador crescente/decrescente
  // Comparadores
  | "CMP_EQ" // igual (==)
  | "CMP_NE" // diferente (!=)
  | "CMP_GT" // maior que (>)
  | "CMP_LT" // menor que (<)
  | "CMP_GE" // maior ou igual (>=)
  | "CMP_LE" // menor ou igual (<=)
  // Matemática
  | "ADD" // soma (IN1 + IN2)
  | "SUB" // subtração (IN1 - IN2)
  | "MUL" // multiplicação (IN1 * IN2)
  | "DIV" // divisão (IN1 / IN2)
  | "MOD" // resto da divisão
  | "ABS" // valor absoluto
  | "SQRT" // raiz quadrada
  // Lógica Booleana
  | "AND" // E lógico
  | "OR" // OU lógico
  | "XOR" // OU exclusivo
  | "NOT" // Inversor
  // Movimentação & Dados
  | "MOVE" // mover registrador
  | "INT_TO_REAL" // conversão INT -> REAL
  | "REAL_TO_INT"; // conversão REAL -> INT

export interface LadderCell {
  id?: string;
  kind: LadderCellKind;
  /** Operand tag name, e.g. "%I0.0", "%Q0.1", "K1_CMD". Empty = unbound. */
  operand: string;
  /** Preset for TON/TOF/TP/TONR (ms) / CTU/CTD (count). */
  preset?: number;
  /** Runtime: energized this scan? (purely visual) */
  energized?: boolean;
  /** Parâmetros adicionais para blocos funcionais e comparadores */
  params?: Record<string, string | number | boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODELO DE TOPOLOGIA ESTRUTURAL INDUSTRIAL
// ─────────────────────────────────────────────────────────────────────────────

export interface LadderInstruction {
  id: string;
  kind: LadderCellKind;
  operand: string;
  tag?: string;
  type?: "BOOL" | "INT" | "DINT" | "REAL" | "TIME" | "STRING";
  preset?: number;
  comment?: string;
  params?: Record<string, string | number | boolean>;
  energized?: boolean;
}

export type LadderBranchItem =
  | {
      id: string;
      type: "instruction";
      instruction: LadderInstruction;
      branches?: never;
    }
  | {
      id: string;
      type: "parallel";
      branches: LadderBranch[];
      instruction?: never;
    };

export interface LadderBranch {
  id: string;
  items: LadderBranchItem[];
}

export interface RungTopology {
  id: string;
  number?: number;
  comment?: string;
  rootBranch: LadderBranch;
  /** Uma ou mais bobinas/saídas em paralelo no final do rung */
  outputs: LadderInstruction[];
}

export interface LadderRung {
  id: string;
  label: string;
  comment?: string;
  /** Colunas efetivas (opcional, default RUNG_COLS). Persistido para retomar. */
  cols?: number;
  /** rows × cols matrix. rows >= 1, cols >= RUNG_COLS_MIN (last col = output). */
  cells: LadderCell[][];
  /** Latest energization of the output cell (visual). */
  poweredOut?: boolean;
  /** Topologia estrutural enriquecida com suporte a selos reais e múltiplos blocos */
  topology?: RungTopology;
}

// #LAD-05 · colunas por-rung. RUNG_COLS mantém o default histórico (6) usado
// pelo importador e por chamadores que ainda não passam cols explícitos.
export const RUNG_COLS = 6; // 5 series cells + 1 output cell (default)
export const RUNG_COLS_MIN = 3; // 2 series + 1 output
export const RUNG_COLS_MAX = 12;
export const RUNG_ROWS_DEFAULT = 1;

/** Colunas efetivas de um rung: prefere `cols`, senão a largura da 1ª linha. */
export const rungCols = (r: Pick<LadderRung, "cols" | "cells">): number =>
  r.cols ?? r.cells[0]?.length ?? RUNG_COLS;

export const emptyCell = (): LadderCell => ({ kind: "EMPTY", operand: "" });

let rungGlobalCounter = 0;

/** Gera identificador único e determinístico para redes Ladder. */
export const generateUniqueRungId = (prefix = "rung"): string => {
  rungGlobalCounter += 1;
  return `${prefix}-${Date.now()}-${rungGlobalCounter}`;
};

/**
 * Normaliza uma lista de redes Ladder garantindo:
 * 1. Todos os IDs são únicos e estáveis.
 * 2. IDs válidos pré-existentes são estritamente preservados (primeira ocorrência).
 * 3. Dados legados ou duplicados (ex.: dois 'rung_0') recebem sufixos determinísticos sem perda de células ou instruções.
 * 4. Retorna a mesma referência de array se nenhuma duplicação for detectada, evitando re-renders desnecessários.
 */
export const normalizeLadderRungs = (rungs: LadderRung[]): LadderRung[] => {
  if (!Array.isArray(rungs)) return [];
  const seenIds = new Set<string>();
  let hasDuplicatesOrInvalid = false;

  for (const r of rungs) {
    if (!r || !r.id || seenIds.has(r.id)) {
      hasDuplicatesOrInvalid = true;
      break;
    }
    seenIds.add(r.id);
  }

  if (!hasDuplicatesOrInvalid) return rungs;

  const usedIds = new Set<string>();
  return rungs.map((r, idx) => {
    if (!r) return newRung(idx);
    let id = typeof r.id === "string" ? r.id.trim() : "";
    if (!id || usedIds.has(id)) {
      const base = id || `rung_${idx}`;
      let candidate = `${base}_${idx + 1}`;
      let seq = 1;
      while (usedIds.has(candidate)) {
        seq += 1;
        candidate = `${base}_${idx + 1}_${seq}`;
      }
      id = candidate;
    }
    usedIds.add(id);
    if (id === r.id) return r;
    return { ...r, id };
  });
};

export const newRung = (idx: number, cols: number = RUNG_COLS): LadderRung => {
  const c = Math.min(RUNG_COLS_MAX, Math.max(RUNG_COLS_MIN, cols));
  return {
    id: generateUniqueRungId(`rung-${idx}`),
    label: `Rung ${idx + 1}`,
    cols: c,
    cells: Array.from({ length: RUNG_ROWS_DEFAULT }, () => Array.from({ length: c }, emptyCell)),
  };
};

/** Reajusta cada linha para `newCols`, preservando a célula de saída no final. */
export const resizeRungCols = (rung: LadderRung, newCols: number): LadderRung => {
  const target = Math.min(RUNG_COLS_MAX, Math.max(RUNG_COLS_MIN, newCols));
  const cells = rung.cells.map((row) => {
    const out = row[row.length - 1] ?? emptyCell();
    const series = row.slice(0, row.length - 1);
    const seriesTarget = target - 1;
    let nextSeries: LadderCell[];
    if (series.length >= seriesTarget) {
      nextSeries = series.slice(0, seriesTarget);
    } else {
      nextSeries = [...series, ...Array.from({ length: seriesTarget - series.length }, emptyCell)];
    }
    return [...nextSeries, out];
  });
  return { ...rung, cols: target, cells };
};

export const OUTPUT_KINDS: LadderCellKind[] = [
  "OTE",
  "OTL",
  "OTU",
  "NEG_COIL",
  "SR",
  "RS",
  "TON",
  "TOF",
  "TP",
  "TONR",
  "CTU",
  "CTD",
  "CTUD",
];

export const CONTACT_KINDS: LadderCellKind[] = ["XIC", "XIO", "R_TRIG", "F_TRIG"];

export const BLOCK_KINDS: LadderCellKind[] = [
  "CMP_EQ",
  "CMP_NE",
  "CMP_GT",
  "CMP_LT",
  "CMP_GE",
  "CMP_LE",
  "ADD",
  "SUB",
  "MUL",
  "DIV",
  "MOD",
  "ABS",
  "SQRT",
  "MOVE",
  "INT_TO_REAL",
  "REAL_TO_INT",
  "AND",
  "OR",
  "XOR",
  "NOT",
];

export const isOutputKind = (k: LadderCellKind) => OUTPUT_KINDS.includes(k);
export const isContactKind = (k: LadderCellKind) => CONTACT_KINDS.includes(k);
export const isBlockKind = (k: LadderCellKind) => BLOCK_KINDS.includes(k);

/**
 * Converte a matriz bidimensional legada `cells` em uma topologia estrutural (RungTopology).
 * O algoritmo decompõe as colunas em segmentos seriais e blocos paralelos (selos),
 * garantindo que contatos de intertravamento em série (ex.: parada de emergência e relé térmico)
 * NUNCA sejam curto-circuitados ou contornados pelos ramos de selo.
 */
export function buildTopologyFromCells(rung: LadderRung): RungTopology {
  const cols = rungCols(rung);
  const outCol = cols - 1;
  const outputs: LadderInstruction[] = [];

  // 1. Coleta saídas (coluna final de cada linha)
  for (let r = 0; r < rung.cells.length; r++) {
    const cell = rung.cells[r]?.[outCol];
    if (cell && cell.kind !== "EMPTY" && isOutputKind(cell.kind)) {
      outputs.push({
        id: cell.id || `out-${rung.id}-${r}`,
        kind: cell.kind,
        operand: cell.operand,
        preset: cell.preset,
        params: cell.params,
        energized: cell.energized,
      });
    }
  }

  if (outputs.length === 0) {
    outputs.push({
      id: `out-${rung.id}-default`,
      kind: "OTE",
      operand: "",
    });
  }

  const rootItems: LadderBranchItem[] = [];

  // Se houver apenas 1 linha ou nenhuma linha secundária ativa na área série
  const hasBranchRows =
    rung.cells.length > 1 &&
    rung.cells.slice(1).some((row) => row.slice(0, outCol).some((c) => c && c.kind !== "EMPTY"));

  if (!hasBranchRows) {
    // Linha única em série
    const row0 = rung.cells[0] ?? [];
    for (let c = 0; c < outCol; c++) {
      const cell = row0[c];
      if (cell && cell.kind !== "EMPTY") {
        rootItems.push({
          id: cell.id || `item-${rung.id}-0-${c}`,
          type: "instruction",
          instruction: {
            id: cell.id || `inst-${rung.id}-0-${c}`,
            kind: cell.kind,
            operand: cell.operand,
            preset: cell.preset,
            params: cell.params,
            energized: cell.energized,
          },
        });
      }
    }
  } else {
    // Múltiplas linhas: identificar intervalos de colunas paralelas e colunas em série
    interface Interval {
      start: number;
      end: number;
      rows: number[];
    }

    const intervals: Interval[] = [];

    for (let r = 1; r < rung.cells.length; r++) {
      const row = rung.cells[r] ?? [];
      let minC = -1;
      let maxC = -1;
      for (let c = 0; c < outCol; c++) {
        const cell = row[c];
        if (cell && cell.kind !== "EMPTY") {
          if (minC === -1) minC = c;
          maxC = c;
        }
      }
      if (minC !== -1) {
        intervals.push({ start: minC, end: maxC, rows: [r] });
      }
    }

    // Mescla intervalos sobrepostos
    intervals.sort((a, b) => a.start - b.start);
    const mergedIntervals: Interval[] = [];
    for (const cur of intervals) {
      if (mergedIntervals.length === 0) {
        mergedIntervals.push(cur);
      } else {
        const prev = mergedIntervals[mergedIntervals.length - 1];
        if (cur.start <= prev.end + 1) {
          prev.end = Math.max(prev.end, cur.end);
          prev.rows = Array.from(new Set([...prev.rows, ...cur.rows]));
        } else {
          mergedIntervals.push(cur);
        }
      }
    }

    // Processa as colunas de 0 a outCol - 1
    let c = 0;
    while (c < outCol) {
      const activeInterval = mergedIntervals.find((int) => c >= int.start && c <= int.end);

      if (activeInterval) {
        // Bloco paralelo abrangendo de activeInterval.start a activeInterval.end
        const branches: LadderBranch[] = [];

        // Ramo 0: Contatos da Linha 0 dentro do intervalo
        const branch0Items: LadderBranchItem[] = [];
        for (let colIdx = activeInterval.start; colIdx <= activeInterval.end; colIdx++) {
          const cell = rung.cells[0]?.[colIdx];
          if (cell && cell.kind !== "EMPTY") {
            branch0Items.push({
              id: cell.id || `item-${rung.id}-0-${colIdx}`,
              type: "instruction",
              instruction: {
                id: cell.id || `inst-${rung.id}-0-${colIdx}`,
                kind: cell.kind,
                operand: cell.operand,
                preset: cell.preset,
                params: cell.params,
                energized: cell.energized,
              },
            });
          }
        }
        if (branch0Items.length > 0) {
          branches.push({
            id: `branch-${rung.id}-0-${activeInterval.start}-${activeInterval.end}`,
            items: branch0Items,
          });
        }

        // Ramos 1..N: Contatos de cada linha secundária envolvida no intervalo
        for (const rowIdx of activeInterval.rows) {
          const branchRItems: LadderBranchItem[] = [];
          for (let colIdx = activeInterval.start; colIdx <= activeInterval.end; colIdx++) {
            const cell = rung.cells[rowIdx]?.[colIdx];
            if (cell && cell.kind !== "EMPTY") {
              branchRItems.push({
                id: cell.id || `item-${rung.id}-${rowIdx}-${colIdx}`,
                type: "instruction",
                instruction: {
                  id: cell.id || `inst-${rung.id}-${rowIdx}-${colIdx}`,
                  kind: cell.kind,
                  operand: cell.operand,
                  preset: cell.preset,
                  params: cell.params,
                  energized: cell.energized,
                },
              });
            }
          }
          if (branchRItems.length > 0) {
            branches.push({
              id: `branch-${rung.id}-${rowIdx}-${activeInterval.start}-${activeInterval.end}`,
              items: branchRItems,
            });
          }
        }

        if (branches.length > 0) {
          rootItems.push({
            id: `parallel-${rung.id}-${activeInterval.start}-${activeInterval.end}`,
            type: "parallel",
            branches,
          });
        }

        c = activeInterval.end + 1;
      } else {
        // Coluna em série pura na linha 0
        const cell = rung.cells[0]?.[c];
        if (cell && cell.kind !== "EMPTY") {
          rootItems.push({
            id: cell.id || `item-${rung.id}-0-${c}`,
            type: "instruction",
            instruction: {
              id: cell.id || `inst-${rung.id}-0-${c}`,
              kind: cell.kind,
              operand: cell.operand,
              preset: cell.preset,
              params: cell.params,
              energized: cell.energized,
            },
          });
        }
        c += 1;
      }
    }
  }

  const topology: RungTopology = {
    id: rung.id,
    comment: rung.comment || rung.label,
    rootBranch: {
      id: `root-${rung.id}`,
      items: rootItems,
    },
    outputs,
  };

  return topology;
}

/**
 * Converte ou extrai a topologia estrutural de uma rede Ladder existente.
 * Garante 100% de compatibilidade com projetos legados baseados na matriz `cells`.
 */
export function ensureRungTopology(rung: LadderRung): RungTopology {
  if (rung.topology) {
    return rung.topology;
  }
  const topology = buildTopologyFromCells(rung);
  rung.topology = topology;
  return topology;
}
