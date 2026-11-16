import { describe, expect, it } from "vitest";
import { nodeDisplayLabel } from "@/lib/diagram/render/node-label";
import type { DiagramNode } from "@/lib/diagram/schema";

const n = (label: string, tag?: string): Pick<DiagramNode, "label" | "params"> =>
  ({ label, params: { kind: "breaker", in_A: 16, curve: "C", poles: 3, tag } }) as Pick<
    DiagramNode,
    "label" | "params"
  >;

describe("rótulo do símbolo no canvas", () => {
  it("mostra a tag no lugar do código da paleta", () => {
    expect(nodeDisplayLabel(n("QF", "Q1"))).toBe("Q1");
  });
  it("combina tag e descrição sem repetir", () => {
    expect(nodeDisplayLabel(n("Bomba de recalque", "M1"))).toBe("M1 Bomba de recalque");
    expect(nodeDisplayLabel(n("Q1 MG-201", "Q1"))).toBe("Q1 MG-201");
  });
  it("sem tag mantém o rótulo ou o tipo", () => {
    expect(nodeDisplayLabel(n("Disjuntor geral"))).toBe("Disjuntor geral");
    expect(nodeDisplayLabel(n(""))).toBe("breaker");
  });
});
