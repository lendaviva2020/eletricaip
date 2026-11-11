import { describe, it, expect, beforeEach } from "vitest";
import {
  ISA18AlarmLifecycleEngine,
  HMIScadaBridge,
  IndustrialRecipeManager,
} from "../scada/hmi-scada-bridge";
import { AlarmDefinition, HMIWidget, Tag, RecipeDefinition } from "../canonical/types";

describe("Milestone 7: HMI, SCADA, ISA-18.2 Alarms Lifecycle & Recipe Engine", () => {
  let alarmEngine: ISA18AlarmLifecycleEngine;
  let sampleAlarmDef: AlarmDefinition;

  beforeEach(() => {
    alarmEngine = new ISA18AlarmLifecycleEngine();
    sampleAlarmDef = {
      id: "alm-1",
      projectId: "p1",
      tagId: "tag-temp",
      name: "ALM_ALTA_TEMPERATURA",
      condition: "HIGH_LIMIT",
      threshold: 80.0,
      severity: "CRITICAL",
      message: "Temperatura do enrolamento superior a 80°C",
      acknowledged: false,
      active: false,
      timestamp: new Date().toISOString(),
    };
  });

  it("Executa transições completas da máquina de estados ISA-18.2", () => {
    // 1. Estado inicial: 70°C < 80°C -> NORMAL
    const s0 = alarmEngine.evaluateAlarm(sampleAlarmDef, 70.0);
    expect(s0.state).toBe("NORMAL");

    // 2. Disparo da condição: 85°C >= 80°C -> UNACKNOWLEDGED_ACTIVE
    const s1 = alarmEngine.evaluateAlarm(sampleAlarmDef, 85.0);
    expect(s1.state).toBe("UNACKNOWLEDGED_ACTIVE");
    expect(s1.chatterCount).toBe(1);

    // 3. Operador reconhece o alarme -> ACKNOWLEDGED_ACTIVE
    const ackOk = alarmEngine.acknowledgeAlarm(sampleAlarmDef.id, "Operador_SE");
    expect(ackOk).toBe(true);
    const activeList = alarmEngine.getActiveAlarms();
    expect(activeList[0].state).toBe("ACKNOWLEDGED_ACTIVE");

    // 4. Temperatura cai para 60°C (condição cessa) -> NORMAL
    const s2 = alarmEngine.evaluateAlarm(sampleAlarmDef, 60.0);
    expect(s2.state).toBe("NORMAL");
  });

  it("Suporta modo Shelving (silenciamento temporário com expiração)", () => {
    alarmEngine.evaluateAlarm(sampleAlarmDef, 90.0);
    expect(alarmEngine.getActiveAlarms()[0].state).toBe("UNACKNOWLEDGED_ACTIVE");

    // Silencia por 10 minutos
    alarmEngine.shelveAlarm(sampleAlarmDef.id, 10);
    expect(alarmEngine.getActiveAlarms()[0].state).toBe("SHELVED");

    // Simula passagem de tempo de 15 minutos: expira e retorna para UNACKNOWLEDGED_ACTIVE
    const futureDate = new Date(Date.now() + 15 * 60 * 1000);
    const sFuture = alarmEngine.evaluateAlarm(sampleAlarmDef, 90.0, futureDate);
    expect(sFuture.state).toBe("UNACKNOWLEDGED_ACTIVE");
  });

  it("HMIScadaBridge renderiza Faceplates com estado operacional e indicação de alarme", () => {
    const tagMotor: Tag = {
      id: "tag-motor-run",
      tenantId: "tenant-1",
      projectId: "p1",
      code: "PM-101",
      name: "Bomba_Principal",
      dataType: "BOOL",
      currentValue: true,
      initialValue: false,
      quality: "GOOD",
      engineeringUnit: "",
      description: "",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 1000,
    };

    const widgetMotor: HMIWidget = {
      id: "w-motor-1",
      type: "MOTOR_SYMBOL",
      name: "Bomba_Agua_01",
      x: 100,
      y: 100,
      width: 80,
      height: 80,
      bindingTagId: tagMotor.id,
      properties: {},
      securityRoleRequired: "OPERATOR",
    };

    const tagMap = new Map([[tagMotor.id, tagMotor]]);
    const faceplateNormal = HMIScadaBridge.resolveWidgetState(widgetMotor, tagMap, []);
    expect(faceplateNormal.statusColor).toBe("#10B981"); // Verde
    expect(faceplateNormal.statusText).toBe("EM OPERAÇÃO");

    // Com alarme ativo
    const mockAlarm = {
      definitionId: "alm-1",
      tagId: tagMotor.id,
      name: "Trip",
      severity: "CRITICAL" as const,
      message: "Falha",
      state: "UNACKNOWLEDGED_ACTIVE" as const,
      conditionMet: true,
      activeTimestamp: "",
      chatterCount: 1,
    };
    const faceplateAlarm = HMIScadaBridge.resolveWidgetState(widgetMotor, tagMap, [mockAlarm]);
    expect(faceplateAlarm.statusColor).toBe("#EF4444"); // Vermelho
    expect(faceplateAlarm.statusText).toBe("FALHA / TRIP");
  });

  it("IndustrialRecipeManager aplica parâmetros de receita às tags canônicas", () => {
    const tag1: Tag = {
      id: "tag-sp-1",
      tenantId: "tenant-1",
      projectId: "p1",
      code: "SP-101",
      name: "Setpoint_Vazao",
      dataType: "REAL",
      currentValue: 100.0,
      initialValue: 100.0,
      quality: "GOOD",
      engineeringUnit: "m3/h",
      description: "",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 1000,
    };

    const recipe: RecipeDefinition = {
      id: "rec-1",
      projectId: "p1",
      name: "Receita_Alta_Demanda",
      productCode: "PROD-A",
      parameters: [
        {
          id: "p1",
          targetTagId: tag1.id,
          parameterName: "Vazao_Alvo",
          targetValue: 350.0,
          unit: "m3/h",
        },
      ],
    };

    const manager = new IndustrialRecipeManager([recipe]);
    const tags = [tag1];
    const res = manager.applyRecipe(recipe.id, tags);

    expect(res.appliedCount).toBe(1);
    expect(tag1.currentValue).toBe(350.0);
    expect(res.tagsUpdated[0].previousValue).toBe(100.0);
  });

  it("Garante atomicidade na aplicação de receitas: falha na validação impede qualquer escrita", () => {
    const tag1: Tag = {
      id: "tag-val-1",
      tenantId: "t1",
      projectId: "p1",
      code: "V1",
      name: "Valvula1",
      dataType: "REAL",
      currentValue: 10.0,
      initialValue: 10.0,
      quality: "GOOD",
      engineeringUnit: "%",
      description: "",
      isForced: false,
      historyEnabled: false,
      sampleIntervalMs: 1000,
    };

    const invalidRecipe: RecipeDefinition = {
      id: "rec-invalid",
      projectId: "p1",
      name: "Receita_Com_Erro",
      productCode: "ERR",
      parameters: [
        { id: "p1", targetTagId: tag1.id, parameterName: "Valvula1", targetValue: 50.0, unit: "%" },
        {
          id: "p2",
          targetTagId: "tag-inexistente",
          parameterName: "NaoExiste",
          targetValue: 99.0,
          unit: "bar",
        },
      ],
    };

    const manager = new IndustrialRecipeManager([invalidRecipe]);
    const tags = [tag1];

    expect(() => manager.applyRecipe(invalidRecipe.id, tags)).toThrow(/\[RECIPE_ATOMIC_ERROR\]/);
    // Garante que tag1 não foi modificada
    expect(tag1.currentValue).toBe(10.0);
  });
});
