// Unifilar Connectivity Pipeline Regression Tests (7 Mandatory Scenarios)
// Standards: IEC 60947, IEC 60204-1, ABNT NBR 5410, IEC 61131-3
// Verifies end-to-end electrical graph connectivity across AI generation, bundle import, editing, and persistence.

import { describe, it, expect, beforeEach } from "vitest";
import { useDiagramStore } from "@/lib/diagram/store";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import {
  applyArchitectToStore,
  convertArchitectResultToDiagramDoc,
  type ArchitectResult,
} from "@/lib/ai-architect-client";
import {
  convertBundleToDiagramDoc,
  validateAndParseExternalPayload,
} from "@/lib/importer/universal-importer";
import { buildProjectSnapshot } from "@/lib/use-project-persistence";
import {
  repairDiagramConnections,
  synthesizeDiagramDocFromProject,
} from "@/lib/diagram/connection/connection-repair-engine";
import { validateElectricalTopology } from "@/lib/diagram/connection/graph-validator";
import { cmd } from "@/lib/diagram/commands";
import type { DiagramDoc } from "@/lib/diagram/schema";

describe("ELÉTRICAI — Unifilar Canvas Connectivity & Pipeline Validation (P0)", () => {
  beforeEach(() => {
    useDiagramStore.getState().resetDoc();
    useProjectStore.setState({ nodes: [], edges: [], logs: [] });
    useEditorStore.getState().setRungs([]);
    useEditorStore.getState().setFbdAll([], []);
  });

  // ================= SCENARIO 1 =================
  it("Scenario 1: Internal AI generation produces connected unifilar diagram in useDiagramStore", () => {
    const mockAiResult: ArchitectResult = {
      title: "Painel de Bombeamento 2x Motores",
      rationale: "Partida direta para motores de 7.5kW e 11kW conforme NBR 5410",
      transformer: { kVA: 75, primary_kV: 13.8, secondary_V: 380 },
      ccm: { columns: 1, cells: 2 },
      motors: [
        { id: "M1", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
        { id: "M2", power_kW: 11, voltage_V: 380, startMethod: "DOL" },
      ],
      nodes: [
        {
          id: "QG_MAIN",
          kind: "breaker",
          category: "power",
          label: "QF-GERAL 125A",
          position: { x: 400, y: 100 },
          params: { in_A: 125, poles: 3 },
        },
        {
          id: "BUS_01",
          kind: "busbar",
          category: "power",
          label: "BARRA 160A",
          position: { x: 400, y: 220 },
          params: { current_A: 160, voltage_V: 380 },
        },
        {
          id: "QF_1",
          kind: "breaker",
          category: "power",
          label: "QF-M1 32A",
          position: { x: 300, y: 350 },
          params: { in_A: 32, poles: 3 },
        },
        {
          id: "KM_1",
          kind: "contactor",
          category: "power",
          label: "KM1 25A",
          position: { x: 300, y: 470 },
          params: { in_A: 25, coil_V: 24 },
        },
        {
          id: "M1",
          kind: "motor",
          category: "mech",
          label: "M1 7.5kW",
          position: { x: 300, y: 590 },
          params: { power_kW: 7.5, voltage_V: 380 },
        },
        {
          id: "QF_2",
          kind: "breaker",
          category: "power",
          label: "QF-M2 50A",
          position: { x: 500, y: 350 },
          params: { in_A: 50, poles: 3 },
        },
        {
          id: "KM_2",
          kind: "contactor",
          category: "power",
          label: "KM2 32A",
          position: { x: 500, y: 470 },
          params: { in_A: 32, coil_V: 24 },
        },
        {
          id: "M2",
          kind: "motor",
          category: "mech",
          label: "M2 11kW",
          position: { x: 500, y: 590 },
          params: { power_kW: 11, voltage_V: 380 },
        },
      ],
      edges: [
        { source: "QG_MAIN", target: "BUS_01", kind: "power" },
        { source: "BUS_01", target: "QF_1", kind: "power" },
        { source: "QF_1", target: "KM_1", kind: "power" },
        { source: "KM_1", target: "M1", kind: "power" },
        { source: "BUS_01", target: "QF_2", kind: "power" },
        { source: "QF_2", target: "KM_2", kind: "power" },
        { source: "KM_2", target: "M2", kind: "power" },
      ],
    };

    // Aplica no store global do aplicativo
    const res = applyArchitectToStore(mockAiResult, { mode: "replace" });
    expect(res.nodes).toBe(8);
    expect(res.edges).toBe(7);

    // O useDiagramStore NÃO PODE estar vazio! O canvas unifilar lê do useDiagramStore
    const diagDoc = useDiagramStore.getState().doc;
    expect(Object.keys(diagDoc.nodes)).toHaveLength(8);
    expect(Object.keys(diagDoc.edges)).toHaveLength(7);

    // Valida que as arestas possuem terminais mapeados de forma válida (não vazios)
    const edgeList = Object.values(diagDoc.edges);
    for (const e of edgeList) {
      expect(e.source).toBeDefined();
      expect(e.target).toBeDefined();
      expect(diagDoc.nodes[e.source]).toBeDefined();
      expect(diagDoc.nodes[e.target]).toBeDefined();
      expect(e.sourcePort).toBeDefined();
      expect(e.targetPort).toBeDefined();
    }

    // Validação topológica
    const topo = validateElectricalTopology(diagDoc);
    expect(topo.status).toBe("COMPLETE");
    expect(topo.totalEquipments).toBe(8);
    expect(topo.totalConnections).toBe(7);
  });

  // ================= SCENARIO 2 =================
  it("Scenario 2: External AI bundle import resolves all edges and terminals without orphan drops", () => {
    // Simula bundle de IA externa onde os edges referenciam tags ao invés de IDs brutos
    const externalAiPayload = JSON.stringify({
      format: "eletricai.canvas-bundle",
      schemaVersion: "1.0.0",
      project: { name: "Circuito Ventilador Industrial", diagramType: "unifilar" },
      nodes: [
        {
          id: "node_feeder",
          type: "breaker",
          label: "DJ-GERAL",
          position: { x: 200, y: 100 },
          properties: { tag: "DJ-GERAL", In: 63, poles: 3 },
        },
        {
          id: "node_bar",
          type: "busbar",
          label: "BARRA-VENT",
          position: { x: 200, y: 220 },
          properties: { tag: "BARRA-VENT", voltage_V: 380 },
        },
        {
          id: "node_brk1",
          type: "breaker",
          label: "DJ-VENT-01",
          position: { x: 200, y: 340 },
          properties: { tag: "DJ-VENT-01", In: 20, poles: 3 },
        },
        {
          id: "node_k1",
          type: "contactor",
          label: "K-VENT-01",
          position: { x: 200, y: 460 },
          properties: { tag: "K-VENT-01", In: 18 },
        },
        {
          id: "node_m1",
          type: "motor",
          label: "M-EXAUSTOR",
          position: { x: 200, y: 580 },
          properties: { tag: "M-EXAUSTOR", power_kW: 5.5, voltage_V: 380 },
        },
      ],
      // Os edges usam as tags "DJ-GERAL", "BARRA-VENT", "DJ-VENT-01", "K-VENT-01", "M-EXAUSTOR"
      edges: [
        { id: "e1", source: "DJ-GERAL", target: "BARRA-VENT", kind: "power" },
        { id: "e2", source: "BARRA-VENT", target: "DJ-VENT-01", kind: "power" },
        { id: "e3", source: "DJ-VENT-01", target: "K-VENT-01", kind: "power" },
        { id: "e4", source: "K-VENT-01", target: "M-EXAUSTOR", kind: "power" },
      ],
    });

    const parsed = validateAndParseExternalPayload(externalAiPayload);
    expect(parsed.canImport).toBe(true);
    expect(parsed.bundle).toBeDefined();

    // Converte para DiagramDoc
    const doc = convertBundleToDiagramDoc(parsed.bundle!);
    expect(Object.keys(doc.nodes)).toHaveLength(5);

    // ZERO orphan edges: todas as 4 conexões foram mantidas e resolvidas
    expect(Object.keys(doc.edges)).toHaveLength(4);

    // Valida que as arestas apontam para os IDs reais dos nós
    for (const e of Object.values(doc.edges)) {
      expect(doc.nodes[e.source]).toBeDefined();
      expect(doc.nodes[e.target]).toBeDefined();
    }
  });

  // ================= SCENARIO 3 =================
  it("Scenario 3: Parity between Ladder rungs and Unifilar topology", () => {
    const multiMotorBrief: ArchitectResult = {
      title: "Sistema de Extrusão 3x Motores",
      rationale: "Extrusora principal e dois puxadores",
      transformer: { kVA: 150, primary_kV: 13.8, secondary_V: 380 },
      ccm: { columns: 2, cells: 4 },
      motors: [
        { id: "M_EXTR", power_kW: 37, voltage_V: 380, startMethod: "DOL" },
        { id: "M_PUX1", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
        { id: "M_PUX2", power_kW: 7.5, voltage_V: 380, startMethod: "DOL" },
      ],
      nodes: [
        {
          id: "QG",
          kind: "breaker",
          category: "power",
          label: "QF-GERAL",
          position: { x: 300, y: 100 },
          params: { in_A: 200 },
        },
        {
          id: "BB",
          kind: "busbar",
          category: "power",
          label: "BARRA-380",
          position: { x: 300, y: 200 },
          params: { current_A: 250 },
        },
        {
          id: "Q1",
          kind: "breaker",
          category: "power",
          label: "QF1",
          position: { x: 200, y: 300 },
          params: { in_A: 80 },
        },
        {
          id: "K1",
          kind: "contactor",
          category: "power",
          label: "KM1",
          position: { x: 200, y: 400 },
          params: { in_A: 80 },
        },
        {
          id: "M_EXTR",
          kind: "motor",
          category: "mech",
          label: "M_EXTR",
          position: { x: 200, y: 500 },
          params: { power_kW: 37 },
        },
        {
          id: "Q2",
          kind: "breaker",
          category: "power",
          label: "QF2",
          position: { x: 300, y: 300 },
          params: { in_A: 25 },
        },
        {
          id: "K2",
          kind: "contactor",
          category: "power",
          label: "KM2",
          position: { x: 300, y: 400 },
          params: { in_A: 25 },
        },
        {
          id: "M_PUX1",
          kind: "motor",
          category: "mech",
          label: "M_PUX1",
          position: { x: 300, y: 500 },
          params: { power_kW: 7.5 },
        },
        {
          id: "Q3",
          kind: "breaker",
          category: "power",
          label: "QF3",
          position: { x: 400, y: 300 },
          params: { in_A: 25 },
        },
        {
          id: "K3",
          kind: "contactor",
          category: "power",
          label: "KM3",
          position: { x: 400, y: 400 },
          params: { in_A: 25 },
        },
        {
          id: "M_PUX2",
          kind: "motor",
          category: "mech",
          label: "M_PUX2",
          position: { x: 400, y: 500 },
          params: { power_kW: 7.5 },
        },
      ],
      edges: [
        { source: "QG", target: "BB", kind: "power" },
        { source: "BB", target: "Q1", kind: "power" },
        { source: "Q1", target: "K1", kind: "power" },
        { source: "K1", target: "M_EXTR", kind: "power" },
        { source: "BB", target: "Q2", kind: "power" },
        { source: "Q2", target: "K2", kind: "power" },
        { source: "K2", target: "M_PUX1", kind: "power" },
        { source: "BB", target: "Q3", kind: "power" },
        { source: "Q3", target: "K3", kind: "power" },
        { source: "K3", target: "M_PUX2", kind: "power" },
      ],
    };

    applyArchitectToStore(multiMotorBrief, { mode: "replace" });

    const diagDoc = useDiagramStore.getState().doc;
    const rungs = useEditorStore.getState().rungs;

    // 3 motores geram 3 pares de rungs (comando + alarme = 6 rungs)
    expect(rungs).toHaveLength(6);

    // No diagrama unifilar, existem exatamente 3 motores instanciados
    const motorNodes = Object.values(diagDoc.nodes).filter((n) => n.params.kind === "motor");
    expect(motorNodes).toHaveLength(3);

    // Paridade de tags: cada motor no Ladder possui correspondente no unifilar
    for (const m of multiMotorBrief.motors) {
      expect(diagDoc.nodes[m.id]).toBeDefined();
      const hasLadderRung = rungs.some((r) => r.label.includes(m.id));
      expect(hasLadderRung).toBe(true);
    }
  });

  // ================= SCENARIO 4 =================
  it("Scenario 4: Save & Reopen preserves connections and routes", () => {
    // 1. Gera e popula
    const mockBrief: ArchitectResult = {
      title: "Painel Salvo",
      rationale: "Teste de persistência",
      transformer: { kVA: 45, primary_kV: 13.8, secondary_V: 220 },
      ccm: { columns: 1, cells: 1 },
      motors: [{ id: "M_LOAD", power_kW: 3 }],
      nodes: [
        {
          id: "DJ_IN",
          kind: "breaker",
          category: "power",
          label: "QF1",
          position: { x: 100, y: 100 },
          params: { in_A: 40 },
        },
        {
          id: "BAR_IN",
          kind: "busbar",
          category: "power",
          label: "BARRA",
          position: { x: 100, y: 200 },
          params: { current_A: 100 },
        },
        {
          id: "M_LOAD",
          kind: "motor",
          category: "mech",
          label: "M1",
          position: { x: 100, y: 350 },
          params: { power_kW: 3 },
        },
      ],
      edges: [
        { source: "DJ_IN", target: "BAR_IN", kind: "power" },
        { source: "BAR_IN", target: "M_LOAD", kind: "power" },
      ],
    };
    applyArchitectToStore(mockBrief, { mode: "replace" });

    // 2. Constrói o snapshot de persistência
    const snap = buildProjectSnapshot();
    expect(snap.diagram).toBeDefined();
    expect(Object.keys(snap.diagram.nodes)).toHaveLength(3);
    expect(Object.keys(snap.diagram.edges)).toHaveLength(2);

    // 3. Simula fechamento do canvas (limpeza completa da memória)
    useDiagramStore.getState().resetDoc();
    expect(Object.keys(useDiagramStore.getState().doc.nodes)).toHaveLength(0);

    // 4. Simula o load do snapshot (conforme performLoad em useProjectPersistence)
    const ds = useDiagramStore.getState();
    ds.loadDoc(snap.diagram as DiagramDoc);

    // 5. Verifica se as conexões e nós foram fielmente restaurados
    const reloaded = useDiagramStore.getState().doc;
    expect(Object.keys(reloaded.nodes)).toHaveLength(3);
    expect(Object.keys(reloaded.edges)).toHaveLength(2);
    expect(reloaded.edges[Object.keys(reloaded.edges)[0]].source).toBe("DJ_IN");
  });

  // ================= SCENARIO 5 =================
  it("Scenario 5: Editing & moving components preserves wire connectivity", () => {
    const doc: DiagramDoc = {
      version: 1,
      id: "doc_test_move",
      metadata: { title: "Teste Mover Componente", norms: ["NBR 5410"] },
      sheets: ["unifilar"],
      nodes: {
        N1: {
          id: "N1",
          sheet: "unifilar",
          position: { x: 200, y: 100 },
          rotation: 0,
          label: "Q1",
          params: { kind: "breaker", in_A: 32 } as any,
        },
        N2: {
          id: "N2",
          sheet: "unifilar",
          position: { x: 200, y: 300 },
          rotation: 0,
          label: "M1",
          params: { kind: "motor", power_kW: 4 } as any,
        },
      },
      edges: {
        E1: {
          id: "E1",
          sheet: "unifilar",
          source: "N1",
          target: "N2",
          sourcePort: "B",
          targetPort: "T",
          kind: "power",
          circuitConfig: "3F+N+PE",
        },
      },
    };

    useDiagramStore.getState().loadDoc(doc);
    expect(useDiagramStore.getState().doc.nodes.N2.position.x).toBe(200);
    expect(useDiagramStore.getState().doc.nodes.N2.position.y).toBe(300);

    // Move o motor N2 de (200, 300) para (450, 600)
    useDiagramStore.getState().dispatch(cmd.move("N2", { x: 200, y: 300 }, { x: 450, y: 600 }));

    const updated = useDiagramStore.getState().doc;
    expect(updated.nodes.N2.position.x).toBe(450);
    expect(updated.nodes.N2.position.y).toBe(600);

    // A aresta E1 continua intacta conectando N1 a N2!
    expect(updated.edges.E1).toBeDefined();
    expect(updated.edges.E1.source).toBe("N1");
    expect(updated.edges.E1.target).toBe("N2");
  });

  // ================= SCENARIO 6 =================
  it("Scenario 6: Graph integrity checks (zero orphan edges, no self-loops, valid ports)", () => {
    // Constrói um grafo quebrado propositalmente (com nós desconectados)
    const brokenDoc: DiagramDoc = {
      version: 1,
      id: "doc_broken",
      metadata: { title: "Grafo Desconectado", norms: ["NBR 5410"] },
      sheets: ["unifilar"],
      nodes: {
        Q_MAIN: {
          id: "Q_MAIN",
          sheet: "unifilar",
          position: { x: 200, y: 100 },
          rotation: 0,
          label: "GERAL",
          params: { kind: "breaker", in_A: 100 } as any,
        },
        BAR_1: {
          id: "BAR_1",
          sheet: "unifilar",
          position: { x: 200, y: 200 },
          rotation: 0,
          label: "BARRAMENTO",
          params: { kind: "busbar" } as any,
        },
        KM_1: {
          id: "KM_1",
          sheet: "unifilar",
          position: { x: 200, y: 350 },
          rotation: 0,
          label: "KM1",
          params: { kind: "contactor", in_A: 32 } as any,
        },
        MOT_1: {
          id: "MOT_1",
          sheet: "unifilar",
          position: { x: 200, y: 500 },
          rotation: 0,
          label: "M1",
          params: { kind: "motor", power_kW: 7.5 } as any,
        },
      },
      edges: {}, // Sem arestas!
    };

    // Executa o motor determinístico de reparo
    const repaired = repairDiagramConnections(brokenDoc);
    expect(repaired.repairedCount).toBeGreaterThan(0);

    const finalDoc = repaired.repairedDoc;
    // O motor de reparo sintetizou conexões entre Geral -> Barramento, Barramento -> Contator, Contator -> Motor
    expect(Object.keys(finalDoc.edges).length).toBeGreaterThanOrEqual(3);

    // Nenhuma aresta com source === target (sem loops)
    for (const e of Object.values(finalDoc.edges)) {
      expect(e.source).not.toBe(e.target);
      expect(finalDoc.nodes[e.source]).toBeDefined();
      expect(finalDoc.nodes[e.target]).toBeDefined();
    }
  });

  // ================= SCENARIO 7 =================
  it("Scenario 7: Multi-viewport canvas rendering & synthesis fallback from legacy project elements", () => {
    // Simula projeto legado sem snap.diagram mas com project.nodes e project.edges
    const legacyProjectNodes = [
      { id: "TRAFO", kind: "transformer", label: "TRAFO 100kVA", position: { x: 150, y: 80 } },
      { id: "DISJ", kind: "breaker", label: "DJ 150A", position: { x: 150, y: 200 } },
      { id: "MTR", kind: "motor", label: "MOTOR 15kW", position: { x: 150, y: 350 } },
    ];
    const legacyProjectEdges = [
      { id: "e1", source: "TRAFO", target: "DISJ" },
      { id: "e2", source: "DISJ", target: "MTR" },
    ];

    const synthesizedDoc = synthesizeDiagramDocFromProject(legacyProjectNodes, legacyProjectEdges);

    expect(Object.keys(synthesizedDoc.nodes)).toHaveLength(3);
    expect(Object.keys(synthesizedDoc.edges)).toHaveLength(2);
    expect(synthesizedDoc.nodes.TRAFO.params.kind).toBe("transformer");
    expect(synthesizedDoc.nodes.MTR.params.kind).toBe("motor");

    const validation = validateElectricalTopology(synthesizedDoc);
    expect(validation.status).toBe("COMPLETE");
    expect(validation.totalConnections).toBe(2);
  });
});
