import { describe, it, expect } from "vitest";
import { TransversalE2EScenario } from "../canonical/e2e-scenario";
import { IndustrialLibraryManager, LibraryRegistry } from "../libraries/library-manager";
import { IECCompilerPipeline } from "../iec/compiler/compiler-pipeline";
import { MultiTypeTaskManager } from "../iec/task/task-manager";
import { InteractiveDebuggerService } from "../iec/debugger/debugger-service";
import { TraceOscilloscopeEngine } from "../iec/debugger/trace-engine";
import {
  ISA18AlarmLifecycleEngine,
  HMIScadaBridge,
  IndustrialRecipeManager,
} from "../scada/hmi-scada-bridge";
import { ProjectComparisonEngine } from "../comparison/project-comparison";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "../canonical/types";

describe("Milestone 10: Transversal E2E Plant Scenario & Comprehensive Validation", () => {
  it("Executa os 15 passos do cenário transversal ponta a ponta: Subestação -> PLC -> Tags -> Alarmes -> SCADA -> Receitas -> 3-Way Merge", () => {
    // 0. Salvaguarda Inviolável
    expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);

    // Passo 1: Projeto industrial integrado com controlador SoftPLC e rack de I/O
    const project = TransversalE2EScenario.createComprehensivePlantProject();
    expect(project.name).toBe("Planta_Elevatoria_Subestacao_E2E");
    expect(project.controllers.length).toBe(1);
    const ctrl = project.controllers[0];
    expect(ctrl.rackModules.length).toBe(3);
    expect(ctrl.rackModules[0].channels[0].iecAddress).toBe("%IX0.0");
    expect(ctrl.rackModules[1].channels[0].iecAddress).toBe("%IW64");
    expect(ctrl.rackModules[2].channels[0].iecAddress).toBe("%QX0.0");

    // Passo 2: Declaração de Tags canônicas com tipos IEC e mapeamento de I/O
    expect(project.tags.length).toBe(4);
    const tagEstop = project.tags.find((t) => t.code === "ES-101")!;
    const tagLevel = project.tags.find((t) => t.code === "LT-101")!;
    const tagPump = project.tags.find((t) => t.code === "PM-101")!;
    expect(tagEstop.dataType).toBe("BOOL");
    expect(tagLevel.dataType).toBe("REAL");
    expect(tagPump.dataType).toBe("BOOL");

    // Passo 3: POU em ST (Controle de Nível de Reservatório)
    const pouST = project.pous.find((p) => p.name === "PRG_LevelControl_ST")!;
    expect(pouST.language).toBe("ST");
    expect(pouST.rawSourceST).toContain("IF rCurrentLevel >= rHighLimit");

    // Passo 4: POU em Ladder (Intertravamento de Segurança E-STOP)
    const pouLD = project.pous.find((p) => p.name === "PRG_Safety_LD")!;
    expect(pouLD.language).toBe("LD");
    expect(pouLD.networks[0].rungs.length).toBeGreaterThan(0);

    // Passo 5: POU em FBD (Proteção de Sobrecorrente)
    const pouFBD = project.pous.find((p) => p.name === "PRG_Protection_FBD")!;
    expect(pouFBD.language).toBe("FBD");
    expect(pouFBD.networks[0].fbdNodes.length).toBe(2);
    expect(pouFBD.networks[0].fbdConnections.length).toBe(1);

    // Passo 6: POU em SFC (Sequenciador de Operação da Estação)
    const pouSFC = project.pous.find((p) => p.name === "PRG_Sequencer_SFC")!;
    expect(pouSFC.language).toBe("SFC");
    expect(pouSFC.networks[0].sfcSteps.length).toBe(5);
    expect(pouSFC.networks[0].sfcTransitions.length).toBe(4);

    // Passo 7: Configuração de Tarefas (MainTask, FastTask, EventTask)
    expect(project.taskConfigurations.length).toBe(3);
    const mainTask = project.taskConfigurations.find(
      (t) => t.type === "CYCLIC" && t.intervalMs === 10,
    )!;
    const fastTask = project.taskConfigurations.find(
      (t) => t.type === "CYCLIC" && t.intervalMs === 2,
    )!;
    const eventTask = project.taskConfigurations.find((t) => t.type === "EVENT")!;
    expect(mainTask).toBeDefined();
    expect(fastTask).toBeDefined();
    expect(eventTask).toBeDefined();

    // Passo 8: Resolução de Bibliotecas e Placeholders
    const libMgr = new IndustrialLibraryManager(LibraryRegistry.getInstance());
    const libRes = libMgr.resolveProjectLibraries(project);
    expect(libRes.isSuccessful).toBe(true);
    expect(libRes.resolved.some((r) => r.name === "#Standard")).toBe(true);
    expect(libRes.resolved.some((r) => r.name === "ElectricalProtection")).toBe(true);

    // Passo 9: Compilação Completa gerando IR Unificado
    const compRes = IECCompilerPipeline.compile(project);
    expect(compRes.success).toBe(true);
    expect(compRes.compiledIR).toBeDefined();
    const ir = compRes.compiledIR!;
    expect(Object.keys(ir.blocks).length).toBeGreaterThanOrEqual(2);

    // Passo 10: Execução Determinística de 100 Ciclos de Runtime
    const taskMgr = new MultiTypeTaskManager(project.taskConfigurations);
    let watchdogFaultsCount = 0;
    for (let cycle = 0; cycle < 100; cycle++) {
      const step = taskMgr.evaluateAndExecute(cycle * 10, (tagId) => {
        const tag = project.tags.find((t) => t.id === tagId);
        return tag ? tag.currentValue : false;
      });
      if (step.watchdogFaults.length > 0) watchdogFaultsCount += step.watchdogFaults.length;
    }
    expect(watchdogFaultsCount).toBe(0);

    // Passo 11: Depuração Interativa (Breakpoints e Watches)
    const dbg = new InteractiveDebuggerService(ir);
    const bp = dbg.setBreakpoint("PRG_LevelControl_ST", 1);
    expect(bp.enabled).toBe(true);
    dbg.addWatch("rCurrentLevel");
    dbg.stepInstruction();
    expect(dbg.getWatches().length).toBe(1);
    expect(dbg.getCurrentLocation().instructionIndex).toBeGreaterThan(0);

    // Passo 12: Trace Osciloscópio Multicanal com Disparo por Threshold e Exportação CSV
    const traceCfg = project.traceConfigurations[0];
    const traceEngine = new TraceOscilloscopeEngine(traceCfg);
    traceEngine.arm();
    expect(traceEngine.isRecording()).toBe(true);

    for (let t = 0; t < 10; t++) {
      traceEngine.recordSample(t * 10, (nameOrId) => {
        if (nameOrId === tagLevel.name || nameOrId === tagLevel.id) return 60.0;
        return 0;
      });
    }

    traceEngine.recordSample(100, (nameOrId) => {
      if (nameOrId === tagLevel.name || nameOrId === tagLevel.id) return 78.5;
      return 1;
    });

    for (let t = 11; t < 25; t++) {
      traceEngine.recordSample(t * 10, (nameOrId) => {
        if (nameOrId === tagLevel.name || nameOrId === tagLevel.id) return 80.0;
        return 1;
      });
    }

    const traceSamples = traceEngine.getSamples();
    expect(traceSamples.length).toBeGreaterThan(0);
    const triggerSample = traceSamples.find((s) => s.isTriggerSample);
    expect(triggerSample).toBeDefined();
    const csvData = traceEngine.exportToCSV();
    expect(csvData).toContain("Timestamp_ms");
    expect(csvData).toContain(tagLevel.name);

    // Passo 13: Ciclo de Vida de Alarmes ISA-18.2
    const alarmEngine = new ISA18AlarmLifecycleEngine();
    const alarmDef = project.alarmDefinitions[0];

    const a0 = alarmEngine.evaluateAlarm(alarmDef, 65.5);
    expect(a0.state).toBe("NORMAL");

    const a1 = alarmEngine.evaluateAlarm(alarmDef, 92.0);
    expect(a1.state).toBe("UNACKNOWLEDGED_ACTIVE");

    const ackOk = alarmEngine.acknowledgeAlarm(alarmDef.id, "Operador_Planta");
    expect(ackOk).toBe(true);
    expect(alarmEngine.getActiveAlarms()[0].state).toBe("ACKNOWLEDGED_ACTIVE");

    alarmEngine.shelveAlarm(alarmDef.id, 15);
    expect(alarmEngine.getActiveAlarms()[0].state).toBe("SHELVED");

    // Faceplate HMI
    const tagMap = new Map(project.tags.map((t) => [t.id, t]));
    const motorWidget = project.hmiPages[0].widgets.find((w) => w.type === "MOTOR_SYMBOL")!;
    const faceplateMotor = HMIScadaBridge.resolveWidgetState(
      motorWidget,
      tagMap,
      alarmEngine.getActiveAlarms(),
    );
    expect(faceplateMotor.statusText).toBe("PARADO");

    // Passo 14: Gestão de Receitas Industriais (Snapshot, Validação e Aplicação Atômica)
    const recipeMgr = new IndustrialRecipeManager(project.recipeDefinitions);
    const recipeA = project.recipeDefinitions[0];
    const recipeResA = recipeMgr.applyRecipe(recipeA.id, project.tags);
    expect(recipeResA.appliedCount).toBe(1);
    expect(tagLevel.currentValue).toBe(70.0);

    const recipeB = project.recipeDefinitions[1];
    const recipeResB = recipeMgr.applyRecipe(recipeB.id, project.tags);
    expect(recipeResB.appliedCount).toBe(1);
    expect(tagLevel.currentValue).toBe(85.0);

    // Restaura Receita A atomicamente
    recipeMgr.applyRecipe(recipeA.id, project.tags);
    expect(tagLevel.currentValue).toBe(70.0);

    // Passo 15: Semantic Diff e Three-Way Merge de Projetos
    const modifiedMine = JSON.parse(JSON.stringify(project));
    const modifiedTheirs = JSON.parse(JSON.stringify(project));

    modifiedMine.tags[0].name = "EmergencyStop_Subestacao_Local";
    modifiedTheirs.taskConfigurations.push({
      id: "task-theirs-3",
      controllerId: ctrl.id,
      name: "RemoteDiagnosticsTask",
      type: "CYCLIC",
      priority: 2,
      intervalMs: 100,
      watchdogMs: 500,
      watchdogSensitivity: 1,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: [],
      enabled: true,
    });

    const diff = ProjectComparisonEngine.compareProjects(project, modifiedMine);
    expect(diff.hasDifferences).toBe(true);

    const mergeRes = ProjectComparisonEngine.threeWayMerge(project, modifiedMine, modifiedTheirs);
    expect(mergeRes.hasConflicts).toBe(false);
    expect(mergeRes.mergedProject.tags[0].name).toBe("EmergencyStop_Subestacao_Local");
    expect(
      mergeRes.mergedProject.taskConfigurations.some((t) => t.name === "RemoteDiagnosticsTask"),
    ).toBe(true);
  });
});
