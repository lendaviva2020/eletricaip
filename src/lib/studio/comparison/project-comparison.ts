/**
 * ElétricAi Industrial OS — Project Comparison & Semantic Diff Engine
 * Paridade com o Project Compare & Versioning do CODESYS V3.5:
 * Comparação estrutural profunda, diff semântico de POUs e código-fonte,
 * detecção de conflitos e mesclagem automatizada de projetos de automação.
 */

import {
  IndustrialProject,
  ProjectDiffItem,
  POU,
  Tag,
  TaskConfiguration,
  Device,
} from "../canonical/types";
import { generateUuid as uuidv4 } from "../canonical/uuid";

export interface SemanticDiffResult {
  hasDifferences: boolean;
  summary: {
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    renamedCount: number;
  };
  items: ProjectDiffItem[];
}

export interface MergeConflict {
  entityType: string;
  entityId: string;
  entityName: string;
  sourceValue: any;
  targetValue: any;
  baseValue?: any;
  resolution?: "ACCEPT_SOURCE" | "ACCEPT_TARGET" | "MANUAL";
}

export class ProjectComparisonEngine {
  /**
   * Compara profundamente dois projetos industriais (Origem vs Destino)
   */
  public static compareProjects(
    source: IndustrialProject,
    target: IndustrialProject,
  ): SemanticDiffResult {
    const diffs: ProjectDiffItem[] = [];

    // 1. Comparação de POUs (Programas, Function Blocks, Funções)
    this.comparePOUs(source.pous, target.pous, diffs);

    // 2. Comparação de Tags Industriais
    this.compareTags(source.tags, target.tags, diffs);

    // 3. Comparação de Configurações de Tarefas (Task Configurations)
    this.compareTasks(source.taskConfigurations, target.taskConfigurations, diffs);

    // 4. Comparação de Dispositivos de Hardware (Device Tree)
    this.compareDevices(source.devices, target.devices, diffs);

    // 5. Comparação de Alarmes Industriais
    this.compareAlarms(source.alarmDefinitions, target.alarmDefinitions, diffs);

    const summary = {
      addedCount: diffs.filter((d) => d.changeKind === "ADDED").length,
      removedCount: diffs.filter((d) => d.changeKind === "REMOVED").length,
      modifiedCount: diffs.filter((d) => d.changeKind === "MODIFIED").length,
      renamedCount: diffs.filter((d) => d.changeKind === "RENAMED").length,
    };

    return {
      hasDifferences: diffs.length > 0,
      summary,
      items: diffs,
    };
  }

  // ==========================================================================
  // Métodos de Comparação Especializados
  // ==========================================================================

  private static comparePOUs(sourcePous: POU[], targetPous: POU[], diffs: ProjectDiffItem[]): void {
    const targetMap = new Map(targetPous.map((p) => [p.id, p]));
    const targetNameMap = new Map(targetPous.map((p) => [p.name, p]));

    for (const src of sourcePous) {
      const tgt = targetMap.get(src.id);
      if (!tgt) {
        // Verifica se foi renomeado
        const sameName = targetNameMap.get(src.name);
        if (sameName) {
          diffs.push({
            entityId: src.id,
            entityType: "POU",
            entityName: src.name,
            changeKind: "MODIFIED",
            description: `ID modificado de ${src.id} para ${sameName.id}`,
            propertyDiffs: {},
          });
        } else {
          diffs.push({
            entityId: src.id,
            entityType: "POU",
            entityName: src.name,
            changeKind: "REMOVED",
            description: `POU '${src.name}' foi removido do projeto de destino.`,
            propertyDiffs: {},
          });
        }
      } else {
        // Existe em ambos: compara nome, linguagem e código
        if (src.name !== tgt.name) {
          diffs.push({
            entityId: src.id,
            entityType: "POU",
            entityName: tgt.name,
            changeKind: "RENAMED",
            description: `Renomeado de '${src.name}' para '${tgt.name}'.`,
            propertyDiffs: {},
          });
        } else if (src.rawSourceST !== tgt.rawSourceST || src.language !== tgt.language) {
          diffs.push({
            entityId: src.id,
            entityType: "POU",
            entityName: src.name,
            changeKind: "MODIFIED",
            description: `Alteração no código fonte ou linguagem (${src.language} -> ${tgt.language}).`,
            propertyDiffs: {},
          });
        }
      }
    }

    // POUs Adicionados no destino
    const sourceMap = new Map(sourcePous.map((p) => [p.id, p]));
    for (const tgt of targetPous) {
      if (!sourceMap.has(tgt.id)) {
        diffs.push({
          entityId: tgt.id,
          entityType: "POU",
          entityName: tgt.name,
          changeKind: "ADDED",
          description: `Novo POU '${tgt.name}' (${tgt.language}) adicionado no destino.`,
          propertyDiffs: {},
        });
      }
    }
  }

