import { describe, expect, it } from "vitest";
import {
  repairDiagramConnections,
  synthesizeDiagramDocFromProject,
} from "@/lib/diagram/connection/connection-repair-engine";
import { DiagramDocSchema, type DiagramDoc, type DiagramNode } from "@/lib/diagram/schema";

function n(
  id: string,
  x: number,
  y: number,
  params: DiagramNode["params"],
  label = "",
): DiagramNode {
  return { id, sheet: "unifilar", position: { x, y }, rotation: 0, label, params };
}

function doc(nodes: DiagramNode[], edges: DiagramDoc["edges"] = {}): DiagramDoc {
  return {
    version: 1,
    id: "d",
    metadata: { title: "t", norms: [] },
    sheets: ["unifilar"],
    nodes: Object.fromEntries(nodes.map((x) => [x.id, x])),
    edges,
  };
}

const powerPairs = (d: DiagramDoc) =>
  Object.values(d.edges)
    .filter((e) => e.kind === "power")
    .map((e) => `${e.source}->${e.target}`)
    .sort();

const Q = (id: string, x: number, y: number, in_A = 16, tag?: string) =>
  n(id, x, y, { kind: "breaker", in_A, curve: "C", poles: 3, tag });
const K = (id: string, x: number, y: number) =>
  n(id, x, y, { kind: "contactor", in_A: 25, coil_V: 24 });
const F = (id: string, x: number, y: number) =>
  n(id, x, y, { kind: "thermal_relay", in_A: 12, trip_class: "10A" });
const M = (id: string, x: number, y: number) =>
  n(id, x, y, { kind: "motor", power_kW: 5.5, voltage_V: 380, startMethod: "DOL" });
const VFD = (id: string, x: number, y: number) =>
  n(id, x, y, { kind: "vfd", power_kW: 5.5, voltage_V: 380 });
const BUS = (id: string, x: number, y: number) =>
  n(id, x, y, { kind: "busbar", current_A: 250, voltage_V: 380 });
const TR = (id: string, x: number, y: number) =>
  n(id, x, y, {
    kind: "transformer",
    kVA: 150,
    primary_V: 13800,
    secondary_V: 380,
    vector: "Dyn11",
  });

describe("Reparo de ligações do unifilar — regressões", () => {
  it("ligação de SINAL não conta como alimentação do contator", () => {
    const d = doc(
      [
        Q("q1", 0, 100),
        K("k1", 0, 200),
        M("m1", 0, 400),
        n("plc", 300, 200, { kind: "plc", cpu: "x", io_count: 16 }),
      ],
      { s1: { id: "s1", sheet: "unifilar", source: "plc", target: "k1", kind: "signal" } },
    );
    const r = repairDiagramConnections(d);
    expect(powerPairs(r.repairedDoc)).toEqual(["k1->m1", "q1->k1"]);
  });

  it("não cria cruzamento fantasma entre ramais distantes", () => {
    // Ramal A completo à esquerda; ramal B à direita tem só o motor, sem disjuntor.
    const d = doc([Q("qa", 0, 100), K("ka", 0, 200), M("ma", 0, 400), M("mb", 3000, 400)]);
    const r = repairDiagramConnections(d);
    const pairs = powerPairs(r.repairedDoc);
    expect(pairs).not.toContain("qa->mb");
    expect(r.remainingIssues.some((i) => i.includes("mb"))).toBe(true);
  });

  it("pareia cada ramal com o vizinho mais próximo (não por ordem de lista)", () => {
    const d = doc([
      Q("q2", 400, 100),
      Q("q1", 0, 100),
      K("k1", 10, 200),
      K("k2", 410, 200),
      M("m2", 400, 400),
      M("m1", 0, 400),
    ]);
    const pairs = powerPairs(repairDiagramConnections(d).repairedDoc);
    expect(pairs).toEqual(["k1->m1", "k2->m2", "q1->k1", "q2->k2"]);
  });

  it("ramal Q → K → VFD → M: contator não rouba o motor do inversor", () => {
    const d = doc([Q("q1", 0, 100), K("k1", 0, 200), VFD("u1", 0, 300), M("m1", 0, 450)]);
    const pairs = powerPairs(repairDiagramConnections(d).repairedDoc);
    expect(pairs).toEqual(["k1->u1", "q1->k1", "u1->m1"]);
  });

  it("ramal Q → K → F → M completo", () => {
    const d = doc([Q("q1", 0, 100), K("k1", 0, 200), F("f1", 0, 300), M("m1", 0, 450)]);
    const pairs = powerPairs(repairDiagramConnections(d).repairedDoc);
    expect(pairs).toEqual(["f1->m1", "k1->f1", "q1->k1"]);
  });

  it("disjuntor geral reconhecido pela TAG Q0 e trafo a montante", () => {
    const d = doc([
      TR("tr", 200, -150),
      Q("qa", 200, 0, 63, "Q0"),
      BUS("bus", 200, 100),
      Q("q1", 0, 200, 16),
      Q("q2", 400, 200, 100), // ramal maior que a geral declarada não vira geral
    ]);
    const pairs = powerPairs(repairDiagramConnections(d).repairedDoc);
    expect(pairs).toContain("tr->qa");
    expect(pairs).toContain("qa->bus");
    expect(pairs).toContain("bus->q1");
    expect(pairs).toContain("bus->q2");
  });

  it("sem disjuntor geral: trafo alimenta o barramento diretamente", () => {
    const d = doc([TR("tr", 0, 0), BUS("bus", 0, 100), Q("q1", 0, 200, 16), Q("q2", 200, 200, 16)]);
    const pairs = powerPairs(repairDiagramConnections(d).repairedDoc);
    expect(pairs).toContain("tr->bus");
    expect(pairs).not.toContain("q1->bus");
  });

  it("ignora nós da folha multifilar", () => {
    const mf = { ...M("mf_m", 0, 400), sheet: "multifilar" as const };
    const d = doc([Q("q1", 0, 100), mf]);
    expect(powerPairs(repairDiagramConnections(d).repairedDoc)).toEqual([]);
  });

  it("é idempotente", () => {
    const d = doc([Q("q1", 0, 100), K("k1", 0, 200), F("f1", 0, 300), M("m1", 0, 450)]);
    const once = repairDiagramConnections(d).repairedDoc;
    const twice = repairDiagramConnections(once);
    expect(twice.repairedCount).toBe(0);
  });

  it("synthesize gera parâmetros válidos no schema para cada tipo", () => {
    const synth = synthesizeDiagramDocFromProject(
      [
        { id: "a", kind: "Barramento" },
        { id: "b", kind: "disjuntor", params: { in_A: -5 } },
        { id: "c", kind: "motor elétrico", params: { power_kW: 11 } },
        { id: "d", kind: "desconhecido" },
      ],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "c", target: "c" },
      ],
    );
    expect(() => DiagramDocSchema.parse(synth)).not.toThrow();
    expect(synth.nodes.a.params.kind).toBe("busbar");
    expect(synth.nodes.b.params.kind).toBe("breaker");
    expect(synth.nodes.c.params).toMatchObject({ kind: "motor", power_kW: 11 });
    expect(Object.values(synth.edges).some((e) => e.source === e.target)).toBe(false);
  });
});
