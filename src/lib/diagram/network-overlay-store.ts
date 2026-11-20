// Preferência de exibição: resultados do cálculo de rede desenhados no canvas.
// Conveniência por navegador (não é dado do projeto): localStorage protegido.
import { create } from "zustand";

const KEY = "eletricai.networkOverlay";

function read(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const useNetworkOverlay = create<{ visible: boolean; setVisible: (v: boolean) => void }>(
  (set) => ({
    visible: read(),
    setVisible: (visible) => {
      try {
        window.localStorage.setItem(KEY, visible ? "1" : "0");
      } catch {
        // armazenamento bloqueado: vale só nesta sessão
      }
      set({ visible });
    },
  }),
);
