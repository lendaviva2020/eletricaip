import { describe, it, expect, beforeEach } from "vitest";
import {
  newRung,
  emptyCell,
  generateUniqueRungId,
  normalizeLadderRungs,
  type LadderRung,
} from "@/lib/ladder/types";
import { useEditorStore } from "@/lib/editor/store";
import { convertBundleToLadderRungs } from "@/lib/importer/universal-importer";
import {
  type EletricAiCanvasBundle,
  CANVAS_BUNDLE_FORMAT,
  CURRENT_BUNDLE_VERSION,
} from "@/lib/importer/types";

describe("Fase 2 & 7 — Estabilização de Chaves Únicas e Integridade do Ladder", () => {
  beforeEach(() => {
    useEditorStore.getState().hydrateSnapshot({
      editorTags: {},
      rungs: [],
      fbdNodes: [],
      fbdEdges: [],
    });
  });

  it("1. normalizeLadderRungs: preserva array vazio sem efeitos colaterais", () => {
    const res = normalizeLadderRungs([]);
    expect(res).toEqual([]);
  });

  it("2. normalizeLadderRungs: preserva a mesma referência quando todos os IDs já são únicos e válidos", () => {
    const r1 = newRung(0);
    const r2 = newRung(1);
    const initial = [r1, r2];

    const normalized = normalizeLadderRungs(initial);
    // Deve retornar a mesma referência para evitar re-renders no React
    expect(normalized).toBe(initial);
  });

  it("3. normalizeLadderRungs: resolve chaves duplicadas 'rung_0' preservando a primeira e gerando IDs únicos para as demais", () => {
    const legacyRungs: LadderRung[] = [
      {
        id: "rung_0",
        label: "Rede 1 (Original)",
        cols: 6,
        cells: [
          [
            { kind: "XIC", operand: "BT_START" },
            emptyCell(),
            emptyCell(),
            emptyCell(),
            emptyCell(),
            { kind: "OTE", operand: "K1" },
          ],
        ],
      },
      {
        id: "rung_0", // Duplicata proposital comum de importação/cópia
        label: "Rede 2 (Duplicata)",
        cols: 6,
        cells: [
          [
            { kind: "XIO", operand: "BT_STOP" },
            emptyCell(),
            emptyCell(),
            emptyCell(),
            emptyCell(),
            { kind: "OTE", operand: "K2" },
          ],
        ],
      },
      {
        id: "rung_0", // Terceira duplicata
        label: "Rede 3 (Terceira Duplicata)",
        cols: 6,
        cells: [
          [
            { kind: "XIC", operand: "SISTEMA_OK" },
            emptyCell(),
            emptyCell(),
            emptyCell(),
            emptyCell(),
            { kind: "OTE", operand: "K3" },
          ],
        ],
      },
    ];

    const normalized = normalizeLadderRungs(legacyRungs);

    expect(normalized).toHaveLength(3);
    // A primeira rede mantém seu ID persistido original
    expect(normalized[0].id).toBe("rung_0");
    expect(normalized[0].label).toBe("Rede 1 (Original)");
    expect(normalized[0].cells[0][0].operand).toBe("BT_START");

    // As duplicatas recebem IDs determinísticos e não-colidentes
    expect(normalized[1].id).not.toBe("rung_0");
    expect(normalized[2].id).not.toBe("rung_0");
    expect(normalized[1].id).not.toBe(normalized[2].id);

    // Todas as instruções e operandos são 100% preservados
    expect(normalized[1].cells[0][0].operand).toBe("BT_STOP");
    expect(normalized[2].cells[0][0].operand).toBe("SISTEMA_OK");

    // Verificação de unicidade absoluta entre irmãos
    const ids = normalized.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });

  it("4. generateUniqueRungId: gera IDs estritamente distintos mesmo em chamadas sequenciais rápidas", () => {
    const ids = Array.from({ length: 100 }, () => generateUniqueRungId("rung-test"));
    const set = new Set(ids);
    expect(set.size).toBe(100);
  });

  it("5. useEditorStore.setRungs e hydrateSnapshot: normalizam dados legados automaticamente", () => {
    const duplicateData: LadderRung[] = [
      { id: "rung_0", label: "R1", cells: [[emptyCell()]] },
      { id: "rung_0", label: "R2", cells: [[emptyCell()]] },
    ];

    useEditorStore.getState().hydrateSnapshot({
      editorTags: {},
      rungs: duplicateData,
      fbdNodes: [],
      fbdEdges: [],
    });

    const storedRungs = useEditorStore.getState().rungs;
    expect(storedRungs).toHaveLength(2);
    expect(storedRungs[0].id).toBe("rung_0");
    expect(storedRungs[1].id).not.toBe("rung_0");
    expect(new Set(storedRungs.map((r) => r.id)).size).toBe(2);
  });

  it("6. convertBundleToLadderRungs: deduplica rungs importados com o mesmo id 'rung_0'", () => {
    const bundle: EletricAiCanvasBundle = {
      format: CANVAS_BUNDLE_FORMAT,
      schemaVersion: CURRENT_BUNDLE_VERSION,
      project: { name: "Teste Duplicatas", diagramType: "ladder" },
      nodes: [],
      edges: [],
      ladder: {
        rungs: [
          {
            id: "rung_0",
            comment: "Rung 0 Original",
            output: { kind: "OTE", operand: "M1" },
            branches: [[{ kind: "XIC", operand: "I0_0" }]],
          },
          {
            id: "rung_0", // colisão em bundle externo
            comment: "Rung 0 Conflito",
            output: { kind: "OTE", operand: "M2" },
            branches: [[{ kind: "XIC", operand: "I0_1" }]],
          },
        ],
      },
    };

    const rungs = convertBundleToLadderRungs(bundle);
    expect(rungs).toHaveLength(2);
    expect(rungs[0].id).toBe("rung_0");
    expect(rungs[1].id).not.toBe("rung_0");
    expect(new Set(rungs.map((r) => r.id)).size).toBe(2);
    expect(rungs[0].cells[0][0].operand).toBe("I0_0");
    expect(rungs[1].cells[0][0].operand).toBe("I0_1");
  });
});
