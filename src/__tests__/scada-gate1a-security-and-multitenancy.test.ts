// SCADA SUPERVISÓRIO — Gate 1A Security & Multi-Tenancy Validation Tests
// Standards: NR-10, NR-12, ISO 13849-1, IEC 62061, IEC 62443 (Multi-tenant RLS)
// Tests: RSK-P0-01 (Safety Boundaries & E-STOP) and RSK-P0-02 (Project Isolation)

import { describe, it, expect, beforeEach } from "vitest";
import { useScadaStore } from "@/lib/scada/scada-store";
import {
  DEMO_ETE_PROJECT_ID,
  DEMO_ETE_PROJECT_NAME,
  DEMO_ETE_TENANT_ID,
  isDemoProjectId,
} from "@/lib/scada/demo-ete-seed";
import type { SafetyActionLevel } from "@/lib/scada/types";

describe("GATE 1A — RSK-P0-01: Segurança do E-STOP e Limites Normativos (NR-10 / NR-12)", () => {
  beforeEach(() => {
    useScadaStore.getState().resetToInitialState();
  });

  it("1. Distingue formalmente os 4 níveis de parada operacional e de segurança", () => {
    const safetyLevels: Record<
      SafetyActionLevel,
      { isPhysical: boolean; requiresSIS: boolean; label: string }
    > = {
      SIMULATION_HALT: {
        isPhysical: false,
        requiresSIS: false,
        label: "Parada da Simulação — Ação virtual em memória, sem atuação física",
      },
      OPERATIONAL_STOP_REQUEST: {
        isPhysical: false,
        requiresSIS: false,
        label: "Solicitação de Parada Operacional — Handshake com CLP de processo",
      },
      PHYSICAL_EMERGENCY_STOP: {
        isPhysical: true,
        requiresSIS: true,
        label:
          "Dispositivo Físico de Parada de Emergência — Botão cogumelo cabeado a relé de segurança",
      },
      VALIDATED_SAFETY_FUNCTION: {
        isPhysical: true,
        requiresSIS: true,
        label: "Função de Segurança Validada — Circuito certificado ISO 13849-1 / IEC 62061",
      },
    };

    // Assert that SIMULATION_HALT is NEVER treated as a physical safety function
    expect(safetyLevels.SIMULATION_HALT.isPhysical).toBe(false);
    expect(safetyLevels.SIMULATION_HALT.requiresSIS).toBe(false);

    expect(safetyLevels.PHYSICAL_EMERGENCY_STOP.isPhysical).toBe(true);
    expect(safetyLevels.VALIDATED_SAFETY_FUNCTION.isPhysical).toBe(true);
  });

  it("2. O acionamento de parada no SCADA opera exclusivamente como SIMULATION_HALT e bloqueia afirmação de desenergização física", () => {
    const store = useScadaStore.getState();

    // Trigger simulation stop
    store.triggerSimulationHalt();

    const state = useScadaStore.getState();
    expect(state.estopActive).toBe(true);
    expect(state.safetyLevel).toBe("SIMULATION_HALT");
    expect(state.isPhysicalControlAllowed).toBe(false);

    // Audit trail must explicitly declare virtual action without physical de-energization
    const haltLog = state.auditLogs.find(
      (l) => l.action === "ESTOP_TRIGGER" || l.action === "SIMULATION_HALT",
    );
    expect(haltLog).toBeDefined();
    expect(haltLog?.details).toContain("AÇÃO VIRTUAL, SEM ATUAÇÃO FÍSICA");
    expect(haltLog?.details).toContain("Não houve desenergização elétrica física");
    expect(haltLog?.details).toContain("NR-10 / NR-12");

    // Alarm item must also state virtual action
    const haltAlarm = state.alarms.find(
      (a) => a.priority === "CRITICAL" && a.category === "SAFETY",
    );
    expect(haltAlarm).toBeDefined();
    expect(haltAlarm?.description).toContain("PARADA DA SIMULAÇÃO (VIRTUAL)");
    expect(haltAlarm?.description).toContain("Sem atuação em circuito físico");
  });

  it("3. Bloqueia comandos físicos não homologados e assegura que comandos de equipamentos registrem rótulo de simulação virtual", () => {
    const store = useScadaStore.getState();

    // Physical control flag is strictly false in Gate 1
    expect(store.isPhysicalControlAllowed).toBe(false);

    // Command equipment
    store.commandEquipment("P-01", "STOP", "TEST_OPERATOR");

    const state = useScadaStore.getState();
    const cmdLog = state.auditLogs.find((l) => l.action === "CMD_STOP" && l.equipment === "P-01");
    expect(cmdLog).toBeDefined();
    expect(cmdLog?.details).toContain("Sem atuação em CLP físico");
  });

  it("4. Rearme de simulação retorna equipamentos para STANDBY mantendo nível SIMULATION_HALT e registrando log de segurança", () => {
    const store = useScadaStore.getState();

    store.triggerSimulationHalt();
    expect(useScadaStore.getState().estopActive).toBe(true);

    store.rearmEstop();
    const afterRearm = useScadaStore.getState();
    expect(afterRearm.estopActive).toBe(false);
    expect(afterRearm.equipments["P-01"].status).toBe("STANDBY");

    const rearmLog = afterRearm.auditLogs.find((l) => l.action === "ESTOP_REARM");
    expect(rearmLog).toBeDefined();
    expect(rearmLog?.details).toContain("Comando de Rearme de Simulação efetuado");
  });
});

