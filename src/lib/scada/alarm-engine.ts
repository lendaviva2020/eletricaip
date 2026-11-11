// SCADA SUPERVISÓRIO — Deterministic Alarm Engine
// Standards: ISA-18.2 (Management of Alarm Systems for the Process Industries), IEC 62682, EEMUA 191
// Features: HH/H/L/LL analog limits, Hysteresis, Time delays (DelayOn/DelayOff), ISA-18.2 state model,
// Chattering detection, Stale/Communication alarm handling, Acknowledgment audit trail.

import type {
  ScadaTagDefinition,
  ExtendedAlarmDefinition,
  ExtendedAlarmInstance,
  AlarmTransitionEvent,
  AlarmProcessCondition,
  AlarmAckState,
  AlarmTransitionType,
  AlarmSeverity,
} from "./types";

export interface AlarmEngineOptions {
  timeProvider?: () => number;
  chatterWindowMs?: number;
  chatterThreshold?: number;
}

interface PendingEvaluation {
  pendingTriggerAt?: number;
  pendingTriggerLimit?: "HH" | "H" | "L" | "LL" | "DISCRETE";
  pendingReturnAt?: number;
  recentTransitions: number[];
}

export class DeterministicAlarmEngine {
  private definitions: Map<string, ExtendedAlarmDefinition> = new Map();
  private activeInstances: Map<string, ExtendedAlarmInstance> = new Map();
  private alarmHistory: ExtendedAlarmInstance[] = [];
  private pendingEvals: Map<string, PendingEvaluation> = new Map();
  private timeProvider: () => number;
  private chatterWindowMs: number;
  private chatterThreshold: number;

  constructor(options?: AlarmEngineOptions) {
    this.timeProvider = options?.timeProvider ?? (() => Date.now());
    this.chatterWindowMs = options?.chatterWindowMs ?? 10000; // 10s rolling window
    this.chatterThreshold = options?.chatterThreshold ?? 3; // > 3 changes in 10s
  }

  public registerDefinition(def: ExtendedAlarmDefinition): void {
    // Prevent duplicate definitions for the same tag and alarm class
    for (const existing of this.definitions.values()) {
      if (
        (existing.tagId === def.tagId || existing.tagName === def.tagName) &&
        existing.alarmClass === def.alarmClass &&
        existing.id !== def.id
      ) {
        this.definitions.delete(existing.id);
        this.activeInstances.delete(existing.id);
        this.pendingEvals.delete(existing.id);
      }
    }
    this.definitions.set(def.id, { ...def });
  }

  public removeDefinition(id: string): void {
    this.definitions.delete(id);
    this.activeInstances.delete(id);
    this.pendingEvals.delete(id);
  }

  public registerDefinitions(defs: ExtendedAlarmDefinition[]): void {
    for (const def of defs) {
      this.registerDefinition(def);
    }
  }

  public getDefinition(id: string): ExtendedAlarmDefinition | undefined {
    return this.definitions.get(id);
  }

  public getAllDefinitions(): ExtendedAlarmDefinition[] {
    return Array.from(this.definitions.values());
  }

  public getActiveInstances(): ExtendedAlarmInstance[] {
    return Array.from(this.activeInstances.values());
  }

  public getHistory(): ExtendedAlarmInstance[] {
    return [...this.alarmHistory];
  }

  /**
   * Evaluates a tag against all alarm definitions configured for it.
   * Returns an array of transition events that occurred during this cycle.
   */
  public evaluateTag(tag: ScadaTagDefinition, overrideTimestamp?: number): AlarmTransitionEvent[] {
    const now = overrideTimestamp ?? this.timeProvider();
    const events: AlarmTransitionEvent[] = [];

    // 1. Check for Communication / Staleness condition
    const commEvents = this.evaluateCommunicationStatus(tag, now);
    events.push(...commEvents);

    // 2. Evaluate all configured definitions for this tag
    for (const def of this.definitions.values()) {
      if (def.tagId !== tag.id && def.tagName !== tag.name) continue;
      if (!def.enabled) continue;

      // Check if definition is currently suppressed
      if (def.suppressedUntil && def.suppressedUntil > now) {
        continue;
      }

      const evalEvents = this.evaluateDefinitionOnTag(def, tag, now);
      events.push(...evalEvents);
    }

    return events;
  }