  private static compareTags(sourceTags: Tag[], targetTags: Tag[], diffs: ProjectDiffItem[]): void {
    const targetMap = new Map(targetTags.map((t) => [t.id, t]));
    const sourceMap = new Map(sourceTags.map((t) => [t.id, t]));

    for (const src of sourceTags) {
      const tgt = targetMap.get(src.id);
      if (!tgt) {
        diffs.push({
          entityId: src.id,
          entityType: "TAG",
          entityName: src.name,
          changeKind: "REMOVED",
          description: `Tag '${src.name}' [${src.code}] foi removida.`,
          propertyDiffs: {},
        });
      } else if (src.name !== tgt.name) {
        diffs.push({
          entityId: src.id,
          entityType: "TAG",
          entityName: tgt.name,
          changeKind: "RENAMED",
          description: `Tag renomeada de '${src.name}' para '${tgt.name}'.`,
          propertyDiffs: {},
        });
      } else if (src.dataType !== tgt.dataType || src.protocolAddress !== tgt.protocolAddress) {
        diffs.push({
          entityId: src.id,
          entityType: "TAG",
          entityName: src.name,
          changeKind: "MODIFIED",
          description: `Modificação de tipo (${src.dataType} -> ${tgt.dataType}) ou endereço (${src.protocolAddress} -> ${tgt.protocolAddress}).`,
          propertyDiffs: {},
        });
      }
    }

    for (const tgt of targetTags) {
      if (!sourceMap.has(tgt.id)) {
        diffs.push({
          entityId: tgt.id,
          entityType: "TAG",
          entityName: tgt.name,
          changeKind: "ADDED",
          description: `Nova Tag '${tgt.name}' [${tgt.dataType}] adicionada.`,
          propertyDiffs: {},
        });
      }
    }
  }

  private static compareTasks(
    sourceTasks: TaskConfiguration[],
    targetTasks: TaskConfiguration[],
    diffs: ProjectDiffItem[],
  ): void {
    const targetMap = new Map(targetTasks.map((t) => [t.id, t]));
    const sourceMap = new Map(sourceTasks.map((t) => [t.id, t]));

    for (const src of sourceTasks) {
      const tgt = targetMap.get(src.id);
      if (!tgt) {
        diffs.push({
          entityId: src.id,
          entityType: "TASK",
          entityName: src.name,
          changeKind: "REMOVED",
          description: `Tarefa '${src.name}' foi removida.`,
          propertyDiffs: {},
        });
      } else if (
        src.priority !== tgt.priority ||
        src.intervalMs !== tgt.intervalMs ||
        src.type !== tgt.type
      ) {
        diffs.push({
          entityId: src.id,
          entityType: "TASK",
          entityName: src.name,
          changeKind: "MODIFIED",
          description: `Tarefa modificada: prioridade (${src.priority}->${tgt.priority}), intervalo (${src.intervalMs}ms->${tgt.intervalMs}ms), tipo (${src.type}->${tgt.type}).`,
          propertyDiffs: {},
        });
      }
    }

    for (const tgt of targetTasks) {
      if (!sourceMap.has(tgt.id)) {
        diffs.push({
          entityId: tgt.id,
          entityType: "TASK",
          entityName: tgt.name,
          changeKind: "ADDED",
          description: `Nova tarefa '${tgt.name}' adicionada.`,
          propertyDiffs: {},
        });
      }
    }
  }

