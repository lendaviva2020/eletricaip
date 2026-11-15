import { beforeEach, describe, expect, it } from "vitest";
import { sanitizeAiPatch } from "@/lib/diagram/ai-patch-sanitizer";
import { useDiagramStore } from "@/lib/diagram/store";
import type { AiDiagramPatch, DiagramDoc, DiagramNode } from "@/lib/diagram/schema";

function node(id: string, params: DiagramNode["params"]): DiagramNode {
  return { id, sheet: "unifilar", position: { x: 0, y: 0 }, rotation: 0, label: id, params };
}
const breaker = (id: string) => node(id, { kind: "breaker", in_A: 16, curve: "C", poles: 3 });
const motor = (id: string) =>
  node(id, { kind: "motor", power_kW: 5.5, voltage_V: 380, startMethod: "DOL" });

function baseDoc(): DiagramDoc {
  return {
    version: 1,
    id: "d",
    metadata: { title: "t", norms: [] },
    sheets: ["unifilar"],
    nodes: { q1: breaker("q1"), m1: motor("m1") },
    edges: { e1: { id: "e1", sheet: "unifilar", source: "q1", target: "m1", kind: "power" } },
  };
}

function patch(p: Partial<AiDiagramPatch>): AiDiagramPatch {
  return {
    rationale: "t",
    addNodes: [],
    addEdges: [],
    removeNodeIds: [],
    removeEdgeIds: [],
    updateNodes: [],
    updateEdges: [],
    ...p,
  };
}

describe("sanitizeAiPatch", () => {
  it("renomeia nó novo que colide e redireciona as arestas novas", () => {
    const r = sanitizeAiPatch(
      baseDoc(),
      patch({
        addNodes: [motor("m1")],
        addEdges: [{ id: "e2", sheet: "unifilar", source: "q1", target: "m1", kind: "signal" }],
      }),
    );
    expect(r.patch.addNodes[0].id).toBe("m1_2");
    expect(r.patch.addEdges[0].target).toBe("m1_2");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("remoção de nó remove suas ligações em cascata", () => {
    const r = sanitizeAiPatch(baseDoc(), patch({ removeNodeIds: ["m1"] }));
    expect(r.patch.removeEdgeIds).toContain("e1");
  });

  it("descarta aresta para nó inexistente, laço e condutor duplicado", () => {
    const r = sanitizeAiPatch(
      baseDoc(),
      patch({
        addEdges: [
          { id: "x1", sheet: "unifilar", source: "q1", target: "ghost", kind: "power" },
          { id: "x2", sheet: "unifilar", source: "q1", target: "q1", kind: "power" },
          { id: "x3", sheet: "unifilar", source: "m1", target: "q1", kind: "power" },
        ],
      }),
    );
    expect(r.patch.addEdges).toEqual([]);
    expect(r.warnings).toHaveLength(3);
  });

  it("não permite trocar o tipo do equipamento via update (mantém posição)", () => {
    const r = sanitizeAiPatch(
      baseDoc(),
      patch({
        updateNodes: [
          {
            id: "q1",
            position: { x: 50, y: 50 },
            params: { kind: "motor", power_kW: 1, voltage_V: 380, startMethod: "DOL" },
          },
          { id: "nope", label: "x" },
        ],
      }),
    );
    expect(r.patch.updateNodes).toEqual([{ id: "q1", position: { x: 50, y: 50 } }]);
  });

  it("patch limpo passa inalterado e sem avisos", () => {
    const p = patch({
      addNodes: [motor("m2")],
      addEdges: [{ id: "e2", sheet: "unifilar", source: "q1", target: "m2", kind: "power" }],
    });
    const r = sanitizeAiPatch(baseDoc(), p);
    expect(r.warnings).toEqual([]);
    expect(r.patch.addNodes).toEqual(p.addNodes);
    expect(r.patch.addEdges).toEqual(p.addEdges);
  });
});

describe("applyAiPatch + Ctrl+Z não destrói equipamento do usuário", () => {
  beforeEach(() => useDiagramStore.getState().loadDoc(baseDoc()));

  it("undo após patch colidente restaura o diagrama original", () => {
    const original = useDiagramStore.getState().doc.nodes.m1;
    useDiagramStore.getState().applyAiPatch(patch({ addNodes: [{ ...motor("m1"), label: "IA" }] }));
    const after = useDiagramStore.getState().doc;
    expect(after.nodes.m1).toEqual(original);
    expect(after.nodes.m1_2?.label).toBe("IA");
    useDiagramStore.getState().undo();
    const undone = useDiagramStore.getState().doc;
    expect(undone.nodes.m1).toEqual(original);
    expect(undone.nodes.m1_2).toBeUndefined();
  });
});
