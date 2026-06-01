// Shared alarm store — bridges ScadaEngine with the Alarms canvas.
// Both scada-canvas and alarms-canvas read from this store.
import { create } from "zustand";

export type AlarmSev = "critical" | "high" | "medium" | "low" | "info";
export type AlarmCat = "process" | "equipment" | "safety" | "communication";

export interface LiveAlarm {
  id: string;
  tagName: string;
  priority: AlarmSev;
  message: string;
  triggeredAt: number;
  acknowledgedAt: number | null;
  isActive: boolean;
  state: "unacknowledged" | "acknowledged" | "cleared";
  category: AlarmCat;
}

interface AlarmStore {
  alarms: LiveAlarm[];
  totalToday: number;
  unackedCount: number;
  onNewAlarm: ((alarm: LiveAlarm) => void) | null;

  setAlarms: (alarms: LiveAlarm[]) => void;
  addAlarm: (alarm: LiveAlarm) => void;
  acknowledgeTag: (tagName: string) => void;
  acknowledgeAll: () => void;
  clearAlarm: (tagName: string) => void;
  reset: () => void;
  registerNewAlarmCallback: (cb: ((alarm: LiveAlarm) => void) | null) => void;
}

export const useAlarmStore = create<AlarmStore>((set, get) => ({
  alarms: [],
  totalToday: 0,
  unackedCount: 0,
  onNewAlarm: null,

  setAlarms: (alarms) =>
    set({
      alarms,
      totalToday: alarms.length,
      unackedCount: alarms.filter((a) => a.state === "unacknowledged").length,
    }),

  addAlarm: (alarm) =>
    set((s) => {
      const exists = s.alarms.some((a) => a.tagName === alarm.tagName && a.isActive);
      if (exists) {
        return {
          alarms: s.alarms.map((a) =>
            a.tagName === alarm.tagName && a.isActive ? { ...a, ...alarm } : a,
          ),
          unackedCount: s.alarms.filter((a) => a.state === "unacknowledged").length,
        };
      }
      const cb = s.onNewAlarm;
      if (cb) cb(alarm);
      return {
        alarms: [...s.alarms, alarm],
        totalToday: s.totalToday + 1,
        unackedCount: s.unackedCount + 1,
      };
    }),

  acknowledgeTag: (tagName) =>
    set((s) => ({
      alarms: s.alarms.map((a) =>
        a.tagName === tagName && a.state === "unacknowledged"
          ? { ...a, state: "acknowledged" as const, acknowledgedAt: Date.now() }
          : a,
      ),
      unackedCount: Math.max(0, s.unackedCount - 1),
    })),

  acknowledgeAll: () =>
    set((s) => ({
      alarms: s.alarms.map((a) =>
        a.state === "unacknowledged"
          ? { ...a, state: "acknowledged" as const, acknowledgedAt: Date.now() }
          : a,
      ),
      unackedCount: 0,
    })),

  clearAlarm: (tagName) =>
    set((s) => ({
      alarms: s.alarms.map((a) =>
        a.tagName === tagName ? { ...a, isActive: false, state: "cleared" as const } : a,
      ),
      unackedCount: s.alarms.filter((a) => a.state === "unacknowledged" && a.tagName !== tagName)
        .length,
    })),

  reset: () => set({ alarms: [], totalToday: 0, unackedCount: 0 }),

  registerNewAlarmCallback: (cb) => set({ onNewAlarm: cb }),
}));
