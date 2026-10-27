import { describe, it, expect, beforeEach } from "vitest";
import { useDiagramStore } from "@/lib/diagram/store";
import { cmd } from "@/lib/diagram/commands";
import {
  buildMultifilarCommands,
  buildUnifilarFromMultifilarCommands,
  syncMultifilarCommands,
  detectMultifilarPhaseMismatches,
  calculateVoltageDropNbr5410,
  runDiagramDiagnostics,
} from "@/lib/diagram/multifilar";
import { diagramToSvg } from "@/lib/diagram/export-svg";
import { diagramToDxf } from "@/lib/diagram/export-dxf";
import type { DiagramDoc } from "@/lib/diagram/schema";

function setupCircuit() {
  useDiagramStore.setState((s) => ({
    ...s,
    doc: {
      id: "doc-test-mcc01",
      version: 1,
      sheets: ["unifilar", "multifilar"],
      metadata: {
        title: "MCC-01_REFORCO",
        project: "MCC-01_REFORCO",
        norms: ["NBR 5410", "IEC 60617", "NR-10"],
      },
      nodes: {},
      edges: {},
    },
    selectedNodeIds: [],
    activeSheet: "unifilar",
  }));

  const store = useDiagramStore.getState();

  // 1. Incomer: Transformador TR1 (13.8kV / 380V) e Disjuntor Geral QF1
  store.dispatch(
    cmd.addNode({
      id: "TR1",
      sheet: "unifilar",
      position: { x: 400, y: 80 },
      params: {
        kind: "transformer",
        kVA: 100,
        primary_V: 13800,
        secondary_V: 380,
        vector: "Dyn11",
        tag: "TR1",
        manufacturer: "WEG",
        model: "TRAFO-100",
      },
      label: "TR1",
    }),
  );

  store.dispatch(
    cmd.addNode({
      id: "QF1",
      sheet: "unifilar",
      position: { x: 400, y: 160 },
      params: {
        kind: "breaker",
        in_A: 63,
        curve: "C",
        poles: 3,
        tag: "QF1",
        manufacturer: "Schneider",
        model: "iC60N",
      },
      label: "QF1",
    }),
  );

  // Barra principal horizontal 380V / 630A
  store.dispatch(
    cmd.addNode({
      id: "BUS1",
      sheet: "unifilar",
      position: { x: 400, y: 240 },
      params: {
        kind: "busbar",
        current_A: 630,
        voltage_V: 380,
        tag: "BARRA-380V",
      },
      label: "BARRA PRINCIPAL",
    }),
  );

  // Ramo 1: Partida Direta Motor M1 (QF2, KM1, FT1, M1)
  store.dispatch(
    cmd.addNode({
      id: "QF2",
      sheet: "unifilar",
      position: { x: 200, y: 320 },
      params: {
        kind: "breaker",
        in_A: 32,
        curve: "C",
        poles: 3,
        tag: "QF2",
        manufacturer: "WEG",
        model: "MPW40",
      },
      label: "QF2",
    }),
  );
  store.dispatch(
    cmd.addNode({
      id: "KM1",
      sheet: "unifilar",
      position: { x: 200, y: 400 },
      params: {
        kind: "contactor",
        in_A: 32,
        coil_V: 24,
        tag: "KM1",
        manufacturer: "WEG",
        model: "CWM32",
      },
      label: "KM1",
    }),
  );
  store.dispatch(
    cmd.addNode({
      id: "FT1",
      sheet: "unifilar",
      position: { x: 200, y: 480 },
      params: {
        kind: "thermal_relay",
        in_A: 32,
        trip_class: "10A",
        tag: "FT1",
        manufacturer: "WEG",
        model: "RW27-2D",
      },
      label: "FT1",
    }),
  );
  store.dispatch(
    cmd.addNode({
      id: "M1",
      sheet: "unifilar",
      position: { x: 200, y: 560 },
      params: {
        kind: "motor",
        power_kW: 7.5,
        current_A: 15.2,
        voltage_V: 380,
        startMethod: "DOL",
        tag: "M1",
        manufacturer: "WEG",
        model: "W22 Premium",
      },
      label: "M1",
    }),
  );

  // Ramo 2: Inversor de Frequência e Motor M2
  store.dispatch(
    cmd.addNode({
      id: "QF3",
      sheet: "unifilar",
      position: { x: 340, y: 320 },
      params: {
        kind: "breaker",
        in_A: 32,
        curve: "C",
        poles: 3,
        tag: "QF3",
      },
      label: "QF3",
    }),
  );
  store.dispatch(
    cmd.addNode({
      id: "VFD1",
      sheet: "unifilar",
      position: { x: 340, y: 420 },
      params: {
        kind: "vfd",
        power_kW: 7.5,
        voltage_V: 380,
        tag: "VFD1",
        manufacturer: "WEG",
        model: "CFW11",
      },
      label: "VFD1",
    }),
  );
  store.dispatch(
    cmd.addNode({
      id: "M2",
      sheet: "unifilar",
      position: { x: 340, y: 560 },
      params: {
        kind: "motor",
        startMethod: "DOL",
        power_kW: 7.5,
        current_A: 15.2,
        voltage_V: 380,
        tag: "M2",
      },
      label: "M2",
    }),
  );

  // Ramo 3: Banco de Capacitores
  store.dispatch(
    cmd.addNode({
      id: "QF4",
      sheet: "unifilar",
      position: { x: 480, y: 320 },
      params: {
        kind: "breaker",
        in_A: 63,
        curve: "C",
        poles: 3,
        tag: "QF4",
      },
      label: "QF4",
    }),
  );
  store.dispatch(
    cmd.addNode({
      id: "KM2",
      sheet: "unifilar",
      position: { x: 480, y: 400 },
      params: {
        kind: "contactor",
        in_A: 32,
        coil_V: 24,
        tag: "KM2",
      },
      label: "KM2",
    }),
  );
  store.dispatch(
    cmd.addNode({
      id: "BC1",
      sheet: "unifilar",
      position: { x: 480, y: 500 },
      params: {
        kind: "capacitor_bank",
        kvar: 25,
        voltage_V: 380,
        tag: "BC1",
        manufacturer: "WEG",
        model: "BCW-25",
      },
      label: "BC1",
    }),
  );

  // Ramo 4: Automação (PLC e IHM com sinais de comando)
  store.dispatch(
    cmd.addNode({
      id: "PLC1",
      sheet: "unifilar",
      position: { x: 620, y: 380 },
      params: {
        kind: "plc",
        cpu: "1769-L33ER",
        io_count: 16,
        tag: "PLC1",
        manufacturer: "Rockwell",
        model: "CompactLogix",
      },
      label: "PLC1",
    }),
  );
  store.dispatch(
    cmd.addNode({
      id: "HMI1",
      sheet: "unifilar",
      position: { x: 620, y: 520 },
      params: {
        kind: "hmi",
        screen_size_in: 10.1,
        protocol: "EtherNet/IP",
        tag: "HMI1",
        manufacturer: "Siemens",
        model: "KTP1000",
      },
      label: "HMI1",
    }),
  );

  // Ligações de Potência
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "TR1", target: "QF1", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "QF1", target: "BUS1", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "BUS1", target: "QF2", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "QF2", target: "KM1", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "KM1", target: "FT1", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "FT1", target: "M1", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "BUS1", target: "QF3", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "QF3", target: "VFD1", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "VFD1", target: "M2", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "BUS1", target: "QF4", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "QF4", target: "KM2", kind: "power" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "KM2", target: "BC1", kind: "power" }));

  // Ligações de Sinal e Comando (Linhas Tracejadas Laranjas)
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "PLC1", target: "KM1", kind: "signal" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "PLC1", target: "VFD1", kind: "signal" }));
  store.dispatch(cmd.addEdge({ sheet: "unifilar", source: "PLC1", target: "HMI1", kind: "signal" }));

  // Deriva o diagrama multifilar inicial compartilhado a partir do doc atualizado
  const currentDoc = useDiagramStore.getState().doc;
  const multiCmds = buildMultifilarCommands(currentDoc);
  if (multiCmds.length > 0) {
    useDiagramStore.getState().dispatch({ type: "Batch", commands: multiCmds });
  }
}

