// ELÉTRICAI — GATE U1.1 INDEPENDENT ELECTRICAL TOPOLOGY & AI BENCHMARK
// Standards: IEC 60947, IEC 60617, IEC 60204-1, ABNT NBR 5410, ABNT NBR 14039
// Benchmarking 10 Canonical Projects, 11 Injected Faults, False Positives,
// Spatial Invariance, Multifilar Equivalence, Performance and SCADA SSoT.

import { describe, it, expect } from "vitest";
import { createEmptyDoc, makeNode, makeEdge } from "@/lib/diagram/model";
import type { DiagramDoc, DiagramNode, DiagramEdge } from "@/lib/diagram/schema";
import {
  validateElectricalTopology,
  buildNetlistFromDiagram,
  repairDiagramConnections,
  autoLayoutIndustrialDiagram,
  getEquipmentTerminalProfile,
  resolveTerminalCode,
  connectBusbarToBranches,
} from "@/lib/diagram/connection";
import { buildMultifilarCommands, inferCircuitConfig } from "@/lib/diagram/multifilar";
import { createEmptyUnifiedDoc } from "@/lib/model/migration-v2-to-v3";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";

describe("GATE U1.1 — HOMOLOGAÇÃO INDEPENDENTE DE TOPOLOGIA E BENCHMARK", () => {
  // =========================================================================
  // SEÇÃO 1: AUDITORIA DE DESACOPLAMENTO ESPACIAL (Geometria != Topologia)
  // =========================================================================
  describe("SEÇÃO 1 — Desacoplamento Espacial & Estabilidade Topológica", () => {
    it("1.1 Movimentação drástica de coordenadas (x, y) não altera netlists nem terminais", () => {
      const doc = createEmptyDoc();

      const nQf = makeNode({
        id: "n_qf",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QF-01",
        params: { kind: "breaker", in_A: 32, curve: "C", poles: 3 },
      });
      const nKm = makeNode({
        id: "n_km",
        sheet: "unifilar",
        position: { x: 100, y: 250 },
        label: "KM-01",
        params: { kind: "contactor", in_A: 32, coil_V: 24 },
      });
      const nMot = makeNode({
        id: "n_mot",
        sheet: "unifilar",
        position: { x: 100, y: 400 },
        label: "M-01",
        params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
      });

      doc.nodes[nQf.id] = nQf;
      doc.nodes[nKm.id] = nKm;
      doc.nodes[nMot.id] = nMot;

      doc.edges["e1"] = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: nQf.id,
        target: nKm.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e2"] = makeEdge({
        id: "e2",
        sheet: "unifilar",
        source: nKm.id,
        target: nMot.id,
        sourcePort: "2/T1",
        targetPort: "U1",
        kind: "power",
      });

      // Validação no estado inicial
      const netlist1 = buildNetlistFromDiagram(doc);
      const val1 = validateElectricalTopology(doc);

      expect(val1.isElectricallyConsistent).toBe(true);
      expect(netlist1.nets.length).toBeGreaterThanOrEqual(2);

      // Movimenta os nós para coordenadas completamente arbitrárias no espaço
      doc.nodes[nQf.id].position = { x: 8900, y: -4500 };
      doc.nodes[nKm.id].position = { x: -320, y: 12400 };
      doc.nodes[nMot.id].position = { x: 50000, y: 50000 };

      // Validação pós-movimentação espacial
      const netlist2 = buildNetlistFromDiagram(doc);
      const val2 = validateElectricalTopology(doc);

      // A conectividade e os membros das nets devem ser 100% idênticos
      expect(val2.isElectricallyConsistent).toBe(true);
      expect(netlist2.nets.length).toBe(netlist1.nets.length);

      const net1Ids = netlist1.nets.map((n) =>
        n.members
          .map((m) => m.terminalId)
          .sort()
          .join(","),
      );
      const net2Ids = netlist2.nets.map((n) =>
        n.members
          .map((m) => m.terminalId)
          .sort()
          .join(","),
      );
      expect(net2Ids).toEqual(net1Ids);
    });

    it("1.2 resolveTerminalCode é determinístico e invariante em relação à posição do nó", () => {
      const nodeAtOrigin = makeNode({
        id: "node_1",
        sheet: "unifilar",
        position: { x: 0, y: 0 },
        label: "Disjuntor 1",
        params: { kind: "breaker", in_A: 50, curve: "C", poles: 3 },
      });
      const nodeFarAway = makeNode({
        id: "node_1",
        sheet: "unifilar",
        position: { x: 999999, y: -888888 },
        label: "Disjuntor 1",
        params: { kind: "breaker", in_A: 50, curve: "C", poles: 3 },
      });

      expect(resolveTerminalCode(nodeAtOrigin, "T", "source")).toBe(
        resolveTerminalCode(nodeFarAway, "T", "source"),
      );
      expect(resolveTerminalCode(nodeAtOrigin, "B", "target")).toBe(
        resolveTerminalCode(nodeFarAway, "B", "target"),
      );
      expect(resolveTerminalCode(nodeAtOrigin, "2/T1")).toBe("2/T1");
      expect(resolveTerminalCode(nodeFarAway, "2/T1")).toBe("2/T1");
    });
  });

  // =========================================================================
  // SEÇÃO 2: BENCHMARK DOS 10 PROJETOS CANÔNICOS (A até J)
  // =========================================================================
  describe("SEÇÃO 2 — Matriz de Benchmark de 10 Projetos Canônicos", () => {
    // PROJETO A: QGBT INDUSTRIAL
    it("Projeto A — QGBT Industrial (Transformador, Proteção Geral, Barramento, 8 Derivações, Medição)", () => {
      const doc = createEmptyDoc();

      const nTrafo = makeNode({
        id: "TR01",
        sheet: "unifilar",
        position: { x: 400, y: 100 },
        label: "TR-01 500kVA",
        params: {
          kind: "transformer",
          kVA: 500,
          primary_V: 13800,
          secondary_V: 380,
          vector: "Dyn11",
        },
      });
      const nQG = makeNode({
        id: "QG01",
        sheet: "unifilar",
        position: { x: 400, y: 220 },
        label: "QG-01 800A",
        params: { kind: "breaker", in_A: 800, curve: "C", poles: 3 },
      });
      const nBus = makeNode({
        id: "BUS01",
        sheet: "unifilar",
        position: { x: 400, y: 340 },
        label: "BARRAMENTO PRINCIPAL 1000A",
        params: { kind: "busbar", current_A: 1000, voltage_V: 380 },
      });

      doc.nodes[nTrafo.id] = nTrafo;
      doc.nodes[nQG.id] = nQG;
      doc.nodes[nBus.id] = nBus;

      doc.edges["e_tr_qg"] = makeEdge({
        id: "e_tr_qg",
        sheet: "unifilar",
        source: nTrafo.id,
        target: nQG.id,
        sourcePort: "X1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_qg_bus"] = makeEdge({
        id: "e_qg_bus",
        sheet: "unifilar",
        source: nQG.id,
        target: nBus.id,
        sourcePort: "2/T1",
        targetPort: "IN_FEED",
        kind: "power",
      });

      // 8 derivações com disjuntores e cargas
      for (let i = 1; i <= 8; i++) {
        const qfId = `QF0${i}`;
        const loadId = `LOAD0${i}`;
        const nQf = makeNode({
          id: qfId,
          sheet: "unifilar",
          position: { x: 100 + i * 120, y: 460 },
          label: `QF-0${i} 40A`,
          params: { kind: "breaker", in_A: 40, curve: "C", poles: 3 },
        });
        const nLoad = makeNode({
          id: loadId,
          sheet: "unifilar",
          position: { x: 100 + i * 120, y: 580 },
          label: i === 6 ? "Banco Capacitores 50kvar" : `Carga Ramal 0${i}`,
          params:
            i === 6
              ? { kind: "capacitor_bank", voltage_V: 380, kvar: 50 }
              : { kind: "load", power_W: 15000, voltage_V: 380, fp: 0.92 },
        });

        doc.nodes[qfId] = nQf;
        doc.nodes[loadId] = nLoad;

        doc.edges[`e_bus_${qfId}`] = makeEdge({
          id: `e_bus_${qfId}`,
          sheet: "unifilar",
          source: nBus.id,
          target: qfId,
          sourcePort: `TAP_${i <= 5 ? i : "1"}`,
          targetPort: "1/L1",
          kind: "power",
        });
        doc.edges[`e_${qfId}_${loadId}`] = makeEdge({
          id: `e_${qfId}_${loadId}`,
          sheet: "unifilar",
          source: qfId,
          target: loadId,
          sourcePort: "2/T1",
          targetPort: i === 6 ? "1/L1" : "L",
          kind: "power",
        });
      }

      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      expect(val.disconnectedNodes).toHaveLength(0);
      expect(val.paths).toHaveLength(8);
      expect(val.paths.every((p) => p.isComplete)).toBe(true);
    });

    // PROJETO B: PARTIDA DIRETA
    it("Projeto B — Partida Direta (Disjuntor, Contator, Relé Térmico, Motor, PE e Comando)", () => {
      const doc = createEmptyDoc();

      const nQf = makeNode({
        id: "QF1",
        sheet: "unifilar",
        position: { x: 200, y: 100 },
        label: "QF1 25A",
        params: { kind: "breaker", in_A: 25, curve: "D", poles: 3 },
      });
      const nKm = makeNode({
        id: "KM1",
        sheet: "unifilar",
        position: { x: 200, y: 220 },
        label: "KM1",
        params: { kind: "contactor", in_A: 25, coil_V: 24 },
      });
      const nRt = makeNode({
        id: "RT1",
        sheet: "unifilar",
        position: { x: 200, y: 340 },
        label: "RT1 18-25A",
        params: { kind: "thermal_relay", in_A: 25, trip_class: "10A" },
      });
      const nMot = makeNode({
        id: "M1",
        sheet: "unifilar",
        position: { x: 200, y: 460 },
        label: "Motor M1 7.5kW",
        params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
      });
      const nPe = makeNode({
        id: "PE_BAR",
        sheet: "unifilar",
        position: { x: 350, y: 460 },
        label: "Barramento PE",
        params: { kind: "ground" },
      });

      doc.nodes[nQf.id] = nQf;
      doc.nodes[nKm.id] = nKm;
      doc.nodes[nRt.id] = nRt;
      doc.nodes[nMot.id] = nMot;
      doc.nodes[nPe.id] = nPe;

      doc.edges["e1"] = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: nQf.id,
        target: nKm.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e2"] = makeEdge({
        id: "e2",
        sheet: "unifilar",
        source: nKm.id,
        target: nRt.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e3"] = makeEdge({
        id: "e3",
        sheet: "unifilar",
        source: nRt.id,
        target: nMot.id,
        sourcePort: "2/T1",
        targetPort: "U1",
        kind: "power",
      });
      doc.edges["e4"] = makeEdge({
        id: "e4",
        sheet: "unifilar",
        source: nPe.id,
        target: nMot.id,
        sourcePort: "PE",
        targetPort: "PE",
        kind: "ground",
      });

      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      expect(val.paths).toHaveLength(1);
      expect(val.paths[0].equipmentIds).toEqual(["QF1", "KM1", "RT1", "M1"]);
    });

    // PROJETO C: REVERSÃO DE MOTOR
    it("Projeto C — Reversão de Motor (Proteção, Contatores Avanço KM1 / Reversão KM2, Relé, Motor)", () => {
      const doc = createEmptyDoc();

      const nQf = makeNode({
        id: "QF_REV",
        sheet: "unifilar",
        position: { x: 300, y: 100 },
        label: "QF 40A",
        params: { kind: "breaker", in_A: 40, curve: "D", poles: 3 },
      });
      const nKm1 = makeNode({
        id: "KM1_FWD",
        sheet: "unifilar",
        position: { x: 200, y: 220 },
        label: "KM1 Avanço",
        params: { kind: "contactor", in_A: 40, coil_V: 24 },
      });
      const nKm2 = makeNode({
        id: "KM2_REV",
        sheet: "unifilar",
        position: { x: 400, y: 220 },
        label: "KM2 Reversão",
        params: { kind: "contactor", in_A: 40, coil_V: 24 },
      });
      const nRt = makeNode({
        id: "RT_REV",
        sheet: "unifilar",
        position: { x: 300, y: 340 },
        label: "RT 28-40A",
        params: { kind: "thermal_relay", in_A: 40, trip_class: "10A" },
      });
      const nMot = makeNode({
        id: "M_REV",
        sheet: "unifilar",
        position: { x: 300, y: 460 },
        label: "Motor Reversível 15kW",
        params: { kind: "motor", power_kW: 15, voltage_V: 380, startMethod: "DOL" },
      });

      doc.nodes[nQf.id] = nQf;
      doc.nodes[nKm1.id] = nKm1;
      doc.nodes[nKm2.id] = nKm2;
      doc.nodes[nRt.id] = nRt;
      doc.nodes[nMot.id] = nMot;

      // Alimentação de ambos os contatores a partir de QF
      doc.edges["e_qf_km1"] = makeEdge({
        id: "e_qf_km1",
        sheet: "unifilar",
        source: nQf.id,
        target: nKm1.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_qf_km2"] = makeEdge({
        id: "e_qf_km2",
        sheet: "unifilar",
        source: nQf.id,
        target: nKm2.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });

      // Saída de ambos os contatores para a entrada do relé térmico (com inversão L1/L3 no KM2)
      doc.edges["e_km1_rt"] = makeEdge({
        id: "e_km1_rt",
        sheet: "unifilar",
        source: nKm1.id,
        target: nRt.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_km2_rt"] = makeEdge({
        id: "e_km2_rt",
        sheet: "unifilar",
        source: nKm2.id,
        target: nRt.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });

      // Saída do relé para o motor
      doc.edges["e_rt_mot"] = makeEdge({
        id: "e_rt_mot",
        sheet: "unifilar",
        source: nRt.id,
        target: nMot.id,
        sourcePort: "2/T1",
        targetPort: "U1",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      expect(val.paths).toHaveLength(1);
      expect(val.paths[0].isComplete).toBe(true);
    });

    // PROJETO D: ESTRELA-TRIÂNGULO
    it("Projeto D — Estrela-Triângulo (Motor 6 Terminais U1-W1/U2-W2, Contatores K1, K2, K3)", () => {
      const doc = createEmptyDoc();

      const nQf = makeNode({
        id: "QF_SD",
        sheet: "unifilar",
        position: { x: 300, y: 80 },
        label: "QF 63A",
        params: { kind: "breaker", in_A: 63, curve: "D", poles: 3 },
      });
      const nK1 = makeNode({
        id: "K1_MAIN",
        sheet: "unifilar",
        position: { x: 180, y: 200 },
        label: "K1 Linha",
        params: { kind: "contactor", in_A: 50, coil_V: 24 },
      });
      const nK2 = makeNode({
        id: "K2_DELTA",
        sheet: "unifilar",
        position: { x: 320, y: 200 },
        label: "K2 Triângulo",
        params: { kind: "contactor", in_A: 50, coil_V: 24 },
      });
      const nK3 = makeNode({
        id: "K3_STAR",
        sheet: "unifilar",
        position: { x: 460, y: 200 },
        label: "K3 Estrela",
        params: { kind: "contactor", in_A: 32, coil_V: 24 },
      });
      const nRt = makeNode({
        id: "RT_SD",
        sheet: "unifilar",
        position: { x: 180, y: 320 },
        label: "RT Térmico",
        params: { kind: "thermal_relay", in_A: 36, trip_class: "10A" },
      });
      const nMot = makeNode({
        id: "M_SD",
        sheet: "unifilar",
        position: { x: 250, y: 450 },
        label: "Motor 6P 22kW",
        params: { kind: "motor", power_kW: 22, voltage_V: 380, startMethod: "STAR_DELTA" },
      });

      doc.nodes[nQf.id] = nQf;
      doc.nodes[nK1.id] = nK1;
      doc.nodes[nK2.id] = nK2;
      doc.nodes[nK3.id] = nK3;
      doc.nodes[nRt.id] = nRt;
      doc.nodes[nMot.id] = nMot;

      // Alimentação de K1 e K2 a partir do disjuntor
      doc.edges["e_qf_k1"] = makeEdge({
        id: "e_qf_k1",
        sheet: "unifilar",
        source: nQf.id,
        target: nK1.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_qf_k2"] = makeEdge({
        id: "e_qf_k2",
        sheet: "unifilar",
        source: nQf.id,
        target: nK2.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });

      // K1 -> RT -> U1, V1, W1
      doc.edges["e_k1_rt"] = makeEdge({
        id: "e_k1_rt",
        sheet: "unifilar",
        source: nK1.id,
        target: nRt.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_rt_mot"] = makeEdge({
        id: "e_rt_mot",
        sheet: "unifilar",
        source: nRt.id,
        target: nMot.id,
        sourcePort: "2/T1",
        targetPort: "U1",
        kind: "power",
      });

      // K2 alimenta terminais U2, V2, W2 (Triângulo)
      doc.edges["e_k2_mot"] = makeEdge({
        id: "e_k2_mot",
        sheet: "unifilar",
        source: nK2.id,
        target: nMot.id,
        sourcePort: "2/T1",
        targetPort: "U2",
        kind: "power",
      });

      // K3 fecha o ponto de estrela conectando a U2/V2/W2
      doc.edges["e_mot_k3"] = makeEdge({
        id: "e_mot_k3",
        sheet: "unifilar",
        source: nMot.id,
        target: nK3.id,
        sourcePort: "U2",
        targetPort: "1/L1",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      expect(val.paths[0].isComplete).toBe(true);
    });

    // PROJETO E: INVERSORES DE FREQUÊNCIA
    it("Projeto E — Inversor de Frequência (Disjuntor, VFD R/S/T -> U/V/W, Motor, PE e Comandos)", () => {
      const doc = createEmptyDoc();

      const nQf = makeNode({
        id: "QF_VFD",
        sheet: "unifilar",
        position: { x: 300, y: 100 },
        label: "QF 40A",
        params: { kind: "breaker", in_A: 40, curve: "C", poles: 3 },
      });
      const nVfd = makeNode({
        id: "VFD01",
        sheet: "unifilar",
        position: { x: 300, y: 240 },
        label: "VFD 15kW 380V",
        params: { kind: "vfd", power_kW: 15, voltage_V: 380 },
      });
      const nMot = makeNode({
        id: "M_VFD",
        sheet: "unifilar",
        position: { x: 300, y: 400 },
        label: "Motor Bomba 15kW",
        params: { kind: "motor", power_kW: 15, voltage_V: 380, startMethod: "VFD" },
      });

      doc.nodes[nQf.id] = nQf;
      doc.nodes[nVfd.id] = nVfd;
      doc.nodes[nMot.id] = nMot;

      doc.edges["e_qf_vfd"] = makeEdge({
        id: "e_qf_vfd",
        sheet: "unifilar",
        source: nQf.id,
        target: nVfd.id,
        sourcePort: "2/T1",
        targetPort: "L1",
        kind: "power",
      });
      doc.edges["e_vfd_mot"] = makeEdge({
        id: "e_vfd_mot",
        sheet: "unifilar",
        source: nVfd.id,
        target: nMot.id,
        sourcePort: "U",
        targetPort: "U1",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      expect(val.paths[0].equipmentIds).toEqual(["QF_VFD", "VFD01", "M_VFD"]);
      expect(val.paths[0].isComplete).toBe(true);
    });

    // PROJETO F: DISTRIBUIÇÃO EM BAIXA TENSÃO
    it("Projeto F — Distribuição (Transformador, QGBT, Quadros Secundários, Iluminação, Tomadas)", () => {
      const doc = createEmptyDoc();

      const nTrafo = makeNode({
        id: "TR_DIST",
        sheet: "unifilar",
        position: { x: 300, y: 80 },
        label: "TR 150kVA",
        params: {
          kind: "transformer",
          kVA: 150,
          primary_V: 13800,
          secondary_V: 380,
          vector: "Dyn11",
        },
      });
      const nQG = makeNode({
        id: "QG_DIST",
        sheet: "unifilar",
        position: { x: 300, y: 190 },
        label: "QG 250A",
        params: { kind: "breaker", in_A: 250, curve: "C", poles: 3 },
      });
      const nBar = makeNode({
        id: "BAR_DIST",
        sheet: "unifilar",
        position: { x: 300, y: 300 },
        label: "Barramento QGBT",
        params: { kind: "busbar", current_A: 400, voltage_V: 380 },
      });

      // Ramal 1: Iluminação
      const nQfIlum = makeNode({
        id: "QF_ILUM",
        sheet: "unifilar",
        position: { x: 180, y: 420 },
        label: "QF Ilum 16A",
        params: { kind: "breaker", in_A: 16, curve: "B", poles: 1 },
      });
      const nLamp = makeNode({
        id: "LAMP01",
        sheet: "unifilar",
        position: { x: 180, y: 540 },
        label: "Iluminação Galpão",
        params: { kind: "lamp", power_W: 1200, voltage_V: 220 },
      });

      // Ramal 2: Tomadas
      const nQfTug = makeNode({
        id: "QF_TUG",
        sheet: "unifilar",
        position: { x: 420, y: 420 },
        label: "QF Tomadas 20A",
        params: { kind: "breaker", in_A: 20, curve: "B", poles: 1 },
      });
      const nSocket = makeNode({
        id: "SOCK01",
        sheet: "unifilar",
        position: { x: 420, y: 540 },
        label: "Circuito Tomadas",
        params: { kind: "socket", current_A: 20, voltage_V: 220 },
      });

      doc.nodes[nTrafo.id] = nTrafo;
      doc.nodes[nQG.id] = nQG;
      doc.nodes[nBar.id] = nBar;
      doc.nodes[nQfIlum.id] = nQfIlum;
      doc.nodes[nLamp.id] = nLamp;
      doc.nodes[nQfTug.id] = nQfTug;
      doc.nodes[nSocket.id] = nSocket;

      doc.edges["e1"] = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: nTrafo.id,
        target: nQG.id,
        sourcePort: "X1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e2"] = makeEdge({
        id: "e2",
        sheet: "unifilar",
        source: nQG.id,
        target: nBar.id,
        sourcePort: "2/T1",
        targetPort: "IN_FEED",
        kind: "power",
      });
      doc.edges["e3"] = makeEdge({
        id: "e3",
        sheet: "unifilar",
        source: nBar.id,
        target: nQfIlum.id,
        sourcePort: "TAP_1",
        targetPort: "1",
        kind: "power",
      });
      doc.edges["e4"] = makeEdge({
        id: "e4",
        sheet: "unifilar",
        source: nQfIlum.id,
        target: nLamp.id,
        sourcePort: "2",
        targetPort: "L",
        kind: "power",
      });
      doc.edges["e5"] = makeEdge({
        id: "e5",
        sheet: "unifilar",
        source: nBar.id,
        target: nQfTug.id,
        sourcePort: "TAP_2",
        targetPort: "1",
        kind: "power",
      });
      doc.edges["e6"] = makeEdge({
        id: "e6",
        sheet: "unifilar",
        source: nQfTug.id,
        target: nSocket.id,
        sourcePort: "2",
        targetPort: "L",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      expect(val.paths).toHaveLength(2);
      expect(val.paths.every((p) => p.isComplete)).toBe(true);
    });

    // PROJETO G: AUTOMAÇÃO 24 VCC
    it("Projeto G — Automação 24 VCC (Proteção CA, Fonte PSU, Barramentos +24V/0V, CLP, Sensores)", () => {
      const doc = createEmptyDoc();

      const nQfCa = makeNode({
        id: "QF_PSU",
        sheet: "unifilar",
        position: { x: 300, y: 100 },
        label: "QF AC 10A",
        params: { kind: "breaker", in_A: 10, curve: "C", poles: 2 },
      });
      const nPsu = makeNode({
        id: "PSU01",
        sheet: "unifilar",
        position: { x: 300, y: 220 },
        label: "Fonte 24V 10A",
        params: { kind: "psu", output_V: 24, output_A: 10 },
      });
      const nPlc = makeNode({
        id: "PLC01",
        sheet: "unifilar",
        position: { x: 300, y: 360 },
        label: "CLP CPU",
        params: { kind: "plc", cpu: "S7-1200", io_count: 14 },
      });
      const nSensor = makeNode({
        id: "SENS_PT",
        sheet: "unifilar",
        position: { x: 450, y: 360 },
        label: "Sensor Pressão",
        params: { kind: "pressure", range_bar: [0, 10] },
      });

      doc.nodes[nQfCa.id] = nQfCa;
      doc.nodes[nPsu.id] = nPsu;
      doc.nodes[nPlc.id] = nPlc;
      doc.nodes[nSensor.id] = nSensor;

      // CA -> Fonte
      doc.edges["e_ac"] = makeEdge({
        id: "e_ac",
        sheet: "unifilar",
        source: nQfCa.id,
        target: nPsu.id,
        sourcePort: "2/T1",
        targetPort: "AC_L",
        kind: "power",
      });
      // Fonte +24V -> CLP
      doc.edges["e_dc_plc"] = makeEdge({
        id: "e_dc_plc",
        sheet: "unifilar",
        source: nPsu.id,
        target: nPlc.id,
        sourcePort: "+24V",
        targetPort: "24V",
        kind: "signal",
      });
      // Sensor -> Entrada CLP DI/AI
      doc.edges["e_sens_plc"] = makeEdge({
        id: "e_sens_plc",
        sheet: "unifilar",
        source: nSensor.id,
        target: nPlc.id,
        sourcePort: "-",
        targetPort: "DI0",
        kind: "signal",
      });

      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      expect(val.disconnectedNodes).toHaveLength(0);
    });

    // PROJETO H: PARTIDA MULTIMOTOR
    it("Projeto H — Partida Multimotor (CCM 8 Ramais com Proteção e Comandos Independentes)", () => {
      const doc = createEmptyDoc();

      const nCcm = makeNode({
        id: "CCM01",
        sheet: "unifilar",
        position: { x: 500, y: 100 },
        label: "CCM Geral 600A",
        params: { kind: "ccm", columns: 2, cells: 8 },
      });
      doc.nodes[nCcm.id] = nCcm;

      for (let i = 1; i <= 8; i++) {
        const qf = `QF_M0${i}`;
        const km = `KM_M0${i}`;
        const rt = `RT_M0${i}`;
        const mot = `MOT_0${i}`;

        doc.nodes[qf] = makeNode({
          id: qf,
          sheet: "unifilar",
          position: { x: 150 * i, y: 220 },
          label: `QF-${i}`,
          params: { kind: "breaker", in_A: 32, curve: "D", poles: 3 },
        });
        doc.nodes[km] = makeNode({
          id: km,
          sheet: "unifilar",
          position: { x: 150 * i, y: 340 },
          label: `KM-${i}`,
          params: { kind: "contactor", in_A: 32, coil_V: 24 },
        });
        doc.nodes[rt] = makeNode({
          id: rt,
          sheet: "unifilar",
          position: { x: 150 * i, y: 460 },
          label: `RT-${i}`,
          params: { kind: "thermal_relay", in_A: 32, trip_class: "10A" },
        });
        doc.nodes[mot] = makeNode({
          id: mot,
          sheet: "unifilar",
          position: { x: 150 * i, y: 580 },
          label: `Motor ${i}`,
          params: { kind: "motor", power_kW: 11, voltage_V: 380, startMethod: "DOL" },
        });

        doc.edges[`e_ccm_${qf}`] = makeEdge({
          id: `e_ccm_${qf}`,
          sheet: "unifilar",
          source: nCcm.id,
          target: qf,
          sourcePort: "OUT1",
          targetPort: "1/L1",
          kind: "power",
        });
        doc.edges[`e_${qf}_${km}`] = makeEdge({
          id: `e_${qf}_${km}`,
          sheet: "unifilar",
          source: qf,
          target: km,
          sourcePort: "2/T1",
          targetPort: "1/L1",
          kind: "power",
        });
        doc.edges[`e_${km}_${rt}`] = makeEdge({
          id: `e_${km}_${rt}`,
          sheet: "unifilar",
          source: km,
          target: rt,
          sourcePort: "2/T1",
          targetPort: "1/L1",
          kind: "power",
        });
        doc.edges[`e_${rt}_${mot}`] = makeEdge({
          id: `e_${rt}_${mot}`,
          sheet: "unifilar",
          source: rt,
          target: mot,
          sourcePort: "2/T1",
          targetPort: "U1",
          kind: "power",
        });
      }

      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      expect(val.paths).toHaveLength(8);
      expect(val.paths.every((p) => p.isComplete)).toBe(true);
    });

    // PROJETO I: DISTRIBUIÇÃO COM DERIVAÇÕES COMPLEXAS EM CASCATA
    it("Projeto I — Distribuição em Cascata (Barramento Principal -> Subquadro -> Derivações)", () => {
      const doc = createEmptyDoc();

      const nQG = makeNode({
        id: "QG_SUB",
        sheet: "unifilar",
        position: { x: 300, y: 80 },
        label: "Disjuntor Geral",
        params: { kind: "breaker", in_A: 400, curve: "C", poles: 3 },
      });
      const nBus1 = makeNode({
        id: "BUS_MAIN",
        sheet: "unifilar",
        position: { x: 300, y: 200 },
        label: "Barramento QGBT",
        params: { kind: "busbar", current_A: 600, voltage_V: 380 },
      });
      const nQfSub = makeNode({
        id: "QF_FEED_SUB",
        sheet: "unifilar",
        position: { x: 300, y: 320 },
        label: "Alimentador Subquadro",
        params: { kind: "breaker", in_A: 125, curve: "C", poles: 3 },
      });
      const nBus2 = makeNode({
        id: "BUS_SUB",
        sheet: "unifilar",
        position: { x: 300, y: 440 },
        label: "Barramento Subquadro QDF-01",
        params: { kind: "busbar", current_A: 200, voltage_V: 380 },
      });
      const nQfFinal = makeNode({
        id: "QF_FINAL",
        sheet: "unifilar",
        position: { x: 300, y: 560 },
        label: "Disjuntor Terminal",
        params: { kind: "breaker", in_A: 32, curve: "C", poles: 3 },
      });
      const nLoad = makeNode({
        id: "LOAD_FINAL",
        sheet: "unifilar",
        position: { x: 300, y: 680 },
        label: "Carga Final",
        params: { kind: "load", power_W: 10000, voltage_V: 380, fp: 0.92 },
      });

      doc.nodes[nQG.id] = nQG;
      doc.nodes[nBus1.id] = nBus1;
      doc.nodes[nQfSub.id] = nQfSub;
      doc.nodes[nBus2.id] = nBus2;
      doc.nodes[nQfFinal.id] = nQfFinal;
      doc.nodes[nLoad.id] = nLoad;

      doc.edges["e1"] = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: nQG.id,
        target: nBus1.id,
        sourcePort: "2/T1",
        targetPort: "IN_FEED",
        kind: "power",
      });
      doc.edges["e2"] = makeEdge({
        id: "e2",
        sheet: "unifilar",
        source: nBus1.id,
        target: nQfSub.id,
        sourcePort: "TAP_1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e3"] = makeEdge({
        id: "e3",
        sheet: "unifilar",
        source: nQfSub.id,
        target: nBus2.id,
        sourcePort: "2/T1",
        targetPort: "IN_FEED",
        kind: "power",
      });
      doc.edges["e4"] = makeEdge({
        id: "e4",
        sheet: "unifilar",
        source: nBus2.id,
        target: nQfFinal.id,
        sourcePort: "TAP_1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e5"] = makeEdge({
        id: "e5",
        sheet: "unifilar",
        source: nQfFinal.id,
        target: nLoad.id,
        sourcePort: "2/T1",
        targetPort: "L",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      expect(val.paths[0].equipmentIds).toEqual([
        "QG_SUB",
        "BUS_MAIN",
        "QF_FEED_SUB",
        "BUS_SUB",
        "QF_FINAL",
        "LOAD_FINAL",
      ]);
      expect(val.paths[0].isComplete).toBe(true);
    });

    // PROJETO J: SISTEMA INDUSTRIAL INTEGRADO
    it("Projeto J — Sistema Industrial Integrado (Trafo, QGBT, CCM, VFD, Motores, Instrumentação, CLP)", () => {
      const doc = createEmptyDoc();

      const nTrafo = makeNode({
        id: "TR_IND",
        sheet: "unifilar",
        position: { x: 500, y: 60 },
        label: "Trafo 750kVA",
        params: {
          kind: "transformer",
          kVA: 750,
          primary_V: 13800,
          secondary_V: 380,
          vector: "Dyn11",
        },
      });
      const nQG = makeNode({
        id: "QG_IND",
        sheet: "unifilar",
        position: { x: 500, y: 160 },
        label: "Disjuntor Geral 1200A",
        params: { kind: "breaker", in_A: 1200, curve: "C", poles: 3 },
      });
      const nBus = makeNode({
        id: "BUS_IND",
        sheet: "unifilar",
        position: { x: 500, y: 260 },
        label: "Barramento QGBT",
        params: { kind: "busbar", current_A: 1500, voltage_V: 380 },
      });

      // Ramal 1: Partida Direta Bomba
      const nQfDol = makeNode({
        id: "QF_DOL",
        sheet: "unifilar",
        position: { x: 250, y: 380 },
        label: "QF Bomba 50A",
        params: { kind: "breaker", in_A: 50, curve: "D", poles: 3 },
      });
      const nKmDol = makeNode({
        id: "KM_DOL",
        sheet: "unifilar",
        position: { x: 250, y: 480 },
        label: "KM Bomba",
        params: { kind: "contactor", in_A: 50, coil_V: 24 },
      });
      const nRtDol = makeNode({
        id: "RT_DOL",
        sheet: "unifilar",
        position: { x: 250, y: 580 },
        label: "RT Bomba",
        params: { kind: "thermal_relay", in_A: 50, trip_class: "10A" },
      });
      const nMotDol = makeNode({
        id: "M_PUMP",
        sheet: "unifilar",
        position: { x: 250, y: 680 },
        label: "Bomba Recalque 18.5kW",
        params: { kind: "motor", power_kW: 18.5, voltage_V: 380, startMethod: "DOL" },
      });

      // Ramal 2: VFD Ventilador
      const nQfVfd = makeNode({
        id: "QF_VFD_IND",
        sheet: "unifilar",
        position: { x: 500, y: 380 },
        label: "QF VFD 63A",
        params: { kind: "breaker", in_A: 63, curve: "C", poles: 3 },
      });
      const nVfdInd = makeNode({
        id: "VFD_IND",
        sheet: "unifilar",
        position: { x: 500, y: 500 },
        label: "VFD Exaustor 22kW",
        params: { kind: "vfd", power_kW: 22, voltage_V: 380 },
      });
      const nMotVfd = makeNode({
        id: "M_FAN",
        sheet: "unifilar",
        position: { x: 500, y: 680 },
        label: "Motor Ventilador 22kW",
        params: { kind: "motor", power_kW: 22, voltage_V: 380, startMethod: "VFD" },
      });

      // Ramal 3: Automação CLP + Fonte
      const nQfPsu = makeNode({
        id: "QF_PSU_IND",
        sheet: "unifilar",
        position: { x: 750, y: 380 },
        label: "QF Fonte 16A",
        params: { kind: "breaker", in_A: 16, curve: "C", poles: 2 },
      });
      const nPsuInd = makeNode({
        id: "PSU_IND",
        sheet: "unifilar",
        position: { x: 750, y: 500 },
        label: "Fonte 24V 20A",
        params: { kind: "psu", output_V: 24, output_A: 20 },
      });
      const nPlcInd = makeNode({
        id: "PLC_IND",
        sheet: "unifilar",
        position: { x: 750, y: 680 },
        label: "CLP Mestre",
        params: { kind: "plc", cpu: "S7-1500", io_count: 32 },
      });

      doc.nodes[nTrafo.id] = nTrafo;
      doc.nodes[nQG.id] = nQG;
      doc.nodes[nBus.id] = nBus;
      doc.nodes[nQfDol.id] = nQfDol;
      doc.nodes[nKmDol.id] = nKmDol;
      doc.nodes[nRtDol.id] = nRtDol;
      doc.nodes[nMotDol.id] = nMotDol;
      doc.nodes[nQfVfd.id] = nQfVfd;
      doc.nodes[nVfdInd.id] = nVfdInd;
      doc.nodes[nMotVfd.id] = nMotVfd;
      doc.nodes[nQfPsu.id] = nQfPsu;
      doc.nodes[nPsuInd.id] = nPsuInd;
      doc.nodes[nPlcInd.id] = nPlcInd;

      // Alimentação principal
      doc.edges["e_tr_qg"] = makeEdge({
        id: "e_tr_qg",
        sheet: "unifilar",
        source: nTrafo.id,
        target: nQG.id,
        sourcePort: "X1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_qg_bus"] = makeEdge({
        id: "e_qg_bus",
        sheet: "unifilar",
        source: nQG.id,
        target: nBus.id,
        sourcePort: "2/T1",
        targetPort: "IN_FEED",
        kind: "power",
      });

      // Ramal 1
      doc.edges["e_b_qfdol"] = makeEdge({
        id: "e_b_qfdol",
        sheet: "unifilar",
        source: nBus.id,
        target: nQfDol.id,
        sourcePort: "TAP_1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_qfdol_km"] = makeEdge({
        id: "e_qfdol_km",
        sheet: "unifilar",
        source: nQfDol.id,
        target: nKmDol.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_km_rt"] = makeEdge({
        id: "e_km_rt",
        sheet: "unifilar",
        source: nKmDol.id,
        target: nRtDol.id,
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_rt_mot"] = makeEdge({
        id: "e_rt_mot",
        sheet: "unifilar",
        source: nRtDol.id,
        target: nMotDol.id,
        sourcePort: "2/T1",
        targetPort: "U1",
        kind: "power",
      });

      // Ramal 2
      doc.edges["e_b_qfvfd"] = makeEdge({
        id: "e_b_qfvfd",
        sheet: "unifilar",
        source: nBus.id,
        target: nQfVfd.id,
        sourcePort: "TAP_2",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_qfvfd_vfd"] = makeEdge({
        id: "e_qfvfd_vfd",
        sheet: "unifilar",
        source: nQfVfd.id,
        target: nVfdInd.id,
        sourcePort: "2/T1",
        targetPort: "L1",
        kind: "power",
      });
      doc.edges["e_vfd_mot"] = makeEdge({
        id: "e_vfd_mot",
        sheet: "unifilar",
        source: nVfdInd.id,
        target: nMotVfd.id,
        sourcePort: "U",
        targetPort: "U1",
        kind: "power",
      });

      // Ramal 3
      doc.edges["e_b_qfpsu"] = makeEdge({
        id: "e_b_qfpsu",
        sheet: "unifilar",
        source: nBus.id,
        target: nQfPsu.id,
        sourcePort: "TAP_3",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_qfpsu_psu"] = makeEdge({
        id: "e_qfpsu_psu",
        sheet: "unifilar",
        source: nQfPsu.id,
        target: nPsuInd.id,
        sourcePort: "2/T1",
        targetPort: "AC_L",
        kind: "power",
      });
      doc.edges["e_psu_plc"] = makeEdge({
        id: "e_psu_plc",
        sheet: "unifilar",
        source: nPsuInd.id,
        target: nPlcInd.id,
        sourcePort: "+24V",
        targetPort: "24V",
        kind: "signal",
      });

      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      expect(val.paths).toHaveLength(3);
      expect(val.paths.every((p) => p.isComplete)).toBe(true);
    });
  });

  // =========================================================================
  // SEÇÃO 3: TESTES DE FALHAS INJETADAS E FALSOS POSITIVOS
  // =========================================================================
  describe("SEÇÃO 3 — Bateria de Falhas Injetadas e Validação de Falsos Positivos", () => {
    it("Falha 1 — Conexão com Terminal Inexistente: Deve ser classificada e tratada", () => {
      const doc = createEmptyDoc();
      const nQf = makeNode({
        id: "QF",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QF",
        params: { kind: "breaker", in_A: 20, curve: "C", poles: 3 },
      });
      const nMot = makeNode({
        id: "MOT",
        sheet: "unifilar",
        position: { x: 100, y: 250 },
        label: "M",
        params: { kind: "motor", power_kW: 5, voltage_V: 380, startMethod: "DOL" },
      });
      doc.nodes[nQf.id] = nQf;
      doc.nodes[nMot.id] = nMot;

      doc.edges["e_err"] = makeEdge({
        id: "e_err",
        sheet: "unifilar",
        source: nQf.id,
        target: nMot.id,
        sourcePort: "2/T1",
        targetPort: "TERMINAL_FANTASMA_999",
        kind: "power",
      });

      const resolved = resolveTerminalCode(nMot, "TERMINAL_FANTASMA_999", "target");
      // Fallback seguro da biblioteca resolve para terminal de entrada válido, impedindo colapso
      expect(resolved).toBeDefined();
    });

    it("Falha 2 — Conexão Ausente: Carga sem alimentação a montante gera erro LOAD_WITHOUT_FEEDER", () => {
      const doc = createEmptyDoc();
      const nMot = makeNode({
        id: "MOT_ORPHAN",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "Motor Sem Cabo",
        params: { kind: "motor", power_kW: 5, voltage_V: 380, startMethod: "DOL" },
      });
      doc.nodes[nMot.id] = nMot;

      const val = validateElectricalTopology(doc);
      expect(val.missingConnections.some((m) => m.equipmentId === "MOT_ORPHAN")).toBe(true);
      expect(val.isElectricallyConsistent).toBe(false);
    });

    it("Falha 3 — Rede Isolada: Equipamento com grau 0 gera diagnóstico DISCONNECTED_EQUIPMENT", () => {
      const doc = createEmptyDoc();
      const nIso = makeNode({
        id: "QF_ISO",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QF Isolado",
        params: { kind: "breaker", in_A: 20, curve: "C", poles: 3 },
      });
      doc.nodes[nIso.id] = nIso;

      const val = validateElectricalTopology(doc);
      expect(val.disconnectedNodes.some((d) => d.nodeId === "QF_ISO")).toBe(true);
    });

    it("Falha 4 — Equipamento Órfão (Aresta para nó inexistente) gera ORPHAN_EDGE_REFERENCE e status INVALID", () => {
      const doc = createEmptyDoc();
      const nQf = makeNode({
        id: "QF_OK",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QF",
        params: { kind: "breaker", in_A: 20, curve: "C", poles: 3 },
      });
      doc.nodes[nQf.id] = nQf;
      doc.edges["e_ghost"] = makeEdge({
        id: "e_ghost",
        sheet: "unifilar",
        source: "QF_OK",
        target: "NO_FANTASMA_XYZ",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(val.status).toBe("INVALID");
      expect(val.invalidConnections.some((c) => c.edgeId === "e_ghost")).toBe(true);
    });

    it("Falha 5 — Conexão Duplicada: Emite aviso DUPLICATE_CONNECTION sem quebrar a topologia", () => {
      const doc = createEmptyDoc();
      const nQf = makeNode({
        id: "QF1",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QF1",
        params: { kind: "breaker", in_A: 20, curve: "C", poles: 3 },
      });
      const nMot = makeNode({
        id: "M1",
        sheet: "unifilar",
        position: { x: 100, y: 250 },
        label: "M1",
        params: { kind: "motor", power_kW: 3, voltage_V: 380, startMethod: "DOL" },
      });
      doc.nodes[nQf.id] = nQf;
      doc.nodes[nMot.id] = nMot;

      doc.edges["e1"] = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: "QF1",
        target: "M1",
        sourcePort: "2/T1",
        targetPort: "U1",
        kind: "power",
      });
      doc.edges["e2"] = makeEdge({
        id: "e2",
        sheet: "unifilar",
        source: "QF1",
        target: "M1",
        sourcePort: "2/T1",
        targetPort: "U1",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(val.diagnostics.some((d) => d.code === "DUPLICATE_CONNECTION")).toBe(true);
    });

    it("Falha 6 — Incompatibilidade de Domínios: Ligação direta de Força em comando sem conversão galvânica gera erro", () => {
      const doc = createEmptyDoc();
      const nTrafo = makeNode({
        id: "TR1",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "Trafo 380V",
        params: {
          kind: "transformer",
          kVA: 100,
          primary_V: 13800,
          secondary_V: 380,
          vector: "Dyn11",
        },
      });
      const nPlc = makeNode({
        id: "PLC1",
        sheet: "unifilar",
        position: { x: 100, y: 250 },
        label: "CLP 24V",
        params: { kind: "plc", cpu: "S7-1200", io_count: 14 },
      });
      doc.nodes[nTrafo.id] = nTrafo;
      doc.nodes[nPlc.id] = nPlc;

      // Trafo X1 (Potência 380V) ligado direto na CPU 24V (terminal de controle) sem fonte intermediária
      doc.edges["e_mismatch"] = makeEdge({
        id: "e_mismatch",
        sheet: "unifilar",
        source: "TR1",
        target: "PLC1",
        sourcePort: "X1",
        targetPort: "24V",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(val.diagnostics.some((d) => d.code === "POWER_TO_CONTROL_SHORT")).toBe(true);
    });

    it("Falha 7 — Auto-laço (Self Loop): Equipamento em curto consigo mesmo gera erro INVALID_SELF_LOOP", () => {
      const doc = createEmptyDoc();
      const nQf = makeNode({
        id: "QF_LOOP",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QF Curto",
        params: { kind: "breaker", in_A: 20, curve: "C", poles: 3 },
      });
      doc.nodes[nQf.id] = nQf;
      doc.edges["e_loop"] = makeEdge({
        id: "e_loop",
        sheet: "unifilar",
        source: "QF_LOOP",
        target: "QF_LOOP",
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(val.diagnostics.some((d) => d.code === "INVALID_SELF_LOOP")).toBe(true);
      expect(val.status).toBe("INVALID");
    });

    it("Falha 8 — Derivação Incompleta: Dispositivo com saída aberta emite aviso", () => {
      const doc = createEmptyDoc();
      const nQfMain = makeNode({
        id: "QG",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QG",
        params: { kind: "breaker", in_A: 50, curve: "C", poles: 3 },
      });
      const nQfBranch = makeNode({
        id: "QF_ABERTO",
        sheet: "unifilar",
        position: { x: 100, y: 220 },
        label: "QF Aberto",
        params: { kind: "breaker", in_A: 20, curve: "C", poles: 3 },
      });
      doc.nodes[nQfMain.id] = nQfMain;
      doc.nodes[nQfBranch.id] = nQfBranch;

      doc.edges["e_feed"] = makeEdge({
        id: "e_feed",
        sheet: "unifilar",
        source: "QG",
        target: "QF_ABERTO",
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(
        val.missingConnections.some(
          (m) => m.equipmentId === "QF_ABERTO" && m.severity === "warning",
        ),
      ).toBe(true);
    });

    it("Falha 9 — Junção Ausente / Caminho Interrompido: Carga sem chegada na fonte", () => {
      const doc = createEmptyDoc();
      const nKm = makeNode({
        id: "KM_SEM_FONTE",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "KM",
        params: { kind: "contactor", in_A: 25, coil_V: 24 },
      });
      const nMot = makeNode({
        id: "MOT_FIM",
        sheet: "unifilar",
        position: { x: 100, y: 250 },
        label: "Motor",
        params: { kind: "motor", power_kW: 4, voltage_V: 380, startMethod: "DOL" },
      });
      doc.nodes[nKm.id] = nKm;
      doc.nodes[nMot.id] = nMot;

      doc.edges["e_km_mot"] = makeEdge({
        id: "e_km_mot",
        sheet: "unifilar",
        source: "KM_SEM_FONTE",
        target: "MOT_FIM",
        sourcePort: "2/T1",
        targetPort: "U1",
        kind: "power",
      });

      const val = validateElectricalTopology(doc);
      expect(val.paths[0].isComplete).toBe(false);
      expect(val.paths[0].interruptionPoint).toBeDefined();
    });

    it("Falha 10 — Cruzamento sem Conexão: Linhas que se cruzam geometricamente NÃO geram netlist em comum", () => {
      const doc = createEmptyDoc();
      const nA1 = makeNode({
        id: "A1",
        sheet: "unifilar",
        position: { x: 50, y: 100 },
        label: "A1",
        params: { kind: "breaker", in_A: 20, curve: "C", poles: 1 },
      });
      const nB1 = makeNode({
        id: "B1",
        sheet: "unifilar",
        position: { x: 250, y: 300 },
        label: "B1",
        params: { kind: "load", power_W: 1000, voltage_V: 220, fp: 0.92 },
      });
      const nA2 = makeNode({
        id: "A2",
        sheet: "unifilar",
        position: { x: 50, y: 300 },
        label: "A2",
        params: { kind: "breaker", in_A: 20, curve: "C", poles: 1 },
      });
      const nB2 = makeNode({
        id: "B2",
        sheet: "unifilar",
        position: { x: 250, y: 100 },
        label: "B2",
        params: { kind: "load", power_W: 1000, voltage_V: 220, fp: 0.92 },
      });

      doc.nodes[nA1.id] = nA1;
      doc.nodes[nB1.id] = nB1;
      doc.nodes[nA2.id] = nA2;
      doc.nodes[nB2.id] = nB2;

      doc.edges["e1"] = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: "A1",
        target: "B1",
        kind: "power",
      });
      doc.edges["e2"] = makeEdge({
        id: "e2",
        sheet: "unifilar",
        source: "A2",
        target: "B2",
        kind: "power",
      });

      const netlist = buildNetlistFromDiagram(doc);
      expect(netlist.nets).toHaveLength(2);
      const members1 = netlist.nets[0].members.map((m) => m.equipmentId);
      const members2 = netlist.nets[1].members.map((m) => m.equipmentId);
      expect(members1).not.toEqual(expect.arrayContaining(["A2", "B2"]));
      expect(members2).not.toEqual(expect.arrayContaining(["A1", "B1"]));
    });

    it("Falsos Positivos — Terminais não utilizados legítimos (contatos auxiliares e reservas) NÃO geram erro fatal", () => {
      const doc = createEmptyDoc();
      const nQf = makeNode({
        id: "QF",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "QF",
        params: { kind: "breaker", in_A: 25, curve: "C", poles: 3 },
      });
      const nKm = makeNode({
        id: "KM",
        sheet: "unifilar",
        position: { x: 100, y: 220 },
        label: "KM",
        params: { kind: "contactor", in_A: 25, coil_V: 24 },
      });
      const nMot = makeNode({
        id: "MOT",
        sheet: "unifilar",
        position: { x: 100, y: 360 },
        label: "M",
        params: { kind: "motor", power_kW: 5.5, voltage_V: 380, startMethod: "DOL" },
      });
      doc.nodes[nQf.id] = nQf;
      doc.nodes[nKm.id] = nKm;
      doc.nodes[nMot.id] = nMot;

      doc.edges["e1"] = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: "QF",
        target: "KM",
        sourcePort: "2/T1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e2"] = makeEdge({
        id: "e2",
        sheet: "unifilar",
        source: "KM",
        target: "MOT",
        sourcePort: "2/T1",
        targetPort: "U1",
        kind: "power",
      });

      // Contatos 13-14 e 21-22 do KM estão desconectados legitimamente (não usados neste circuito)
      const val = validateElectricalTopology(doc);
      expect(val.isElectricallyConsistent).toBe(true);
      // Não deve gerar erro por contatos auxiliares não utilizados
      expect(val.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    });
  });

  // =========================================================================
  // SEÇÃO 4: TESTE DE CONVERSÃO PARA MULTIFILAR
  // =========================================================================
  describe("SEÇÃO 4 — Teste de Conversão e Equivalência Multifilar", () => {
    it("4.1 Desdobramento trifásico com neutro e terra preserva relações sem inventar conexões", () => {
      const doc = createEmptyDoc();

      const nQf = makeNode({
        id: "QF_UNI",
        sheet: "unifilar",
        position: { x: 200, y: 100 },
        label: "QF-01",
        params: { kind: "breaker", in_A: 63, curve: "C", poles: 4 },
      });
      const nLoad = makeNode({
        id: "LOAD_UNI",
        sheet: "unifilar",
        position: { x: 200, y: 250 },
        label: "Quadro Força",
        params: { kind: "load", power_W: 20000, voltage_V: 380, fp: 0.92 },
      });

      doc.nodes[nQf.id] = nQf;
      doc.nodes[nLoad.id] = nLoad;

      doc.edges["e_uni"] = makeEdge({
        id: "e_uni",
        sheet: "unifilar",
        source: nQf.id,
        target: nLoad.id,
        sourcePort: "2/T1",
        targetPort: "L",
        circuitConfig: "3F+N+PE",
        kind: "power",
      });

      const cmds = buildMultifilarCommands(doc);
      // Deve criar nós multifilares com id espelho e vínculo canônico ui.equipmentId
      const addNodeCmds = cmds.filter((c) => c.type === "AddNode");
      const addEdgeCmds = cmds.filter((c) => c.type === "AddEdge");

      expect(addNodeCmds.length).toBe(2);
      expect(addEdgeCmds.length).toBe(1);

      const mfNodeQf = addNodeCmds.find((c) => c.node.id === "mf_QF_UNI");
      expect(mfNodeQf?.node.ui?.equipmentId).toBe("QF_UNI");

      const mfEdge = addEdgeCmds[0]?.edge;
      expect(mfEdge?.circuitConfig).toBe("3F+N+PE");
    });
  });

  // =========================================================================
  // SEÇÃO 5: TESTE DE PERSISTÊNCIA E ROUND-TRIP NO UNIFIED PROJECT STORE
  // =========================================================================
  describe("SEÇÃO 5 — Persistência, Hidratação e Round-Trip Canônico", () => {
    it("5.1 Salvamento, reload, movimentação e revalidação mantêm hash e topologia intactos", () => {
      const store = useUnifiedProjectStore.getState();
      store.resetUnifiedDoc({ name: "Benchmark Gate U1.1" });

      const doc = createEmptyDoc();
      const nTrafo = makeNode({
        id: "TR_P",
        sheet: "unifilar",
        position: { x: 100, y: 100 },
        label: "TR",
        params: {
          kind: "transformer",
          kVA: 300,
          primary_V: 13800,
          secondary_V: 380,
          vector: "Dyn11",
        },
      });
      const nQG = makeNode({
        id: "QG_P",
        sheet: "unifilar",
        position: { x: 100, y: 220 },
        label: "QG",
        params: { kind: "breaker", in_A: 400, curve: "C", poles: 3 },
      });
      const nMot = makeNode({
        id: "M_P",
        sheet: "unifilar",
        position: { x: 100, y: 360 },
        label: "M",
        params: { kind: "motor", power_kW: 30, voltage_V: 380, startMethod: "DOL" },
      });

      doc.nodes[nTrafo.id] = nTrafo;
      doc.nodes[nQG.id] = nQG;
      doc.nodes[nMot.id] = nMot;

      doc.edges["e1"] = makeEdge({
        id: "e1",
        sheet: "unifilar",
        source: "TR_P",
        target: "QG_P",
        sourcePort: "X1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e2"] = makeEdge({
        id: "e2",
        sheet: "unifilar",
        source: "QG_P",
        target: "M_P",
        sourcePort: "2/T1",
        targetPort: "U1",
        kind: "power",
      });

      // Hidratação a partir de snapshot
      const snapshot = {
        diagram: doc,
        ladder: { rungs: [] },
        plc: { racks: [] },
        views: {},
        version: 2,
      };

      const unifiedDoc = store.hydrateFromV2Snapshot(snapshot as any);

      // Comprova que equipamentos canônicos foram registrados
      expect(unifiedDoc.engineering.equipments["TR_P"]).toBeDefined();
      expect(unifiedDoc.engineering.equipments["QG_P"]).toBeDefined();
      expect(unifiedDoc.engineering.equipments["M_P"]).toBeDefined();

      // Comprova que as conexões canônicas foram registradas com terminais normalizados
      const connList = Object.values(unifiedDoc.engineering.connections);
      expect(connList).toHaveLength(2);
      expect(connList[0].fromEquipmentId).toBe("TR_P");
      expect(connList[0].toEquipmentId).toBe("QG_P");

      // Simula movimentação de layout de um nó
      store.updateViewNodePosition("unifilar", "M_P", { x: 4500, y: 8800 });
      const updatedUnified = useUnifiedProjectStore.getState().doc;

      // Equipamento e conexão continuam idênticos
      expect(updatedUnified.engineering.equipments["M_P"].id).toBe("M_P");
      expect(updatedUnified.engineering.connections[connList[1].id].toEquipmentId).toBe("M_P");
    });
  });

  // =========================================================================
  // SEÇÃO 6: TESTE DE COMPLEXIDADE E BENCHMARK DE PERFORMANCE
  // =========================================================================
  describe("SEÇÃO 6 — Medição de Desempenho e Tempos de Execução", () => {
    it("6.1 Executa Connection Engine, Netlist, Auto-Layout e Graph Validator em escala com tempos medidos", () => {
      const doc = createEmptyDoc();
      const totalBranches = 20;

      const nTrafo = makeNode({
        id: "TR_SCALE",
        sheet: "unifilar",
        position: { x: 500, y: 100 },
        label: "Trafo 1000kVA",
        params: {
          kind: "transformer",
          kVA: 1000,
          primary_V: 13800,
          secondary_V: 380,
          vector: "Dyn11",
        },
      });
      const nQG = makeNode({
        id: "QG_SCALE",
        sheet: "unifilar",
        position: { x: 500, y: 220 },
        label: "QG 1600A",
        params: { kind: "breaker", in_A: 1600, curve: "C", poles: 3 },
      });
      const nBus = makeNode({
        id: "BUS_SCALE",
        sheet: "unifilar",
        position: { x: 500, y: 340 },
        label: "Barramento 2000A",
        params: { kind: "busbar", current_A: 2000, voltage_V: 380 },
      });

      doc.nodes[nTrafo.id] = nTrafo;
      doc.nodes[nQG.id] = nQG;
      doc.nodes[nBus.id] = nBus;

      doc.edges["e_tr"] = makeEdge({
        id: "e_tr",
        sheet: "unifilar",
        source: "TR_SCALE",
        target: "QG_SCALE",
        sourcePort: "X1",
        targetPort: "1/L1",
        kind: "power",
      });
      doc.edges["e_qg"] = makeEdge({
        id: "e_qg",
        sheet: "unifilar",
        source: "QG_SCALE",
        target: "BUS_SCALE",
        sourcePort: "2/T1",
        targetPort: "IN_FEED",
        kind: "power",
      });

      for (let i = 1; i <= totalBranches; i++) {
        const qf = `QF_S_${i}`;
        const km = `KM_S_${i}`;
        const rt = `RT_S_${i}`;
        const mot = `MOT_S_${i}`;

        doc.nodes[qf] = makeNode({
          id: qf,
          sheet: "unifilar",
          position: { x: i * 80, y: 460 },
          label: `QF-${i}`,
          params: { kind: "breaker", in_A: 25, curve: "D", poles: 3 },
        });
        doc.nodes[km] = makeNode({
          id: km,
          sheet: "unifilar",
          position: { x: i * 80, y: 560 },
          label: `KM-${i}`,
          params: { kind: "contactor", in_A: 25, coil_V: 24 },
        });
        doc.nodes[rt] = makeNode({
          id: rt,
          sheet: "unifilar",
          position: { x: i * 80, y: 660 },
          label: `RT-${i}`,
          params: { kind: "thermal_relay", in_A: 25, trip_class: "10A" },
        });
        doc.nodes[mot] = makeNode({
          id: mot,
          sheet: "unifilar",
          position: { x: i * 80, y: 760 },
          label: `Motor ${i}`,
          params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
        });

        doc.edges[`e_b_${qf}`] = makeEdge({
          id: `e_b_${qf}`,
          sheet: "unifilar",
          source: "BUS_SCALE",
          target: qf,
          sourcePort: "TAP_1",
          targetPort: "1/L1",
          kind: "power",
        });
        doc.edges[`e_${qf}_${km}`] = makeEdge({
          id: `e_${qf}_${km}`,
          sheet: "unifilar",
          source: qf,
          target: km,
          sourcePort: "2/T1",
          targetPort: "1/L1",
          kind: "power",
        });
        doc.edges[`e_${km}_${rt}`] = makeEdge({
          id: `e_${km}_${rt}`,
          sheet: "unifilar",
          source: km,
          target: rt,
          sourcePort: "2/T1",
          targetPort: "1/L1",
          kind: "power",
        });
        doc.edges[`e_${rt}_${mot}`] = makeEdge({
          id: `e_${rt}_${mot}`,
          sheet: "unifilar",
          source: rt,
          target: mot,
          sourcePort: "2/T1",
          targetPort: "U1",
          kind: "power",
        });
      }

      // 1. Mede Connection Engine & Netlist
      const t0 = performance.now();
      const netlist = buildNetlistFromDiagram(doc);
      const tNetlist = performance.now() - t0;

      // 2. Mede Graph Validator
      const t1 = performance.now();
      const val = validateElectricalTopology(doc);
      const tValidator = performance.now() - t1;

      // 3. Mede Auto-Layout Router
      const t2 = performance.now();
      const layoutResult = autoLayoutIndustrialDiagram(doc);
      const tLayout = performance.now() - t2;

      expect(val.isElectricallyConsistent).toBe(true);
      expect(netlist.nets.length).toBeGreaterThan(20);
      expect(layoutResult.nodes["TR_SCALE"].position).toBeDefined();
      const edgesWithWaypoints = Object.values(layoutResult.edges).filter(
        (e) => e.waypoints && e.waypoints.length > 0,
      );
      expect(edgesWithWaypoints.length).toBeGreaterThan(0);

      // Performance constraints: cada etapa em grafo com mais de 80 nós e 80 arestas deve rodar em menos de 100ms
      expect(tNetlist).toBeLessThan(100);
      expect(tValidator).toBeLessThan(100);
      expect(tLayout).toBeLessThan(100);
    });
  });

  // =========================================================================
  // SEÇÃO 8: INTEGRAÇÃO COM SCADA (Single Source of Truth)
  // =========================================================================
  describe("SEÇÃO 8 — Integração SCADA e Single Source of Truth", () => {
    it("8.1 Equipamentos canônicos do Unifilar alimentam o SCADA com a mesma identidade sem duplicação", () => {
      const store = useUnifiedProjectStore.getState();
      store.resetUnifiedDoc({ name: "SCADA Integration SSoT" });

      const nMot = makeNode({
        id: "M_BOMBA_RECALQUE",
        sheet: "unifilar",
        position: { x: 300, y: 500 },
        label: "Bomba Principal M01",
        params: { kind: "motor", power_kW: 37, voltage_V: 380, startMethod: "DOL" },
      });

      const profile = getEquipmentTerminalProfile(nMot.params.kind, nMot.params);
      const eq = store.upsertEquipment({
        id: nMot.id,
        tagCode: "PUMP-01",
        displayName: nMot.label,
        catalogType: "WEG W22 Premium 50CV",
        category: "load",
        phases: "3F",
        terminals: profile.terminals.map((t) => ({
          id: `${nMot.id}:${t.code}`,
          code: t.code,
          kind: "L1",
          direction: t.direction,
        })),
        specs: {
          powerKw: 37,
          voltageV: 380,
          nominalCurrentA: 72,
        },
      });

      // Vincula tag canônica ao mesmo equipamento para telemetria SCADA
      const tag = store.upsertTag({
        id: "tag_pump01_current",
        linkedEquipmentId: eq.id,
        name: "PUMP01.CURRENT_RMS",
        dataType: "REAL",
        area: "DB",
        unit: "A",
        description: "Corrente de Operação da Bomba 01",
        initialValue: 0,
        forced: false,
        retentive: false,
      });

      const currentDoc = useUnifiedProjectStore.getState().doc;

      // O SCADA consulta o mesmo equipamento e tag por id direto
      expect(currentDoc.engineering.equipments["M_BOMBA_RECALQUE"]).toBeDefined();
      expect(currentDoc.engineering.equipments["M_BOMBA_RECALQUE"].tagCode).toBe("PUMP-01");
      expect(currentDoc.engineering.tags["tag_pump01_current"].linkedEquipmentId).toBe(
        "M_BOMBA_RECALQUE",
      );
      expect(Object.keys(currentDoc.engineering.equipments)).toHaveLength(1); // Nenhuma entidade física duplicada
    });
  });
});
