import { describe, it, expect } from "vitest";
import { MultiTypeTaskManager } from "../iec/task/task-manager";
import { TaskConfiguration } from "../canonical/types";

describe("Milestone 3: Multi-Type IEC Task Scheduler & Watchdogs", () => {
  it("Executa tarefas cíclicas e calcula estatísticas de jitter", () => {
    const task: TaskConfiguration = {
      id: "task-cyclic-10ms",
      controllerId: "ctrl-1",
      name: "MainCyclic",
      type: "CYCLIC",
      priority: 1,
      intervalMs: 10,
      watchdogMs: 100,
      watchdogSensitivity: 1,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: ["pou-1"],
      enabled: true,
    };

    let executedPou: string | null = null;
    const mgr = new MultiTypeTaskManager([task], (taskId, pouIds) => {
      executedPou = pouIds[0];
    });

    // Passo 1: t = 0ms (Primeiro disparo)
    const res1 = mgr.evaluateAndExecute(0, () => false);
    expect(res1.executedTaskIds).toContain(task.id);
    expect(executedPou).toBe("pou-1");

    // Passo 2: t = 5ms (Ainda não atingiu intervalo de 10ms)
    executedPou = null;
    const res2 = mgr.evaluateAndExecute(5, () => false);
    expect(res2.executedTaskIds.length).toBe(0);
    expect(executedPou).toBeNull();

    // Passo 3: t = 11ms (Dispara e registra Jitter de |11 - 10| = 1ms)
    const res3 = mgr.evaluateAndExecute(11, () => false);
    expect(res3.executedTaskIds).toContain(task.id);
    const stats = mgr.getTaskStats(task.id);
    expect(stats?.cycleCount).toBe(2);
    expect(stats?.jitterMs).toBe(1);
  });

  it("Executa tarefa do tipo EVENT apenas na borda de subida", () => {
    const taskEvent: TaskConfiguration = {
      id: "task-event-trig",
      controllerId: "ctrl-1",
      name: "FastEvent",
      type: "EVENT",
      priority: 0,
      intervalMs: 1,
      watchdogMs: 20,
      watchdogSensitivity: 1,
      eventTriggerTagId: "tag-estop",
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: ["pou-estop"],
      enabled: true,
    };

    let triggerVal = false;
    const mgr = new MultiTypeTaskManager([taskEvent]);

    // t=0, triggerVal=false -> não executa
    const r1 = mgr.evaluateAndExecute(0, (id) => (id === "tag-estop" ? triggerVal : false));
    expect(r1.executedTaskIds.length).toBe(0);

    // t=1, triggerVal transiciona para true -> BORDA DE SUBIDA -> Executa!
    triggerVal = true;
    const r2 = mgr.evaluateAndExecute(1, (id) => (id === "tag-estop" ? triggerVal : false));
    expect(r2.executedTaskIds).toContain(taskEvent.id);

    // t=2, triggerVal continua true -> Nível mantido -> Não dispara novamente!
    const r3 = mgr.evaluateAndExecute(2, (id) => (id === "tag-estop" ? triggerVal : false));
    expect(r3.executedTaskIds.length).toBe(0);
  });

  it("Respeita ordenação por prioridade (0 é mais prioritário que 15)", () => {
    const taskLow: TaskConfiguration = {
      id: "task-low",
      controllerId: "ctrl-1",
      name: "LowPriority",
      type: "CYCLIC",
      priority: 15,
      intervalMs: 10,
      watchdogMs: 100,
      watchdogSensitivity: 1,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: [],
      enabled: true,
    };

    const taskHigh: TaskConfiguration = {
      id: "task-high",
      controllerId: "ctrl-1",
      name: "HighPriority",
      type: "CYCLIC",
      priority: 0,
      intervalMs: 10,
      watchdogMs: 100,
      watchdogSensitivity: 1,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: [],
      enabled: true,
    };

    const mgr = new MultiTypeTaskManager([taskLow, taskHigh]);
    const res = mgr.evaluateAndExecute(0, () => false);

    expect(res.executedTaskIds).toEqual(["task-high", "task-low"]);
  });

  it("Detecta falta e trava a tarefa quando watchdog é ultrapassado", () => {
    const task: TaskConfiguration = {
      id: "task-wdog",
      controllerId: "ctrl-1",
      name: "WatchdogTest",
      type: "CYCLIC",
      priority: 1,
      intervalMs: 10,
      watchdogMs: 1, // 1 milissegundo de limite
      watchdogSensitivity: 1,
      cycleTimeActualMs: 0,
      jitterMs: 0,
      isOverrun: false,
      pouIds: ["pou-heavy"],
      enabled: true,
    };

    // Callback com atraso artificial para estourar o watchdog
    const mgr = new MultiTypeTaskManager([task], () => {
      const start = performance.now();
      while (performance.now() - start < 3) {
        // Busy wait de 3ms > 1ms
      }
    });

    const res = mgr.evaluateAndExecute(0, () => false);
    expect(res.watchdogFaults).toContain(task.id);

    const stat = mgr.getTaskStats(task.id);
    expect(stat?.watchdogTripped).toBe(true);

    // No ciclo seguinte, a tarefa não deve ser executada enquanto tripada
    const res2 = mgr.evaluateAndExecute(20, () => false);
    expect(res2.executedTaskIds.length).toBe(0);

    // Reset de engenharia
    mgr.resetWatchdog(task.id);
    expect(mgr.getTaskStats(task.id)?.watchdogTripped).toBe(false);
  });
});
