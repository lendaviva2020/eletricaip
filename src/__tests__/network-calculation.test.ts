// Cálculo de rede do unifilar: curto por ponto (IEC 60909), seccionamento
// automático (NBR 5410 §5.1.2.2.4), queda total e suportabilidade térmica.
import { describe, expect, it } from "vitest";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";
import {
  analyzeNetwork,
  protectiveConductorSection,
} from "@/lib/diagram/connection/network-calculation";
import { analyzeProtectionCoordination } from "@/lib/diagram/connection/protection-coordination";
import { applyCommand, invertCommand } from "@/lib/diagram/commands";

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

/** TR 150 kVA → Q0 → W1 → Q1 → K1 → F1 → M1 (15 kW). */
function plant(
  opts: {
    curve?: "B" | "C" | "D";
    motorCable?: DiagramEdge["cable"];
    network?: DiagramDoc["metadata"]["network"];
    q1Icu?: number;
  } = {},
): DiagramDoc {
  const nodes = [
    n(
      "tr",
      {
        kind: "transformer",
        kVA: 150,
        primary_V: 13800,
        secondary_V: 380,
        vector: "Dyn11",
        tag: "T1",
      },
      0,
    ),
    n("q0", { kind: "breaker", in_A: 250, curve: "C", poles: 3, tag: "Q0" }, 100),
    n("w1", { kind: "busbar", current_A: 250, voltage_V: 380, tag: "W1" }, 200),
    n(
      "q1",
      {
        kind: "breaker",
        in_A: 40,
        curve: opts.curve ?? "D",
        poles: 3,
        tag: "Q1",
        ...(opts.q1Icu ? { icc_kA: opts.q1Icu } : {}),
      },
      300,
    ),
    n("k1", { kind: "contactor", in_A: 32, coil_V: 24, tag: "K1" }, 400),
    n("f1", { kind: "thermal_relay", in_A: 30, trip_class: "10A", tag: "F1" }, 500),
    n("m1", { kind: "motor", power_kW: 15, voltage_V: 380, startMethod: "DOL", tag: "M1" }, 600),
  ];
  const edges = [
    e("e1", "tr", "q0", { section_mm2: 95, length_m: 5, insulation: "PVC" }),
    e("e2", "q0", "w1"),
    e("e3", "w1", "q1"),
    e("e4", "q1", "k1"),
    e("e5", "k1", "f1"),
    e("e6", "f1", "m1", opts.motorCable),
  ];
  return {
    version: 1,
    id: "d",
    metadata: {
      title: "t",
      norms: ["NBR 5410"],
      ...(opts.network ? { network: opts.network } : {}),
    },
    sheets: ["unifilar"],
    nodes: Object.fromEntries(nodes.map((x) => [x.id, x])),
    edges: Object.fromEntries(edges.map((x) => [x.id, x])),
  };
}
const codes = (d: DiagramDoc) => analyzeNetwork(d).findings.map((f) => f.code);

describe("curto-circuito por ponto", () => {
  it("cai ao longo do cabo de campo e o mínimo é menor que o máximo", () => {
    const r = analyzeNetwork(
      plant({ motorCable: { section_mm2: 4, length_m: 50, insulation: "PVC" } }),
    );
    const atBus = r.nodes.q1.Ik3max_kA!;
    const atMotor = r.nodes.m1.Ik3max_kA!;
    expect(atBus).toBeGreaterThan(6);
    expect(atBus).toBeLessThan(7.5);
    // 50 m de 4 mm²: ≈ 1,06 kA trifásico e ≈ 0,3 kA fase-terra.
    expect(atMotor).toBeGreaterThan(0.95);
    expect(atMotor).toBeLessThan(1.15);
    expect(r.nodes.m1.Ik1min_kA!).toBeGreaterThan(0.27);
    expect(r.nodes.m1.Ik1min_kA!).toBeLessThan(0.34);
  });

  it("rede da concessionária informada reduz o curto e some a premissa de rede infinita", () => {
    const inf = analyzeNetwork(plant());
    const real = analyzeNetwork(plant({ network: { utilityScc_MVA: 50 } }));
    expect(real.nodes.q1.Ik3max_kA!).toBeLessThan(inf.nodes.q1.Ik3max_kA!);
    expect(inf.premises.some((p) => p.includes("infinita"))).toBe(true);
    expect(real.premises.some((p) => p.includes("infinita"))).toBe(false);
  });

  it("cabo de campo sem comprimento deixa o ponto indeterminado — nada presumido", () => {
    const r = analyzeNetwork(plant());
    expect(r.nodes.m1.Ik3max_kA).toBeUndefined();
    expect(r.nodes.m1.blockedByEdgeId).toBe("e6");
    expect(codes(plant())).toContain("SHORT_CIRCUIT_PENDING");
    expect(codes(plant())).toContain("AUTO_DISCONNECTION_PENDING");
  });

  it("sem fonte no diagrama não calcula nem acusa nada", () => {
    const d = plant();
    delete d.nodes.tr;
    delete d.edges.e1;
    const r = analyzeNetwork(d);
    expect(Object.keys(r.nodes)).toHaveLength(0);
    expect(r.findings).toHaveLength(0);
  });
});

