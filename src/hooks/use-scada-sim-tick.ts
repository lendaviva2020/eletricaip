/**
 * Driver do ciclo de simulação do SCADA (1 s), montado uma vez no layout.
 *
 * Antes o `setInterval` vivia dentro do `ScadaHeader`: se o cabeçalho saísse
 * da árvore (ou re-renderizasse), o ciclo parava/reiniciava junto. Aqui o
 * ciclo fica desacoplado da UI e não assina o store (usa `getState`), então
 * não provoca re-render de componente algum.
 */
import { useEffect } from "react";
import { useScadaStore } from "@/lib/scada/scada-store";
import { isDocumentHidden } from "@/lib/utils/visibility";

export function useScadaSimTick(): void {
  useEffect(() => {
    const id = setInterval(() => {
      if (isDocumentHidden()) return; // não simular com a aba oculta
      useScadaStore.getState().tickSimulation();
    }, 1000);
    return () => clearInterval(id);
  }, []);
}

/** Componente invisível que roda o ciclo: montado onde a tela supervisória aparece. */
export function ScadaSimTickDriver(): null {
  useScadaSimTick();
  return null;
}
