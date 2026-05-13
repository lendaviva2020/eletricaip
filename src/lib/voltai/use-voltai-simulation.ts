import { useEffect } from "react";
import { useVoltaiStore } from "./store";

export function useVoltaiSimulation(enabled = true) {
  const simulateStep = useVoltaiStore((store) => store.simulateStep);

  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => simulateStep(50), 50);
    return () => window.clearInterval(interval);
  }, [enabled, simulateStep]);
}