  private static compareDevices(
    sourceDevs: Device[],
    targetDevs: Device[],
    diffs: ProjectDiffItem[],
  ): void {
    const targetMap = new Map(targetDevs.map((d) => [d.id, d]));
    const sourceMap = new Map(sourceDevs.map((d) => [d.id, d]));

    for (const src of sourceDevs) {
      if (!targetMap.has(src.id)) {
        diffs.push({
          entityId: src.id,
          entityType: "DEVICE",
          entityName: src.name,
          changeKind: "REMOVED",
          description: `Dispositivo '${src.name}' [${src.kind}] removido da árvore.`,
          propertyDiffs: {},
        });
      }
    }

    for (const tgt of targetDevs) {
      if (!sourceMap.has(tgt.id)) {
        diffs.push({
          entityId: tgt.id,
          entityType: "DEVICE",
          entityName: tgt.name,
          changeKind: "ADDED",
          description: `Novo dispositivo '${tgt.name}' [${tgt.kind}] adicionado na árvore.`,
          propertyDiffs: {},
        });
      }
    }
  }

  private static compareAlarms(
    sourceAlarms: any[],
    targetAlarms: any[],
    diffs: ProjectDiffItem[],
  ): void {
    const targetMap = new Map(targetAlarms.map((a) => [a.id, a]));
    const sourceMap = new Map(sourceAlarms.map((a) => [a.id, a]));

    for (const src of sourceAlarms) {
      if (!targetMap.has(src.id)) {
        diffs.push({
          entityId: src.id,
          entityType: "ALARM",
          entityName: src.name,
          changeKind: "REMOVED",
          description: `Alarme '${src.name}' [${src.severity}] removido.`,
          propertyDiffs: {},
        });
      }
    }

    for (const tgt of targetAlarms) {
      if (!sourceMap.has(tgt.id)) {
        diffs.push({
          entityId: tgt.id,
          entityType: "ALARM",
          entityName: tgt.name,
          changeKind: "ADDED",
          description: `Novo alarme '${tgt.name}' [${tgt.severity}] configurado.`,
          propertyDiffs: {},
        });
      }
    }
  }

