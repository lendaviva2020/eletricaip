import { describe, expect, it } from "vitest";
import type { DiagramDoc, DiagramNode } from "@/lib/diagram/schema";
import { repairDiagramConnections } from "@/lib/diagram/connection/connection-repair-engine";

const n = (id: string, params: DiagramNode["params"], x: number, y: number): DiagramNode => ({
  id,
  sheet: "unifilar",
  position: { x, y },
  rotation: 0,
  label: id,
  params,
});

function doc(nodes: DiagramNode[]): DiagramDoc {
  return {
    version: 1,
    id: "d",
    metadata: { title: "t", norms: [] },
    sheets: ["unifilar"],
    nodes: Object.fromEntries(nodes.map((x) => [x.id, x])),
    edges: {},
  };
}

const powerPairs = (d: DiagramDoc) =>
  Object.values(d.edges)
    .filter((e) => e.kind === "power")
    .map((e) => `${e.source}>${e.target}`)
    .sort();

describe("reparo — dispositivos em série", () => {
  it("encadeia TR → Q0 → QS → DR → barramento (QS e DR não ficam sem alimentação)", () => {
    const d = doc([
      n(
        "tr",
        {
          kind: "transformer",
          kVA: 150,
          primary_V: 13800,
          secondary_V: 380,
          tag: "T1",
        } as DiagramNode["params"],
        400,
        0,
      ),
      n("q0", { kind: "breaker", in_A: 125, curve: "C", poles: 3, tag: "Q0" }, 400, 120),
      n("qs", { kind: "disconnector", in_A: 125, tag: "QS1" } as DiagramNode["params"], 400, 240),
      n(
        "dr",
        {
          kind: "rcd",
          in_A: 125,
          sensitivity_mA: 300,
          poles: 4,
          tag: "F0",
        } as DiagramNode["params"],
        400,
        360,
      ),
      n(
        "bus",
        { kind: "busbar", current_A: 160, voltage_V: 380, tag: "W1" } as DiagramNode["params"],
        400,
        480,
      ),
      n("q1", { kind: "breaker", in_A: 32, curve: "D", poles: 3, tag: "Q1" }, 400, 600),
      n(
        "m1",
        { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL", tag: "M1" },
        400,
        720,
      ),
    ]);
    const r = repairDiagramConnections(d);
    const pairs = powerPairs(r.repairedDoc);
    expect(pairs).toContain("tr>q0");
    expect(pairs).toContain("q0>qs");
    expect(pairs).toContain("qs>dr");
    expect(pairs).toContain("dr>bus");
    expect(pairs).toContain("bus>q1");
    // Sem laço: o barramento nunca realimenta o disjuntor geral; Q0 não liga direto no barramento.
    expect(pairs).not.toContain("bus>q0");
    expect(pairs).not.toContain("q0>bus");
    expect(r.remainingIssues.join(" ")).not.toMatch(/sem alimenta/);
  });

  it("ramal de tomada com DR: Q → DR → tomada (o DR não é pulado)", () => {
    const d = doc([
      n("q0", { kind: "breaker", in_A: 63, curve: "C", poles: 3, tag: "Q0" }, 400, 0),
      n(
        "bus",
        { kind: "busbar", current_A: 80, voltage_V: 380, tag: "W1" } as DiagramNode["params"],
        400,
        120,
      ),
      n("q3", { kind: "breaker", in_A: 20, curve: "C", poles: 2, tag: "Q3" }, 400, 240),
      n(
        "dr3",
        { kind: "rcd", in_A: 25, sensitivity_mA: 30, poles: 2, tag: "F3" } as DiagramNode["params"],
        400,
        360,
      ),
      n("x1", { kind: "socket", current_A: 20, voltage_V: 220, tag: "X1" }, 400, 480),
    ]);
    const pairs = powerPairs(repairDiagramConnections(d).repairedDoc);
    expect(pairs).toContain("q3>dr3");
    expect(pairs).toContain("dr3>x1");
    expect(pairs).not.toContain("q3>x1");
  });

  it("é idempotente (segunda passada não adiciona nada)", () => {
    const d = doc([
      n("q0", { kind: "breaker", in_A: 125, curve: "C", poles: 3, tag: "Q0" }, 400, 0),
      n("qs", { kind: "disconnector", in_A: 125, tag: "QS1" } as DiagramNode["params"], 400, 120),
      n(
        "bus",
        { kind: "busbar", current_A: 160, voltage_V: 380, tag: "W1" } as DiagramNode["params"],
        400,
        240,
      ),
    ]);
    const first = repairDiagramConnections(d);
    const second = repairDiagramConnections(first.repairedDoc);
    expect(second.addedEdges).toEqual([]);
  });
});
