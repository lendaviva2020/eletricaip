/**
 * ElétricAi Industrial OS — Transversal E2E Acceptance Scenario
 * Subestação Elétrica -> Painel QGBT -> Inversor de Frequência -> Bomba Centrífuga ->
 * Sensores de Nível/Pressão -> Válvula -> PLC -> Tags -> Alarmes ISA-18.2 -> HMI -> Receitas -> Versionamento
 */

import {
  IndustrialProject,
  Controller,
  HardwareModule,
  IOChannel,
  Tag,
  POU,
  TaskConfiguration,
  HMIPage,
  HMIWidget,
  AlarmDefinition,
  RecipeDefinition,
  TraceConfiguration,
  ProtocolConfiguration,
  X509Certificate,
  DigitalTwinState,
  UserRole,
  RBACPermission,
} from "./types";
import { generateUuid as uuidv4 } from "./uuid";
import { registerIndustrialLibraries } from "../libraries/industrial-libraries";
import { LibraryRegistry } from "../libraries/library-manager";

export class TransversalE2EScenario {
  /**
   * Constrói o projeto canônico completo da Planta Integrada de Bombeamento e Subestação
   */
  public static createComprehensivePlantProject(): IndustrialProject {
    const projId = uuidv4();
    const tenantId = uuidv4();
    const ctrlId = uuidv4();
    const nowIso = new Date().toISOString();

    // Registra bibliotecas industriais no registro global
    registerIndustrialLibraries(LibraryRegistry.getInstance());

    // 1. Canais de I/O de Campo (Subestação e Bombeamento)
    const chInEStop: IOChannel = {
      id: uuidv4(),
      moduleId: uuidv4(),
      channelIndex: 0,
      name: "DI_EMERGENCY_STOP",
      direction: "DIGITAL_INPUT",
      iecAddress: "%IX0.0",
      electricalSignal: "24VDC",
      rawMin: 0,
      rawMax: 1,
      scaledMin: 0,
      scaledMax: 1,
      engineeringUnit: "BOOL",
      status: "OK",
    };

    const chInBreakerClosed: IOChannel = {
      id: uuidv4(),
      moduleId: chInEStop.moduleId,
      channelIndex: 1,
      name: "DI_BREAKER_52_CLOSED",
      direction: "DIGITAL_INPUT",
      iecAddress: "%IX0.1",
      electricalSignal: "24VDC",
      rawMin: 0,
      rawMax: 1,
      scaledMin: 0,
      scaledMax: 1,
      engineeringUnit: "BOOL",
      status: "OK",
    };

    const chInLevelSensor: IOChannel = {
      id: uuidv4(),
      moduleId: uuidv4(),
      channelIndex: 0,
      name: "AI_TANK_LEVEL_4_20MA",
      direction: "ANALOG_INPUT",
      iecAddress: "%IW64",
      electricalSignal: "4-20mA",
      rawMin: 0,
      rawMax: 27648,
      scaledMin: 0,
      scaledMax: 100,
      engineeringUnit: "%",
      status: "OK",
    };

    const chOutPumpContactor: IOChannel = {
      id: uuidv4(),
      moduleId: uuidv4(),
      channelIndex: 0,
      name: "DO_PUMP_RUN_CMD",
      direction: "DIGITAL_OUTPUT",
      iecAddress: "%QX0.0",
      electricalSignal: "24VDC",
      rawMin: 0,
      rawMax: 1,
      scaledMin: 0,
      scaledMax: 1,
      engineeringUnit: "BOOL",
      status: "OK",
    };

    // 2. Módulos de Hardware do Rack do Controlador
    const rackModules: HardwareModule[] = [
      {
        id: chInEStop.moduleId,
        controllerId: ctrlId,
        slotNumber: 1,
        catalogKey: "DI16_24VDC",
        name: "Modulo_Entradas_Digitais",
        partNumber: "6ES7-521-1BH00-0AB0",
        channelsCount: 16,
        channels: [chInEStop, chInBreakerClosed],
        hardwareParameters: { filterTimeMs: 3 },
        diagnostics: { status: "HEALTHY" },
      },
      {
        id: chInLevelSensor.moduleId,
        controllerId: ctrlId,
        slotNumber: 2,
        catalogKey: "AI8_4_20MA",
        name: "Modulo_Entradas_Analogicas",
        partNumber: "6ES7-531-7KF00-0AB0",
        channelsCount: 8,
        channels: [chInLevelSensor],
        hardwareParameters: { smoothing: "MEDIUM" },
        diagnostics: { status: "HEALTHY" },
      },
      {
        id: chOutPumpContactor.moduleId,
        controllerId: ctrlId,
        slotNumber: 3,
        catalogKey: "DO16_24VDC",
        name: "Modulo_Saidas_Digitais",
        partNumber: "6ES7-522-1BH01-0AB0",
        channelsCount: 16,
        channels: [chOutPumpContactor],
        hardwareParameters: {},
        diagnostics: { status: "HEALTHY" },
      },
    ];

    // 3. Controlador Principal
    const mainController: Controller = {
      id: ctrlId,
      tenantId,
      projectId: projId,
      name: "PLC_SE_ELEVATORIA_01",
      vendor: "CODESYS_VIRTUAL",
      model: "ElétricAi SoftPLC V3.5",
      ipAddress: "192.168.10.20",
      firmwareVersion: "3.5.20.0",
      rackModules,
      taskConfigurations: [],
      connected: true,
      simulationActive: true,
    };

    // 4. Tags Canônicas de Processo e Elétrica
    const tagEStop: Tag = {
      id: uuidv4(),
      tenantId,
      projectId: projId,
      code: "ES-101",
      name: "EmergencyStop_Subestacao",
      dataType: "BOOL",
      currentValue: true,
      initialValue: true,
      quality: "GOOD",
      engineeringUnit: "",
      description: "Botão de Emergência Geral da Estação Elevatória",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 100,
    };

    const tagTankLevel: Tag = {
      id: uuidv4(),
      tenantId,
      projectId: projId,
      code: "LT-101",
      name: "Tanque_Nivel_Percentual",
      dataType: "REAL",
      currentValue: 65.5,
      initialValue: 50.0,
      quality: "GOOD",
      engineeringUnit: "%",
      description: "Transmissor Hidrostático de Nível do Reservatório",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 100,
    };

    const tagPumpRun: Tag = {
      id: uuidv4(),
      tenantId,
      projectId: projId,
      code: "PM-101",
      name: "Bomba_Principal_Acionada",
      dataType: "BOOL",
      currentValue: false,
      initialValue: false,
      quality: "GOOD",
      engineeringUnit: "",
      description: "Comando de Partida da Bomba de Efluente",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 100,
    };

    const tagActivePowerKW: Tag = {
      id: uuidv4(),
      tenantId,
      projectId: projId,
      code: "KW-101",
      name: "Potencia_Ativa_Total_KW",
      dataType: "REAL",
      currentValue: 45.2,
      initialValue: 0.0,
      quality: "GOOD",
      engineeringUnit: "kW",
      protocolAddress: "40001",
      description: "Medição de Potência Ativa Trifásica da Entrada",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 100,
    };

    // 5. POUs nas 5 Linguagens IEC 61131-3
    // POU 1: ST - Algoritmo de Histerese de Nível
    const pouST: POU = {
      id: uuidv4(),
      tenantId,
      projectId: projId,
      name: "PRG_LevelControl_ST",
      pouType: "PROGRAM",
      language: "ST",
      comment: "Controle de nível por histerese em Structured Text",
      variables: [
        {
          id: uuidv4(),
          tenantId,
          projectId: projId,
          name: "rCurrentLevel",
          scope: "VAR",
          dataType: "REAL",
          constant: false,
          retain: false,
          comment: "Nível atual do tanque",
          tagId: tagTankLevel.id,
        },
        {
          id: uuidv4(),
          tenantId,
          projectId: projId,
          name: "bPumpDemand",
          scope: "VAR_OUTPUT",
          dataType: "BOOL",
          constant: false,
          retain: false,
          comment: "Demanda de bombeamento",
        },
      ],
      rawSourceST: `PROGRAM PRG_LevelControl_ST
VAR
    rCurrentLevel : REAL := 65.5;
    rHighLimit : REAL := 80.0;
    rLowLimit : REAL := 30.0;
END_VAR
VAR_OUTPUT
    bPumpDemand : BOOL;
END_VAR

IF rCurrentLevel >= rHighLimit THEN
    bPumpDemand := TRUE;
ELSIF rCurrentLevel <= rLowLimit THEN
    bPumpDemand := FALSE;
END_IF;

END_PROGRAM`,
      networks: [],
      actions: [],
      methods: [],
      properties: [],
      implementedInterfaces: [],
    };

    // POU 2: LD - Intertravamento de Segurança de Partida
    const pouLD: POU = {
      id: uuidv4(),
      tenantId,
      projectId: projId,
      name: "PRG_Safety_LD",
      pouType: "PROGRAM",
      language: "LD",
      comment: "Intertravamento de segurança em Ladder Diagram",
      variables: [],
      rawSourceST: "",
      networks: [
        {
          id: uuidv4(),
          number: 1,
          label: "RUNG_01_SAFETY",
          comment: "Bomba só opera se E-STOP estiver saudável",
          language: "LD",
          stSource: "",
          fbdNodes: [],
          fbdConnections: [],
          sfcSteps: [],
          sfcTransitions: [],
          rungs: [
            {
              id: uuidv4(),
              number: 1,
              comment: "E_STOP AND DEMAND -> PUMP_RUN",
              elements: [
                {
                  id: uuidv4(),
                  type: "CONTACT_NO",
                  tagId: tagEStop.id,
                  symbolName: tagEStop.name,
                  negated: false,
                  params: {},
                },
                {
                  id: uuidv4(),
                  type: "COIL_STANDARD",
                  tagId: tagPumpRun.id,
                  symbolName: tagPumpRun.name,
                  negated: false,
                  params: {},
                },
              ],
              branches: [],
            },
          ],
        },
      ],
      actions: [],
      methods: [],
      properties: [],
      implementedInterfaces: [],
    };

    // POU 3: FBD - Proteção de Sobrecorrente
    const fbdPinIn1Id = uuidv4();
    const fbdPinIn2Id = uuidv4();
    const fbdPinOutMulId = uuidv4();
    const fbdPinGtIn1Id = uuidv4();
    const fbdPinGtIn2Id = uuidv4();
    const fbdPinOutGtId = uuidv4();
    const fbdNodeMulId = uuidv4();
    const fbdNodeGtId = uuidv4();

    const pouFBD: POU = {
      id: uuidv4(),
      tenantId,
      projectId: projId,
      name: "PRG_Protection_FBD",
      pouType: "PROGRAM",
      language: "FBD",
      comment: "Proteção de sobrecorrente e medição de potência em FBD",
      variables: [],
      rawSourceST: "",
      networks: [
        {
          id: uuidv4(),
          number: 1,
          label: "NW_PROTECTION",
          comment: "Escalação de Corrente e Comparação com Limite",
          language: "FBD",
          stSource: "",
          fbdNodes: [
            {
              id: fbdNodeMulId,
              name: "MUL",
              blockType: "MUL",
              x: 100,
              y: 80,
              inputs: [
                { id: fbdPinIn1Id, name: "IN1", dataType: "REAL", isInput: true, defaultValue: 10 },
                { id: fbdPinIn2Id, name: "IN2", dataType: "REAL", isInput: true, defaultValue: 2 },
              ],
              outputs: [
                { id: fbdPinOutMulId, name: "OUT", dataType: "REAL", isInput: false },
              ],
            },
            {
              id: fbdNodeGtId,
              name: "GT",
              blockType: "GT",
              x: 350,
              y: 80,
              inputs: [
                { id: fbdPinGtIn1Id, name: "IN1", dataType: "REAL", isInput: true },
                { id: fbdPinGtIn2Id, name: "IN2", dataType: "REAL", isInput: true, defaultValue: 15 },
              ],
              outputs: [
                { id: fbdPinOutGtId, name: "OUT", dataType: "BOOL", isInput: false },
              ],
            },
          ],
          fbdConnections: [
            {
              id: uuidv4(),
              fromNodeId: fbdNodeMulId,
              fromPinId: fbdPinOutMulId,
              toNodeId: fbdNodeGtId,
              toPinId: fbdPinGtIn1Id,
            },
          ],
          sfcSteps: [],
          sfcTransitions: [],
          rungs: [],
        },
      ],
      actions: [],
      methods: [],
      properties: [],
      implementedInterfaces: [],
    };

    // POU 4: SFC - Sequenciador de Estados de Operação da Estação
    const sfcStepInitId = uuidv4();
    const sfcStepPreChargeId = uuidv4();
    const sfcStepRunningId = uuidv4();
    const sfcStepStoppingId = uuidv4();
    const sfcStepStoppedId = uuidv4();

    const pouSFC: POU = {
      id: uuidv4(),
      tenantId,
      projectId: projId,
      name: "PRG_Sequencer_SFC",
      pouType: "PROGRAM",
      language: "SFC",
      comment: "Sequência de partida e parada da estação em SFC",
      variables: [],
      rawSourceST: "",
      networks: [
        {
          id: uuidv4(),
          number: 1,
          label: "SFC_NET_01",
          comment: "Init -> PreCharge -> Running -> Stopping -> Stopped",
          language: "SFC",
          stSource: "",
          fbdNodes: [],
          fbdConnections: [],
          sfcSteps: [
            { id: sfcStepInitId, stepNumber: 1, name: "Init", isInitial: true, isActive: true, timeInStepMs: 0, actions: [], x: 100, y: 50 },
            { id: sfcStepPreChargeId, stepNumber: 2, name: "PreCharge", isInitial: false, isActive: false, timeInStepMs: 0, actions: [], x: 100, y: 150 },
            { id: sfcStepRunningId, stepNumber: 3, name: "Running", isInitial: false, isActive: false, timeInStepMs: 0, actions: [], x: 100, y: 250 },
            { id: sfcStepStoppingId, stepNumber: 4, name: "Stopping", isInitial: false, isActive: false, timeInStepMs: 0, actions: [], x: 100, y: 350 },
            { id: sfcStepStoppedId, stepNumber: 5, name: "Stopped", isInitial: false, isActive: false, timeInStepMs: 0, actions: [], x: 100, y: 450 },
          ],
          sfcTransitions: [
            { id: uuidv4(), fromStepIds: [sfcStepInitId], toStepIds: [sfcStepPreChargeId], conditionST: "TRUE", isSatisfied: false, x: 100, y: 100 },
            { id: uuidv4(), fromStepIds: [sfcStepPreChargeId], toStepIds: [sfcStepRunningId], conditionST: "TRUE", isSatisfied: false, x: 100, y: 200 },
            { id: uuidv4(), fromStepIds: [sfcStepRunningId], toStepIds: [sfcStepStoppingId], conditionST: "bStopReq", isSatisfied: false, x: 100, y: 300 },
            { id: uuidv4(), fromStepIds: [sfcStepStoppingId], toStepIds: [sfcStepStoppedId], conditionST: "TRUE", isSatisfied: false, x: 100, y: 400 },
          ],
          rungs: [],
        },
      ],
      actions: [],
      methods: [],
      properties: [],
      implementedInterfaces: [],
    };

    // 6. Configurações de Tarefas (Cyclic, Event, Freewheeling)
    const taskFastCyclic: TaskConfiguration = {
      id: uuidv4(),
      controllerId: ctrlId,
      name: "Task_Cyclic_10ms",
      type: "CYCLIC",
      priority: 1,
      intervalMs: 10,
      watchdogMs: 50,
      watchdogSensitivity: 1,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: [pouST.id, pouLD.id],
      enabled: true,
    };

    const taskFast2ms: TaskConfiguration = {
      id: uuidv4(),
      controllerId: ctrlId,
      name: "FastTask_2ms",
      type: "CYCLIC",
      priority: 0,
      intervalMs: 2,
      watchdogMs: 10,
      watchdogSensitivity: 1,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: [pouFBD.id],
      enabled: true,
    };

    const taskEventEstop: TaskConfiguration = {
      id: uuidv4(),
      controllerId: ctrlId,
      name: "Task_Event_Estop",
      type: "EVENT",
      priority: 0, // Máxima prioridade
      intervalMs: 1,
      watchdogMs: 10,
      watchdogSensitivity: 1,
      eventTriggerTagId: tagEStop.id,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: [],
      enabled: true,
    };

    mainController.taskConfigurations = [taskFastCyclic.id, taskFast2ms.id, taskEventEstop.id];

    // 7. Alarmes ISA-18.2
    const alarmTankHigh: AlarmDefinition = {
      id: uuidv4(),
      projectId: projId,
      tagId: tagTankLevel.id,
      name: "ALM_NIVEL_MUITO_ALTO",
      condition: "HIGH_LIMIT",
      threshold: 85.0,
      severity: "CRITICAL",
      message: "Nível do reservatório acima de 85% — Risco iminente de transbordamento!",
      acknowledged: false,
      active: false,
      timestamp: nowIso,
    };

    // 8. Tela HMI / SCADA Integrada
    const hmiOverviewPage: HMIPage = {
      id: uuidv4(),
      projectId: projId,
      name: "Sinotico_Geral",
      title: "Estação Elevatória e Subestação 13.8kV",
      backgroundColor: "#0d1117",
      widgets: [
        {
          id: uuidv4(),
          type: "TANK_LEVEL",
          name: "Reservatorio_Principal",
          x: 100,
          y: 80,
          width: 140,
          height: 220,
          bindingTagId: tagTankLevel.id,
          properties: { unit: "%", min: 0, max: 100 },
          securityRoleRequired: "OPERATOR",
        },
        {
          id: uuidv4(),
          type: "MOTOR_SYMBOL",
          name: "Bomba_Centrifuga_01",
          x: 320,
          y: 180,
          width: 100,
          height: 100,
          bindingTagId: tagPumpRun.id,
          properties: { ratedPowerKW: 75 },
          securityRoleRequired: "OPERATOR",
        },
      ],
    };

    // 9. Receitas de Processo
    const recipeNormalFlow: RecipeDefinition = {
      id: uuidv4(),
      projectId: projId,
      name: "Receita_A_Nominal",
      productCode: "REC-PUMP-01",
      parameters: [
        {
          id: uuidv4(),
          targetTagId: tagTankLevel.id,
          parameterName: "Setpoint_Nivel_Alvo",
          targetValue: 70.0,
          unit: "%",
        },
      ],
    };

    const recipeHighDemand: RecipeDefinition = {
      id: uuidv4(),
      projectId: projId,
      name: "Receita_B_AltaDemanda",
      productCode: "REC-PUMP-02",
      parameters: [
        {
          id: uuidv4(),
          targetTagId: tagTankLevel.id,
          parameterName: "Setpoint_Nivel_Alvo",
          targetValue: 85.0,
          unit: "%",
        },
      ],
    };

    // 10. Trace Osciloscópio Multicanal
    const traceCfg: TraceConfiguration = {
      id: uuidv4(),
      projectId: projId,
      name: "Trace_Elevatoria",
      bufferDepthSamples: 200,
      sampleIntervalMs: 10,
      triggerCondition: "THRESHOLD",
      triggerTagId: tagTankLevel.id,
      triggerThreshold: 75.0,
      preTriggerSamples: 40,
      channels: [
        { id: uuidv4(), tagId: tagTankLevel.id, name: tagTankLevel.name, color: "#00E5FF", minDisplay: 0, maxDisplay: 100 },
        { id: uuidv4(), tagId: tagPumpRun.id, name: tagPumpRun.name, color: "#00E676", minDisplay: 0, maxDisplay: 1 },
        { id: uuidv4(), tagId: tagActivePowerKW.id, name: tagActivePowerKW.name, color: "#FFD600", minDisplay: 0, maxDisplay: 100 },
      ],
    };

    // 11. Certificado X.509 e Digital Twin
    const certOpcUa: X509Certificate = {
      id: uuidv4(),
      controllerId: ctrlId,
      subject: "CN=EletricAi_PLC_Elevatoria, O=EletricAi Industrial, C=BR",
      issuer: "CN=EletricAi_Root_CA, O=EletricAi Industrial",
      serialNumber: "SN-2026-001",
      validFrom: "2026-01-01T00:00:00Z",
      validTo: "2028-01-01T00:00:00Z",
      thumbprintSha256: "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855",
      purpose: "OPC_UA",
      trustStatus: "TRUSTED",
    };

    const twinState: DigitalTwinState = {
      deviceId: ctrlId,
      observedState: { checksum: "VER_COMPILED_HASH_2026" },
      declaredState: {},
      inferredState: {},
      lastSyncTimestamp: nowIso,
      syncStatus: "SYNCHRONIZED",
      driftDetails: [],
    };

    return {
      id: projId,
      tenantId,
      name: "Planta_Elevatoria_Subestacao_E2E",
      description: "Cenário E2E Transversal Homologado do ElétricAi Industrial OS",
      activeVersion: 1,
      versionsHistory: [
        {
          versionNumber: 1,
          commitMessage: "Homologação do Cenário E2E Transversal Gate 4.0",
          author: "Lead Automation Engineer",
          timestamp: nowIso,
          checksumSha256: "VER_COMPILED_HASH_2026",
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      controllers: [mainController],
      applications: [],
      devices: [],
      taskConfigurations: [taskFastCyclic, taskFast2ms, taskEventEstop],
      pous: [pouST, pouLD, pouFBD, pouSFC],
      dataTypes: [],
      globalVariableLists: [],
      tags: [tagEStop, tagTankLevel, tagPumpRun, tagActivePowerKW],
      hmiPages: [hmiOverviewPage],
      alarmDefinitions: [alarmTankHigh],
      trendDefinitions: [],
      recipeDefinitions: [recipeNormalFlow, recipeHighDemand],
      protocolConfigurations: [],
      motionAxes: [],
      motionGroups: [],
      libraryReferences: [
        {
          id: uuidv4(),
          name: "ElectricalProtection",
          namespace: "ElectricalProtection",
          category: "APPLICATION",
          version: "1.0.0",
          effectiveVersion: "1.0.0",
          vendor: "ElétricAi Power Systems",
          checksumSha256: "SHA_ELEC_PROT",
          isPlaceholder: false,
          dependencies: ["EletricAi_Standard"],
          pousProvided: ["FB_Overcurrent50_51", "FB_VoltageProtection27_59"],
          dataTypesProvided: [],
          description: "Funções de proteção ANSI 50, 51, 50N, 51N",
        },
        {
          id: uuidv4(),
          name: "#Standard",
          namespace: "Standard",
          category: "STANDARD",
          version: "3.5.20.0",
          effectiveVersion: "3.5.20.0",
          vendor: "ElétricAi Industrial OS",
          checksumSha256: "SHA_STANDARD",
          isPlaceholder: true,
          dependencies: [],
          pousProvided: ["TON", "TOF", "TP"],
          dataTypesProvided: [],
          description: "Placeholder para biblioteca padrão",
        },
      ],
      traceConfigurations: [traceCfg],
      certificates: [certOpcUa],
      digitalTwinStates: [twinState],
      rbacPermissions: [],
      simulationScenarios: [],
      diagnosticEvents: [],
    };
  }
}
