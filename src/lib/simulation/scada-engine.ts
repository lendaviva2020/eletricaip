// ISA-18.2 Alarm Management System
export type AlarmPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type AlarmState = "normal" | "unacknowledged" | "acknowledged" | "cleared";

export interface Alarm {
  id: string;
  tagName: string;
  priority: AlarmPriority;
  message: string;
  triggeredAt: number | null;
  acknowledgedAt: number | null;
  clearedAt: number | null;
  isActive: boolean;
  state: AlarmState;
}

export interface AlarmRule {
  tagName: string;
  priority: AlarmPriority;
  message: string;
  condition: (value: number | boolean | string) => boolean;
}

export class ScadaEngine {
  private alarms: Map<string, Alarm> = new Map();
  private rules: AlarmRule[] = [];
  private onChange: ((alarms: Alarm[]) => void) | null = null;

  constructor(rules?: AlarmRule[]) {
    if (rules) this.setRules(rules);
  }

  setRules(rules: AlarmRule[]) {
    this.rules = rules;
  }

  onAlarmsChange(cb: (alarms: Alarm[]) => void) {
    this.onChange = cb;
  }

  evaluate(tags: Record<string, { value: number | boolean | string }>) {
    let changed = false;

    for (const rule of this.rules) {
      const tag = tags[rule.tagName];
      if (!tag) continue;

      const triggered = rule.condition(tag.value);
      const existing = this.alarms.get(rule.tagName);

      if (triggered && !existing?.isActive) {
        this.alarms.set(rule.tagName, {
          id: `alarm-${rule.tagName}-${Date.now()}`,
          tagName: rule.tagName,
          priority: rule.priority,
          message: rule.message,
          triggeredAt: Date.now(),
          acknowledgedAt: null,
          clearedAt: null,
          isActive: true,
          state: "unacknowledged",
        });
        changed = true;
      } else if (!triggered && existing?.isActive) {
        existing.isActive = false;
        existing.clearedAt = Date.now();
        existing.state = "cleared";
        changed = true;
      }
    }

    if (changed && this.onChange) {
      this.onChange(this.getActiveAlarms());
    }
  }

  acknowledge(tagName: string) {
    const alarm = this.alarms.get(tagName);
    if (alarm?.isActive) {
      alarm.acknowledgedAt = Date.now();
      alarm.state = "acknowledged";
      if (this.onChange) this.onChange(this.getActiveAlarms());
    }
  }

  acknowledgeAll() {
    for (const alarm of this.alarms.values()) {
      if (alarm.isActive && alarm.state === "unacknowledged") {
        alarm.acknowledgedAt = Date.now();
        alarm.state = "acknowledged";
      }
    }
    if (this.onChange) this.onChange(this.getActiveAlarms());
  }

  getActiveAlarms(): Alarm[] {
    return Array.from(this.alarms.values())
      .filter((a) => a.isActive)
      .sort((a, b) => {
        const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        return order[a.priority] - order[b.priority];
      });
  }

  getAllAlarms(): Alarm[] {
    return Array.from(this.alarms.values()).sort(
      (a, b) => (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0),
    );
  }

  reset() {
    this.alarms.clear();
  }
}
