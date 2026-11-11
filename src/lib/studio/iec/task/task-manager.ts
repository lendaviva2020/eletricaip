/**
 * ElétricAi Industrial OS — Multi-Type IEC Task Scheduler & Watchdog Engine
 * Paridade com o Task Configuration do CODESYS V3.5.
 *
 * Suporta:
 * - CYCLIC: Disparo periódico por intervalo (ex: 10ms, 20ms, 100ms)
 * - FREEWHEELING: Ciclo contínuo de baixa prioridade sem temporizador
 * - EVENT: Disparo por borda de subida de tag/variável booleana
 * - STATUS_TRIGGERED: Disparo contínuo enquanto variável de status for TRUE
 * - EXTERNAL_EVENT: Disparo por interrupção ou evento externo
 *
 * Recursos:
 * - Prioridade de 0 (máxima) a 31 (mínima)
 * - Watchdog com sensibilidade configurável (número de estouros tolerados)
 * - Cálculo de Jitter e detecção de Overrun em tempo real
 * - Estatísticas de tempo de ciclo (atual, mínimo, máximo, médio)
 */

import { TaskConfiguration, TaskType } from "../../canonical/types";

export interface TaskRuntimeStats {
  taskId: string;
  taskName: string;
  type: TaskType;
  priority: number;
  cycleCount: number;
  lastCycleDurationMs: number;
  minCycleDurationMs: number;
  maxCycleDurationMs: number;
  avgCycleDurationMs: number;
  jitterMs: number;
  isOverrun: boolean;
  overrunCount: number;
  watchdogTripped: boolean;
  consecutiveWatchdogMisses: number;
}

export interface TaskExecutionCallback {
  (taskId: string, pouIds: string[]): void;
}

export class MultiTypeTaskManager {
  private tasks: Map<string, TaskConfiguration> = new Map();
  private stats: Map<string, TaskRuntimeStats> = new Map();
  private lastTriggerTimeMs: Map<string, number> = new Map();
  private lastEventState: Map<string, boolean> = new Map();
  private executionCallback?: TaskExecutionCallback;

  constructor(tasks: TaskConfiguration[] = [], onExecute?: TaskExecutionCallback) {
    this.executionCallback = onExecute;
    for (const t of tasks) {
      this.addTask(t);
    }
  }

  public addTask(task: TaskConfiguration): void {
    this.tasks.set(task.id, { ...task });
    this.stats.set(task.id, {
      taskId: task.id,
      taskName: task.name,
      type: task.type,
      priority: task.priority,
      cycleCount: 0,
      lastCycleDurationMs: 0,
      minCycleDurationMs: 999999,
      maxCycleDurationMs: 0,
      avgCycleDurationMs: 0,
      jitterMs: 0,
      isOverrun: false,
      overrunCount: 0,
      watchdogTripped: false,
      consecutiveWatchdogMisses: 0,
    });
  }

  public removeTask(taskId: string): void {
    this.tasks.delete(taskId);
    this.stats.delete(taskId);
    this.lastTriggerTimeMs.delete(taskId);
    this.lastEventState.delete(taskId);
  }

  public getTaskStats(taskId: string): TaskRuntimeStats | undefined {
    return this.stats.get(taskId);
  }