  private evaluateCommunicationStatus(
    tag: ScadaTagDefinition,
    now: number,
  ): AlarmTransitionEvent[] {
    const events: AlarmTransitionEvent[] = [];
    const commAlarmId = `comm_${tag.id}`;
    const isCommLost = tag.quality === "STALE" || tag.quality === "NOT_CONNECTED";
    const existing = this.activeInstances.get(commAlarmId);

    if (isCommLost) {
      if (!existing) {
        // Trigger Communication Alarm
        const instance: ExtendedAlarmInstance = {
          id: commAlarmId,
          definitionId: `comm_def_${tag.id}`,
          projectId: (tag as unknown as { projectId?: string }).projectId || "default",
          tagName: tag.name,
          equipmentId: tag.linkedEquipmentId,
          description: `Falha de Comunicação / Sinal STALE: ${tag.name} (${tag.quality})`,
          alarmClass: "COMMUNICATION",
          severity: "HIGH",
          processCondition: "ACTIVE",
          ackState: "UNACKNOWLEDGED",
          triggeredAt: now,
          triggerValue: tag.quality,
          setpointLimit: "QUALITY != GOOD",
          limitType: "QUALITY",
          returnedToNormalAt: null,
          acknowledgedAt: null,
          acknowledgedBy: null,
          clearedAt: null,
          isChattering: false,
          chatterCount: 0,
        };
        this.activeInstances.set(commAlarmId, instance);

        events.push({
          id: `evt_${now}_${commAlarmId}`,
          instanceId: commAlarmId,
          definitionId: instance.definitionId,
          projectId: instance.projectId,
          tagName: tag.name,
          timestamp: now,
          transition: "TRIGGER",
          previousCondition: "NORMAL",
          newCondition: "ACTIVE",
          previousAckState: "ACKNOWLEDGED",
          newAckState: "UNACKNOWLEDGED",
          value: tag.quality,
        });
      }
    } else if (existing) {
      // Communication restored!
      const prevCondition = existing.processCondition;
      const prevAck = existing.ackState;

      if (existing.ackState === "ACKNOWLEDGED") {
        existing.processCondition = "NORMAL";
        existing.clearedAt = now;
        this.activeInstances.delete(commAlarmId);
        this.alarmHistory.unshift({ ...existing });

        events.push({
          id: `evt_${now}_${commAlarmId}`,
          instanceId: commAlarmId,
          definitionId: existing.definitionId,
          projectId: existing.projectId,
          tagName: tag.name,
          timestamp: now,
          transition: "CLEAR",
          previousCondition: prevCondition,
          newCondition: "NORMAL",
          previousAckState: prevAck,
          newAckState: "ACKNOWLEDGED",
          value: tag.quality,
        });
      } else {
        // Returned to normal but still UNACKNOWLEDGED (ISA-18.2)
        existing.processCondition = "RETURNED_TO_NORMAL";
        existing.returnedToNormalAt = now;

        events.push({
          id: `evt_${now}_${commAlarmId}`,
          instanceId: commAlarmId,
          definitionId: existing.definitionId,
          projectId: existing.projectId,
          tagName: tag.name,
          timestamp: now,
          transition: "RETURN_TO_NORMAL",
          previousCondition: prevCondition,
          newCondition: "RETURNED_TO_NORMAL",
          previousAckState: prevAck,
          newAckState: "UNACKNOWLEDGED",
          value: tag.quality,
        });
      }
    }

    return events;
  }

