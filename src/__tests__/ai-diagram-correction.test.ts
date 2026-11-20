import { describe, expect, it } from "vitest";
import type { AiDiagramPatch, DiagramDoc, DiagramNode } from "@/lib/diagram/schema";
import { normalizeDeviceTags } from "@/lib/diagram/connection/renumber";
import { placeAddedNodes, routeDiagramEdges } from "@/lib/diagram/connection/auto-layout-router";
import { sanitizeAiPatch } from "@/lib/diagram/ai-patch-sanitizer";

function node(
  id: string,
  params: DiagramNode["params"],
  pos = { x: 0, y: 0 },
  label = id,
): DiagramNode {
  return { id, sheet: "unifilar", position: pos, rotation: 0, label, params };
}
const breaker = (id: string, tag: string | undefined, pos: { x: number; y: number }) =>
  node(id, { kind: "breaker", in_A: 16, curve: "C", poles: 3, ...(tag ? { tag } : {}) }, pos);
const motor = (id: string, tag: string | undefined, pos: { x: number; y: number }) =>
  node(
    id,
    { kind: "motor", power_kW: 5.5, voltage_V: 380, startMethod: "DOL", ...(tag ? { tag } : {}) },
    pos,
  );

function doc(nodes: DiagramNode[], edges: DiagramDoc["edges"] = {}): DiagramDoc {
  return {
    version: 1,
    id: "d",
    metadata: { title: "t", norms: [] },
    sheets: ["unifilar"],
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    edges,
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

describe("normalizeDeviceTags — numeração sequencial Q1..Qn por tipo", () => {
  it("converte DJ/DJ1 para Q1, Q2 e preserva Q0 (geral) e tags corretas", () => {
    const d = doc([
      breaker("b0", "Q0", { x: 400, y: 100 }),
      breaker("b1", "DJ", { x: 100, y: 300 }),
      breaker("b2", "DJ1", { x: 300, y: 300 }),
      breaker("b3", "Q5", { x: 500, y: 300 }),
      motor("m1", undefined, { x: 100, y: 500 }),
      motor("m2", "M3", { x: 300, y: 500 }),
    ]);
    const { doc: out, changes } = normalizeDeviceTags(d);
    expect(out.nodes.b0.params.tag).toBe("Q0"); // geral preservado
    expect(out.nodes.b3.params.tag).toBe("Q5"); // tag correta única preservada
    // DJ e DJ1 (letra errada) viram Q#, sem colidir com Q0/Q5
    const djTags = [out.nodes.b1.params.tag, out.nodes.b2.params.tag].sort();
    expect(djTags).toEqual(["Q1", "Q2"]);
    expect(out.nodes.m1.params.tag).toBe("M1"); // sem tag → M1
    expect(out.nodes.m2.params.tag).toBe("M3"); // M3 correto preservado
    expect(changes.length).toBeGreaterThan(0);
  });

  it("é idempotente (segunda passada não muda nada)", () => {
    const d = doc([
      breaker("b1", "DJ", { x: 100, y: 300 }),
      breaker("b2", "DJ2", { x: 300, y: 300 }),
    ]);
    const first = normalizeDeviceTags(d);
    const second = normalizeDeviceTags(first.doc);
    expect(second.changes).toEqual([]);
    expect(second.doc.nodes).toEqual(first.doc.nodes);
  });

  it("nunca adiciona, remove ou move equipamento", () => {
    const d = doc([
      breaker("b1", "DJ", { x: 100, y: 300 }),
      motor("m1", undefined, { x: 100, y: 500 }),
    ]);
    const { doc: out } = normalizeDeviceTags(d);
    expect(Object.keys(out.nodes).sort()).toEqual(["b1", "m1"]);
    expect(out.nodes.b1.position).toEqual({ x: 100, y: 300 });
    expect(out.nodes.m1.position).toEqual({ x: 100, y: 500 });
  });
});

describe("placeAddedNodes — preserva o layout manual, posiciona só o novo", () => {
  it("mantém as posições existentes e ancora o nó novo abaixo da fonte", () => {
    const d = doc(
      [
        breaker("q1", "Q1", { x: 400, y: 100 }),
        motor("m1", "M1", { x: 400, y: 500 }),
        breaker("new", "F1", { x: 0, y: 0 }), // DR novo, posição inicial ruim
      ],
      {
        e1: { id: "e1", sheet: "unifilar", source: "q1", target: "new", kind: "power" },
      },
    );
    const out = placeAddedNodes(d, new Set(["new"]));
    expect(out.nodes.q1.position).toEqual({ x: 400, y: 100 }); // intacto
    expect(out.nodes.m1.position).toEqual({ x: 400, y: 500 }); // intacto
    expect(out.nodes.new.position.x).toBe(400); // alinhado à fonte q1
    expect(out.nodes.new.position.y).toBeGreaterThan(100); // abaixo da fonte
  });

  it("sem nós novos, retorna o doc sem alterações", () => {
    const d = doc([breaker("q1", "Q1", { x: 10, y: 20 })]);
    expect(placeAddedNodes(d, new Set())).toBe(d);
  });
});

describe("routeDiagramEdges — reroteia sem mover nós", () => {
  it("preserva todas as posições e só recalcula waypoints", () => {
    const d = doc(
      [breaker("q1", "Q1", { x: 400, y: 100 }), motor("m1", "M1", { x: 400, y: 400 })],
      { e1: { id: "e1", sheet: "unifilar", source: "q1", target: "m1", kind: "power" } },
    );
    const out = routeDiagramEdges(d);
    expect(out.nodes.q1.position).toEqual({ x: 400, y: 100 });
    expect(out.nodes.m1.position).toEqual({ x: 400, y: 400 });
    expect(out.edges.e1.waypoints?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("sanitizeAiPatch — dedup de equipamento já existente (anti-loop)", () => {
  const existing = doc([breaker("q0", "Q0", { x: 400, y: 100 })]);

  it("descarta addNode que reemite um equipamento com tag já existente", () => {
    const r = sanitizeAiPatch(
      existing,
      patch({ addNodes: [breaker("n_q0_dup", "Q0", { x: 0, y: 0 })] }),
    );
    expect(r.patch.addNodes).toHaveLength(0);
    expect(r.warnings.some((w) => /já existe no diagrama/.test(w))).toBe(true);
  });

  it("permite addNode com tag nova (não é duplicata)", () => {
    const r = sanitizeAiPatch(
      existing,
      patch({ addNodes: [breaker("n_q1", "Q1", { x: 0, y: 200 })] }),
    );
    expect(r.patch.addNodes).toHaveLength(1);
  });

  it("descarta o 2º addNode que duplica a tag do 1º no mesmo patch", () => {
    const r = sanitizeAiPatch(
      doc([]),
      patch({
        addNodes: [breaker("a", "Q1", { x: 0, y: 0 }), breaker("b", "Q1", { x: 100, y: 0 })],
      }),
    );
    expect(r.patch.addNodes).toHaveLength(1);
    expect(r.patch.addNodes[0].id).toBe("a");
  });
});

describe("sanitizeAiPatch — valores da IA ficam não confirmados", () => {
  it("equipamento novo da IA: todos os valores nominais pendentes", () => {
    const r = sanitizeAiPatch(doc([]), patch({ addNodes: [breaker("q1", "Q1", { x: 0, y: 0 })] }));
    const pending = (r.patch.addNodes[0].params as { unconfirmed?: string[] }).unconfirmed;
    expect(pending?.sort()).toEqual(["curve", "in_A", "poles"]);
  });

  it("atualização da IA: só o que mudou fica pendente; o confirmado e igual continua confirmado", () => {
    const base = doc([breaker("q1", "Q1", { x: 0, y: 0 })]);
    const r = sanitizeAiPatch(
      base,
      patch({
        updateNodes: [
          { id: "q1", params: { kind: "breaker", in_A: 25, curve: "C", poles: 3, tag: "Q1" } },
        ],
      }),
    );
    const pending = (r.patch.updateNodes[0].params as { unconfirmed?: string[] }).unconfirmed;
    expect(pending).toEqual(["in_A"]);
  });
});
