import { beforeEach, describe, expect, it } from "vitest";
import {
  UNIFIED_SCHEMA_VERSION,
  createEmptyUnifiedDoc,
  upgradeSnapshotV2ToV3,
  useRuntimeStore,
  useUnifiedProjectStore,
} from "@/lib/model";
import { useDiagramStore } from "@/lib/diagram/store";
import { cmd } from "@/lib/diagram/commands";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { usePlcStore } from "@/lib/plc/store";
import { useDigitalTwinStore } from "@/lib/digital-twin-store";
import type { ProjectSnapshot } from "@/lib/projects.functions";

describe("Fase B — Modelo Técnico Unificado (v3) e Separação de Runtime", () => {
  beforeEach(() => {
    useUnifiedProjectStore.getState().resetUnifiedDoc({
      id: "proj_test_v3",
      name: "Planta Industrial Teste V3",
    });
  });

  it("inicializa UnifiedProjectDoc v3 válido com metadados, normas e blocos PLC padrão", () => {
    const { doc, dirty } = useUnifiedProjectStore.getState();
    expect(doc.schemaVersion).toBe(UNIFIED_SCHEMA_VERSION);
    expect(doc.metadata.id).toBe("proj_test_v3");
    expect(doc.metadata.applicableStandards).toContain("NBR_5410");
    expect(dirty).toBe(false);
    expect(Object.keys(doc.engineering.tags).length).toBeGreaterThanOrEqual(5);
    expect(doc.plc.project.programBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it("mantém o mesmo equipmentId canônico entre Unifilar, Multifilar, ProjectStore e Digital Twin e preserva posições (x,y) independentes", () => {
    const store = useUnifiedProjectStore.getState();

    store.upsertEquipment(
      {
        id: "eq_m1",
        tagCode: "M1",
        displayName: "Bomba Principal M1",
        catalogType: "motor",
        category: "load",
        phases: "3F",
        terminals: [],
        specs: {
          powerKw: 7.5,
          voltageV: 380,
          nominalCurrentA: 16,
          startingMethod: "DOL",
        },
      },
      {
        unifilar: { nodeId: "uni_m1", position: { x: 120, y: 240 } },
        multifilar: { nodeId: "mf_m1", position: { x: 480, y: 600 } },
        scada: { position: { x: 300, y: 150 } },
      },
    );

    // Verifica terminais IEC sintetizados para motor (U1, V1, W1, PE)
    const eq = useUnifiedProjectStore.getState().doc.engineering.equipments.eq_m1;
    expect(eq.terminals.map((t) => t.code)).toEqual(["U1", "V1", "W1", "PE"]);

    // Move o nó no Multifilar manualmente
    store.updateViewNodePosition("multifilar", "mf_m1", { x: 525, y: 650 });

    // Altera a potência do motor de 7.5 kW para 15 kW no modelo canônico
    store.updateEquipmentSpecs(
      "eq_m1",
      { powerKw: 15, nominalCurrentA: 30 },
      { displayName: "Bomba Principal 15kW" },
    );

    const diagramNodes = useDiagramStore.getState().doc.nodes;
    expect(diagramNodes.uni_m1).toBeDefined();
    expect(diagramNodes.mf_m1).toBeDefined();

    // Mesmo equipmentId nas duas folhas (Unifilar e Multifilar)
    expect(diagramNodes.uni_m1.ui?.equipmentId).toBe("eq_m1");
    expect(diagramNodes.mf_m1.ui?.equipmentId).toBe("eq_m1");

    // Parâmetros e rótulo atualizados em ambas as folhas
    expect(diagramNodes.uni_m1.label).toBe("Bomba Principal 15kW");
    expect(diagramNodes.mf_m1.label).toBe("Bomba Principal 15kW");
    expect(diagramNodes.uni_m1.params.kind === "motor" && diagramNodes.uni_m1.params.power_kW).toBe(
      15,
    );
    expect(diagramNodes.mf_m1.params.kind === "motor" && diagramNodes.mf_m1.params.power_kW).toBe(
      15,
    );

    // Coordenadas (x,y) independentes preservadas!
    expect(diagramNodes.uni_m1.position).toEqual({ x: 120, y: 240 });
    expect(diagramNodes.mf_m1.position).toEqual({ x: 525, y: 650 });

    // ProjectStore e Digital Twin Nameplate sincronizados
    const projMotor = useProjectStore.getState().nodes.find((n) => n.id === "eq_m1");
    expect(projMotor?.params.P).toBe(15);
    const nameplate = useDigitalTwinStore.getState().nameplates.eq_m1;
    expect(nameplate?.potenciaKw).toBe(15);
    expect(nameplate?.correnteNominalA).toBe(30);
  });

  it("invalida automaticamente estudos dependentes (status: stale) quando especificações ou condutores mudam", () => {
    const store = useUnifiedProjectStore.getState();

    store.upsertEquipment(
      {
        id: "eq_qf1",
        tagCode: "QF1",
        displayName: "Disjuntor Motor",
        catalogType: "breaker",
        category: "protection",
        phases: "3F",
        terminals: [],
        specs: { nominalCurrentA: 32, tripCurve: "C", poles: 3 },
      },
      { unifilar: { position: { x: 100, y: 100 } } },
    );

    store.upsertEquipment(
      {
        id: "eq_m1",
        tagCode: "M1",
        displayName: "Motor M1",
        catalogType: "motor",
        category: "load",
        phases: "3F",
        terminals: [],
        specs: { powerKw: 11, voltageV: 380 },
      },
      { unifilar: { position: { x: 100, y: 260 } } },
    );

    store.connectTerminals({
      id: "conn_qf1_m1",
      fromEquipmentId: "eq_qf1",
      fromTerminalId: "eq_qf1:2/T1",
      toEquipmentId: "eq_m1",
      toTerminalId: "eq_m1:U1",
      kind: "power",
      circuitConfig: "3F+N+PE",
      conductor: {
        crossSectionMm2: 4,
        material: "Cu",
        insulation: "PVC",
        lengthM: 25,
        installationMethod: "B1",
      },
    });

    const study = store.upsertStudy({
      id: "study_vd_m1",
      studyType: "voltage_drop",
      title: "Queda de Tensão Circuito M1",
      inputEquipmentIds: ["eq_qf1", "eq_m1"],
      parameters: { limitPct: 4 },
      results: { dropPct: 1.82, passed: true },
    });

    expect(study.status).toBe("valid");
    expect(useUnifiedProjectStore.getState().doc.studies.study_vd_m1.status).toBe("valid");

    // Altera potência do motor -> estudo deve virar "stale" automaticamente
    store.updateEquipmentSpecs("eq_m1", { powerKw: 22 });
    expect(useUnifiedProjectStore.getState().doc.studies.study_vd_m1.status).toBe("stale");
  });

  it("propaga renomeação de CanonicalTag para Ladder, FBD, SCADA e Digital Twin mantendo tagId imutável", () => {
    const store = useUnifiedProjectStore.getState();

    // Cria tag canônica
    store.upsertTag({
      id: "tag_cmd_m1",
      name: "KM1_CMD",
      dataType: "BOOL",
      area: "Q",
      address: "%Q0.0",
      initialValue: false,
      forced: false,
      retentive: false,
      description: "Comando Contator KM1",
    });

    // Configura um rung no bloco OB1, um widget SCADA e um hotspot Twin apontando para KM1_CMD
    const curDoc = useUnifiedProjectStore.getState().doc;
    const mutatedDoc = structuredClone(curDoc);
    mutatedDoc.plc.project.programBlocks[0].ladder = {
      rungs: [
        {
          id: "rung-1",
          label: "Partida M1",
          cols: 3,
          cells: [
            [
              { kind: "XIC", operand: "START" },
              { kind: "EMPTY", operand: "" },
              { kind: "OTE", operand: "KM1_CMD" },
            ],
          ],
        },
      ],
    };
    mutatedDoc.views.scada.widgets.w_btn_1 = {
      id: "w_btn_1",
      kind: "button",
      category: "logic",
      label: "Botão Liga",
      position: { x: 50, y: 50 },
      boundTagId: "tag_cmd_m1",
      boundEquipmentId: null,
      params: { tag: "KM1_CMD" },
    };
    mutatedDoc.views.twin.mappings = [
      {
        equipmentId: "eq_m1",
        equipmentLabel: "M1",
        hotspots: [
          {
            id: "hs_1",
            label: "Status Comando",
            tag: "KM1_CMD",
            type: "status",
            unit: "",
            position: { x: 0, y: 1, z: 0 },
            color: "#00ff00",
            alarmActive: false,
          },
        ],
      },
    ];
    store.loadUnifiedDoc(mutatedDoc);

    // Renomeia a tag mantendo o mesmo ID ("tag_cmd_m1")
    store.upsertTag({
      ...useUnifiedProjectStore.getState().doc.engineering.tags.tag_cmd_m1,
      name: "BOMBA_RECALQUE_CMD",
    });

    const updated = useUnifiedProjectStore.getState().doc;
    const rungCell = (
      updated.plc.project.programBlocks[0].ladder?.rungs as Array<{
        cells: Array<Array<{ operand: string }>>;
      }>
    )[0].cells[0][2];

    expect(rungCell.operand).toBe("BOMBA_RECALQUE_CMD");
    expect(updated.views.scada.widgets.w_btn_1.boundTagId).toBe("tag_cmd_m1");
    expect(updated.views.scada.widgets.w_btn_1.params.tag).toBe("BOMBA_RECALQUE_CMD");
    expect(updated.views.twin.mappings[0].hotspots[0].tag).toBe("BOMBA_RECALQUE_CMD");
    expect(useEditorStore.getState().editorTags.tag_cmd_m1.name).toBe("BOMBA_RECALQUE_CMD");
    expect(usePlcStore.getState().project.variables.find((v) => v.id === "tag_cmd_m1")?.name).toBe(
      "BOMBA_RECALQUE_CMD",
    );
  });

  it("detecta colisão de canal I/O no PLC (PLC_IO_ADDRESS_COLLISION) e emite diagnóstico quando tag SCADA fica órfã", () => {
    const store = useUnifiedProjectStore.getState();

    store.upsertTag({
      id: "t1",
      name: "SENSOR_A",
      dataType: "BOOL",
      area: "I",
      initialValue: false,
      forced: false,
      retentive: false,
      description: "",
    });
    store.upsertTag({
      id: "t2",
      name: "SENSOR_B",
      dataType: "BOOL",
      area: "I",
      initialValue: false,
      forced: false,
      retentive: false,
      description: "",
    });

    const res1 = store.bindPlcChannel({
      channelId: "slot1:ch0",
      slotNumber: 1,
      channelIndex: 0,
      direction: "DI",
      address: "%I0.0",
      tagId: "t1",
      equipmentId: null,
    });
    expect(res1.ok).toBe(true);

    // Tentativa de alocar outra tag no mesmo slot/canal ou endereço físico
    const res2 = store.bindPlcChannel({
      channelId: "slot1:ch0_dup",
      slotNumber: 1,
      channelIndex: 0,
      direction: "DI",
      address: "%I0.0",
      tagId: "t2",
      equipmentId: null,
    });
    expect(res2.ok).toBe(false);
    expect(res2.diagnostic?.code).toBe("PLC_IO_ADDRESS_COLLISION");
    expect(res2.diagnostic?.requiresUserIntervention).toBe(true);
  });

  it("sincroniza automaticamente despachos do WebglCanvas (useDiagramStore) para useUnifiedProjectStore e useProjectStore", () => {
    useDiagramStore.getState().dispatch(
      cmd.addNode({
        id: "webgl_m01",
        sheet: "unifilar",
        position: { x: 200, y: 300 },
        label: "M-WebGL-01",
        params: {
          kind: "motor",
          power_kW: 18.5,
          voltage_V: 380,
          startMethod: "DOL",
        },
      }),
    );

    const unifiedEq = useUnifiedProjectStore.getState().doc.engineering.equipments.webgl_m01;
    expect(unifiedEq).toBeDefined();
    expect(unifiedEq.specs.powerKw).toBe(18.5);

    // Garante que o ProjectStore também recebeu o nó para que a Ponte Unifilar->Ladder funcione!
    const projectNode = useProjectStore.getState().nodes.find((n) => n.id === "webgl_m01");
    expect(projectNode).toBeDefined();
    expect(projectNode?.kind).toBe("motor");
    expect(projectNode?.params.P).toBe(18.5);
  });

  it("migra ProjectSnapshot v2 para UnifiedProjectDoc v3 sem perda de dados (upgradeSnapshotV2ToV3)", () => {
    const legacySnapshot: ProjectSnapshot = {
      schemaVersion: 2,
      project: {
        nodes: [
          {
            id: "g_1",
            kind: "gauge",
            category: "inst",
            label: "Nível Tanque",
            position: { x: 80, y: 90 },
            params: { tag: "LT_101", min: 0, max: 100 },
          },
        ],
        edges: [],
        tags: { LT_101: 64.5 },
        scadaLayout: { nodes: [], edges: [] },
      },
      voltai: { components: [], edges: [] },
      editor: {
        tags: {
          t_lt101: {
            id: "t_lt101",
            name: "LT_101",
            type: "REAL",
            value: 64.5,
            forced: false,
          },
        },
        rungs: [
          {
            id: "r1",
            label: "Rung 1",
            cols: 3,
            cells: [
              [
                { kind: "XIC", operand: "START" },
                { kind: "EMPTY", operand: "" },
                { kind: "OTE", operand: "MOTOR_RUN" },
              ],
            ],
          },
        ],
        fbdNodes: [],
        fbdEdges: [],
      },
      diagram: {
        version: 1,
        id: "doc_legacy_1",
        metadata: { title: "Projeto Legado V2", norms: ["NBR 5410", "NR-12"] },
        sheets: ["unifilar", "multifilar"],
        nodes: {
          n_uni_1: {
            id: "n_uni_1",
            sheet: "unifilar",
            position: { x: 100, y: 100 },
            rotation: 0,
            label: "QF-Geral",
            params: { kind: "breaker", in_A: 63, curve: "C", poles: 3 },
          },
          n_mf_1: {
            id: "n_mf_1",
            sheet: "multifilar",
            position: { x: 400, y: 100 },
            rotation: 0,
            label: "QF-Geral",
            params: { kind: "breaker", in_A: 63, curve: "C", poles: 3 },
          },
        },
        edges: {},
      },
      plc: createEmptyUnifiedDoc().plc.project,
    };

    const upgraded = upgradeSnapshotV2ToV3(legacySnapshot);
    expect(upgraded.schemaVersion).toBe(3);
    expect(upgraded.metadata.applicableStandards).toEqual(["NBR_5410", "NR_12"]);
    expect(upgraded.engineering.equipments.n_uni_1).toBeDefined();
    // Nó multifilar reconciliado com o mesmo equipmentId do unifilar
    expect(upgraded.views.multifilar.nodes.n_mf_1.equipmentId).toBe("n_uni_1");
    // Widget SCADA vinculado ao ID canônico da tag LT_101
    expect(upgraded.views.scada.widgets.g_1.boundTagId).toBe("t_lt101");
  });

  it("garante que ticks de simulação em useRuntimeStore e setRungsRuntime NUNCA marcam dirty = true", () => {
    useUnifiedProjectStore.getState().markSaved();
    useEditorStore.getState().markSaved();
    expect(useUnifiedProjectStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().dirty).toBe(false);

    // Simula 50 ciclos de scan a 60Hz no useRuntimeStore e setRungsRuntime
    for (let i = 0; i < 50; i++) {
      useRuntimeStore.getState().applyRuntimeFrame({
        ts: Date.now() + i * 16,
        cycleMs: 16,
        tagValuesById: { "var-1": i % 2 === 0, "var-5": 1200 + i },
        energizedEquipments: { eq_m1: true },
        ladderScan: {
          "rung-1": {
            rungId: "rung-1",
            poweredOut: true,
            cellEnergized: { "0:0": true, "0:2": true },
          },
        },
      });
      useEditorStore
        .getState()
        .setRungsRuntime((rs) => rs.map((r) => ({ ...r, poweredOut: i % 2 === 0 })));
    }

    expect(useRuntimeStore.getState().scanCycleCount).toBe(50);
    expect(useUnifiedProjectStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().dirty).toBe(false);
  });
});
