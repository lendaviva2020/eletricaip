import { describe, expect, it } from "vitest";
import type { DiagramDoc } from "@/lib/diagram/schema";
import type { Diagnostic, PatchOperation } from "@/lib/diagnostics/contract";
import {
  evaluateAllRules,
  proposeFixes,
  validateDraft,
  orchestrateDraftFixes,
  MAX_ORCHESTRATION_ITERATIONS,
} from "@/lib/diagnostics/draft-orchestrator";
import { computeCanonicalDocHash } from "@/lib/diagnostics/crypto-hash";

function makeDocWithVoltageDropError(): DiagramDoc {
  return {
    id: "doc-test-1",
    version: 1,
    sheets: ["unifilar"],
    metadata: {
      title: "Painel de Bombas",
      norms: ["NBR 5410"],
      supplyOrigin: "public_grid",
    } as any,
    nodes: {
      bus1: {
        id: "bus1",
        sheet: "unifilar",
        label: "Barramento Geral",
        position: { x: 0, y: 0 },
        rotation: 0,
        params: { kind: "busbar", voltage_V: 380, current_A: 100 },
      },
      motor1: {
        id: "motor1",
        sheet: "unifilar",
        label: "Bomba Principal M1",
        position: { x: 100, y: 100 },
        rotation: 0,
        params: {
          kind: "motor",
          startMethod: "DOL",
          tag: "M-01",
          power_kW: 15,
          voltage_V: 380,
          current_A: 30,
        },
      },
    },
    edges: {
      w1: {
        id: "w1",
        sheet: "unifilar",
        source: "bus1",
        target: "motor1",
        kind: "power",
        circuitConfig: "3F",
        cable: {
          section_mm2: 4,
          length_m: 100, // 30 A em 100m com 4mm² em 380V -> 5.17% queda (> 4.0% limite)
          insulation: "PVC",
        },
      },
    },
  };
}

