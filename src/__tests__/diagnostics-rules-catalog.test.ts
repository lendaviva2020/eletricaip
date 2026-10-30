import { describe, it, expect } from "vitest";
import {
  NORM_PARAMS,
  resolveVoltageDropLimit,
  ruleVoltageDropTerminalCircuit,
  RULES_CATALOG,
} from "@/lib/diagnostics/rules-catalog";
import { createEmptyDoc, makeNode, makeEdge } from "@/lib/diagram/model";
import type { DiagramDoc } from "@/lib/diagram/schema";

describe("Fase 3: Catálogo de Regras Normativas e Queda de Tensão", () => {
  describe("1. Parâmetros Normativos Estáticos (NORM_PARAMS)", () => {
    it("mantém parâmetros normativos da NBR 5410 com reviewStatus pendente de revisão humana", () => {
      expect(NORM_PARAMS.NBR5410.standard).toBe("ABNT NBR 5410:2004");
      expect(NORM_PARAMS.NBR5410.clause).toBe("Tabela 33 / §6.2.7");
      expect(NORM_PARAMS.NBR5410.reviewStatus).toBe("pending-human-review");
      expect(NORM_PARAMS.NBR5410.voltageDropLimits.publicGrid).toBe(4.0);
      expect(NORM_PARAMS.NBR5410.voltageDropLimits.ownSubstationOrGenerator).toBe(7.0);
      expect(NORM_PARAMS.NBR5410.voltageDropLimits.defaultRestrictive).toBe(4.0);
    });

    it("possui catálogo com a regra NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP registrada", () => {
      expect(RULES_CATALOG.length).toBe(1);
      expect(RULES_CATALOG[0].id).toBe("NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP");
      expect(RULES_CATALOG[0].allowedStrategies).toEqual(["increase-conductor-section"]);
    });
  });

  describe("2. Determinação do Limite por Origem da Alimentação (resolveVoltageDropLimit)", () => {
    it("aplica limite de 7,0% quando supplyOrigin for 'substation' sem gerar premissa", () => {
      const doc = createEmptyDoc();
      (doc.metadata as any).supplyOrigin = "substation";

      const res = resolveVoltageDropLimit(doc);
      expect(res.limit_pct).toBe(7.0);
      expect(res.assumptions.length).toBe(0);
    });

    it("aplica limite de 4,0% quando supplyOrigin for 'public_grid' sem gerar premissa", () => {
      const doc = createEmptyDoc();
      (doc.metadata as any).supplyOrigin = "public_grid";

      const res = resolveVoltageDropLimit(doc);
      expect(res.limit_pct).toBe(4.0);
      expect(res.assumptions.length).toBe(0);
    });

    it("quando supplyOrigin não existe no modelo, aplica o critério mais restritivo (4,0%) com premissa documentada", () => {
      const doc = createEmptyDoc();
      // Sem supplyOrigin

      const res = resolveVoltageDropLimit(doc);
      expect(res.limit_pct).toBe(4.0);
      expect(res.assumptions.length).toBe(1);
      expect(res.assumptions[0]).toContain("Origem da alimentação não especificada");
    });
  });

  describe("3. Avaliação da Regra de Queda de Tensão (ruleVoltageDropTerminalCircuit)", () => {
    function buildCircuitDoc(cableSection = 4, cableLength = 20): DiagramDoc {
      const source = makeNode({
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
        params: { kind: "motor", power_kW: 7.5, voltage_V: 380, current_A: 15, startMethod: "DOL" },
      });
      const edge = makeEdge({
        id: "edge-m1",
        sheet: "unifilar",
        source: "qgbt",
        target: "motor-1",
        kind: "power",
        cable: { section_mm2: cableSection, length_m: cableLength, insulation: "PVC" },
      });

      return createEmptyDoc({
        sheets: ["unifilar"],
        nodes: { [source.id]: source, [motor.id]: motor },
        edges: { [edge.id]: edge },
      });
    }

    it("emite diagnóstico 'ok' para circuito conforme com margem segura", () => {
      // 15 A em 20 m com 4 mm² trifásico -> queda ~1.4% (< 4.0%, margem ratio ~0.35)
      const doc = buildCircuitDoc(4, 20);
      (doc.metadata as any).supplyOrigin = "public_grid";
      const edge = doc.edges["edge-m1"];
      const targetNode = doc.nodes["motor-1"];
      const sourceNode = doc.nodes["qgbt"];

      const diag = ruleVoltageDropTerminalCircuit.evaluate({ doc, edge, sourceNode, targetNode });

      expect(diag).not.toBeNull();
      expect(diag!.id).toBe("NBR5410_TERMINAL_CIRCUIT_VOLTAGE_DROP:edge-m1");
      expect(diag!.severity).toBe("ok");
      expect(diag!.measured.value).toBeLessThan(4.0);
      expect(diag!.limit.value).toBe(4.0);
      expect(diag!.reference.standard).toBe("ABNT NBR 5410:2004");
      expect(diag!.reference.reviewStatus).toBe("pending-human-review");
      expect(diag!.assumptions.length).toBe(0);
    });

    it("emite diagnóstico 'error' para circuito com queda excessiva violando o limite da norma", () => {
      // 15 A em 120 m com 2.5 mm² trifásico -> queda ~12% (muito acima de 4%)
      const doc = buildCircuitDoc(2.5, 120);
      (doc.metadata as any).supplyOrigin = "public_grid";
      const edge = doc.edges["edge-m1"];
      const targetNode = doc.nodes["motor-1"];
      const sourceNode = doc.nodes["qgbt"];

      const diag = ruleVoltageDropTerminalCircuit.evaluate({ doc, edge, sourceNode, targetNode });

      expect(diag).not.toBeNull();
      expect(diag!.severity).toBe("error");
      expect(diag!.measured.value).toBeGreaterThan(4.0);
      expect(diag!.marginRatio).toBeGreaterThan(1.0);
    });

    it("registra premissas documentadas quando comprimento e seção não forem declarados na aresta", () => {
      const doc = buildCircuitDoc();
      delete (doc.edges["edge-m1"] as any).cable;
      const edge = doc.edges["edge-m1"];
      const targetNode = doc.nodes["motor-1"];
      const sourceNode = doc.nodes["qgbt"];

      const diag = ruleVoltageDropTerminalCircuit.evaluate({ doc, edge, sourceNode, targetNode });

      expect(diag).not.toBeNull();
      expect(diag!.assumptions.length).toBeGreaterThanOrEqual(2);
      expect(diag!.assumptions.some((a) => a.includes("Comprimento"))).toBe(true);
      expect(diag!.assumptions.some((a) => a.includes("Seção"))).toBe(true);
    });
  });
});
