import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/lib/editor/store";
import { useProjectStore } from "@/lib/project-store";
import { useDiagramStore } from "@/lib/diagram/store";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { buildProjectSnapshot } from "@/lib/use-project-persistence";
import { SnapshotSchema } from "@/lib/projects.functions";
import { generateUniqueRungId, type LadderRung } from "@/lib/ladder/types";

import { createEmptyDoc } from "@/lib/diagram/model";

import { cmd } from "@/lib/diagram/commands";

describe("Prioridade 4 — Teste Completo de Persistência Local (Abrir, Editar, Salvar, Recarregar e Reabrir)", () => {
  beforeEach(() => {
    useEditorStore.getState().hydrateSnapshot({
      editorTags: {},
      rungs: [],
      fbdNodes: [],
      fbdEdges: [],
    });
    useProjectStore.getState().hydrateSnapshot([], [], {});
    useDiagramStore.getState().resetDoc();
    useUnifiedProjectStore
      .getState()
      .resetUnifiedDoc({ id: "proj_rt_1", name: "Projeto Round-Trip" });
  });

  it("Ciclo Completo: abrir projeto existente, editar múltiplos editores, salvar snapshot, limpar memória e reabrir com 100% de integridade", () => {
    // -------------------------------------------------------------
    // ETAPA 1: ABRIR (Projeto Existente Inicial)
    // -------------------------------------------------------------
    const initialRungs: LadderRung[] = [
      {
        id: "rung_start_stop",
        label: "Partida Direta Motor 1",
        cols: 8,
        cells: [
          [
            { kind: "XIC", operand: "%I0.0" },
            { kind: "XIO", operand: "%I0.1" },
            { kind: "OTE", operand: "%Q0.0" },
          ],
        ],
      },
      {
        id: "rung_interlock",
        label: "Intertravamento Térmico",
        cols: 8,
        cells: [
          [
            { kind: "XIO", operand: "%I0.2" },
            { kind: "OTE", operand: "%M0.0" },
          ],
        ],
      },
    ];

    const initialFbdNodes = [
      {
        id: "AND_1",
        type: "fbdBlock",
        position: { x: 100, y: 100 },
        data: {
          label: "AND_1",
          type: "AND",
          inputs: [
            { id: "in1", name: "IN1", type: "BOOL" },
            { id: "in2", name: "IN2", type: "BOOL" },
          ],
          outputs: [{ id: "out", name: "OUT", type: "BOOL" }],
        },
      },
      {
        id: "TON_1",
        type: "fbdBlock",
        position: { x: 300, y: 100 },
        data: {
          label: "TON_1",
          type: "TON",
          inputs: [
            { id: "in", name: "IN", type: "BOOL" },
            { id: "pt", name: "PT", type: "TIME" },
          ],
          outputs: [
            { id: "q", name: "Q", type: "BOOL" },
            { id: "et", name: "ET", type: "TIME" },
          ],
          params: { pt: "T#5s" },
        },
      },
    ];

    const initialFbdEdges = [
      {
        id: "e_and_ton",
        source: "AND_1",
        sourceHandle: "out",
        target: "TON_1",
        targetHandle: "in",
      },
    ];

    const initialTags = {
      tag_start: {
        id: "tag_start",
        name: "BTN_START",
        type: "BOOL" as const,
        value: false,
        forced: false,
      },
      tag_stop: {
        id: "tag_stop",
        name: "BTN_STOP",
        type: "BOOL" as const,
        value: true,
        forced: false,
      },
    };

    // Hidrata projeto inicial no editor
    useEditorStore.getState().hydrateSnapshot({
      editorTags: initialTags,
      rungs: initialRungs,
      fbdNodes: initialFbdNodes,
      fbdEdges: initialFbdEdges,
    });

    // Hidrata unifilar
    const baseDoc = createEmptyDoc();
    useDiagramStore.getState().loadDoc({
      ...baseDoc,
      nodes: {
        "BAR-01": {
          id: "BAR-01",
          type: "busbar",
          position: { x: 100, y: 100 },
          properties: { tag: "BARRAMENTO_380V" },
        },
        "QF-01": {
          id: "QF-01",
          type: "breaker",
          position: { x: 100, y: 200 },
          properties: { in_A: 63, curve: "C" },
        },
      },
      edges: {
        "cabo-01": {
          id: "cabo-01",
          from: { nodeId: "BAR-01", portId: "out" },
          to: { nodeId: "QF-01", portId: "in" },
        },
      },
    } as any);

    expect(useEditorStore.getState().rungs.length).toBe(2);
    expect(useEditorStore.getState().fbdNodes.length).toBe(2);

    // -------------------------------------------------------------
    // ETAPA 2: EDITAR (Adiciona elementos, clona rede, adiciona conexões)
    // -------------------------------------------------------------
    // Edição Ladder: duplica rede 1 com novo ID único determinístico
    const dupId = generateUniqueRungId("rung_dup");
    useEditorStore.getState().setRungs((prev) => [
      ...prev,
      {
        id: dupId,
        label: "Rede Duplicada com Alarme",
        cols: 8,
        cells: [
          [
            { kind: "XIC", operand: "%M0.0" },
            { kind: "OTE", operand: "%Q0.1" },
          ],
        ],
      },
    ]);

    // Edição FBD: adiciona bloco SR_1 e conecta na saída Q de TON_1
    const newFbdNode = {
      id: "SR_1",
      type: "fbdBlock",
      position: { x: 500, y: 100 },
      data: {
        label: "SR_1",
        type: "SR",
        inputs: [
          { id: "s1", name: "S1", type: "BOOL" },
          { id: "r", name: "R", type: "BOOL" },
        ],
        outputs: [{ id: "q1", name: "Q1", type: "BOOL" }],
      },
    };
    useEditorStore.getState().setFbdAll(
      (nodes) => [...nodes, newFbdNode],
      (edges) => [
        ...edges,
        { id: "e_ton_sr", source: "TON_1", sourceHandle: "q", target: "SR_1", targetHandle: "s1" },
      ],
    );

    // Edição Unifilar: adiciona motor na saída do disjuntor
    useDiagramStore.getState().dispatch(
      cmd.addNode({
        id: "MOT-01",
        type: "motor",
        position: { x: 100, y: 300 },
        params: { power_kW: 7.5, voltage_V: 380 },
      } as any),
    );

    // -------------------------------------------------------------
    // ETAPA 3: SALVAR (Gera Snapshot Persistível)
    // -------------------------------------------------------------
    const savedSnapshot = buildProjectSnapshot();

    // Valida compatibilidade com o schema oficial do ElétricAi
    const parsed = SnapshotSchema.safeParse(savedSnapshot);
    expect(parsed.success).toBe(true);

    // -------------------------------------------------------------
    // ETAPA 4: RECARREGAR (Limpa Toda a Memória Local)
    // -------------------------------------------------------------
    useEditorStore.getState().hydrateSnapshot({
      editorTags: {},
      rungs: [],
      fbdNodes: [],
      fbdEdges: [],
    });
    useDiagramStore.getState().resetDoc();
    expect(useEditorStore.getState().rungs.length).toBe(0);
    expect(useEditorStore.getState().fbdNodes.length).toBe(0);

    // -------------------------------------------------------------
    // ETAPA 5: REABRIR (Hidrata a partir do Snapshot Salvo)
    // -------------------------------------------------------------
    useEditorStore.getState().hydrateSnapshot({
      editorTags: savedSnapshot.editor.tags,
      rungs: savedSnapshot.editor.rungs,
      fbdNodes: savedSnapshot.editor.fbdNodes,
      fbdEdges: savedSnapshot.editor.fbdEdges,
      fbdSim: savedSnapshot.editor.fbdSim ?? null,
    });
    useDiagramStore.getState().loadDoc(savedSnapshot.diagram as any);

    // -------------------------------------------------------------
    // ETAPA 6: VERIFICAÇÃO RIGOROSA DE INTEGRIDADE
    // -------------------------------------------------------------
    // 1. Verificação Ladder
    const restoredRungs = useEditorStore.getState().rungs;
    expect(restoredRungs.length).toBe(3);
    expect(restoredRungs[0].id).toBe("rung_start_stop");
    expect(restoredRungs[0].cells[0][0]).toEqual({ kind: "XIC", operand: "%I0.0" });
    expect(restoredRungs[0].cells[0][1]).toEqual({ kind: "XIO", operand: "%I0.1" });
    expect(restoredRungs[0].cells[0][2]).toEqual({ kind: "OTE", operand: "%Q0.0" });

    expect(restoredRungs[1].id).toBe("rung_interlock");
    expect(restoredRungs[1].cells[0][0]).toEqual({ kind: "XIO", operand: "%I0.2" });

    expect(restoredRungs[2].id).toBe(dupId);
    expect(restoredRungs[2].cells[0][1]).toEqual({ kind: "OTE", operand: "%Q0.1" });

    // Todos os IDs são comprovadamente únicos
    const rungIds = restoredRungs.map((r) => r.id);
    expect(new Set(rungIds).size).toBe(3);

    // 2. Verificação FBD
    const restoredFbdNodes = useEditorStore.getState().fbdNodes;
    const restoredFbdEdges = useEditorStore.getState().fbdEdges;
    expect(restoredFbdNodes.length).toBe(3);
    expect(restoredFbdNodes.map((n) => n.id)).toEqual(["AND_1", "TON_1", "SR_1"]);
    expect(restoredFbdNodes[1].data.params.pt).toBe("T#5s");

    expect(restoredFbdEdges.length).toBe(2);
    expect(restoredFbdEdges[0].id).toBe("e_and_ton");
    expect(restoredFbdEdges[1].id).toBe("e_ton_sr");
    expect(restoredFbdEdges[1].source).toBe("TON_1");
    expect(restoredFbdEdges[1].target).toBe("SR_1");

    // 3. Verificação Unifilar
    const restoredDoc = useDiagramStore.getState().doc;
    expect(restoredDoc.nodes["BAR-01"]).toBeDefined();
    expect(restoredDoc.nodes["QF-01"]).toBeDefined();
    expect(restoredDoc.nodes["MOT-01"]).toBeDefined();
    expect(
      (restoredDoc.nodes["MOT-01"].params as any)?.power_kW ??
        (restoredDoc.nodes["MOT-01"] as any).properties?.power_kW,
    ).toBe(7.5);
    expect(restoredDoc.edges["cabo-01"]).toBeDefined();
  });
});
