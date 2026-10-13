// Programa Ladder de referência para planta 8M+2EX
// Gera a definição completa que pode ser importada no editor Ladder
import { PLANT_LADDER_PROGRAM } from "@/lib/simulation/plant-definition";
import { importLadderProgram } from "@/lib/ladder/importer";
import { useEditorStore } from "@/lib/editor/store";
import { toast } from "sonner";
import type { LadderCell } from "@/lib/ladder/types";

// Exporta o programa ST completo para importação
export function generatePlantLadderST(): string {
  const rungs = PLANT_LADDER_PROGRAM.rungs;
  const lines: string[] = [];

  lines.push("// ==========================================");
  lines.push("// Programa Ladder - Planta 8M+2EX");
  lines.push("// Gerado automaticamente a partir de plant-definition.ts");
  lines.push("// ==========================================");
  lines.push("");

  for (const rung of rungs) {
    if (rung.label) {
      lines.push(`// ${rung.label}`);
    }

    // Converte as branches do rung para ST
    const branches = rung.cells;
    if (branches.length === 0) continue;

    // Primeira branch - série principal
    const firstRow = branches[0];
    const outputCell = firstRow[firstRow.length - 1];
    const seriesCells = firstRow.slice(0, -1);

    // Constrói a expressão da branch principal
    const seriesTerms = seriesCells
      .filter((c) => c.kind !== "EMPTY")
      .map((c) => {
        if (c.kind === "XIC") return c.operand;
        if (c.kind === "XIO") return `NOT ${c.operand}`;
        return c.operand;
      });

    let expr = "";
    if (seriesTerms.length > 0) {
      expr = seriesTerms.join(" AND ");
    } else {
      expr = "TRUE";
    }

    // Branches paralelas (OR)
    const orBranches = branches.slice(1);
    if (orBranches.length > 0) {
      const orExprs = orBranches
        .map((row) => {
          const cells = row
            .filter((c) => c.kind !== "EMPTY")
            .map((c) => {
              if (c.kind === "XIC") return c.operand;
              if (c.kind === "XIO") return `NOT ${c.operand}`;
              return c.operand;
            });
          return cells.length > 1 ? `(${cells.join(" AND ")})` : cells[0];
        })
        .filter((e) => e);

      if (orBranches.length > 0) {
        const orExpr = orBranches
          .map((row) => {
            const cells = row
              .filter((c) => c.kind !== "EMPTY")
              .map((c) => {
                if (c.kind === "XIC") return c.operand;
                if (c.kind === "XIO") return `NOT ${c.operand}`;
                return c.operand;
              });
            return cells.length > 1 ? `(${cells.join(" AND ")})` : cells[0];
          })
          .join(" OR ");

        if (expr) {
          expr = `${expr} OR ${orExpr}`;
        } else {
          expr = orExpr;
        }
      }
    }

    // Gera a atribuição
    lines.push(`${outputCell.operand} := ${expr};`);
    lines.push("");
  }

  return lines.join("\n");
}

// Função para carregar o programa de referência no editor
export async function loadPlantReferenceProgram(): Promise<{
  success: boolean;
  rungsCount: number;
  warnings: string[];
}> {
  const stCode = generatePlantLadderST();
  const result = importLadderProgram(stCode, "ST");

  if (result.rungs.length === 0) {
    return { success: false, rungsCount: 0, warnings: ["Nenhum rung gerado"] };
  }

  // Carrega no editor store
  const { setRungs } = useEditorStore.getState();
  setRungs(result.rungs);

  if (result.warnings.length > 0) {
    toast.warning(`${result.warnings.length} aviso(s) na importação`, {
      description: result.warnings.slice(0, 3).join(" · "),
    });
  }

  toast.success(`Programa de referência carregado: ${result.rungs.length} rungs`);

  return {
    success: true,
    rungsCount: result.rungs.length,
    warnings: result.warnings,
  };
}

// Gera também o programa IL equivalente
export function generatePlantLadderIL(): string {
  const rungs = PLANT_LADDER_PROGRAM.rungs;
  const lines: string[] = [];

  lines.push("// ==========================================");
  lines.push("// Programa Ladder (IL) - Planta 8M+2EX");
  lines.push("// ==========================================");
  lines.push("");

  for (const rung of PLANT_LADDER_PROGRAM.rungs) {
    if (rung.label) {
      lines.push(`// ${rung.label}`);
    }

    // Primeira branch - LD + ST/OTE
    const firstRow = rung.cells[0];
    const outputCell = firstRow[firstRow.length - 1];
    const seriesCells = firstRow.slice(0, -1).filter((c) => c.kind !== "EMPTY");

    // LD primeiro termo
    if (seriesCells.length > 0) {
      const first = seriesCells[0];
      if (first.kind === "XIC") lines.push(`LD ${first.operand}`);
      else if (first.kind === "XIO") lines.push(`LDN ${first.operand}`);
      else lines.push(`LD ${first.operand}`);

      // AND subsequentes
      for (let i = 1; i < seriesCells.length; i++) {
        const cell = seriesCells[i];
        if (cell.kind === "XIC") lines.push(`AND ${cell.operand}`);
        else if (cell.kind === "XIO") lines.push(`ANDN ${cell.operand}`);
        else lines.push(`AND ${cell.operand}`);
      }
    } else {
      lines.push("LD TRUE");
    }

    // Branches paralelas (OR)
    for (let i = 1; i < rung.cells.length; i++) {
      const row = rung.cells[i];
      const cells = row.filter((c) => c.kind !== "EMPTY");
      if (cells.length === 0) continue;

      // Para OR, precisamos fazer LD do primeiro termo da branch paralela
      const firstCell = cells[0];
      if (firstCell.kind === "XIC") lines.push(`LD ${firstCell.operand}`);
      else if (firstCell.kind === "XIO") lines.push(`LDN ${firstCell.operand}`);
      else lines.push(`LD ${firstCell.operand}`);

      for (let i = 1; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.kind === "XIC") lines.push(`AND ${cell.operand}`);
        else if (cell.kind === "XIO") lines.push(`ANDN ${cell.operand}`);
        else lines.push(`AND ${cell.operand}`);
      }

      lines.push("OR");
    }

    // Saída
    const out = outputCell as LadderCell;
    if (out.kind === "OTE") lines.push(`ST ${out.operand}`);
    else if (out.kind === "OTL") lines.push(`S ${out.operand}`);
    else if (out.kind === "OTU") lines.push(`R ${out.operand}`);
    else if (out.kind === "TON" || out.kind === "TOF" || out.kind === "TP") {
      const preset = out.preset ? `T#${out.preset}ms` : "T#100ms";
      lines.push(`CAL ${out.operand}(IN := ${out.operand}, PT := ${preset})`);
      if (out.kind === "TOF") lines.push("(* TOF *)");
      else if (out.kind === "TP") lines.push("(* TP *)");
    } else if (out.kind === "CTU") {
      lines.push(`CAL ${out.operand}(CU := ${out.operand}, PV := ${out.preset})`);
    }

    lines.push("");
  }

  return lines.join("\n");
}
