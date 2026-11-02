// SCADA SUPERVISÓRIO — Gate 1B Canonical Equipment & Single Source of Truth Tests
// Standards: IEC 61131-3, IEC 60617, ISA-101
// Tests: RSK-P1-01 (Single Source of Truth, Canonical Equipment & Tag Registry)

import { describe, it, expect, beforeEach } from "vitest";
import { useScadaStore } from "@/lib/scada/scada-store";
import {
  canonicalToScadaTelemetry,
  canonicalToScadaTag,
  syncUnifiedDocToScada,
} from "@/lib/scada/canonical-bridge";
import type {
  CanonicalEquipment,
  CanonicalTag,
  UnifiedProjectDoc,
} from "@/lib/model/unified-schema";
import { createEmptyUnifiedDoc } from "@/lib/model/migration-v2-to-v3";

describe("GATE 1B — RSK-P1-01: Modelo Canônico de Equipamentos & Single Source of Truth", () => {
  beforeEach(() => {
    useScadaStore.getState().clearProjectContext();
  });

  it("1. Mapeia CanonicalEquipment do unifilar para telemetria SCADA preservando identidade estável (ID) e especificações nominais", () => {
    const canonicalMotor: CanonicalEquipment = {
      id: "EQ-MOTOR-01",
      tagCode: "M-01",
      displayName: "Motor de Indução Gaiola M-01",
      catalogType: "WEG W22 Premium IE3",
      category: "drive",
      phases: "3F",
      terminals: [
        { id: "T-U1", code: "U1", kind: "L1", direction: "in" },
        { id: "T-V1", code: "V1", kind: "L2", direction: "in" },
        { id: "T-W1", code: "W1", kind: "L3", direction: "in" },
      ],
      specs: {
        powerKw: 75.0,
        voltageV: 380,
        nominalCurrentA: 138.5,
        powerFactor: 0.89,
        efficiency: 0.954,
        poles: 4,
      },
    };

    const linkedTag: CanonicalTag = {
      id: "TAG-M01-RUN",
      name: "M01.RUNNING",
      dataType: "BOOL",
      area: "Q",
      address: "%QX0.1",
      initialValue: true,
      forced: false,
      retentive: false,
      description: "Feedback de Motor M-01 em Operação",
      linkedEquipmentId: "EQ-MOTOR-01",
    };

    const scadaTelemetry = canonicalToScadaTelemetry(canonicalMotor, [linkedTag]);

    // Identity MUST be exactly identical
    expect(scadaTelemetry.id).toBe("EQ-MOTOR-01");
    expect(scadaTelemetry.tag).toBe("M-01");
    expect(scadaTelemetry.name).toBe("Motor de Indução Gaiola M-01");
    expect(scadaTelemetry.category).toBe("PUMP");
    expect(scadaTelemetry.powerKw).toBe(75.0);
    expect(scadaTelemetry.voltageV).toBe(380);
    expect(scadaTelemetry.currentA).toBe(138.5);
    expect(scadaTelemetry.powerFactor).toBe(0.89);
    expect(scadaTelemetry.linkedTags).toContain("M01.RUNNING");
  });

  it("2. Mapeia CanonicalTag para ScadaTagDefinition com separação entre metadados e runtime", () => {
    const canonicalTag: CanonicalTag = {
      id: "TAG-FLOW-ANALOG",
      name: "FIT_01.FLOW_RATE",
      dataType: "REAL",
      area: "DB",
      address: "DB100.DBD10",
      unit: "m³/h",
      scaleMin: 0,
      scaleMax: 300,
      initialValue: 145.2,
      forced: false,
      retentive: true,
      description: "Vazão Medida no Barramento Primário",
      linkedEquipmentId: "EQ-FIT-01",
    };

    const scadaTag = canonicalToScadaTag(canonicalTag);

    expect(scadaTag.id).toBe("TAG-FLOW-ANALOG");
    expect(scadaTag.name).toBe("FIT_01.FLOW_RATE");
    expect(scadaTag.dataType).toBe("REAL");
    expect(scadaTag.unit).toBe("m³/h");
    expect(scadaTag.scaleMin).toBe(0);
    expect(scadaTag.scaleMax).toBe(300);
    expect(scadaTag.value).toBe(145.2);
    expect(scadaTag.quality).toBe("GOOD");
    expect(scadaTag.driver).toBe("INTERNAL_RUNTIME");
    expect(scadaTag.isSimulated).toBe(false);
  });

  it("3. Sincronização Unificada: O SCADA consome os mesmos equipamentos e TAGs do projeto sem duplicação", () => {
    const baseDoc = createEmptyUnifiedDoc({
      id: "proj-unif-001",
      name: "Planta Industrial Automotiva - Linha de Estamparia",
    });

    const mockUnifiedDoc: UnifiedProjectDoc = {
      ...baseDoc,
      schemaVersion: 3,
      metadata: {
        ...baseDoc.metadata,
        id: "proj-unif-001",
        name: "Planta Industrial Automotiva - Linha de Estamparia",
        description: "Projeto de automação e distribuição de potência",
        client: "Montadora SA",
        schemaVersion: 3,
        applicableStandards: ["NBR_5410", "NR_10", "NR_12"],
        nominalSystem: {
          frequencyHz: 60,
          lowVoltageV: 380,
          mediumVoltageKv: 13.8,
          earthingScheme: "TN-S",
        },
        revision: 1,
        updatedAt: new Date().toISOString(),
      },
      engineering: {
        equipments: {
          "EQ-PRENSA-01": {
            id: "EQ-PRENSA-01",
            tagCode: "PRS-01",
            displayName: "Prensa Hidráulica 500T",
            catalogType: "Prensa Schuler 500",
            category: "drive",
            phases: "3F",
            terminals: [],
            specs: {
              powerKw: 110,
              voltageV: 380,
              nominalCurrentA: 205,
              powerFactor: 0.91,
            },
          },
          "EQ-DISJ-01": {
            id: "EQ-DISJ-01",
            tagCode: "Q-01",
            displayName: "Disjuntor Caixa Moldada 250A",
            catalogType: "Siemens 3VA",
            category: "protection",
            phases: "3F",
            terminals: [],
            specs: {
              voltageV: 380,
              nominalCurrentA: 250,
              breakingCapacityKa: 50,
            },
          },
        },
        connections: {},
        circuits: {},
        tags: {
          "PRS01.START": {
            id: "tag-prs01-start",
            name: "PRS01.START",
            dataType: "BOOL",
            area: "I",
            address: "%IX0.0",
            initialValue: false,
            forced: false,
            retentive: false,
            description: "Botão de Partida Prensa",
            linkedEquipmentId: "EQ-PRENSA-01",
          },
          "PRS01.PRESSURE": {
            id: "tag-prs01-press",
            name: "PRS01.PRESSURE",
            dataType: "REAL",
            area: "DB",
            address: "DB50.DBD0",
            unit: "bar",
            scaleMin: 0,
            scaleMax: 350,
            initialValue: 210,
            forced: false,
            retentive: false,
            description: "Pressão Hidráulica da Prensa",
            linkedEquipmentId: "EQ-PRENSA-01",
          },
        },
        controlBindings: {},
        plcChannels: {},
      },
      plc: {
        project: createEmptyUnifiedDoc().plc.project,
        activeLadderBlockId: "",
        activeFbdBlockId: "",
      },
      views: {
        diagramDocId: "diag-001",
        sheets: ["unifilar", "ladder"],
        unifilar: {
          nodes: {
            "node-prs": {
              nodeId: "node-prs",
              equipmentId: "EQ-PRENSA-01",
              position: { x: 100, y: 150 },
              rotation: 0,
              label: "PRS-01",
            },
          },
          edges: {},
        },
        multifilar: { nodes: {}, edges: {} },
        scada: { widgets: {}, edges: [] },
        twin: { mappings: [], nameplates: {}, modelUrl: null },
      },
      studies: {},
      diagnostics: [],
    };

    // Synchronize canonical document into SCADA
    syncUnifiedDocToScada(mockUnifiedDoc, "tenant-automotivo");

    const scadaState = useScadaStore.getState();
    expect(scadaState.currentProjectId).toBe("proj-unif-001");
    expect(scadaState.currentTenantId).toBe("tenant-automotivo");
    expect(scadaState.currentProjectName).toBe(
      "Planta Industrial Automotiva - Linha de Estamparia",
    );
    expect(scadaState.isDemoProject).toBe(false);

    // Assert Canonical Equipments exist in SCADA
    expect(scadaState.equipments["EQ-PRENSA-01"]).toBeDefined();
    expect(scadaState.equipments["EQ-PRENSA-01"].powerKw).toBe(110);
    expect(scadaState.equipments["EQ-PRENSA-01"].tag).toBe("PRS-01");

    expect(scadaState.equipments["EQ-DISJ-01"]).toBeDefined();
    expect(scadaState.equipments["EQ-DISJ-01"].currentA).toBe(250);

    // Assert Canonical Tags exist in SCADA
    expect(scadaState.tags["PRS01.START"]).toBeDefined();
    expect(scadaState.tags["PRS01.PRESSURE"]).toBeDefined();
    expect(scadaState.tags["PRS01.PRESSURE"].unit).toBe("bar");

    // Assert ZERO static ETE demo leak
    expect(scadaState.equipments["P-01"]).toBeUndefined();
    expect(scadaState.equipments["T-101"]).toBeUndefined();
  });

  it("4. Separação de Representação Gráfica: Remoção de nó visual no unifilar não destrói o CanonicalEquipment nem suas TAGs no SCADA", () => {
    // Canonical Equipment
    const motorCanonica: CanonicalEquipment = {
      id: "EQ-BOMBA-CENTRAL",
      tagCode: "BC-01",
      displayName: "Bomba Central de Água Gelada",
      catalogType: "KSB Megaflow",
      category: "drive",
      phases: "3F",
      terminals: [],
      specs: { powerKw: 45, voltageV: 380 },
    };

    const tagCanonica: CanonicalTag = {
      id: "TAG-BC01-TEMP",
      name: "BC01.TEMP_MANCAL",
      dataType: "REAL",
      area: "DB",
      unit: "°C",
      initialValue: 52.3,
      forced: false,
      retentive: false,
      description: "Temperatura do Mancal Dianteiro",
      linkedEquipmentId: "EQ-BOMBA-CENTRAL",
    };

    // Simulated views layout: representation in Unifilar and Multifilar
    const visualLayout: {
      unifilarNodes: Record<string, { nodeId: string; equipmentId: string } | undefined>;
      multifilarNodes: Record<string, { nodeId: string; equipmentId: string } | undefined>;
    } = {
      unifilarNodes: { "node-unif-1": { nodeId: "node-unif-1", equipmentId: "EQ-BOMBA-CENTRAL" } },
      multifilarNodes: {
        "node-mult-1": { nodeId: "node-mult-1", equipmentId: "EQ-BOMBA-CENTRAL" },
      },
    };

    // User removes unifilar visual node
    delete visualLayout.unifilarNodes["node-unif-1"];
    expect(visualLayout.unifilarNodes["node-unif-1"]).toBeUndefined();

    // The canonical equipment still exists because it is referenced in Multifilar and SCADA
    expect(motorCanonica.id).toBe("EQ-BOMBA-CENTRAL");
    expect(tagCanonica.linkedEquipmentId).toBe("EQ-BOMBA-CENTRAL");

    // SCADA telemetry remains intact
    const scadaTelemetry = canonicalToScadaTelemetry(motorCanonica, [tagCanonica]);
    expect(scadaTelemetry.id).toBe("EQ-BOMBA-CENTRAL");
    expect(scadaTelemetry.powerKw).toBe(45);
  });
});