  public getAllStats(): TaskRuntimeStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Executa um passo do escalonador multi-tarefas com relógio virtual determinístico
   */
  public evaluateAndExecute(
    virtualNowMs: number,
    getVariableValue: (varOrTagId: string) => any,
    customExec?: (pouId: string) => void,
  ): { executedTaskIds: string[]; watchdogFaults: string[] } {
    const executedTaskIds: string[] = [];
    const watchdogFaults: string[] = [];

    // 1. Identificar tarefas prontas para execução
    const readyTasks: TaskConfiguration[] = [];

    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;
      const stat = this.stats.get(task.id)!;
      if (stat.watchdogTripped) continue; // Tarefa travada por watchdog

      let isReady = false;
      const lastTime = this.lastTriggerTimeMs.get(task.id);

      switch (task.type) {
        case "CYCLIC": {
          if (lastTime === undefined) {
            isReady = true;
            stat.jitterMs = 0;
          } else {
            const elapsed = virtualNowMs - lastTime;
            if (elapsed >= task.intervalMs) {
              isReady = true;
              stat.jitterMs = Math.abs(elapsed - task.intervalMs);
            }
          }
          break;
        }
        case "FREEWHEELING": {
          // Sempre pronta em cada ciclo do loop
          isReady = true;
          stat.jitterMs = 0;
          break;
        }
        case "EVENT": {
          const triggerId = task.eventTriggerTagId || task.eventVariableId;
          if (triggerId) {
            const currentVal = Boolean(getVariableValue(triggerId));
            const prevVal = this.lastEventState.get(task.id) || false;
            // Borda de subida
            if (currentVal && !prevVal) {
              isReady = true;
            }
            this.lastEventState.set(task.id, currentVal);
          }
          break;
        }
        case "STATUS_TRIGGERED": {
          const triggerId = task.eventTriggerTagId || task.eventVariableId;
          if (triggerId) {
            const currentVal = Boolean(getVariableValue(triggerId));
            if (currentVal) {
              isReady = true;
            }
          }
          break;
        }
        case "EXTERNAL_EVENT": {
          // Pode ser disparada manualmente ou via triggerId
          const triggerId = task.eventTriggerTagId;
          if (triggerId && Boolean(getVariableValue(triggerId))) {
            isReady = true;
          }
          break;
        }
      }

      if (isReady) {
        readyTasks.push(task);
      }
    }

    // 2. Ordenação por prioridade: 0 é a mais prioritária, 31 a menos
    readyTasks.sort((a, b) => a.priority - b.priority);

    // 3. Execução ordenada das tarefas
    for (const task of readyTasks) {
      const stat = this.stats.get(task.id)!;
      this.lastTriggerTimeMs.set(task.id, virtualNowMs);
      const startTime = performance.now();

      // Executa os POUs vinculados
      if (this.executionCallback) {
        this.executionCallback(task.id, task.pouIds);
      } else if (customExec) {
        for (const pouId of task.pouIds) {
          customExec(pouId);
        }
      }

      const durationMs = performance.now() - startTime;

      // 4. Atualização de Métricas e Watchdog
      stat.cycleCount++;
      stat.lastCycleDurationMs = durationMs;
      stat.minCycleDurationMs = Math.min(stat.minCycleDurationMs, durationMs);
      stat.maxCycleDurationMs = Math.max(stat.maxCycleDurationMs, durationMs);
      stat.avgCycleDurationMs =
        (stat.avgCycleDurationMs * (stat.cycleCount - 1) + durationMs) / stat.cycleCount;

      // Detecção de Overrun (Duração > Intervalo para tarefas cíclicas)
      if (task.type === "CYCLIC" && durationMs > task.intervalMs) {
        stat.isOverrun = true;
        stat.overrunCount++;
      } else {
        stat.isOverrun = false;
      }

      // Verificação de Watchdog
      if (durationMs > task.watchdogMs) {
        stat.consecutiveWatchdogMisses++;
        if (stat.consecutiveWatchdogMisses >= task.watchdogSensitivity) {
          stat.watchdogTripped = true;
          watchdogFaults.push(task.id);
        }
      } else {
        stat.consecutiveWatchdogMisses = 0;
      }

      executedTaskIds.push(task.id);
    }

    return { executedTaskIds, watchdogFaults };
  }

  public resetWatchdog(taskId: string): void {
    const stat = this.stats.get(taskId);
    if (stat) {
      stat.watchdogTripped = false;
      stat.consecutiveWatchdogMisses = 0;
    }
  }
}
