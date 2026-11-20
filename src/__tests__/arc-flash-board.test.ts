// Energia de arco por quadro do unifilar (IEEE 1584-2002 + NFPA 70E/NR-10).
import { describe, expect, it } from "vitest";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";
import { analyzeNetwork } from "@/lib/diagram/connection/network-calculation";
import { analyzeArcFlash } from "@/lib/diagram/connection/arc-flash";
import { runDiagramDiagnostics } from "@/lib/diagram/multifilar";

const n = (id: string, params: DiagramNode["params"], y: number): DiagramNode => ({
  id,
  sheet: "unifilar",
  position: { x: 400, y },
  rotation: 0,
  label: id,
  params,
});
const e = (id: string, s: string, t: string, cable?: DiagramEdge["cable"]): DiagramEdge => ({
  id,
  sheet: "unifilar",
  source: s,
  target: t,
  kind: "power",
  circuitConfig: "3F+N+PE",
  ...(cable ? { cable } : {}),
});

function plant(
  opts: {
    kVA?: number;
    q0?: Partial<{ in_A: number; curve: "B" | "C" | "D" }>;
    noBreaker?: boolean;
  } = {},
): DiagramDoc {
  const nodes = [
    n(
      "tr",
      {
        kind: "transformer",
        kVA: opts.kVA ?? 500,
        primary_V: 13800,
        secondary_V: 380,
        vector: "Dyn11",
        tag: "T1",
      },
      0,
    ),
    n(
      "q0",
      {
        kind: "breaker",
        in_A: opts.q0?.in_A ?? 800,
        curve: opts.q0?.curve ?? "C",
        poles: 3,
        tag: "Q0",
      },
      100,
    ),
    n("w1", { kind: "busbar", current_A: 800, voltage_V: 380, tag: "W1" }, 200),
  ];
  const edges = [
    e("e1", "tr", opts.noBreaker ? "w1" : "q0", {
      section_mm2: 240,
      length_m: 5,
      insulation: "PVC",
    }),
    ...(opts.noBreaker ? [] : [e("e2", "q0", "w1")]),
  ];
  const d: DiagramDoc = {
    version: 1,
    id: "d",
    metadata: { title: "t", norms: ["NBR 5410"], network: { earthing: "TN-S" } },
    sheets: ["unifilar"],
    nodes: Object.fromEntries(
      nodes.filter((x) => !(opts.noBreaker && x.id === "q0")).map((x) => [x.id, x]),
    ),
    edges: Object.fromEntries(edges.map((x) => [x.id, x])),
  };
  return d;
}

const arc = (d: DiagramDoc) => analyzeArcFlash(d, analyzeNetwork(d));

describe("arco elétrico por quadro", () => {
  it("quadro geral com disjuntor de montante: energia, EPI e limite calculados", () => {
    const r = arc(plant());
    const b = r.boards.find((x) => x.boardId === "w1")!;
    expect(b.status).not.toBe("pending");
    expect(b.equipment).toBe("switchgear");
    expect(b.protectiveId).toBe("q0");
    expect(b.Ibf_kA!).toBeGreaterThan(10);
    expect(b.incidentEnergy_cal_cm2!).toBeGreaterThan(0);
    // C 800 A: magnético até 8 kA; a 85 % da corrente de arco (~7,3 kA) o disparo
    // instantâneo não é garantido → o pior caso usa a região térmica.
    expect(b.clearingTime_s!).toBeGreaterThan(0.1);
    const fast = arc(plant({ q0: { in_A: 800, curve: "B" } })).boards[0];
    expect(fast.clearingTime_s!).toBeLessThanOrEqual(0.1);
    expect(fast.incidentEnergy_cal_cm2!).toBeLessThan(b.incidentEnergy_cal_cm2!);
    expect(r.premises.some((p) => p.includes("IEEE 1584-2002"))).toBe(true);
  });

  it("disjuntor que não dispara no instantâneo com a corrente de arco: tempo longo e energia maior", () => {
    const fast = arc(plant({ q0: { in_A: 800, curve: "B" } })).boards[0];
    const slow = arc(plant({ kVA: 150, q0: { in_A: 800, curve: "D" } })).boards[0];
    expect(slow.clearingTime_s!).toBeGreaterThan(fast.clearingTime_s!);
  });

  it("sem disjuntor a montante (trafo direto no barramento) fica pendente", () => {
    const r = arc(plant({ noBreaker: true }));
    expect(r.boards[0].status).toBe("pending");
    expect(r.findings.some((f) => f.code === "ARC_FLASH_PENDING")).toBe(true);
  });

  it("entra no diagnóstico do unifilar com prefixo arc_", () => {
    const ids = runDiagramDiagnostics(plant({ noBreaker: true })).map((d) => d.id);
    expect(ids.some((id) => id.startsWith("arc_"))).toBe(true);
  });
});
