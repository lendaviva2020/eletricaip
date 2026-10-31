// Ephemeral Simulation Runtime Store (60 Hz / 100 ms ticks)
// Strictly decoupled from UnifiedProjectDoc and design persistence.
// Mutations here NEVER mark the project as `dirty` and NEVER trigger Supabase autosaves.
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { FbdSimSnapshot } from "@/lib/editor/store";

export type RuntimeTagValue = boolean | number | string;

export interface RungRuntimeState {
  rungId: string;
  poweredOut: boolean;
  /** Keyed by `${rowIndex}:${colIndex}` */
  cellEnergized: Record<string, boolean>;
}

export interface TelemetryPoint {
  ts: number;
  value: number;
}

export interface RuntimeFramePayload {
  ts?: number;
  cycleMs?: number;
  /** Keyed by canonical tagId */
  tagValuesById?: Record<string, RuntimeTagValue>;
  /** Keyed by tag symbolic name (mirror for legacy consumers) */
  tagValuesByName?: Record<string, RuntimeTagValue>;
  /** Keyed by canonical equipmentId */
  energizedEquipments?: Record<string, boolean>;
  /** Keyed by rungId */
  ladderScan?: Record<string, RungRuntimeState>;
  fbdSim?: FbdSimSnapshot | null;
}

export interface RuntimeStoreState {
  running: boolean;
  scanCycleCount: number;
  lastTickTs: number | null;
  cycleMs: number;
  /** Canonical runtime values keyed by `CanonicalTag.id` */
  tagValuesById: Record<string, RuntimeTagValue>;
  /** Mirror keyed by `CanonicalTag.name` for backward compatibility */
  tagValuesByName: Record<string, RuntimeTagValue>;
  /** Forced tags keyed by `CanonicalTag.id` */
  forcedTagIds: Record<string, boolean>;
  /** Equipment energization keyed by `CanonicalEquipment.id` */
  energizedEquipments: Record<string, boolean>;
  /** Live Ladder rung/cell energization keyed by `LadderRung.id` */
  ladderScan: Record<string, RungRuntimeState>;
  /** Live FBD simulation snapshot */
  fbdSim: FbdSimSnapshot | null;
  /** Ring buffers of numeric telemetry keyed by `CanonicalTag.id` */
  telemetryByTagId: Record<string, TelemetryPoint[]>;

  // Actions (all ephemeral — zero persistence side effects)
  setRunning: (running: boolean) => void;
  setTagRuntimeValue: (
    tagId: string,
    value: RuntimeTagValue,
    tagName?: string,
    opts?: { bypassForce?: boolean },
  ) => void;
  forceTagRuntimeValue: (tagId: string, value: RuntimeTagValue, tagName?: string) => void;
  releaseForcedTag: (tagId: string) => void;
  setEquipmentEnergized: (equipmentId: string, energized: boolean) => void;
  setLadderScanState: (scan: Record<string, RungRuntimeState>) => void;
  setFbdRuntimeSim: (snap: FbdSimSnapshot | null) => void;
  applyRuntimeFrame: (frame: RuntimeFramePayload) => void;
  seedFromCanonicalTags: (
    tags: Array<{ id: string; name: string; initialValue: RuntimeTagValue; forced?: boolean }>,
  ) => void;
  resetRuntime: () => void;
}

const MAX_TELEMETRY_POINTS = 120;

