import { describe, it, expect } from "vitest";
import { ProjectComparisonEngine } from "../comparison/project-comparison";
import { IndustrialProject, POU, Tag } from "../canonical/types";
import { generateUuid as uuidv4 } from "../canonical/uuid";

describe("Milestone 6: Project Comparison, Semantic Diff & Version Control", () => {
  const baseProject: IndustrialProject = {
    id: "proj-1",
    tenantId: "tenant-1",
    name: "Projeto_Base",
    description: "Versao Inicial",
    activeVersion: 1,
    versionsHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    controllers: [],
    applications: [],
    devices: [],
    taskConfigurations: [
      {
        id: "task-1",
        controllerId: "c1",
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
      },
    ],
    pous: [
      {
        id: "pou-1",
        tenantId: "t1",
        projectId: "p1",
        name: "PRG_Base",
        pouType: "PROGRAM",
        language: "ST",
        comment: "",
        variables: [],
        rawSourceST: "count := count + 1;",
        networks: [],
        actions: [],
        methods: [],
        properties: [],
        implementedInterfaces: [],
      },
    ],
    dataTypes: [],
    globalVariableLists: [],
    tags: [
      {
        id: "tag-1",
        tenantId: "tenant-1",
        projectId: "p1",
        code: "LT-101",
        name: "Nivel_Tanque",
        dataType: "REAL",
        currentValue: 50.0,
        initialValue: 50.0,
        quality: "GOOD",
        engineeringUnit: "%",
        description: "",
        isForced: false,
        historyEnabled: true,
        sampleIntervalMs: 1000,
      },
    ],
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

  it("Detecta adições, remoções e modificações entre dois projetos", () => {
    const targetProject: IndustrialProject = JSON.parse(JSON.stringify(baseProject));

    // 1. Modifica o POU existente
    targetProject.pous[0].rawSourceST = "count := count + 5; (* modificado *)";

    // 2. Adiciona um novo POU
    const newPou: POU = {
      id: "pou-new-2",
      tenantId: "t1",
      projectId: "p1",
      name: "PRG_NovaLogica",
      pouType: "PROGRAM",
      language: "LD",
      comment: "",
      variables: [],
      rawSourceST: "",
      networks: [],
      actions: [],
      methods: [],
      properties: [],
      implementedInterfaces: [],
    };
    targetProject.pous.push(newPou);

    // 3. Adiciona uma nova Tag
    const newTag: Tag = {
      id: "tag-new-2",
      tenantId: "tenant-1",
      projectId: "p1",
      code: "PT-102",
      name: "Pressao_Linha",
      dataType: "REAL",
      currentValue: 3.5,
      initialValue: 0.0,
      quality: "GOOD",
      engineeringUnit: "bar",
      description: "",
      isForced: false,
      historyEnabled: true,
      sampleIntervalMs: 1000,
    };
    targetProject.tags.push(newTag);

    const diff = ProjectComparisonEngine.compareProjects(baseProject, targetProject);
    expect(diff.hasDifferences).toBe(true);
    expect(diff.summary.modifiedCount).toBe(1); // PRG_Base modificado
    expect(diff.summary.addedCount).toBe(2); // Novo POU e Nova Tag

    const pouDiff = diff.items.find((i) => i.entityType === "POU" && i.entityName === "PRG_Base");
    expect(pouDiff?.changeKind).toBe("MODIFIED");

    const newPouDiff = diff.items.find(
      (i) => i.entityType === "POU" && i.entityName === "PRG_NovaLogica",
    );
    expect(newPouDiff?.changeKind).toBe("ADDED");
  });

  it("Executa mesclagem não conflitante entre projetos", () => {
    const modifiedProject: IndustrialProject = JSON.parse(JSON.stringify(baseProject));
    const addedPou: POU = {
      id: uuidv4(),
      tenantId: "t1",
      projectId: "p1",
      name: "PRG_Adicionado",
      pouType: "PROGRAM",
      language: "ST",
      comment: "",
      variables: [],
      rawSourceST: "x := 1;",
      networks: [],
      actions: [],
      methods: [],
      properties: [],
      implementedInterfaces: [],
    };
    modifiedProject.pous.push(addedPou);

    const mergeResult = ProjectComparisonEngine.mergeNonConflicting(baseProject, modifiedProject);
    expect(mergeResult.conflicts.length).toBe(0);
    expect(mergeResult.mergedProject.pous.length).toBe(2);
    expect(mergeResult.mergedProject.pous.some((p) => p.name === "PRG_Adicionado")).toBe(true);
  });

  it("Executa Three-Way Merge com detecção precisa de conflitos e mesclagem limpa", () => {
    const mineProject: IndustrialProject = JSON.parse(JSON.stringify(baseProject));
    const theirsProject: IndustrialProject = JSON.parse(JSON.stringify(baseProject));

    // Mine altera a descrição da Tag 1
    mineProject.tags[0].description = "Descricao alterada localmente";

    // Theirs adiciona uma nova tarefa
    theirsProject.taskConfigurations.push({
      id: "task-theirs-2",
      controllerId: "c1",
      name: "FastTask",
      type: "CYCLIC",
      priority: 0,
      intervalMs: 1,
      watchdogMs: 10,
      watchdogSensitivity: 1,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: [],
      enabled: true,
    });

    // Merge não-conflitante
    const resClean = ProjectComparisonEngine.threeWayMerge(baseProject, mineProject, theirsProject);
    expect(resClean.hasConflicts).toBe(false);
    expect(resClean.conflicts.length).toBe(0);
    expect(resClean.mergedProject.tags[0].description).toBe("Descricao alterada localmente");
    expect(resClean.mergedProject.taskConfigurations.some((t) => t.name === "FastTask")).toBe(true);

    // Agora induz um conflito na POU base (modificações concorrentes divergentes)
    mineProject.pous[0].rawSourceST = "count := 100;";
    theirsProject.pous[0].rawSourceST = "count := 999;";

    const resConflict = ProjectComparisonEngine.threeWayMerge(
      baseProject,
      mineProject,
      theirsProject,
    );
    expect(resConflict.hasConflicts).toBe(true);
    expect(resConflict.conflicts.length).toBeGreaterThan(0);
    const pouConflict = resConflict.conflicts.find((c) => c.entityId === "pou-1");
    expect(pouConflict).toBeDefined();
    expect(pouConflict?.sourceValue.rawSourceST).toBe("count := 100;");
    expect(pouConflict?.targetValue.rawSourceST).toBe("count := 999;");
  });
});