describe("seccionamento automático (TN)", () => {
  const long = { section_mm2: 4, length_m: 50, insulation: "PVC" as const };
  it("curva D 40 A não dispara com 0,3 kA no fim de 50 m de 4 mm²", () => {
    const f = analyzeNetwork(
      plant({ curve: "D", motorCable: long, network: { earthing: "TN-S" } }),
    ).findings.find((x) => x.code === "AUTO_DISCONNECTION_FAIL");
    expect(f?.severity).toBe("error");
    expect(f?.nodeId).toBe("q1");
  });
  it("curva B 40 A (200 A) dispara", () => {
    expect(
      codes(plant({ curve: "B", motorCable: long, network: { earthing: "TN-S" } })),
    ).not.toContain("AUTO_DISCONNECTION_FAIL");
  });
  it("esquema não informado vira aviso, não erro", () => {
    const fs = analyzeNetwork(plant({ curve: "D", motorCable: long })).findings;
    expect(fs.find((x) => x.code === "EARTHING_UNKNOWN")).toBeDefined();
    expect(fs.find((x) => x.code === "AUTO_DISCONNECTION_FAIL")?.severity).toBe("warning");
  });
  it("TT sem DR a montante da carga", () => {
    expect(codes(plant({ motorCable: long, network: { earthing: "TT" } }))).toContain(
      "TT_WITHOUT_RCD",
    );
  });
});

describe("queda total e suportabilidade térmica", () => {
  it("queda total acima de 7 % na carga", () => {
    const c = codes(
      plant({
        motorCable: { section_mm2: 2.5, length_m: 400, insulation: "PVC" },
        network: { earthing: "TN-S" },
      }),
    );
    expect(c).toContain("VOLTAGE_DROP_TOTAL");
  });
  it("cabo fino logo após o barramento precisa de proteção limitadora", () => {
    const d = plant({ motorCable: { section_mm2: 4, length_m: 10, insulation: "PVC" } });
    d.edges.e4 = { ...d.edges.e4, cable: { section_mm2: 1.5, insulation: "PVC" } };
    expect(codes(d)).toContain("CABLE_THERMAL_LIMITING");
    const ok = analyzeNetwork(
      plant({ motorCable: { section_mm2: 4, length_m: 10, insulation: "PVC" } }),
    );
    expect(ok.edges.e6.withstand_s).toBeGreaterThan(0);
    expect(
      analyzeNetwork(d).findings.filter((x) => x.code === "CABLE_THERMAL_LIMITING"),
    ).toHaveLength(1);
  });
  it("PE pela NBR 5410 Tab. 58", () => {
    expect(protectiveConductorSection(10)).toBe(10);
    expect(protectiveConductorSection(25)).toBe(16);
    expect(protectiveConductorSection(95)).toBe(47.5);
  });
});

describe("Icu no ponto de instalação", () => {
  it("disjuntor de campo é comparado com o curto local, não com o do trafo", () => {
    const d = plant({ motorCable: { section_mm2: 4, length_m: 50, insulation: "PVC" } });
    // Disjuntor extra na ponta do cabo de 50 m: curto local ≈ 1 kA.
    d.nodes.q9 = n(
      "q9",
      { kind: "breaker", in_A: 16, curve: "C", poles: 3, tag: "Q9", icc_kA: 3 },
      700,
    );
    d.edges.e7 = e("e7", "m1", "q9");
    const f = analyzeProtectionCoordination(d).findings.filter(
      (x) => x.code === "BREAKING_CAPACITY_LOW" && x.nodeId === "q9",
    );
    expect(f).toHaveLength(0);
    // No barramento (≈ 7 kA), 3 kA não basta.
    const low = analyzeProtectionCoordination(plant({ q1Icu: 3 })).findings;
    expect(low.some((x) => x.code === "BREAKING_CAPACITY_LOW" && x.nodeId === "q1")).toBe(true);
  });
});

describe("dados da rede no documento", () => {
  it("comando reversível", () => {
    const d = plant();
    const cmd = {
      type: "UpdateNetworkSettings" as const,
      from: undefined,
      to: { earthing: "TN-S" as const },
    };
    const after = applyCommand(d, cmd);
    expect(after.metadata.network?.earthing).toBe("TN-S");
    const back = applyCommand(after, invertCommand(after, cmd)!);
    expect(back.metadata.network).toBeUndefined();
  });
});

describe("etiquetas no diagrama", () => {
  it("mostra curto, Icu e queda; ponto sem dados fica pendente", async () => {
    const { buildNetworkBadges } = await import("@/lib/diagram/render/network-overlay");
    const d = plant({ q1Icu: 3 });
    const badges = buildNetworkBadges(d, analyzeNetwork(d), analyzeProtectionCoordination(d));
    const q1 = badges.find((b) => b.nodeId === "q1")!;
    expect(q1.lines[0]).toMatch(/^Ik \d/);
    expect(q1.lines).toContain("Icu 3 kA");
    expect(q1.level).toBe("error");
    expect(badges.find((b) => b.nodeId === "m1")?.lines[0]).toBe("Ik pendente");
    // Transformador/contator não recebem etiqueta (só pontos de proteção, barramento e cargas).
    expect(badges.some((b) => b.nodeId === "k1" || b.nodeId === "tr")).toBe(false);
  });
});
