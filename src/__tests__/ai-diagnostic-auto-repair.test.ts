// @vitest-environment jsdom
// AI Diagnostic Auto-Repair Unit & Integration Tests
// Standards: ABNT NBR 5410, NR-10, IEC 60947, IEC 61131-3, ISA-18.2
// Verifies context serialization, 7-step remediation framework prompt generation, and store integration.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DiagnosticContextSchema,
  useAiDiagnosticRepairStore,
  buildDiagnosticContextFromMultifilar,
  buildDiagnosticContextFromLadder,
  buildDiagnosticContextFromNormFinding,
  buildDiagnosticContextFromImportIssue,
  formatDiagnosticFor7StepRemediation,
  type DiagnosticContext,
} from "@/lib/diagnostics/ai-repair-context";

describe("ELÉTRICAI — AI Diagnostic Auto-Repair Engine & 7-Step Remediation", () => {
  beforeEach(() => {
    useAiDiagnosticRepairStore.getState().clearRepair();
    useAiDiagnosticRepairStore.getState().setOpen(false);
  });

  it("1. Validates structured DiagnosticContext conforming strictly to Zod schema", () => {
    const rawContext: DiagnosticContext = {
      project_id: "123e4567-e89b-12d3-a456-426614174000",
      module: "unifilar",
      diagnostic_id: "diag_overload_01",
      error_code: "ERR_UNIFILAR_TOPOLOGY",
      severity: "critical",
      error_message: "Condutor sem proteção contra sobrecorrente",
      technical_details: "Corrente de projeto IB=45A excede capacidade do cabo Iz=36A",
      affected_components: ["cable_01", "breaker_qf1"],
      affected_connections: ["e_ai_1"],
      affected_variables: [],
      source_context: { ib_A: 45, iz_A: 36 },
      project_revision: 3,
      runtime_state: "design",
      related_diagnostics: [],
    };

    const parsed = DiagnosticContextSchema.safeParse(rawContext);
    expect(parsed.success).toBe(true);
  });

  it("2. Builds DiagnosticContext from Unifilar/Multifilar DiagnosticAlert", () => {
    const alert = {
      id: "alert_nbr_01",
      type: "ERRO" as const,
      message: "Queda de tensão no trecho QGBT->M1 excede o limite normativo de 4% (obtido 5.8%)",
      nodeId: "M1",
      edgeId: "e_qgbt_m1",
      assumptions: ["Comprimento estimado 85m", "Fator de potência 0.85"],
    };

    const ctx = buildDiagnosticContextFromMultifilar(alert, "proj_test_123", 2);
    expect(ctx.project_id).toBe("proj_test_123");
    expect(ctx.module).toBe("unifilar");
    expect(ctx.severity).toBe("critical");
    expect(ctx.error_message).toContain("Queda de tensão");
    expect(ctx.affected_components).toContain("M1");
    expect(ctx.affected_connections).toContain("e_qgbt_m1");
    expect(ctx.technical_details).toContain("Premissas técnicas: Comprimento estimado 85m");
  });

  it("3. Builds DiagnosticContext from LadderIssue (IEC 61131-3 syntax & variables)", () => {
    const ladderIssue = {
      rungId: "rung_03",
      code: "UNDEFINED_VARIABLE",
      level: "error" as const,
      message: "Operando '%Q0.5' não está registrado na tabela de variáveis ativas",
      elementId: "%Q0.5",
      fixHint: "Registre a saída na tabela de tags ou selecione um endereço mapeado",
    };

    const ctx = buildDiagnosticContextFromLadder(ladderIssue, "proj_ladder_123", 1);
    expect(ctx.module).toBe("ladder");
    expect(ctx.error_code).toBe("UNDEFINED_VARIABLE");
    expect(ctx.severity).toBe("critical");
    expect(ctx.affected_components).toContain("rung_03");
    expect(ctx.affected_variables).toContain("%Q0.5");
    expect(ctx.technical_details).toContain("Registre a saída");
  });

  it("4. Builds DiagnosticContext from NormFinding and Importer issue", () => {
    const normFinding = {
      id: "norm_finding_01",
      norm: "NBR 5410" as const,
      severity: "error" as const,
      nodeId: "TOMADA_01",
      title: "Ausência de DR em Circuito de Tomadas",
      detail: "Circuitos de tomadas de uso geral exigem proteção diferencial-residual <= 30mA",
      fixHint: "Inserir dispositivo DR de 30mA a montante",
    };

    const normCtx = buildDiagnosticContextFromNormFinding(normFinding, "proj_norm");
    expect(normCtx.module).toBe("validation");
    expect(normCtx.error_code).toBe("NORM_NBR_5410");
    expect(normCtx.affected_components).toContain("TOMADA_01");

    const importIssue = {
      id: "imp_issue_01",
      severity: "critical",
      category: "schema",
      message: "Estrutura XML PLCopen com namespace inválido",
      entityId: "POU_Main",
    };
    const impCtx = buildDiagnosticContextFromImportIssue(importIssue, "proj_import");
    expect(impCtx.module).toBe("importer");
    expect(impCtx.severity).toBe("critical");
    expect(impCtx.affected_components).toContain("POU_Main");
  });

  it("5. Formats structured prompt for 7-step remediation framework in Portuguese and English", () => {
    const ctx: DiagnosticContext = {
      project_id: "proj_flow_7step",
      module: "unifilar",
      diagnostic_id: "d1",
      error_code: "ERR_NO_UPSTREAM_PROTECTION",
      severity: "critical",
      error_message: "Motor M1 sem dispositivo de manobra ou proteção de retaguarda",
      technical_details: "Potência 15kW, Corrente nominal In=28.5A",
      affected_components: ["M1"],
      affected_connections: [],
      affected_variables: [],
      project_revision: 1,
    };

    const promptPt = formatDiagnosticFor7StepRemediation(ctx, "pt-BR");
    expect(promptPt).toContain("MANDATO DE CORREÇÃO AUTOMÁTICA COM IA - 7 PASSOS");
    expect(promptPt).toContain("1. INTERPRETAÇÃO DO ERRO");
    expect(promptPt).toContain("2. INVESTIGAÇÃO DA CAUSA RAIZ");
    expect(promptPt).toContain("3. DIAGNÓSTICO TÉCNICO");
    expect(promptPt).toContain("4. PROPOSTA DE CORREÇÃO");
    expect(promptPt).toContain("5. APLICAÇÃO ASSISTIDA");
    expect(promptPt).toContain("6. REVALIDAÇÃO PÓS-CORREÇÃO");
    expect(promptPt).toContain("7. RELATÓRIO DO RESULTADO");
    expect(promptPt).toContain("ERR_NO_UPSTREAM_PROTECTION");
    expect(promptPt).toContain("M1");

    const promptEn = formatDiagnosticFor7StepRemediation(ctx, "en");
    expect(promptEn).toContain("AI AUTOMATED REMEDIATION MANDATE - 7 STEPS");
    expect(promptEn).toContain("1. ERROR INTERPRETATION");
    expect(promptEn).toContain("7. RESULT REPORT");
  });

  it("6. Triggers useAiDiagnosticRepairStore and dispatches CustomEvent 'eletricai-ai-repair'", () => {
    const listener = vi.fn();
    window.addEventListener("eletricai-ai-repair", listener);

    const ctx: DiagnosticContext = {
      project_id: "proj_event_test",
      module: "fbd",
      diagnostic_id: "diag_fbd_cycle",
      error_code: "ERR_LOGIC_CYCLE",
      severity: "critical",
      error_message: "Ciclo combinacional não quebrado detectado entre blocos B1 e B2",
      affected_components: ["B1", "B2"],
      affected_connections: [],
      affected_variables: [],
    };

    useAiDiagnosticRepairStore.getState().openRepairWithContext(ctx);

    const state = useAiDiagnosticRepairStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.pendingContext?.error_code).toBe("ERR_LOGIC_CYCLE");
    expect(state.batchContexts).toHaveLength(1);

    expect(listener).toHaveBeenCalledTimes(1);
    const eventDetail = listener.mock.calls[0][0].detail;
    expect(eventDetail.context.error_code).toBe("ERR_LOGIC_CYCLE");

    window.removeEventListener("eletricai-ai-repair", listener);
  });

  it("7. Handles batch diagnostic context aggregation (Corrigir todos relacionados)", () => {
    const batch: DiagnosticContext[] = [
      {
        project_id: "proj_batch",
        module: "unifilar",
        diagnostic_id: "d1",
        error_code: "ERR_MISSING_BREAKER",
        severity: "critical",
        error_message: "Falta disjuntor de ramal para M1",
        affected_components: ["M1"],
        affected_connections: [],
        affected_variables: [],
      },
      {
        project_id: "proj_batch",
        module: "unifilar",
        diagnostic_id: "d2",
        error_code: "ERR_MISSING_CONTACTOR",
        severity: "critical",
        error_message: "Falta contator KM1 para partida do motor M1",
        affected_components: ["M1"],
        affected_connections: [],
        affected_variables: [],
      },
    ];

    useAiDiagnosticRepairStore.getState().openRepairWithBatch(batch);
    const state = useAiDiagnosticRepairStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.batchContexts).toHaveLength(2);
    expect(state.pendingContext?.diagnostic_id).toBe("d1");

    const batchPrompt = formatDiagnosticFor7StepRemediation(batch, "pt-BR");
    expect(batchPrompt).toContain("[1] Módulo: UNIFILAR | Código: ERR_MISSING_BREAKER");
    expect(batchPrompt).toContain("[2] Módulo: UNIFILAR | Código: ERR_MISSING_CONTACTOR");
  });
});
