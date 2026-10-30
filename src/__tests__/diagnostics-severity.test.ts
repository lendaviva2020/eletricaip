import { describe, it, expect } from "vitest";
import { classifyMargin, type Diagnostic, type Severity } from "@/lib/diagnostics/types";
import { runDiagramDiagnostics, type DiagnosticAlert } from "@/lib/diagram/multifilar";
import { createEmptyDoc, makeNode, makeEdge } from "@/lib/diagram/model";
import type { DiagramDoc } from "@/lib/diagram/schema";

describe("Fase 1: Correção da Severidade de Diagnósticos e Classificação por Margem", () => {
  const WARN_AT_90 = 0.9;

  describe("1. Testes de Limite da Função classifyMargin", () => {
    it("razão exatamente 0,9 com warnAt=0,9 resulta em 'warning'", () => {
      expect(classifyMargin(0.9, WARN_AT_90)).toBe("warning");
    });

    it("razão exatamente 1,0 com warnAt=0,9 resulta em 'error'", () => {
      expect(classifyMargin(1.0, WARN_AT_90)).toBe("error");
    });

    it("razão acima de 1,0 (ex.: 1.25) resulta em 'error'", () => {
      expect(classifyMargin(1.25, WARN_AT_90)).toBe("error");
    });

    it("razão 0 com warnAt=0,9 resulta em 'ok'", () => {
      expect(classifyMargin(0, WARN_AT_90)).toBe("ok");
    });

    it("razão intermediária segura (ex.: 0.5) resulta em 'ok'", () => {
      expect(classifyMargin(0.5, WARN_AT_90)).toBe("ok");
    });

    it("razão NaN resulta em 'error' (dado inválido jamais passa em silêncio)", () => {
      expect(classifyMargin(Number.NaN, WARN_AT_90)).toBe("error");
    });

    it("razão Infinity resulta em 'error'", () => {
      expect(classifyMargin(Number.POSITIVE_INFINITY, WARN_AT_90)).toBe("error");
    });

    it("razão -Infinity resulta em 'error'", () => {
      expect(classifyMargin(Number.NEGATIVE_INFINITY, WARN_AT_90)).toBe("error");
    });

    it("razão negativa (ex.: -0.1) resulta em 'error'", () => {
      expect(classifyMargin(-0.1, WARN_AT_90)).toBe("error");
    });
  });

  describe("2. Teste de Regressão Obrigatório com os 4 Casos do Print do EletricAI", () => {
    // Casos do print original:
    // W1: 3,3% contra limite < 4,0% -> ratio = 3.3 / 4.0 = 0.825
    // W2: 1,1% contra limite < 4,0% -> ratio = 1.1 / 4.0 = 0.275
    // W3: 1,1% contra limite < 4,0% -> ratio = 1.1 / 4.0 = 0.275
    // W4: 0,8% contra limite < 4,0% -> ratio = 0.8 / 4.0 = 0.200

    it("todos os 4 circuitos do print devem ser classificados como 'ok' para warnAt=0.9", () => {
      const cases = [
        { name: "W1", measured: 3.3, limit: 4.0, expectedRatio: 0.825 },
        { name: "W2", measured: 1.1, limit: 4.0, expectedRatio: 0.275 },
        { name: "W3", measured: 1.1, limit: 4.0, expectedRatio: 0.275 },
        { name: "W4", measured: 0.8, limit: 4.0, expectedRatio: 0.2 },
      ];

      for (const c of cases) {
        const ratio = c.measured / c.limit;
        expect(ratio).toBeCloseTo(c.expectedRatio, 5);
        const severity = classifyMargin(ratio, WARN_AT_90);
        expect(severity).toBe("ok");
      }
    });

    it("caso no limiar exato de atenção (3,6% de 4,0% = 0.9) é 'warning'", () => {
      const ratio = 3.6 / 4.0;
      expect(classifyMargin(ratio, WARN_AT_90)).toBe("warning");
    });

    it("caso em violação direta (4,1% de 4,0% = 1.025) é 'error'", () => {
      const ratio = 4.1 / 4.0;
      expect(classifyMargin(ratio, WARN_AT_90)).toBe("error");
    });
  });

  describe("3. Contagem Acionável e Preservação de Severidade com Premissas", () => {
    it("dado assumido (assumptions não vazio) NÃO eleva a severidade de 'ok' para 'warning'", () => {
      const ratio = 1.1 / 4.0; // 0.275 -> ok
      const severity = classifyMargin(ratio, WARN_AT_90);
      expect(severity).toBe("ok");

      const diag: Diagnostic = {
        id: "vdrop:W2",
        ruleId: "NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP",
        severity,
        elementIds: ["edge-W2"],
        measured: { value: 1.1, unit: "%" },
        limit: { value: 4.0, unit: "%" },
        marginRatio: ratio,
        assumptions: [
          "Comprimento adotado como padrão (25 m)",
          "Seção adotada como padrão (4 mm²)",
        ],
        reference: {
          standard: "ABNT NBR 5410:2004",
          clause: "Tabela 33 / §6.2.7",
          reviewStatus: "pending-human-review",
        },
        context: { edgeId: "edge-W2", drop_pct: 1.1, max_allowed_pct: 4.0 },
      };

      // A premissa está documentada no diagnóstico mas a severidade permanece estritamente "ok"
      expect(diag.severity).toBe("ok");
      expect(diag.assumptions.length).toBe(2);
    });

    it("filtro de acionáveis contabiliza apenas 'warning' e 'error', ignorando itens 'ok'", () => {
      const alerts: DiagnosticAlert[] = [
        { id: "1", type: "OK", severity: "ok", message: "Circuito W1 conforme" },
        {
          id: "2",
          type: "OK",
          severity: "ok",
          message: "Circuito W2 conforme",
          assumptions: ["Padrão 25m"],
        },
        {
          id: "3",
          type: "AVISO",
          severity: "warning",
          message: "Circuito W3 em atenção (margem >= 90%)",
        },
        { id: "4", type: "ERRO", severity: "error", message: "Circuito W4 em sobretensão" },
        { id: "conn_ok", type: "OK", severity: "ok", message: "Conectividade validada" },
      ];

      const actionable = alerts.filter(
        (a) => a.type === "ERRO" || a.type === "AVISO" || (a.severity && a.severity !== "ok"),
      );

      expect(actionable.length).toBe(2);
      expect(actionable.map((a) => a.id)).toEqual(["3", "4"]);
    });

    it("runDiagramDiagnostics não emite alertas 'AVISO' para circuitos terminais conformes", () => {
      const n1 = makeNode({
        id: "source-1",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QGBT",
        params: { kind: "generator", voltage_V: 380, kVA: 150 },
      });
      const n2 = makeNode({
        id: "motor-1",
        sheet: "unifilar",
        position: { x: 100, y: 300 },
        label: "M1",
        params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
      });
      const e1 = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: "source-1",
        target: "motor-1",
        kind: "power",
        cable: { section_mm2: 6, length_m: 20, insulation: "PVC" },
      });

      const doc: DiagramDoc = createEmptyDoc({
        sheets: ["unifilar"],
        nodes: { [n1.id]: n1, [n2.id]: n2 },
        edges: { [e1.id]: e1 },
      });

      const diags = runDiagramDiagnostics(doc);

      // Não deve haver nenhum alerta com tipo 'AVISO' com ID de queda de tensão se estiver conforme
      const vdWarnings = diags.filter((d) => d.type === "AVISO" && d.id.startsWith("vd_"));
      expect(vdWarnings.length).toBe(0);

      // Deve ter o status de conformidade OK
      const vdOk = diags.find((d) => d.id === "vd_ok_e1");
      expect(vdOk).toBeDefined();
      expect(vdOk?.type).toBe("OK");
      expect(vdOk?.severity).toBe("ok");
    });
  });
});
