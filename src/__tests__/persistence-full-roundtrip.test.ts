import { beforeEach, describe, expect, it } from "vitest";
import { useUnifiedProjectStore } from "@/lib/model/unified-store";
import { useDiagramStore } from "@/lib/diagram/store";
import { useProjectStore } from "@/lib/project-store";
import { useEditorStore } from "@/lib/editor/store";
import { usePlcStore } from "@/lib/plc/store";
import { useDigitalTwinStore } from "@/lib/digital-twin-store";
import { buildProjectSnapshot } from "@/lib/use-project-persistence";
import { SnapshotSchema } from "@/lib/projects.functions";
import { createDefaultPlcProject } from "@/lib/plc/types";
import type { CanonicalEquipment, CanonicalTag } from "@/lib/model/unified-schema";

describe("Fase D — Persistência Completa e Round-Trip (T5)", () => {
  beforeEach(() => {
    useUnifiedProjectStore.getState().resetUnifiedDoc({ id: "proj_test_roundtrip", name: "Projeto Round-Trip" });
  });

  it("produz snapshot v3 completo através de buildProjectSnapshot() compatível com SnapshotSchema", () => {
    const store = useUnifiedProjectStore.getState();

    // 1. Cadastra Equipamento Canônico
    const motor: CanonicalEquipment = {
      id: "eq_motor_rt",
      tagCode: "M-101",
      displayName: "Motor Bomba RT",
      catalogType: "motor",
      category: "load",
      phases: "3F+N+PE",
      terminals: [
        { id: "eq_motor_rt_U1", code: "U1", direction: "in", kind: "L1" },
        { id: "eq_motor_rt_V1", code: "V1", direction: "in", kind: "L2" },
        { id: "eq_motor_rt_W1", code: "W1", direction: "in", kind: "L3" },
        { id: "eq_motor_rt_PE", code: "PE", direction: "in", kind: "PE" },
      ],
      specs: { powerKw: 22, voltageV: 380, nominalCurrentA: 42, startingMethod: "DOL" },
      diagramParams: {
        kind: "motor",
        tag: "M-101",
        startMethod: "DOL",
        power_kW: 22,
        voltage_V: 380,
        fla_A: 42,
      },
    };
    store.upsertEquipment(motor, {
      unifilar: { position: { x: 200, y: 300 } },
      scada: { position: { x: 150, y: 250 } },
    });

    // 2. Cadastra Tag Canônica e Vínculo de Controle
    const tag: CanonicalTag = {
      id: "tag_cmd_m101",
      name: "CMD_M101",
      description: "Comando partida motor",
      dataType: "BOOL",
      area: "M",
      address: "%M10.0",
      initialValue: false,
      forced: false,
      retentive: false,
    };
    store.upsertTag(tag);

    store.bindControl({
      equipmentId: "eq_motor_rt",
      role: "main_contactor_coil",
      tagId: "tag_cmd_m101",
      terminalIds: ["eq_motor_rt_U1"],
    });

    // 3. Cadastra Estudo de Engenharia
    store.upsertStudy({
      id: "study_sc_1",
      studyType: "short_circuit",
      title: "Estudo de Curto-Circuito",
      inputEquipmentIds: ["eq_motor_rt"],
      parameters: { faultType: "three_phase", busVoltageV: 380 },
      results: { ikssKa: 18.4, ipKa: 36.2 },
      status: "valid",
    });

    // 4. Cadastra Gêmeo Digital
    useDigitalTwinStore.getState().upsertNameplate({
      equipmentId: "eq_motor_rt",
      potenciaKw: 22,
      tensaoV: 380,
      correnteNominalA: 42,
      rpm: 1760,
      eficiencia: 0.93,
      fatorPotencia: 0.88,
      fatorServico: 1.15,
    });
    useDigitalTwinStore.getState().setMappings([
      {
        equipmentId: "eq_motor_rt",
        equipmentLabel: "Motor Bomba RT",
        hotspots: [
          {
            id: "hs_temp_m101",
            label: "Temp Mancal",
            tag: "TI_M101",
            type: "temperature",
            unit: "°C",
            position: { x: 1, y: 2, z: 3 },
            color: "#ff0000",
            alarmActive: false,
          },
        ],
      },
    ]);

    // 5. Gera snapshot v3
    const snap = buildProjectSnapshot();

    expect(snap.schemaVersion).toBe(3);
    expect(snap.twin).toBeDefined();
    expect(snap.twin?.mappings.length).toBe(1);
    expect(snap.twin?.nameplates["eq_motor_rt"]).toBeDefined();
    expect(snap.studies).toBeDefined();
    expect(Object.keys(snap.studies ?? {})).toHaveLength(1);
    expect(snap.controlBindings).toBeDefined();
    expect(Object.keys(snap.controlBindings ?? {})).toHaveLength(1);
    expect(snap.unifiedDoc).toBeDefined();

    // 6. Validação estrita pelo SnapshotSchema do Zod
    const parsed = SnapshotSchema.safeParse(snap);
    expect(parsed.success).toBe(true);
  });

  it("garante fidelidade round-trip perfeita: load(save(doc)) restaura todas as entidades canônicas", () => {
    // Monta cenário
    const store = useUnifiedProjectStore.getState();
    const qf: CanonicalEquipment = {
      id: "eq_qf_main",
      tagCode: "QF-01",
      displayName: "Disjuntor Geral",
      catalogType: "breaker",
      category: "protection",
      phases: "3F",
      terminals: [
        { id: "eq_qf_main_1", code: "1", direction: "in", kind: "L1" },
        { id: "eq_qf_main_2", code: "2", direction: "out", kind: "L1" },
      ],
      specs: { nominalCurrentA: 100, breakingCapacityKa: 25, tripCurve: "C" },
      diagramParams: { kind: "breaker", tag: "QF-01", in_A: 100, icc_kA: 25, curve: "C", poles: 3 },
    };
    store.upsertEquipment(qf, { unifilar: { position: { x: 100, y: 150 } } });

    store.upsertStudy({
      id: "study_af_1",
      studyType: "arc_flash",
      title: "Estudo Arc Flash",
      inputEquipmentIds: ["eq_qf_main"],
      parameters: { workingDistanceMm: 450 },
      results: { incidentEnergyCalCm2: 4.2, ppeCategory: 2 },
      status: "valid",
    });

    // Salva snapshot
    const savedSnapshot = buildProjectSnapshot();

    // Reseta todo o estado dos stores
    useUnifiedProjectStore.getState().resetUnifiedDoc();
    useDiagramStore.getState().resetDoc();
    useProjectStore.getState().reset();
    useEditorStore.getState().hydrateSnapshot({ editorTags: {}, rungs: [], fbdNodes: [], fbdEdges: [] });
    usePlcStore.getState().setProject(createDefaultPlcProject());

    expect(Object.keys(useUnifiedProjectStore.getState().doc.engineering.equipments)).toHaveLength(0);

    // Reidrata do snapshot
    const hydratedDoc = useUnifiedProjectStore.getState().hydrateFromV2Snapshot(savedSnapshot);

    // Valida restauração completa
    expect(hydratedDoc.engineering.equipments["eq_qf_main"]).toBeDefined();
    const restoredQf = hydratedDoc.engineering.equipments["eq_qf_main"];
    expect(restoredQf.tagCode).toBe("QF-01");
    expect(restoredQf.specs.nominalCurrentA).toBe(100);
    expect(restoredQf.specs.breakingCapacityKa).toBe(25);

    // Valida estudos
    const studies = Object.values(hydratedDoc.studies);
    expect(studies).toHaveLength(1);
    expect(studies[0].studyType).toBe("arc_flash");
    expect(studies[0].status).toBe("valid");
    expect(studies[0].results.ppeCategory).toBe(2);

    // Valida visualização projetada no diagrama
    const diagramDoc = useDiagramStore.getState().doc;
    const diagramNode = Object.values(diagramDoc.nodes).find((n) => n.id === "eq_qf_main");
    expect(diagramNode).toBeDefined();
    expect(diagramNode?.position).toEqual({ x: 100, y: 150 });
  });
});
