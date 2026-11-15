// Auditoria Fase 2 — F2.4 (queda acumulada desde a origem) e F2.7 (diagnóstico do
// canvas sobre o motor único, sem arredondar antes de comparar).
import { describe, it, expect } from "vitest";
import { createEmptyDoc, makeEdge, makeNode } from "@/lib/diagram/model";
import { calculateVoltageDropNbr5410, runDiagramDiagnostics } from "@/lib/diagram/multifilar";
import { calcVoltageDrop } from "@/lib/electrical-calc";
import { estimateCircuitCurrent } from "@/lib/diagram/circuit-current";
import type { DiagramDoc } from "@/lib/diagram/schema";

function chainDoc(opts: {
  feederLength: number;
  terminalLength: number;
  source: "transformer" | "busbar";
}) {
  const src = makeNode({
    id: "SRC",
    sheet: "unifilar",
    position: { x: 0, y: 0 },
    label: "SRC",
    params:
      opts.source === "transformer"
        ? { kind: "transformer", kVA: 300, primary_V: 13800, secondary_V: 380, vector: "Dyn11" }
        : { kind: "busbar", current_A: 400, voltage_V: 380 },
  } as never);
  const qd = makeNode({
    id: "QD",
    sheet: "unifilar",
    position: { x: 0, y: 100 },
    label: "QD",
    params: { kind: "busbar", current_A: 200, voltage_V: 380 },
  } as never);
  const m = makeNode({
    id: "M",
    sheet: "unifilar",
    position: { x: 0, y: 200 },
    label: "M",
    params: { kind: "motor", power_kW: 30, voltage_V: 380, current_A: 55, startMethod: "DOL" },
  } as never);
  const feeder = makeEdge({
    id: "feeder",
    sheet: "unifilar",
    source: "SRC",
    target: "QD",
    kind: "power",
    cable: { section_mm2: 25, length_m: opts.feederLength, insulation: "PVC" },
  } as never);
  const terminal = makeEdge({
    id: "terminal",
    sheet: "unifilar",
    source: "QD",
    target: "M",
    kind: "power",
    cable: { section_mm2: 16, length_m: opts.terminalLength, insulation: "PVC" },
  } as never);
  return createEmptyDoc({
    sheets: ["unifilar"],
    nodes: { SRC: src, QD: qd, M: m },
    edges: { feeder, terminal },
  } as never) as DiagramDoc;
}

describe("F2.4 — queda de tensão acumulada desde a origem", () => {
  it("acumulado do trecho terminal = queda do alimentador (corrente a jusante) + queda do terminal", () => {
    const doc = chainDoc({ feederLength: 80, terminalLength: 60, source: "transformer" });
    const r = calculateVoltageDropNbr5410(doc);
    const terminal = r.find((x) => x.edgeId === "terminal")!;
    const feeder = r.find((x) => x.edgeId === "feeder")!;
    expect(terminal.is_terminal_circuit).toBe(true);
    expect(feeder.is_terminal_circuit).toBe(false);
    expect(terminal.cumulative_drop_pct).toBeCloseTo(feeder.drop_pct + terminal.drop_pct, 1);
    // Origem com transformador próprio: 7%; terminal: 4%.
    expect(terminal.origin_limit_pct).toBe(7);
    expect(terminal.max_allowed_pct).toBe(4);
  });

  it("sem fonte própria no diagrama adota fornecimento BT (5%) e registra a premissa", () => {
    const doc = chainDoc({ feederLength: 80, terminalLength: 60, source: "busbar" });
    const terminal = calculateVoltageDropNbr5410(doc).find((x) => x.edgeId === "terminal")!;
    expect(terminal.origin_limit_pct).toBe(5);
    expect(terminal.assumptions?.some((a) => a.includes("fornecimento em BT"))).toBe(true);
  });

  it("terminal dentro de 4% mas acumulado acima do limite da origem => não conforme", () => {
    // Alimentador longo consome a maior parte do limite de 5% (BT).
    const doc = chainDoc({ feederLength: 260, terminalLength: 40, source: "busbar" });
    const terminal = calculateVoltageDropNbr5410(doc).find((x) => x.edgeId === "terminal")!;
    expect(terminal.drop_pct).toBeLessThan(4);
    expect(terminal.cumulative_drop_pct).toBeGreaterThan(5);
    expect(terminal.compliant).toBe(false);
  });

  it("ligação a montante sem comprimento declarado NÃO soma 25 m fictícios ao acumulado", () => {
    const doc = chainDoc({ feederLength: 80, terminalLength: 60, source: "transformer" });
    delete (doc.edges.feeder as { cable?: unknown }).cable;
    const terminal = calculateVoltageDropNbr5410(doc).find((x) => x.edgeId === "terminal")!;
    expect(terminal.cumulative_drop_pct).toBeCloseTo(terminal.drop_pct, 2);
    expect(terminal.requires_confirmation).toBe(true);
  });
});

describe("F2.7 — diagnóstico do canvas usa o motor único", () => {
  it("o trecho terminal dá o mesmo resultado que calcVoltageDrop com a mesma corrente", () => {
    const doc = chainDoc({ feederLength: 10, terminalLength: 60, source: "transformer" });
    const terminal = calculateVoltageDropNbr5410(doc).find((x) => x.edgeId === "terminal")!;
    const ref = calcVoltageDrop(55, 60, 16, 380, 0.86, { phases: 3, insulation: "PVC" });
    expect(terminal.drop_pct).toBeCloseTo(ref.deltaV_pct, 2);
  });

  it("carga trifásica usa I = P/(√3·U·fp), não a fórmula monofásica", () => {
    const load = makeNode({
      id: "L",
      sheet: "unifilar",
      position: { x: 0, y: 0 },
      label: "L",
      params: { kind: "load", power_W: 20000, voltage_V: 380, fp: 0.9 },
    } as never);
    const est = estimateCircuitCurrent([load], true);
    expect(est.current_A).toBeCloseTo(20000 / (Math.sqrt(3) * 380 * 0.9), 6);
  });

  it("resultado dependente de cabo não declarado não é apresentado como OK", () => {
    const doc = chainDoc({ feederLength: 10, terminalLength: 5, source: "transformer" });
    delete (doc.edges.terminal as { cable?: unknown }).cable;
    (doc.edges.terminal as { kind: string }).kind = "power";
    const diags = runDiagramDiagnostics(doc);
    expect(diags.find((d) => d.id === "vd_ok_terminal")).toBeUndefined();
    expect(diags.find((d) => d.id === "vd_warn_terminal")?.type).toBe("AVISO");
  });
});