  private evaluateDefinitionOnTag(
    def: ExtendedAlarmDefinition,
    tag: ScadaTagDefinition,
    now: number,
  ): AlarmTransitionEvent[] {
    const events: AlarmTransitionEvent[] = [];
    const val = tag.value;
    const existing = this.activeInstances.get(def.id);
    let pending = this.pendingEvals.get(def.id);
    if (!pending) {
      pending = { recentTransitions: [] };
      this.pendingEvals.set(def.id, pending);
    }

    // Clean up chatter timestamps outside rolling window
    pending.recentTransitions = pending.recentTransitions.filter(
      (t) => now - t <= this.chatterWindowMs,
    );
    const isChattering = pending.recentTransitions.length >= this.chatterThreshold;

    // Check condition based on Analog Limits or Discrete
    const checkResult = this.isConditionExceeded(def, val);
    const delayOn = def.analogLimits?.delayOnMs ?? 0;
    const delayOff = def.analogLimits?.delayOffMs ?? 0;

    if (checkResult.exceeded) {
      // Condition is physically in alarm
      pending.pendingReturnAt = undefined; // Cancel any pending return

      if (
        !existing ||
        existing.processCondition === "RETURNED_TO_NORMAL" ||
        existing.processCondition === "NORMAL"
      ) {
        if (delayOn > 0 && !pending.pendingTriggerAt) {
          pending.pendingTriggerAt = now;
          pending.pendingTriggerLimit = checkResult.limitType;
          return events; // Waiting for delay
        }

        if (delayOn > 0 && pending.pendingTriggerAt && now - pending.pendingTriggerAt < delayOn) {
          return events; // Delay not elapsed yet
        }

        // Trigger Alarm!
        pending.pendingTriggerAt = undefined;
        pending.recentTransitions.push(now);

        const newInstance: ExtendedAlarmInstance = {
          id: existing ? existing.id : `alm_${now}_${def.id}`,
          definitionId: def.id,
          projectId: def.projectId,
          tagName: def.tagName,
          equipmentId: def.equipmentId,
          description: def.description,
          alarmClass: def.alarmClass,
          severity: def.severity,
          processCondition: "ACTIVE",
          ackState: "UNACKNOWLEDGED",
          triggeredAt: now,
          triggerValue: val,
          setpointLimit: checkResult.limitValue ?? 0,
          limitType: checkResult.limitType,
          returnedToNormalAt: null,
          acknowledgedAt: null,
          acknowledgedBy: null,
          clearedAt: null,
          isChattering,
          chatterCount: pending.recentTransitions.length,
        };

        const prevCondition = existing?.processCondition ?? "NORMAL";
        const prevAck = existing?.ackState ?? "ACKNOWLEDGED";

        this.activeInstances.set(def.id, newInstance);

        events.push({
          id: `evt_${now}_${def.id}`,
          instanceId: newInstance.id,
          definitionId: def.id,
          projectId: def.projectId,
          tagName: def.tagName,
          timestamp: now,
          transition: "TRIGGER",
          previousCondition: prevCondition,
          newCondition: "ACTIVE",
          previousAckState: prevAck,
          newAckState: "UNACKNOWLEDGED",
          value: val,
        });
      }
    } else {
      // Condition is physically normal (respecting hysteresis)
      pending.pendingTriggerAt = undefined; // Cancel any pending trigger

      if (existing && existing.processCondition === "ACTIVE") {
        if (delayOff > 0 && !pending.pendingReturnAt) {
          pending.pendingReturnAt = now;
          return events;
        }

        if (delayOff > 0 && pending.pendingReturnAt && now - pending.pendingReturnAt < delayOff) {
          return events;
        }

        // Return to normal!
        pending.pendingReturnAt = undefined;
        pending.recentTransitions.push(now);

        const prevCondition = existing.processCondition;
        const prevAck = existing.ackState;

        if (existing.ackState === "ACKNOWLEDGED") {
          // Both returned to normal and acknowledged -> CLEAR
          existing.processCondition = "NORMAL";
          existing.clearedAt = now;
          this.activeInstances.delete(def.id);
          this.alarmHistory.unshift({ ...existing });

          events.push({
            id: `evt_${now}_${def.id}`,
            instanceId: existing.id,
            definitionId: def.id,
            projectId: def.projectId,
            tagName: def.tagName,
            timestamp: now,
            transition: "CLEAR",
            previousCondition: prevCondition,
            newCondition: "NORMAL",
            previousAckState: prevAck,
            newAckState: "ACKNOWLEDGED",
            value: val,
          });
        } else {
          // Returned to normal but UNACKNOWLEDGED (ISA-18.2)
          existing.processCondition = "RETURNED_TO_NORMAL";
          existing.returnedToNormalAt = now;

          events.push({
            id: `evt_${now}_${def.id}`,
            instanceId: existing.id,
            definitionId: def.id,
            projectId: def.projectId,
            tagName: def.tagName,
            timestamp: now,
            transition: "RETURN_TO_NORMAL",
            previousCondition: prevCondition,
            newCondition: "RETURNED_TO_NORMAL",
            previousAckState: prevAck,
            newAckState: "UNACKNOWLEDGED",
            value: val,
          });
        }
      }
    }

    return events;
  }

