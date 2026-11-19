import { describe, expect, it } from "vitest";
import type { AiDiagramPatch, DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";
import {
  isFieldCable,
  loadCurrent_A,
  sizeDiagramCables,
} from "@/lib/diagram/connection/cable-sizing";
import { ampacityIz } from "@/lib/electrical-calc";
import {
  listCablesMissingData,
  listConductorsWithoutSection,
  runDiagramDiagnostics,
} from "@/lib/diagram/multifilar";
import { applyCommand, buildAiPatchCommand, invertCommand } from "@/lib/diagram/commands";

const n = (id: string, params: DiagramNode["params"], y: number): DiagramNode => ({
  id,
  sheet: "unifilar",
  position: { x: 400, y },
  rotation: 0,
  label: id,
  params,
});
const e = (
  id: string,
  source: string,
  target: string,
  cable?: DiagramEdge["cable"],
): DiagramEdge => ({
  id,
  sheet: "unifilar",
  source,
  target,
  kind: "power",
  circuitConfig: "3F+N+PE",
  ...(cable ? { cable } : {}),
});

/** TR → Q0 → barramento → Q1 → K1 → F1 → M1 (15 kW, 380 V). */
function motorBranch(cableF1M1?: DiagramEdge["cable"]): DiagramDoc {
  const nodes = [
    n(
      "tr",
      {
        kind: "transformer",
        kVA: 150,
        primary_V: 13800,
        secondary_V: 380,
        tag: "T1",
      } as DiagramNode["params"],
      0,
    ),
    n("q0", { kind: "breaker", in_A: 125, curve: "C", poles: 3, tag: "Q0" }, 100),
    n(
      "bus",
      { kind: "busbar", current_A: 160, voltage_V: 380, tag: "W1" } as DiagramNode["params"],
      200,
    ),
    n("q1", { kind: "breaker", in_A: 40, curve: "D", poles: 3, tag: "Q1" }, 300),
    n("k1", { kind: "contactor", in_A: 32, coil_V: 24, tag: "K1" } as DiagramNode["params"], 400),
    n("f1", { kind: "thermal_relay", in_A: 32, trip_class: "10A", tag: "F1" }, 500),
    n("m1", { kind: "motor", power_kW: 15, voltage_V: 380, startMethod: "DOL", tag: "M1" }, 600),
  ];
  const edges = [
    e("e_tr", "tr", "q0"),
    e("e_q0", "q0", "bus"),
    e("e_bus", "bus", "q1"),
    e("e_q1", "q1", "k1"),
    e("e_k1", "k1", "f1"),
    e("e_f1", "f1", "m1", cableF1M1),
  ];
  return {
    version: 1,
    id: "d",
    metadata: { title: "t", norms: [] },
    sheets: ["unifilar"],
    nodes: Object.fromEntries(nodes.map((x) => [x.id, x])),
    edges: Object.fromEntries(edges.map((x) => [x.id, x])),
  };
}

describe("sizeDiagramCables — NBR 5410", () => {
  it("dimensiona todos os condutores coordenados com a proteção a montante", () => {
    const doc = motorBranch();
    const r = sizeDiagramCables(doc);
    expect(r.changes.length).toBe(6);
    for (const c of r.changes) {
      expect(c.to.section_mm2).toBeGreaterThan(0);
      // I'z da seção escolhida ≥ In da proteção (Ib ≤ In ≤ I'z)
      if (c.protection_A) {
        const Iz = ampacityIz(c.to.section_mm2!, {
          method: "B1",
          insulation: "PVC",
          loadedConductors: 3,
        });
        expect(Iz).toBeGreaterThanOrEqual(c.protection_A);
      }
    }
  });

  it("ramal de motor: I'z ≥ 1,25·In do motor e protegido pelo relé térmico", () => {
    const r = sizeDiagramCables(motorBranch());
    const motorCable = r.changes.find((c) => c.edgeId === "e_f1")!;
    const In = loadCurrent_A(motorBranch().nodes.m1)!;
    expect(In).toBeGreaterThan(25);
    expect(motorCable.protection_A).toBe(32); // relé térmico F1
    const Iz = ampacityIz(motorCable.to.section_mm2!, {
      method: "B1",
      insulation: "PVC",
      loadedConductors: 3,
    });
    expect(Iz).toBeGreaterThanOrEqual(1.25 * In - 1e-6);
  });

  it("NUNCA inventa comprimento; cabo de campo e alimentador viram pendência nominal", () => {
    const r = sizeDiagramCables(motorBranch());
    for (const c of r.changes) expect(c.to.length_m).toBeUndefined();
    const pending = r.pendingLength.map((p) => p.edgeId).sort();
    expect(pending).toEqual(["e_f1", "e_tr"]); // F1 → M1 (campo) e T1 → Q0 (alimentador)
    expect(r.pendingLength.find((p) => p.edgeId === "e_f1")?.name).toBe("F1 → M1");
    expect(r.premises.some((p) => /B1/.test(p))).toBe(true); // premissa declarada
  });

  it("preserva seção adequada do usuário e corrige a subdimensionada", () => {
    const ok = sizeDiagramCables(
      motorBranch({ insulation: "PVC", section_mm2: 16, length_m: 40, installation: "B1" }),
    );
    expect(ok.changes.find((c) => c.edgeId === "e_f1")).toBeUndefined();
    expect(ok.pendingLength.find((p) => p.edgeId === "e_f1")).toBeUndefined();

    const small = sizeDiagramCables(
      motorBranch({ insulation: "PVC", section_mm2: 1.5, length_m: 40 }),
    );
    const fix = small.changes.find((c) => c.edgeId === "e_f1")!;
    expect(fix.reason).toBe("undersized");
    expect(fix.to.section_mm2).toBeGreaterThan(1.5);
    expect(fix.to.length_m).toBe(40); // comprimento do usuário mantido
  });

  it("é idempotente", () => {
    const first = sizeDiagramCables(motorBranch());
    const second = sizeDiagramCables(first.doc);
    expect(second.changes).toEqual([]);
  });
});

describe("diagnóstico de cabos — só cabo de campo exige comprimento", () => {
  it("fiação interna do painel não é cobrada como 'sem comprimento'", () => {
    const doc = motorBranch();
    expect(isFieldCable(doc, doc.edges.e_q1)).toBe(false);
    expect(isFieldCable(doc, doc.edges.e_f1)).toBe(true);
    expect(listCablesMissingData(doc).sort()).toEqual(["e_f1", "e_tr"]);
    expect(listConductorsWithoutSection(doc).length).toBe(4);
    const alerts = runDiagramDiagnostics(doc);
    expect(alerts.find((a) => a.id === "vd_missing_data")?.message).toMatch(/F1 → M1/);
    expect(alerts.some((a) => a.id === "cond_section_missing")).toBe(true);

    const sized = sizeDiagramCables(doc).doc;
    expect(listConductorsWithoutSection(sized)).toEqual([]);
    expect(runDiagramDiagnostics(sized).some((a) => a.id === "cond_section_missing")).toBe(false);
  });
});

describe("patch da IA aplica dado de cabo informado pelo usuário (e Ctrl+Z desfaz)", () => {
  it("updateEdges.cable chega na ligação e o inverso restaura", () => {
    const doc = motorBranch();
    const patch: AiDiagramPatch = {
      rationale: "t",
      addNodes: [],
      addEdges: [],
      removeNodeIds: [],
      removeEdgeIds: [],
      updateNodes: [],
      updateEdges: [{ id: "e_f1", cable: { insulation: "PVC", section_mm2: 10, length_m: 35 } }],
    };
    const cmd = buildAiPatchCommand(doc, patch);
    const after = applyCommand(doc, cmd);
    expect(after.edges.e_f1.cable).toMatchObject({ section_mm2: 10, length_m: 35 });
    const undone = applyCommand(after, invertCommand(after, cmd)!);
    expect(undone.edges.e_f1.cable).toBeUndefined();
  });
});
