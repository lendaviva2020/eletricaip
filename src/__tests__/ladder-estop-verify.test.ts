import { describe, it, expect } from "vitest";
import { scanRungsPure, createScanState } from "../lib/ladder/scan-core";
import { fromAiRungSpec } from "../lib/ladder/from-ai-spec";
import { verifyEstopInterlock } from "../lib/ladder/verify-estop";
import type { IndustrialNode, IndustrialEdge } from "../lib/project-store";

const node = (id: string, kind: string, label = id): IndustrialNode =>
  ({
    id,
    kind,
    category: "power",
    label,
    position: { x: 0, y: 0 },
    params: {},
  }) as unknown as IndustrialNode;

const edge = (source: string, target: string, kind = "signal"): IndustrialEdge =>
  ({ id: `${source}-${target}`, source, target, kind }) as unknown as IndustrialEdge;

const nodes = [node("K1", "contactor"), node("M1", "motor"), node("ES1", "estop")];
const edges = [edge("ES1", "K1"), edge("K1", "M1", "power")];

describe("scanRungsPure", () => {
  it("é puro: energiza a bobina com XIC verdadeiro", () => {
    const rung = fromAiRungSpec({
      id: "r1",
      label: "R1",
      output: { kind: "OTE", operand: "K1" },
      branches: [[{ kind: "XIC", operand: "START" }]],
    });
    const { results, tags } = scanRungsPure([rung], { START: true }, createScanState(), 0);
    expect(results[0].poweredOut).toBe(true);
    expect(tags.K1).toBe(true);
  });

  it("TON acumula com o `now` recebido", () => {
    const rung = fromAiRungSpec({
      id: "r2",
      label: "R2",
      output: { kind: "TON", operand: "T1", preset: 100 },
      branches: [[{ kind: "XIC", operand: "IN" }]],
    });
    const st = createScanState();
    scanRungsPure([rung], { IN: true }, st, 0);
    const out = scanRungsPure([rung], { IN: true }, st, 500);
    expect(out.tags.T1).toBe(true);
  });
});

describe("verifyEstopInterlock", () => {
  it("acusa erro quando não há interlock do E-STOP", () => {
    const rung = fromAiRungSpec({
      id: "r1",
      label: "Partida M1",
      output: { kind: "OTE", operand: "K1" },
      branches: [[{ kind: "XIC", operand: "START_M1" }]],
    });
    const findings = verifyEstopInterlock([rung], nodes, edges);
    expect(findings.some((f) => f.severity === "error")).toBe(true);
  });

  it("aprova quando o contato NF do E-STOP está em série", () => {
    const rung = fromAiRungSpec({
      id: "r1",
      label: "Partida M1",
      output: { kind: "OTE", operand: "K1" },
      branches: [
        [
          { kind: "XIO", operand: "ES1" },
          { kind: "XIC", operand: "START_M1" },
        ],
      ],
    });
    const findings = verifyEstopInterlock([rung], nodes, edges);
    expect(findings).toHaveLength(0);
  });

  it("acusa erro quando não existe rung para a bobina", () => {
    const findings = verifyEstopInterlock([], nodes, edges);
    expect(findings.some((f) => f.severity === "error")).toBe(true);
  });
});
