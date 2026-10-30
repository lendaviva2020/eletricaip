import { describe, it, expect } from "vitest";
import {
  PatchOperationSchema,
  OperationsListSchema,
  FixProposalSchema,
  applyPatchOperationsToDoc,
  SafetyViolationError,
  SAFETY_CRITICAL_KINDS,
  type PatchOperation,
  type FixProposal,
} from "@/lib/diagnostics/contract";
import { createEmptyDoc, makeNode, makeEdge } from "@/lib/diagram/model";
import type { DiagramDoc } from "@/lib/diagram/schema";

describe("Fase 2: Contrato de Dados, Schemas Zod e Invariantes de Segurança", () => {
  describe("1. Validação de Schemas Zod Estritos (.strict())", () => {
    it("aceita operação legítima de aumento de condutor com seção comercial NBR 5410", () => {
      const validOp = {
        op: "set-conductor-section",
        conductorId: "edge-W1",
        sectionMm2: 10,
      };
      const parsed = PatchOperationSchema.parse(validOp);
      expect(parsed).toEqual(validOp);
    });

    it("rejeita operação desconhecida fora da whitelist estrita", () => {
      const invalidOp = {
        op: "set-breaker-rating",
        conductorId: "edge-W1",
        sectionMm2: 10,
      };
      expect(() => PatchOperationSchema.parse(invalidOp)).toThrow();
    });

    it("rejeita seção que não pertença às seções comerciais da NBR 5410 (ex.: 7 mm², 3.5 mm²)", () => {
      expect(() =>
        PatchOperationSchema.parse({
          op: "set-conductor-section",
          conductorId: "edge-W1",
          sectionMm2: 7,
        }),
      ).toThrow(/seções comerciais padronizadas/);

      expect(() =>
        PatchOperationSchema.parse({
          op: "set-conductor-section",
          conductorId: "edge-W1",
          sectionMm2: 3.5,
        }),
      ).toThrow();
    });

    it("rejeita valores numéricos não finitos (NaN, Infinity) e negativos", () => {
      expect(() =>
        PatchOperationSchema.parse({
          op: "set-conductor-section",
          conductorId: "edge-W1",
          sectionMm2: Number.NaN,
        }),
      ).toThrow();

      expect(() =>
        PatchOperationSchema.parse({
          op: "set-conductor-section",
          conductorId: "edge-W1",
          sectionMm2: Number.POSITIVE_INFINITY,
        }),
      ).toThrow();

      expect(() =>
        PatchOperationSchema.parse({
          op: "set-conductor-section",
          conductorId: "edge-W1",
          sectionMm2: -10,
        }),
      ).toThrow();
    });

    it("rejeita propriedades extras não declaradas devido ao .strict()", () => {
      const extraPropOp = {
        op: "set-conductor-section",
        conductorId: "edge-W1",
        sectionMm2: 6,
        maliciousInjection: "DROP TABLE users;",
      };
      expect(() => PatchOperationSchema.parse(extraPropOp)).toThrow();
    });

    it("limita o raio de impacto a no máximo 10 operações e rejeita lista vazia", () => {
      expect(() => OperationsListSchema.parse([])).toThrow(/não pode ser vazia/);

      const elevenOps: PatchOperation[] = Array.from({ length: 11 }, (_, i) => ({
        op: "set-conductor-section" as const,
        conductorId: `edge-${i}`,
        sectionMm2: 6 as const,
      }));
      expect(() => OperationsListSchema.parse(elevenOps)).toThrow(
        /Raio de impacto máximo excedido/,
      );

      const tenOps: PatchOperation[] = Array.from({ length: 10 }, (_, i) => ({
        op: "set-conductor-section" as const,
        conductorId: `edge-${i}`,
        sectionMm2: 6 as const,
      }));
      expect(OperationsListSchema.parse(tenOps).length).toBe(10);
    });

    it("valida schema estrito de FixProposal completo", () => {
      const proposal: FixProposal = {
        id: "fix:NBR5410:W1:10mm2",
        resolvesDiagnosticIds: ["vd_warn_W1"],
        operations: [
          {
            op: "set-conductor-section",
            conductorId: "edge-W1",
            sectionMm2: 10,
          },
        ],
        metrics: [
          {
            elementId: "edge-W1",
            metric: "voltage_drop_pct",
            before: 3.8,
            after: 2.1,
            unit: "%",
            limit: 4.0,
            marginRatioBefore: 0.95,
            marginRatioAfter: 0.525,
          },
        ],
        sideEffects: ["Conferir taxa de ocupação do eletroduto existente"],
        verifiedChecks: ["voltage_drop", "ampacity_iz", "breaker_coordination"],
        unavailableChecks: ["short-circuit-withstand"],
        rationalePt: "Aumento de 6 mm² para 10 mm² reduz a queda de tensão de 3,8% para 2,1%.",
        isApplicable: false,
        blockReason: "Verificação de curto-circuito indisponível no motor.",
      };

      const parsed = FixProposalSchema.parse(proposal);
      expect(parsed.id).toBe("fix:NBR5410:W1:10mm2");
      expect(parsed.operations.length).toBe(1);
    });
  });

  describe("2. Invariantes de Segurança na Aplicação Pura (applyPatchOperationsToDoc)", () => {
    function buildTestDoc(): DiagramDoc {
      const source = makeNode({
        id: "source-1",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "Barramento 380V",
        params: { kind: "busbar", voltage_V: 380, current_A: 100 },
      });
      const motor = makeNode({
        id: "motor-1",
        sheet: "unifilar",
        position: { x: 100, y: 300 },
        label: "M1",
        params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
      });
      const estop = makeNode({
        id: "estop-1",
        sheet: "unifilar",
        position: { x: 300, y: 100 },
        label: "E-STOP Linha 01",
        params: { kind: "estop", category: "1" },
      });

      const normalCable = makeEdge({
        id: "edge-normal",
        sheet: "unifilar",
        source: "source-1",
        target: "motor-1",
        kind: "power",
        cable: { section_mm2: 4, length_m: 25, insulation: "PVC" },
      });

      const safetyCable = makeEdge({
        id: "edge-safety",
        sheet: "unifilar",
        source: "source-1",
        target: "estop-1",
        kind: "signal",
        cable: { section_mm2: 1.5, length_m: 10, insulation: "PVC" },
      });

      return createEmptyDoc({
        sheets: ["unifilar"],
        nodes: {
          [source.id]: source,
          [motor.id]: motor,
          [estop.id]: estop,
        },
        edges: {
          [normalCable.id]: normalCable,
          [safetyCable.id]: safetyCable,
        },
      });
    }

    it("aplica aumento de bitola em cópia profunda preservando o doc original (imutabilidade)", () => {
      const doc = buildTestDoc();
      const operations: PatchOperation[] = [
        { op: "set-conductor-section", conductorId: "edge-normal", sectionMm2: 6 },
      ];

      const nextDoc = applyPatchOperationsToDoc(doc, operations);

      // Doc original não foi mutado
      expect(doc.edges["edge-normal"].cable?.section_mm2).toBe(4);
      // Novo doc tem a seção aumentada
      expect(nextDoc.edges["edge-normal"].cable?.section_mm2).toBe(6);
    });

    it("rejeita e lança SafetyViolationError se tentar reduzir a seção do condutor", () => {
      const doc = buildTestDoc();
      // O condutor normal tem 4 mm²
      const reduceOp: PatchOperation = {
        op: "set-conductor-section",
        conductorId: "edge-normal",
        sectionMm2: 2.5,
      };

      expect(() => applyPatchOperationsToDoc(doc, [reduceOp])).toThrow(SafetyViolationError);
      expect(() => applyPatchOperationsToDoc(doc, [reduceOp])).toThrow(
        /Somente aumentos de bitola são permitidos/,
      );
    });

    it("rejeita e lança SafetyViolationError se a nova seção for igual à atual (sem aumento)", () => {
      const doc = buildTestDoc();
      const sameSectionOp: PatchOperation = {
        op: "set-conductor-section",
        conductorId: "edge-normal",
        sectionMm2: 4,
      };

      expect(() => applyPatchOperationsToDoc(doc, [sameSectionOp])).toThrow(SafetyViolationError);
    });

    it("bloqueia estritamente qualquer intervenção em condutores ligados a elementos de emergência (SAFETY_CRITICAL_KINDS)", () => {
      const doc = buildTestDoc();
      const touchSafetyOp: PatchOperation = {
        op: "set-conductor-section",
        conductorId: "edge-safety",
        sectionMm2: 2.5,
      };

      expect(() => applyPatchOperationsToDoc(doc, [touchSafetyOp])).toThrow(SafetyViolationError);
      expect(() => applyPatchOperationsToDoc(doc, [touchSafetyOp])).toThrow(
        /conectado ao elemento de segurança estop-1/,
      );
    });

    it("preserva intocados todos os parâmetros globais, disjuntores e tipos de nós", () => {
      const doc = buildTestDoc();
      const operations: PatchOperation[] = [
        { op: "set-conductor-section", conductorId: "edge-normal", sectionMm2: 10 },
      ];

      const nextDoc = applyPatchOperationsToDoc(doc, operations);

      // Dispositivos continuam com idênticos parâmetros
      expect(nextDoc.nodes["source-1"]).toEqual(doc.nodes["source-1"]);
      expect(nextDoc.nodes["motor-1"]).toEqual(doc.nodes["motor-1"]);
      expect(nextDoc.nodes["estop-1"]).toEqual(doc.nodes["estop-1"]);
      expect(nextDoc.edges["edge-safety"]).toEqual(doc.edges["edge-safety"]);
      expect(nextDoc.metadata).toEqual(doc.metadata);
    });
  });
});