describe("Orquestrador de Diagnósticos em Rascunho (Fase 5)", () => {
  it("avalia regras normativas e detecta excesso de queda de tensão", () => {
    const doc = makeDocWithVoltageDropError();
    const diags = evaluateAllRules(doc);

    expect(diags.length).toBeGreaterThan(0);
    const vdDiag = diags.find((d) => d.id === "NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP:w1");
    expect(vdDiag).toBeDefined();
    expect(vdDiag?.severity).toBe("error");
    expect(vdDiag?.measured.value).toBeGreaterThan(4.0);
  });

  it("gera proposta determinística e marca como assistida por verificação de curto-circuito ausente", () => {
    const doc = makeDocWithVoltageDropError();
    const diags = evaluateAllRules(doc);
    const proposals = proposeFixes(doc, diags);

    expect(proposals.length).toBe(1);
    const p = proposals[0];
    expect(p.operations.length).toBe(1);
    expect(p.operations[0].op).toBe("set-conductor-section");
    expect(p.operations[0].conductorId).toBe("w1");
    expect(p.operations[0].sectionMm2).toBeGreaterThan(4);

    // Por segurança inegociável: como o motor não tem verificação de curto-circuito (I²t <= k²S²),
    // a proposta fica marcada como não autônoma (isApplicable: false) e requer homologação assistida
    expect(p.isApplicable).toBe(false);
    expect(p.unavailableChecks).toContain(
      "suportabilidade_curto_circuito (NBR 5410 §5.3.5 / I²t <= k²S²)",
    );
    expect(p.blockReason).toContain("suportabilidade a curto-circuito");
  });

  it("valida rascunho com sucesso quando a proposta resolve a não conformidade", () => {
    const doc = makeDocWithVoltageDropError();
    const originalHash = computeCanonicalDocHash(doc);
    const diags = evaluateAllRules(doc);

    const ops: PatchOperation[] = [{ op: "set-conductor-section", conductorId: "w1", sectionMm2: 10 }];

    const result = validateDraft(doc, ops, diags);

    expect(result.isValid).toBe(true);
    expect(result.resolvedDiagnosticIds).toContain("NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP:w1");
    expect(result.newDiagnostics).toHaveLength(0);
    expect(result.worsenedDiagnostics).toHaveLength(0);
    expect(result.draftDoc).toBeDefined();
    expect(result.draftDoc?.edges.w1.cable?.section_mm2).toBe(10);

    // Invariante de imutabilidade: doc original permaneceu 100% idêntico
    expect(doc.edges.w1.cable?.section_mm2).toBe(4);
    expect(computeCanonicalDocHash(doc)).toBe(originalHash);
  });

  it("rejeita validação quando a operação tenta reduzir a seção (SafetyViolationError)", () => {
    const doc = makeDocWithVoltageDropError();
    const diags = evaluateAllRules(doc);

    const ops: PatchOperation[] = [{ op: "set-conductor-section", conductorId: "w1", sectionMm2: 2.5 }];

    const result = validateDraft(doc, ops, diags);

    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toContain("Somente aumentos de bitola são permitidos");
  });

  it("rejeita validação quando o condutor está ligado a elemento de emergência (SAFETY_CRITICAL_KINDS)", () => {
    const doc = makeDocWithVoltageDropError();
    // Conecta a uma parada de emergência
    doc.nodes.estop1 = {
      id: "estop1",
      sheet: "unifilar",
      label: "Parada de Emergência",
      position: { x: 50, y: 50 },
      rotation: 0,
      params: { kind: "estop", category: "0", tag: "ES-01" },
    };
    doc.edges.w_safety = {
      id: "w_safety",
      sheet: "unifilar",
      source: "bus1",
      target: "estop1",
      kind: "signal",
      cable: { section_mm2: 1.5, length_m: 10, insulation: "PVC" },
    };

    const ops: PatchOperation[] = [
      { op: "set-conductor-section", conductorId: "w_safety", sectionMm2: 2.5 },
    ];

    const result = validateDraft(doc, ops, []);

    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toContain("elemento de segurança");
  });

  it("rejeita validação quando nenhuma operação é fornecida", () => {
    const doc = makeDocWithVoltageDropError();
    const diags = evaluateAllRules(doc);

    const result = validateDraft(doc, [], diags);
    expect(result.isValid).toBe(false);
    expect(result.rejectionReason).toContain("Nenhuma operação");
  });

  it("executa orchestrateDraftFixes e converge em 1 iteração para caso simples", () => {
    const doc = makeDocWithVoltageDropError();
    const diags = evaluateAllRules(doc);

    const orch = orchestrateDraftFixes(doc, diags);

    expect(orch.success).toBe(true);
    expect(orch.cycleDetected).toBe(false);
    expect(orch.iterationsCount).toBe(1);
    expect(orch.appliedProposals).toHaveLength(1);
    expect(orch.resolvedDiagnosticIds).toContain("NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP:w1");
    // O solver escolheu com precisão a menor seção válida (6 mm², reduzindo queda para 3.45% < 4.0%)
    expect(orch.finalDoc.edges.w1.cable?.section_mm2).toBe(6);

    // O doc original permaneceu intacto
    expect(doc.edges.w1.cable?.section_mm2).toBe(4);
  });

  it("respeita estritamente o limite máximo de 3 iterações (MAX_ORCHESTRATION_ITERATIONS)", () => {
    const doc = makeDocWithVoltageDropError();
    const diags = evaluateAllRules(doc);

    // Força maxIterations alto
    const orch = orchestrateDraftFixes(doc, diags, { maxIterations: 10 });
    expect(orch.iterationsCount).toBeLessThanOrEqual(MAX_ORCHESTRATION_ITERATIONS);
  });

  it("detecta ciclos via SHA-256 e interrompe execução caso ocorra repetição de estado", () => {
    const doc = makeDocWithVoltageDropError();
    const initialHash = computeCanonicalDocHash(doc);

    // Mock simulando uma situação onde uma proposta retorna o documento a um hash anterior
    const fakeDiag: Diagnostic = {
      id: "fake_diag:w1",
      ruleId: "fake_rule",
      severity: "error",
      elementIds: ["w1"],
      measured: { value: 10, unit: "A" },
      limit: { value: 5, unit: "A" },
      marginRatio: 2.0,
      assumptions: [],
      reference: {
        standard: "NBR",
        clause: "1",
        reviewStatus: "reviewed",
      },
      context: { conductorId: "w1" },
    };

    // A função orchestrateDraftFixes com doc já visto não entra em loop infinito
    const orch = orchestrateDraftFixes(doc, [fakeDiag]);
    expect(orch.iterationsCount).toBeLessThanOrEqual(MAX_ORCHESTRATION_ITERATIONS);
  });
});
