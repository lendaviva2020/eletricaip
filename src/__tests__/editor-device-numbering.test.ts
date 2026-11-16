import { describe, expect, it } from "vitest";
import { DiagramDocSchema, type DiagramDoc } from "@/lib/diagram/schema";
import { applyCommand, invertCommand } from "@/lib/diagram/commands";
import { planDeviceNumbering } from "@/lib/documentation/diagram-numbering";
import { documentationFromDiagram } from "@/lib/documentation/diagram-adapter";
import { upgradeSnapshotV2ToV3, projectLegacyViewsFromV3 } from "@/lib/model/migration-v2-to-v3";
import type { ProjectSnapshot } from "@/lib/projects.functions";

function node(
  id: string,
  x: number,
  y: number,
  params: Record<string, unknown>,
  sheet: "unifilar" | "multifilar" = "unifilar",
) {
  return { id, sheet, position: { x, y }, rotation: 0, label: id, params };
}

function makeDoc(): DiagramDoc {
  return DiagramDocSchema.parse({
    version: 1,
    id: "d1",
    metadata: { title: "T" },
    sheets: ["unifilar"],
    nodes: {
      q0: node("q0", 0, 0, { kind: "breaker", in_A: 100, tag: "Q0" }),
      qa: node("qa", 0, 200, { kind: "breaker", in_A: 32 }),
      qb: node("qb", 300, 200, { kind: "breaker", in_A: 32, tag: "Q0" }), // duplicada
      k1: node("k1", 0, 300, { kind: "contactor", in_A: 32, tag: "contator do motor" }), // inválida
      m1: node("m1", 0, 400, { kind: "motor", power_kW: 5.5, tag: "M1" }),
      pe: node("pe", 500, 500, { kind: "ground" }),
    },
    edges: {
      e1: {
        id: "e1",
        sheet: "unifilar",
        source: "k1",
        target: "m1",
        kind: "power",
        cable: { insulation: "PVC" }, // cabo sem seção/comprimento informados
      },
    },
  });
}

describe("numeração de dispositivos no editor (IEC 81346, reversível)", () => {
  it("modo 'missing' preserva tags válidas únicas, corrige ausente/ inválida/ duplicada", () => {
    const plan = planDeviceNumbering(makeDoc(), "missing");
    const byNode = Object.fromEntries(plan.changes.map((c) => [c.nodeId, c]));
    expect(byNode.q0).toBeUndefined(); // Q0 original (primeiro por posição) fica
    expect(byNode.m1).toBeUndefined();
    expect(byNode.pe).toBeUndefined(); // terra não é produto
    expect(byNode.qa).toMatchObject({ to: "Q1", reason: "missing" });
    expect(byNode.qb).toMatchObject({ from: "Q0", to: "Q2", reason: "duplicate" });
    expect(byNode.k1).toMatchObject({ to: "K1", reason: "invalid" });
  });

  it("um único Ctrl+Z restaura exatamente o documento anterior", () => {
    const doc = makeDoc();
    const plan = planDeviceNumbering(doc, "missing");
    const after = applyCommand(doc, plan.command!);
    expect(after.nodes.qa.params.tag).toBe("Q1");
    const inverse = invertCommand(doc, plan.command!);
    const restored = applyCommand(after, inverse!);
    // só o carimbo metadata.updatedAt muda (o editor o atualiza em toda edição)
    expect(restored.nodes).toEqual(doc.nodes);
    expect(restored.edges).toEqual(doc.edges);
  });

  it("é idempotente: depois de numerar não há nada a fazer", () => {
    const doc = makeDoc();
    const after = applyCommand(doc, planDeviceNumbering(doc, "missing").command!);
    expect(planDeviceNumbering(after, "missing").command).toBeNull();
  });

  it("modo 'all' renumera por coluna e linha (ordem de colocação)", () => {
    const plan = planDeviceNumbering(makeDoc(), "all");
    const q = plan.changes.filter((c) => c.to.startsWith("Q")).map((c) => `${c.nodeId}:${c.to}`);
    // q0 (col 0, y 0) → Q1; qa (col 0, y 200) → Q2; qb (col 3) → Q3
    expect(q).toEqual(["q0:Q1", "qa:Q2", "qb:Q3"]);
  });
});

describe("modelo canônico não inventa seção/comprimento de cabo", () => {
  it("ida e volta preserva 'não informado' (antes virava 2,5 mm² × 10 m gravados)", () => {
    const doc = makeDoc();
    const snapshot = { schemaVersion: 3, diagram: doc } as unknown as ProjectSnapshot;
    const unified = upgradeSnapshotV2ToV3(snapshot);
    const conductor = unified.engineering.connections.e1.conductor;
    expect(conductor?.crossSectionMm2).toBeUndefined();
    expect(conductor?.lengthM).toBeUndefined();
    expect(conductor?.installationMethod).toBeUndefined();
    const back = projectLegacyViewsFromV3(unified).diagramDoc;
    expect(back.edges.e1.cable?.section_mm2).toBeUndefined();
    expect(back.edges.e1.cable?.length_m).toBeUndefined();
  });

  it("documentação do editor marca o cabo do motor como pendente", () => {
    const docu = documentationFromDiagram(makeDoc());
    const cable = docu.cables.find((c) => c.connectionId === "e1");
    expect(cable?.sectionMm2).toBeNull();
    expect(docu.issues.some((i) => i.code === "MISSING_SECTION")).toBe(true);
  });
});