  /**
   * Three-Way Merge Engine (Base, Mine, Theirs)
   * Resolução automática de alterações não conflitantes e detecção precisa de conflitos.
   */
  public static threeWayMerge(
    base: IndustrialProject,
    mine: IndustrialProject,
    theirs: IndustrialProject,
  ): {
    mergedProject: IndustrialProject;
    conflicts: MergeConflict[];
    hasConflicts: boolean;
    appliedChangesCount: number;
  } {
    const conflicts: MergeConflict[] = [];
    let totalApplied = 0;

    const deepEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

    const mergeCollection = <T extends { id: string; name?: string }>(
      entityType: string,
      baseList: T[],
      mineList: T[],
      theirsList: T[],
    ): T[] => {
      const baseMap = new Map(baseList.map((x) => [x.id, x]));
      const mineMap = new Map(mineList.map((x) => [x.id, x]));
      const theirsMap = new Map(theirsList.map((x) => [x.id, x]));

      const allIds = new Set<string>([...baseMap.keys(), ...mineMap.keys(), ...theirsMap.keys()]);

      const result: T[] = [];

      for (const id of allIds) {
        const inBase = baseMap.get(id);
        const inMine = mineMap.get(id);
        const inTheirs = theirsMap.get(id);

        if (inBase && inMine && inTheirs) {
          if (deepEqual(inMine, inTheirs)) {
            result.push(JSON.parse(JSON.stringify(inMine)));
          } else if (deepEqual(inMine, inBase) && !deepEqual(inTheirs, inBase)) {
            result.push(JSON.parse(JSON.stringify(inTheirs)));
            totalApplied++;
          } else if (!deepEqual(inMine, inBase) && deepEqual(inTheirs, inBase)) {
            result.push(JSON.parse(JSON.stringify(inMine)));
            totalApplied++;
          } else {
            conflicts.push({
              entityType,
              entityId: id,
              entityName: inMine.name || inTheirs.name || inBase.name || id,
              baseValue: inBase,
              sourceValue: inMine,
              targetValue: inTheirs,
              resolution: "ACCEPT_SOURCE",
            });
            result.push(JSON.parse(JSON.stringify(inMine)));
          }
        } else if (inBase && !inMine && inTheirs) {
          if (deepEqual(inTheirs, inBase)) {
            totalApplied++;
          } else {
            conflicts.push({
              entityType,
              entityId: id,
              entityName: inTheirs.name || inBase.name || id,
              baseValue: inBase,
              sourceValue: null,
              targetValue: inTheirs,
              resolution: "ACCEPT_SOURCE",
            });
          }
        } else if (inBase && inMine && !inTheirs) {
          if (deepEqual(inMine, inBase)) {
            totalApplied++;
          } else {
            conflicts.push({
              entityType,
              entityId: id,
              entityName: inMine.name || inBase.name || id,
              baseValue: inBase,
              sourceValue: inMine,
              targetValue: null,
              resolution: "ACCEPT_SOURCE",
            });
            result.push(JSON.parse(JSON.stringify(inMine)));
          }
        } else if (inBase && !inMine && !inTheirs) {
          totalApplied++;
        } else if (!inBase && inMine && !inTheirs) {
          result.push(JSON.parse(JSON.stringify(inMine)));
          totalApplied++;
        } else if (!inBase && !inMine && inTheirs) {
          result.push(JSON.parse(JSON.stringify(inTheirs)));
          totalApplied++;
        } else if (!inBase && inMine && inTheirs) {
          if (deepEqual(inMine, inTheirs)) {
            result.push(JSON.parse(JSON.stringify(inMine)));
          } else {
            conflicts.push({
              entityType,
              entityId: id,
              entityName: inMine.name || inTheirs.name || id,
              baseValue: null,
              sourceValue: inMine,
              targetValue: inTheirs,
              resolution: "ACCEPT_SOURCE",
            });
            result.push(JSON.parse(JSON.stringify(inMine)));
          }
        }
      }

      return result;
    };

    const mergedProject: IndustrialProject = JSON.parse(JSON.stringify(mine));
    mergedProject.pous = mergeCollection("POU", base.pous, mine.pous, theirs.pous);
    mergedProject.tags = mergeCollection("TAG", base.tags, mine.tags, theirs.tags);
    mergedProject.taskConfigurations = mergeCollection(
      "TASK",
      base.taskConfigurations,
      mine.taskConfigurations,
      theirs.taskConfigurations,
    );
    mergedProject.devices = mergeCollection("DEVICE", base.devices, mine.devices, theirs.devices);
    mergedProject.alarmDefinitions = mergeCollection(
      "ALARM",
      base.alarmDefinitions,
      mine.alarmDefinitions,
      theirs.alarmDefinitions,
    );
    mergedProject.dataTypes = mergeCollection(
      "DATATYPE",
      base.dataTypes || [],
      mine.dataTypes || [],
      theirs.dataTypes || [],
    );
    mergedProject.recipeDefinitions = mergeCollection(
      "RECIPE",
      base.recipeDefinitions || [],
      mine.recipeDefinitions || [],
      theirs.recipeDefinitions || [],
    );
    mergedProject.updatedAt = new Date().toISOString();

    return {
      mergedProject,
      conflicts,
      hasConflicts: conflicts.length > 0,
      appliedChangesCount: totalApplied,
    };
  }

  /**
   * Mesclagem automática de alterações não conflitantes entre dois projetos
   */
  public static mergeNonConflicting(
    base: IndustrialProject,
    modified: IndustrialProject,
  ): { mergedProject: IndustrialProject; conflicts: MergeConflict[] } {
    const result = this.threeWayMerge(base, base, modified);
    return {
      mergedProject: result.mergedProject,
      conflicts: result.conflicts,
    };
  }
}
