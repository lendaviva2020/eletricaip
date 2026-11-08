import { describe, it, expect } from "vitest";
import { TransversalE2EScenario } from "../canonical/e2e-scenario";
import { IndustrialLibraryManager, LibraryRegistry } from "../libraries/library-manager";
import { IECCompilerPipeline } from "../iec/compiler/compiler-pipeline";
import { MultiTypeTaskManager } from "../iec/task/task-manager";
import { InteractiveDebuggerService } from "../iec/debugger/debugger-service";
import { ISA18AlarmLifecycleEngine, HMIScadaBridge, IndustrialRecipeManager } from "../scada/hmi-scada-bridge";
import { ProjectComparisonEngine } from "../comparison/project-comparison";
import { IS_PHYSICAL_CONTROL_ALLOWED } from "../canonical/types";

describe("Milestone 10: Transversal E2E Plant Scenario & Comprehensive Validation", () => {
  it("Executa fluxo transversal ponta a ponta: Subestação -> PLC -> Tags -> Alarmes -> SCADA -> Receitas", () => {
    // 0. Salvaguarda Inviolável
    expect(IS_PHYSICAL_CONTROL_ALLOWED).toBe(false);

    // 1. Criação do Projeto Canônico Transversal
    const project = TransversalE2EScenario.createComprehensivePlantProject();
    expect(project.name).toBe("Planta_Elevatoria_Subestacao_E2E");
    expect(project.controllers.length).toBe(1);
    expect(project.tags.length).toBe(4);
    expect(project.pous.length).toBe(2);

    // 2. Resolução de Bibliotecas e Placeholders
    const libMgr = new IndustrialLibraryManager(LibraryRegistry.getInstance());
    const libRes = libMgr.resolveProjectLibraries(project);
    expect(libRes.isSuccessful).toBe(true);
    expect(libRes.resolved.some((r) => r.name === "#Standard")).toBe(true);
    expect(libRes.resolved.some((r) => r.name === "ElectricalProtection")).toBe(true);

    // 3. Compilação do Projeto para IR
    const compRes = IECCompilerPipeline.compile(project);
    expect(compRes.success).toBe(true);
    expect(compRes.compiledIR).toBeDefined();
    expect(compRes.compilationResult.irBytecodeSize).toBeGreaterThan(0);

    const ir = compRes.compiledIR!;

    // 4. Execução do Runtime Multi-Tarefas com Watchdogs
    const taskMgr = new MultiTypeTaskManager(project.taskConfigurations);
    const execStep = taskMgr.evaluateAndExecute(0, (id) => {
      const tag = project.tags.find((t) => t.id === id);
      return tag ? tag.currentValue : false;
    });

    expect(execStep.executedTaskIds).toContain(project.taskConfigurations[0].id);
    expect(execStep.watchdogFaults.length).toBe(0);

    // 5. Sessão de Depuração Interativa (Breakpoints e Watches)
    const dbg = new InteractiveDebuggerService(ir);
    const bp = dbg.setBreakpoint("PRG_LevelControl_ST", 1);
    expect(bp.enabled).toBe(true);

    dbg.addWatch("rCurrentLevel");
    dbg.stepInstruction();
    expect(dbg.getWatches().length).toBe(1);

    // 6. Ciclo de Vida de Alarmes ISA-18.2 (Nível Alto do Tanque)
    const alarmEngine = new ISA18AlarmLifecycleEngine();
    const alarmDef = project.alarmDefinitions[0];

    // Nível atual é 65.5% < 85.0% -> NORMAL
    const a0 = alarmEngine.evaluateAlarm(alarmDef, 65.5);
    expect(a0.state).toBe("NORMAL");

    // Simula transbordamento: nível sobe para 92.0% -> UNACKNOWLEDGED_ACTIVE
    const a1 = alarmEngine.evaluateAlarm(alarmDef, 92.0);
    expect(a1.state).toBe("UNACKNOWLEDGED_ACTIVE");

    // Operador reconhece -> ACKNOWLEDGED_ACTIVE
    const ackOk = alarmEngine.acknowledgeAlarm(alarmDef.id, "Operador_Planta");
    expect(ackOk).toBe(true);

    // 7. Resolução de Faceplates HMI / SCADA
    const tagMap = new Map(project.tags.map((t) => [t.id, t]));
    const motorWidget = project.hmiPages[0].widgets.find((w) => w.type === "MOTOR_SYMBOL")!;
    const faceplateMotor = HMIScadaBridge.resolveWidgetState(motorWidget, tagMap, alarmEngine.getActiveAlarms());
    expect(faceplateMotor.statusText).toBe("PARADO");

    // 8. Gestão e Aplicação de Receitas Industriais
    const recipeMgr = new IndustrialRecipeManager(project.recipeDefinitions);
    const recipeRes = recipeMgr.applyRecipe(project.recipeDefinitions[0].id, project.tags);
    expect(recipeRes.appliedCount).toBe(1);
    const updatedTag = project.tags.find((t) => t.code === "LT-101");
    expect(updatedTag?.currentValue).toBe(70.0);

    // 9. Comparação e Versionamento de Projetos
    const modifiedProject = JSON.parse(JSON.stringify(project));
    modifiedProject.tags[0].name = "EmergencyStop_Subestacao_Renomeado";
    const diff = ProjectComparisonEngine.compareProjects(project, modifiedProject);
    expect(diff.hasDifferences).toBe(true);
    expect(diff.summary.renamedCount).toBe(1);
  });
});
