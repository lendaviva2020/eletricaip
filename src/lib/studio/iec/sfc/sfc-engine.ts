// ============================================================================
// ELÉTRICAI INDUSTRIAL OS — SEQUENTIAL FUNCTION CHART (SFC) EXECUTION ENGINE
// IEC 61131-3 Step Evolution, Transition Conditions, Action Qualifiers & Deadlock Detection
// ============================================================================

import type { SFCStep, SFCTransition, SFCAction } from "../../canonical/types";

export interface SFCEngineState {
  activeStepIds: Set<string>;
  stepTimers: Map<string, number>; // stepId -> timeInStepMs
  storedActions: Set<string>; // Actions set with 'S' qualifier
  isDeadlocked: boolean;
  deadlockReason?: string;
  cycleCount: number;
}

export class SFCEngine {
  private state: SFCEngineState;

  constructor(
    private steps: SFCStep[],
    private transitions: SFCTransition[],
  ) {
    this.state = {
      activeStepIds: new Set<string>(),
      stepTimers: new Map<string, number>(),
      storedActions: new Set<string>(),
      isDeadlocked: false,
      cycleCount: 0,
    };
    this.reset();
  }

  public reset(): void {
    this.state.activeStepIds.clear();
    this.state.stepTimers.clear();
    this.state.storedActions.clear();
    this.state.isDeadlocked = false;
    this.state.deadlockReason = undefined;
    this.state.cycleCount = 0;

    // Ativa passos iniciais
    for (const step of this.steps) {
      if (step.isInitial) {
        this.state.activeStepIds.add(step.id);
        this.state.stepTimers.set(step.id, 0);
      }
    }
  }

  public getState(): SFCEngineState {
    return this.state;
  }

  public getActiveStepIds(): string[] {
    return Array.from(this.state.activeStepIds);
  }

  public isStepActive(stepId: string): boolean {
    return this.state.activeStepIds.has(stepId);
  }

  public getTimeInStep(stepId: string): number {
    return this.state.stepTimers.get(stepId) || 0;
  }

  /**
   * Executa um ciclo de varredura SFC com delta de tempo determinístico.
   * Avalia transições habilitadas, consome passos anteriores, ativa passos seguintes.
   */
  public executeCycle(
    deltaMs: number,
    evalCondition: (conditionST: string) => boolean,
    dispatchAction: (action: SFCAction, isActive: boolean) => void,
  ): SFCEngineState {
    this.state.cycleCount++;

    // 1. Incrementa tempo dos passos ativos
    for (const stepId of this.state.activeStepIds) {
      const current = this.state.stepTimers.get(stepId) || 0;
      this.state.stepTimers.set(stepId, current + deltaMs);
    }

    // 2. Identifica transições habilitadas (todos os fromStepIds ativos) e satisfeitas
    const transitionsToFire: SFCTransition[] = [];
    for (const trans of this.transitions) {
      const allPredecessorsActive = trans.fromStepIds.every((id: string) => this.state.activeStepIds.has(id));
      if (allPredecessorsActive) {
        const satisfied = evalCondition(trans.conditionST);
        trans.isSatisfied = satisfied;
        if (satisfied) {
          transitionsToFire.push(trans);
        }
      } else {
        trans.isSatisfied = false;
      }
    }

    // 3. Evolução dos passos: desativa antecessores, ativa sucessores
    if (transitionsToFire.length > 0) {
      const stepsToDeactivate = new Set<string>();
      const stepsToActivate = new Set<string>();

      for (const trans of transitionsToFire) {
        for (const fromId of trans.fromStepIds) {
          stepsToDeactivate.add(fromId);
        }
        for (const toId of trans.toStepIds) {
          stepsToActivate.add(toId);
        }
      }

      for (const id of stepsToDeactivate) {
        this.state.activeStepIds.delete(id);
        this.state.stepTimers.delete(id);
      }

      for (const id of stepsToActivate) {
        this.state.activeStepIds.add(id);
        this.state.stepTimers.set(id, 0);
      }
    }

    // 4. Detecção de Deadlock
    if (this.state.activeStepIds.size === 0) {
      this.state.isDeadlocked = true;
      this.state.deadlockReason = "DEADLOCK: Nenhum passo ativo no grafo sequencial SFC.";
    } else {
      const hasAnyOutgoing = Array.from(this.state.activeStepIds).some((activeId) =>
        this.transitions.some((t) => t.fromStepIds.includes(activeId))
      );
      if (!hasAnyOutgoing && this.transitions.length === 0) {
        this.state.isDeadlocked = true;
        this.state.deadlockReason = "DEADLOCK: Nenhuma transição de saída definida para os passos ativos.";
      } else {
        this.state.isDeadlocked = false;
      }
    }

    // 5. Execução de Ações dos Passos
    for (const step of this.steps) {
      const isActive = this.state.activeStepIds.has(step.id);
      const timeInStep = this.state.stepTimers.get(step.id) || 0;

      for (const act of step.actions) {
        const actionKey = act.actionName || act.id;
        if (act.qualifier === "N") {
          // Non-stored: ativo enquanto o passo estiver ativo
          dispatchAction(act, isActive);
        } else if (act.qualifier === "S" && isActive) {
          // Set: permanece ativo mesmo após a saída do passo
          this.state.storedActions.add(actionKey);
          dispatchAction(act, true);
        } else if (act.qualifier === "R" && isActive) {
          // Reset: cancela ação armazenada
          this.state.storedActions.delete(actionKey);
          dispatchAction(act, false);
        } else if (act.qualifier === "L" && isActive) {
          // Time limited: ativo enquanto step timer < timeLimitMs
          const withinLimit = act.timeLimitMs ? timeInStep <= act.timeLimitMs : true;
          dispatchAction(act, withinLimit);
        } else if (this.state.storedActions.has(actionKey)) {
          dispatchAction(act, true);
        }
      }
    }

    return this.state;
  }
}