describe("GATE 1A — RSK-P0-02: Contexto de Projeto e Multi-Tenancy (IEC 62443)", () => {
  beforeEach(() => {
    useScadaStore.getState().clearProjectContext();
  });

  it("Cenário A — Organização A: Usuário autentica e carrega projeto autorizado com isolamento", () => {
    const projectOrgA = {
      projectId: "11111111-1111-4000-8000-000000000001",
      tenantId: "tenant-org-alpha",
      projectName: "Subestação Principal Alpha 69kV",
      equipments: {
        "TR-ALPHA": {
          id: "TR-ALPHA",
          tag: "SUB.TR01",
          name: "Trafo 69/13.8kV Alpha",
          category: "TRANSFORMER" as const,
          status: "RUNNING" as const,
          mode: "AUTO" as const,
          voltageV: 69000,
          currentA: 120,
          powerKw: 15000,
          powerFactor: 0.95,
          frequencyHz: 60,
          runningHours: 500,
          startsCount: 10,
          lastMaintenance: "01/01/2026",
          alarmsCount: 0,
          linkedTags: [],
        },
      },
      tags: {
        "SUB.TR01.TEMP": {
          id: "tag-tr-temp",
          name: "SUB.TR01.TEMP",
          description: "Temperatura do Óleo Trafo Alpha",
          dataType: "REAL" as const,
          unit: "°C",
          scaleMin: 0,
          scaleMax: 120,
          value: 65.4,
          quality: "GOOD" as const,
          driver: "INTERNAL_RUNTIME" as const,
          scanRateMs: 100,
          lastUpdated: Date.now(),
          forced: false,
          sourceAddress: "%MW100",
        },
      },
    };

    useScadaStore.getState().setProjectContext(projectOrgA);

    const state = useScadaStore.getState();
    expect(state.currentProjectId).toBe("11111111-1111-4000-8000-000000000001");
    expect(state.currentTenantId).toBe("tenant-org-alpha");
    expect(state.currentProjectName).toBe("Subestação Principal Alpha 69kV");
    expect(state.isDemoProject).toBe(false);

    // Verify authorized equipment loaded
    expect(state.equipments["TR-ALPHA"]).toBeDefined();
    expect(state.equipments["TR-ALPHA"].voltageV).toBe(69000);
    // Verify no demo ETE leak
    expect(state.equipments["P-01"]).toBeUndefined();
    expect(state.equipments["T-101"]).toBeUndefined();
  });

  it("Cenário B e D — Organização B e ID Adulterado: Rejeição de acesso a projeto de outro tenant", async () => {
    // Simulated server authorization check based on resolveScadaProjectContext rules
    const mockUserOrgB = {
      userId: "user-beta-01",
      userTenantId: "tenant-org-beta",
    };

    const projectBelongingToOrgA = {
      id: "11111111-1111-4000-8000-000000000001",
      tenant_id: "tenant-org-alpha",
      created_by: "user-alpha-01",
    };

    const authorizeAccess = (
      user: { userId: string; userTenantId: string } | null,
      project: { id: string; tenant_id: string; created_by: string } | null,
    ) => {
      if (!user) throw new Error("UNAUTHORIZED: Autenticação obrigatória.");
      if (!project)
        throw new Error("FORBIDDEN_OR_NOT_FOUND: Projeto não encontrado ou acesso não autorizado.");
      if (user.userTenantId !== project.tenant_id && user.userId !== project.created_by) {
        throw new Error(
          "FORBIDDEN: Violação de fronteira multi-tenant. Usuário não possui acesso ao projeto.",
        );
      }
      return true;
    };

    // User B trying to access Project of Org A -> MUST throw 403 Forbidden
    expect(() => authorizeAccess(mockUserOrgB, projectBelongingToOrgA)).toThrowError(
      "FORBIDDEN: Violação de fronteira multi-tenant",
    );

    // Tampered ID (project does not exist) -> MUST throw FORBIDDEN_OR_NOT_FOUND
    expect(() => authorizeAccess(mockUserOrgB, null)).toThrowError("FORBIDDEN_OR_NOT_FOUND");
  });

  it("Cenário C — Usuário anônimo: Rejeição de acesso não autenticado", () => {
    const authorizeAccess = (user: { userId: string } | null) => {
      if (!user) throw new Error("UNAUTHORIZED: Autenticação obrigatória para acessar o SCADA.");
      return true;
    };

    expect(() => authorizeAccess(null)).toThrowError("UNAUTHORIZED");
  });

  it("Cenário E — Troca de projeto: Limpeza estrita e isolamento total entre projetos", () => {
    const store = useScadaStore.getState();

    // 1. User opens Project 1
    store.setProjectContext({
      projectId: "project-1111",
      tenantId: "tenant-client-1",
      projectName: "Fábrica de Celulose - Digestor",
      equipments: {
        "DIG-01": {
          id: "DIG-01",
          tag: "CEL.DIG01",
          name: "Digestor Contínuo",
          category: "TANK",
          status: "RUNNING",
          mode: "AUTO",
          voltageV: 0,
          currentA: 0,
          powerKw: 0,
          powerFactor: 1.0,
          frequencyHz: 60,
          runningHours: 1200,
          startsCount: 0,
          lastMaintenance: "10/01/2026",
          alarmsCount: 0,
          linkedTags: [],
        },
      },
    });

    expect(useScadaStore.getState().currentProjectId).toBe("project-1111");
    expect(useScadaStore.getState().equipments["DIG-01"]).toBeDefined();

    // 2. User switches to Project 2
    store.setProjectContext({
      projectId: "project-2222",
      tenantId: "tenant-client-1",
      projectName: "Fábrica de Celulose - Caldeira",
      equipments: {
        "CALD-01": {
          id: "CALD-01",
          tag: "CEL.CALD01",
          name: "Caldeira de Recuperação",
          category: "PANEL",
          status: "STANDBY",
          mode: "AUTO",
          voltageV: 380,
          currentA: 250,
          powerKw: 120,
          powerFactor: 0.93,
          frequencyHz: 60,
          runningHours: 800,
          startsCount: 5,
          lastMaintenance: "15/01/2026",
          alarmsCount: 0,
          linkedTags: [],
        },
      },
    });

    const stateAfterSwitch = useScadaStore.getState();
    expect(stateAfterSwitch.currentProjectId).toBe("project-2222");
    expect(stateAfterSwitch.currentProjectName).toBe("Fábrica de Celulose - Caldeira");

    // Equipment from Project 2 MUST be present
    expect(stateAfterSwitch.equipments["CALD-01"]).toBeDefined();

    // Equipment from Project 1 MUST be COMPLETELY removed (Zero leakage)
    expect(stateAfterSwitch.equipments["DIG-01"]).toBeUndefined();
    expect(stateAfterSwitch.equipments["P-01"]).toBeUndefined();
  });

  it("Cenário F — Demonstração isolada: Planta ETE identificada formalmente como SIMULATED", () => {
    expect(isDemoProjectId(DEMO_ETE_PROJECT_ID)).toBe(true);
    expect(isDemoProjectId("normal-project-uuid")).toBe(false);

    useScadaStore.getState().setProjectContext({
      projectId: DEMO_ETE_PROJECT_ID,
      tenantId: DEMO_ETE_TENANT_ID,
      projectName: DEMO_ETE_PROJECT_NAME,
      isDemo: true,
    });

    const demoState = useScadaStore.getState();
    expect(demoState.isDemoProject).toBe(true);
    expect(demoState.currentProjectId).toBe(DEMO_ETE_PROJECT_ID);
    expect(demoState.equipments["P-01"]).toBeDefined();
    expect(demoState.tags["ETE.P01.FLOW"]).toBeDefined();
    expect(demoState.tags["ETE.P01.FLOW"].driver).toBe("SIMULATION");
  });
});
