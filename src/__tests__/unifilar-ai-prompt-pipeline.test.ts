// UNIFILAR AI PROMPT PIPELINE & REPAIR ENGINE ACCEPTANCE TESTS
// Tests the exact QGBT + Busbar + 3 branches (DOL Motor, VFD Motor, Command PSU) topology
// Standards: IEC 60947, IEC 60617, IEC 60204-1, NBR 5410

import { describe, it, expect } from "vitest";
import { createEmptyDoc, makeNode, makeEdge } from "@/lib/diagram/model";
import type { DiagramDoc } from "@/lib/diagram/schema";
import {
  repairDiagramConnections,
  autoLayoutIndustrialDiagram,
  validateElectricalTopology,
  buildNetlistFromDiagram,
} from "@/lib/diagram/connection";

describe("UNIFILAR AI PROMPT PIPELINE — TOPOLOGIA INDUSTRIAL MESTRE (QGBT)", () => {
  it("Valida e repara o cenário industrial mestre (QGBT -> Barramento -> 3 Ramais)", () => {
    // Simulando o resultado gerado pela IA onde os nós foram criados, mas as conexões vieram ausentes ou parciais
    const doc = createEmptyDoc();

    const nQfGeral = makeNode({
      id: "n_qf_geral",
      sheet: "unifilar",
      position: { x: 400, y: 100 },
      label: "Disjuntor Geral QGBT 250A",
      params: { kind: "breaker", in_A: 250, curve: "C", poles: 3 },
    });
    const nBusbar = makeNode({
      id: "n_barramento_principal",
      sheet: "unifilar",
      position: { x: 400, y: 220 },
      label: "Barramento Principal 400A",
      params: { kind: "busbar", current_A: 400, voltage_V: 380 },
    });

    // Ramal 1: QF01 -> KM01 -> RT01 -> Motor M01 (Partida Direta)
    const nQf01 = makeNode({
      id: "n_qf01",
      sheet: "unifilar",
      position: { x: 200, y: 340 },
      label: "Disjuntor QF01 32A",
      params: { kind: "breaker", in_A: 32, curve: "D", poles: 3 },
    });
    const nKm01 = makeNode({
      id: "n_km01",
      sheet: "unifilar",
      position: { x: 200, y: 460 },
      label: "Contator KM01",
      params: { kind: "contactor", in_A: 32, coil_V: 24 },
    });
    const nRt01 = makeNode({
      id: "n_rt01",
      sheet: "unifilar",
      position: { x: 200, y: 580 },
      label: "Relé Térmico RT01",
      params: { kind: "thermal_relay", in_A: 32, trip_class: "10A" },
    });
    const nM01 = makeNode({
      id: "n_m01",
      sheet: "unifilar",
      position: { x: 200, y: 700 },
      label: "Motor M01 15kW",
      params: { kind: "motor", power_kW: 15, voltage_V: 380, startMethod: "DOL" },
    });

    // Ramal 2: QF02 -> Inversor INV01 -> Motor M02 (VFD)
    const nQf02 = makeNode({
      id: "n_qf02",
      sheet: "unifilar",
      position: { x: 460, y: 340 },
      label: "Disjuntor QF02 50A",
      params: { kind: "breaker", in_A: 50, curve: "C", poles: 3 },
    });
    const nInv01 = makeNode({
      id: "n_inv01",
      sheet: "unifilar",
      position: { x: 460, y: 460 },
      label: "Inversor INV01 22kW",
      params: { kind: "vfd", power_kW: 22, voltage_V: 380 },
    });
    const nM02 = makeNode({
      id: "n_m02",
      sheet: "unifilar",
      position: { x: 460, y: 580 },
      label: "Motor M02 22kW",
      params: { kind: "motor", power_kW: 22, voltage_V: 380, startMethod: "VFD" },
    });

    // Ramal 3: QF03 -> Fonte de comando PSU
    const nQf03 = makeNode({
      id: "n_qf03",
      sheet: "unifilar",
      position: { x: 720, y: 340 },
      label: "Disjuntor QF03 10A",
      params: { kind: "breaker", in_A: 10, curve: "C", poles: 2 },
    });
    const nPsu = makeNode({
      id: "n_psu01",
      sheet: "unifilar",
      position: { x: 720, y: 460 },
      label: "Fonte de Comando 24Vcc",
      params: { kind: "psu", output_V: 24, output_A: 10 },
    });

    // Adiciona todos os nós
    const allNodes = [
      nQfGeral,
      nBusbar,
      nQf01,
      nKm01,
      nRt01,
      nM01,
      nQf02,
      nInv01,
      nM02,
      nQf03,
      nPsu,
    ];
    for (const n of allNodes) {
      doc.nodes[n.id] = n;
    }

    // Antes da reparação: 0 conexões! Topologia inválida/incompleta
    const preValidation = validateElectricalTopology(doc);
    expect(preValidation.status).not.toBe("COMPLETE");
    expect(preValidation.disconnectedNodes.length).toBe(allNodes.length);

    // Executa a Reparação Determinística de Conexões
    const repairResult = repairDiagramConnections(doc);
    expect(repairResult.repairedCount).toBeGreaterThanOrEqual(8);
    expect(repairResult.remainingIssues).toHaveLength(0);

    let repairedDoc = repairResult.repairedDoc;

    // Executa Auto-Layout e Roteamento Ortogonal
    repairedDoc = autoLayoutIndustrialDiagram(repairedDoc);

    // Validação Pós-Reparação
    const postValidation = validateElectricalTopology(repairedDoc);
    expect(postValidation.status).toBe("COMPLETE");
    expect(postValidation.isElectricallyConsistent).toBe(true);
    expect(postValidation.disconnectedNodes).toHaveLength(0);
    expect(postValidation.missingConnections).toHaveLength(0);

    // Verifica caminhos completos até as cargas
    expect(postValidation.paths.length).toBeGreaterThanOrEqual(2);
    expect(postValidation.paths.every((p) => p.isComplete)).toBe(true);

    // Verifica que o caminho do Motor M01 possui: QF_GERAL -> BARRAMENTO -> QF01 -> KM01 -> RT01 -> M01
    const m01Path = postValidation.paths.find((p) => p.loadEquipmentId === nM01.id);
    expect(m01Path).toBeDefined();
    expect(m01Path?.isComplete).toBe(true);
    expect(m01Path?.equipmentIds).toContain(nQfGeral.id);
    expect(m01Path?.equipmentIds).toContain(nBusbar.id);
    expect(m01Path?.equipmentIds).toContain(nQf01.id);
    expect(m01Path?.equipmentIds).toContain(nKm01.id);
    expect(m01Path?.equipmentIds).toContain(nRt01.id);
    expect(m01Path?.equipmentIds).toContain(nM01.id);

    // Verifica que o caminho do Motor M02 possui: QF_GERAL -> BARRAMENTO -> QF02 -> INV01 -> M02
    const m02Path = postValidation.paths.find((p) => p.loadEquipmentId === nM02.id);
    expect(m02Path).toBeDefined();
    expect(m02Path?.isComplete).toBe(true);
    expect(m02Path?.equipmentIds).toContain(nQfGeral.id);
    expect(m02Path?.equipmentIds).toContain(nBusbar.id);
    expect(m02Path?.equipmentIds).toContain(nQf02.id);
    expect(m02Path?.equipmentIds).toContain(nInv01.id);
    expect(m02Path?.equipmentIds).toContain(nM02.id);

    // Verifica que a fonte de comando PSU está conectada ao QF03
    const hasPsuEdge = Object.values(repairedDoc.edges).some(
      (e) => e.source === nQf03.id && e.target === nPsu.id,
    );
    expect(hasPsuEdge).toBe(true);

    // Verifica Netlist canônica
    const netlist = buildNetlistFromDiagram(repairedDoc);
    expect(netlist.nets.length).toBeGreaterThanOrEqual(5);
  });
});
