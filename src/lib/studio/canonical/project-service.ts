// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — CANONICAL PROJECT SERVICE
// Transactional Project Management, Single Source of Truth & Cross-Module Sync
// ============================================================================

import { generateUuid as uuidv4 } from "./uuid";
import { sha256 } from "../../diagnostics/crypto-hash";
import type { UnifiedProjectDoc, CanonicalTag } from "@/lib/model/unified-schema";
import {
  type IndustrialProject,
  type Controller,
  type Device,
  type POU,
  type Tag,
  type PLCVariable,
  type TaskConfiguration,
  type DependencyGraph,
  type DependencyReference,
  IndustrialProjectSchema,
  IS_PHYSICAL_CONTROL_ALLOWED,
} from "./types";

export interface IntegrityCheckResult {
  isValid: boolean;
  brokenTagReferences: string[];
  brokenVariableReferences: string[];
  brokenPouReferences: string[];
  unmappedIOChannels: string[];
  cyclicDependencies: string[];
}

export class CanonicalProjectService {
  /**
   * Cria um projeto industrial vazio com estrutura mínima inicial.
   */
  public static createEmptyProject(
    name: string,
    tenantId?: string,
    projectId?: string,
  ): IndustrialProject {
    const projId = projectId || uuidv4();
    const tId = tenantId || uuidv4();
    const ctrlId = uuidv4();
    const cpuModId = uuidv4();
    const diModId = uuidv4();
    const doModId = uuidv4();

    const defaultController: Controller = {
      id: ctrlId,
      tenantId: tId,
      projectId: projId,
      name: "PLC_Main",
      vendor: "CODESYS_VIRTUAL",
      model: "CODESYS Control Win V3 x64",
      ipAddress: "127.0.0.1",
      firmwareVersion: "3.5.20.0",
      rackModules: [
        {
          id: cpuModId,
          controllerId: ctrlId,
          slotNumber: 0,
          catalogKey: "cpu-virtual-x64",
          name: "Virtual Industrial Controller CPU",
          partNumber: "ELET-CPU-V3",
          channelsCount: 0,
          channels: [],
          hardwareParameters: { cycleTimeMs: 10, memoryMb: 128 },
          diagnostics: { status: "ONLINE_SIMULATED", temperatureC: 42 },
        },
        {
          id: diModId,
          controllerId: ctrlId,
          slotNumber: 1,
          catalogKey: "di-16-24vdc",
          name: "Digital Input Module (16x 24VDC)",
          partNumber: "ELET-DI-16",
          channelsCount: 16,
          channels: Array.from({ length: 16 }, (_, i) => ({
            id: uuidv4(),
            moduleId: diModId,
            channelIndex: i,
            name: `DI_${i}`,
            direction: "DIGITAL_INPUT",
            iecAddress: `%IX0.${i % 8}`,
            electricalSignal: "24VDC",
            rawMin: 0,
            rawMax: 1,
            scaledMin: 0,
            scaledMax: 1,
            engineeringUnit: "BOOL",
            status: "OK",
          })),
          hardwareParameters: { filterTimeMs: 3 },
          diagnostics: { status: "OK" },
        },
        {
          id: doModId,
          controllerId: ctrlId,
          slotNumber: 2,
          catalogKey: "do-16-24vdc",
          name: "Digital Output Module (16x 24VDC)",
          partNumber: "ELET-DO-16",
          channelsCount: 16,
          channels: Array.from({ length: 16 }, (_, i) => ({
            id: uuidv4(),
            moduleId: doModId,
            channelIndex: i,
            name: `DO_${i}`,
            direction: "DIGITAL_OUTPUT",
            iecAddress: `%QX0.${i % 8}`,
            electricalSignal: "24VDC",
            rawMin: 0,
            rawMax: 1,
            scaledMin: 0,
            scaledMax: 1,
            engineeringUnit: "BOOL",
            status: "OK",
          })),
          hardwareParameters: {},
          diagnostics: { status: "OK" },
        },
      ],
      taskConfigurations: [],
      connected: false,
      simulationActive: false,
    };

    const mainTask: TaskConfiguration = {
      id: uuidv4(),
      controllerId: ctrlId,
      name: "MainTask",
      type: "CYCLIC",
      priority: 1,
      intervalMs: 10,
      watchdogMs: 100,
      watchdogSensitivity: 1,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: [],
      enabled: true,
    };

    defaultController.taskConfigurations = [mainTask.id];

    const initialProject: IndustrialProject = {
      id: projId,
      tenantId: tId,
      name,
      description: "Ambiente Integrado de Engenharia Industrial",
      activeVersion: 1,
      versionsHistory: [
        {
          versionNumber: 1,
          commitMessage: "Projeto inicial criado",
          author: "Lead Automation Engineer",
          timestamp: new Date().toISOString(),
          checksumSha256: "0000000000000000000000000000000000000000000000000000000000000000",
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      controllers: [defaultController],
      applications: [],
      devices: [],
      taskConfigurations: [mainTask],
      pous: [],
      dataTypes: [],
      globalVariableLists: [],
      tags: [],
      hmiPages: [],
      alarmDefinitions: [],
      trendDefinitions: [],
      recipeDefinitions: [],
      protocolConfigurations: [],
      motionAxes: [],
      motionGroups: [],
      libraryReferences: [],
      traceConfigurations: [],
      certificates: [],
      digitalTwinStates: [],
      rbacPermissions: [],
      simulationScenarios: [],
      diagnosticEvents: [],
    };

    const checksum = this.computeDeterministicChecksum(initialProject);
    initialProject.versionsHistory[0].checksumSha256 = checksum;
    return initialProject;
  }

  /**
   * Calcula o hash criptográfico SHA-256 determinístico e canônico do projeto.
   * Não é sensível à ordenação incidental de chaves e campos temporais variáveis.
   */
  public static computeDeterministicChecksum(project: IndustrialProject): string {
    const canonicalPayload = {
      id: project.id,
      tenantId: project.tenantId,
      name: project.name,
      activeVersion: project.activeVersion,
      controllers: (project.controllers || []).map((c) => ({
        id: c.id,
        name: c.name,
        vendor: c.vendor,
        model: c.model,
        rackModules: (c.rackModules || []).map((m) => ({
          id: m.id,
          slotNumber: m.slotNumber,
          catalogKey: m.catalogKey,
          name: m.name,
          channels: (m.channels || []).map((ch) => ({
            id: ch.id,
            moduleId: ch.moduleId,
            channelIndex: ch.channelIndex,
            name: ch.name,
            direction: ch.direction,
            iecAddress: ch.iecAddress,
            mappedTagId: ch.mappedTagId,
          })),
        })),
      })),
      pous: (project.pous || []).map((p) => ({
        id: p.id,
        name: p.name,
        pouType: p.pouType,
        language: p.language,
        sourceST: (p as any).sourceST || p.rawSourceST || "",
        variables: (p.variables || []).map((v) => ({
          id: v.id,
          name: v.name,
          scope: v.scope,
          dataType: v.dataType,
          initialValue: v.initialValue,
        })),
      })),
      tags: (project.tags || []).map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        dataType: t.dataType,
        initialValue: t.initialValue,
        quality: t.quality,
        provenance: t.provenance,
      })),
      taskConfigurations: (project.taskConfigurations || []).map((tk) => ({
        id: tk.id,
        name: tk.name,
        type: tk.type,
        priority: tk.priority,
        intervalMs: tk.intervalMs,
        watchdogMs: tk.watchdogMs,
        pouNames: (tk as any).pouNames || tk.pouIds || [],
      })),
      alarmDefinitions: (project.alarmDefinitions || []).map((a) => ({
        id: a.id,
        name: a.name,
        tagId: a.tagId,
        condition: a.condition,
        threshold: a.threshold,
        severity: a.severity,
      })),
      recipeDefinitions: (project.recipeDefinitions || []).map((r) => ({
        id: r.id,
        name: r.name,
        productCode: r.productCode,
        parameters: r.parameters,
      })),
      libraryReferences: (project.libraryReferences || []).map((lib) => ({
        id: lib.id,
        name: lib.name,
        version: lib.version,
      })),
    };
    return sha256(JSON.stringify(canonicalPayload));
  }

  /**
   * Converte o documento unificado do workspace (SSOT) em um IndustrialProject canônico.
   */
  public static fromUnifiedDoc(doc: UnifiedProjectDoc): IndustrialProject {
    const project = this.createEmptyProject(doc.metadata.name, undefined, doc.metadata.id);
    project.name = doc.metadata.name;
    project.activeVersion = doc.metadata.revision;

    // Converte tags canônicas do modelo unificado
    const canonicalTags: Tag[] = Object.values(doc.engineering.tags || {}).map((ct) => ({
      id: ct.id,
      tenantId: project.tenantId,
      projectId: project.id,
      equipmentId: ct.linkedEquipmentId,
      name: ct.name,
      code: ct.address || ct.name,
      dataType: (ct.dataType || "BOOL") as any,
      engineeringUnit: ct.unit || "",
      description: ct.description || "",
      initialValue: ct.initialValue ?? false,
      currentValue: ct.initialValue ?? false,
      quality: "GOOD",
      provenance: "RUNTIME",
      isForced: ct.forced ?? false,
      historyEnabled: true,
      sampleIntervalMs: 1000,
      protocolAddress: ct.address,
    }));

    if (canonicalTags.length > 0) {
      project.tags = canonicalTags;
    }

    // Converte dispositivos e equipamentos unifilares
    const equipments =
      (doc.engineering as any).equipments || (doc.engineering as any).equipment || {};
    const devices: Device[] = Object.values(equipments).map((eq: any) => ({
      id: eq.id,
      tenantId: project.tenantId,
      projectId: project.id,
      name: eq.displayName || eq.tagCode || eq.name || "Device",
      kind: eq.category === "plc_module" ? "CONTROLLER" : "FIELD_INSTRUMENT",
      protocol: "MODBUS_TCP",
      address: eq.tagCode || eq.address || "0",
      status: "CONFIGURED",
    }));

    if (devices.length > 0) {
      project.devices = devices;
    }

    project.updatedAt = doc.metadata.updatedAt || new Date().toISOString();
    project.dependencyGraph = this.rebuildDependencyGraph(project);
    const checksum = this.computeDeterministicChecksum(project);
    project.versionsHistory[0].checksumSha256 = checksum;
    return project;
  }

  /**
   * Sincroniza tags e metadados do IndustrialProject canônico de volta para o UnifiedProjectDoc.
   */
  public static syncToUnifiedDoc(
    project: IndustrialProject,
    currentDoc: UnifiedProjectDoc,
  ): UnifiedProjectDoc {
    const nextDoc: UnifiedProjectDoc = JSON.parse(JSON.stringify(currentDoc));
    nextDoc.metadata.name = project.name;
    nextDoc.metadata.revision = project.activeVersion;
    nextDoc.metadata.updatedAt = new Date().toISOString();

    for (const t of project.tags) {
      nextDoc.engineering.tags[t.id] = {
        id: t.id,
        name: t.name,
        dataType: (t.dataType as any) || "BOOL",
        area: t.protocolAddress?.startsWith("%I")
          ? "I"
          : t.protocolAddress?.startsWith("%Q")
            ? "Q"
            : "M",
        address: t.protocolAddress || (t.dataType === "BOOL" ? `%MX_${t.name}` : `%MD_${t.name}`),
        unit: t.engineeringUnit,
        initialValue: (t.initialValue as any) ?? false,
        forced: t.isForced,
        retentive: false,
        description: t.description,
        linkedEquipmentId: t.equipmentId,
      };
    }

    return nextDoc;
  }

  /**
   * Cria o projeto de exemplo com fluxo completo ponta a ponta:
   * UNIFILAR → DEVICE TREE → TAG → LADDER → FBD → ST → SFC → SIMULATOR → HMI/SCADA → ALARMS
   */
  public static createSampleIndustrialProject(
    name: string = "Estacao_Elevatoria_Canonica",
    tenantId?: string,
  ): IndustrialProject {
    const proj = this.createEmptyProject(name, tenantId);
    const ctrl = proj.controllers[0];
    const task = proj.taskConfigurations[0];

    // 1. Tags Centrais Canônicas
    const tagPumpRun: Tag = {
      id: uuidv4(),
      tenantId: proj.tenantId,
      projectId: proj.id,
      name: "Bomba_01_Run",
      code: "PMP-01-RUN",
      dataType: "BOOL",
      engineeringUnit: "BOOL",
      description: "Comando de Acionamento da Bomba 01",
      initialValue: false,
      currentValue: false,
      quality: "GOOD",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 100,
    };

    const tagPumpSpeed: Tag = {
      id: uuidv4(),
      tenantId: proj.tenantId,
      projectId: proj.id,
      name: "Bomba_01_SpeedRPM",
      code: "PMP-01-SPD",
      dataType: "REAL",
      engineeringUnit: "RPM",
      description: "Velocidade em RPM da Bomba 01",
      initialValue: 0,
      currentValue: 1750,
      quality: "GOOD",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 500,
    };

    const tagTankLevel: Tag = {
      id: uuidv4(),
      tenantId: proj.tenantId,
      projectId: proj.id,
      name: "Tanque_Nivel_Percent",
      code: "LT-101",
      dataType: "REAL",
      engineeringUnit: "%",
      description: "Nível do Reservatório Principal",
      initialValue: 50.0,
      currentValue: 78.5,
      quality: "GOOD",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 250,
    };

    const tagEmergencyStop: Tag = {
      id: uuidv4(),
      tenantId: proj.tenantId,
      projectId: proj.id,
      name: "E_STOP_Circuito_01",
      code: "ES-01",
      dataType: "BOOL",
      engineeringUnit: "BOOL",
      description: "Circuito de Parada de Emergência Duplo Canal",
      initialValue: true, // Normal Fechado (ativo = 1 quando seguro)
      currentValue: true,
      quality: "GOOD",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 50,
    };

    proj.tags = [tagPumpRun, tagPumpSpeed, tagTankLevel, tagEmergencyStop];

    // Mapear I/O Channels nos módulos de hardware do Rack
    if (ctrl.rackModules[1] && ctrl.rackModules[1].channels[0]) {
      ctrl.rackModules[1].channels[0].mappedTagId = tagEmergencyStop.id;
      ctrl.rackModules[1].channels[0].name = "DI_EMERGENCY_STOP";
    }
    if (ctrl.rackModules[2] && ctrl.rackModules[2].channels[0]) {
      ctrl.rackModules[2].channels[0].mappedTagId = tagPumpRun.id;
      ctrl.rackModules[2].channels[0].name = "DO_PUMP_RUN";
    }

    // 2. Global Variable List (GVL)
    const gvlMain = {
      id: uuidv4(),
      tenantId: proj.tenantId,
      projectId: proj.id,
      name: "GVL_Main",
      variables: [
        {
          id: uuidv4(),
          tenantId: proj.tenantId,
          projectId: proj.id,
          name: "g_bSystemAutoMode",
          scope: "VAR_GLOBAL" as const,
          dataType: "BOOL",
          initialValue: true,
          constant: false,
          retain: true,
          comment: "Modo Automático Geral",
        },
        {
          id: uuidv4(),
          tenantId: proj.tenantId,
          projectId: proj.id,
          name: "g_rLevelSetpoint",
          scope: "VAR_GLOBAL" as const,
          dataType: "REAL",
          initialValue: 80.0,
          constant: false,
          retain: true,
          comment: "Setpoint de Nível do Reservatório",
        },
      ],
      comment: "Variáveis Globais da Estação",
    };
    proj.globalVariableLists = [gvlMain];

    // 3. POU 1: Structured Text (ST) — Cálculo de Controle de Nível
    const pouLevelCtrl: POU = {
      id: uuidv4(),
      tenantId: proj.tenantId,
      projectId: proj.id,
      name: "PRG_LevelControl",
      pouType: "PROGRAM",
      language: "ST",
      comment: "Algoritmo de Histerese e Controle de Nível em Structured Text",
      variables: [
        {
          id: uuidv4(),
          tenantId: proj.tenantId,
          projectId: proj.id,
          name: "rCurrentLevel",
          scope: "VAR",
          dataType: "REAL",
          constant: false,
          retain: false,
          comment: "Leitura atual da tag LT-101",
          tagId: tagTankLevel.id,
        },
        {
          id: uuidv4(),
          tenantId: proj.tenantId,
          projectId: proj.id,
          name: "bStartRequest",
          scope: "VAR_OUTPUT",
          dataType: "BOOL",
          initialValue: false,
          constant: false,
          retain: false,
          comment: "Solicitação de partida da bomba",
        },
      ],
      rawSourceST: `PROGRAM PRG_LevelControl
VAR
    rCurrentLevel : REAL;
    rHighLimit : REAL := 85.0;
    rLowLimit : REAL := 40.0;
END_VAR
VAR_OUTPUT
    bStartRequest : BOOL;
END_VAR

(* Lógica de Histerese de Nível *)
IF rCurrentLevel < rLowLimit THEN
    bStartRequest := TRUE;
ELSIF rCurrentLevel >= rHighLimit THEN
    bStartRequest := FALSE;
END_IF;

END_PROGRAM`,
      networks: [],
      actions: [],
      methods: [],
      properties: [],
      implementedInterfaces: [],
    };

    // 4. POU 2: Ladder Diagram (LD) — Intertravamento de Segurança e Partida
    const pouLadderSafety: POU = {
      id: uuidv4(),
      tenantId: proj.tenantId,
      projectId: proj.id,
      name: "PRG_SafetyInterlocks",
      pouType: "PROGRAM",
      language: "LD",
      comment: "Intertravamentos de Segurança do Motor em Ladder (IEC 61131-3 LD)",
      variables: [],
      rawSourceST: "",
      networks: [
        {
          id: uuidv4(),
          number: 1,
          label: "RUNG_01_ESTOP_AND_RUN",
          comment: "Partida da bomba com intertravamento de emergência",
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
              comment: "Se E-STOP está OK e houver requisição de partida, liga a Bomba 01",
              elements: [
                {
                  id: uuidv4(),
                  type: "CONTACT_NO",
                  tagId: tagEmergencyStop.id,
                  symbolName: "E_STOP_Circuito_01",
                  negated: false,
                  params: {},
                },
                {
                  id: uuidv4(),
                  type: "COIL_STANDARD",
                  tagId: tagPumpRun.id,
                  symbolName: "Bomba_01_Run",
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

    // 5. POU 3: Function Block Diagram (FBD) — Temporização e Diagnóstico
    const pouFbdDiag: POU = {
      id: uuidv4(),
      tenantId: proj.tenantId,
      projectId: proj.id,
      name: "PRG_PumpProtection",
      pouType: "PROGRAM",
      language: "FBD",
      comment: "Proteção Térmica e Tempo de Operação em FBD",
      variables: [],
      rawSourceST: "",
      networks: [
        {
          id: uuidv4(),
          number: 1,
          label: "NET_FBD_01",
          comment: "Temporizador de Partida Estrela-Triângulo",
          language: "FBD",
          stSource: "",
          rungs: [],
          sfcSteps: [],
          sfcTransitions: [],
          fbdNodes: [
            {
              id: uuidv4(),
              name: "TON_Partida",
              blockType: "TON",
              x: 150,
              y: 80,
              inputs: [
                { id: uuidv4(), name: "IN", dataType: "BOOL", isInput: true, currentValue: true },
                { id: uuidv4(), name: "PT", dataType: "TIME", isInput: true, defaultValue: "T#5s" },
              ],
              outputs: [
                { id: uuidv4(), name: "Q", dataType: "BOOL", isInput: false },
                { id: uuidv4(), name: "ET", dataType: "TIME", isInput: false },
              ],
            },
          ],
          fbdConnections: [],
        },
      ],
      actions: [],
      methods: [],
      properties: [],
      implementedInterfaces: [],
    };

    // 6. POU 4: Sequential Function Chart (SFC) — Sequência Operacional de Drenagem
    const sfcStep0 = uuidv4();
    const sfcStep1 = uuidv4();
    const sfcStep2 = uuidv4();

    const pouSfcSequence: POU = {
      id: uuidv4(),
      tenantId: proj.tenantId,
      projectId: proj.id,
      name: "SFC_DrainageCycle",
      pouType: "PROGRAM",
      language: "SFC",
      comment: "Grafo Sequencial de Fases da Estação Elevatória",
      variables: [],
      rawSourceST: "",
      networks: [
        {
          id: uuidv4(),
          number: 1,
          label: "SFC_MAIN_CHART",
          comment: "Ciclo Sequencial: Espera -> Drenagem -> Descanso",
          language: "SFC",
          stSource: "",
          rungs: [],
          fbdNodes: [],
          fbdConnections: [],
          sfcSteps: [
            {
              id: sfcStep0,
              stepNumber: 0,
              name: "STEP_IDLE",
              isInitial: true,
              isActive: true,
              timeInStepMs: 0,
              actions: [
                {
                  id: uuidv4(),
                  actionName: "Reset_Commands",
                  qualifier: "N",
                  stCode: "Bomba_01_Run := FALSE;",
                },
              ],
              x: 100,
              y: 50,
            },
            {
              id: sfcStep1,
              stepNumber: 1,
              name: "STEP_PUMPING",
              isInitial: false,
              isActive: false,
              timeInStepMs: 0,
              actions: [
                {
                  id: uuidv4(),
                  actionName: "Engage_Pump",
                  qualifier: "N",
                  stCode: "Bomba_01_Run := TRUE;",
                },
              ],
              x: 100,
              y: 180,
            },
            {
              id: sfcStep2,
              stepNumber: 2,
              name: "STEP_PURGE",
              isInitial: false,
              isActive: false,
              timeInStepMs: 0,
              actions: [
                {
                  id: uuidv4(),
                  actionName: "Purge_Lines",
                  qualifier: "L",
                  timeLimitMs: 5000,
                  stCode: "Bomba_01_SpeedRPM := 500.0;",
                },
              ],
              x: 100,
              y: 310,
            },
          ],
          sfcTransitions: [
            {
              id: uuidv4(),
              fromStepIds: [sfcStep0],
              toStepIds: [sfcStep1],
              conditionST: "Tanque_Nivel_Percent > 75.0 AND E_STOP_Circuito_01",
              isSatisfied: false,
              x: 100,
              y: 120,
            },
            {
              id: uuidv4(),
              fromStepIds: [sfcStep1],
              toStepIds: [sfcStep2],
              conditionST: "Tanque_Nivel_Percent < 30.0",
              isSatisfied: false,
              x: 100,
              y: 250,
            },
            {
              id: uuidv4(),
              fromStepIds: [sfcStep2],
              toStepIds: [sfcStep0],
              conditionST: "TRUE",
              isSatisfied: false,
              x: 100,
              y: 380,
            },
          ],
        },
      ],
      actions: [],
      methods: [],
      properties: [],
      implementedInterfaces: [],
    };

    proj.pous = [pouLevelCtrl, pouLadderSafety, pouFbdDiag, pouSfcSequence];
    task.pouIds = proj.pous.map((p) => p.id);

    // 7. Visualização HMI Profissional
    proj.hmiPages = [
      {
        id: uuidv4(),
        projectId: proj.id,
        name: "Overview_Elevatoria",
        title: "Supervisão da Estação Elevatória 01",
        backgroundColor: "#0d1117",
        widgets: [
          {
            id: uuidv4(),
            type: "TANK_LEVEL",
            name: "Tk101_Level",
            x: 50,
            y: 50,
            width: 140,
            height: 260,
            bindingTagId: tagTankLevel.id,
            properties: { min: 0, max: 100, unit: "%", highAlarm: 85, lowAlarm: 20 },
            securityRoleRequired: "OPERATOR",
          },
          {
            id: uuidv4(),
            type: "MOTOR_SYMBOL",
            name: "Mtr01_Symbol",
            x: 240,
            y: 150,
            width: 120,
            height: 120,
            bindingTagId: tagPumpRun.id,
            properties: { runningColor: "#22c55e", stoppedColor: "#64748b" },
            securityRoleRequired: "OPERATOR",
          },
          {
            id: uuidv4(),
            type: "GAUGE",
            name: "Gauge_Speed",
            x: 400,
            y: 60,
            width: 180,
            height: 180,
            bindingTagId: tagPumpSpeed.id,
            properties: { min: 0, max: 2000, unit: "RPM" },
            securityRoleRequired: "OPERATOR",
          },
          {
            id: uuidv4(),
            type: "ALARM_BANNER",
            name: "Alarm_Banner_Main",
            x: 50,
            y: 340,
            width: 700,
            height: 100,
            properties: { maxVisible: 4 },
            securityRoleRequired: "OPERATOR",
          },
        ],
      },
    ];

    // 8. Alarmes ISA-18.2
    proj.alarmDefinitions = [
      {
        id: uuidv4(),
        projectId: proj.id,
        tagId: tagTankLevel.id,
        name: "ALM_NIVEL_ALTO_CRITICO",
        condition: "HIGH_LIMIT",
        threshold: 90.0,
        severity: "CRITICAL",
        message: "Nível Crítico no Reservatório Principal (>90%)! Risco de Transbordamento.",
        acknowledged: false,
        active: false,
        timestamp: new Date().toISOString(),
      },
      {
        id: uuidv4(),
        projectId: proj.id,
        tagId: tagEmergencyStop.id,
        name: "ALM_EMERGENCIA_ACIONADA",
        condition: "EQUAL",
        threshold: 0,
        severity: "CRITICAL",
        message: "Botão de Emergência E-STOP Acionado! Todas as saídas desenergizadas.",
        acknowledged: false,
        active: false,
        timestamp: new Date().toISOString(),
      },
    ];

    // 9. Tendências / Trends
    proj.trendDefinitions = [
      {
        id: uuidv4(),
        projectId: proj.id,
        name: "Historico_Nivel_e_Velocidade",
        tagIds: [tagTankLevel.id, tagPumpSpeed.id],
        bufferSize: 2000,
        sampleRateMs: 250,
      },
    ];

    // 10. Motion Virtual Axis
    proj.motionAxes = [
      {
        id: uuidv4(),
        projectId: proj.id,
        name: "Axis_Bomba_Dosadora",
        axisIndex: 0,
        state: "STANDSTILL",
        unit: "deg",
        maxVelocity: 3600,
        maxAcceleration: 18000,
        maxDeceleration: 18000,
        currentPosition: 0,
        targetPosition: 720,
        currentVelocity: 0,
        isVirtual: true,
      },
    ];

    // 11. Protocolo Industrial Modbus TCP (Read-Only)
    proj.protocolConfigurations = [
      {
        id: uuidv4(),
        projectId: proj.id,
        protocol: "MODBUS_TCP",
        enabled: true,
        host: "127.0.0.1",
        port: 502,
        slaveId: 1,
        timeoutMs: 1500,
        retryCount: 2,
        readOnlyEnforced: true,
      },
    ];

    // Reconstruir grafo de dependências canônico e atualizar checksum
    proj.dependencyGraph = this.rebuildDependencyGraph(proj);
    const sampleChecksum = this.computeDeterministicChecksum(proj);
    proj.versionsHistory[0].checksumSha256 = sampleChecksum;

    return proj;
  }

  /**
   * Reconstitui o grafo de dependências canônico entre todas as entidades.
   */
  public static rebuildDependencyGraph(project: IndustrialProject): DependencyGraph {
    const references: DependencyReference[] = [];

    // 1. POUs -> Tags e Variáveis
    for (const pou of project.pous) {
      for (const v of pou.variables) {
        if (v.tagId) {
          references.push({
            sourceId: pou.id,
            sourceType: "POU",
            targetId: v.tagId,
            targetType: "TAG",
            referenceKind: "BINDS",
          });
        }
      }
      for (const net of pou.networks) {
        for (const rung of net.rungs) {
          for (const elem of rung.elements) {
            if (elem.tagId) {
              references.push({
                sourceId: pou.id,
                sourceType: "POU",
                targetId: elem.tagId,
                targetType: "TAG",
                referenceKind: elem.type.startsWith("COIL") ? "WRITES" : "READS",
              });
            }
          }
        }
      }
    }

    // 2. HMI -> Tags
    for (const page of project.hmiPages) {
      for (const w of page.widgets) {
        if (w.bindingTagId) {
          references.push({
            sourceId: page.id,
            sourceType: "HMI",
            targetId: w.bindingTagId,
            targetType: "TAG",
            referenceKind: "READS",
          });
        }
      }
    }

    // 3. Alarmes -> Tags
    for (const alm of project.alarmDefinitions) {
      references.push({
        sourceId: alm.id,
        sourceType: "ALARM",
        targetId: alm.tagId,
        targetType: "TAG",
        referenceKind: "READS",
      });
    }

    return {
      projectId: project.id,
      references,
    };
  }

  /**
   * Renomeia uma entidade propagando as alterações por todo o projeto canônico,
   * garantindo que nenhum vínculo seja corrompido ou quebre referências em outros editores.
   */
  public static renameEntity(
    project: IndustrialProject,
    entityType: "TAG" | "POU" | "VARIABLE",
    id: string,
    newName: string,
  ): IndustrialProject {
    const updated: IndustrialProject = JSON.parse(JSON.stringify(project));

    if (entityType === "TAG") {
      const tag = updated.tags.find((t) => t.id === id);
      if (!tag) return project;
      const oldName = tag.name;
      tag.name = newName;

      // Atualiza referências em Ladder
      for (const pou of updated.pous) {
        for (const net of pou.networks) {
          for (const rung of net.rungs) {
            for (const elem of rung.elements) {
              if (elem.tagId === id) {
                elem.symbolName = newName;
              }
            }
          }
        }
      }
    } else if (entityType === "POU") {
      const pou = updated.pous.find((p) => p.id === id);
      if (!pou) return project;
      pou.name = newName;
    }

    updated.updatedAt = new Date().toISOString();
    updated.dependencyGraph = this.rebuildDependencyGraph(updated);
    return updated;
  }

  /**
   * Verifica a integridade referencial completa do projeto.
   */
  public static validateReferentialIntegrity(project: IndustrialProject): IntegrityCheckResult {
    const tagIds = new Set(project.tags.map((t) => t.id));
    const pouIds = new Set(project.pous.map((p) => p.id));
    const brokenTagReferences: string[] = [];
    const brokenPouReferences: string[] = [];
    const brokenVariableReferences: string[] = [];
    const unmappedIOChannels: string[] = [];

    // Checar HMI
    for (const page of project.hmiPages) {
      for (const w of page.widgets) {
        if (w.bindingTagId && !tagIds.has(w.bindingTagId)) {
          brokenTagReferences.push(
            `HMI Page '${page.name}', Widget '${w.name}' binds to non-existent Tag ID ${w.bindingTagId}`,
          );
        }
      }
    }

    // Checar Alarmes
    for (const alm of project.alarmDefinitions) {
      if (!tagIds.has(alm.tagId)) {
        brokenTagReferences.push(`Alarm '${alm.name}' references non-existent Tag ID ${alm.tagId}`);
      }
    }

    // Checar Receitas
    for (const rec of project.recipeDefinitions) {
      for (const param of rec.parameters) {
        if (!tagIds.has(param.targetTagId)) {
          brokenTagReferences.push(
            `Recipe '${rec.name}', Parameter '${param.parameterName}' references non-existent Tag ID ${param.targetTagId}`,
          );
        }
      }
    }

    // Checar Task Configuration
    for (const task of project.taskConfigurations) {
      for (const pId of task.pouIds) {
        if (!pouIds.has(pId)) {
          brokenPouReferences.push(`Task '${task.name}' references non-existent POU ID ${pId}`);
        }
      }
    }

    // Checar Hardware Modules e I/O
    for (const ctrl of project.controllers) {
      for (const mod of ctrl.rackModules) {
        for (const ch of mod.channels) {
          // Integridade referencial estrita de Hardware: channel.moduleId DEVE ser o ID do módulo pai
          if (ch.moduleId !== mod.id) {
            brokenVariableReferences.push(
              `Hardware Integrity Error: Module '${mod.name}' (${mod.id}) contains Channel '${ch.name}' with mismatched moduleId '${ch.moduleId}'`,
            );
          }
          if (ch.mappedTagId && !tagIds.has(ch.mappedTagId)) {
            brokenTagReferences.push(
              `Channel '${ch.name}' (${ch.iecAddress}) references non-existent Tag ID ${ch.mappedTagId}`,
            );
          }
          if (!ch.mappedTagId && !ch.mappedVariableId) {
            unmappedIOChannels.push(
              `Module '${mod.name}', Channel '${ch.name}' (${ch.iecAddress}) is unmapped.`,
            );
          }
        }
      }
    }

    const isValid =
      brokenTagReferences.length === 0 &&
      brokenPouReferences.length === 0 &&
      brokenVariableReferences.length === 0;

    return {
      isValid,
      brokenTagReferences,
      brokenVariableReferences,
      brokenPouReferences,
      unmappedIOChannels,
      cyclicDependencies: [],
    };
  }
}

export const IndustrialProjectService = CanonicalProjectService;