export const useRuntimeStore = create<RuntimeStoreState>()(
  subscribeWithSelector((set) => ({
    running: false,
    scanCycleCount: 0,
    lastTickTs: null,
    cycleMs: 100,
    tagValuesById: {},
    tagValuesByName: {},
    forcedTagIds: {},
    energizedEquipments: {},
    ladderScan: {},
    fbdSim: null,
    telemetryByTagId: {},

    setRunning: (running) => set({ running }),

    setTagRuntimeValue: (tagId, value, tagName, opts) =>
      set((s) => {
        if (!opts?.bypassForce && s.forcedTagIds[tagId]) {
          return s;
        }
        const nextById = { ...s.tagValuesById, [tagId]: value };
        const nextByName = tagName ? { ...s.tagValuesByName, [tagName]: value } : s.tagValuesByName;
        let nextTelemetry = s.telemetryByTagId;
        if (typeof value === "number") {
          const prev = s.telemetryByTagId[tagId] ?? [];
          nextTelemetry = {
            ...s.telemetryByTagId,
            [tagId]: [...prev, { ts: Date.now(), value }].slice(-MAX_TELEMETRY_POINTS),
          };
        }
        return {
          tagValuesById: nextById,
          tagValuesByName: nextByName,
          telemetryByTagId: nextTelemetry,
        };
      }),

    forceTagRuntimeValue: (tagId, value, tagName) =>
      set((s) => ({
        forcedTagIds: { ...s.forcedTagIds, [tagId]: true },
        tagValuesById: { ...s.tagValuesById, [tagId]: value },
        tagValuesByName: tagName ? { ...s.tagValuesByName, [tagName]: value } : s.tagValuesByName,
      })),

    releaseForcedTag: (tagId) =>
      set((s) => {
        const nextForced = { ...s.forcedTagIds };
        delete nextForced[tagId];
        return { forcedTagIds: nextForced };
      }),

    setEquipmentEnergized: (equipmentId, energized) =>
      set((s) => ({
        energizedEquipments: { ...s.energizedEquipments, [equipmentId]: energized },
      })),

    setLadderScanState: (ladderScan) =>
      set((s) => ({
        ladderScan,
        scanCycleCount: s.scanCycleCount + 1,
        lastTickTs: Date.now(),
      })),

    setFbdRuntimeSim: (fbdSim) =>
      set((s) => ({
        fbdSim,
        scanCycleCount: s.scanCycleCount + 1,
        lastTickTs: Date.now(),
      })),

    applyRuntimeFrame: (frame) =>
      set((s) => {
        const now = frame.ts ?? Date.now();
        const nextById = { ...s.tagValuesById };
        const nextTelemetry = { ...s.telemetryByTagId };

        if (frame.tagValuesById) {
          for (const [tid, val] of Object.entries(frame.tagValuesById)) {
            if (s.forcedTagIds[tid]) continue;
            nextById[tid] = val;
            if (typeof val === "number") {
              const prev = nextTelemetry[tid] ?? [];
              nextTelemetry[tid] = [...prev, { ts: now, value: val }].slice(-MAX_TELEMETRY_POINTS);
            }
          }
        }

        const nextByName = frame.tagValuesByName
          ? { ...s.tagValuesByName, ...frame.tagValuesByName }
          : s.tagValuesByName;

        const nextEnergized = frame.energizedEquipments
          ? { ...s.energizedEquipments, ...frame.energizedEquipments }
          : s.energizedEquipments;

        return {
          lastTickTs: now,
          cycleMs: frame.cycleMs ?? s.cycleMs,
          scanCycleCount: s.scanCycleCount + 1,
          tagValuesById: nextById,
          tagValuesByName: nextByName,
          energizedEquipments: nextEnergized,
          ladderScan: frame.ladderScan ?? s.ladderScan,
          fbdSim: frame.fbdSim !== undefined ? frame.fbdSim : s.fbdSim,
          telemetryByTagId: nextTelemetry,
        };
      }),

    seedFromCanonicalTags: (tags) =>
      set(() => {
        const tagValuesById: Record<string, RuntimeTagValue> = {};
        const tagValuesByName: Record<string, RuntimeTagValue> = {};
        const forcedTagIds: Record<string, boolean> = {};
        for (const t of tags) {
          tagValuesById[t.id] = t.initialValue;
          tagValuesByName[t.name] = t.initialValue;
          if (t.forced) forcedTagIds[t.id] = true;
        }
        return { tagValuesById, tagValuesByName, forcedTagIds };
      }),

    resetRuntime: () =>
      set({
        running: false,
        scanCycleCount: 0,
        lastTickTs: null,
        tagValuesById: {},
        tagValuesByName: {},
        forcedTagIds: {},
        energizedEquipments: {},
        ladderScan: {},
        fbdSim: null,
        telemetryByTagId: {},
      }),
  })),
);