  /**
   * Determines whether the tag value exceeds limits with hysteresis considered.
   */
  private isConditionExceeded(
    def: ExtendedAlarmDefinition,
    value: number | boolean | string,
  ): { exceeded: boolean; limitType?: "HH" | "H" | "L" | "LL" | "DISCRETE"; limitValue?: number } {
    if (typeof value === "number" && def.analogLimits) {
      const limits = def.analogLimits;
      const hyst = limits.hysteresis || 0;
      const existing = this.activeInstances.get(def.id);
      const isCurrentlyActive = existing?.processCondition === "ACTIVE";

      // High High
      if (limits.highHigh !== undefined && limits.highHigh !== null) {
        const threshold = isCurrentlyActive ? limits.highHigh - hyst : limits.highHigh;
        if (value >= threshold) {
          return { exceeded: true, limitType: "HH", limitValue: limits.highHigh };
        }
      }

      // High
      if (limits.high !== undefined && limits.high !== null) {
        const threshold = isCurrentlyActive ? limits.high - hyst : limits.high;
        if (value >= threshold) {
          return { exceeded: true, limitType: "H", limitValue: limits.high };
        }
      }

      // Low Low
      if (limits.lowLow !== undefined && limits.lowLow !== null) {
        const threshold = isCurrentlyActive ? limits.lowLow + hyst : limits.lowLow;
        if (value <= threshold) {
          return { exceeded: true, limitType: "LL", limitValue: limits.lowLow };
        }
      }

      // Low
      if (limits.low !== undefined && limits.low !== null) {
        const threshold = isCurrentlyActive ? limits.low + hyst : limits.low;
        if (value <= threshold) {
          return { exceeded: true, limitType: "L", limitValue: limits.low };
        }
      }

      return { exceeded: false };
    }

    // Discrete Alarm comparison
    if (def.discreteTriggerValue !== undefined) {
      const isMatch = value === def.discreteTriggerValue;
      return { exceeded: isMatch, limitType: "DISCRETE" };
    }

    return { exceeded: false };
  }

