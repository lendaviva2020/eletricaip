// Fechamento do unifilar (21ª rodada): coordenação de proteções, tabela de
// cabos, rótulos sem designação antiga, posicionamento sem sobreposição e
// Ladder sem programa de demonstração injetado.
import { describe, expect, it } from "vitest";
import type { DiagramDoc, DiagramEdge, DiagramNode } from "@/lib/diagram/schema";
import {
  analyzeProtectionCoordination,
  typicalTransformerUk,
} from "@/lib/diagram/connection/protection-coordination";
import { sizeDiagramCables } from "@/lib/diagram/connection/cable-sizing";
import { placeAddedNodes } from "@/lib/diagram/connection/auto-layout-router";
import { nodeDisplayLabel, stripStaleDesignation } from "@/lib/diagram/render/node-label";
import { normalizeDeviceTags } from "@/lib/diagram/connection/renumber";
import { runDiagramDiagnostics } from "@/lib/diagram/multifilar";
import {
  createReferenceIndustrialProject,
  isUntouchedReferenceExample,
} from "@/components/canvases/ladder/rung-grid";
import { ptBR } from "@/lib/i18n/catalogs/pt-BR";

const n = (
  id: string,
  params: DiagramNode["params"],
  y: number,
  x = 400,
  label = id,
): DiagramNode => ({ id, sheet: "unifilar", position: { x, y }, rotation: 0, label, params });
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
const doc = (nodes: DiagramNode[], edges: DiagramEdge[]): DiagramDoc => ({
  version: 1,
  id: "d",
  metadata: { title: "t", norms: ["NBR 5410"] },
  sheets: ["unifilar"],
  nodes: Object.fromEntries(nodes.map((x) => [x.id, x])),
  edges: Object.fromEntries(edges.map((x) => [x.id, x])),
});

/** TR → Q0 → W1 → Q1 → K1 → F1 → M1 (motor 15 kW / 380 V ≈ 29 A). */
function branch(
  over: {
    q0?: number;
    q1?: number;
    k1?: number;
    f1?: number;
    icc?: number;
    uk?: number;
  } = {},
): DiagramDoc {
  return doc(
    [
      n(
        "tr",
        {
          kind: "transformer",
          kVA: 150,
          primary_V: 13800,
          secondary_V: 380,
          vector: "Dyn11",
          ...(over.uk ? { uk_pct: over.uk } : {}),
          tag: "T1",
        },
        0,
      ),
      n(
        "q0",
        {
          kind: "breaker",
          in_A: over.q0 ?? 125,
          curve: "C",
          poles: 3,
          tag: "Q0",
          ...(over.icc ? { icc_kA: over.icc } : {}),
        },
        100,
      ),
      n("w1", { kind: "busbar", current_A: 160, voltage_V: 380, tag: "W1" }, 200),
      n(
        "q1",
        {
          kind: "breaker",
          in_A: over.q1 ?? 40,
          curve: "D",
          poles: 3,
          tag: "Q1",
          ...(over.icc ? { icc_kA: over.icc } : {}),
        },
        300,
      ),
      n("k1", { kind: "contactor", in_A: over.k1 ?? 32, coil_V: 24, tag: "K1" }, 400),
      n("f1", { kind: "thermal_relay", in_A: over.f1 ?? 30, trip_class: "10A", tag: "F1" }, 500),
      n("m1", { kind: "motor", power_kW: 15, voltage_V: 380, startMethod: "DOL", tag: "M1" }, 600),
    ],
    [
      e("e1", "tr", "q0"),
      e("e2", "q0", "w1"),
      e("e3", "w1", "q1"),
      e("e4", "q1", "k1"),
      e("e5", "k1", "f1"),
      e("e6", "f1", "m1"),
    ],
  );
}
const codes = (d: DiagramDoc) => analyzeProtectionCoordination(d).findings.map((f) => f.code);

