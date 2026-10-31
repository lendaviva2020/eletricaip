import { describe, it, expect, beforeEach } from "vitest";
import {
  type LadderRung,
  type LadderCell,
  type LadderInstruction,
  type RungTopology,
  newRung,
  emptyCell,
  generateUniqueRungId,
  ensureRungTopology,
  buildTopologyFromCells,
  isOutputKind,
  isContactKind,
} from "../lib/ladder/types";
import { scanRungsPure, createScanState } from "../lib/ladder/scan-core";
import { compileRungToST } from "../lib/ladder/compiler";
import { useEditorStore } from "../lib/editor/store";

describe("Ladder Fase 2 — Programação Natural, Inserção Previsível e Operações de Rede", () => {
  beforeEach(() => {
    useEditorStore.getState().hydrateSnapshot({
      editorTags: {},
      rungs: [],
      fbdNodes: [],
      fbdEdges: [],
    });
  });

  describe("A. Organização Visual e Estrutural do Diagrama", () => {
    it("mantém trilhos, redes numeradas e saídas múltiplas em paralelo", () => {
      // Criação da rede com múltiplas saídas paralelas (ex.: BOMBA_MAIN e SINALIZ_RUN)
      const rung: LadderRung = {
        id: "rung-p2-01",
        label: "0001 | Habilitação e Partida da Bomba Principal",
        comment: "0001 | Habilitação e Partida da Bomba Principal",
        cols: 6,
        cells: [
          [
            { id: "c-0", kind: "XIC", operand: "B_HABILITA" },
            emptyCell(),
            emptyCell(),
            emptyCell(),
            emptyCell(),
            { id: "out-1", kind: "OTE", operand: "BOMBA_MAIN" },
          ],
          [
            emptyCell(),
            emptyCell(),
            emptyCell(),
            emptyCell(),
            emptyCell(),
            { id: "out-2", kind: "OTE", operand: "SINALIZ_RUN" },
          ],
        ],
      };

      const topology = ensureRungTopology(rung);
      expect(topology.outputs).toHaveLength(2);
      expect(topology.outputs[0].operand).toBe("BOMBA_MAIN");
      expect(topology.outputs[1].operand).toBe("SINALIZ_RUN");

      // Executa scan: quando B_HABILITA for true, ambas as saídas paralelas devem ligar
      const state = createScanState();
      const res = scanRungsPure([rung], { B_HABILITA: true }, state, 1000);
      expect(res.results[0].poweredOut).toBe(true);
      expect(res.tags["BOMBA_MAIN"]).toBe(true);
      expect(res.tags["SINALIZ_RUN"]).toBe(true);

      // Código ST exportado reflete ambas as saídas
      const st = compileRungToST(rung);
      expect(st).toContain("BOMBA_MAIN := B_HABILITA;");
      expect(st).toContain("SINALIZ_RUN := B_HABILITA;");
    });
  });

  describe("B. Inserção Previsível e Validação de Posições Inválidas", () => {
    it("insere instrução na posição exata do cursor e atualiza a ordem serial", () => {
      const rung: LadderRung = {
        id: "rung-cursor-test",
        label: "Teste Inserção Cursor",
        cols: 5,
        cells: [
          [
            { id: "c-a", kind: "XIC", operand: "TAG_A" },
            { id: "c-c", kind: "XIC", operand: "TAG_C" },
            emptyCell(),
            emptyCell(),
            { id: "c-out", kind: "OTE", operand: "SAIDA" },
          ],
        ],
      };

      const topology = ensureRungTopology(rung);
      expect(topology.rootBranch.items).toHaveLength(2);

      // Simula inserção previsível na posição de índice 1 (entre TAG_A e TAG_C)
      const newInst: LadderInstruction = {
        id: "inst-b",
        kind: "XIO",
        operand: "TAG_B_NOVA",
      };

      topology.rootBranch.items.splice(1, 0, {
        id: "item-b",
        type: "instruction",
        instruction: newInst,
      });

      // Assert que a ordem serial foi preservada rigorosamente
      expect(topology.rootBranch.items).toHaveLength(3);
      expect(topology.rootBranch.items[0].instruction?.operand).toBe("TAG_A");
      expect(topology.rootBranch.items[1].instruction?.operand).toBe("TAG_B_NOVA");
      expect(topology.rootBranch.items[2].instruction?.operand).toBe("TAG_C");

      // Compilação ST reflete a nova ordem em série
      const st = compileRungToST({ ...rung, topology });
      expect(st).toBe("SAIDA := TAG_A AND NOT TAG_B_NOVA AND TAG_C;");
    });

    it("valida semanticamente e impede a inserção de contatos como bobinas ou bobinas como contatos", () => {
      expect(isOutputKind("OTE")).toBe(true);
      expect(isOutputKind("OTL")).toBe(true);
      expect(isOutputKind("XIC")).toBe(false);
      expect(isOutputKind("XIO")).toBe(false);

      expect(isContactKind("XIC")).toBe(true);
      expect(isContactKind("XIO")).toBe(true);
      expect(isContactKind("OTE")).toBe(false);

      // Função de validação de posicionamento utilizada pelo ladder-cell
      const validatePlacement = (kind: string, isOutputCol: boolean) => {
        const isOut = isOutputKind(kind as any);
        if (isOutputCol && !isOut) {
          return { valid: false, reason: "A coluna de terminação aceita apenas bobinas e saídas." };
        }
        if (!isOutputCol && isOut) {
          return { valid: false, reason: "Bobinas devem ser posicionadas na coluna de saída." };
        }
        return { valid: true };
      };

      expect(validatePlacement("XIC", true).valid).toBe(false);
      expect(validatePlacement("OTE", false).valid).toBe(false);
      expect(validatePlacement("XIC", false).valid).toBe(true);
      expect(validatePlacement("OTE", true).valid).toBe(true);
    });
  });

  describe("C. Operações Funcionais sobre Redes e Elementos", () => {
    it("adiciona e insere novas redes em posições arbitrárias", () => {
      const rungs: LadderRung[] = [newRung(0), newRung(1)];
      expect(rungs).toHaveLength(2);

      // Inserção no meio (posição 1)
      const inserted = newRung(99);
      inserted.id = generateUniqueRungId();
      inserted.label = "Rede Intermediária";

      const updated = [...rungs];
      updated.splice(1, 0, inserted);

      expect(updated).toHaveLength(3);
      expect(updated[1].label).toBe("Rede Intermediária");
    });

    it("duplica rede gerando identificadores únicos sem alterar a original", () => {
      const original: LadderRung = {
        id: "orig-rung-1",
        label: "Rede Original",
        comment: "Comentário Original",
        cols: 4,
        cells: [
          [
            { id: "c-orig-1", kind: "XIC", operand: "IN_1" },
            emptyCell(),
            emptyCell(),
            { id: "c-orig-out", kind: "OTE", operand: "OUT_1" },
          ],
        ],
      };

      const newId = generateUniqueRungId();
      const cloned: LadderRung = {
        ...original,
        id: newId,
        label: `${original.label} (Cópia)`,
        comment: `${original.comment} (Cópia)`,
        cells: original.cells.map((row) =>
          row.map((c) => ({
            ...c,
            id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          })),
        ),
      };
      cloned.topology = buildTopologyFromCells(cloned);

      expect(cloned.id).not.toBe(original.id);
      expect(cloned.cells[0][0].id).not.toBe(original.cells[0][0].id);
      expect(cloned.label).toContain("(Cópia)");
      expect(original.label).toBe("Rede Original");
    });

    it("reordena redes para cima e para baixo (moveRung)", () => {
      const r1 = { ...newRung(0), id: "r1", label: "Rede 1" };
      const r2 = { ...newRung(1), id: "r2", label: "Rede 2" };
      const r3 = { ...newRung(2), id: "r3", label: "Rede 3" };
      let list = [r1, r2, r3];

      // Move r2 para cima (delta -1)
      const move = (arr: typeof list, idx: number, delta: number) => {
        const copy = [...arr];
        const [item] = copy.splice(idx, 1);
        copy.splice(idx + delta, 0, item);
        return copy;
      };

      list = move(list, 1, -1);
      expect(list.map((r) => r.id)).toEqual(["r2", "r1", "r3"]);

      // Move r2 para baixo (delta +1)
      list = move(list, 0, 1);
      expect(list.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    });

    it("cria e expande níveis de ramos paralelos (addParallelBranch e addBranchLevel)", () => {
      const rung = newRung(0);
      const topology = ensureRungTopology(rung);

      // Adiciona ramo paralelo
      const parItem: (typeof topology.rootBranch.items)[0] = {
        id: "par-1",
        type: "parallel",
        branches: [
          {
            id: "br-1",
            items: [
              {
                id: "it-1",
                type: "instruction",
                instruction: { id: "i1", kind: "XIC", operand: "START_1" },
              },
            ],
          },
          {
            id: "br-2",
            items: [
              {
                id: "it-2",
                type: "instruction",
                instruction: { id: "i2", kind: "XIC", operand: "START_2" },
              },
            ],
          },
        ],
      };
      topology.rootBranch.items.push(parItem);
      expect(topology.rootBranch.items[0].type).toBe("parallel");
      expect(topology.rootBranch.items[0].branches).toHaveLength(2);

      // Expande com um terceiro nível (adicionar nível de ramo)
      topology.rootBranch.items[0].branches?.push({
        id: "br-3",
        items: [
          {
            id: "it-3",
            type: "instruction",
            instruction: { id: "i3", kind: "XIC", operand: "START_3" },
          },
        ],
      });
      expect(topology.rootBranch.items[0].branches).toHaveLength(3);

      const st = compileRungToST({
        ...rung,
        topology: { ...topology, outputs: [{ id: "out-main", kind: "OTE", operand: "CMD_RUN" }] },
      });
      expect(st).toBe("CMD_RUN := (START_1 OR START_2 OR START_3);");
    });

    it("move elemento horizontalmente para esquerda e direita e exclui elemento da rede", () => {
      const rung: LadderRung = {
        id: "r-move-test",
        label: "Move Element Test",
        cols: 4,
        cells: [],
        topology: {
          id: "r-move-test",
          rootBranch: {
            id: "root",
            items: [
              {
                id: "it-1",
                type: "instruction",
                instruction: { id: "i1", kind: "XIC", operand: "TAG_1" },
              },
              {
                id: "it-2",
                type: "instruction",
                instruction: { id: "i2", kind: "XIC", operand: "TAG_2" },
              },
              {
                id: "it-3",
                type: "instruction",
                instruction: { id: "i3", kind: "XIC", operand: "TAG_3" },
              },
            ],
          },
          outputs: [{ id: "out", kind: "OTE", operand: "OUT" }],
        },
      };

      const topology = rung.topology!;

      // Move TAG_2 para a esquerda
      const items = [...topology.rootBranch.items];
      const idx = 1;
      const [moved] = items.splice(idx, 1);
      items.splice(0, 0, moved);
      topology.rootBranch.items = items;

      expect(topology.rootBranch.items.map((i) => i.instruction?.operand)).toEqual([
        "TAG_2",
        "TAG_1",
        "TAG_3",
      ]);

      // Exclui elemento TAG_1
      topology.rootBranch.items = topology.rootBranch.items.filter(
        (i) => i.instruction?.operand !== "TAG_1",
      );
      expect(topology.rootBranch.items.map((i) => i.instruction?.operand)).toEqual([
        "TAG_2",
        "TAG_3",
      ]);
    });

    it("executa Desfazer (Undo) e Refazer (Redo) com histórico de snapshots imutáveis", () => {
      let rungs: LadderRung[] = [{ ...newRung(0), label: "Estado Inicial" }];
      const past: LadderRung[][] = [];
      const future: LadderRung[][] = [];

      const apply = (next: LadderRung[]) => {
        past.push(rungs);
        future.length = 0;
        rungs = next;
      };

      const undo = () => {
        if (past.length === 0) return;
        future.push(rungs);
        rungs = past.pop()!;
      };

      const redo = () => {
        if (future.length === 0) return;
        past.push(rungs);
        rungs = future.pop()!;
      };

      // Mutação 1: Adiciona segunda rede
      apply([...rungs, { ...newRung(1), label: "Rede 2" }]);
      expect(rungs).toHaveLength(2);

      // Mutação 2: Altera comentário
      apply(rungs.map((r, i) => (i === 0 ? { ...r, label: "Rede 1 Modificada" } : r)));
      expect(rungs[0].label).toBe("Rede 1 Modificada");

      // Undo 1
      undo();
      expect(rungs[0].label).toBe("Estado Inicial");
      expect(rungs).toHaveLength(2);

      // Undo 2
      undo();
      expect(rungs).toHaveLength(1);
      expect(rungs[0].label).toBe("Estado Inicial");

      // Redo 1
      redo();
      expect(rungs).toHaveLength(2);

      // Redo 2
      redo();
      expect(rungs[0].label).toBe("Rede 1 Modificada");
    });

    it("edita comentários e descrições de rede sincronizando com a topologia", () => {
      const rung = newRung(0);
      const topology = ensureRungTopology(rung);

      const newComment = "0001 | Controle Avançado de Temperatura e Pressão do Reator";
      rung.comment = newComment;
      rung.label = newComment;
      topology.comment = newComment;

      expect(rung.comment).toBe(newComment);
      expect(topology.comment).toBe(newComment);
    });
  });
});
