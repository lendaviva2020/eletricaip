// #WGL-07 · etapa 2 — cobre a integração do RightPropertyPanel com o
// DiagramStore canônico (dispatch de UpdateNodeParams + validação Zod).
import { describe, expect, it, beforeEach } from "vitest";
import { useDiagramStore } from "@/lib/diagram/store";
import { cmd } from "@/lib/diagram/commands";
import { getParamSpecs } from "@/lib/diagram/param-specs";
import { NodeParamsSchema } from "@/lib/diagram/schema";
import { makeNode } from "@/lib/diagram/model";

describe("#WGL-07 · painel de propriedades sobre DiagramStore", () => {
  beforeEach(() => {
    useDiagramStore.getState().resetDoc();
  });

  it("expõe paramSpecs para cada NodeKind conhecido", () => {
    const specs = getParamSpecs("breaker");
    expect(specs.in_A?.type).toBe("number");
    expect(specs.curve?.type).toBe("select");
    expect(specs.curve?.options?.map((o) => o.value)).toContain("C");
  });

  it("dispatch UpdateNodeParams altera o doc e é reversível", () => {
    const node = makeNode({
      sheet: "unifilar",
      position: { x: 0, y: 0 },
      label: "QF-01",
      params: { kind: "breaker", in_A: 16, curve: "C", poles: 1 },
    });
    const s = useDiagramStore.getState();
    s.dispatch(cmd.addNode({
      sheet: node.sheet,
      position: node.position,
      label: node.label,
      params: node.params,
    }));

    const created = Object.values(useDiagramStore.getState().doc.nodes)[0];
    expect(created).toBeDefined();

    const next = NodeParamsSchema.parse({ ...created.params, in_A: 32 });
    useDiagramStore.getState().dispatch({
      type: "UpdateNodeParams",
      nodeId: created.id,
      from: created.params,
      to: next,
    });

    const after = useDiagramStore.getState().doc.nodes[created.id]
      .params as Extract<typeof created.params, { kind: "breaker" }>;
    expect(after.in_A).toBe(32);

    useDiagramStore.getState().undo();
    const reverted = useDiagramStore.getState().doc.nodes[created.id]
      .params as Extract<typeof created.params, { kind: "breaker" }>;
    expect(reverted.in_A).toBe(16);
  });

  it("rejeita valores inválidos via NodeParamsSchema", () => {
    const invalid = NodeParamsSchema.safeParse({
      kind: "breaker",
      in_A: -5,
      curve: "C",
      poles: 1,
    });
    expect(invalid.success).toBe(false);
  });
});