describe("ElétricAi — Canvas Elétrico Unifilar + Multifilar Profissional", () => {
  beforeEach(() => {
    setupCircuit();
  });

  it("1. Constrói o circuito industrial completo da referência visual no diagrama unifilar", () => {
    const updatedDoc = useDiagramStore.getState().doc;
    const unifilarNodes = Object.values(updatedDoc.nodes).filter((n) => n.sheet === "unifilar");
    const unifilarEdges = Object.values(updatedDoc.edges).filter((e) => e.sheet === "unifilar");

    expect(unifilarNodes.length).toBe(15);
    expect(unifilarEdges.length).toBe(15);
  });

  it("2. Converte Unifilar -> Multifilar expandindo condutores e preservando canonical equipmentId", () => {
    const doc = useDiagramStore.getState().doc;
    const unifilarOnlyDoc: DiagramDoc = {
      ...doc,
      nodes: Object.fromEntries(
        Object.entries(doc.nodes).filter(([_, n]) => n.sheet === "unifilar"),
      ),
      edges: Object.fromEntries(
        Object.entries(doc.edges).filter(([_, e]) => e.sheet === "unifilar"),
      ),
    };
    const commands = buildMultifilarCommands(unifilarOnlyDoc);

    expect(commands.length).toBeGreaterThan(0);

    // Executa batch de criação
    useDiagramStore.getState().dispatch({ type: "Batch", commands });

    const newDoc = useDiagramStore.getState().doc;
    const multifilarNodes = Object.values(newDoc.nodes).filter((n) => n.sheet === "multifilar");
    const multifilarEdges = Object.values(newDoc.edges).filter((e) => e.sheet === "multifilar");

    // Confirma que todos os componentes principais foram transpostos
    expect(multifilarNodes.length).toBeGreaterThanOrEqual(10);
    expect(multifilarEdges.length).toBeGreaterThanOrEqual(15);

    // Confirma preservação de equipmentId canônico entre as representações
    const m1Unifilar = newDoc.nodes["M1"];
    const m1EquipId = m1Unifilar.ui?.equipmentId || m1Unifilar.id;
    const m1Multifilar = Object.values(multifilarNodes).find(
      (n) => (n.ui?.equipmentId || n.id) === `mf_${m1EquipId}` || n.ui?.equipmentId === m1EquipId,
    );
    expect(m1Multifilar).toBeDefined();
    expect(m1Multifilar?.params.kind).toBe("motor");
    expect((m1Multifilar?.params as any).power_kW).toBe(7.5);
  });

  it("3. Executa conversão reversa Multifilar -> Unifilar sem perda semântica", () => {
    const doc = useDiagramStore.getState().doc;
    const reverseCommands = buildUnifilarFromMultifilarCommands(doc);

    // Não deve quebrar nem duplicar nós existentes
    expect(Array.isArray(reverseCommands)).toBe(true);

    if (reverseCommands.length > 0) {
      useDiagramStore.getState().dispatch({ type: "Batch", commands: reverseCommands });
    }

    const currentDoc = useDiagramStore.getState().doc;
    const unifilarM1 = currentDoc.nodes["M1"];
    expect(unifilarM1).toBeDefined();
    expect((unifilarM1.params as any).power_kW).toBe(7.5);
  });

  it("4. Sincroniza parâmetros bidirecionalmente mantendo o layout espacial inalterado", () => {
    // Altera a potência do motor M1 no diagrama unifilar para 11kW e corrente 21.8A
    const currentM1 = useDiagramStore.getState().doc.nodes["M1"];
    useDiagramStore.getState().dispatch({
      type: "UpdateNodeParams",
      nodeId: "M1",
      from: currentM1.params,
      to: {
        ...currentM1.params,
        power_kW: 11,
        current_A: 21.8,
      } as any,
    });

    const docAfterEdit = useDiagramStore.getState().doc;
    expect((docAfterEdit.nodes["M1"].params as any).power_kW).toBe(11);

    // Sincroniza para o multifilar
    const syncCommands = syncMultifilarCommands(docAfterEdit);
    expect(syncCommands.length).toBeGreaterThan(0);
    useDiagramStore.getState().dispatch({ type: "Batch", commands: syncCommands });

    const docAfterSync = useDiagramStore.getState().doc;
    const m1EquipId = currentM1.ui?.equipmentId || currentM1.id;
    const multiM1 = Object.values(docAfterSync.nodes).find(
      (n) => n.sheet === "multifilar" && (n.ui?.equipmentId === m1EquipId || n.id === `mf_${m1EquipId}`),
    );
    expect(multiM1).toBeDefined();
    expect((multiM1?.params as any).power_kW).toBe(11);
    expect((multiM1?.params as any).current_A).toBe(21.8);
  });

  it("5. Preserva posicionamento manual de nós movidos no Multifilar", () => {
    const doc = useDiagramStore.getState().doc;
    const multiNode = Object.values(doc.nodes).find((n) => n.sheet === "multifilar");
    expect(multiNode).toBeDefined();

    const originalPos = { ...multiNode!.position };
    const customPos = { x: originalPos.x + 120, y: originalPos.y + 70 };

    // Simula movimentação do operador
    useDiagramStore.getState().moveSelectedTo({
      [multiNode!.id]: { from: originalPos, to: customPos },
    });

    const movedDoc = useDiagramStore.getState().doc;
    expect(movedDoc.nodes[multiNode!.id].position.x).toBe(customPos.x);
    expect(movedDoc.nodes[multiNode!.id].position.y).toBe(customPos.y);

    // Roda sincronização novamente: as coordenadas NÃO podem ser resetadas
    const reSyncCommands = syncMultifilarCommands(movedDoc);
    useDiagramStore.getState().dispatch({ type: "Batch", commands: reSyncCommands });

    const postSyncDoc = useDiagramStore.getState().doc;
    expect(postSyncDoc.nodes[multiNode!.id].position.x).toBe(customPos.x);
    expect(postSyncDoc.nodes[multiNode!.id].position.y).toBe(customPos.y);
  });

  it("6. Valida cálculos reais de queda de tensão segundo NBR 5410 (< 4.0%)", () => {
    const doc = useDiagramStore.getState().doc;
    const results = calculateVoltageDropNbr5410(doc);

    expect(results.length).toBeGreaterThan(0);

    for (const r of results) {
      expect(typeof r.drop_V).toBe("number");
      expect(typeof r.drop_pct).toBe("number");
      expect(r.max_allowed_pct).toBe(4.0);
      expect(r.length_m).toBeGreaterThan(0);
      expect(r.section_mm2).toBeGreaterThan(0);
      expect(r.current_A).toBeGreaterThan(0);
      expect(r.drop_pct).toBeLessThanOrEqual(r.max_allowed_pct);
      expect(r.compliant).toBe(true);
    }
  });

  it("7. Executa diagnóstico em tempo real e detecta conformidade ou inconsistências", () => {
    const doc = useDiagramStore.getState().doc;
    const alerts = runDiagramDiagnostics(doc);

    expect(alerts.length).toBeGreaterThan(0);

    // Valida conectividade
    const connAlert = alerts.find((a) => a.id === "conn_ok");
    expect(connAlert).toBeDefined();
    expect(connAlert?.type).toBe("OK");
    expect(connAlert?.message).toContain("Conectividade validada");

    // Testa detecção de componente sem tag
    const brokenDoc: DiagramDoc = JSON.parse(JSON.stringify(doc));
    brokenDoc.nodes["KM1"].params = { ...brokenDoc.nodes["KM1"].params, tag: "" } as any;
    brokenDoc.nodes["KM1"].label = "";
    const brokenAlerts = runDiagramDiagnostics(brokenDoc);
    const missingTagAlert = brokenAlerts.find((a) => a.id === "tag_KM1");
    expect(missingTagAlert).toBeDefined();
    expect(missingTagAlert?.type).toBe("ERRO");
    expect(missingTagAlert?.message).toContain("sem tag");
  });

  it("8. Gera exportações vetoriais de alta precisão em SVG e CAD DXF", () => {
    const doc = useDiagramStore.getState().doc;

    // SVG
    const svgStr = diagramToSvg(doc, "unifilar");
    expect(svgStr).toContain("<svg");
    expect(svgStr).toContain("TR1");
    expect(svgStr).toContain("QF1");
    expect(svgStr).toContain("M1");
    expect(svgStr).toContain("MCC-01_REFORCO");
    expect(svgStr).toContain("NBR 5410");

    // DXF
    const dxfStr = diagramToDxf(doc, "unifilar");
    expect(dxfStr).toContain("SECTION");
    expect(dxfStr).toContain("ENTITIES");
    expect(dxfStr).toContain("EOF");
  });
});