describe("coordenação de proteções", () => {
  it("ramal bem coordenado não gera erro de proteção", () => {
    const c = codes(branch({ icc: 25 }));
    expect(c).not.toContain("PROTECTION_UNDERSIZED");
    expect(c).not.toContain("NO_SELECTIVITY");
    expect(c).not.toContain("CONTACTOR_UNDERSIZED");
    expect(c).not.toContain("THERMAL_SETTING_LOW");
    expect(c).not.toContain("THERMAL_SETTING_HIGH");
    expect(c).not.toContain("BREAKING_CAPACITY_LOW");
  });
  it("disjuntor menor que a carga", () => {
    expect(codes(branch({ q1: 16 }))).toContain("PROTECTION_UNDERSIZED");
  });
  it("relé térmico fora de 0,95–1,25 × In do motor", () => {
    expect(codes(branch({ f1: 20 }))).toContain("THERMAL_SETTING_LOW");
    expect(codes(branch({ f1: 50 }))).toContain("THERMAL_SETTING_HIGH");
  });
  it("contator abaixo do motor em AC-3", () => {
    expect(codes(branch({ k1: 12 }))).toContain("CONTACTOR_UNDERSIZED");
  });
  it("disjuntor de ramal igual/maior que o geral = sem seletividade", () => {
    expect(codes(branch({ q0: 40, q1: 40 }))).toContain("NO_SELECTIVITY");
  });
  it("Icu abaixo do curto presumido e Icu ausente", () => {
    const low = analyzeProtectionCoordination(branch({ icc: 1 }));
    expect(low.findings.some((f) => f.code === "BREAKING_CAPACITY_LOW")).toBe(true);
    expect(low.prospectiveIk_kA).toBeGreaterThan(1);
    const missing = analyzeProtectionCoordination(branch());
    const f = missing.findings.find((x) => x.code === "BREAKING_CAPACITY_MISSING");
    expect(f?.assumptions?.[0]).toMatch(/típico/);
  });
  it("uk de placa substitui o típico e reduz o curto quando maior", () => {
    expect(typicalTransformerUk(150)).toBe(3.5);
    const typ = analyzeProtectionCoordination(branch()).prospectiveIk_kA!;
    const plate = analyzeProtectionCoordination(branch({ uk: 6 })).prospectiveIk_kA!;
    expect(plate).toBeLessThan(typ);
  });
  it("achados viram alertas no diagnóstico", () => {
    const diags = runDiagramDiagnostics(branch({ q1: 16 }));
    expect(diags.some((d) => d.id.startsWith("coord_protection_undersized"))).toBe(true);
  });
});

describe("tabela de cabos", () => {
  it("todo trecho aparece, com status coerente", () => {
    const r = sizeDiagramCables(branch());
    expect(r.rows.length).toBe(6);
    const motor = r.rows.find((x) => x.edgeId === "e6")!;
    expect(motor.field).toBe(true);
    expect(motor.Ib_A).toBeGreaterThan(20);
    // sem comprimento medido → pendência, nunca valor inventado
    expect(motor.length_m).toBeUndefined();
    expect(["sem_comprimento", "sem_secao"]).toContain(motor.status);
  });
  it("com seção e comprimento calcula a queda e acusa excesso", () => {
    const d = branch();
    d.edges.e6 = { ...d.edges.e6, cable: { section_mm2: 2.5, length_m: 300, insulation: "PVC" } };
    const row = sizeDiagramCables(d).rows.find((x) => x.edgeId === "e6")!;
    expect(row.drop_pct).toBeGreaterThan(4);
    expect(["queda_excedida", "subdimensionada"]).toContain(row.status);
  });
});

describe("rótulos sem designação antiga", () => {
  it("remove a designação anterior do rótulo", () => {
    expect(stripStaleDesignation("KM-01 32A", "K1")).toBe("32A");
    expect(stripStaleDesignation("K1 32A", "K1")).toBe("K1 32A");
    expect(stripStaleDesignation("Bomba de recalque", "M1")).toBe("Bomba de recalque");
    expect(
      nodeDisplayLabel({
        label: "KM-01 32A",
        params: { kind: "contactor", in_A: 32, coil_V: 24, tag: "K1" },
      }),
    ).toBe("K1 32A");
  });
  it("renumeração limpa o rótulo", () => {
    const d = doc(
      [n("a", { kind: "contactor", in_A: 32, coil_V: 24, tag: "KM-01" }, 0, 400, "KM-01 32A")],
      [],
    );
    const out = normalizeDeviceTags(d).doc.nodes.a;
    expect(out.params.tag).toBe("K1");
    expect(out.label).toBe("32A");
  });
});

describe("posicionamento de nós novos sem sobreposição", () => {
  it("não cai em cima de equipamento vizinho próximo (não só idêntico)", () => {
    const d = doc(
      [
        n("q1", { kind: "breaker", in_A: 40, curve: "C", poles: 3 }, 100, 400),
        n("k1", { kind: "contactor", in_A: 32, coil_V: 24 }, 250, 410),
        n("new", { kind: "thermal_relay", in_A: 30, trip_class: "10A" }, 0, 0),
      ],
      [e("x", "q1", "new")],
    );
    const p = placeAddedNodes(d, new Set(["new"])).nodes.new.position;
    for (const o of [d.nodes.q1.position, d.nodes.k1.position]) {
      const overlap = Math.abs(o.x - p.x) < 120 && Math.abs(o.y - p.y) < 100;
      expect(overlap).toBe(false);
    }
  });
});

describe("Ladder sem demonstração injetada", () => {
  it("reconhece o exemplo intocado e preserva o editado", () => {
    const ex = createReferenceIndustrialProject();
    expect(isUntouchedReferenceExample(ex)).toBe(true);
    expect(isUntouchedReferenceExample([])).toBe(false);
    const edited = ex.map((r, i) => (i === 0 ? { ...r, label: `${r.label} (meu)` } : r));
    expect(isUntouchedReferenceExample(edited)).toBe(false);
  });
});

describe("painel da IA sem dados fictícios", () => {
  it("catálogo não traz mais a sugestão fixa M-03 nem contadores inventados", () => {
    const text = JSON.stringify(ptBR.rightPanel);
    expect(text).not.toMatch(/M-03/);
    expect(text).not.toMatch(/142/);
  });
});
