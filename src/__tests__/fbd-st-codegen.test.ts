import { describe, expect, it } from "vitest";
import type { Node, Edge } from "reactflow";
import { compileFbdNodesToSt } from "@/lib/fbd/editor-bridge";
import { generateStructuredText, createDefaultRegistry, type FbdDocument } from "@/lib/fbd/engine";

describe("Fase 4.2: Unificação dos Compiladores FBD → Structured Text (IEC 61131-3)", () => {
  it("compila nós visuais de lógica booleana (AND/NOT) em código ST canônico", () => {
    const nodes: Node[] = [
      {
        id: "and1",
        type: "fbdBlock",
        position: { x: 100, y: 100 },
        data: {
          label: "AND 1",
          type: "AND",
          inputs: [
            { id: "IN1", label: "IN1", type: "BOOL" },
            { id: "IN2", label: "IN2", type: "BOOL" },
          ],
          outputs: [{ id: "OUT", label: "OUT", type: "BOOL" }],
        },
      },
      {
        id: "not1",
        type: "fbdBlock",
        position: { x: 300, y: 100 },
        data: {
          label: "NOT 1",
          type: "NOT",
          inputs: [{ id: "IN", label: "IN", type: "BOOL" }],
          outputs: [{ id: "OUT", label: "OUT", type: "BOOL" }],
        },
      },
    ];

    const edges: Edge[] = [
      {
        id: "e1",
        source: "and1",
        sourceHandle: "OUT",
        target: "not1",
        targetHandle: "IN",
      },
    ];

    const st = compileFbdNodesToSt(nodes, edges, "MotorInterlock");

    expect(st).toContain("PROGRAM MotorInterlock");
    expect(st).toContain("VAR_INPUT");
    expect(st).toContain("END_VAR");
    expect(st).toContain("VAR");
    expect(st).toContain("and1_OUT := ");
    expect(st).toContain("AND");
    expect(st).toContain("not1_OUT := NOT (and1_OUT);");
    expect(st).toContain("END_PROGRAM");
  });

  it("compila blocos funcionais temporizadores (TON) com declaração de instância", () => {
    const nodes: Node[] = [
      {
        id: "timer1",
        type: "fbdBlock",
        position: { x: 200, y: 200 },
        data: {
          label: "Partida Estrela-Triângulo",
          type: "TON",
          inputs: [
            { id: "IN", label: "IN", type: "BOOL" },
            { id: "PT", label: "PT", type: "TIME" },
          ],
          outputs: [
            { id: "Q", label: "Q", type: "BOOL" },
            { id: "ET", label: "ET", type: "TIME" },
          ],
          params: {
            PT: "T#5s",
          },
        },
      },
    ];

    const edges: Edge[] = [];

    const st = compileFbdNodesToSt(nodes, edges, "StarDeltaTimer");

    expect(st).toContain("PROGRAM StarDeltaTimer");
    expect(st).toContain("timer1 : TON;");
    expect(st).toContain("timer1(IN := ");
    expect(st).toMatch(/PT := T#5000ms/i);
    expect(st).toContain("timer1_Q := timer1.Q;");
    expect(st).toContain("END_PROGRAM");
  });

  it("emite diagnósticos estruturados em comentários quando o diagrama possui erros de ciclo", () => {
    const reg = createDefaultRegistry();
    const cyclicDoc: FbdDocument = {
      id: "doc-cyclic",
      name: "CicloInvalido",
      version: 1,
      cycleTimeMs: 100,
      networks: [{ id: "N1", name: "Rede 1", executionOrder: 1, enabled: true }],
      nodes: [
        {
          id: "n1",
          instanceName: "n1",
          blockType: "NOT",
          networkId: "N1",
          params: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "n2",
          instanceName: "n2",
          blockType: "NOT",
          networkId: "N1",
          params: {},
          position: { x: 100, y: 0 },
        },
      ],
      connections: [
        { id: "c1", source: { nodeId: "n1", port: "OUT" }, target: { nodeId: "n2", port: "IN" } },
        { id: "c2", source: { nodeId: "n2", port: "OUT" }, target: { nodeId: "n1", port: "IN" } },
      ],
      variables: [],
    };

    const result = generateStructuredText(cyclicDoc, reg);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.code).toContain("// [ERROR] CYCLIC_DEPENDENCY");
    expect(result.code).toContain("PROGRAM CicloInvalido");
  });
});
