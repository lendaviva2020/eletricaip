import { describe, it, expect } from "vitest";
import { solveConductorSection } from "@/lib/diagnostics/conductor-solver";
import type { Diagnostic } from "@/lib/diagnostics/contract";
import { createEmptyDoc, makeNode, makeEdge } from "@/lib/diagram/model";
import type { DiagramDoc } from "@/lib/diagram/schema";

describe("Fase 4: Solver Determinístico de Seção de Condutor", () => {
  function buildCircuitDoc(cableSection = 2.5, cableLength = 60, current = 25): DiagramDoc {
    const qgbt = makeNode({
      id: "qgbt",
      sheet: "unifilar",
      position: { x: 100, y: 100 },
      label: "QGBT 380V",
      params: { kind: "busbar", voltage_V: 380, current_A: 100 },
    });
    const motor = makeNode({
      id: "motor-1",
      sheet: "unifilar",
      position: { x: 100, y: 300 },
      label: "M1",
      params: {
        kind: "motor",
        power_kW: 11,
        voltage_V: 380,
        current_A: current,
        startMethod: "DOL",
      },
    });
    const edge = makeEdge({
      id: "edge-m1",
      sheet: "unifilar",
      source: "qgbt",
      target: "motor-1",
      kind: "power",
      cable: { section_mm2: cableSection, length_m: cableLength, insulation: "PVC" },
    });

    const doc = createEmptyDoc({
      sheets: ["unifilar"],
      nodes: { [qgbt.id]: qgbt, [motor.id]: motor },
      edges: { [edge.id]: edge },
    });
    (doc.metadata as any).supplyOrigin = "public_grid";
    return doc;
  }

  function buildDiagnostic(
    severity: "ok" | "warning" | "error",
    measuredPct: number,
    assumptions: string[] = [],
    contextOverride: Record<string, string | number | boolean> = {},
  ): Diagnostic {
    return {
      id: "NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP:edge-m1",
      ruleId: "NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP",
      severity,
      elementIds: ["edge-m1", "motor-1"],
      measured: { value: measuredPct, unit: "%" },
      limit: { value: 4.0, unit: "%" },
      marginRatio: measuredPct / 4.0,
      assumptions,
      reference: {
        standard: "ABNT NBR 5410:2004",
        clause: "Tabela 33 / §6.2.7",
        reviewStatus: "pending-human-review",
      },
      context: {
        conductorId: "edge-m1",
        length_m: 60,
        section_mm2: 2.5,
        current_A: 25,
        drop_pct: measuredPct,
        limit_pct: 4.0,
        ...contextOverride,
      },
    };
  }

  it("não gera proposta quando o diagnóstico já estiver em conformidade ('ok')", () => {
    const doc = buildCircuitDoc(10, 20, 15);
    const diag = buildDiagnostic("ok", 1.5);

    const proposal = solveConductorSection(doc, diag);
    expect(proposal).toBeNull();
  });

  it("escolhe a menor seção comercial que atende aos critérios regulamentares", () => {
    // 25 A em 60 m com 2.5 mm² trifásico -> queda de ~7.5% (erro)
    const doc = buildCircuitDoc(2.5, 60, 25);
    const diag = buildDiagnostic("error", 7.5);

    const proposal = solveConductorSection(doc, diag);

    expect(proposal).not.toBeNull();
    expect(proposal!.resolvesDiagnosticIds).toEqual([diag.id]);
    expect(proposal!.operations.length).toBe(1);

    const chosenSection = proposal!.operations[0].sectionMm2;
    // Deve ser maior que 2.5 mm² e a menor válida que atende (para 25 A em 60 m trifásico a 380V, 4 mm² atende com ~2,6% < 4,0%)
    expect(chosenSection).toBeGreaterThan(2.5);
    expect(chosenSection).toBe(4);

    // Métricas antes e depois
    const metric = proposal!.metrics.find((m) => m.metric === "voltage_drop_pct");
    expect(metric).toBeDefined();
    expect(metric!.before).toBe(7.5);
    expect(metric!.after).toBeLessThan(4.0);
    expect(metric!.marginRatioAfter).toBeLessThan(0.9);
  });

  it("bloqueia proposta quando o diagnóstico possui premissas não confirmadas", () => {
    const doc = buildCircuitDoc(2.5, 60, 25);
    const diag = buildDiagnostic("error", 7.5, ["Comprimento adotado como padrão (25 m)"]);

    const proposal = solveConductorSection(doc, diag);

    expect(proposal).not.toBeNull();
    expect(proposal!.isApplicable).toBe(false);
    expect(proposal!.blockReason).toContain("premissas não confirmadas");
    expect(proposal!.operations.length).toBe(0);
  });

  it("marca 'suportabilidade_curto_circuito' em unavailableChecks e bloqueia aplicação automática", () => {
    const doc = buildCircuitDoc(2.5, 60, 25);
    const diag = buildDiagnostic("error", 7.5);

    const proposal = solveConductorSection(doc, diag);

    expect(proposal).not.toBeNull();
    expect(proposal!.unavailableChecks.length).toBeGreaterThan(0);
    expect(
      proposal!.unavailableChecks.some((c) => c.includes("suportabilidade_curto_circuito")),
    ).toBe(true);
    // Como a verificação de curto é obrigatória por norma mas indisponível no motor, a aplicação automática é travada
    expect(proposal!.isApplicable).toBe(false);
    expect(proposal!.blockReason).toContain("indisponível no motor");
  });

  it("recusa propor alterações se o condutor estiver conectado a elemento de emergência", () => {
    const doc = buildCircuitDoc(2.5, 60, 25);
    // Transforma o nó destino em estop
    doc.nodes["motor-1"].params = { kind: "estop", category: "1" } as any;
    const diag = buildDiagnostic("error", 7.5);

    const proposal = solveConductorSection(doc, diag);

    expect(proposal).not.toBeNull();
    expect(proposal!.isApplicable).toBe(false);
    expect(proposal!.blockReason).toContain("dispositivo de segurança");
    expect(proposal!.operations.length).toBe(0);
  });

  it("retorna proposta marcada como inviável quando nenhuma seção até 300 mm² atende", () => {
    // Caso inviável extremo: 400 A em 800 m
    const doc = buildCircuitDoc(4, 800, 400);
    const diag = buildDiagnostic("error", 28.0, [], {
      current_A: 400,
      length_m: 800,
      section_mm2: 4,
    });

    const proposal = solveConductorSection(doc, diag);

    expect(proposal).not.toBeNull();
    expect(proposal!.isApplicable).toBe(false);
    expect(proposal!.blockReason).toContain("Inviável: nenhuma seção comercial padronizada");
  });

  it("documenta efeitos colaterais conhecidos sobre eletrodutos e bornes", () => {
    const doc = buildCircuitDoc(2.5, 60, 25);
    const diag = buildDiagnostic("error", 7.5);

    const proposal = solveConductorSection(doc, diag);

    expect(proposal).not.toBeNull();
    expect(proposal!.sideEffects.length).toBeGreaterThanOrEqual(2);
    expect(proposal!.sideEffects.some((s) => s.includes("taxa de ocupação dos eletrodutos"))).toBe(
      true,
    );
    expect(proposal!.sideEffects.some((s) => s.includes("bornes de conexão"))).toBe(true);
  });
});
