import { useEffect } from "react";
import { useVoltaiStore } from "./store";

/**
 * Loop de simulação baseado em requestAnimationFrame com acumulador.
 *
 * - Pausa automaticamente quando a aba está em background (rAF é throttled
 *   pelo browser), evitando drift e queima de CPU.
 * - O passo padrão sobe para 100ms (10Hz) — suficiente para visual e metade
 *   do custo do antigo setInterval 50ms.
 */
export function useVoltaiSimulation(enabled = true, stepMs = 100) {
  const simulateStep = useVoltaiStore((store) => store.simulateStep);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const tick = (now: number) => {
      acc += now - last;
      last = now;
      // Limite de catch-up para evitar loop longo após a aba voltar do background.
      if (acc > stepMs * 5) acc = stepMs;
      while (acc >= stepMs) {
        simulateStep(stepMs);
        acc -= stepMs;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, stepMs, simulateStep]);
}
