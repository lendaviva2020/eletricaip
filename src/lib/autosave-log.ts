// Log em memória dos eventos de autosave/carregamento do projeto.
// Usado pelo painel /settings/autosave para diagnosticar falhas de persistência.
import { create } from "zustand";

export type AutosaveEventKind =
  | "load:start"
  | "load:success"
  | "load:error"
  | "schedule"
  | "save:start"
  | "save:success"
  | "save:error"
  | "skip:no-project";

export interface AutosaveEvent {
  ts: number;
  kind: AutosaveEventKind;
  projectId: string | null;
  message: string;
  /** Contadores opcionais (nodes/edges/diagram) para inspeção rápida. */
  meta?: Record<string, number | string | boolean>;
}

interface AutosaveLogState {
  events: AutosaveEvent[];
  lastSavedAt: number | null;
  lastSaveError: string | null;
  lastLoadedAt: number | null;
  saveInFlight: boolean;
  log: (ev: Omit<AutosaveEvent, "ts">) => void;
  clear: () => void;
}

const MAX_EVENTS = 100;

export const useAutosaveLog = create<AutosaveLogState>((set) => ({
  events: [],
  lastSavedAt: null,
  lastSaveError: null,
  lastLoadedAt: null,
  saveInFlight: false,
  log: (ev) =>
    set((s) => {
      const full: AutosaveEvent = { ts: Date.now(), ...ev };
      const patch: Partial<AutosaveLogState> = {
        events: [full, ...s.events].slice(0, MAX_EVENTS),
      };
      if (ev.kind === "save:start") patch.saveInFlight = true;
      if (ev.kind === "save:success") {
        patch.saveInFlight = false;
        patch.lastSavedAt = full.ts;
        patch.lastSaveError = null;
      }
      if (ev.kind === "save:error") {
        patch.saveInFlight = false;
        patch.lastSaveError = ev.message;
      }
      if (ev.kind === "load:success") patch.lastLoadedAt = full.ts;
      return patch as AutosaveLogState;
    }),
  clear: () =>
    set({
      events: [],
      lastSavedAt: null,
      lastSaveError: null,
      lastLoadedAt: null,
      saveInFlight: false,
    }),
}));
