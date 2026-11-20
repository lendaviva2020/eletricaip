// Preferência local: o Ladder acompanha o unifilar automaticamente (padrão: sim).
// Por navegador — cada engenheiro escolhe se quer as redes geradas.
import { create } from "zustand";

const KEY = "eletricai.ladder.unifilarSync";

function read(): boolean {
  try {
    return typeof window === "undefined" ? true : window.localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

interface State {
  enabled: boolean;
  /** Avisos da última geração (ex.: sem botão de emergência, sem contator). */
  warnings: string[];
  setEnabled: (v: boolean) => void;
  setWarnings: (w: string[]) => void;
}

export const useLadderUnifilarSync = create<State>((set) => ({
  enabled: read(),
  warnings: [],
  setEnabled: (enabled) => {
    try {
      window.localStorage.setItem(KEY, enabled ? "1" : "0");
    } catch {
      /* armazenamento indisponível: vale só nesta sessão */
    }
    set({ enabled });
  },
  setWarnings: (warnings) =>
    set((s) => (s.warnings.join("\n") === warnings.join("\n") ? s : { warnings })),
}));
