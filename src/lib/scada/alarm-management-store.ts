/**
 * Estado da gestão de alarmes ISA-18.2 na tela (não persistido no navegador:
 * a fonte é o banco). Na demonstração as mudanças ficam só nesta aba.
 */
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import {
  emptySetting,
  partitionAlarms,
  type AlarmPartition,
  type AlarmPointSetting,
} from "./alarm-management";
import type { ScadaAlarmItem } from "./types";
import { useScadaStore } from "./scada-store";

interface AlarmMgmtState {
  projectId: string | null;
  /** false = tabela ainda não existe no banco (migration pendente). */
  available: boolean;
  role: string | null;
  settings: Map<string, AlarmPointSetting>;
  load: (params: {
    projectId: string;
    available: boolean;
    role: string | null;
    settings: AlarmPointSetting[];
  }) => void;
  upsert: (s: AlarmPointSetting) => void;
  reset: () => void;
}

export const useAlarmMgmtStore = create<AlarmMgmtState>((set) => ({
  projectId: null,
  available: true,
  role: null,
  settings: new Map(),
  load: ({ projectId, available, role, settings }) =>
    set({ projectId, available, role, settings: new Map(settings.map((s) => [s.pointKey, s])) }),
  upsert: (s) =>
    set((st) => {
      const next = new Map(st.settings);
      next.set(s.pointKey, s);
      return { settings: next };
    }),
  reset: () => set({ projectId: null, available: true, role: null, settings: new Map() }),
}));

/** Aplica localmente (demonstração) a mesma mudança que o servidor faria. */
export function applyLocalChange(
  current: AlarmPointSetting | undefined,
  pointKey: string,
  tagName: string,
  change:
    | { kind: "shelve"; minutes: number; reason: string }
    | { kind: "unshelve" }
    | { kind: "outOfService"; reason: string }
    | { kind: "returnToService" }
    | {
        kind: "rationalize";
        cause: string;
        consequence: string;
        correctiveAction: string;
        responseTimeMin: number | null;
      },
  now: number,
): AlarmPointSetting {
  const s = { ...(current ?? emptySetting(pointKey, tagName)) };
  switch (change.kind) {
    case "shelve":
      return {
        ...s,
        shelvedUntil: now + change.minutes * 60_000,
        shelvedAt: now,
        shelveReason: change.reason,
      };
    case "unshelve":
      return { ...s, shelvedUntil: null, shelvedAt: null, shelveReason: null };
    case "outOfService":
      return { ...s, outOfService: true, oosAt: now, oosReason: change.reason };
    case "returnToService":
      return { ...s, outOfService: false, oosAt: null, oosReason: null };
    case "rationalize":
      return {
        ...s,
        cause: change.cause,
        consequence: change.consequence,
        correctiveAction: change.correctiveAction,
        responseTimeMin: change.responseTimeMin,
        rationalizedAt: now,
      };
  }
}

/** Relógio de baixa frequência: a prateleira vence sozinha. */
export function useMinuteClock(stepMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}

/** Alarmes separados em visíveis / prateleira / fora de serviço. */
export function useAlarmPartition(): AlarmPartition & { now: number } {
  const alarms = useScadaStore((s) => s.alarms);
  const settings = useAlarmMgmtStore((s) => s.settings);
  const now = useMinuteClock();
  return useMemo(
    () => ({ ...partitionAlarms(alarms, settings, now), now }),
    [alarms, settings, now],
  );
}

export function useVisibleAlarms(): ScadaAlarmItem[] {
  return useAlarmPartition().visible;
}
