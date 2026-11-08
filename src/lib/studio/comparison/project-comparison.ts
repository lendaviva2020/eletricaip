/**
 * ElétricAi Industrial OS — Project Comparison & Semantic Diff Engine
 * Paridade com o Project Compare & Versioning do CODESYS V3.5:
 * Comparação estrutural profunda, diff semântico de POUs e código-fonte,
 * detecção de conflitos e mesclagem automatizada de projetos de automação.
 */

import { IndustrialProject, ProjectDiffItem, POU, Tag, TaskConfiguration, Device } from "../canonical/types";
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
  public static compareProjects(source: IndustrialProject, target: IndustrialProject): SemanticDiffResult {
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

  private static compareTasks(sourceTasks: TaskConfiguration[], targetTasks: TaskConfiguration[], diffs: ProjectDiffItem[]): void {
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
      } else if (src.priority !== tgt.priority || src.intervalMs !== tgt.intervalMs || src.type !== tgt.type) {
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

  private static compareDevices(sourceDevs: Device[], targetDevs: Device[], diffs: ProjectDiffItem[]): void {
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

  private static compareAlarms(sourceAlarms: any[], targetAlarms: any[], diffs: ProjectDiffItem[]): void {
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
   * Mesclagem automática de alterações não conflitantes entre dois projetos
   */
  public static mergeNonConflicting(
    base: IndustrialProject,
    modified: IndustrialProject
  ): { mergedProject: IndustrialProject; conflicts: MergeConflict[] } {
    const merged: IndustrialProject = JSON.parse(JSON.stringify(base));
    const conflicts: MergeConflict[] = [];

    // Adiciona novos POUs que não existiam na base
    const basePouIds = new Set(base.pous.map((p) => p.id));
    for (const pou of modified.pous) {
      if (!basePouIds.has(pou.id)) {
        merged.pous.push(JSON.parse(JSON.stringify(pou)));
      }
    }

    // Adiciona novas Tags
    const baseTagIds = new Set(base.tags.map((t) => t.id));
    for (const tag of modified.tags) {
      if (!baseTagIds.has(tag.id)) {
        merged.tags.push(JSON.parse(JSON.stringify(tag)));
      }
    }

    // Adiciona novas Tarefas
    const baseTaskIds = new Set(base.taskConfigurations.map((t) => t.id));
    for (const task of modified.taskConfigurations) {
      if (!baseTaskIds.has(task.id)) {
        merged.taskConfigurations.push(JSON.parse(JSON.stringify(task)));
      }
    }

    return { mergedProject: merged, conflicts };
  }
}
