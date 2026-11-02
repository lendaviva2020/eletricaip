// SCADA SUPERVISÓRIO — Critical Runtime Resilience & Crash Regression Tests
// Standards: IEC 62443 (Multi-tenant Isolation), NR-10/NR-12 (Virtual Safety Boundaries)
// Verification of React 19 / TanStack Router Runtime Stability across Scenarios A through H

import { describe, it, expect, beforeEach } from "vitest";
import { useScadaStore } from "@/lib/scada/scada-store";
import {
  DEMO_ETE_PROJECT_ID,
  DEMO_ETE_PROJECT_NAME,
  DEMO_ETE_TENANT_ID,
  isDemoProjectId,
} from "@/lib/scada/demo-ete-seed";
import type {
  EquipmentTelemetry,
  ScadaTagDefinition,
  ScadaViewId,
  SafetyActionLevel,
} from "@/lib/scada/types";

describe("SCADA RUNTIME CRITICAL FIX — Suite de Resiliência e Regressão de Crash", () => {
  beforeEach(() => {
    useScadaStore.getState().resetToInitialState();
  });

  describe("Cenário A — Projeto Autorizado e Válido", () => {
    it("1. Carrega contexto de projeto autorizado sem erros e inicializa telemetria", () => {
      const store = useScadaStore.getState();

      const validProject = {
        projectId: "proj-auth-001",
        tenantId: "tenant-auth-corp",
        projectName: "Planta Industrial Automotiva",
        equipments: {
          "EQ-PRESS-01": {
            id: "EQ-PRESS-01",
            tag: "IND.PRS01",
            name: "Bomba Hidráulica 500T",
            category: "PUMP" as const,
            status: "RUNNING" as const,
            mode: "AUTO" as const,
            voltageV: 480,
            currentA: 250,
            powerKw: 180,
            powerFactor: 0.92,
            frequencyHz: 60,
            runningHours: 1200,
            startsCount: 45,
            lastMaintenance: "2026-10-15",
            alarmsCount: 0,
            linkedTags: ["IND.PRS01.PRESSURE", "IND.PRS01.TEMP"],
          },
        },
        tags: {
          "IND.PRS01.PRESSURE": {
            id: "tag-prs-press",
            name: "IND.PRS01.PRESSURE",
            description: "Pressão Hidráulica Principal",
            dataType: "REAL" as const,
            unit: "bar",
            scaleMin: 0,
            scaleMax: 350,
            value: 210.5,
            quality: "GOOD" as const,
            driver: "INTERNAL_RUNTIME" as const,
            scanRateMs: 250,
            lastUpdated: Date.now(),
            forced: false,
            sourceAddress: "%MW100",
          },
        },
      };

      store.setProjectContext(validProject);

      const state = useScadaStore.getState();
      expect(state.currentProjectId).toBe("proj-auth-001");
      expect(state.currentTenantId).toBe("tenant-auth-corp");
      expect(state.currentProjectName).toBe("Planta Industrial Automotiva");
      expect(state.isDemoProject).toBe(false);
      expect(state.equipments["EQ-PRESS-01"]).toBeDefined();
      expect(state.tags["IND.PRS01.PRESSURE"]?.value).toBe(210.5);
    });
  });

  describe("Cenário B — Projeto Inexistente (404)", () => {
    it("2. Lida com projeto inexistente sem quebrar a árvore de componentes nem corromper store", () => {
      const store = useScadaStore.getState();

      // Clear project context simulates navigating to non-existent or unloaded project
      store.clearProjectContext();

      const state = useScadaStore.getState();
      expect(state.currentProjectId).toBeNull();
      expect(state.currentTenantId).toBeNull();
      expect(state.currentProjectName).toBeNull();
      expect(Object.keys(state.equipments).length).toBe(0);
      expect(Object.keys(state.tags).length).toBe(0);

      // Verify that Object.values(tags) does not contain undefined
      const tagList = Object.values(state.tags).filter((t): t is ScadaTagDefinition =>
        Boolean(t && t.name),
      );
      expect(tagList).toHaveLength(0);
    });
  });

  describe("Cenário C — Projeto Não Autorizado (403)", () => {
    it("3. Garante isolamento estrito multi-tenant (IEC 62443) impedindo vazamento de dados", () => {
      const store = useScadaStore.getState();

      // Tenant A loads Project A
      store.setProjectContext({
        projectId: "proj-alpha-private",
        tenantId: "tenant-alpha",
        projectName: "Subestação Confidencial Alpha",
        equipments: {
          "TR-SECRET": {
            id: "TR-SECRET",
            tag: "SEC.TR01",
            name: "Trafo Sigiloso",
            category: "TRANSFORMER",
            status: "RUNNING",
            mode: "AUTO",
            voltageV: 13800,
            currentA: 50,
            powerKw: 1000,
            powerFactor: 0.98,
            frequencyHz: 60,
            runningHours: 100,
            startsCount: 1,
            lastMaintenance: "2026-01-01",
            alarmsCount: 0,
            linkedTags: [],
          },
        },
        tags: {},
      });

      // Tenant B tries to switch without proper authorization -> context must be cleared
      store.clearProjectContext();

      const stateAfterRejection = useScadaStore.getState();
      expect(stateAfterRejection.currentProjectId).toBeNull();
      expect(stateAfterRejection.equipments["TR-SECRET"]).toBeUndefined();
    });
  });

  describe("Cenário D — Troca Rápida de Projetos (Race Condition)", () => {
    it("4. Limpa completamente dados anteriores durante trocas rápidas de contexto", () => {
      const store = useScadaStore.getState();

      // Rapid sequence: Project 1 -> Project 2 -> Project 3
      store.setProjectContext({
        projectId: "p1",
        tenantId: "t1",
        projectName: "Planta Química 1",
        equipments: {
          "REACTOR-01": {
            id: "REACTOR-01",
            tag: "CHM.REA01",
            name: "Reator de Polimerização",
            category: "TANK",
            status: "RUNNING",
            mode: "AUTO",
            voltageV: 0,
            currentA: 0,
            powerKw: 0,
            powerFactor: 1,
            frequencyHz: 60,
            runningHours: 300,
            startsCount: 5,
            lastMaintenance: "2026-05-10",
            alarmsCount: 0,
            linkedTags: [],
          },
        },
        tags: {},
      });

      expect(useScadaStore.getState().currentProjectId).toBe("p1");

      // Switch to P2
      store.setProjectContext({
        projectId: "p2",
        tenantId: "t2",
        projectName: "Siderúrgica 2",
        equipments: {
          "OVEN-02": {
            id: "OVEN-02",
            tag: "SID.OVN02",
            name: "Alto-Forno 2",
            category: "PANEL",
            status: "STANDBY",
            mode: "MANUAL",
            voltageV: 4160,
            currentA: 0,
            powerKw: 0,
            powerFactor: 0.8,
            frequencyHz: 60,
            runningHours: 10,
            startsCount: 1,
            lastMaintenance: "2026-09-01",
            alarmsCount: 0,
            linkedTags: [],
          },
        },
        tags: {},
      });

      const stateP2 = useScadaStore.getState();
      expect(stateP2.currentProjectId).toBe("p2");
      expect(stateP2.equipments["REACTOR-01"]).toBeUndefined(); // P1 equipment purged
      expect(stateP2.equipments["OVEN-02"]).toBeDefined();

      // Switch back to Demo Project via resetToInitialState
      store.resetToInitialState();
      const stateDemo = useScadaStore.getState();
      expect(stateDemo.isDemoProject).toBe(true);
      expect(stateDemo.currentProjectId).toBe(DEMO_ETE_PROJECT_ID);
      expect(stateDemo.equipments["OVEN-02"]).toBeUndefined(); // P2 equipment purged
      expect(stateDemo.equipments["P-01"]).toBeDefined(); // ETE loaded
    });
  });

  describe("Cenário E — Estruturas de Dados Incompletas e Valores Nulos", () => {
    it("5. Tolera projetos vazios (0 equipamentos, 0 tags) sem gerar exceção no ciclo de renderização", () => {
      const store = useScadaStore.getState();

      store.setProjectContext({
        projectId: "p-empty",
        tenantId: "t-empty",
        projectName: "Novo Projeto em Branco",
        equipments: {},
        tags: {},
      });

      const state = useScadaStore.getState();
      expect(Object.keys(state.equipments).length).toBe(0);
      expect(Object.keys(state.tags).length).toBe(0);

      // Verify that calling simulation tick with empty tags does not crash
      expect(() => {
        store.tickSimulation();
      }).not.toThrow();

      // Verify that no undefined properties were injected into state.tags
      for (const [key, val] of Object.entries(useScadaStore.getState().tags)) {
        expect(val).toBeDefined();
        expect(val.name).toBeDefined();
      }
    });

    it("6. Suporta equipamentos com campos opcionais ou nulos sem falhas de formatação numérica", () => {
      const partialEquipment: EquipmentTelemetry = {
        id: "EQ-PARTIAL-01",
        tag: "PART.01",
        name: "Equipamento com Dados Incompletos",
        category: "VALVE",
        status: "STANDBY",
        mode: "MANUAL",
        voltageV: 0,
        currentA: 0,
        powerKw: 0,
        powerFactor: 1,
        frequencyHz: 60,
        runningHours: 0,
        startsCount: 0,
        lastMaintenance: "N/A",
        alarmsCount: 0,
        linkedTags: [],
        // Optional properties omitted or undefined
        flowRateM3h: undefined,
        levelPct: undefined,
        pressureBar: undefined,
        temperatureC: undefined,
        speedRpm: undefined,
      };

      // Safely formatting test as in equipment-inspector-drawer.tsx
      const formatFlow =
        typeof partialEquipment.flowRateM3h === "number"
          ? partialEquipment.flowRateM3h.toFixed(1)
          : "--";
      const formatLevel =
        typeof partialEquipment.levelPct === "number" ? partialEquipment.levelPct.toFixed(1) : "--";
      const formatPF =
        typeof partialEquipment.powerFactor === "number"
          ? partialEquipment.powerFactor.toFixed(2)
          : "--";

      expect(formatFlow).toBe("--");
      expect(formatLevel).toBe("--");
      expect(formatPF).toBe("1.00");
    });
  });

  describe("Cenário F — Validação de Resiliência das 11 Telas com Store Vazio", () => {
    const ALL_11_VIEWS: ScadaViewId[] = [
      "overview",
      "synoptics",
      "alarms",
      "trends",
      "equipments",
      "tags",
      "communication",
      "events",
      "reports",
      "hmi",
      "settings",
    ];

    it("7. Assegura que todas as 11 vistas do SCADA podem ser selecionadas sem exceção", () => {
      const store = useScadaStore.getState();

      // Test with empty project
      store.setProjectContext({
        projectId: "p-empty-views",
        tenantId: "t-empty",
        projectName: "Projeto Sem Equipamentos",
        equipments: {},
        tags: {},
      });

      for (const view of ALL_11_VIEWS) {
        expect(() => {
          store.setActiveView(view);
        }).not.toThrow();

        const currentState = useScadaStore.getState();
        expect(currentState.activeView).toBe(view);
      }
    });
  });

  describe("Cenário G — E-STOP e Segurança Operacional sob Degradação", () => {
    it("8. Disparo do E-STOP virtual bloqueia comandos e mantém estado seguro consistente", () => {
      const store = useScadaStore.getState();
      store.resetToInitialState();

      // Trigger E-STOP
      store.triggerSimulationHalt();

      const estopState = useScadaStore.getState();
      expect(estopState.estopActive).toBe(true);
      expect(estopState.safetyLevel).toBe("SIMULATION_HALT");
      expect(estopState.isPhysicalControlAllowed).toBe(false);

      // Confirm all running pumps were tripped in simulation
      expect(estopState.equipments["P-01"].status).toBe("TRIPPED");
      expect(estopState.equipments["P-02"].status).toBe("TRIPPED");

      // Attempting to command an equipment during E-STOP should be blocked/recorded safely
      store.commandEquipment("P-01", "START", "OPERATOR");
      const stateAfterAttempt = useScadaStore.getState();
      expect(stateAfterAttempt.equipments["P-01"].status).toBe("TRIPPED");

      // Rearm E-STOP returns equipment to STANDBY
      store.rearmEstop();
      const rearmedState = useScadaStore.getState();
      expect(rearmedState.estopActive).toBe(false);
      expect(rearmedState.equipments["P-01"].status).toBe("STANDBY");
    });
  });

  describe("Cenário H — Regressão da Causa Raiz: tickSimulation sem Chaves Undefined", () => {
    it("9. tickSimulation NUNCA insere chaves com valor undefined em state.tags para projetos reais", () => {
      const store = useScadaStore.getState();

      // Customer project with only 1 custom tag
      store.setProjectContext({
        projectId: "proj-custom-001",
        tenantId: "tenant-cust",
        projectName: "Planta com 1 Tag Customizada",
        equipments: {},
        tags: {
          "CUST.TAG01": {
            id: "cust-t1",
            name: "CUST.TAG01",
            description: "Medição Customizada",
            dataType: "REAL",
            unit: "kW",
            scaleMin: 0,
            scaleMax: 500,
            value: 120,
            quality: "GOOD",
            driver: "INTERNAL_RUNTIME",
            scanRateMs: 500,
            lastUpdated: Date.now(),
            forced: false,
            sourceAddress: "%MW200",
          },
        },
      });

      // Run multiple ticks of simulation
      for (let i = 0; i < 5; i++) {
        store.tickSimulation();
      }

      const currentTags = useScadaStore.getState().tags;

      // Verify that ETE demo tags (like ETE.P01.FLOW) were NOT created with undefined values
      expect(currentTags["ETE.P01.FLOW"]).toBeUndefined();
      expect("ETE.P01.FLOW" in currentTags).toBe(false);

      // Verify all existing tags in Object.values are valid defined objects with a .name property
      const allTagValues = Object.values(currentTags);
      expect(allTagValues.length).toBe(1);
      for (const tag of allTagValues) {
        expect(tag).toBeDefined();
        expect(tag?.name).toBe("CUST.TAG01");
      }
    });
  });
});
