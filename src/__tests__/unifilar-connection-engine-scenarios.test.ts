// UNIFILAR CONNECTION ENGINE — SCENARIOS A THROUGH J ACCEPTANCE TESTS
// Standards: IEC 60947, IEC 60617, IEC 60204-1, NBR 5410, NBR 14039

import { describe, it, expect } from "vitest";
import { createEmptyDoc, makeNode, makeEdge } from "@/lib/diagram/model";
import type { DiagramDoc, DiagramNode } from "@/lib/diagram/schema";
import {
  validateElectricalTopology,
  buildNetlistFromDiagram,
  repairDiagramConnections,
  autoLayoutIndustrialDiagram,
  getEquipmentTerminalProfile,
  resolveTerminalCode,
  connectBusbarToBranches,
} from "@/lib/diagram/connection";
import { buildMultifilarCommands } from "@/lib/diagram/multifilar";
import { createEmptyUnifiedDoc } from "@/lib/model/migration-v2-to-v3";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";

describe("UNIFILAR CONNECTION ENGINE — CENÁRIOS DE ENGENHARIA ELÉTRICA (A a J)", () => {
  // TESTE A — ALIMENTAÇÃO TRIFÁSICA
  it("CENÁRIO A — Alimentação Trifásica: Fonte -> Proteção Geral -> Barramento -> Disjuntores Derivados -> Cargas", () => {
    let doc = createEmptyDoc();

    const nTrafo = makeNode({
      id: "n_trafo",
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
    const nMainBreaker = makeNode({
      id: "n_qf_geral",
      sheet: "unifilar",
      position: { x: 400, y: 240 },
      label: "QF-GERAL 800A",
      params: { kind: "breaker", in_A: 800, curve: "C", poles: 3 },
    });
    const nBusbar = makeNode({
      id: "n_barramento",
      sheet: "unifilar",
      position: { x: 400, y: 380 },
      label: "BARRAMENTO PRINCIPAL QGBT 1000A",
      params: { kind: "busbar", current_A: 1000, voltage_V: 380 },
    });
    const nQf01 = makeNode({
      id: "n_qf01",
      sheet: "unifilar",
      position: { x: 250, y: 520 },
      label: "QF-01 40A",
      params: { kind: "breaker", in_A: 40, curve: "C", poles: 3 },
    });
    const nQf02 = makeNode({
      id: "n_qf02",
      sheet: "unifilar",
      position: { x: 550, y: 520 },
      label: "QF-02 63A",
      params: { kind: "breaker", in_A: 63, curve: "C", poles: 3 },
    });
    const nLoad01 = makeNode({
      id: "n_load01",
      sheet: "unifilar",
      position: { x: 250, y: 660 },
      label: "Carga 01 22kW",
      params: { kind: "load", power_W: 22000, voltage_V: 380, fp: 0.92 },
    });
    const nLoad02 = makeNode({
      id: "n_load02",
      sheet: "unifilar",
      position: { x: 550, y: 660 },
      label: "Carga 02 37kW",
      params: { kind: "load", power_W: 37000, voltage_V: 380, fp: 0.92 },
    });

    doc.nodes[nTrafo.id] = nTrafo;
    doc.nodes[nMainBreaker.id] = nMainBreaker;
    doc.nodes[nBusbar.id] = nBusbar;
    doc.nodes[nQf01.id] = nQf01;
    doc.nodes[nQf02.id] = nQf02;
    doc.nodes[nLoad01.id] = nLoad01;
    doc.nodes[nLoad02.id] = nLoad02;

    doc.edges["e_tr_qf"] = makeEdge({
      id: "e_tr_qf",
      sheet: "unifilar",
      source: nTrafo.id,
      target: nMainBreaker.id,
      sourcePort: "B",
      targetPort: "T",
      kind: "power",
    });
    doc.edges["e_qf_bus"] = makeEdge({
      id: "e_qf_bus",
      sheet: "unifilar",
      source: nMainBreaker.id,
      target: nBusbar.id,
      sourcePort: "B",
      targetPort: "T",
      kind: "power",
    });
    doc.edges["e_bus_qf1"] = makeEdge({
      id: "e_bus_qf1",
      sheet: "unifilar",
      source: nBusbar.id,
      target: nQf01.id,
      sourcePort: "B1",
      targetPort: "T",
      kind: "power",
    });
    doc.edges["e_bus_qf2"] = makeEdge({
      id: "e_bus_qf2",
      sheet: "unifilar",
      source: nBusbar.id,
      target: nQf02.id,
      sourcePort: "B2",
      targetPort: "T",
      kind: "power",
    });
    doc.edges["e_qf1_l1"] = makeEdge({
      id: "e_qf1_l1",
      sheet: "unifilar",
      source: nQf01.id,
      target: nLoad01.id,
      sourcePort: "B",
      targetPort: "T",
      kind: "power",
    });
    doc.edges["e_qf2_l2"] = makeEdge({
      id: "e_qf2_l2",
      sheet: "unifilar",
      source: nQf02.id,
      target: nLoad02.id,
      sourcePort: "B",
      targetPort: "T",
      kind: "power",
    });

    const validation = validateElectricalTopology(doc);
    expect(validation.status).toBe("COMPLETE");
    expect(validation.isElectricallyConsistent).toBe(true);
    expect(validation.disconnectedNodes).toHaveLength(0);
    expect(validation.missingConnections).toHaveLength(0);
    expect(validation.paths).toHaveLength(2);
    expect(validation.paths.every((p) => p.isComplete)).toBe(true);
  });

  // TESTE B — MOTOR COM PARTIDA DIRETA
  it("CENÁRIO B — Motor com Partida Direta: Alimentação -> QF01 -> Contator KM01 -> Relé Térmico RT01 -> Motor M01", () => {
    let doc = createEmptyDoc();

    const nQf = makeNode({
      id: "n_qf01",
      sheet: "unifilar",
      position: { x: 300, y: 100 },
      label: "QF-01 25A",
      params: { kind: "breaker", in_A: 25, curve: "D", poles: 3 },
    });
    const nKm = makeNode({
      id: "n_km01",
      sheet: "unifilar",
      position: { x: 300, y: 240 },
      label: "KM-01 25A",
      params: { kind: "contactor", in_A: 25, coil_V: 24 },
    });
    const nRt = makeNode({
      id: "n_rt01",
      sheet: "unifilar",
      position: { x: 300, y: 380 },
      label: "RT-01 18-25A",
      params: { kind: "thermal_relay", in_A: 25, trip_class: "10A" },
    });
    const nMot = makeNode({
      id: "n_mot01",
      sheet: "unifilar",
      position: { x: 300, y: 520 },
      label: "M-01 10CV / 7.5kW",
      params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
    });

    doc.nodes[nQf.id] = nQf;
    doc.nodes[nKm.id] = nKm;
    doc.nodes[nRt.id] = nRt;
    doc.nodes[nMot.id] = nMot;

    doc.edges["e_qf_km"] = makeEdge({
      id: "e_qf_km",
      sheet: "unifilar",
      source: nQf.id,
      target: nKm.id,
      sourcePort: "2/T1",
      targetPort: "1/L1",
      kind: "power",
    });
    doc.edges["e_km_rt"] = makeEdge({
      id: "e_km_rt",
      sheet: "unifilar",
      source: nKm.id,
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

    const netlist = buildNetlistFromDiagram(doc);
    expect(netlist.nets.length).toBeGreaterThanOrEqual(3);

    const validation = validateElectricalTopology(doc);
    expect(validation.isElectricallyConsistent).toBe(true);
    expect(validation.paths[0].isComplete).toBe(true);
    expect(validation.paths[0].equipmentIds).toEqual([nQf.id, nKm.id, nRt.id, nMot.id]);
  });

  // TESTE C — INVERSOR DE FREQUÊNCIA
  it("CENÁRIO C — Inversor de Frequência: Alimentação -> QF02 -> Inversor INV01 -> Motor M02", () => {
    let doc = createEmptyDoc();

    const nQf = makeNode({
      id: "n_qf02",
      sheet: "unifilar",
      position: { x: 300, y: 100 },
      label: "QF-02 50A",
      params: { kind: "breaker", in_A: 50, curve: "C", poles: 3 },
    });
    const nInv = makeNode({
      id: "n_inv01",
      sheet: "unifilar",
      position: { x: 300, y: 240 },
      label: "INV-01 22kW",
      params: { kind: "vfd", power_kW: 22, voltage_V: 380 },
    });
    const nMot = makeNode({
      id: "n_mot02",
      sheet: "unifilar",
      position: { x: 300, y: 380 },
      label: "M-02 22kW",
      params: { kind: "motor", power_kW: 22, voltage_V: 380, startMethod: "VFD" },
    });

    doc.nodes[nQf.id] = nQf;
    doc.nodes[nInv.id] = nInv;
    doc.nodes[nMot.id] = nMot;

    doc.edges["e_qf_inv"] = makeEdge({
      id: "e_qf_inv",
      sheet: "unifilar",
      source: nQf.id,
      target: nInv.id,
      sourcePort: "B",
      targetPort: "T",
      kind: "power",
    });
    doc.edges["e_inv_mot"] = makeEdge({
      id: "e_inv_mot",
      sheet: "unifilar",
      source: nInv.id,
      target: nMot.id,
      sourcePort: "B",
      targetPort: "T",
      kind: "power",
    });

    const validation = validateElectricalTopology(doc);
    expect(validation.status).toBe("COMPLETE");
    expect(validation.paths[0].isComplete).toBe(true);
    expect(validation.paths[0].equipmentIds).toEqual([nQf.id, nInv.id, nMot.id]);
  });

  // TESTE D — PARTIDA ESTRELA-TRIÂNGULO
  it("CENÁRIO D — Partida Estrela-Triângulo: Identifica terminais U1/V1/W1 e U2/V2/W2", () => {
    const profile = getEquipmentTerminalProfile("motor", {
      kind: "motor",
      power_kW: 30,
      voltage_V: 380,
      startMethod: "STAR_DELTA",
    });

    const terminalCodes = profile.terminals.map((t) => t.code);
    expect(terminalCodes).toContain("U1");
    expect(terminalCodes).toContain("V1");
    expect(terminalCodes).toContain("W1");
    expect(terminalCodes).toContain("U2");
    expect(terminalCodes).toContain("V2");
    expect(terminalCodes).toContain("W2");
    expect(terminalCodes).toContain("PE");
  });

  // TESTE E — DERIVAÇÕES MÚLTIPLAS EM BARRAMENTO (8 CIRCUITOS)
  it("CENÁRIO E — Derivações Múltiplas: Barramento principal conecta 8 circuitos derivados com derivações explícitas", () => {
    let doc = createEmptyDoc();

    const nBusbar = makeNode({
      id: "n_bus_main",
      sheet: "unifilar",
      position: { x: 500, y: 150 },
      label: "BARRAMENTO GERAL 1250A",
      params: { kind: "busbar", current_A: 1250, voltage_V: 380 },
    });
    doc.nodes[nBusbar.id] = nBusbar;

    const branchBreakers: DiagramNode[] = [];
    for (let i = 1; i <= 8; i++) {
      const brk = makeNode({
        id: `n_qf_${i}`,
        sheet: "unifilar",
        position: { x: 100 + i * 150, y: 300 },
        label: `QF-0${i} 32A`,
        params: { kind: "breaker", in_A: 32, curve: "C", poles: 3 },
      });
      doc.nodes[brk.id] = brk;
      branchBreakers.push(brk);
    }

    const tapEdges = connectBusbarToBranches(nBusbar, branchBreakers);
    expect(tapEdges).toHaveLength(8);

    for (const e of tapEdges) {
      doc.edges[e.id] = e;
    }

    // Every branch breaker must have an explicit edge from the busbar
    const inEdgesPerBreaker = branchBreakers.map(
      (b) => Object.values(doc.edges).filter((e) => e.target === b.id).length,
    );
    expect(inEdgesPerBreaker.every((count) => count === 1)).toBe(true);
  });

  // TESTE F — CIRCUITO INCOMPLETO
  it("CENÁRIO F — Circuito Incompleto: Remoção de conexão bloqueia status COMPLETE e aponta nó exato", () => {
    let doc = createEmptyDoc();

    const nQf = makeNode({
      id: "n_qf01",
      sheet: "unifilar",
      position: { x: 300, y: 100 },
      label: "QF-01",
      params: { kind: "breaker", in_A: 25, curve: "C", poles: 3 },
    });
    const nMot = makeNode({
      id: "n_mot01",
      sheet: "unifilar",
      position: { x: 300, y: 300 },
      label: "M-01",
      params: { kind: "motor", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
    });

    doc.nodes[nQf.id] = nQf;
    doc.nodes[nMot.id] = nMot;
    // Sem aresta entre QF e Motor!

    const validation = validateElectricalTopology(doc);
    expect(validation.status).not.toBe("COMPLETE");
    expect(validation.isElectricallyConsistent).toBe(false);
    expect(validation.disconnectedNodes.map((n) => n.nodeId)).toContain("n_mot01");
    expect(validation.missingConnections.some((m) => m.equipmentId === "n_mot01")).toBe(true);
  });

  // TESTE G — TERMINAL INVÁLIDO
  it("CENÁRIO G — Terminal Inválido: Detecta e sinaliza aresta para nós órfãos ou auto-laço", () => {
    let doc = createEmptyDoc();

    const nQf = makeNode({
      id: "n_qf01",
      sheet: "unifilar",
      position: { x: 300, y: 100 },
      label: "QF-01",
      params: { kind: "breaker", in_A: 25, curve: "C", poles: 3 },
    });
    doc.nodes[nQf.id] = nQf;

    // Aresta apontando para nó inexistente "n_fantasma"
    doc.edges["e_invalida"] = makeEdge({
      id: "e_invalida",
      sheet: "unifilar",
      source: nQf.id,
      target: "n_fantasma",
      kind: "power",
    });

    const validation = validateElectricalTopology(doc);
    expect(validation.invalidConnections).toHaveLength(1);
    expect(validation.invalidConnections[0].edgeId).toBe("e_invalida");
    expect(validation.status).toBe("INVALID");
  });

  // TESTE H — CRUZAMENTO DE CONDUTORES
  it("CENÁRIO H — Cruzamento de Condutores: Linhas visuais sem junção explícita não criam netlist em comum", () => {
    let doc = createEmptyDoc();

    // Circuito 1: nA1 -> nB1
    const nA1 = makeNode({
      id: "nA1",
      sheet: "unifilar",
      position: { x: 100, y: 100 },
      label: "A1",
      params: { kind: "breaker", in_A: 20, curve: "C", poles: 1 },
    });
    const nB1 = makeNode({
      id: "nB1",
      sheet: "unifilar",
      position: { x: 300, y: 300 },
      label: "B1",
      params: { kind: "load", power_W: 1000, voltage_V: 220, fp: 0.92 },
    });

    // Circuito 2: nA2 -> nB2 (cruzando geometricamente o Circuito 1)
    const nA2 = makeNode({
      id: "nA2",
      sheet: "unifilar",
      position: { x: 100, y: 300 },
      label: "A2",
      params: { kind: "breaker", in_A: 20, curve: "C", poles: 1 },
    });
    const nB2 = makeNode({
      id: "nB2",
      sheet: "unifilar",
      position: { x: 300, y: 100 },
      label: "B2",
      params: { kind: "load", power_W: 1000, voltage_V: 220, fp: 0.92 },
    });

    doc.nodes[nA1.id] = nA1;
    doc.nodes[nB1.id] = nB1;
    doc.nodes[nA2.id] = nA2;
    doc.nodes[nB2.id] = nB2;

    doc.edges["e_1"] = makeEdge({
      id: "e_1",
      sheet: "unifilar",
      source: "nA1",
      target: "nB1",
      kind: "power",
    });
    doc.edges["e_2"] = makeEdge({
      id: "e_2",
      sheet: "unifilar",
      source: "nA2",
      target: "nB2",
      kind: "power",
    });

    const netlist = buildNetlistFromDiagram(doc);
    // Deve haver 2 redes elétricas totalmente independentes, sem curto entre elas
    expect(netlist.nets).toHaveLength(2);
    const net1Members = netlist.nets[0].members.map((m) => m.equipmentId);
    const net2Members = netlist.nets[1].members.map((m) => m.equipmentId);

    expect(net1Members).not.toEqual(expect.arrayContaining(["nA2", "nB2"]));
    expect(net2Members).not.toEqual(expect.arrayContaining(["nA1", "nB1"]));
  });

  // TESTE I — PERSISTÊNCIA CANÔNICA
  it("CENÁRIO I — Persistência: Diagrama converte para conexões canônicas estáveis no UnifiedProjectStore", () => {
    let doc = createEmptyDoc();

    const nQf = makeNode({
      id: "n_qf",
      sheet: "unifilar",
      position: { x: 200, y: 100 },
      label: "QF-01",
      params: { kind: "breaker", in_A: 32, curve: "C", poles: 3 },
    });
    const nMot = makeNode({
      id: "n_mot",
      sheet: "unifilar",
      position: { x: 200, y: 250 },
      label: "M-01",
      params: { kind: "motor", power_kW: 15, voltage_V: 380, startMethod: "DOL" },
    });

    doc.nodes[nQf.id] = nQf;
    doc.nodes[nMot.id] = nMot;
    doc.edges["e_qf_mot"] = makeEdge({
      id: "e_qf_mot",
      sheet: "unifilar",
      source: "n_qf",
      target: "n_mot",
      sourcePort: "2/T1",
      targetPort: "U1",
      kind: "power",
    });

    useUnifiedProjectStore.getState().ingestDiagramDocChange(doc);
    const unifiedState = useUnifiedProjectStore.getState().doc;

    const connection = unifiedState.engineering.connections["e_qf_mot"];
    expect(connection).toBeDefined();
    expect(connection.fromEquipmentId).toBe("n_qf");
    expect(connection.fromTerminalId).toBe("n_qf:2/T1");
    expect(connection.toEquipmentId).toBe("n_mot");
    expect(connection.toTerminalId).toBe("n_mot:U1");
  });

  // TESTE J — CONVERSÃO UNIFILAR / MULTIFILAR
  it("CENÁRIO J — Conversão Unifilar/Multifilar: Preserva a mesma topologia e correspondência biunívoca", () => {
    let doc = createEmptyDoc();

    const nQf = makeNode({
      id: "n_qf",
      sheet: "unifilar",
      position: { x: 200, y: 100 },
      label: "QF-01",
      params: { kind: "breaker", in_A: 32, curve: "C", poles: 3 },
    });
    const nMot = makeNode({
      id: "n_mot",
      sheet: "unifilar",
      position: { x: 200, y: 250 },
      label: "M-01",
      params: { kind: "motor", power_kW: 15, voltage_V: 380, startMethod: "DOL" },
    });

    doc.nodes[nQf.id] = nQf;
    doc.nodes[nMot.id] = nMot;
    doc.edges["e_qf_mot"] = makeEdge({
      id: "e_qf_mot",
      sheet: "unifilar",
      source: "n_qf",
      target: "n_mot",
      sourcePort: "2/T1",
      targetPort: "U1",
      kind: "power",
      circuitConfig: "3F+N+PE",
    });

    const mfCommands = buildMultifilarCommands(doc);
    expect(mfCommands.length).toBeGreaterThanOrEqual(3); // 2 AddNode + 1 AddEdge

    const nodeAddCmds = mfCommands.filter((c) => c.type === "AddNode");
    const edgeAddCmds = mfCommands.filter((c) => c.type === "AddEdge");

    expect(nodeAddCmds).toHaveLength(2);
    expect(edgeAddCmds).toHaveLength(1);
    expect((edgeAddCmds[0] as any).edge.circuitConfig).toBe("3F+N+PE");
  });
});