  /**
   * Operator Acknowledgment of an alarm instance.
   * Conforms to ISA-18.2:
   * - If ACTIVE: transitions UNACK -> ACK, condition remains ACTIVE.
   * - If RETURNED_TO_NORMAL: transitions UNACK -> ACK and immediately CLEARS to NORMAL.
   */
  public acknowledgeAlarm(
    instanceOrDefinitionId: string,
    operator: string,
    comment?: string,
    overrideTimestamp?: number,
  ): AlarmTransitionEvent | null {
    const now = overrideTimestamp ?? this.timeProvider();
    let instance = this.activeInstances.get(instanceOrDefinitionId);

    if (!instance) {
      // Check if keyed by instance ID
      for (const inst of this.activeInstances.values()) {
        if (inst.id === instanceOrDefinitionId) {
          instance = inst;
          break;
        }
      }
    }

    if (!instance) return null;
    if (instance.ackState === "ACKNOWLEDGED") return null;

    const prevAck = instance.ackState;
    const prevCondition = instance.processCondition;

    instance.ackState = "ACKNOWLEDGED";
    instance.acknowledgedAt = now;
    instance.acknowledgedBy = operator;
    instance.ackComment = comment || null;

    if (instance.processCondition === "RETURNED_TO_NORMAL") {
      // Cleared!
      instance.processCondition = "NORMAL";
      instance.clearedAt = now;
      instance.clearedBy = operator;

      // Remove from active instances and move to history
      for (const [key, val] of this.activeInstances.entries()) {
        if (val.id === instance.id) {
          this.activeInstances.delete(key);
          break;
        }
      }
      this.alarmHistory.unshift({ ...instance });

      return {
        id: `evt_${now}_${instance.id}_ack`,
        instanceId: instance.id,
        definitionId: instance.definitionId,
        projectId: instance.projectId,
        tagName: instance.tagName,
        timestamp: now,
        transition: "CLEAR",
        previousCondition: prevCondition,
        newCondition: "NORMAL",
        previousAckState: prevAck,
        newAckState: "ACKNOWLEDGED",
        value: instance.triggerValue,
        operator,
        comment,
      };
    }

    return {
      id: `evt_${now}_${instance.id}_ack`,
      instanceId: instance.id,
      definitionId: instance.definitionId,
      projectId: instance.projectId,
      tagName: instance.tagName,
      timestamp: now,
      transition: "ACKNOWLEDGE",
      previousCondition: prevCondition,
      newCondition: instance.processCondition,
      previousAckState: prevAck,
      newAckState: "ACKNOWLEDGED",
      value: instance.triggerValue,
      operator,
      comment,
    };
  }

  /**
   * Acknowledges all active unacknowledged alarms for a project.
   */
  public acknowledgeAll(
    projectId: string,
    operator: string,
    overrideTimestamp?: number,
  ): AlarmTransitionEvent[] {
    const events: AlarmTransitionEvent[] = [];
    const keys = Array.from(this.activeInstances.keys());

    for (const key of keys) {
      const inst = this.activeInstances.get(key);
      if (
        inst &&
        (inst.projectId === projectId || projectId === "all") &&
        inst.ackState === "UNACKNOWLEDGED"
      ) {
        const evt = this.acknowledgeAlarm(
          key,
          operator,
          "Reconhecimento em lote",
          overrideTimestamp,
        );
        if (evt) events.push(evt);
      }
    }

    return events;
  }

  /**
   * Suppresses an alarm definition for an authorized maintenance duration.
   */
  public suppressAlarm(
    definitionId: string,
    reason: string,
    durationMs?: number,
    operator?: string,
    overrideTimestamp?: number,
  ): void {
    const now = overrideTimestamp ?? this.timeProvider();
    const def = this.definitions.get(definitionId);
    if (!def) return;

    def.suppressedUntil = durationMs ? now + durationMs : Number.MAX_SAFE_INTEGER;
    def.suppressionReason = reason;

    // If there is an active instance, transition condition to SUPPRESSED
    const instance = this.activeInstances.get(definitionId);
    if (instance) {
      instance.processCondition = "SUPPRESSED";
    }
  }

  /**
   * Unsuppresses an alarm definition.
   */
  public unsuppressAlarm(
    definitionId: string,
    operator?: string,
    overrideTimestamp?: number,
  ): void {
    const def = this.definitions.get(definitionId);
    if (!def) return;

    def.suppressedUntil = null;
    def.suppressionReason = undefined;

    const instance = this.activeInstances.get(definitionId);
    if (instance && instance.processCondition === "SUPPRESSED") {
      instance.processCondition = "ACTIVE";
    }
  }

  public clear(): void {
    this.definitions.clear();
    this.activeInstances.clear();
    this.alarmHistory = [];
    this.pendingEvals.clear();
  }
}
